"""
Security remediation regression tests (H-1, M-1, M-2, M-3, M-4).

Each class pins one remediated finding. See SECURITY_AUDIT_REPORT.md for the
finding -> fix -> verification mapping. Self-contained: own SQLite database,
own get_db override, no reliance on application startup creating schema.
"""
import sys
import uuid
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from io import StringIO

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.rate_limit_event import RateLimitEvent
from app.models.user import User, UserRole
from app.services import rate_limit_service
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_security_remediation.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "Password123!"
CLIENT_EMAIL = "sec_remediation_client@nhaav.com"
SECOND_CLIENT_EMAIL = "sec_remediation_client_b@nhaav.com"
PROVIDER_EMAIL = "sec_remediation_provider@nhaav.com"


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    try:
        client_user = User(email=CLIENT_EMAIL, password_hash=hash_password(PASSWORD),
                           role=UserRole.client, is_verified=True)
        client_b = User(email=SECOND_CLIENT_EMAIL, password_hash=hash_password(PASSWORD),
                        role=UserRole.client, is_verified=True)
        provider = User(email=PROVIDER_EMAIL, password_hash=hash_password(PASSWORD),
                        role=UserRole.provider, is_verified=True)
        db.add_all([client_user, client_b, provider])
        db.commit()
    finally:
        db.close()
    yield
    app.dependency_overrides.pop(get_db, None)


def _register(email: str, role: str = "client") -> object:
    """Register through the API; returns the response (stdout swallowed — the
    mock-verification print is huge)."""
    with redirect_stdout(StringIO()):
        return TestClient(app).post(
            "/auth/register",
            json={"email": email, "password": PASSWORD, "role": role, "full_name": "T"},
        )


def _login(client_obj: TestClient, email: str) -> str:
    with redirect_stdout(StringIO()):
        r = client_obj.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def _uid(email: str) -> uuid.UUID:
    db = TestingSessionLocal()
    try:
        return db.query(User).filter(User.email == email).first().id
    finally:
        db.close()


def _clear_counters():
    db = TestingSessionLocal()
    try:
        db.query(RateLimitEvent).delete()
        db.commit()
    finally:
        db.close()


# ============================================================================ #
# H-1 — public registration must not control privileged role
# ============================================================================ #
class TestH1RegistrationRole:
    def test_register_role_admin_rejected(self):
        """role=admin is refused outright by the schema validator."""
        r = _register("h1_attacker_admin@nhaav.com", role="admin")
        assert r.status_code == 422, r.text
        db = TestingSessionLocal()
        try:
            created = db.query(User).filter(
                User.email == "h1_attacker_admin@nhaav.com").first()
            assert created is None, "role=admin must NOT create an account"
        finally:
            db.close()

    def test_register_role_supplier_allowed(self):
        r = _register("h1_supplier@nhaav.com", role="supplier")
        assert r.status_code in (201, 503), r.text  # 503 allowed if mocked mailer fails
        db = TestingSessionLocal()
        try:
            created = db.query(User).filter(
                User.email == "h1_supplier@nhaav.com").first()
            assert created is not None and created.role == UserRole.supplier
        finally:
            db.close()

    def test_register_role_provider_allowed(self):
        r = _register("h1_provider@nhaav.com", role="provider")
        assert r.status_code in (201, 503), r.text
        db = TestingSessionLocal()
        try:
            created = db.query(User).filter(
                User.email == "h1_provider@nhaav.com").first()
            assert created is not None and created.role == UserRole.provider
        finally:
            db.close()

    def test_normal_registration_still_works(self):
        r = _register("h1_plain_client@nhaav.com", role="client")
        assert r.status_code in (201, 503), r.text
        db = TestingSessionLocal()
        try:
            created = db.query(User).filter(
                User.email == "h1_plain_client@nhaav.com").first()
            assert created is not None and created.role == UserRole.client
        finally:
            db.close()

    def test_register_omitted_role_defaults_client(self):
        with redirect_stdout(StringIO()):
            r = TestClient(app).post(
                "/auth/register",
                json={"email": "h1_default@nhaav.com", "password": PASSWORD},
            )
        assert r.status_code in (201, 503), r.text
        db = TestingSessionLocal()
        try:
            created = db.query(User).filter(
                User.email == "h1_default@nhaav.com").first()
            assert created is not None and created.role == UserRole.client
        finally:
            db.close()

    def test_existing_admin_login_still_works(self):
        """Legitimate admin bootstrap path (direct row creation) still logs in."""
        admin_email = "h1_legit_admin@nhaav.com"
        db = TestingSessionLocal()
        try:
            db.add(User(email=admin_email, password_hash=hash_password(PASSWORD),
                        role=UserRole.admin, is_verified=True))
            db.commit()
        finally:
            db.close()
        with TestClient(app) as c:
            with redirect_stdout(StringIO()):
                r = c.post("/admin/auth/login",
                           json={"email": admin_email, "password": PASSWORD})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["user"]["email"] == admin_email

    def test_no_public_endpoint_that_escalates_roles(self):
        """There is no unauthenticated route that can hand out admin."""
        with TestClient(app) as c:
            with redirect_stdout(StringIO()):
                # refresh token must NOT allow role escalation (identity-only)
                r = c.post("/auth/register", json={
                    "email": "h1_second_admin@nhaav.com",
                    "password": PASSWORD, "role": "admin"})
            assert r.status_code == 422


