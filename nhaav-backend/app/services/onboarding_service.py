"""Onboarding gate — what an account must complete before the marketplace opens.

Product rule: a freshly verified account is confined to its **profile**, its
**verification documents** and the **subscription/payment** screens. Openness
then depends on the ROLE:

  * EVERY account needs a verified email and an admin APPROVED verification
    (``profiles.verification_status == verified``).
  * A CLIENT additionally needs a PAID platform fee — an active subscription,
    which only exists once an admin verifies the bank transfer. This mirrors the
    admin rule in ``admin_verification._approval_blockers``: a client is
    approved only when paperwork AND payment are both in, because that single
    approval issues the passes the payment bought.

Clients walk the flow in this order: register -> fill in the profile and upload
documents -> pay the platform fee -> admin verifies payment and profile ->
account opens.

VENDORS (suppliers and service providers) hold NO passes and have NO session
time limit, so they are not payment-gated here. What they pay for is how long
their LISTING is showcased on the marketplace — ₹1,000 for a month, ₹10,000 for
a year — and that placement is verified in the listing-fee queue (see
``ListingFeeService``), not through a subscription.

``subscription_active`` is reported for every account so the billing screens
can render it.

Enforcement is twofold (see the frontend guard too):

  * :func:`require_marketplace_access` — a FastAPI dependency that refuses the
    marketplace APIs with **403** for a locked account, so a direct API call is
    blocked just like the UI;
  * the frontend mirrors the same rule and redirects locked accounts back to
    ``/profile``.

Admins are exempt: they operate the review/approval surfaces and do not need a
subscription of their own.
"""
from datetime import datetime
from typing import Optional

from fastapi import Depends, HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.document import Document
from app.models.payment import Payment, PaymentStatus
from app.models.profile import Profile, VerificationStatus
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole


