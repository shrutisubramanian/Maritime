"""Shared test helpers: put a user through the onboarding gate.

The marketplace, requests and jobs require an admin-approved verification (see
app/services/onboarding_service.py) and, for a CLIENT, a PAID platform fee — an
active subscription, which only exists after an admin verifies the transfer.

``grant_subscription`` supplies just the paid half; ``grant_marketplace_access``
adds the verified profile on top. Tests that build their own users use the
former so their own profile/document setup is left untouched.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.profile import Profile, VerificationStatus
from app.models.subscription import (
    BillingPeriod,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.models.user import User


def _ensure_plan(db: Session) -> SubscriptionPlan:
    """The MONTHLY plan, created on demand for a fresh test database."""
    plan = (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.code == "MONTHLY")
        .first()
    )
    if plan is None:
        plan = SubscriptionPlan(
            code="MONTHLY",
            name="Nhaav Monthly",
            price_paise=100_000,
            currency="INR",
            duration_value=1,
            duration_unit=BillingPeriod.MONTH,
            pass_count=10,
        )
        db.add(plan)
        db.flush()
    return plan


def grant_subscription(db: Session, user: User, days: int = 30) -> None:
    """Give ``user`` an ACTIVE subscription — the PAID half of the client gate."""
    plan = _ensure_plan(db)
    now = datetime.utcnow()
    db.add(
        Subscription(
            owner_user_id=user.id,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            starts_at=now,
            expires_at=now + timedelta(days=days),
        )
    )
    db.commit()


def grant_marketplace_access(db: Session, user: User) -> None:
    """Make ``user`` pass ``require_marketplace_access`` (approved + paid)."""
    user.is_verified = True

    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    if profile is None:
        profile = Profile(user_id=user.id, company_name="Entitled Co")
        db.add(profile)
        db.flush()
    profile.verification_status = VerificationStatus.verified
    db.commit()

    # A paid platform fee. Required for a client to actually get in; harmless
    # for a provider/supplier, and it keeps this helper's contract unchanged.
    grant_subscription(db, user)