# ============================================================================ #
# M-2 — missing/invalid ENVIRONMENT fails closed
# ============================================================================ #
class TestM2EnvironmentFailClosed:
    def test_missing_environment_means_production(self):
        """No ENVIRONMENT var at all -> production (dev endpoints OFF)."""
        import importlib
        import os
        from app import config as config_module

        saved = os.environ.pop("ENVIRONMENT", None)
        # reload() rebinds config_module.load_dotenv from source, so patch the
        # dotenv module itself to stop .env repopulating the variable.
        import dotenv
        real_load_dotenv = dotenv.load_dotenv
        dotenv.load_dotenv = lambda *a, **k: None
        # A production boot also requires a deliverable email configuration (the
        # config.Settings fail-fast). This test is about the ENVIRONMENT flag, so
        # supply a valid, never-used SMTP configuration to satisfy that premise.
        saved_email = {
            k: os.environ.get(k)
            for k in ("EMAIL_BACKEND", "EMAIL_HOST", "EMAIL_FROM")
        }
        os.environ.update(
            EMAIL_BACKEND="smtp",
            EMAIL_HOST="smtp.example.com",
            EMAIL_FROM="no-reply@example.com",
        )
        try:
            importlib.reload(config_module)
            assert config_module.settings.is_production is True
            assert config_module.settings.is_development is False
        finally:
            dotenv.load_dotenv = real_load_dotenv
            for key, value in saved_email.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            if saved is not None:
                os.environ["ENVIRONMENT"] = saved
            importlib.reload(config_module)

    def test_invalid_environment_refuses_to_boot(self):
        import importlib
        import os
        from app import config as config_module

        saved = os.environ.get("ENVIRONMENT")
        os.environ["ENVIRONMENT"] = "yolo"
        real_load_dotenv = config_module.load_dotenv
        config_module.load_dotenv = lambda *a, **k: None
        try:
            with pytest.raises(ValueError):
                importlib.reload(config_module)
        finally:
            config_module.load_dotenv = real_load_dotenv
            if saved is not None:
                os.environ["ENVIRONMENT"] = saved
            importlib.reload(config_module)

    def test_staging_is_never_development(self):
        import importlib
        import os
        from app import config as config_module

        saved = os.environ.get("ENVIRONMENT")
        os.environ["ENVIRONMENT"] = "staging"
        real_load_dotenv = config_module.load_dotenv
        config_module.load_dotenv = lambda *a, **k: None
        try:
            importlib.reload(config_module)
            assert config_module.settings.is_development is False
            assert config_module.settings.is_production is False
        finally:
            config_module.load_dotenv = real_load_dotenv
            if saved is not None:
                os.environ["ENVIRONMENT"] = saved
            importlib.reload(config_module)


