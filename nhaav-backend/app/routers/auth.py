import logging

from fastapi import HTTPException, Header, Request, Response
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse, UserResponse,
    RefreshTokenRequest, ForgotPasswordRequest, ResetPasswordRequest,
    ResetPasswordWithCodeRequest, VerifyEmailRequest
)
from app.services.auth_service import AuthService
from app.services.email_service import EmailConfigurationError, EmailDeliveryError
from app.services.rate_limit_service import RateLimitService, client_ip
from app.middleware.auth_guard import get_current_user, get_current_user_identity
from app.services.refresh_session_service import RefreshSessionService
from app.utils.session_cookies import (
    REFRESH_COOKIE,
    clear_session_cookies,
    set_session_cookies,
)

logger = logging.getLogger(__name__)

# Create the router with a standard prefix and grouping tag for OpenAPI docs.
router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, 
             summary="Register a new user", response_description="The newly created user profile.",
             dependencies=[Depends(RateLimitService.rate_limit_identity("register"))])
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user to the platform.
    
    **Request Flow**:
    1. Client sends a JSON body matching `RegisterRequest`.
    2. FastAPI validates the JSON automatically.
    3. The `get_db` dependency injects a fresh database session.
    4. We pass the request and session to the `AuthService` to handle business logic.
    5. A new `User` is returned and automatically serialized into `UserResponse` (hiding the password).
    
    **Database Lifecycle**: The session is opened when the request hits, used by `AuthService`, 
    and closed automatically by FastAPI when the response is sent.

    Email delivery: the verification email is sent as part of registration. If it
    cannot be delivered the account has still been created (and is left
    unverified), so the API answers **503** — telling the truth that no email went
    out — and the user retries through `resend-verification` instead of being told
    to check an inbox that will never receive anything.
    """
    try:
        new_user = AuthService.register_user(db=db, request=request)
    except EmailConfigurationError:
        logger.error(
            "Registration succeeded but the verification email could not be sent: "
            "the email backend is not configured."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Your account was created, but we could not send the verification "
                "email because email delivery is not configured. Please try "
                "\"Resend verification\" shortly."
            ),
        )
    except EmailDeliveryError:
        logger.error(
            "Registration succeeded but the verification email failed to send."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Your account was created, but we could not send the verification "
                "email. Please use \"Resend verification\" to try again."
            ),
        )
    return new_user


@router.post("/login", response_model=TokenResponse, summary="Login and receive a JWT token")
def login(
    request: LoginRequest,
    http_request: Request,
    response: Response,
    db: Session = Depends(get_db),
    device_id_header: str | None = Header(None, alias="X-Device-Id"),
    device_label_header: str | None = Header(None, alias="X-Device-Label"),
):
    """
    Authenticate a user and return an access token.
    
    **Request Flow**:
    1. Client provides email and password.
    2. The `AuthService` verifies credentials against the database.
    3. If valid, a JWT token is signed and returned.

    Rate limiting (M-3): FAILED attempts are counted per client IP AND per
    attempted email, so a brute-force run on one mailbox cannot rotate IPs to
    evade, and one IP cannot spray many mailboxes invisibly. Successful logins
    are never counted — legitimate users (including every test/user on a
    shared NAT) cannot lock themselves out. Nothing raw is stored.

    ONE DEVICE PER LOGIN: the caller identifies its device either in the body
    (`device_id` / `device_label`) or with the `X-Device-Id` / `X-Device-Label`
    headers — the body wins when both are present. If another device already
    holds this account's session the login is refused with **409**
    `device_conflict`, and the client must ask the user whether to switch; the
    retry sets `force_device_switch`, which hands the session over and signs the
    other device out. A device conflict is NOT a failed credential check and is
    deliberately not counted by the rate limiter, so confirming a legitimate
    switch can never lock an account out.
    """
    request.device_id = request.device_id or device_id_header
    request.device_label = request.device_label or device_label_header

    # Per-IP budget: EVERY attempt counts, successful or not. Counting only
    # failures let a credential-stuffing run spend unlimited guesses as long as
    # it interleaved one working login.
    RateLimitService.check_auth_rate_limit(
        db, "auth_login_ip", client_ip(http_request)
    )
    try:
        token_response = AuthService.login_user(db=db, request=request)
    except HTTPException as exc:
        # Per-ACCOUNT failure budget. Only a rejected credential is charged, so
        # the owner typing the right password is never locked out; a 409 device
        # conflict or a 403 pass exhaustion is not a failed guess and is not
        # counted.
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            RateLimitService.check_auth_rate_limit(
                db, "auth_login_failed_email", request.email
            )
        raise
    # The browser is signed in by COOKIE (httpOnly); the token is still in the
    # body for non-browser clients and tests.
    set_session_cookies(
        response, token_response.access_token, token_response.refresh_token
    )
    # Browser clients use the httpOnly cookies. Returning the same credentials
    # in JSON would let any XSS read them, defeating the cookie design. API
    # clients opt in explicitly through configuration.
    if not settings.EXPOSE_SESSION_TOKENS:
        token_response.access_token = None
        token_response.refresh_token = None
    return token_response


@router.get("/me", response_model=UserResponse, summary="Get current logged-in user")
def get_me(current_user: User = Depends(get_current_user)):
    """
    Retrieve the profile of the currently authenticated user.
    
    **Dependency Injection Flow**:
    1. The client sends an `Authorization: Bearer <token>` header.
    2. `Depends(get_current_user)` intercepts the request.
    3. It extracts the token, decodes it, and queries the database for the user.
    4. The verified `User` object is injected into this route handler as `current_user`.
    5. The route simply returns the user object, which Pydantic converts to `UserResponse`.
    """
    return current_user

@router.post("/logout", status_code=status.HTTP_200_OK, summary="Logout and end the Nhaav access session")
def logout(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    """
    Ends the caller's Nhaav session.

    Marks the account's ACTIVE access token CONSUMED (it can never be
    reused), records consumed_at, and is idempotent — calling it again (or with
    no active session) succeeds without effect.

    Identity remains the stateless JWT's responsibility; it stays technically
    valid until expiry but no longer grants a gated account's session
    (enforced by get_current_user on every protected request).

    The device binding is released too, so the account may log in from any
    device next time without meeting the "switch devices?" challenge — logging
    out IS the way to move devices deliberately.
    """
    from app.services.access_token_service import AccessTokenService
    from app.services.device_session_service import DeviceSessionService

    consumed = AccessTokenService.consume_for_logout(db, current_user)
    DeviceSessionService.release(db, current_user)
    # Revoke every refresh token this account holds, then drop the cookies: a
    # copy of the refresh token taken earlier can no longer be exchanged.
    RefreshSessionService.revoke_all(db, current_user.id, reason="logout")
    clear_session_cookies(response)
    return {"message": "Logged out." if consumed else "Already logged out.", "session_ended": consumed}


@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token")
def refresh_token(
    request: RefreshTokenRequest,
    http_request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Exchanges a valid refresh token for a new access token and refresh token.

    Rate limited per source network: a refresh token cannot be guessed (it is
    HMAC-signed), so the budget exists to bound flood/CPU abuse, not guessing.
    """
    RateLimitService.check_auth_rate_limit(
        db, "auth_refresh_ip", client_ip(http_request)
    )
    # A browser has no copy of the refresh token (httpOnly cookie); an API
    # client sends it in the body. An explicit body value wins.
    refresh_token = request.refresh_token or http_request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    tokens = AuthService.refresh_access_token(db=db, refresh_token=refresh_token)
    set_session_cookies(response, tokens.access_token, tokens.refresh_token)
    if not settings.EXPOSE_SESSION_TOKENS:
        tokens.access_token = None
        tokens.refresh_token = None
    return tokens

