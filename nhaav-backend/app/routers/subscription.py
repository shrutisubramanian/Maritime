"""
Account subscription API — the entitlement layer above individual passes.

GET  /subscription/status         authenticated: the CALLING ACCOUNT's plan,
                                  subscription state(s) and pass balance
GET  /subscription/plans          authenticated: the approved plan catalogue
POST /subscription/dev-provision  DEVELOPMENT/TEST-ONLY (404 in production):
                                  grant an account a plan and activate it
                                  without payment

Both GET endpoints use the identity-only dependency so an account can still see
its balance (and reach renewal) after its access session has ended. No endpoint
exposes another account's subscription or passes.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.routers.access import require_admin_for_provisioning
from app.middleware.auth_guard import get_current_user_identity
from app.models.user import User
from app.schemas.subscription import (
    SubscriptionPlanListResponse,
    SubscriptionStatusResponse,
)
from app.services.subscription_service import (
    SubscriptionService,
    plan_pricing,
    plan_validity_days,
)

router = APIRouter(prefix="/subscription", tags=["Subscription"])


@router.get(
    "/plans",
    response_model=SubscriptionPlanListResponse,
    summary="Available subscription plans",
)
def list_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    """
    The approved plan catalogue:

      MONTHLY  ₹1,000 + GST,  10 passes,  valid 6 calendar months
      ANNUAL   ₹10,000 + GST, 100 passes, valid 12 calendar months

    `price_paise` is the taxable value; `gst_paise` and `total_paise` are what
    the buyer actually transfers. Figures come from the seeded plan rows — never
    hardcoded in business logic. The same two plans apply to clients, suppliers
    and service providers; no online payment flow exists (bank transfer +
    admin approval).
    """
    plans = SubscriptionService.list_plans(db)
    return {
        "plans": [
            {
                "code": plan.code,
                "name": plan.name,
                "price_paise": plan.price_paise,
                "currency": plan.currency,
                "duration_value": plan.duration_value,
                "duration_unit": plan.duration_unit.value,
                "pass_count": plan.pass_count,
                **{
                    k: v
                    for k, v in plan_pricing(plan).items()
                    if k in ("gst_rate_percent", "gst_paise", "total_paise")
                },
                # How long the purchased passes stay usable.
                "pass_validity_days": plan_validity_days(plan),
            }
            for plan in plans
        ]
    }


@router.get(
    "/status",
    response_model=SubscriptionStatusResponse,
    summary="My subscription and pass status",
)
def subscription_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    """
    Plan, subscription state(s), every pack the account owns, the aggregated pass
    balance and the caller's current session — for the calling ACCOUNT only.
    """
    return SubscriptionService.get_subscription_status(db, current_user)


@router.post(
    "/dev-provision",
    summary="[DEV/TEST/ADMIN ONLY] Grant and activate a subscription for one account",
    dependencies=[Depends(require_admin_for_provisioning)],
)
def dev_provision_subscription(
    owner_email: str,
    plan_code: str = "MONTHLY",
    organization_name: str = "",
    db: Session = Depends(get_db),
):
    """
    Development/test provisioning: grants the account with this exact email a
    subscription and immediately ACTIVATES it, issuing one access pack of the
    plan's pass_count — owned by that account, with each pass carrying its own
    unused-validity window (6 months for the 10-pass pack, 12 for the 100).

    Repeated calls ADD packs (an account may hold several); they never replace or
    extend an earlier one.

    M-1 HARDENING: disabled in production AND staging (fail-closed allowlist —
    only explicit `development` enables it), and in non-development environments
    a valid ADMIN JWT is still required.
    """
    owner = (
        db.query(User)
        .filter(User.email == owner_email.strip())  # exact match only
        .first()
    )
    if owner is None:
        raise HTTPException(
            status_code=404,
            detail=f"No account exists with the email '{owner_email}'.",
        )

    if organization_name.strip():
        from app.models.profile import Profile

        org = SubscriptionService._resolve_organization(db, owner)
        if org is None:
            from app.services.access_token_service import AccessTokenService

            org = AccessTokenService.get_or_create_organization(db, organization_name)
        profile = db.query(Profile).filter(Profile.user_id == owner.id).first()
        if profile is not None:
            profile.organization_id = org.id
            db.commit()

    subscription = SubscriptionService.create_subscription(db, owner, plan_code)
    pack = SubscriptionService.activate_subscription(db, subscription, source="dev_endpoint")

    return {
        "owner": owner.email,
        "owner_user_id": str(owner.id),
        "plan_code": subscription.plan.code,
        "subscription_id": str(subscription.id),
        "subscription_status": subscription.status.value,
        "starts_at": subscription.starts_at,
        "expires_at": subscription.expires_at,
        "pack_id": str(pack.id),
        "total_passes": pack.token_count,
    }
