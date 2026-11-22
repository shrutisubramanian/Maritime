"""Session cookies.

The browser client no longer keeps a JWT in `localStorage` (where any script —
including a compromised dependency — could read it). The access and refresh
tokens are set as **httpOnly** cookies instead:

  * `nhaav_access`  — the JWT, path `/`, httpOnly.
  * `nhaav_refresh` — the refresh JWT, path `/auth` (only the refresh and
    logout endpoints receive it), httpOnly.
  * `nhaav_csrf`    — deliberately READABLE by JS. It is not a credential: it
    is the double-submit half of the CSRF defence. The client copies it into the
    `X-CSRF-Token` header, and the server refuses a cookie-authenticated
    state-changing request whose header does not match.

`SameSite=Lax` already stops a cross-site form POST from carrying the session, so
the CSRF token is defence in depth for browsers that ignore it.

`Secure` is controlled explicitly by `COOKIE_SECURE` (default true in staging
and production, false only for local HTTP development). The API and the app
must share a registrable domain for the cookies to be sent (e.g.
`app.example.com` + `api.example.com`).
"""
import secrets

from fastapi import Response

from app.config import settings

ACCESS_COOKIE = "nhaav_access"
REFRESH_COOKIE = "nhaav_refresh"
CSRF_COOKIE = "nhaav_csrf"
CSRF_HEADER = "X-CSRF-Token"
REFRESH_COOKIE_PATH = "/auth"

_REFRESH_MAX_AGE = 7 * 24 * 60 * 60


def _secure() -> bool:
    # Explicit configuration so staging (and any other HTTPS deployment) also
    # gets Secure cookies. Local HTTP development opts out via COOKIE_SECURE.
    return bool(settings.COOKIE_SECURE)


def set_session_cookies(
    response: Response,
    access_token: str,
    refresh_token: str | None = None,
) -> None:
    """Attach the session to a response (login, refresh)."""
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        httponly=True,
        samesite="lax",
        secure=_secure(),
        path="/",
    )
    if refresh_token:
        response.set_cookie(
            REFRESH_COOKIE,
            refresh_token,
            max_age=_REFRESH_MAX_AGE,
            httponly=True,
            samesite="lax",
            secure=_secure(),
            path=REFRESH_COOKIE_PATH,
        )
    # A fresh CSRF secret per login/refresh keeps a leaked old value useless.
    response.set_cookie(
        CSRF_COOKIE,
        secrets.token_urlsafe(32),
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        httponly=False,
        samesite="lax",
        secure=_secure(),
        path="/",
    )


def clear_session_cookies(response: Response) -> None:
    """Remove the session from the browser (logout)."""
    response.delete_cookie(
        ACCESS_COOKIE, path="/", samesite="lax", secure=_secure(), httponly=True
    )
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        samesite="lax",
        secure=_secure(),
        httponly=True,
    )
    response.delete_cookie(
        CSRF_COOKIE, path="/", samesite="lax", secure=_secure(), httponly=False
    )
