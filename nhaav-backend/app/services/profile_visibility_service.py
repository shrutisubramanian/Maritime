"""
Paid COMPANY-PROFILE visibility — the unit of marketplace visibility.

Two plans, one source of truth:

    monthly  ₹1,000  + GST  -> 30 days
    annual   ₹10,000 + GST  -> 365 days

The listed prices are PRE-GST. GST comes from ``settings.GST_RATE_PERCENT`` (a
single configurable value, exposed to an operator as an environment variable) and
is snapshotted on each submission, so rotating the rate never rewrites history.

Visibility is an entitlement SEPARATE from account verification:

    verified profile  = the company is trusted
    active visibility = the company may appear in paid marketplace discovery

Both are required for discovery. A verified company with no active plan stays off
the marketplace until an admin verifies a payment. Money moves by bank transfer
with an admin decision, exactly like the rest of Nhaav — there is no gateway.

Legacy compatibility: companies that already paid for individual listing
placements keep discoverability until those placements expire (see
``effective_window``), so the restructure never silently hides a paying vendor.
"""
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, UploadFile, status as http_status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.profile import Profile, VerificationStatus
from app.models.profile_visibility import (
    ProfileVisibility,
    ProfileVisibilityPlan,
    ProfileVisibilityStatus,
)
from app.models.service import Service
from app.models.supply_listing import SupplyListing
from app.models.user import User, UserRole
from app.services.payment_service import PaymentService

#: The complete plan table. Prices are INTEGER PAISE, pre-GST.
PROFILE_VISIBILITY_PLANS: dict[str, dict] = {
    "monthly": {
        "code": "monthly",
        "label": "1 month",
        "base_amount_paise": 100_000,      # ₹1,000
        "period_days": 30,
    },
    "annual": {
        "code": "annual",
        "label": "12 months",
        "base_amount_paise": 1_000_000,    # ₹10,000
        "period_days": 365,
    },
}

DEFAULT_PLAN = "monthly"


def _utcnow() -> datetime:
    return datetime.utcnow()


def _gst_amount(base_paise: int, rate_percent: int) -> int:
    """Tax on a pre-GST base, rounded to the nearest paisa."""
    return int(round(base_paise * rate_percent / 100.0))


