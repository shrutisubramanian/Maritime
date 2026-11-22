from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
import jwt
from jwt import PyJWTError as JWTError

from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.utils.password import hash_password, verify_password
from app.config import settings

# A bcrypt hash of a password nobody can type. When a sign-in names an address
# that does not exist, this hash is verified anyway so the response takes the
# same time as a wrong password for a real account — otherwise the endpoint is a
# free account-existence oracle (no bcrypt work = an obviously faster 401).
_TIMING_EQUALIZER_HASH = (
    "$2b$12$v9ucPFKKyMOVNQPQ9VYWzOkjKB5aNzgR9zCCpAahLoEOFaGls8Rsa"
)


def _utc_seconds(value: datetime) -> int:
    """Epoch seconds for a datetime that may be naive (assumed UTC) or aware."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.astimezone(timezone.utc).timestamp())


class AuthService:
    """
    AuthService handles the core business logic for user authentication.
    It acts as the bridge between the API routers and the database,
    ensuring that business rules (like unique emails) are enforced.
    """

    @staticmethod
    def get_user_by_email(db: Session, email: str) -> Optional[User]:
        """
        Retrieves a user from the database by their email address.
        Returns None if no user is found.
        """
        return db.query(User).filter(User.email == email).first()

    @staticmethod
    def register_user(db: Session, request: RegisterRequest) -> User:
        """
        Registers a new user in the system.
        
        Steps:
        1. Check if the email is already taken.
        2. Hash the provided plain text password.
        3. Create a new SQLAlchemy User model instance.
        4. Provision the account's Profile row, in the SAME transaction.
        5. Add both to the session and commit.
        6. Refresh to get the generated ID and defaults.

        Every non-admin account owns exactly one profile from the moment it is
        created. The marketplace gate needs an admin to approve that profile
        (app/services/onboarding_service.py), and the admin review queue is fed
        by profiles, so an account without one could never be approved — it
        would sit at "awaiting review" forever. Provisioning here also means the
        profile detail pages (GET/PUT /profiles/me) work on first login instead
        of failing with a 404 the user cannot act on.
        """
        # 1. Check email uniqueness
        existing_user = AuthService.get_user_by_email(db, request.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to complete registration with the details provided."
            )

        # 2. Hash password
        hashed_pwd = hash_password(request.password)

        # 3. Create user. Defense in depth (H-1): the schema already rejects
        # privileged roles; the service NEVER trusts request.role blindly and
        # clamps any privileged value to the safe default.
        from app.models.user import UserRole as _UserRole

        safe_role = (
            request.role
            if request.role in _UserRole
            and request.role != _UserRole.admin
            else _UserRole.client
        )
        new_user = User(
            email=request.email,
            password_hash=hashed_pwd,
            role=safe_role,
            full_name=request.full_name,
            phone=request.phone
        )

        # 4. Save the account and provision its profile in ONE transaction, so
        # an account can never exist without the profile the review queue and
        # the onboarding gate both depend on.
        try:
            from app.models.profile import Profile as _Profile

            db.add(new_user)
            db.flush()  # assigns new_user.id without ending the transaction
            db.add(
                _Profile(
                    user_id=new_user.id,
                    company_name=(request.company or None),
                    position=(request.designation or None),
                    # Fields left at their model defaults: verification_status is
                    # `pending`, which is exactly the review state an account
                    # starts in.
                )
            )
            db.commit()
            db.refresh(new_user)
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="A database error occurred during registration."
            )

        # 5. Email the verification link. A delivery failure is deliberately NOT
        # swallowed here: the router converts it into a 503 so the client learns
        # the email did not go out, instead of being told to check an inbox that
        # will never receive anything. The account row stays committed and
        # unverified, so the user retries through resend-verification rather than
        # registering a second time.
        AuthService.send_verification_email(new_user.email)

        # 6. Return User object
        return new_user

    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """
        Generates a JWT access token encoding user identity and permissions.
        
        The payload contains:
        - sub: Subject identifier (user ID)
        - email: User's email
        - role: User's role for authorization
        - exp: Expiration timestamp
        - jti: Unique token id

        ``jti`` makes every issued token distinct. Without it the token is a plain
        HMAC over its claims, so two tokens minted for the same account inside the
        same second are byte-identical — a refresh would hand back the very string
        it was given, and individual tokens could not be told apart in an audit.
        """
        to_encode = data.copy()
        to_encode.update({"jti": uuid.uuid4().hex})

        # Determine token expiration time
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
            
        to_encode.update({"exp": expire})
        
        # Sign the token with the secret key using the configured algorithm
        encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        
        return encoded_jwt

    @staticmethod
    def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """
        Generates a JWT refresh token with a longer expiration time.

        ``jti`` for the same reason as the access token: each issued refresh
        token must be distinguishable from the one it replaces.
        """
        now = datetime.utcnow()
        to_encode = data.copy()
        # `iat` is a security claim, not decoration: a password reset compares it
        # against the account's password_reset_at, so a refresh token minted
        # BEFORE the reset can never be exchanged for fresh credentials.
        to_encode.update({"type": "refresh", "jti": uuid.uuid4().hex, "iat": now})

        if expires_delta:
            expire = now + expires_delta
        else:
            expire = now + timedelta(days=7) # Default 7 days
            
        to_encode.update({"exp": expire})
        
        encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        return encoded_jwt

    @staticmethod
    def register_refresh_session(db: Session, user_id, refresh_token: str) -> None:
        """Record a freshly minted refresh token so it can be rotated/revoked.

        The row is keyed by the token's own `jti`; without it a refresh token is
        bearer-until-expiry and logout cannot take it back.
        """
        from app.services.refresh_session_service import RefreshSessionService

        try:
            payload = jwt.decode(
                refresh_token,
                settings.JWT_SECRET,
                algorithms=[settings.JWT_ALGORITHM],
            )
        except JWTError:  # pragma: no cover - the token was just minted here
            return
        exp = payload.get("exp")
        expires_at = datetime.utcfromtimestamp(exp) if isinstance(exp, (int, float)) else None
        RefreshSessionService.register(db, user_id, payload["jti"], expires_at)

    @staticmethod
    def generate_verification_token(email: str) -> str:
        """
        Generates a token for email verification.

        ``jti`` makes each issued link unique. Without it, two links minted for
        the same address inside the same second are byte-identical (the JWT is a
        plain HMAC over its claims), so a re-sent link would be impossible to
        tell apart from — or supersede — the previous one.
        """
        now = datetime.utcnow()
        to_encode = {
            "email": email,
            "type": "verify_email",
            "jti": uuid.uuid4().hex,
            "exp": now + timedelta(hours=24),
        }
        return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    # ------------------------------------------------------- email delivery
    @staticmethod
    def build_verification_url(token: str) -> str:
        """
        Public frontend URL the verification email links to.

        Delegates to the email composer: the frontend redirects
        ``/login?verify_token=…`` to ``/verify-email``, so that shape is a
        contract shared with the frontend and is defined in exactly one place.
        """
        from app.services.email_service import EmailService

        return EmailService.verification_link(token)

    @staticmethod
    def build_password_reset_url(token: str) -> str:
        """Public frontend URL the password reset email links to."""
        from app.services.email_service import EmailService

        return EmailService.password_reset_link(token)

    @staticmethod
    def send_verification_email(email: str) -> bool:
        """Mint a fresh verification token and email the confirmation link."""
        from app.services.email_service import EmailService

        token = AuthService.generate_verification_token(email)
        return EmailService.send_verification_email(email, token)

    @staticmethod
    def send_password_reset_email(email: str) -> bool:
        """Mint a fresh reset token and email the password reset link."""
        from app.services.email_service import EmailService

        token = AuthService.generate_password_reset_token(email)
        return EmailService.send_password_reset_email(email, token)

    @staticmethod
    def generate_password_reset_token(email: str) -> str:
        """
        Generates a token for password reset.

        ``iat`` is part of the contract, not decoration: the reset handler
        compares it against the account's ``password_reset_at`` so a link can
        only be spent once and a newly issued link invalidates an older one.
        """
        now = datetime.utcnow()
        to_encode = {
            "email": email,
            "type": "reset_password",
            "jti": uuid.uuid4().hex,
            "iat": now,
            "exp": now + timedelta(hours=1),
        }
        return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    @staticmethod
    def login_user(
        db: Session,
        request: LoginRequest,
        access_expires_minutes: int | None = None,
    ) -> TokenResponse:
        """
        Authenticates a user and generates an access token.
        
        Steps:
        1. Find user by email.
        2. Verify the plain text password against the stored hash.
        3. Update the last_login timestamp.
        4. Generate a JWT token containing identity and role.
        5. Return the TokenResponse.
        """
        # 1. Find user by email
        user = AuthService.get_user_by_email(db, request.email)
        if not user:
            # Spend the same bcrypt time as a real password check (see
            # _TIMING_EQUALIZER_HASH) so an unknown address is not faster.
            verify_password(request.password, _TIMING_EQUALIZER_HASH)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 2. Verify password
        if not verify_password(request.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 3. Update last_login timestamp
        user.last_login = datetime.utcnow()
        db.commit()

        # 3a. ONE DEVICE PER LOGIN. Claim the account's session for the device
        # making this request. A second device is refused with a 409
        # "device_conflict" challenge (unless the human already confirmed the
        # switch) BEFORE any pass is touched, so a refused login can never burn
        # or take over an entitlement. Raises nothing when the caller sends no
        # device id — non-browser clients are unaffected.
        from app.services.device_session_service import DeviceSessionService

        device_session = DeviceSessionService.claim(
            db,
            user,
            device_id=request.device_id,
            device_label=request.device_label,
            force=request.force_device_switch,
        )

        # 3b. Account access-entitlement gate: allocate one access pass for
        # this account's session. Invalid credentials never reach this line, so
        # passes are never consumed by failed logins. Raises 403 with a clear
        # message when the account has no unused passes left.
        #
        # Switching devices deliberately does NOT consume an extra pass: the
        # account's live pass is simply reused by the new device, so its
        # 6-hour clock keeps running (the pass is the session, not the device).
        from app.services.access_token_service import AccessTokenService

        access_session = AccessTokenService.allocate_for_login(db, user)
        # A gated organization without a live subscription still AUTHENTICATES
        # (so it can renew) but receives NO access pass: protected endpoints
        # keep rejecting it until a subscription is active again. The reason is
        # surfaced so the client can route the user to the renewal flow.
        access_blocked = None
        if access_session is None:
            access_blocked = AccessTokenService.access_blocked_message(db, user)

        # 4. Generate JWT token
        # Converting UUID to string for the 'sub' claim
        # The refresh token's jti is the server-side session id. Binding the
        # access token to it lets admin logout/reset revoke an already-issued
        # access JWT immediately (normal user accounts keep their existing
        # access-pass lifecycle).
        refresh_token = AuthService.create_refresh_token(data={"sub": str(user.id)})
        refresh_payload = jwt.decode(
            refresh_token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        token_payload = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "sid": refresh_payload["jti"],
        }
        expires = (
            timedelta(minutes=access_expires_minutes)
            if access_expires_minutes is not None
            else None
        )
        access_token = AuthService.create_access_token(
            data=token_payload, expires_delta=expires
        )
        # Record the refresh token so it can be rotated once and revoked later.
        AuthService.register_refresh_session(db, user.id, refresh_token)

        # 5. Return TokenResponse
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            access_session=access_session,
            access_blocked=access_blocked,
            user=UserResponse.model_validate(user),
            device_session=device_session,
        )

    @staticmethod
    def refresh_access_token(db: Session, refresh_token: str) -> TokenResponse:
        """Validates refresh token and issues new access and refresh tokens."""
        try:
            payload = jwt.decode(refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            if payload.get("type") != "refresh":
                raise HTTPException(status_code=401, detail="Invalid token type")
                
            user_id_str = payload.get("sub")
            if not user_id_str:
                raise HTTPException(status_code=401, detail="Invalid token payload")
                
            user_id = uuid.UUID(user_id_str)
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise HTTPException(status_code=401, detail="User not found")

            # A password reset ends every older session: a refresh token minted
            # before the reset must not be exchangeable for a working access
            # token, otherwise an attacker holding a stolen token keeps access
            # after the victim changes their password.
            last_reset = getattr(user, "password_reset_at", None)
            if last_reset is not None:
                issued_at = payload.get("iat")
                if issued_at is None:
                    raise HTTPException(status_code=401, detail="Invalid refresh token")
                issued_seconds = (
                    _utc_seconds(issued_at)
                    if isinstance(issued_at, datetime)
                    else int(issued_at)
                )
                if issued_seconds <= _utc_seconds(last_reset):
                    raise HTTPException(
                        status_code=401,
                        detail="This session has ended. Please sign in again.",
                    )

            # SINGLE USE: the presented refresh token must be live and is spent
            # by this exchange. A replay of an already-spent token revokes every
            # session the account holds (see RefreshSessionService.consume).
            from app.services.refresh_session_service import RefreshSessionService

            old_jti = payload.get("jti")
            if not old_jti:
                raise HTTPException(status_code=401, detail="Invalid refresh token")
            consumed = RefreshSessionService.consume(db, user.id, old_jti)

            new_refresh = AuthService.create_refresh_token(data={"sub": str(user.id)})
            new_payload = jwt.decode(
                new_refresh,
                settings.JWT_SECRET,
                algorithms=[settings.JWT_ALGORITHM],
            )
            token_payload = {
                "sub": str(user.id),
                "email": user.email,
                "role": user.role.value,
                "sid": new_payload["jti"],
            }
            expires = (
                timedelta(minutes=settings.ADMIN_JWT_EXPIRE_MINUTES)
                if user.role.value == "admin"
                else None
            )
            new_access = AuthService.create_access_token(
                data=token_payload, expires_delta=expires
            )

            # Link the spent row to its successor and record the successor.
            RefreshSessionService.rotate(db, consumed, new_payload["jti"])
            AuthService.register_refresh_session(db, user.id, new_refresh)

            return TokenResponse(access_token=new_access, refresh_token=new_refresh)
            
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

    @staticmethod
    def verify_email_token(db: Session, token: str) -> bool:
        """Verifies the email verification token and updates the user."""
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            if payload.get("type") != "verify_email":
                return False
                
            email = payload.get("email")
            user = AuthService.get_user_by_email(db, email)
            if user and not user.is_verified:
                user.is_verified = True
                db.commit()
                return True
            return False
        except JWTError:
            return False

    @staticmethod
    def reset_password(db: Session, token: str, new_password: str) -> bool:
        """
        Verifies the reset token and updates the user's password.

        A reset link is SINGLE USE. On success the account records
        ``password_reset_at``; any token issued at or before that moment is
        refused, which both blocks replaying a spent link and makes a newer link
        supersede an older one. Comparisons are at whole-second granularity
        because a JWT ``iat`` has no sub-second precision — hence ``<=`` rather
        than ``<``, so a same-second replay is still rejected.
        """
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            if payload.get("type") != "reset_password":
                return False

            email = payload.get("email")
            user = AuthService.get_user_by_email(db, email)
            if not user:
                return False

            last_reset = user.password_reset_at
            if last_reset is not None:
                issued_at = payload.get("iat")
                if issued_at is None:
                    # Unverifiable freshness on an account that has already
                    # reset: refuse rather than accept a possibly spent link.
                    return False
                if isinstance(issued_at, datetime):
                    issued_at = _utc_seconds(issued_at)
                else:
                    issued_at = int(issued_at)
                if issued_at <= _utc_seconds(last_reset):
                    return False

            AuthService.apply_new_password(db, user, new_password)
            return True
        except (JWTError, ValueError, TypeError):
            return False

    @staticmethod
    def apply_new_password(db: Session, user: User, new_password: str) -> None:
        """Store a new password and end every existing session.

        Shared by the emailed-LINK reset and the emailed-CODE reset so both
        leave the account in exactly the same state: the old credentials stop
        working everywhere the moment the new password is set.
        """
        user.password_hash = hash_password(new_password)
        user.password_reset_at = datetime.utcnow()
        db.commit()

        # END EVERY EXISTING SESSION. The reset is only meaningful if the
        # credentials it replaced stop working: the live access pass is
        # consumed (so the old JWT is refused by get_current_user) and the
        # device binding is released (so the next sign-in is a normal one, not
        # a "switch devices?" conflict). Any refresh token minted earlier is
        # refused by the iat check in refresh_access_token.
        try:
            from app.services.access_token_service import AccessTokenService
            from app.services.device_session_service import DeviceSessionService
            from app.services.refresh_session_service import RefreshSessionService

            AccessTokenService.consume_for_logout(db, user)
            DeviceSessionService.release(db, user)
            # A reset ends every refresh token too, not just the live pass.
            RefreshSessionService.revoke_all(db, user.id, reason="password_reset")
        except Exception:  # pragma: no cover - never fail the reset itself
            import logging

            logging.getLogger(__name__).warning(
                "Password reset succeeded but existing sessions could not be "
                "cleared; they will still expire on their own schedule."
            )

    @staticmethod
    def reset_password_with_code(
        db: Session, email: str, code: str, new_password: str
    ) -> bool:
        """Redeem an emailed code and set the new password.

        False for an unknown address, a wrong code, an expired code and a code
        that already ran out of attempts — the caller reports one message for
        all of them, so this endpoint is not an account-existence oracle.
        """
        from app.services.password_reset_code_service import PasswordResetCodeService

        user = AuthService.get_user_by_email(db, email)
        if not user:
            return False
        if not PasswordResetCodeService.verify_and_consume(db, user, code):
            return False
        AuthService.apply_new_password(db, user, new_password)
        return True