@router.post("/forgot-password", status_code=status.HTTP_200_OK, summary="Request password reset")
def forgot_password(request: ForgotPasswordRequest, http_request: Request, db: Session = Depends(get_db)):
    """
    Initiates the password reset flow by emailing a single-use reset link.

    Rate limited per email (and coarsely per IP) so one mailbox cannot be
    flooded with reset mails (M-3). The always-success response is preserved —
    no email enumeration.
    """
    # Per-account then per-network. Both count BEFORE any existence check, so
    # the limiter cannot become an account-enumeration oracle (an existing and a
    # nonexistent mailbox get the same 200 / same 429 shape).
    RateLimitService.check_auth_rate_limit(db, "auth_forgot_email", request.email)
    RateLimitService.check_auth_rate_limit(db, "auth_forgot_ip", client_ip(http_request))
    user = AuthService.get_user_by_email(db, request.email)
    if user:
        try:
            AuthService.send_password_reset_email(user.email)
        except (EmailDeliveryError, EmailConfigurationError) as exc:
            # Swallowed on purpose. This endpoint answers identically whether or
            # not the address exists, so surfacing a delivery failure here would
            # turn it into an account-enumeration oracle. Operators still get the
            # signal in the logs (no address, no token).
            logger.error(
                "Password reset email was not delivered (%s).",
                type(exc).__name__,
            )
    # Always return success to prevent email enumeration
    return {"message": "If that email exists, a password reset link has been sent."}

