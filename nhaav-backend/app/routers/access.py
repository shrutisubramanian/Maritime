"""
Account access-pass status — the minimal entitlement dashboard API.

GET /access/status (authenticated):
  the CALLING ACCOUNT's own pass balance + its current session. Passes are
  account-owned, so nothing company-scoped is ever counted.

POST /access/dev-provision-pack is a DEVELOPMENT/TEST-ONLY provisioning path
guarded by settings.ENVIRONMENT != 'production'. It grants an access pack to ONE
account (named by exact email — never fuzzy-matched). Real pack creation happens
through the payment phase: submit bank transfer -> admin approval -> activation.
"""
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

import uuid

from app.config import settings
from app.database import get_db
from app.middleware.auth_guard import get_current_user_identity
from app.models.user import User, UserRole
from app.schemas.access import AccessStatusResponse
from app.services.access_token_service import (
    PASS_UNUSED_VALIDITY_DAYS,
    AccessTokenService,
)
from app.services.onboarding_service import OnboardingService

import jwt

router = APIRouter(prefix="/access", tags=["Access Tokens"])


def require_admin_for_provisioning(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> None:
    """Guard for the dev/test provisioning endpoints (a real dependency).

    Three states, all fail-closed:

    * production — 404, so the endpoint looks like it does not exist;
    * explicit development — allowed, this is the local allowlist;
    * anything else (staging) — a valid ADMIN JWT is required.

    Earlier this was called as a plain function, which meant FastAPI never
    injected the Authorization header: the parameter was the ``Header`` marker
    object itself and every staging call died with an AttributeError (500)
    instead of a 401/403. Declaring it as a dependency is what makes the admin
    requirement actually work.
    """
    if settings.is_production:
        raise HTTPException(status_code=404, detail="Not found")
    if settings.is_development:
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Admin authorization required")

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id = uuid.UUID(str(payload.get("sub")))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin authorization required")


@router.get("/status", response_model=AccessStatusResponse, summary="My access-pass status")
def access_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    """
    Pass balance for the caller's OWN ACCOUNT and, when the caller holds one,
    their current 6-hour session. Account isolation is enforced in the service:
    only rows owned by the calling account are counted.
    """
    return AccessTokenService.get_status(db, current_user)


@router.get("/onboarding", summary="My onboarding / marketplace-access state")
def onboarding_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    """Where the caller stands on the path to the marketplace.

    Deliberately IDENTITY-only (no access-entitlement gate) so the frontend
    guard can read it even while the account is locked — that locked state is
    exactly what it needs to detect and react to.
    """
    return OnboardingService.status(db, current_user)


@router.post(
    "/dev-provision-pack",
    summary="[DEV/TEST ONLY] Grant an access pack to one account",
    dependencies=[Depends(require_admin_for_provisioning)],
)
def dev_provision_pack(
    owner_email: str,
    token_count: int = Query(
        10,
        ge=1,
        le=settings.DEV_PROVISION_MAX_TOKENS,
        description=f"Passes in the pack (1..{settings.DEV_PROVISION_MAX_TOKENS})",
    ),
    organization_name: str = "",
    db: Session = Depends(get_db),
):
    """
    Development/test provisioning: grants an access pack OWNED BY the account
    with this exact email and switches that account's entitlement gate on.

    Ownership is per ACCOUNT — the pack is never shared with the owner's
    colleagues. `organization_name`, when supplied, only records the company as
    metadata and never grants anything.

    M-1 HARDENING: disabled in production AND staging (fail-closed allowlist —
    only explicit `development` enables it, so a missing/unset ENVIRONMENT can
    never expose it), token_count is bounded (1..DEV_PROVISION_MAX_TOKENS,
    zero/negative rejected by validation), and in non-development environments
    a valid ADMIN JWT is still required.
    """
    if token_count < 1 or token_count > settings.DEV_PROVISION_MAX_TOKENS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"token_count must be between 1 and {settings.DEV_PROVISION_MAX_TOKENS}."
            ),
        )

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

        org = AccessTokenService.get_or_create_organization(db, organization_name)
        profile = db.query(Profile).filter(Profile.user_id == owner.id).first()
        if profile is not None:
            profile.organization_id = org.id
            db.commit()

    pack = AccessTokenService.provision_pack(
        db, owner, token_count=token_count, source="dev_endpoint"
    )

    return {
        "owner": owner.email,
        "owner_user_id": str(owner.id),
        "pack_id": str(pack.id),
        "token_count": pack.token_count,
        "source": pack.source,
        "pass_validity_days": PASS_UNUSED_VALIDITY_DAYS,
    }