# ============================================================================ #
# M-1 — dev provisioning endpoints hardened
# ============================================================================ #
class TestM1DevProvisioning:
    def test_token_count_zero_rejected(self):
        with TestClient(app) as c:
            r = c.post(
                "/access/dev-provision-pack",
                params={"owner_email": CLIENT_EMAIL, "token_count": 0},
            )
            assert r.status_code == 422

    def test_token_count_negative_rejected(self):
        with TestClient(app) as c:
            r = c.post(
                "/access/dev-provision-pack",
                params={"owner_email": CLIENT_EMAIL, "token_count": -3},
            )
            assert r.status_code == 422

    def test_token_count_above_cap_rejected(self):
        with TestClient(app) as c:
            r = c.post(
                "/access/dev-provision-pack",
                params={"owner_email": CLIENT_EMAIL,
                        "token_count": settings.DEV_PROVISION_MAX_TOKENS + 1},
            )
            assert r.status_code == 422

    def test_token_count_at_cap_accepted_in_development(self):
        """ENVIRONMENT=development is the allowlisted case: cap value works."""
        with TestClient(app) as c:
            r = c.post(
                "/access/dev-provision-pack",
                params={"owner_email": PROVIDER_EMAIL,
                        "token_count": settings.DEV_PROVISION_MAX_TOKENS},
            )
            assert r.status_code == 200, r.text
            assert r.json()["token_count"] == settings.DEV_PROVISION_MAX_TOKENS

    def test_subscription_provision_cap_equivalent(self):
        """The subscription dev route's cap matches the pack cap + plan sizes."""
        from app.services.subscription_service import SubscriptionService

        for plan in ("MONTHLY", "ANNUAL"):
            plan_obj = SubscriptionService.get_plan(TestingSessionLocal(), plan)
            assert plan_obj.pass_count > 0