class ProfileVisibilityService:
    # ------------------------------------------------------------- plans
    @staticmethod
    def gst_rate_percent() -> int:
        return int(getattr(settings, "GST_RATE_PERCENT", 18))

    @staticmethod
    def plan_payload(code: str) -> dict:
        plan = PROFILE_VISIBILITY_PLANS.get((code or "").strip().lower())
        if plan is None:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "unsupported_visibility_plan",
                    "message": "Choose the 1-month or the 12-month visibility plan.",
                    "options": [ProfileVisibilityService.plan_payload(c) for c in PROFILE_VISIBILITY_PLANS],
                },
            )
        rate = ProfileVisibilityService.gst_rate_percent()
        base = plan["base_amount_paise"]
        gst = _gst_amount(base, rate)
        return {
            "code": plan["code"],
            "label": plan["label"],
            "period_days": plan["period_days"],
            "base_amount_paise": base,
            "gst_rate_percent": rate,
            "gst_amount_paise": gst,
            "total_amount_paise": base + gst,
            "currency": settings.PAYMENT_CURRENCY,
        }

    @staticmethod
    def plans() -> list[dict]:
        return [ProfileVisibilityService.plan_payload(code) for code in PROFILE_VISIBILITY_PLANS]

    @staticmethod
    def instructions() -> dict:
        payload = PaymentService.get_instructions()
        payload.update({"plans": ProfileVisibilityService.plans()})
        return payload

    # ------------------------------------------------------------ windows
    @staticmethod
    def active_payment(db: Session, profile_id: uuid.UUID, now: Optional[datetime] = None) -> Optional[ProfileVisibility]:
        now = now or _utcnow()
        return (
            db.query(ProfileVisibility)
            .filter(
                ProfileVisibility.profile_id == profile_id,
                ProfileVisibility.status == ProfileVisibilityStatus.VERIFIED,
                ProfileVisibility.expires_at.isnot(None),
                ProfileVisibility.expires_at > now,
            )
            .order_by(ProfileVisibility.expires_at.desc())
            .first()
        )

    @staticmethod
    def legacy_listing_expiry(db: Session, profile: Profile, now: Optional[datetime] = None) -> Optional[datetime]:
        """Latest expiry among this company's still-running PAID listings.

        Before the company-first model, visibility was bought per listing. Those
        purchases are honoured until they run out: the company stays discoverable
        for as long as its last paid placement lasts. Nothing new can be bought
        this way.
        """
        now = now or _utcnow()
        user = profile.user
        if user is None:
            return None
        if user.role == UserRole.provider:
            row = (
                db.query(Service.expires_at)
                .filter(
                    Service.provider_id == profile.user_id,
                    Service.is_active.is_(True),
                    Service.expires_at.isnot(None),
                    Service.expires_at > now,
                )
                .order_by(Service.expires_at.desc())
                .first()
            )
        elif user.role == UserRole.supplier:
            row = (
                db.query(SupplyListing.expires_at)
                .filter(
                    SupplyListing.supplier_id == profile.user_id,
                    SupplyListing.expires_at.isnot(None),
                    SupplyListing.expires_at > now,
                )
                .order_by(SupplyListing.expires_at.desc())
                .first()
            )
        else:
            return None
        return row[0] if row else None

    @staticmethod
    def visibility_state(db: Session, profile: Profile, now: Optional[datetime] = None) -> dict:
        now = now or _utcnow()
        payment = ProfileVisibilityService.active_payment(db, profile.id, now)
        if payment is not None:
            return {
                "is_visible": profile.verification_status == VerificationStatus.verified,
                "source": "profile_plan",
                "plan": payment.plan.value,
                "starts_at": payment.starts_at,
                "expires_at": payment.expires_at,
            }
        legacy_expiry = ProfileVisibilityService.legacy_listing_expiry(db, profile, now)
        if legacy_expiry is not None:
            return {
                "is_visible": profile.verification_status == VerificationStatus.verified,
                "source": "legacy_listing",
                "plan": None,
                "starts_at": None,
                "expires_at": legacy_expiry,
            }
        return {
            "is_visible": False,
            "source": None,
            "plan": None,
            "starts_at": None,
            "expires_at": None,
        }

    @staticmethod
    def visibility_states(db: Session, profiles, now: Optional[datetime] = None) -> dict:
        """Batch form of ``visibility_state`` for a discovery page.

        Identical rules, but the whole page costs TWO extra queries instead of
        two or three per company: paid profile windows in one pass, legacy
        listing windows in one grouped pass per legacy table. This is what keeps
        company discovery from becoming N+1 as the marketplace grows.
        """
        profiles = list(profiles)
        now = now or _utcnow()
        if not profiles:
            return {}

        ids = [profile.id for profile in profiles]
        active = (
            db.query(ProfileVisibility)
            .filter(
                ProfileVisibility.profile_id.in_(ids),
                ProfileVisibility.status == ProfileVisibilityStatus.VERIFIED,
                ProfileVisibility.expires_at.isnot(None),
                ProfileVisibility.expires_at > now,
            )
            .order_by(ProfileVisibility.expires_at.desc())
            .all()
        )
        # Newest expiry wins; a profile can hold several historical windows.
        payment_by_profile: dict = {}
        for row in active:
            payment_by_profile.setdefault(row.profile_id, row)

        provider_ids = [
            profile.user_id
            for profile in profiles
            if profile.user is not None and profile.user.role == UserRole.provider
        ]
        supplier_ids = [
            profile.user_id
            for profile in profiles
            if profile.user is not None and profile.user.role == UserRole.supplier
        ]
        legacy_expiry: dict = {}
        if provider_ids:
            for owner, expiry in (
                db.query(Service.provider_id, Service.expires_at)
                .filter(
                    Service.provider_id.in_(provider_ids),
                    Service.is_active.is_(True),
                    Service.expires_at.isnot(None),
                    Service.expires_at > now,
                )
                .all()
            ):
                if owner not in legacy_expiry or expiry > legacy_expiry[owner]:
                    legacy_expiry[owner] = expiry
        if supplier_ids:
            for owner, expiry in (
                db.query(SupplyListing.supplier_id, SupplyListing.expires_at)
                .filter(
                    SupplyListing.supplier_id.in_(supplier_ids),
                    SupplyListing.expires_at.isnot(None),
                    SupplyListing.expires_at > now,
                )
                .all()
            ):
                if owner not in legacy_expiry or expiry > legacy_expiry[owner]:
                    legacy_expiry[owner] = expiry

        states: dict = {}
        for profile in profiles:
            verified = profile.verification_status == VerificationStatus.verified
            payment = payment_by_profile.get(profile.id)
            if payment is not None:
                states[profile.id] = {
                    "is_visible": verified,
                    "source": "profile_plan",
                    "plan": payment.plan.value,
                    "starts_at": payment.starts_at,
                    "expires_at": payment.expires_at,
                }
            elif profile.user_id in legacy_expiry:
                states[profile.id] = {
                    "is_visible": verified,
                    "source": "legacy_listing",
                    "plan": None,
                    "starts_at": None,
                    "expires_at": legacy_expiry[profile.user_id],
                }
            else:
                states[profile.id] = {
                    "is_visible": False,
                    "source": None,
                    "plan": None,
                    "starts_at": None,
                    "expires_at": None,
                }
        return states

    @staticmethod
    def is_publicly_discoverable(db: Session, profile: Profile, now: Optional[datetime] = None) -> bool:
        """Approved profile AND an active paid window. Both, always."""
        if profile.verification_status != VerificationStatus.verified:
            return False
        return ProfileVisibilityService.visibility_state(db, profile, now)["is_visible"]

    # --------------------------------------------------------- lifecycle
    @staticmethod
    def _owned_profile(db: Session, user: User) -> Profile:
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        if profile is None:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND, detail="Complete your company profile first."
            )
        if user.role not in (UserRole.provider, UserRole.supplier):
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Only suppliers and service providers buy marketplace profile visibility.",
            )
        return profile

    @staticmethod
    def _open_submission(db: Session, profile_id: uuid.UUID) -> Optional[ProfileVisibility]:
        return (
            db.query(ProfileVisibility)
            .filter(
                ProfileVisibility.profile_id == profile_id,
                ProfileVisibility.status.in_(
                    [ProfileVisibilityStatus.PENDING, ProfileVisibilityStatus.SUBMITTED]
                ),
            )
            .order_by(ProfileVisibility.created_at.desc())
            .first()
        )

    @staticmethod
    def submit(
        db: Session,
        user: User,
        plan_code: str,
        utr: str,
        payment_date: datetime,
        file: UploadFile,
        notes: Optional[str] = None,
        claimed_amount: Optional[int] = None,
    ) -> ProfileVisibility:
        profile = ProfileVisibilityService._owned_profile(db, user)
        plan = ProfileVisibilityService.plan_payload(plan_code)

        if ProfileVisibilityService.active_payment(db, profile.id) is not None:
            state = ProfileVisibilityService.visibility_state(db, profile)
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=(
                    "This company already has paid marketplace visibility until "
                    f"{state['expires_at'].date().isoformat()}. A new plan can be "
                    "submitted once that period ends."
                ),
            )
        if ProfileVisibilityService._open_submission(db, profile.id) is not None:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail="A visibility payment for this company is already awaiting admin verification.",
            )

        reference = (utr or "").strip().upper()
        if len(reference) < 6:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="A valid UTR / transaction reference (at least 6 characters) is required.",
            )
        if claimed_amount is not None and int(claimed_amount) != plan["total_amount_paise"]:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"The {plan['label']} visibility plan costs "
                    f"₹{plan['total_amount_paise'] // 100:,} including GST "
                    f"({plan['total_amount_paise']} paise). The amount is set by Nhaav."
                ),
            )

        duplicate = (
            db.query(ProfileVisibility)
            .filter(
                ProfileVisibility.utr == reference,
                ProfileVisibility.status.in_(
                    [
                        ProfileVisibilityStatus.PENDING,
                        ProfileVisibilityStatus.SUBMITTED,
                        ProfileVisibilityStatus.VERIFIED,
                    ]
                ),
            )
            .first()
        )
        if duplicate is not None:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail="That bank reference has already been used for a payment.",
            )

        extension, content_type, content = PaymentService._validate_receipt(file)

        # The shared bank credit: one transfer funds one purchase, so a reference
        # already claimed by a pass payment or a listing fee is refused here,
        # before the receipt is written.
        from app.models.bank_credit import BankCreditClaimType
        from app.services.bank_credit_service import BankCreditService

        credit = BankCreditService.claim(
            db,
            utr=reference,
            claim_type=BankCreditClaimType.profile_visibility,
            owner_user_id=user.id,
            amount_paise=plan["total_amount_paise"],
            currency=plan["currency"],
            receipt_path=None,
            receipt_filename=getattr(file, "filename", None),
        )

        receipts_dir = settings.PAYMENT_RECEIPTS_DIR
        os.makedirs(receipts_dir, exist_ok=True)
        stored_name = f"profile-visibility-{uuid.uuid4().hex}.{extension}"
        stored_path = os.path.join(receipts_dir, stored_name)
        with open(stored_path, "wb") as handle:
            handle.write(content)
        credit.receipt_path = stored_path

        record = ProfileVisibility(
            bank_credit_id=credit.id,
            profile_id=profile.id,
            owner_user_id=user.id,
            plan=ProfileVisibilityPlan(plan["code"]),
            period_days=plan["period_days"],
            base_amount_paise=plan["base_amount_paise"],
            gst_rate_percent=plan["gst_rate_percent"],
            gst_amount_paise=plan["gst_amount_paise"],
            total_amount_paise=plan["total_amount_paise"],
            currency=plan["currency"],
            utr=reference,
            payment_date=payment_date,
            receipt_path=stored_path,
            receipt_filename=getattr(file, "filename", stored_name) or stored_name,
            receipt_content_type=content_type,
            receipt_size_bytes=len(content),
            notes=notes,
            status=ProfileVisibilityStatus.SUBMITTED,
            submitted_at=_utcnow(),
        )
        try:
            db.add(record)
            db.flush()
            BankCreditService.attach(credit, record.id)
            db.commit()
        except IntegrityError:
            # Two submissions of one reference raced: the partial unique index
            # (per table, or on the shared credit) let exactly one in.
            db.rollback()
            if os.path.isfile(stored_path):
                os.unlink(stored_path)
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=(
                    "This UTR / transaction reference has already been submitted and is "
                    "awaiting review or already processed."
                ),
            )
        except Exception:
            db.rollback()
            if os.path.isfile(stored_path):
                os.unlink(stored_path)
            raise
        db.refresh(record)
        return record

    @staticmethod
    def _require_admin(user: User) -> None:
        if user.role != UserRole.admin:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Admin access required",
            )

    @staticmethod
    def pending_for_admin(
        db: Session, admin: User, wanted: Optional[ProfileVisibilityStatus] = None
    ) -> list[ProfileVisibility]:
        ProfileVisibilityService._require_admin(admin)
        query = db.query(ProfileVisibility)
        if wanted is not None:
            query = query.filter(ProfileVisibility.status == wanted)
        else:
            query = query.filter(
                ProfileVisibility.status.in_(
                    [ProfileVisibilityStatus.PENDING, ProfileVisibilityStatus.SUBMITTED]
                )
            )
        return query.order_by(ProfileVisibility.created_at.desc()).all()

    @staticmethod
    def list_for_owner(db: Session, user: User) -> list[ProfileVisibility]:
        profile = ProfileVisibilityService._owned_profile(db, user)
        return (
            db.query(ProfileVisibility)
            .filter(ProfileVisibility.profile_id == profile.id)
            .order_by(ProfileVisibility.created_at.desc())
            .all()
        )

    @staticmethod
    def verify(db: Session, admin: User, payment_id: uuid.UUID) -> ProfileVisibility:
        """Admin approval — the ONLY path that grants paid visibility."""
        ProfileVisibilityService._require_admin(admin)
        record = db.query(ProfileVisibility).filter(ProfileVisibility.id == payment_id).first()
        if record is None:
            raise HTTPException(status_code=404, detail="Visibility payment not found")
        if record.status not in (
            ProfileVisibilityStatus.PENDING,
            ProfileVisibilityStatus.SUBMITTED,
        ):
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=f"This payment is already {record.status.value.lower()}.",
            )

        profile = db.query(Profile).filter(Profile.id == record.profile_id).first()
        if profile is None:
            raise HTTPException(status_code=404, detail="Company profile not found")

        # Verification first: paid visibility can never precede approval, which
        # is what stops a plan selection from accidentally publishing a company.
        if profile.verification_status != VerificationStatus.verified:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail={
                    "code": "profile_not_approved",
                    "message": (
                        "Approve this company's profile before activating paid visibility. "
                        "The payment stays on file and can be verified afterwards."
                    ),
                },
            )

        now = _utcnow()
        current = ProfileVisibilityService.active_payment(db, profile.id, now)
        starts_at = now
        if current is not None and current.expires_at is not None and current.expires_at > now:
            # Renewal: extend the running window rather than stacking two.
            starts_at = current.expires_at
        record.starts_at = starts_at
        record.expires_at = starts_at + timedelta(days=record.period_days)
        record.status = ProfileVisibilityStatus.VERIFIED
        record.decided_at = now
        record.decided_by = admin.id
        record.rejection_reason = None
        from app.services.admin_audit import (
            ACTION_APPROVED,
            ENTITY_VISIBILITY,
            record_decision,
        )

        record_decision(
            db,
            entity_type=ENTITY_VISIBILITY,
            entity_id=record.id,
            admin=admin,
            action=ACTION_APPROVED,
        )
        db.commit()
        db.refresh(record)
        return record

    @staticmethod
    def reject(
        db: Session, admin: User, payment_id: uuid.UUID, reason: str
    ) -> ProfileVisibility:
        ProfileVisibilityService._require_admin(admin)
        record = db.query(ProfileVisibility).filter(ProfileVisibility.id == payment_id).first()
        if record is None:
            raise HTTPException(status_code=404, detail="Visibility payment not found")
        if record.status not in (
            ProfileVisibilityStatus.PENDING,
            ProfileVisibilityStatus.SUBMITTED,
        ):
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=f"This payment is already {record.status.value.lower()}.",
            )
        if not (reason or "").strip():
            raise HTTPException(status_code=400, detail="A rejection reason is required.")
        record.status = ProfileVisibilityStatus.REJECTED
        record.rejection_reason = reason.strip()
        record.decided_at = _utcnow()
        record.decided_by = admin.id
        from app.services.admin_audit import (
            ACTION_REJECTED,
            ENTITY_VISIBILITY,
            record_decision,
        )

        record_decision(
            db,
            entity_type=ENTITY_VISIBILITY,
            entity_id=record.id,
            admin=admin,
            action=ACTION_REJECTED,
            reason=reason,
        )

        # Free the shared bank reference so it can be corrected and re-submitted.
        from app.models.bank_credit import BankCreditClaimType
        from app.services.bank_credit_service import BankCreditService

        BankCreditService.release(
            db, claim_type=BankCreditClaimType.profile_visibility, claim_id=record.id
        )

        db.commit()
        db.refresh(record)
        return record

    @staticmethod
    def authorize_receipt(db: Session, user: User, payment_id: uuid.UUID) -> ProfileVisibility:
        record = db.query(ProfileVisibility).filter(ProfileVisibility.id == payment_id).first()
        if record is None:
            raise HTTPException(status_code=404, detail="Receipt not found")
        if user.role != UserRole.admin and record.owner_user_id != user.id:
            # 404 (not 403) so existence never leaks.
            raise HTTPException(status_code=404, detail="Receipt not found")
        if not record.receipt_path or not os.path.isfile(record.receipt_path):
            raise HTTPException(status_code=404, detail="Receipt not found")
        return record

    # ------------------------------------------------- discovery helpers
    @staticmethod
    def discoverable_profile_ids(db: Session, now: Optional[datetime] = None) -> Optional[list[uuid.UUID]]:
        """Profile ids allowed in paid discovery, or None when unrestricted.

        Used by list endpoints that need a single SQL predicate. Expiry is always
        evaluated against the database clock, never a browser-supplied value.
        """
        now = now or _utcnow()
        rows = (
            db.query(ProfileVisibility.profile_id)
            # Approval is part of the definition of discovery, not a caller's
            # concern: joining Profile here means a helper named "discoverable"
            # can never hand an unapproved company to a future caller.
            .join(Profile, Profile.id == ProfileVisibility.profile_id)
            .filter(
                Profile.verification_status == VerificationStatus.verified,
                ProfileVisibility.status == ProfileVisibilityStatus.VERIFIED,
                ProfileVisibility.expires_at.isnot(None),
                ProfileVisibility.expires_at > now,
            )
            .distinct()
            .all()
        )
        return [row[0] for row in rows]
