"""
Offline bank-transfer payment submissions — Nhaav's only payment path.

There is no payment gateway, no UPI integration, no card processing: the
organization transfers money externally and submits proof here for admin review.

Flow:
    GET  /payments/instructions   -> configured bank details (never hardcoded)
    POST /payments/submit         -> creates a PENDING subscription + SUBMITTED payment
    admin review                  -> APPROVE (VERIFIED) or REJECT (with reason)
    APPROVE                       -> activates the subscription in ONE transaction

Security invariants enforced here (not in the client):

  * The amount and the pass count are ALWAYS derived server-side from the plan.
    A client-supplied amount is only ever used to REJECT a mismatched claim and
    is never stored or trusted.
  * A UTR/reference is a claim, never proof. Only an admin decision activates
    anything, and the same reference cannot be submitted repeatedly while an
    earlier submission is still live.
  * Receipts are private: validated (extension, content type, size, path), stored
    outside any static mount under a server-generated name, and served only to
    the owning organization's members or an admin.
  * Approval is TRANSACTIONAL and IDEMPOTENT: payment state, subscription
    activation, pack/pass creation and the gate flip commit together or not at
    all, and approving an already-VERIFIED payment creates no second pack and
    does not extend the subscription twice.
"""
import os
import uuid
from datetime import datetime

from fastapi import HTTPException, UploadFile, status as http_status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.access_token import AccessPack, Organization
from app.models.notification import NotificationType
from app.models.payment import Payment, PaymentStatus
from app.models.payment_audit import PaymentAuditLog
from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionStatus
from app.models.user import User, UserRole
from app.services.notification_service import NotificationService
from app.services.subscription_service import SubscriptionService, plan_pricing
from app.utils.file_signatures import validate_upload_bytes

_LIVE_PAYMENT_STATUSES = (
    PaymentStatus.PENDING,
    PaymentStatus.SUBMITTED,
    PaymentStatus.VERIFIED,
)

_ACTIVATED_TITLE = "Your Nhaav subscription has been activated."
_REJECTED_TITLE = "Your Nhaav payment was rejected."


def money_breakdown(payment) -> dict:
    """Base / GST / rate for a stored payment, all in integer paise.

    The stored `amount_paise` is authoritative (it is what was charged), and the
    taxable value comes from the plan the payment was made against, so the split
    stays exact even if the GST rate is changed later.
    """
    total = int(payment.amount_paise)
    base = int(payment.plan.price_paise) if payment.plan is not None else total
    return {
        "base_paise": base,
        "gst_paise": max(0, total - base),
        "gst_rate_percent": int(getattr(settings, "GST_RATE_PERCENT", 18)),
    }