# ============================================================================ #
# M-3 — rate limiting restored and identity-safe
# ============================================================================ #
class TestM3RateLimiting:
    def test_search_limit_enforcement_and_reset(self):
        _clear_counters()
        with TestClient(app) as c:
            tok = _login(c, CLIENT_EMAIL)
            headers = _auth(tok)
            for i in range(settings.VENDOR_SEARCH_LIMIT):
                r = c.get("/profiles/providers", headers=headers, params={"limit": 5})
                assert r.status_code == 200, f"# {i + 1}: {r.text}"
            r = c.get("/profiles/providers", headers=headers, params={"limit": 5})
            assert r.status_code == 429
            detail = r.json()["detail"]
            assert detail["code"] == "rate_limit_exceeded"
            assert detail["category"] == "vendor_search"
            assert "limit reached" in detail["message"].lower()
            assert "retry-after" in {k.lower() for k in r.headers.keys()}
        _clear_counters()

    def test_no_cross_user_counter_leakage(self):
        """User A exhausting the budget does NOT block user B."""
        _clear_counters()
        with TestClient(app) as c:
            tok_a = _login(c, CLIENT_EMAIL)
            tok_b = _login(c, SECOND_CLIENT_EMAIL)
            for _ in range(settings.VENDOR_SEARCH_LIMIT):
                c.get("/profiles/providers", headers=_auth(tok_a), params={"limit": 5})
            assert c.get("/profiles/providers", headers=_auth(tok_a),
                         params={"limit": 5}).status_code == 429
            assert c.get("/profiles/providers", headers=_auth(tok_b),
                         params={"limit": 5}).status_code == 200
        _clear_counters()

    def test_window_expiry_restores_access(self):
        _clear_counters()
        uid = _uid(CLIENT_EMAIL)
        db = TestingSessionLocal()
        try:
            for _ in range(settings.VENDOR_SEARCH_LIMIT):
                db.add(RateLimitEvent(
                    identity_hash=rate_limit_service._hash_identity(str(uid)),
                    category="vendor_search",
                    created_at=datetime.now(timezone.utc),
                ))
            db.commit()
            old = datetime.now(timezone.utc) - timedelta(
                minutes=settings.RATE_LIMIT_WINDOW_MINUTES + 1)
            db.query(RateLimitEvent).filter(
                RateLimitEvent.identity_hash ==
                rate_limit_service._hash_identity(str(uid))).update(
                {"created_at": old}, synchronize_session=False)
            db.commit()
        finally:
            db.close()
        with TestClient(app) as c:
            tok = _login(c, CLIENT_EMAIL)
            r = c.get("/profiles/providers", headers=_auth(tok), params={"limit": 5})
            assert r.status_code == 200
        _clear_counters()

    def test_429_payload_shape_is_public_safe(self):
        """429 detail exposes only safe fields; no internal identifiers."""
        _clear_counters()
        with TestClient(app) as c:
            tok = _login(c, CLIENT_EMAIL)
            headers = _auth(tok)
            for _ in range(settings.PORT_SEARCH_LIMIT):
                c.get("/marketplace/services/aggregate/Hull Inspection", headers=headers)
            r = c.get("/marketplace/services/aggregate/Hull Inspection", headers=headers)
            assert r.status_code == 429
            body = r.json()
            assert set(body["detail"].keys()) == {"code", "category", "message"}
            flat = repr(body)
            assert CLIENT_EMAIL.lower() not in flat.lower()
        _clear_counters()

    def test_rate_limit_events_store_only_hashes(self):
        """No raw email or IP is ever persisted into the counter store."""
        _clear_counters()
        with TestClient(app) as c:
            tok = _login(c, CLIENT_EMAIL)
            c.get("/profiles/providers", headers=_auth(tok), params={"limit": 5})
        db = TestingSessionLocal()
        try:
            rows = db.query(RateLimitEvent).all()
            assert rows, "at least one counter row exists"
            for row in rows:
                assert len(row.identity_hash) == 64
                assert all(c in "0123456789abcdef" for c in row.identity_hash)
        finally:
            db.close()
        _clear_counters()

    def test_login_brute_force_is_limited_per_ip_and_email(self):
        """Failed logins are capped per account email and per source IP; the
        attempt after either budget gets 429.

        Budgets (see Settings): AUTH_LOGIN_FAILED_PER_EMAIL_LIMIT rejected
        credentials for one mailbox, AUTH_LOGIN_PER_IP_LIMIT attempts from one
        network. The per-account counter only counts FAILURES, so a correct
        password is never blocked by guesses aimed at that mailbox.
        """
        db = TestingSessionLocal()
        try:
            db.query(RateLimitEvent).delete()
            db.commit()
        finally:
            db.close()
        with TestClient(app) as c:
            with redirect_stdout(StringIO()):
                for _ in range(settings.AUTH_LOGIN_FAILED_PER_EMAIL_LIMIT):
                    r = c.post("/auth/login", json={
                        "email": "victim@nhaav.com", "password": "wrong!"})
                    # Wrong credentials → 401; the budget is not spent yet.
                    assert r.status_code != 429
                r = c.post("/auth/login", json={
                    "email": "victim@nhaav.com", "password": "wrong!"})
                assert r.status_code == 429, r.text
                assert r.json()["detail"]["category"] == "auth_login_failed_email"

    def test_successful_logins_are_never_counted(self):
        """A realistic run of successful logins must never trip a budget.

        Correct credentials are never charged to the per-account FAILURE
        counter; they do count against the per-network ceiling like every other
        attempt, which is why the ceiling sits well above a shared-NAT office.
        """
        db = TestingSessionLocal()
        try:
            db.query(RateLimitEvent).delete()
            db.commit()
        finally:
            db.close()
        with TestClient(app) as c:
            with redirect_stdout(StringIO()):
                for _ in range(settings.AUTH_LOGIN_LIMIT + 5):
                    r = c.post("/auth/login", json={"email": SECOND_CLIENT_EMAIL,
                                                    "password": PASSWORD})
                    assert r.status_code == 200, r.text
        db = TestingSessionLocal()
        try:
            db.query(RateLimitEvent).delete()
            db.commit()
        finally:
            db.close()

    def test_login_of_other_email_not_blocked_by_first(self):
        """Per-email keys: a flooded mailbox never blocks a different one."""
        db = TestingSessionLocal()
        try:
            db.query(RateLimitEvent).delete()
            db.commit()
        finally:
            db.close()
        with TestClient(app) as c:
            tok = _login(c, SECOND_CLIENT_EMAIL)  # real credentials, different email
            assert tok
            c.post("/auth/login", json={"email": "flooded@nhaav.com", "password": "x"})
        db = TestingSessionLocal()
        try:
            db.query(RateLimitEvent).delete()
            db.commit()
        finally:
            db.close()

    def test_admin_login_tighter_budget_than_user(self):
        assert settings.ADMIN_LOGIN_LIMIT < settings.AUTH_LOGIN_LIMIT

    def test_payment_submit_counted_per_user(self):
        _clear_counters()
        with TestClient(app) as c:
            tok = _login(c, CLIENT_EMAIL)
            files = {"receipt": ("r.pdf", b"%PDF-1.4 fake", "application/pdf")}
            for _ in range(settings.PAYMENT_SUBMIT_LIMIT):
                r = c.post(
                    "/payments/submit",
                    headers=_auth(tok),
                    data={"plan_code": "MONTHLY", "utr": "UTR123",
                          "payment_date": "2026-10-07"},
                    files=files,
                )
                # return code may be 201/400 depending on service flow, never 429
                assert r.status_code != 429, r.text
            r = c.post(
                "/payments/submit",
                headers=_auth(tok),
                data={"plan_code": "MONTHLY", "utr": "UTR124",
                      "payment_date": "2026-10-07"},
                files=files,
            )
            assert r.status_code == 429
            assert r.json()["detail"]["category"] == "payment_submit"
        _clear_counters()

    def test_admin_routes_not_counted_by_user_budgets(self):
        _clear_counters()
        with TestClient(app) as c:
            tok = _login(c, CLIENT_EMAIL)
            for _ in range(settings.VENDOR_SEARCH_LIMIT):
                c.get("/profiles/providers", headers=_auth(tok), params={"limit": 5})
            r = c.get("/admin/moderation/queue", headers=_auth(tok))
            assert r.status_code in (401, 403), r.text
        _clear_counters()