class OnboardingService:
    #: The single frontend route a locked account is confined to.
    LOCKED_HOME = "/profile"

    # ------------------------------------------------------------- primitives
    @staticmethod
    def documents_count(db: Session, user: User) -> int:
        return db.query(Document).filter(Document.user_id == user.id).count()

    @staticmethod
    def verification_status(db: Session, user: User) -> Optional[VerificationStatus]:
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        return profile.verification_status if profile is not None else None

    @staticmethod
    def requires_payment(user: User) -> bool:
        """Clients buy a platform subscription; vendors pay per listing instead.

        Suppliers and service providers have no usage passes and no session
        time limit: their money buys marketplace showcase time for a listing
        (1 month or 1 year), verified in the listing-fee queue. Admins are
        exempt from everything.
        """
        return user.role == UserRole.client

    #: The fields a profile must carry before the account is reviewable. The
    #: keys are the API field names, so the UI can map them to its own labels.
    PROFILE_FIELDS = ("company_name", "contact_name", "contact_phone", "bio")

    @staticmethod
    def profile_state(db: Session, user: User) -> tuple[bool, list[str]]:
        """Is the profile filled in, and what is still missing?

        "Complete" means the account has told us who it is doing business as and
        how to reach that person: a company name, a description of the business,
        and one contact carrying a name and a phone number. Uploaded documents
        are a separate step and the fee is a separate gate, so neither counts
        here.
        """
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        if profile is None:
            return False, list(OnboardingService.PROFILE_FIELDS)

        missing: list[str] = []
        if not (profile.company_name or "").strip():
            missing.append("company_name")
        contact = next(
            (c for c in (profile.contacts or []) if isinstance(c, dict)), {}
        )
        if not str(contact.get("name") or "").strip():
            missing.append("contact_name")
        if not str(contact.get("phone") or "").strip():
            missing.append("contact_phone")
        if not (profile.bio or "").strip():
            missing.append("bio")
        return not missing, missing

    @staticmethod
    def has_pending_payment(db: Session, user: User) -> bool:
        """A bank transfer is submitted and waiting for an admin to verify it."""
        return (
            db.query(Payment.id)
            .filter(
                Payment.owner_user_id == user.id,
                Payment.status == PaymentStatus.SUBMITTED,
            )
            .first()
            is not None
        )

    @staticmethod
    def has_active_subscription(db: Session, user: User, now: Optional[datetime] = None) -> bool:
        now = now or datetime.utcnow()
        return (
            db.query(Subscription.id)
            .filter(
                Subscription.owner_user_id == user.id,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.expires_at.isnot(None),
                Subscription.expires_at > now,
            )
            .first()
            is not None
        )

    # ------------------------------------------------------------- composite
    @staticmethod
    def status(db: Session, user: User) -> dict:
        """The account's onboarding state (single source of truth for the UI)."""
        is_admin = user.role == UserRole.admin
        verification = OnboardingService.verification_status(db, user)
        verification_approved = verification == VerificationStatus.verified
        subscription_active = OnboardingService.has_active_subscription(db, user)
        documents = OnboardingService.documents_count(db, user)
        email_verified = bool(user.is_verified)
        payment_required = OnboardingService.requires_payment(user)
        payment_submitted = payment_required and OnboardingService.has_pending_payment(db, user)
        profile_completed, profile_missing = OnboardingService.profile_state(db, user)

        # Two gates: admin-approved verification (everyone) and a paid platform
        # fee (clients only — vendors buy listing showcase time instead).
        payment_gate_open = subscription_active or not payment_required
        marketplace_unlocked = is_admin or (
            email_verified and verification_approved and payment_gate_open
        )

        if marketplace_unlocked:
            next_step = "done"
        elif not email_verified:
            next_step = "verify_email"
        elif not verification_approved:
            if not profile_completed:
                # The account's own details come first: the admin has to see who
                # is being reviewed, and the fee is only asked for once that is
                # in. This is the box the account sees on its profile page.
                next_step = "complete_profile"
            elif documents == 0:
                # Profile is in, but there is still nothing for the reviewer to
                # look at — the verification upload comes next.
                next_step = "complete_profile"
            elif payment_required and not subscription_active and not payment_submitted:
                # Paperwork is in but the fee is unpaid: the admin cannot approve
                # a client without the transfer, so paying IS the next action.
                next_step = "pay_subscription"
            else:
                # Either the payment is submitted (review) or the account is a
                # vendor, whose approval is document-only.
                next_step = "awaiting_review"
        else:
            # Approved but nothing paid/active: a lapsed or rejected fee.
            next_step = "pay_subscription"

        return {
            "email_verified": email_verified,
            "verification_status": verification.value if verification is not None else "not_started",
            "verification_approved": verification_approved,
            "documents_count": documents,
            "profile_completed": profile_completed,
            "profile_missing": profile_missing,
            "subscription_active": subscription_active,
            "payment_required": payment_required,
            "payment_submitted": payment_submitted,
            "marketplace_unlocked": marketplace_unlocked,
            "next_step": next_step,
            "is_admin": is_admin,
            "locked_home": OnboardingService.LOCKED_HOME,
        }

    # ------------------------------------------------------------- enforcement
    @staticmethod
    def ensure_marketplace_access(db: Session, user: User) -> None:
        if user.role == UserRole.admin:
            return
        state = OnboardingService.status(db, user)
        if state["marketplace_unlocked"]:
            return
        message = (
            "Your account must be verified and approved by an admin, and your "
            "platform fee paid, before you can use the marketplace, requests "
            "or jobs."
            if state["payment_required"]
            else (
                "Your account must be verified and approved by an admin "
                "before you can use the marketplace, requests or jobs."
            )
        )
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail={
                "code": "onboarding_incomplete",
                "message": message,
                "next_step": state["next_step"],
            },
        )


def require_marketplace_access(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> User:
    """Marketplace / requests / jobs: email verified and admin-approved."""
    OnboardingService.ensure_marketplace_access(db, current_user)
    return current_user
