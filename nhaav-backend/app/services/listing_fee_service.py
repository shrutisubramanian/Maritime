"""
Paid marketplace placements for suppliers and service providers.

WHY THIS EXISTS
---------------
Vendors have NO usage passes and NO session time limits. What they pay for is
how long their listing is SHOWN on the marketplace, and there are two approved
choices:

    ₹1,000    -> visible for 1 month   (30 days)
    ₹10,000   -> visible for 1 year    (365 days)

The vendor states which amount it transferred; the admin confirms the period at
verification (the two choices in the admin console), and the chosen period must
be the one that amount actually bought.

Nhaav has no card/UPI gateway. Money moves by bank transfer and an admin
verifies the receipt, exactly like subscription payments. So a placement is:

    submit (plan + UTR + receipt)  ->  admin VERIFIED  ->  listed for that period

A listing is only VISIBLE in the marketplace while a paid window is running:

    status == approved  AND  expires_at is not NULL  AND  expires_at > now

Approval alone is not enough: content moderation can approve a listing, but if
no fee has been verified it stays hidden. Expiry likewise hides an approved
listing without deleting or rejecting it — the owner can pay again to renew.

MONEY: integer paise only, always derived server-side from the fee constant.
"""
import os
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import HTTPException, UploadFile, status as http_status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.listing_fee import ListingFee, ListingFeeStatus, ListingType
from app.models.notification import NotificationType
from app.models.service import Service, ServiceListingStatus
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.user import User, UserRole
from app.services.notification_service import NotificationService
from app.services.payment_service import PaymentService
from app.utils.timezone import as_utc

#: The two approved showcase plans. Integer paise, days and labels live here —
#: never in the client — so the price list has one authority.
LISTING_PLANS: dict[str, dict] = {
    # ₹1,000 -> one month on the marketplace
    "month": {
        "code": "month",
        "label": "1 month",
        "amount_paise": 100_000,
        "period_days": 30,
    },
    # ₹10,000 -> a full year on the marketplace
    "year": {
        "code": "year",
        "label": "1 year",
        "amount_paise": 1_000_000,
        "period_days": 365,
    },
}
#: The plan a submission means when it does not name one (the cheaper choice).
DEFAULT_LISTING_PLAN = "month"

#: Backwards-compatible aliases for the default (1 month) plan.
LISTING_FEE_PAISE = LISTING_PLANS[DEFAULT_LISTING_PLAN]["amount_paise"]
LISTING_PERIOD_DAYS = LISTING_PLANS[DEFAULT_LISTING_PLAN]["period_days"]

_LIVE_STATUSES = (ListingFeeStatus.PENDING, ListingFeeStatus.SUBMITTED, ListingFeeStatus.VERIFIED)