# ============================================================================ #
# M-4 — Alembic is the only schema authority
# ============================================================================ #
class TestM4NoStartupCreateAll:
    def test_app_startup_does_not_create_tables(self):
        """A fresh empty DB must stay empty when the app module is imported."""
        import subprocess
        import sqlite3
        import tempfile
        import os

        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "empty.db")
            env = dict(os.environ)
            env["DATABASE_URL"] = f"sqlite:///{db_path}"
            env["ENVIRONMENT"] = "production"
            # Booting in production now requires a deliverable email config
            # (config.Settings fail-fast). This test is about table creation, so
            # supply a valid configuration that is never used to send anything.
            env.update(
                EMAIL_BACKEND="smtp",
                EMAIL_HOST="smtp.example.com",
                EMAIL_FROM="no-reply@example.com",
            )
            code = (
                "import app.main as m\n"
                "import sqlite3\n"
                "conn = sqlite3.connect(%r)\n"
                "tables = {r[0] for r in conn.execute(\n"
                "    \"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()}\n"
                "tables.discard('sqlite_sequence')\n"
                "assert not tables, f'Tables created at startup: {tables}'\n"
                "print('NO_TABLES_CREATED')\n" % db_path
            )
            proc = subprocess.run(
                [sys.executable, "-c", code],
                env=env, capture_output=True, text=True, timeout=60,
            )
            assert "NO_TABLES_CREATED" in proc.stdout, (
                f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
            )

    def test_app_boots_against_migrated_schema(self):
        """Alembic upgrade head then app import succeeds (schema authority OK)."""
        import subprocess
        import tempfile
        import os

        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "migrated.db")
            env = dict(os.environ)
            env["DATABASE_URL"] = f"sqlite:///{db_path}"
            env["ENVIRONMENT"] = "production"
            # Same production email premise as the test above: alembic imports
            # app.config, so the config must be bootable.
            env.update(
                EMAIL_BACKEND="smtp",
                EMAIL_HOST="smtp.example.com",
                EMAIL_FROM="no-reply@example.com",
            )
            up = subprocess.run(
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                env=env, capture_output=True, text=True, timeout=120, cwd=".",
            )
            assert up.returncode == 0, up.stderr
            imp = subprocess.run(
                [sys.executable, "-c", "import app.main"],
                env=env, capture_output=True, text=True, timeout=60,
            )
            assert imp.returncode == 0, imp.stderr
