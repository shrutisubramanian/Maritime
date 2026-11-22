"""
Database-backed rate limiting (M-3).

Two scopes, one table:

* USER-scoped categories (the restored H10 contract): the JWT identity is the
  bucket. The dependency authenticates via get_current_user, so anonymous
  callers get 401 exactly as before and admins keep their separate path.
* IDENTITY-scoped categories (new for auth/payment protection): keyed by a
  hashed identifier — the submitted email for auth flows, or the client IP
  from request.client.host (trusted-proxy logic left to the deployment's
  proxy; no X-Forwarded-For trust by default). Nothing raw is stored.

429 + Retry-After + {"detail": {code, category, message}} on exceed.
"""
import hashlib
import ipaddress
import uuid as _uuid
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.middleware.auth_guard import get_optional_user
from app.models.rate_limit_event import RateLimitEvent


def _hash_identity(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()


def subject_uuid(subject: str) -> _uuid.UUID:
    """Deterministic, opaque counter key for an auth subject.

    The same mailbox/IP normalizes to the same UUID (trim + lowercase), so
    counters survive case differences in the submitted address, but the stored
    value is a UUID rather than the address itself — a database dump never
    contains raw emails or client IPs.
    """
    digest = hashlib.sha256((subject or "").strip().lower().encode("utf-8")).digest()
    return _uuid.UUID(bytes=digest[:16], version=4)


def client_ip(request) -> str:
    """Source IP used for the per-IP budgets.

    Behind a trusted proxy the platform edge overwrites ``X-Real-IP`` (or the
    first ``X-Forwarded-For`` hop is the real peer), so that is the identity a
    rate limit must key on; using the socket peer there would bucket every user
    from every country into the proxy's single IP and let one attacker lock
    everyone out.

    When ``TRUST_PROXY_HEADERS`` is false the API is exposed directly and both
    headers are attacker-controlled — they are ignored entirely, otherwise
    rotating ``X-Forwarded-For`` would bypass the limit.
    """
    headers = getattr(request, "headers", None) or {}
    peer = None
    client = getattr(request, "client", None)
    if client is not None:
        peer = getattr(client, "host", None)

    if getattr(settings, "TRUST_PROXY_HEADERS", False):
        trusted = True
        if settings.TRUSTED_PROXIES and peer not in (None, "unknown"):
            try:
                peer_ip = ipaddress.ip_address(peer)
                trusted = any(
                    peer_ip in ipaddress.ip_network(cidr, strict=False)
                    for cidr in settings.TRUSTED_PROXIES
                )
            except ValueError:
                trusted = False

        if trusted:
            for header in ("x-real-ip", "x-forwarded-for"):
                value = headers.get(header)
                if not value or not str(value).strip():
                    continue
                candidate = str(value).split(",")[0].strip()
                try:
                    return str(ipaddress.ip_address(candidate))
                except ValueError:
                    continue

    return peer or "unknown"


def _now() -> datetime:
    return datetime.utcnow()


class RateLimitService:
    # category -> (limit, message, identity_kind)
    # identity_kind: "user" | "email" | "ip"
    _CATEGORIES: dict[str, tuple[int, str, str]] = {}

    @classmethod
    def _categories(cls) -> dict[str, tuple[int, str, str]]:
        if not cls._CATEGORIES:
            cls._CATEGORIES = {
                # -------- user-scoped (restored H10 contract) --------
                "vendor_search": (
                    settings.VENDOR_SEARCH_LIMIT,
                    "Vendor search limit reached. Please try again later.",
                    "user",
                ),
                "port_search": (
                    settings.PORT_SEARCH_LIMIT,
                    "Port search limit reached. Please try again later.",
                    "user",
                ),
                "vendor_detail": (
                    settings.VENDOR_DETAIL_LIMIT,
                    "Vendor detail limit reached. Please try again later.",
                    "user",
                ),
                "download": (
                    settings.DATA_DOWNLOAD_LIMIT,
                    "Download limit reached. Please try again later.",
                    "user",
                ),
                "profile_upload": (
                    settings.PROFILE_UPLOAD_LIMIT,
                    "Too many profile uploads. Please try again later.",
                    "user",
                ),
                "profile_import": (
                    settings.PROFILE_IMPORT_LIMIT,
                    "Too many Excel imports. Please try again later.",
                    "user",
                ),
                "profile_import_validate": (
                    settings.PROFILE_IMPORT_VALIDATE_LIMIT,
                    "Too many import checks. Please try again later.",
                    "user",
                ),
                # -------- identity-scoped (auth/payment protection) --------
                "auth_login": (
                    settings.AUTH_LOGIN_LIMIT,
                    "Too many login attempts. Please try again later.",
                    "ip",
                ),
                "admin_login": (
                    settings.ADMIN_LOGIN_LIMIT,
                    "Too many admin login attempts. Please try again later.",
                    "ip",
                ),
                "register": (
                    settings.REGISTER_LIMIT,
                    "Too many registration attempts. Please try again later.",
                    "ip",
                ),
                "password_reset": (
                    settings.PASSWORD_RESET_LIMIT,
                    "Too many password reset requests. Please try again later.",
                    "email",
                ),
                "verification_resend": (
                    settings.VERIFICATION_RESEND_LIMIT,
                    "Too many verification emails requested. Please try again later.",
                    "email",
                ),
                "support_ticket": (
                    settings.SUPPORT_TICKET_LIMIT,
                    "Too many support requests. Please try again later.",
                    "ip",
                ),
                "public_search": (
                    settings.PUBLIC_SEARCH_LIMIT,
                    "Search limit reached. Please try again later.",
                    "ip",
                ),
                "payment_submit": (
                    settings.PAYMENT_SUBMIT_LIMIT,
                    "Too many payment submissions. Please try again later.",
                    "user",
                ),
                "document_upload": (
                    settings.DOCUMENT_UPLOAD_LIMIT,
                    "Too many document uploads. Please try again later.",
                    "user",
                ),
                "payment_receipt_upload": (
                    settings.PAYMENT_RECEIPT_UPLOAD_LIMIT,
                    "Too many payment receipt uploads. Please try again later.",
                    "user",
                ),
                "global_api": (
                    settings.GLOBAL_API_LIMIT,
                    "Too many requests. Please try again later.",
                    "user",
                ),
            }
        return cls._CATEGORIES

    # ------------------------------------------------ auth surface budgets
    # Split budgets for the authentication endpoints. Each entry is
    # (limit, message) read from Settings so an operator can tune them; the
    # category name is used verbatim in the 429 payload so the client can tell
    # a per-account lockout from a per-IP one.
    @classmethod
    def _auth_categories(cls) -> dict[str, tuple[int, str]]:
        return {
            "auth_login_failed_email": (
                settings.AUTH_LOGIN_FAILED_PER_EMAIL_LIMIT,
                "Too many failed sign-in attempts for this account. Please try again later.",
            ),
            "auth_login_ip": (
                settings.AUTH_LOGIN_PER_IP_LIMIT,
                "Too many sign-in attempts from this network. Please try again later.",
            ),
            "auth_admin_login_failed_email": (
                settings.AUTH_ADMIN_LOGIN_FAILED_PER_EMAIL_LIMIT,
                "Too many failed admin sign-in attempts. Please try again later.",
            ),
            "auth_admin_login_ip": (
                settings.AUTH_ADMIN_LOGIN_PER_IP_LIMIT,
                "Too many admin sign-in attempts from this network. Please try again later.",
            ),
            "auth_forgot_email": (
                settings.AUTH_FORGOT_PER_EMAIL_LIMIT,
                "Too many password reset requests for this account. Please try again later.",
            ),
            "auth_forgot_ip": (
                settings.AUTH_FORGOT_PER_IP_LIMIT,
                "Too many password reset requests from this network. Please try again later.",
            ),
            "auth_resend_email": (
                settings.AUTH_RESEND_PER_EMAIL_LIMIT,
                "Too many verification emails requested for this account. Please try again later.",
            ),
            "auth_resend_ip": (
                settings.AUTH_RESEND_PER_IP_LIMIT,
                "Too many verification emails requested from this network. Please try again later.",
            ),
            # Remaining unauthenticated auth routes: refresh, verification and
            # reset redemption. HMAC-signed tokens are not guessable, so these
            # budgets bound flood/CPU abuse rather than credential guessing.
            "auth_refresh_ip": (
                settings.AUTH_REFRESH_PER_IP_LIMIT,
                "Too many session refreshes from this network. Please try again later.",
            ),
            "auth_verify_ip": (
                settings.AUTH_VERIFY_PER_IP_LIMIT,
                "Too many verification attempts from this network. Please try again later.",
            ),
            "auth_reset_ip": (
                settings.AUTH_RESET_PER_IP_LIMIT,
                "Too many password-reset attempts from this network. Please try again later.",
            ),
        }

    @classmethod
    def check_auth_rate_limit(cls, db: Session, category: str, subject: str) -> None:
        """Charge ONE attempt against an auth budget; raise 429 when over.

        ``subject`` is an email address or a source IP. It is never stored: the
        row keeps ``subject_uuid(subject)`` instead (see subject_uuid).

        FAILS OPEN on a counter-store error. A broken rate-limit table must not
        become an authentication outage (and must not silently fail *closed*
        either, which would lock every user out of the platform) — the same
        availability-over-strictness contract the search limiter uses.
        """
        try:
            limits = cls._auth_categories()
            if category not in limits:
                raise ValueError(f"Unknown auth rate-limit category: {category}")
            limit, message = limits[category]
            # The stored key is a sha256 of the subject's UUID: still opaque and
            # still deterministic per subject, but the same 64-hex shape every
            # other bucket in this table uses (one format, one column contract).
            identity = _hash_identity(str(subject_uuid(subject)))
            now = _now()
            window_start = cls._window_start(now, category)

            cls._prune(db, identity, category, now)
            in_window = (
                db.query(RateLimitEvent)
                .filter(
                    RateLimitEvent.identity_hash == identity,
                    RateLimitEvent.category == category,
                    RateLimitEvent.created_at >= window_start,
                )
                .count()
            )
            if in_window >= limit:
                retry_after = cls._retry_after(db, identity, category, now)
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "code": "rate_limit_exceeded",
                        "category": category,
                        "message": message,
                    },
                    headers={"Retry-After": str(retry_after)},
                )
            db.add(
                RateLimitEvent(
                    identity_hash=identity, category=category, created_at=now
                )
            )
            db.commit()
        except HTTPException:
            # A real 429 (or any deliberate HTTP refusal) must reach the client.
            raise
        except Exception:  # pragma: no cover - depends on store failure
            # Counter store unavailable: allow the request rather than taking
            # authentication down with it.
            try:
                db.rollback()
            except Exception:
                pass

    @classmethod
    def reset_auth_subject(cls, db: Session, subject: str) -> None:
        """Clear every auth budget for one email/IP (support + test helper)."""
        identity = _hash_identity(str(subject_uuid(subject)))
        db.query(RateLimitEvent).filter(
            RateLimitEvent.identity_hash == identity,
            RateLimitEvent.category.in_(list(cls._auth_categories().keys())),
        ).delete(synchronize_session=False)
        db.commit()

    @staticmethod
    def limit_for_category(category: str) -> int:
        cats = RateLimitService._categories()
        if category not in cats:
            raise ValueError(f"Unknown rate-limit category: {category}")
        return cats[category][0]

    @staticmethod
    def _window_minutes(category: str) -> int:
        return {
            "auth_login_ip": settings.AUTH_LOGIN_WINDOW_MINUTES,
            "auth_login_failed_email": settings.AUTH_LOGIN_WINDOW_MINUTES,
            "auth_admin_login_ip": settings.AUTH_ADMIN_LOGIN_WINDOW_MINUTES,
            "auth_admin_login_failed_email": settings.AUTH_ADMIN_LOGIN_WINDOW_MINUTES,
            "auth_forgot_email": settings.RATE_LIMIT_WINDOW_MINUTES,
            "auth_forgot_ip": settings.RATE_LIMIT_WINDOW_MINUTES,
            "auth_resend_email": settings.REGISTER_WINDOW_MINUTES,
            "auth_resend_ip": settings.REGISTER_WINDOW_MINUTES,
            "auth_refresh_ip": settings.RATE_LIMIT_WINDOW_MINUTES,
            "auth_verify_ip": settings.RATE_LIMIT_WINDOW_MINUTES,
            "auth_reset_ip": settings.RATE_LIMIT_WINDOW_MINUTES,
            "register": settings.REGISTER_WINDOW_MINUTES,
            "support_ticket": settings.SUPPORT_TICKET_WINDOW_MINUTES,
            "document_upload": settings.DOCUMENT_UPLOAD_WINDOW_MINUTES,
            "payment_receipt_upload": settings.PAYMENT_RECEIPT_WINDOW_MINUTES,
            "public_search": settings.PUBLIC_SEARCH_WINDOW_MINUTES,
            "global_api": settings.GLOBAL_API_WINDOW_MINUTES,
        }.get(category, settings.RATE_LIMIT_WINDOW_MINUTES)

    @staticmethod
    def _window_start(now: datetime, category: str = "") -> datetime:
        return now - timedelta(
            minutes=RateLimitService._window_minutes(category)
        )

    @staticmethod
    def _prune(db: Session, identity_hash: str, category: str, now: datetime) -> None:
        """Delete this bucket's rows fully outside the window (cheap hygiene).

        Best effort by design: the window filter below is what actually decides
        the count, so stale rows never change a decision. On a file-backed
        SQLite database a request that has already read (the auth guard) and
        then writes can be refused with SQLITE_BUSY while another request holds
        the write lock, so a failed prune rolls back and lets the request carry
        on rather than turning housekeeping into a 500.
        """
        try:
            db.execute(
                delete(RateLimitEvent).where(
                    RateLimitEvent.identity_hash == identity_hash,
                    RateLimitEvent.category == category,
                    RateLimitEvent.created_at < RateLimitService._window_start(now, category),
                )
            )
        except OperationalError:
            db.rollback()

    # ------------------------------------------------------------- enforcement
    @classmethod
    def check(
        cls,
        db: Session,
        category: str,
        identity: str,
        commit: bool = True,
    ) -> int:
        """
        Count one request against `category` for `identity`. Raises 429 (with
        Retry-After) when over the limit. Returns the events still in-window
        (including this one) when allowed. Caller owns the commit.
        """
        limit, message, _kind = cls._categories()[category]
        identity_hash = _hash_identity(identity)
        now = _now()
        window_start = cls._window_start(now, category)

        # Hygiene: drop this bucket's rows that fell out of the window before
        # adding another one. Without this the table only ever grows — one row
        # per counted request, forever — which is fine at demo scale and a
        # problem at real signup volume. Indexed on (identity, category,
        # created_at), so it touches only this bucket.
        cls._prune(db, identity_hash, category, now)

        in_window = (
            db.query(RateLimitEvent)
            .filter(
                RateLimitEvent.identity_hash == identity_hash,
                RateLimitEvent.category == category,
                RateLimitEvent.created_at >= window_start,
            )
            .count()
        )
        if in_window >= limit:
            retry_after = cls._retry_after(db, identity_hash, category, now)
            db.rollback()  # discard this request's prune/insert noise
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "rate_limit_exceeded",
                    "category": category,
                    "message": message,
                },
                headers={"Retry-After": str(retry_after)},
            )
        db.add(RateLimitEvent(
            identity_hash=identity_hash, category=category, created_at=now
        ))
        if commit:
            db.commit()
        return in_window + 1

    @staticmethod
    def _retry_after(
        db: Session, identity_hash: str, category: str, now: datetime
    ) -> int:
        oldest = (
            db.query(RateLimitEvent.created_at)
            .filter(
                RateLimitEvent.identity_hash == identity_hash,
                RateLimitEvent.category == category,
                RateLimitEvent.created_at >= RateLimitService._window_start(now, category),
            )
            .order_by(RateLimitEvent.created_at)
            .first()
        )
        if oldest is None:
            return RateLimitService._window_minutes(category) * 60
        seconds_left = int(
            (oldest[0] + timedelta(minutes=RateLimitService._window_minutes(category)) - now)
            .total_seconds()
        )
        return max(1, seconds_left)

    # --------------------------------------------------- public API dependencies
    @classmethod
    def rate_limit_user(cls, category: str):
        """
        Dependency factory: JWT-identity-scoped (search categories).

        Uses OPTIONAL auth so the public marketplace contract is preserved:
        a valid token means the caller is counted by user id; an anonymous
        caller passes through uncounted and unblocked (H10 spec §E).
        """

        def _dep(request: Request, db: Session = Depends(get_db),
                 user=Depends(get_optional_user)) -> None:
            if user is not None:
                cls.check(db, category, str(user.id))
            request.state.rate_limit_category = category

        return _dep

    @classmethod
    def rate_limit_identity(cls, category: str):
        """Dependency factory: ip/email-scoped for public auth/payment routes."""

        def _dep(request: Request, db: Session = Depends(get_db)) -> None:
            # Always use the proxy-aware source-IP helper. Using
            # request.client.host here would either bypass the limit behind a
            # proxy (everyone shares one bucket) or trust spoofable headers.
            cls.check(db, category, client_ip(request))
            request.state.rate_limit_category = category

        return _dep

    @staticmethod
    def reset_user(db: Session, user_id, category: str | None = None) -> None:
        """Test/maintenance helper: clear one identity's counters."""
        identity_hash = _hash_identity(str(user_id))
        q = db.query(RateLimitEvent).filter(
            RateLimitEvent.identity_hash == identity_hash
        )
        if category:
            q = q.filter(RateLimitEvent.category == category)
        q.delete()
        db.commit()

    @staticmethod
    def reset_identity(db: Session, identity: str, category: str | None = None) -> None:
        """Test/maintenance helper: clear one hashed identity's counters."""
        identity_hash = _hash_identity(identity)
        q = db.query(RateLimitEvent).filter(
            RateLimitEvent.identity_hash == identity_hash
        )
        if category:
            q = q.filter(RateLimitEvent.category == category)
        q.delete()
        db.commit()


# Module-level aliases: the security contracts call these on the module
# (`rate_limit_service.reset_auth_subject(...)`, `rate_limit_service.client_ip(...)`).
def reset_user(db: Session, user_id, category: str | None = None) -> None:
    """Clear one user-id-keyed identity's counters (test/maintenance helper)."""
    RateLimitService.reset_user(db, user_id, category)


def reset_auth_subject(db: Session, subject: str) -> None:
    """Clear one email/IP's auth budgets (support + test helper)."""
    RateLimitService.reset_auth_subject(db, subject)


def check_auth_rate_limit(db: Session, category: str, subject: str) -> None:
    """Module-level alias for the auth budget check (see check_auth_rate_limit)."""
    RateLimitService.check_auth_rate_limit(db, category, subject)


def limit_for_category(category: str) -> int:
    """Configured limit for a category (H10 contract)."""
    return RateLimitService.limit_for_category(category)
