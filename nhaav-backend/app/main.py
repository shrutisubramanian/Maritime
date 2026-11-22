import secrets as _secrets

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse
import jwt

from app.config import settings
from app.utils.session_cookies import ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER
from app.routers import documents
from app.database import Base, SessionLocal
from app.services.rate_limit_service import RateLimitService
from app.models import *

from app.routers import auth, jobs, profiles, quotes, requests
from app.routers import reviews
from app.routers import service_categories
from app.models.notification import Notification
from app.routers import notifications
from app.routers import client_procurement
from app.routers import supplies
from app.routers import services
from app.routers import marketplace
from app.routers import admin_auth
from app.routers import admin_moderation
from app.routers import access
from app.routers import subscription
from app.routers import payments
from app.routers import admin_payments
from app.routers import admin_verification
from app.routers import listing_fees
from app.routers import admin_listing_fees
from app.routers import admin_profiles, ports, profile_visibility
from app.routers import admin_overview
from app.routers import admin_passes
from app.routers import admin_company_marketplace
from app.routers import support

# M-4: Alembic is the single schema authority. The startup create_all call is
# REMOVED — application startup must not silently create missing production
# tables or mask a missed migration. (Test suites create their own schemas.)

# Import all models so Alembic autogenerate and relationship resolution see
# the complete metadata (the wildcard import above stays for that purpose).
assert Base.metadata is not None

# ---------------------------------------------------------------------- config
def openapi_surface(environment: str) -> dict:
    """FastAPI docs kwargs for an environment, FAIL CLOSED on production.

    Production disables Swagger UI, ReDoc *and* the OpenAPI schema together —
    leaving the schema reachable would still expose the whole API surface.
    The match is normalized so "Production" / " production " cannot sneak the
    docs back in.
    """
    env = (environment or "").strip().lower()
    if env == "production":
        return {"docs_url": None, "redoc_url": None, "openapi_url": None}
    return {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}


def build_allowed_origins(raw: str) -> list[str]:
    """Parse a comma-separated CORS origin list, stripping whitespace.

    'https://a.com, https://b.com ' must not yield origins with leading/trailing
    spaces — a browser never sends those, so such an entry would silently never
    match.
    """
    return [o.strip() for o in (raw or "").split(",") if o.strip()]


def validate_cors_config(
    raw: str, environment: str, origins: list[str], *, check_localhost: bool = True
) -> None:
    """Refuse credentials-unsafe or production-underspecified CORS configs."""
    env = (environment or "").strip().lower()
    if "*" in origins:
        raise RuntimeError(
            "CORS_ORIGINS='*' is not allowed with allow_credentials=True; list the "
            "exact frontend origin(s) instead."
        )
    if env == "production" and not (raw or "").strip():
        raise RuntimeError(
            "CORS_ORIGINS must be set in production; list the exact frontend origin(s)."
        )
    if env == "production" and check_localhost:
        for origin in origins:
            host = origin.lower().split("://", 1)[-1].split("/", 1)[0]
            if host.startswith("localhost") or host.startswith("127.") or host.startswith("[::1]"):
                raise RuntimeError(
                    "CORS_ORIGINS must not contain localhost origins in production."
                )


# The allow-list comes from configuration (app.config.Settings.CORS_ORIGINS);
# build_allowed_origins/validate_cors_config above are the canonical parsing and
# validation rules that the configuration and tests share.
ALLOWED_ORIGINS: list[str] = build_allowed_origins(
    ",".join(settings.CORS_ORIGINS)
)
validate_cors_config(
    ",".join(settings.CORS_ORIGINS),
    settings.ENVIRONMENT,
    ALLOWED_ORIGINS,
    check_localhost=False,
)

# Documentation surface gating: Swagger UI, ReDoc and the OpenAPI schema are
# disabled in production (defense in depth); they stay available in
# development/staging for integrators.
app = FastAPI(
    title="Nhaav Maritime API",
    **openapi_surface(settings.ENVIRONMENT),
)

