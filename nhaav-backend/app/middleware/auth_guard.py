import uuid
from datetime import datetime

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import jwt
from jwt import PyJWTError as JWTError

from app.database import get_db
from app.models.user import User, UserRole
from app.config import settings
from app.services.access_token_service import AccessTokenService
from app.services.device_session_service import DeviceSessionService
from app.utils.session_cookies import ACCESS_COOKIE

# OAuth2PasswordBearer tells FastAPI how to extract the token from the Authorization header.
# 'tokenUrl' tells the Swagger UI where to send the login request to get the token.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# The browser client keeps no token in JS: it authenticates with the httpOnly
# session cookie. The Bearer header stays supported for API clients, Swagger and
# the test suite, and WINS when both are present (an explicit credential beats
# an ambient one, which also keeps cookie requests subject to the CSRF check).
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)


def _resolve_token(request: Request, bearer_token: str | None) -> str | None:
    """The credential for this request: Bearer header first, cookie otherwise."""
    if bearer_token:
        return bearer_token
    return request.cookies.get(ACCESS_COOKIE)


def get_current_user_identity(
    request: Request,
    token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
    device_id: str | None = Header(None, alias="X-Device-Id"),
) -> User:
    """
    Identity-only authentication: validates the JWT and resolves the User,
    WITHOUT the company access-entitlement gate.

    Used by endpoints that must work even when the caller's access session has
    ended — /auth/logout (idempotent logout) and /access/status (so the
    dashboard can display "no access tokens remaining").

    The ONE-DEVICE rule still applies here: a session that was taken over by
    another device is refused even for these identity-only endpoints, otherwise
    the displaced device could end the new session with /auth/logout or read the
    account's pass balance.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    raw_token = _resolve_token(request, token)
    if not raw_token:
        raise credentials_exception

    try:
        payload = jwt.decode(
            raw_token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = uuid.UUID(user_id_str)
    except Exception:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    # Admin access tokens are bound to the refresh-session row that created
    # them. Logout/password reset revoke that row, so an already-issued admin
    # JWT stops working immediately instead of surviving until expiry.
    if user.role == UserRole.admin:
        sid = payload.get("sid")
        # Tokens minted by the admin login/refresh flow always carry `sid`, and
        # those are revocable. A legacy/admin-test token without one has no
        # session row to revoke; it is still signature-valid, so keep accepting
        # it rather than breaking existing integrations. Never issue such a
        # token from an application login path.
        if sid:
            from app.models.refresh_session import RefreshSession

            session = (
                db.query(RefreshSession)
                .filter(
                    RefreshSession.jti == sid,
                    RefreshSession.user_id == user.id,
                )
                .first()
            )
            if (
                session is None
                or session.revoked_at is not None
                or session.expires_at <= datetime.utcnow()
            ):
                raise credentials_exception
    # ONE DEVICE PER LOGIN: the account's session belongs to the device that
    # logged in. A request from any other device (or one that does not identify
    # itself, once a device is bound) is a 401, so the displaced device is
    # signed out the moment the session moves. No-op for admins, for accounts
    # with no binding, and for API clients that send no device id at all.
    DeviceSessionService.assert_request_device(user, device_id)
    return user


def get_current_user(
    request: Request,
    token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
    device_id: str | None = Header(None, alias="X-Device-Id"),
    _identity_marker: None = None,
) -> User:
    """
    Full authentication for protected Nhaav functionality: identity (JWT)
    PLUS a valid account access session (within the 6-hour window, not logged
    out) PLUS the request coming from the account's bound device. Lazy expiry
    detection happens here — an expired access token is consumed and the request
    is rejected with 401.
    """
    user = get_current_user_identity(
        request=request, token=token, db=db, device_id=device_id
    )

    # Account access-entitlement gate: a gated account's session must be
    # within its 6-hour window and not logged out. No-op for admins and
    # accounts without a provisioned access pack.
    AccessTokenService.enforce_access_token(db, user)

    return user

def _admin_session_is_live(db: Session, user: User, payload: dict) -> bool:
    """Admin access tokens carrying a sid must still own a live session row."""
    if user.role != UserRole.admin:
        return True
    sid = payload.get("sid")
    if not sid:
        return True
    from app.models.refresh_session import RefreshSession

    session = (
        db.query(RefreshSession)
        .filter(RefreshSession.jti == sid, RefreshSession.user_id == user.id)
        .first()
    )
    return bool(
        session is not None
        and session.revoked_at is None
        and session.expires_at > datetime.utcnow()
    )


def get_optional_user(
    request: Request,
    token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """
    Best-effort authentication for endpoints that are public but behave
    differently for a logged-in owner/admin (e.g. viewing a non-approved listing).
    Returns None when no valid token is supplied instead of raising 401.
    """
    raw_token = _resolve_token(request, token)
    if not raw_token:
        return None
    try:
        payload = jwt.decode(raw_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id_str = payload.get("sub")
        if user_id_str is None:
            return None
        user_id = uuid.UUID(user_id_str)
    except Exception:
        return None
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None or not _admin_session_is_live(db, user, payload):
            return None
        return user
    except Exception:
        return None


def get_current_provider(current_user: User = Depends(get_current_user)) -> User:
    """
    Role-based authorization dependency.
    Requires the user to be fully authenticated AND have the 'provider' role.
    
    Flow:
    1. Runs get_current_user() first to ensure authentication.
    2. Checks if the resulting user's role is 'provider'.
    3. Returns 403 Forbidden if they lack permissions.
    """
    if current_user.role != UserRole.provider:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions. Provider access required."
        )
    return current_user

def get_current_responder(current_user: User = Depends(get_current_user)) -> User:
    """
    Authorization dependency for the shared quotation workflow.
    Allows either a service 'provider' or a 'supplier'. The *request type*
    (service vs supply) is what ultimately decides which one may quote — that
    check lives in the service layer so the guard stays type-agnostic.
    """
    if current_user.role not in (UserRole.provider, UserRole.supplier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions. Provider or supplier access required."
        )
    return current_user


def get_current_client(current_user: User = Depends(get_current_user)) -> User:
    """
    Role-based authorization dependency.
    Requires the user to be fully authenticated AND have the 'client' role.
    
    Flow:
    1. Runs get_current_user() first to ensure authentication.
    2. Checks if the resulting user's role is 'client'.
    3. Returns 403 Forbidden if they lack permissions.
    """
    if current_user.role != UserRole.client:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions. Client access required."
        )
    return current_user
