# pyrefly: ignore [missing-import]
"""H6 - CORS, API URL configuration, and production-origin fail-safes."""
import pytest
from fastapi.testclient import TestClient

from app.main import app, build_allowed_origins, validate_cors_config


class TestCORSConfiguration:

    def test_cors_includes_dev_origins_by_default(self):
        from app.main import ALLOWED_ORIGINS
        assert "http://localhost:5173" in ALLOWED_ORIGINS
        assert "http://localhost:3000" in ALLOWED_ORIGINS

    def test_cors_origins_are_configurable_list(self):
        from app.main import ALLOWED_ORIGINS
        assert isinstance(ALLOWED_ORIGINS, list)
        assert len(ALLOWED_ORIGINS) >= 1

    def test_cors_preflight_succeeds(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.options(
            "/auth/me",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.status_code in (200, 405)

    def test_cors_parsing_strips_whitespace(self):
        # 'https://a.com, https://b.com' must not produce origins with leading
        # spaces (which would silently never match a real browser Origin).
        origins = build_allowed_origins("https://a.com, https://b.com ,  https://c.com")
        assert origins == ["https://a.com", "https://b.com", "https://c.com"]

    def test_cors_wildcard_rejected(self):
        with pytest.raises(RuntimeError, match="credentials"):
            validate_cors_config("https://a.com,*", "development", ["https://a.com", "*"])

    def test_cors_production_requires_explicit_origins(self):
        with pytest.raises(RuntimeError, match="CORS_ORIGINS must be set in production"):
            validate_cors_config("", "production", ["http://localhost:5173"])

    def test_cors_dev_defaults_allowed_outside_production(self):
        # Must not raise.
        validate_cors_config("", "development", ["http://localhost:5173"])
        validate_cors_config("", "staging", ["https://staging.example.com"])

    def test_cors_prod_explicit_config_allowed(self):
        # Must not raise.
        validate_cors_config("https://app.example.com", "production", ["https://app.example.com"])


class TestCorsOnRejectedRequests:
    """Rejections must still be readable by the browser.

    The CSRF guard (and the global authenticated rate limiter) answer without
    calling further into the stack. When CORSMiddleware was registered before
    them they were INSIDE it, so their 403/429 responses carried no
    Access-Control-Allow-Origin header and the browser reported a CORS failure
    instead of the real status. CORS is registered last so it wraps them.
    """

    def test_csrf_rejection_still_carries_cors_headers(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(
            "/support/tickets",
            json={},
            headers={
                "Origin": "http://localhost:5173",
                # A session cookie without the matching CSRF header is rejected
                # by the guard before any route code runs.
                "Cookie": "nhaav_access=stub",
            },
        )
        assert resp.status_code == 403, resp.text
        assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_loopback_origins_are_allowed_in_development(self):
        # Vite prints 127.0.0.1 and moves port when 5173 is busy; both are
        # different browser origins from http://localhost:5173.
        client = TestClient(app, raise_server_exceptions=False)
        for origin in (
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ):
            resp = client.options(
                "/auth/me",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET",
                },
            )
            assert resp.headers.get("access-control-allow-origin") == origin

    def test_foreign_origins_are_still_refused(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.options(
            "/auth/me",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "access-control-allow-origin" not in resp.headers


class TestHealthEndpoint:

    def test_health_endpoint_exists(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestFrontendAPIURLContract:

    def _read(self, relpath: str) -> str:
        with open(f"../nhaav-frontend/{relpath}", encoding="utf-8") as f:
            return f.read()

    def test_frontend_api_client_uses_env_var(self):
        assert "import.meta.env.VITE_API_URL" in self._read("src/services/apiEnv.ts")

    def test_api_url_trailing_slash_normalized(self):
        # VITE_API_URL=https://app.up.railway.app/ must not yield //documents/...
        api_env = self._read("src/services/apiEnv.ts")
        assert ".replace(/\\/+$/, '')" in api_env

    def test_all_api_consumers_use_shared_module(self):
        for relpath in (
            "src/services/apiClient.ts",
            "src/services/adminAuth.ts",
            "src/pages/Procurement/ProcurementRequests/CreateProcurementRequest.tsx",
        ):
            assert "apiEnv" in self._read(relpath), f"{relpath} does not use apiEnv"

    def test_dead_api_ts_service_stays_deleted(self):
        # H9: services/api.ts (0 importers, dead code) was removed. It must
        # not be reintroduced — new API surfaces go through apiClient/apiEnv.
        import os

        assert not os.path.exists(
            os.path.join("../nhaav-frontend", "src/services/api.ts")
        ), "services/api.ts was deleted in H9 and must stay deleted"

    def test_fetch_uploads_use_shared_auth_token(self):
        # Uploads MUST authenticate. The session is now an httpOnly cookie, so
        # the contract is: send credentials (the cookie) and the CSRF header,
        # and never read a token from JS storage. The old H9 dead 'token' key
        # must not come back either.
        for relpath in ("src/pages/Procurement/ProcurementRequests/CreateProcurementRequest.tsx",):
            src = self._read(relpath)
            assert "credentials: 'include'" in src, f"{relpath} does not send credentials"
            assert "getCsrfHeaders(" in src, f"{relpath} does not send the CSRF header"
            assert "getItem('token')" not in src and 'getItem("token")' not in src, (
                f"{relpath} still reads the dead 'token' key"
            )
            assert "Authorization" not in src, (
                f"{relpath} must not build an Authorization header from a JS token"
            )

    def test_removed_upload_page_has_no_hardcoded_localhost(self):
        # Upload was removed in Phase 4e; this check remains as a regression
        # guard so the page can never return with a hardcoded localhost fetch.
        import os

        upload_src = "../nhaav-frontend/src/pages/Upload/index.tsx"
        if not os.path.exists(upload_src):
            return  # removed — guarded by tests/test_h9_upload_contract.py
        src = self._read("src/pages/Upload/index.tsx")
        assert 'fetch("http://localhost:8000' not in src

    def test_create_request_page_no_hardcoded_localhost(self):
        src = self._read("src/pages/Procurement/ProcurementRequests/CreateProcurementRequest.tsx")
        assert "fetch('http://localhost:8000" not in src

    def test_health_endpoint_contract_is_honest(self):
        # H9 removed the dead api.ts health fallback; the honest behavior is
        # now pinned on the backend side: /health must respond with a simple
        # ok payload (the frontend uses it for the connection indicator).
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