@app.on_event("startup")
def validate_production_cors_origins() -> None:
    """Reject localhost-only origins when the real server starts.

    Import-time rejection would make schema/migration tooling impossible to run
    against a production config, so the deployment-only check belongs here.
    """
    validate_cors_config(
        ",".join(settings.CORS_ORIGINS),
        settings.ENVIRONMENT,
        ALLOWED_ORIGINS,
        check_localhost=True,
    )


app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(profiles.router)
app.include_router(quotes.router)
app.include_router(requests.router)
app.include_router(documents.router)
app.include_router(reviews.router)
app.include_router(service_categories.router)
app.include_router(
    notifications.router
)
app.include_router(client_procurement.router)
app.include_router(supplies.router)
app.include_router(services.router)
app.include_router(marketplace.router)
app.include_router(admin_auth.router)
app.include_router(admin_moderation.router)
app.include_router(access.router)
app.include_router(subscription.router)
app.include_router(payments.router)
app.include_router(admin_payments.router)
app.include_router(admin_verification.router)
app.include_router(listing_fees.router)
app.include_router(admin_listing_fees.router)
# Company-first marketplace: paid PROFILE visibility + admin category control.
app.include_router(profile_visibility.router)
app.include_router(ports.router)
app.include_router(admin_company_marketplace.router)
app.include_router(admin_profiles.router)
# Operational dashboard: real aggregates + account follow-up + procurement
# oversight (read-only, admin-only).
app.include_router(admin_overview.router)
app.include_router(admin_passes.router)
app.include_router(support.router)


# --------------------------------------------------------------- CSRF guard
# Cookie-authenticated requests carry the session automatically, so a state
# change must prove it was made by the app and not by a hostile page. The client
# copies the readable `nhaav_csrf` cookie into `X-CSRF-Token`; both must match.
# Bearer requests (API clients, Swagger, tests) are exempt: an attacker's page
# cannot attach a header the victim's browser does not already send.
_CSRF_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})
_CSRF_EXEMPT_PATHS = frozenset(
    {
        # Session-establishing / repair endpoints. A stale cookie must never be
        # able to lock the user out of signing in again, and success still
        # requires credentials the attacker would have to know.
        "/auth/login",
        "/auth/register",
        "/auth/refresh",
        "/auth/forgot-password",
        "/auth/forgot-password/code",
        "/auth/reset-password",
        "/auth/reset-password/code",
        "/auth/verify-email",
        "/auth/resend-verification",
        "/admin/auth/login",
    }
)


@app.middleware("http")
async def csrf_protection(request: Request, call_next):
    if request.method not in _CSRF_SAFE_METHODS:
        cookie_session = request.cookies.get(ACCESS_COOKIE)
        bearer = request.headers.get("authorization")
        if (
            cookie_session
            and not bearer
            and request.url.path not in _CSRF_EXEMPT_PATHS
        ):
            sent = request.headers.get(CSRF_HEADER)
            stored = request.cookies.get(CSRF_COOKIE)
            if not sent or not stored or not _secrets.compare_digest(sent, stored):
                return JSONResponse(
                    {"detail": "CSRF token missing or invalid"}, status_code=403
                )
    return await call_next(request)