class PaymentService:
    # ------------------------------------------------------------- guards
    @staticmethod
    def _require_admin(user: User) -> User:
        if user.role != UserRole.admin:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin access required"
            )
        return user

    @staticmethod
    def _resolve_organization(db: Session, user: User) -> Organization | None:
        """Same stable-FK membership rule used by the entitlement layers."""
        from app.services.access_token_service import AccessTokenService

        return AccessTokenService._resolve_organization(db, user)

    @staticmethod
    def _plan_change_note(db: Session, owner: User, plan) -> str | None:
        """
        Detect that this purchase CHANGES the account's current plan.

        Plan changes are NOT automatic: they are approved by an admin through the
        normal bank-transfer review, which is why this only produces a note for
        the review queue. Nothing is cancelled, merged, prorated or extended —
        the existing subscription and its passes are preserved untouched.
        """
        current = SubscriptionService.get_effective_subscription(db, owner, datetime.utcnow())
        if current is None or current.plan is None:
            return None
        if current.plan.code == plan.code:
            return None
        return (
            f"plan_change: {current.plan.code} -> {plan.code} "
            "(requires admin approval; existing subscription preserved)"
        )

    # ------------------------------------------------- bank transfer details
    @staticmethod
    def get_instructions() -> dict:
        """
        Configured bank-transfer details. Everything comes from backend
        configuration (environment) — no bank information is hardcoded in the
        backend or the frontend. `configured` is False until an operator
        supplies the mandatory fields, and the UI must not present an
        unconfigured account as payable.
        """
        holder = settings.PAYMENT_BANK_ACCOUNT_HOLDER.strip()
        bank = settings.PAYMENT_BANK_NAME.strip()
        account_number = settings.PAYMENT_BANK_ACCOUNT_NUMBER.strip()
        ifsc = settings.PAYMENT_BANK_IFSC.strip()
        configured = all([holder, bank, account_number, ifsc])
        return {
            "configured": configured,
            "account_holder": holder or None,
            "bank_name": bank or None,
            "account_number": account_number or None,
            "ifsc": ifsc or None,
            "branch": settings.PAYMENT_BANK_BRANCH.strip() or None,
            "account_type": settings.PAYMENT_BANK_ACCOUNT_TYPE.strip() or None,
            "instructions": settings.PAYMENT_INSTRUCTIONS.strip() or None,
            "currency": settings.PAYMENT_CURRENCY or "INR",
        }

    # ------------------------------------------------------ receipt handling
    @staticmethod
    def _allowed_extensions() -> set[str]:
        return {
            item.strip().lower().lstrip(".")
            for item in settings.PAYMENT_RECEIPT_ALLOWED_EXTENSIONS.split(",")
            if item.strip()
        }

    @staticmethod
    def _allowed_content_types() -> set[str]:
        return {
            item.strip().lower()
            for item in settings.PAYMENT_RECEIPT_ALLOWED_CONTENT_TYPES.split(",")
            if item.strip()
        }

    @staticmethod
    def _safe_display_name(raw: str | None) -> str:
        """
        Path safety: strip any directory component an attacker may have
        supplied ("../../etc/passwd", "C:\\temp\\x.pdf") and keep only a short
        display label. The value is NEVER used as the on-disk name.
        """
        candidate = (raw or "").replace("\\", "/")
        candidate = os.path.basename(candidate).strip()
        candidate = candidate.strip(".") or "receipt"
        return candidate[:120]

    @staticmethod
    def _validate_receipt(file: UploadFile) -> tuple[str, str, bytes]:
        """
        Validate the uploaded receipt: extension, declared content type, size.
        Returns (extension, content_type, content). Raises 400 on any violation.
        """
        display = PaymentService._safe_display_name(getattr(file, "filename", None))
        extension = os.path.splitext(display)[1].lower().lstrip(".")

        if not extension or extension not in PaymentService._allowed_extensions():
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Unsupported receipt file type. Allowed extensions: "
                    + ", ".join(sorted(PaymentService._allowed_extensions()))
                    + "."
                ),
            )

        content_type = (getattr(file, "content_type", None) or "").split(";")[0].strip().lower()
        if content_type not in PaymentService._allowed_content_types():
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Unsupported receipt content type. Allowed types: "
                    + ", ".join(sorted(PaymentService._allowed_content_types()))
                    + "."
                ),
            )

        content = file.file.read()
        if not content:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST, detail="The receipt file is empty."
            )
        if len(content) > settings.PAYMENT_RECEIPT_MAX_BYTES:
            limit_mb = settings.PAYMENT_RECEIPT_MAX_BYTES / (1024 * 1024)
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"The receipt file exceeds the {limit_mb:g} MB limit.",
            )
        signature_ok, signature_error = validate_upload_bytes(content, extension)
        if not signature_ok:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=signature_error,
            )
        return extension, content_type, content

    # ------------------------------------------------------------ submission
    @staticmethod
    def submit_payment(
        db: Session,
        user: User,
        plan_code: str,
        utr: str,
        payment_date: datetime,
        file: UploadFile,
        notes: str | None = None,
        claimed_amount: int | None = None,
    ) -> Payment:
        """
        Record a bank-transfer submission for the caller's organization.

        The amount is taken from the PLAN (`plan.price_paise`) — never from the
        request. `claimed_amount` exists only so a mismatched claim can be
        refused explicitly; it is never stored.
        """
        # The ACCOUNT is the owner. A company is optional business metadata only:
        # another account (even inside the same company) can never see or use
        # this payment or its passes.
        organization = PaymentService._resolve_organization(db, user)

        plan = SubscriptionService.get_plan(db, plan_code)  # 404 for unknown codes
        if not plan.active:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"The {plan.code} plan is not currently available.",
            )

        reference = (utr or "").strip().upper()
        if len(reference) < 6:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="A valid UTR / transaction reference (at least 6 characters) is required.",
            )

        # Amount actually payable = plan price + GST (₹1,000 -> ₹1,180,
        # ₹10,000 -> ₹11,800). Derived on the server so a tax change can never be
        # smuggled in from the client.
        pricing = plan_pricing(plan)
        payable_paise = pricing["total_paise"]

        # The client's claimed amount, if supplied, must match that total. A
        # ₹1,000 claim against the ₹10,000 plan (or a pre-GST figure) is refused
        # outright and nothing is recorded.
        if claimed_amount is not None and int(claimed_amount) != int(payable_paise):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"The submitted amount does not match the {plan.code} plan total "
                    f"({payable_paise} paise = {pricing['price_paise']} + "
                    f"{pricing['gst_rate_percent']}% GST). The amount is set by "
                    "Nhaav and cannot be changed."
                ),
            )

        # Duplicate protection: the same reference cannot be re-submitted while
        # an earlier payment with it is still live. (A reference is a claim, so
        # a rejected one may legitimately be corrected and re-submitted.)
        duplicate = (
            db.query(Payment)
            .filter(
                Payment.utr == reference,
                Payment.status.in_(list(_LIVE_PAYMENT_STATUSES)),
            )
            .first()
        )
        if duplicate is not None:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=(
                    "This UTR / transaction reference has already been submitted and is "
                    "awaiting review or already processed."
                ),
            )

        extension, content_type, content = PaymentService._validate_receipt(file)

        receipts_dir = settings.PAYMENT_RECEIPTS_DIR
        os.makedirs(receipts_dir, exist_ok=True)
        stored_name = f"{uuid.uuid4()}.{extension}"
        stored_path = os.path.join(receipts_dir, stored_name)

        display_name = PaymentService._safe_display_name(getattr(file, "filename", None))
        now = datetime.utcnow()

        # One bank reference funds one Nhaav purchase, across every paid surface
        # (pass packs, listing fees, company visibility). Reserved inside this
        # transaction, so a failed submission leaves no credit behind and the 409
        # names whichever surface already holds the reference.
        from app.models.bank_credit import BankCreditClaimType
        from app.services.bank_credit_service import BankCreditService

        credit = BankCreditService.claim(
            db,
            utr=reference,
            claim_type=BankCreditClaimType.payment,
            owner_user_id=user.id,
            amount_paise=payable_paise,
            currency=plan.currency,
            receipt_path=stored_path,
            receipt_filename=display_name,
        )

        try:
            with open(stored_path, "wb") as buffer:
                buffer.write(content)

            # The subscription starts PENDING: submitting a payment must never
            # grant access. Activation happens only on VERIFIED. Created inside
            # this transaction so a failure leaves neither payment nor
            # subscription behind.
            subscription = SubscriptionService.create_subscription(
                db, user, plan.code, commit=False
            )

            payment = Payment(
                owner_user_id=user.id,
                organization_id=organization.id if organization is not None else None,
                subscription_id=subscription.id,
                plan_id=plan.id,
                submitted_by=user.id,
                bank_credit_id=credit.id,
                amount_paise=payable_paise,      # server-derived: base + GST, in paise
                currency=plan.currency,
                utr=reference,
                payment_date=payment_date,
                receipt_path=stored_path,
                receipt_filename=display_name,
                receipt_content_type=content_type,
                receipt_size_bytes=len(content),
                notes=(notes or "").strip() or None,
                status=PaymentStatus.SUBMITTED,
                submitted_at=now,
            )
            db.add(payment)
            db.flush()
            BankCreditService.attach(credit, payment.id)

            change_note = PaymentService._plan_change_note(db, user, plan)
            db.add(
                PaymentAuditLog(
                    payment_id=payment.id,
                    organization_id=organization.id if organization is not None else None,
                    actor_id=user.id,
                    actor_role="account",
                    action="submitted",
                    detail=(
                        f"plan={plan.code} amount_paise={payable_paise} "
                        f"base_paise={pricing['price_paise']} gst_paise={pricing['gst_paise']} "
                        f"gst_rate={pricing['gst_rate_percent']} "
                        f"utr={reference} receipt={display_name}"
                        + (f" {change_note}" if change_note else "")
                    ),
                )
            )
            db.commit()
            db.refresh(payment)
            return payment
        except IntegrityError:
            # F-1: the unique partial index on live UTRs is the DB-level
            # backstop for the concurrent-submit race the service-level 409
            # check cannot fully close. Convert it into the SAME safe 409 the
            # sequential check returns — never leak an IntegrityError.
            db.rollback()
            try:
                if os.path.exists(stored_path):
                    os.remove(stored_path)
            except OSError:
                pass
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=(
                    "This UTR / transaction reference has already been submitted and is "
                    "awaiting review or already processed."
                ),
            )
        except Exception:
            db.rollback()
            # Never leave an orphaned receipt behind on a failed submission.
            try:
                if os.path.exists(stored_path):
                    os.remove(stored_path)
            except OSError:
                pass
            raise

    # --------------------------------------------------------------- queries
    @staticmethod
    def list_payments_for_user(db: Session, user: User) -> list[Payment]:
        """The caller's OWN payments only — never a colleague's, never another company's."""
        return (
            db.query(Payment)
            .filter(Payment.owner_user_id == user.id)
            .order_by(Payment.created_at.desc())
            .all()
        )

    @staticmethod
    def get_payment_for_user(db: Session, user: User, payment_id: uuid.UUID) -> Payment:
        """
        Fetch a payment the caller is allowed to see. A payment the caller has
        no claim to is reported as 404 so existence is not leaked across
        organizations.
        """
        payment = db.query(Payment).filter(Payment.id == payment_id).first()
        if payment is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Payment not found")
        if user.role != UserRole.admin and payment.owner_user_id != user.id:
            # Another ACCOUNT's payment — 404, so existence is not leaked.
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND, detail="Payment not found"
            )
        return payment

    @staticmethod
    def pending_payments(db: Session, admin: User) -> list[Payment]:
        PaymentService._require_admin(admin)
        return (
            db.query(Payment)
            .filter(Payment.status == PaymentStatus.SUBMITTED)
            .order_by(Payment.submitted_at.asc())
            .all()
        )

    # -------------------------------------------------------- receipt access
    @staticmethod
    def authorize_receipt(db: Session, user: User, payment_id: uuid.UUID) -> Payment:
        """
        Only an admin or a member of the paying organization may read a receipt.
        Other requesters get 404 (no cross-organization existence leak) and the
        file is never served from a public path.
        """
        payment = PaymentService.get_payment_for_user(db, user, payment_id)
        if not payment.receipt_path or not os.path.isfile(payment.receipt_path):
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND, detail="Receipt file is unavailable"
            )
        return payment

    # ------------------------------------------------------- admin decisions
    @staticmethod
    def approve_payment(db: Session, admin: User, payment_id: uuid.UUID) -> dict:
        """
        APPROVE a submitted payment.

        Everything happens in ONE transaction: payment state, subscription
        activation, pack + passes, gate flip, audit entry and notification. If
        any step fails the whole thing rolls back, so a partially activated
        subscription is impossible.

        Idempotent: approving an already-VERIFIED payment changes nothing —
        no second pack, no duplicate passes, no double extension.
        """
        PaymentService._require_admin(admin)

        payment = db.query(Payment).filter(Payment.id == payment_id).first()
        if payment is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Payment not found")

        if payment.status == PaymentStatus.VERIFIED:
            subscription = (
                db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
                if payment.subscription_id
                else None
            )
            pack = (
                db.query(AccessPack).filter(AccessPack.subscription_id == subscription.id).first()
                if subscription is not None
                else None
            )
            return PaymentService._decision_payload(
                payment, subscription, pack, already_processed=True
            )

        if payment.status != PaymentStatus.SUBMITTED:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=(
                    "Only a submitted payment can be approved "
                    f"(current status: {payment.status.value})."
                ),
            )

        subscription = (
            db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
            if payment.subscription_id
            else None
        )
        if subscription is None:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail="This payment has no subscription context and cannot be activated.",
            )

        now = datetime.utcnow()

        # MULTIPLE PACKS ARE ALLOWED. An account may hold several subscriptions
        # and packs at once: a later purchase ADDS a pack and never overwrites,
        # merges, extends or cancels an earlier one. Each pack's passes keep
        # their own plan validity windows. The only protection needed here is the
        # idempotency guard above (one pack per subscription) plus the unique
        # UTR check at submission time.
        #
        # Sweep this ACCOUNT's lapsed subscriptions first so status/expiry is
        # current before the new pack is issued.
        owner = (
            db.query(User).filter(User.id == subscription.owner_user_id).first()
            if subscription.owner_user_id
            else None
        )
        if owner is not None:
            SubscriptionService.expire_due_subscriptions(db, owner, now)

        try:
            pack = SubscriptionService.activate_subscription(
                db, subscription, source="payment", now=now, commit=False
            )
            # Plan-change audit: recorded on approval so the change is
            # traceable, and surfaced to the admin queue before the decision.
            plan_change = None
            if owner is not None and payment.plan is not None:
                for row in (
                    db.query(Subscription)
                    .filter(
                        Subscription.owner_user_id == owner.id,
                        Subscription.id != subscription.id,
                        Subscription.status == SubscriptionStatus.ACTIVE,
                    )
                    .all()
                ):
                    other_plan = (
                        db.query(SubscriptionPlan)
                        .filter(SubscriptionPlan.id == row.plan_id)
                        .first()
                    )
                    if other_plan is not None and other_plan.code != payment.plan.code:
                        plan_change = f"{other_plan.code} -> {payment.plan.code}"
                        break

            payment.status = PaymentStatus.VERIFIED
            payment.verified_at = now
            payment.verified_by = admin.id

            db.add(
                PaymentAuditLog(
                    payment_id=payment.id,
                    organization_id=payment.organization_id,
                    actor_id=admin.id,
                    actor_role="admin",
                    action="approved",
                    detail=(
                        f"subscription={subscription.id} pack={pack.id} "
                        f"passes={pack.token_count} amount_paise={payment.amount_paise}"
                        + (f" plan_change={plan_change}" if plan_change else "")
                    ),
                )
            )

            if payment.submitted_by is not None:
                NotificationService.create_notification(
                    db,
                    payment.submitted_by,
                    _ACTIVATED_TITLE,
                    "Your Nhaav subscription has been activated.",
                    NotificationType.payment,
                    related_entity="payment",
                    related_entity_id=payment.id,
                    dedupe=True,
                )

            db.commit()
        except Exception:
            db.rollback()
            raise

        db.refresh(payment)
        db.refresh(subscription)
        db.refresh(pack)
        return PaymentService._decision_payload(payment, subscription, pack, already_processed=False)

    @staticmethod
    def reject_payment(
        db: Session, admin: User, payment_id: uuid.UUID, reason: str | None
    ) -> dict:
        """
        REJECT a submitted payment. A reason is mandatory and is shown to the
        organization.

        The subscription stays inactive (never activated, then cancelled) and no
        access pack or passes are created — the organization remains without
        paid access.
        """
        PaymentService._require_admin(admin)

        cleaned_reason = (reason or "").strip()
        if not cleaned_reason:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="A rejection reason is required.",
            )

        payment = db.query(Payment).filter(Payment.id == payment_id).first()
        if payment is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Payment not found")

        if payment.status != PaymentStatus.SUBMITTED:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=(
                    "Only a submitted payment can be rejected "
                    f"(current status: {payment.status.value})."
                ),
            )

        now = datetime.utcnow()
        try:
            payment.status = PaymentStatus.REJECTED
            payment.rejection_reason = cleaned_reason
            payment.verified_at = now          # review decision time
            payment.verified_by = admin.id     # review decision actor

            subscription = (
                db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
                if payment.subscription_id
                else None
            )
            if subscription is not None and subscription.status == SubscriptionStatus.PENDING:
                # It never activated: cancel it so nothing lingers as "about to activate".
                subscription.status = SubscriptionStatus.CANCELLED

            db.add(
                PaymentAuditLog(
                    payment_id=payment.id,
                    organization_id=payment.organization_id,
                    actor_id=admin.id,
                    actor_role="admin",
                    action="rejected",
                    reason=cleaned_reason,
                    detail=f"amount_paise={payment.amount_paise}",
                )
            )

            if payment.submitted_by is not None:
                NotificationService.create_notification(
                    db,
                    payment.submitted_by,
                    _REJECTED_TITLE,
                    f"Your Nhaav payment was rejected. Reason: {cleaned_reason}",
                    NotificationType.payment,
                    related_entity="payment",
                    related_entity_id=payment.id,
                    dedupe=True,
                )

            # A rejected transfer no longer holds its bank reference: the submitter
            # may correct it and claim it again, on this surface or any other.
            from app.models.bank_credit import BankCreditClaimType
            from app.services.bank_credit_service import BankCreditService

            BankCreditService.release(
                db, claim_type=BankCreditClaimType.payment, claim_id=payment.id
            )

            db.commit()
        except Exception:
            db.rollback()
            raise

        db.refresh(payment)
        return {
            "payment_id": str(payment.id),
            "status": payment.status.value,
            "rejection_reason": payment.rejection_reason,
            "subscription_status": subscription.status.value if subscription else None,
            "accesspack_created": False,
            "already_processed": False,
        }

    # -------------------------------------------------------------- payloads
    @staticmethod
    def _decision_payload(
        payment: Payment, subscription: Subscription | None, pack: AccessPack | None,
        already_processed: bool,
    ) -> dict:
        return {
            "payment_id": str(payment.id),
            "status": payment.status.value,
            "owner_user_id": str(payment.owner_user_id) if payment.owner_user_id else None,
            "rejection_reason": payment.rejection_reason,
            "subscription_id": str(subscription.id) if subscription else None,
            "subscription_status": subscription.status.value if subscription else None,
            "starts_at": subscription.starts_at if subscription else None,
            "expires_at": subscription.expires_at if subscription else None,
            "pack_id": str(pack.id) if pack else None,
            "total_passes": pack.token_count if pack else None,
            "accesspack_created": bool(pack),
            "already_processed": already_processed,
        }
