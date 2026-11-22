"""
Admin authentication endpoints.

The admin UI (frontend `services/adminAuth.ts`) expects a separate admin session
at `/admin/auth/*`, storing its token under a distinct key so it never mixes with
user sessions. This router fills that contract using the existing `User` table
and `UserRole.admin` — it does not introduce a second credential store or change
the core user auth flow.

SIGN-IN IDENTITY: the console takes a USERNAME + password (`AdminLoginRequest`),
not an email address. The username resolves to the one admin `users` row, which
still carries an `email` internally because that column is the account's primary
key for the rest of the auth stack. `email` remains an accepted request field so
seeded tooling and older API clients keep working.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.user import User, UserRole
from app.schemas.auth import AdminLoginRequest, LoginRequest
from app.services.auth_service import AuthService
from app.services.rate_limit_service import RateLimitService, client_ip
from app.services.refresh_session_service import RefreshSessionService
from app.utils.session_cookies import clear_session_cookies, set_session_cookies

router = APIRouter(prefix="/admin/auth", tags=["Admin Auth"])


def _admin_public(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "username": user.username,
        "name": user.full_name or user.username or user.email,
    }


@router.post("/login", summary="Admin login")
def admin_login(
    data: AdminLoginRequest,
    http_request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    # Stricter budgets than user login: the admin surface is a high-value
    # brute-force target. EVERY attempt counts against the source network, and
    # every rejected credential counts against the attempted account.
    RateLimitService.check_auth_rate_limit(
        db, "auth_admin_login_ip", client_ip(http_request)
    )

    # The console signs in with a USERNAME; `email` is still accepted for API
    # clients and seed tooling. Either way the identifier must resolve to one
    # admin row before any token is issued. The rate-limit key is whatever the
    # caller actually typed, so a sprayed username is throttled like an email.
    identifier = data.username or str(data.email)
    if data.username:
        existing = db.query(User).filter(User.username == data.username).first()
    else:
        existing = AuthService.get_user_by_email(db, str(data.email))

    if not existing or existing.role != UserRole.admin:
        RateLimitService.check_auth_rate_limit(
            db, "auth_admin_login_failed_email", identifier
        )
        # Same shape/message as a failed login so admin accounts are not enumerable.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # The account's stored email is only the internal identifier the shared
        # login path looks up — the human never typed it, so it is handed over
        # without re-running EmailStr validation (LoginRequest requires one).
        login_request = LoginRequest.model_construct(
            email=existing.email,
            password=data.password,
            device_id=data.device_id,
            device_label=data.device_label,
            force_device_switch=data.force_device_switch,
        )
        tokens = AuthService.login_user(
            db,
            login_request,
            access_expires_minutes=settings.ADMIN_JWT_EXPIRE_MINUTES,
        )
    except HTTPException as exc:
        # A valid admin account with the wrong password is a failed guess too.
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            RateLimitService.check_auth_rate_limit(
                db, "auth_admin_login_failed_email", identifier
            )
        raise
    db.refresh(existing)
    # Same httpOnly session cookie as the user app: the admin console performs
    # no token handling in JS. Browser responses never include the token.
    set_session_cookies(response, tokens.access_token, tokens.refresh_token)
    body = {"user": _admin_public(existing)}
    if settings.EXPOSE_SESSION_TOKENS:
        body["access_token"] = tokens.access_token
    return body


@router.post("/logout", summary="End the admin session")
def admin_logout(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke the admin's refresh tokens and clear the session cookie.

    Idempotent: a request with no live session still succeeds locally.
    """
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    RefreshSessionService.revoke_all(db, current_user.id, reason="logout")
    clear_session_cookies(response)
    return {"message": "Logged out."}


@router.get("/me", summary="Current admin")
def admin_me(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return _admin_public(current_user)