@app.middleware("http")
async def global_authenticated_rate_limit(request: Request, call_next):
    """Bound every authenticated API request, not just the named endpoints.

    The endpoint-specific limits protect expensive/abusable actions; this is the
    backstop that stops a valid account from hammering inexpensive read routes.
    Anonymous requests are handled by their dedicated IP-scoped limits. Login,
    refresh and health/docs probes are intentionally exempt so a 429 cannot
    prevent a user from repairing a session.
    """
    if not settings.GLOBAL_API_RATE_LIMIT_ENABLED or request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if path.startswith(("/auth/", "/admin/auth/login", "/health")) or path in (
        "/", "/docs", "/redoc", "/openapi.json",
    ):
        return await call_next(request)

    raw = request.headers.get("authorization")
    if raw and raw.lower().startswith("bearer "):
        raw = raw[7:].strip()
    else:
        raw = request.cookies.get(ACCESS_COOKIE)
    if not raw:
        return await call_next(request)

    try:
        payload = jwt.decode(
            raw, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        subject = payload.get("sub")
        if not subject:
            return await call_next(request)
    except Exception:
        # Authentication dependencies return the canonical 401; do not turn a
        # malformed token into a 429 or leak why decoding failed.
        return await call_next(request)

    def _charge_global_budget() -> None:
        db = SessionLocal()
        try:
            RateLimitService.check(db, "global_api", str(subject))
        finally:
            db.close()

    # OFF THE EVENT LOOP. This is blocking database I/O: on SQLite a writer can
    # wait for another request's write lock, and running that wait on the event
    # loop froze the whole server — /health stopped answering and every queued
    # request behind it stalled. In the threadpool a slow counter store costs one
    # worker, not the process.
    try:
        await run_in_threadpool(_charge_global_budget)
    except HTTPException as exc:
        return JSONResponse(
            exc.detail,
            status_code=exc.status_code,
            headers=exc.headers,
        )
    except Exception:
        # Fails open, like every other rate-limit counter store path: a broken
        # counter table must not take the API down with it.
        pass

    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Baseline response hardening for every endpoint.

    The API serves JSON and private file downloads, never HTML, so the goal is
    to stop a browser from SECOND-GUESSING that: no MIME sniffing (a stored
    file must not be re-interpreted as HTML/JS), no framing, no referrer leak of
    internal URLs, and no ambient access to device APIs. HSTS is only sent in
    production — on plain-HTTP localhost it would be ignored at best and would
    lock a device out of other local projects at worst.
    """
    response = await call_next(request)
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "no-referrer")
    headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    headers.setdefault(
        "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
    )
    if settings.is_production:
        headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    return response


@app.get("/")
def root():
    return {"message": "Welcome to the Nhaav Maritime API!"}


@app.get("/health", tags=["Health"])
def health():
    """Liveness probe. Deliberately does no I/O so it reflects process health,
    not database health; deployers gate on this for readiness/keep-alive."""
    return {"status": "ok"}


@app.get("/health/ready", tags=["Health"])
def readiness():
    """Readiness probe: confirms the DATABASE_URL actually answers.

    `/health` stays a pure liveness check. This separate probe exists so a
    deployer can gate traffic on the database being reachable (a container that
    booted with a bad DATABASE_URL would otherwise report healthy). It performs
    one trivial SELECT and opens no tables, so it is safe on an upgraded or an
    empty schema.
    """
    from fastapi import HTTPException
    from sqlalchemy import text

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable")
    finally:
        db.close()
    return {"status": "ready"}


# ---------------------------------------------------------------------------
# CORS is registered LAST, and that ordering is load-bearing.
#
# Starlette builds the middleware stack so the most recently added middleware is
# the OUTERMOST one. The CSRF guard and the global authenticated rate limiter
# return their 403/429 responses directly, without calling further in — so when
# CORSMiddleware sat inside them, those rejections carried no
# Access-Control-Allow-Origin header and the browser reported a CORS error
# instead of showing the real status. Registering CORS after them makes every
# response, including those rejections, readable by the frontend origin.
#
# In development the frontend is served from whichever port Vite picks, and the
# same machine is reachable as both localhost and 127.0.0.1 — different origins
# to a browser. Loopback origins are therefore allowed by pattern in
# development only; production keeps the strict explicit allow-list and no
# pattern at all.
_DEV_ORIGIN_REGEX = (
    None if settings.is_production else r"^http://(localhost|127\.0\.0\.1)(:\d{2,5})?$"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=_DEV_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)