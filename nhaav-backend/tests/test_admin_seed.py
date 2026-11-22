"""Admin seeding — production-safe credentials.

Admin identity lives in the ``users`` table with ``role = admin`` (there is no
separate admin credential store; see app/routers/admin_auth.py). Covers:

- Public registration cannot create an admin account.
- Missing production admin configuration fails safely (no DB writes).
- The seed script never silently overwrites an existing admin password.
- An explicit --reset-password request rotates the password.
- Admin login works with environment-configured credentials.
- Normal client/provider authentication remains unaffected.
- The seed script never prints the password.
"""
import sys
from io import StringIO
from typing import Optional

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.seed_admin import seed_admin

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_admin_seed.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    if previous is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous
    Base.metadata.drop_all(bind=engine)


# Own simulated client IP: per-IP auth budgets are process-wide, so this module
# must not spend another module's login allowance.
client = TestClient(app, headers={"X-Forwarded-For": "198.51.100.31"})

ADMIN_EMAIL = "seed_admin_test@example.com"
ADMIN_PASSWORD = "Env-Secure-Pass-2026!"
OTHER_ADMIN_EMAIL = "seed_admin_2@example.com"
OTHER_ADMIN_PASSWORD = "Env-Secure-Pass-2027!"
CLIENT_EMAIL = "seed_client@example.com"
PROVIDER_EMAIL = "seed_provider@example.com"
USER_PASSWORD = "Password123!"


def _session():
    return TestingSessionLocal()


def _admin_count(email: Optional[str] = None) -> int:
    """Count admin identities (users with role=admin)."""
    db = _session()
    try:
        query = db.query(User).filter(User.role == UserRole.admin)
        if email:
            query = query.filter(User.email == email)
        return query.count()
    finally:
        db.close()


def _login_admin(email: str, password: str):
    return client.post("/admin/auth/login", json={"email": email, "password": password})


# ── 1. Public registration cannot create an admin ──────────────────────────

def test_public_registration_cannot_create_admin():
    res = client.post("/auth/register", json={
        "email": "attacker_admin@example.com",
        "password": "Password123!",
        "role": "admin",
        "full_name": "Attacker",
    })
    assert res.status_code in (400, 403, 422), f"Admin registration should be rejected, got {res.status_code}"
    assert _admin_count("attacker_admin@example.com") == 0, "No admin may exist after rejected registration"


def test_public_registration_creates_only_client_and_provider():
    """Sanity: normal registration still works and never creates an admin row."""
    res = client.post("/auth/register", json={
        "email": CLIENT_EMAIL,
        "password": USER_PASSWORD,
        "role": "client",
        "full_name": "Seed Client",
    })
    assert res.status_code == 201
    res = client.post("/auth/register", json={
        "email": PROVIDER_EMAIL,
        "password": USER_PASSWORD,
        "role": "provider",
        "full_name": "Seed Provider",
    })
    assert res.status_code == 201
    assert _admin_count() == 0, "No admin should be created by public registration"


# ── 2. Missing production admin configuration fails safely ──────────────────

def test_missing_production_config_fails_safely(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)

    db = _session()
    try:
        with pytest.raises(RuntimeError, match="ADMIN_EMAIL and ADMIN_PASSWORD"):
            seed_admin(environment="production", db=db)
    finally:
        db.close()

    assert _admin_count() == 0, "No admin account may be created without production configuration"


def test_seed_skips_safely_in_development_without_credentials(monkeypatch, capsys):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)

    db = _session()
    try:
        result = seed_admin(environment="development", db=db)
    finally:
        db.close()

    assert result is None, "Seed should report 'skipped' in dev without env credentials"
    assert _admin_count() == 0, "Seed must not create an admin without credentials"
    assert "skipped" in capsys.readouterr().out


# ── 3. Seed creates admin from env; login works; password never printed ─────

