"""
H9 §D — /auth/logout contract tests.

SUPERSEDED DESIGN NOTE: these tests originally pinned a stateless-JWT model in
which /auth/logout must NOT exist, because a route that revoked nothing would
be fake security. The session model has since changed (security audit F-2/F-3):
credentials live in httpOnly cookies and refresh tokens are single-use database
rows, so logout genuinely CAN end the session server-side. The contract is
inverted accordingly — logout must now exist, must revoke, and must require
authentication rather than being an open endpoint. The invariant that survives
unchanged: no access/refresh credential may be stored in JavaScript-readable
storage.
"""
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

FRONTEND_SRC = "../nhaav-frontend/src"


def _read(relpath: str) -> str:
    with open(os.path.join(FRONTEND_SRC, relpath), encoding="utf-8") as f:
        return f.read()


class TestBackendLogoutRoute:
    """The backend contract: logout exists and genuinely ends the session."""

    def test_logout_route_exists(self):
        routes = [
            getattr(r, "path", None)
            for r in app.routes
        ]
        assert "/auth/logout" in routes, (
            "cookie sessions are revocable server-side, so logout must exist"
        )

    def test_auth_routes_are_exactly_the_known_set(self):
        # Guards against a NEW auth-facing route appearing without an explicit
        # contract decision (the original purpose of this test).
        auth_routes = sorted(
            getattr(r, "path", "")
            for r in app.routes
            if getattr(r, "path", "").startswith("/auth")
        )
        assert auth_routes == [
            "/auth/forgot-password",
            "/auth/forgot-password/code",
            "/auth/login",
            "/auth/logout",
            "/auth/me",
            "/auth/refresh",
            "/auth/register",
            "/auth/resend-verification",
            "/auth/reset-password",
            "/auth/reset-password/code",
            "/auth/verify-email",
        ]

    def test_logout_requires_authentication(self):
        # The old risk was a logout route that revoked nothing. The new risk
        # would be an unauthenticated one, so pin the auth requirement.
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/auth/logout")
        assert resp.status_code in (401, 403), (
            f"logout must require an authenticated session, got {resp.status_code}"
        )

    def test_refresh_route_exists(self):
        # /auth/refresh is the real long-session mechanism and must keep working.
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/auth/refresh", json={"refresh_token": "garbage"})
        assert resp.status_code == 401  # invalid token → clean 401, not 404/500


class TestFrontendLogoutContract:
    """The frontend contract: pure client-side logout, no dead endpoint call."""

    def test_auth_service_ends_the_server_session_on_logout(self):
        src = _read("services/auth.ts")
        # With httpOnly cookie sessions the browser cannot drop the server
        # session itself, so the client MUST call the logout endpoint.
        assert any(
            pattern in src
            for pattern in (
                "apiClient.post(`/auth/logout`)",
                'apiClient.post("/auth/logout")',
                "apiClient.post('/auth/logout')",
            )
        ), "services/auth.ts must call /auth/logout to end the server session"

    def test_logout_ends_the_server_session(self):
        # The session is an httpOnly cookie now: the browser cannot delete it,
        # so logout MUST call the server (which revokes refresh tokens and
        # clears the cookies) and then drop the cached user.
        ctx = _read("context/AuthContext.tsx")
        assert "authService.logout()" in ctx
        assert "authService.removeStoredUser()" in ctx

    def test_no_credential_is_stored_in_js(self):
        # Regression guard: the access/refresh tokens must never come back into
        # localStorage, where any script (or compromised dependency) can read
        # them. Only the non-sensitive cached user may be stored.
        for relpath in ("services/auth.ts", "context/AuthContext.tsx"):
            src = _read(relpath)
            assert "nhaav_refresh" not in src, f"{relpath} still handles the refresh token in JS"
            assert "nhaav_token" not in src, f"{relpath} still handles the access token in JS"

    def test_all_nhaav_auth_keys_cleared_in_authcontext_logout(self):
        ctx = _read("context/AuthContext.tsx")
        assert "authService.logout()" in ctx
        assert "authService.removeStoredUser()" in ctx
        assert "nhaav_refresh" not in ctx

    def test_sidebars_clear_auth_state_on_logout(self):
        # Regression: the client/provider sidebars' Logout item used to only
        # navigate('/login') — the token, refresh token and React context
        # stayed alive while the login page was on screen. The admin sidebar
        # already cleared state first; both user sidebars must too.
        for relpath in ("components/ClientSidebar.tsx", "components/ProviderSidebar.tsx"):
            src = _read(relpath)
            assert "useAuth" in src, f"{relpath} must consume the auth context"
            assert "logout()" in src, (
                f"{relpath} Logout item must clear auth state before navigating"
            )