class ListingFeeService:
    """Bank-transfer verification and publication windows for listings."""

    # ------------------------------------------------------------ constants
    @staticmethod
    def amount_paise() -> int:
        return LISTING_FEE_PAISE

    @staticmethod
    def period_days() -> int:
        return LISTING_PERIOD_DAYS

    @staticmethod
    def plans() -> list[dict]:
        """The two showcase choices, cheapest first, exactly as approved."""
        return [
            {
                "code": plan["code"],
                "label": plan["label"],
                "amount_paise": plan["amount_paise"],
                "period_days": plan["period_days"],
            }
            for plan in LISTING_PLANS.values()
        ]

    @staticmethod
    def resolve_plan(code: Optional[str]) -> dict:
        """Look up one of the two plans; anything else is a 400, never a guess."""
        wanted = (code or DEFAULT_LISTING_PLAN).strip().lower()
        plan = LISTING_PLANS.get(wanted)
        if plan is None:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "unsupported_listing_plan",
                    "message": "Choose one of the two showcase plans.",
                    "options": ListingFeeService.plans(),
                },
            )
        return plan

    @staticmethod
    def plan_for_days(period_days: Optional[int]) -> Optional[dict]:
        """The plan a stored period belongs to (None when it predates them)."""
        for plan in LISTING_PLANS.values():
            if plan["period_days"] == period_days:
                return plan
        return None

    @staticmethod
    def instructions() -> dict:
        """Bank details plus the two plans, all server-side values."""
        payload = PaymentService.get_instructions()
        payload.update(
            {
                "amount_paise": LISTING_FEE_PAISE,
                "period_days": LISTING_PERIOD_DAYS,
                "plans": ListingFeeService.plans(),
            }
        )
        return payload

    # ------------------------------------------------------------ visibility
    @staticmethod
    def is_live(listing, now: Optional[datetime] = None) -> bool:
        """True when a listing may be shown in the marketplace right now.

        Single predicate shared by every public read path, so a card can never
        appear in one place and be "not found" in another.
        """
        now = now or datetime.utcnow()
        approved = getattr(listing, "status", None)
        approved_value = approved.value if hasattr(approved, "value") else approved
        if approved_value != "approved":
            return False
        expires_at = getattr(listing, "expires_at", None)
        return expires_at is not None and as_utc(expires_at) > as_utc(now)

    @staticmethod
    def _live_fee(
        db: Session,
        listing_type: ListingType,
        listing_id: uuid.UUID,
        now: Optional[datetime] = None,
    ) -> Optional[ListingFee]:
        now = now or datetime.utcnow()
        return (
            db.query(ListingFee)
            .filter(
                ListingFee.listing_type == listing_type,
                ListingFee.listing_id == listing_id,
                ListingFee.status == ListingFeeStatus.VERIFIED,
                ListingFee.expires_at.isnot(None),
                ListingFee.expires_at > now,
            )
            .order_by(ListingFee.expires_at.desc())
            .first()
        )

    @staticmethod
    def _open_fee(
        db: Session, listing_type: ListingType, listing_id: uuid.UUID
    ) -> Optional[ListingFee]:
        """A submission still awaiting an admin decision, if any."""
        return (
            db.query(ListingFee)
            .filter(
                ListingFee.listing_type == listing_type,
                ListingFee.listing_id == listing_id,
                ListingFee.status.in_([ListingFeeStatus.PENDING, ListingFeeStatus.SUBMITTED]),
            )
            .order_by(ListingFee.created_at.desc())
            .first()
        )

    @staticmethod
    def _stamp_window(listing, starts_at: datetime, expires_at: datetime) -> None:
        # Extending a running window: the placement ends at the later of the two
        # unless the caller explicitly starts a fresh one (we pass the exact
        # window bought by the fee it is applying).
        listing.published_at = listing.published_at or starts_at
        listing.expires_at = expires_at

    @staticmethod
    def publish_if_ready(
        db: Session,
        listing_type: ListingType,
        listing,
        now: Optional[datetime] = None,
    ) -> bool:
        """Stamp a paid window on an approved listing that has a verified fee.

        Called after admin moderation approves content AND right after a fee is
        verified, so either order of the two approvals ends in a live listing.
        Returns True when the listing is live afterwards.
        """
        now = now or datetime.utcnow()
        status_value = (
            listing.status.value if hasattr(listing.status, "value") else listing.status
        )
        if status_value != "approved":
            return False
        if ListingFeeService.is_live(listing, now):
            return True
        fee = ListingFeeService._live_fee(db, listing_type, listing.id, now)
        if fee is None:
            return False
        ListingFeeService._stamp_window(listing, fee.starts_at or now, fee.expires_at)
        return True

    # ------------------------------------------------------------ submission
    @staticmethod
    def owned_listing(
        db: Session, user: User, listing_type: ListingType, listing_id: uuid.UUID
    ):
        if listing_type == ListingType.service:
            listing = db.query(Service).filter(Service.id == listing_id).first()
            owner_attr = "provider_id"
            allowed_role = UserRole.provider
        else:
            listing = db.query(SupplyListing).filter(SupplyListing.id == listing_id).first()
            owner_attr = "supplier_id"
            allowed_role = UserRole.supplier

        if user.role != allowed_role:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only service providers can pay for service listings"
                    if listing_type == ListingType.service
                    else "Only suppliers can pay for supply listings"
                ),
            )
        if listing is None or getattr(listing, owner_attr) != user.id:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND, detail="Listing not found"
            )
        return listing

    @staticmethod
    def submit(
        db: Session,
        user: User,
        listing_type: ListingType,
        listing_id: uuid.UUID,
        utr: str,
        payment_date: datetime,
        file: UploadFile,
        notes: Optional[str] = None,
        claimed_amount: Optional[int] = None,
        plan: Optional[str] = None,
    ) -> ListingFee:
        """Record a bank transfer for ONE listing's showcase window.

        `plan` names which of the two approved choices was paid for:
        ``month`` (₹1,000 / 30 days) or ``year`` (₹10,000 / 365 days). The amount
        and period always come from the server's plan table — a client-supplied
        figure is either absent or must match exactly; it is never stored.
        Nothing becomes live until an admin verifies the receipt.
        """
        chosen = ListingFeeService.resolve_plan(plan)
        amount_paise = chosen["amount_paise"]
        period_days = chosen["period_days"]

        listing = ListingFeeService.owned_listing(db, user, listing_type, listing_id)

        if ListingFeeService.is_live(listing):
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=(
                    "This listing already has a paid placement running until "
                    f"{listing.expires_at.date().isoformat()}. Pay again closer to "
                    "that date to renew it."
                ),
            )
        if ListingFeeService._open_fee(db, listing_type, listing_id) is not None:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail="A payment for this listing is already awaiting admin verification.",
            )

        reference = (utr or "").strip().upper()
        if len(reference) < 6:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="A valid UTR / transaction reference (at least 6 characters) is required.",
            )

        if claimed_amount is not None and int(claimed_amount) != amount_paise:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"The {chosen['label']} showcase plan costs "
                    f"₹{amount_paise // 100:,} ({amount_paise} paise). The amount "
                    "is set by Nhaav and cannot be changed."
                ),
            )

        duplicate = (
            db.query(ListingFee)
            .filter(ListingFee.utr == reference, ListingFee.status.in_(list(_LIVE_STATUSES)))
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

        # The shared bank credit: a reference already claimed by a pass payment
        # or a visibility payment is refused here, before anything is written.
        from app.models.bank_credit import BankCreditClaimType
        from app.services.bank_credit_service import BankCreditService

        credit = BankCreditService.claim(
            db,
            utr=reference,
            claim_type=BankCreditClaimType.listing_fee,
            owner_user_id=user.id,
            amount_paise=amount_paise,
            currency="INR",
            receipt_path=stored_path,
            receipt_filename=display_name,
        )

        try:
            with open(stored_path, "wb") as buffer:
                buffer.write(content)

            fee = ListingFee(
                bank_credit_id=credit.id,
                owner_user_id=user.id,
                listing_type=listing_type,
                listing_id=listing.id,
                listing_name=(listing.name or "")[:200],
                amount_paise=amount_paise,
                currency="INR",
                period_days=period_days,
                utr=reference,
                payment_date=payment_date,
                receipt_path=stored_path,
                receipt_filename=display_name,
                receipt_content_type=content_type,
                receipt_size_bytes=len(content),
                notes=(notes or "").strip() or None,
                status=ListingFeeStatus.SUBMITTED,
                submitted_at=now,
            )
            db.add(fee)
            db.flush()
            BankCreditService.attach(credit, fee.id)
            db.commit()
            db.refresh(fee)
            return fee
        except IntegrityError:
            db.rollback()
            ListingFeeService._discard(stored_path)
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=(
                    "This UTR / transaction reference has already been submitted and is "
                    "awaiting review or already processed."
                ),
            )
        except Exception:
            db.rollback()
            ListingFeeService._discard(stored_path)
            raise

    @staticmethod
    def _discard(path: str) -> None:
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass

    # --------------------------------------------------------------- queries
    @staticmethod
    def list_for_owner(db: Session, user: User) -> List[ListingFee]:
        return (
            db.query(ListingFee)
            .filter(ListingFee.owner_user_id == user.id)
            .order_by(ListingFee.created_at.desc())
            .all()
        )

    @staticmethod
    def get_for_owner(db: Session, user: User, fee_id: uuid.UUID) -> ListingFee:
        fee = db.query(ListingFee).filter(ListingFee.id == fee_id).first()
        if fee is None or (user.role != UserRole.admin and fee.owner_user_id != user.id):
            # 404 rather than 403 so existence never leaks across accounts.
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND, detail="Listing fee not found"
            )
        return fee

    @staticmethod
    def pending_for_admin(
        db: Session, admin: User, fee_status: Optional[ListingFeeStatus] = None
    ) -> List[ListingFee]:
        ListingFeeService._require_admin(admin)
        query = db.query(ListingFee)
        if fee_status is not None:
            query = query.filter(ListingFee.status == fee_status)
        else:
            query = query.filter(ListingFee.status == ListingFeeStatus.SUBMITTED)
        return query.order_by(ListingFee.submitted_at.asc()).all()

    @staticmethod
    def _require_admin(user: User) -> None:
        if user.role != UserRole.admin:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin access required"
            )

    # -------------------------------------------------------------- decisions
    @staticmethod
    def approve(
        db: Session,
        admin: User,
        fee_id: uuid.UUID,
        period: Optional[str] = None,
    ) -> ListingFee:
        """Verify the transfer and start the placement the payment bought.

        `period` is the admin's choice between the two showcase options —
        ``month`` (1 month) or ``year`` (1 year). It must match what the vendor
        actually paid: granting a year for a ₹1,000 transfer would hand out ten
        months for free, so a mismatch is refused with the paid plan named
        rather than silently upgraded or downgraded.
        """
        ListingFeeService._require_admin(admin)
        fee = db.query(ListingFee).filter(ListingFee.id == fee_id).first()
        if fee is None:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND, detail="Listing fee not found"
            )
        if fee.status != ListingFeeStatus.SUBMITTED:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=f"Only a submitted listing fee can be verified (current status: {fee.status.value})",
            )

        paid_plan = ListingFeeService.plan_for_days(fee.period_days)
        paid_days = fee.period_days or LISTING_PERIOD_DAYS

        if period is not None and str(period).strip():
            chosen = ListingFeeService.resolve_plan(period)
            if chosen["period_days"] != paid_days:
                raise HTTPException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    detail={
                        "code": "period_mismatch",
                        "message": (
                            f"This vendor paid ₹{fee.amount_paise // 100:,} for a "
                            f"{paid_plan['label'] if paid_plan else f'{paid_days}-day'} "
                            f"showcase, not {chosen['label']}. Choose the period that "
                            "matches the amount received."
                        ),
                        "paid_plan": paid_plan["code"] if paid_plan else None,
                        "paid_period_days": paid_days,
                        "options": ListingFeeService.plans(),
                    },
                )

        now = datetime.utcnow()
        fee.status = ListingFeeStatus.VERIFIED
        fee.decided_at = now
        fee.decided_by = admin.id
        fee.starts_at = now
        fee.expires_at = now + timedelta(days=paid_days)

        listing = ListingFeeService._load_listing(db, fee)
        live_now = False
        if listing is not None:
            live_now = ListingFeeService.publish_if_ready(db, fee.listing_type, listing, now)
            if not live_now and ListingFeeService._status_value(listing) == "approved":
                # Defensive: publish_if_ready is the single writer of the window,
                # so an approved listing with a just-verified fee is live.
                ListingFeeService._stamp_window(listing, fee.starts_at, fee.expires_at)
                live_now = True

        NotificationService.create_notification(
            db,
            fee.owner_user_id,
            "Listing payment verified",
            (
                f"Your payment for \"{fee.listing_name}\" was verified "
                f"({paid_plan['label'] if paid_plan else f'{paid_days} days'} showcase). "
                + (
                    f"The listing is live on the marketplace until "
                    f"{fee.expires_at.date().isoformat()}."
                    if live_now
                    else "The listing will go live as soon as its content review is approved."
                )
            ),
            NotificationType.payment,
            related_entity=f"{fee.listing_type.value}_listing",
            related_entity_id=fee.listing_id,
            dedupe=False,
        )

        from app.services.admin_audit import (
            ACTION_APPROVED,
            ENTITY_LISTING_FEE,
            record_decision,
        )

        record_decision(
            db,
            entity_type=ENTITY_LISTING_FEE,
            entity_id=fee.id,
            admin=admin,
            action=ACTION_APPROVED,
        )

        db.commit()
        db.refresh(fee)
        return fee

    @staticmethod
    def reject(
        db: Session, admin: User, fee_id: uuid.UUID, reason: str
    ) -> ListingFee:
        ListingFeeService._require_admin(admin)
        clean_reason = (reason or "").strip()
        if len(clean_reason) < 3:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="A rejection reason of at least 3 characters is required.",
            )
        fee = db.query(ListingFee).filter(ListingFee.id == fee_id).first()
        if fee is None:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND, detail="Listing fee not found"
            )
        if fee.status != ListingFeeStatus.SUBMITTED:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=f"Only a submitted listing fee can be rejected (current status: {fee.status.value})",
            )

        fee.status = ListingFeeStatus.REJECTED
        fee.decided_at = datetime.utcnow()
        fee.decided_by = admin.id
        fee.rejection_reason = clean_reason[:1000]

        from app.services.admin_audit import (
            ACTION_REJECTED,
            ENTITY_LISTING_FEE,
            record_decision,
        )

        record_decision(
            db,
            entity_type=ENTITY_LISTING_FEE,
            entity_id=fee.id,
            admin=admin,
            action=ACTION_REJECTED,
            reason=clean_reason,
        )

        NotificationService.create_notification(
            db,
            fee.owner_user_id,
            "Listing payment rejected",
            (
                f"Your payment for \"{fee.listing_name}\" could not be verified. "
                f"Reason: {fee.rejection_reason}"
            ),
            NotificationType.payment,
            related_entity=f"{fee.listing_type.value}_listing",
            related_entity_id=fee.listing_id,
            dedupe=False,
        )

        # Releasing the shared credit lets the vendor correct the reference and
        # claim it again — on this surface or any other.
        from app.models.bank_credit import BankCreditClaimType
        from app.services.bank_credit_service import BankCreditService

        BankCreditService.release(
            db, claim_type=BankCreditClaimType.listing_fee, claim_id=fee.id
        )

        db.commit()
        db.refresh(fee)
        return fee

    # --------------------------------------------------------------- helpers
    @staticmethod
    def _status_value(listing) -> str:
        value = getattr(listing, "status", None)
        return value.value if hasattr(value, "value") else str(value)

    @staticmethod
    def _load_listing(db: Session, fee: ListingFee):
        if fee.listing_type == ListingType.service:
            return db.query(Service).filter(Service.id == fee.listing_id).first()
        return db.query(SupplyListing).filter(SupplyListing.id == fee.listing_id).first()

    @staticmethod
    def authorize_receipt(db: Session, user: User, fee_id: uuid.UUID) -> ListingFee:
        return ListingFeeService.get_for_owner(db, user, fee_id)
