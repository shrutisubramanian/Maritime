"""Admin/user auth separation.

Admin identity lives in the ``users`` table with ``role = admin`` and a separate
session at ``/admin/auth/*`` (see app/routers/admin_auth.py). There is no second
credential store. Covers:

 1. Client can register.
 2. Provider can register.
 3. Attempt to register as admin -> rejected.
 4. Client can login.
 5. Provider can login.
 6. Admin can login through /admin/auth/login.
 7. Client accessing /admin/* -> 403.
 8. Provider accessing /admin/* -> 403.
 9. Admin accessing /admin/* -> allowed.
10. Existing client/provider marketplace flows continue working.
11. An admin action takes effect (and stays admin-only).

Registration delivery goes to the console backend (forced for the whole test
session by conftest.py), so no real email is sent.
"""
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import pytest

from app.main import app
from app.database import Base, get_db
from app.models.document import Document, DocumentType
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_admin_auth.db"
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
    Base.metadata.drop_all(bind=engine)
    if previous is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous


# Own simulated client IP: per-IP auth budgets are process-wide, so this module
# must not spend another module's login allowance.
client = TestClient(app, headers={"X-Forwarded-For": "198.51.100.32"})

CLIENT_EMAIL = "test_client_sep@example.com"
CLIENT_PASSWORD = "Password123!"
PROVIDER_EMAIL = "test_provider_sep@example.com"
PROVIDER_PASSWORD = "Password123!"
ADMIN_EMAIL = "admin_sep_test@nhaavmaritime.com"
ADMIN_PASSWORD = "Admin@123"
ADMIN_NAME = "Test Admin"