@router.post("/forgot-password/code", status_code=status.HTTP_200_OK, summary="Email a 6-digit password reset code")
def forgot_password_code(
    request: ForgotPasswordRequest, http_request: Request, db: Session = Depends(get_db)
):
    """
    Emails a randomly generated 6-digit reset code to the account's address.

    The user then enters that code together with the new password on
    `/auth/reset-password/code`. Rate limited per email and per network, and the
    answer is identical for a known and an unknown address, so this can never
    be used to discover whether an account exists.
    """
    from app.services.email_service import EmailService
    from app.services.password_reset_code_service import PasswordResetCodeService

    RateLimitService.check_auth_rate_limit(db, "auth_forgot_email", request.email)
    RateLimitService.check_auth_rate_limit(db, "auth_forgot_ip", client_ip(http_request))

    user = AuthService.get_user_by_email(db, request.email)
    if user:
        code = PasswordResetCodeService.issue(db, user)
        try:
            EmailService.send_password_reset_code(user.email, code)
        except (EmailDeliveryError, EmailConfigurationError) as exc:
            # Same anti-enumeration rule as the link flow: report the failure to
            # operators only. The code stays valid, so a resend works once the
            # mailbox is reachable.
            logger.error(
                "Password reset code email was not delivered (%s).",
                type(exc).__name__,
            )
    return {
        "message": "If that email exists, a reset code has been sent.",
        "code_ttl_minutes": PasswordResetCodeService.CODE_TTL_MINUTES,
    }


@router.post("/reset-password/code", status_code=status.HTTP_200_OK, summary="Reset password using an emailed code")
def reset_password_code(
    request: ResetPasswordWithCodeRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    """
    Sets the new password when the emailed code matches.

    A wrong code, an expired code, a code out of attempts and an unknown address
    all produce the same 400, so guessing cannot be turned into an account
    oracle. On success every existing session is ended (same contract as the
    link flow).
    """
    RateLimitService.check_auth_rate_limit(
        db, "auth_reset_ip", client_ip(http_request)
    )
    success = AuthService.reset_password_with_code(
        db=db,
        email=request.email,
        code=request.code,
        new_password=request.new_password,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "That reset code is invalid or has expired. Request a new code "
                "and try again."
            ),
        )
    return {"message": "Password has been successfully reset."}


@router.post("/reset-password", status_code=status.HTTP_200_OK, summary="Reset password using token")
def reset_password(
    request: ResetPasswordRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    """
    Resets the user's password using the token received via email.

    Rate limited per source network (M-3): redemption is unauthenticated, so a
    flood is charged to the caller's network.
    """
    RateLimitService.check_auth_rate_limit(
        db, "auth_reset_ip", client_ip(http_request)
    )
    success = AuthService.reset_password(db=db, token=request.token, new_password=request.new_password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token."
        )
    return {"message": "Password has been successfully reset."}

@router.post("/verify-email", status_code=status.HTTP_200_OK, summary="Verify user email")
def verify_email(
    request: VerifyEmailRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    """
    Verifies the user's email address using the token received via email.

    Rate limited per source network (M-3): redemption is unauthenticated.
    """
    RateLimitService.check_auth_rate_limit(
        db, "auth_verify_ip", client_ip(http_request)
    )
    success = AuthService.verify_email_token(db=db, token=request.token)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token."
        )
    return {"message": "Email has been successfully verified."}

@router.post("/resend-verification", status_code=status.HTTP_200_OK, summary="Resend verification email")
def resend_verification(request: ForgotPasswordRequest, http_request: Request, db: Session = Depends(get_db)):
    """
    Resends the email verification link.

    Rate limited per email (M-3) — same anti-flooding rationale as reset.
    """
    RateLimitService.check_auth_rate_limit(db, "auth_resend_email", request.email)
    RateLimitService.check_auth_rate_limit(db, "auth_resend_ip", client_ip(http_request))
    user = AuthService.get_user_by_email(db, request.email)
    if user and not user.is_verified:
        try:
            AuthService.send_verification_email(user.email)
        except (EmailDeliveryError, EmailConfigurationError) as exc:
            # Same anti-enumeration rule as forgot-password: the response is
            # identical for an unknown address, a verified account and a failed
            # send. Logged for operators, never returned.
            logger.error(
                "Verification email was not delivered (%s).",
                type(exc).__name__,
            )
    return {"message": "If that email exists and is unverified, a new verification link has been sent."}