def test_seed_creates_admin_from_env_and_login_works(monkeypatch, capsys):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("ADMIN_EMAIL", ADMIN_EMAIL)
    monkeypatch.setenv("ADMIN_PASSWORD", ADMIN_PASSWORD)
    monkeypatch.setenv("ADMIN_NAME", "Env Config Admin")

    old_stdout = sys.stdout
    sys.stdout = buf = StringIO()
    db = _session()
    try:
        result = seed_admin(db=db)
    finally:
        sys.stdout = old_stdout
        db.close()

    assert result == ADMIN_EMAIL
    assert _admin_count(ADMIN_EMAIL) == 1

    # Password (or any token) must never be printed.
    assert ADMIN_PASSWORD not in buf.getvalue()

    res = _login_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert res.status_code == 200, f"Admin login with configured credentials failed: {res.text}"
    assert "access_token" in res.json()


# ── 4. Seed never silently overwrites an existing password ──────────────────

def test_seed_does_not_overwrite_existing_password(monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", ADMIN_EMAIL)
    monkeypatch.setenv("ADMIN_PASSWORD", ADMIN_PASSWORD)
    db = _session()
    try:
        seed_admin(db=db)
    finally:
        db.close()

    # Second run with a DIFFERENT password (no reset flag) must NOT rotate it.
    monkeypatch.setenv("ADMIN_PASSWORD", "Should-Not-Win-2026!")
    db = _session()
    try:
        result = seed_admin(db=db)
    finally:
        db.close()

    assert result == ADMIN_EMAIL
    assert _login_admin(ADMIN_EMAIL, ADMIN_PASSWORD).status_code == 200, \
        "Original password must still work after a non-reset seed run"
    assert _login_admin(ADMIN_EMAIL, "Should-Not-Win-2026!").status_code == 401, \
        "New password must NOT be applied without an explicit reset"


def test_seed_explicit_reset_rotates_password(monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", ADMIN_EMAIL)
    monkeypatch.setenv("ADMIN_PASSWORD", ADMIN_PASSWORD)
    db = _session()
    try:
        seed_admin(db=db)
    finally:
        db.close()

    monkeypatch.setenv("ADMIN_PASSWORD", "Rotated-Pass-2026!")
    db = _session()
    try:
        result = seed_admin(reset_password=True, db=db)
    finally:
        db.close()

    assert result == ADMIN_EMAIL
    assert _login_admin(ADMIN_EMAIL, "Rotated-Pass-2026!").status_code == 200
    assert _login_admin(ADMIN_EMAIL, ADMIN_PASSWORD).status_code == 401


# ── 5. Admin login works with separately configured credentials ─────────────

def test_admin_login_with_second_configured_account(monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", OTHER_ADMIN_EMAIL)
    monkeypatch.setenv("ADMIN_PASSWORD", OTHER_ADMIN_PASSWORD)
    db = _session()
    try:
        seed_admin(db=db)
    finally:
        db.close()

    res = _login_admin(OTHER_ADMIN_EMAIL, OTHER_ADMIN_PASSWORD)
    assert res.status_code == 200, f"Admin login for second account failed: {res.text}"
    assert _login_admin(OTHER_ADMIN_EMAIL, "wrong-password").status_code == 401


# ── 6. Normal client/provider authentication remains unaffected ─────────────

def test_client_and_provider_auth_unaffected():
    res = client.post("/auth/login", json={"email": CLIENT_EMAIL, "password": USER_PASSWORD})
    assert res.status_code == 200, f"Client login should still work: {res.text}"

    res = client.post("/auth/login", json={"email": PROVIDER_EMAIL, "password": USER_PASSWORD})
    assert res.status_code == 200, f"Provider login should still work: {res.text}"

    client_token = client.post(
        "/auth/login", json={"email": CLIENT_EMAIL, "password": USER_PASSWORD}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {client_token}"}
    res = client.get("/admin/verification/stats", headers=headers)
    assert res.status_code in (401, 403), "Client token must not access admin endpoints"