@pytest.fixture(scope="module")
def seed_admin():
    """Seed a test admin as a User with role=admin (the only admin store)."""
    db = TestingSessionLocal()
    try:
        admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if not admin:
            admin = User(
                email=ADMIN_EMAIL,
                password_hash=hash_password(ADMIN_PASSWORD),
                role=UserRole.admin,
                full_name=ADMIN_NAME,
                is_verified=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        return str(admin.id)
    finally:
        db.close()


# ── Cases 1–3: Registration ──────────────────────────────────────────────────

def test_case_1_client_can_register():
    res = client.post("/auth/register", json={
        "email": CLIENT_EMAIL,
        "password": CLIENT_PASSWORD,
        "role": "client",
        "full_name": "Test Client User",
    })
    assert res.status_code == 201, f"Client registration failed: {res.text}"
    body = res.json()
    assert body["email"] == CLIENT_EMAIL
    assert body["role"] == "client"


def test_case_2_provider_can_register():
    res = client.post("/auth/register", json={
        "email": PROVIDER_EMAIL,
        "password": PROVIDER_PASSWORD,
        "role": "provider",
        "full_name": "Test Provider User",
    })
    assert res.status_code == 201, f"Provider registration failed: {res.text}"
    body = res.json()
    assert body["email"] == PROVIDER_EMAIL
    assert body["role"] == "provider"


def test_case_3_admin_registration_rejected():
    """Registering as 'admin' must be refused at the schema or service layer."""
    res = client.post("/auth/register", json={
        "email": "fake_admin@example.com",
        "password": "Password123!",
        "role": "admin",
    })
    assert res.status_code in (400, 403, 422), (
        f"Admin registration should be rejected, got {res.status_code}"
    )
    db = TestingSessionLocal()
    try:
        assert db.query(User).filter(User.email == "fake_admin@example.com").first() is None
    finally:
        db.close()


# ── Cases 4–6: Login ──────────────────────────────────────────────────────────

def test_case_4_client_can_login():
    res = client.post("/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD})
    assert res.status_code == 200, f"Client login failed: {res.text}"
    assert "access_token" in res.json()


def test_case_5_provider_can_login():
    res = client.post("/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD})
    assert res.status_code == 200, f"Provider login failed: {res.text}"
    assert "access_token" in res.json()


def test_case_6_admin_can_login(seed_admin):
    res = client.post("/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    assert "access_token" in res.json()


# ── Cases 7–9: Access Control ─────────────────────────────────────────────────

def _login_token(path: str, email: str, password: str) -> str:
    """Log in and return the token, failing with the server's own answer.

    A bare ``["access_token"]`` lookup turned any refusal (409 device conflict,
    403 no active pass, 429 rate limit) into an opaque KeyError.
    """
    res = client.post(path, json={"email": email, "password": password})
    assert res.status_code == 200, f"Login for {email} failed: {res.status_code} {res.text}"
    token = res.json().get("access_token")
    assert token, f"Login for {email} returned no token: {res.text}"
    return token


def _get_client_token() -> str:
    return _login_token("/auth/login", CLIENT_EMAIL, CLIENT_PASSWORD)


def _get_provider_token() -> str:
    return _login_token("/auth/login", PROVIDER_EMAIL, PROVIDER_PASSWORD)


def _get_admin_token() -> str:
    return _login_token("/admin/auth/login", ADMIN_EMAIL, ADMIN_PASSWORD)


def test_case_7_client_cannot_access_admin():
    headers = {"Authorization": f"Bearer {_get_client_token()}"}
    res = client.get("/admin/verification/stats", headers=headers)
    assert res.status_code in (401, 403), f"Client should be denied, got {res.status_code}"


def test_case_8_provider_cannot_access_admin():
    headers = {"Authorization": f"Bearer {_get_provider_token()}"}
    res = client.get("/admin/verification/stats", headers=headers)
    assert res.status_code in (401, 403), f"Provider should be denied, got {res.status_code}"


def test_case_9_admin_can_access_admin(seed_admin):
    headers = {"Authorization": f"Bearer {_get_admin_token()}"}
    res = client.get("/admin/verification/stats", headers=headers)
    assert res.status_code == 200, f"Admin should get 200, got {res.status_code}"
    assert "pending" in res.json()


# ── Case 10: Marketplace flows ────────────────────────────────────────────────

def test_case_10_marketplace_locked_until_verified_and_subscribed():
    # An authenticated but un-verified / un-subscribed account is confined to
    # its profile: the marketplace refuses it with a clear 403.
    headers = {"Authorization": f"Bearer {_get_client_token()}"}
    res = client.get("/marketplace/category-groups", headers=headers)
    assert res.status_code == 403, f"Locked account must be refused, got {res.status_code}"
    assert res.json()["detail"]["code"] == "onboarding_incomplete"


# ── Case 11: Admin action takes effect ───────────────────────────────────────

def test_case_11_admin_action_takes_effect(seed_admin):
    """An admin verification action changes state, and only an admin can do it."""
    db = TestingSessionLocal()
    try:
        provider = db.query(User).filter(User.email == PROVIDER_EMAIL).first()
        profile = db.query(Profile).filter(Profile.user_id == provider.id).first()
        if profile is None:
            profile = Profile(
                user_id=provider.id,
                company_name="Sep Test Co",
                verification_status=VerificationStatus.pending,
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)
        # An approval is refused until the reviewer has a document to look at
        # (admin_verification._approval_blockers), so the vendor submits one
        # first — the same order a real account goes through.
        has_document = (
            db.query(Document).filter(Document.user_id == provider.id).first()
            is not None
        )
        if not has_document:
            db.add(
                Document(
                    user_id=provider.id,
                    document_type=DocumentType.vendor_registration,
                    file_url="https://storage.example.com/vendor-registration.pdf",
                    name="Vendor registration",
                )
            )
            db.commit()
        profile_id = profile.id
    finally:
        db.close()

    # A non-admin cannot perform the action.
    client_headers = {"Authorization": f"Bearer {_get_client_token()}"}
    denied = client.post(
        f"/admin/verification/providers/{profile_id}/action",
        json={"action": "approve", "reason": "should be denied"},
        headers=client_headers,
    )
    assert denied.status_code in (401, 403)

    # The admin can, and the profile is actually verified.
    admin_headers = {"Authorization": f"Bearer {_get_admin_token()}"}
    res = client.post(
        f"/admin/verification/providers/{profile_id}/action",
        json={"action": "approve", "reason": "Sep test approval"},
        headers=admin_headers,
    )
    assert res.status_code == 200, f"Admin action failed: {res.text}"

    db = TestingSessionLocal()
    try:
        refreshed = db.query(Profile).filter(Profile.id == profile_id).first()
        assert refreshed.verification_status == VerificationStatus.verified
    finally:
        db.close()
