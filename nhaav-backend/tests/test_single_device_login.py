"""ONE DEVICE PER LOGIN.

The rule: an account may use the platform from exactly one device at a time.
The device that logged in owns the session; a second device presenting the same
correct email/password is challenged with a 409 ``device_conflict`` and only
takes the session over if the human confirms ("switch devices?"). The displaced
device's requests are then refused with 401 — its JWT still decodes, but the
session no longer lives there.

Also pinned here:

  * switching devices does NOT consume an extra access pass (the live pass is
    transferred, its 6-hour clock keeps running)
  * logging out releases the device, so the next login from anywhere is
    unchallenged
  * a client that sends no device id at all keeps the previous behaviour
  * admins are platform staff and are never device-locked
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.services.access_token_service import AccessTokenService
from app.utils.password import hash_password
from entitlement_helpers import grant_marketplace_access

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_single_device_login.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "Password123!"
DEVICE_A = {"id": "device-aaa-111", "label": "Chrome on Windows"}
DEVICE_B = {"id": "device-bbb-222", "label": "Safari on iPhone"}


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


client = TestClient(app)


def _register(email: str) -> str:
    resp = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "role": "client",
            "full_name": "Device Tester",
        },
    )
    assert resp.status_code == 201, resp.text
    return email


def _login(email: str, device: dict | None = None, force: bool = False) -> dict:
    body = {"email": email, "password": PASSWORD}
    if device is not None:
        body["device_id"] = device["id"]
        body["device_label"] = device["label"]
    if force:
        body["force_device_switch"] = True
    resp = client.post("/auth/login", json=body)
    return {"status": resp.status_code, "json": resp.json()}


def _token(email: str, device: dict | None = None) -> str:
    result = _login(email, device)
    assert result["status"] == 200, result
    return result["json"]["access_token"]


def _headers(token: str, device: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    if device is not None:
        headers["X-Device-Id"] = device["id"]
    return headers


def _user(email: str) -> User:
    db = TestingSessionLocal()
    try:
        return db.query(User).filter(User.email == email).first()
    finally:
        db.close()


# --------------------------------------------------------------- happy path
def test_first_login_binds_the_device_and_the_same_device_is_never_challenged():
    email = _register("device_one@example.com")

    first = _login(email, DEVICE_A)
    assert first["status"] == 200, first
    assert first["json"]["device_session"]["label"] == DEVICE_A["label"]
    assert first["json"]["device_session"]["switched_from"] is None

    # The same device coming back (reload, second tab, refresh) owns the
    # session already — no challenge, and no second pass either.
    again = _login(email, DEVICE_A)
    assert again["status"] == 200, again
    assert again["json"]["device_session"]["switched_from"] is None
    assert _user(email).active_device_id == DEVICE_A["id"]


def test_second_device_is_challenged_then_takes_the_session_over():
    email = _register("device_two@example.com")
    _login(email, DEVICE_A)

    challenged = _login(email, DEVICE_B)
    assert challenged["status"] == 409, challenged
    detail = challenged["json"]["detail"]
    assert detail["code"] == "device_conflict"
    assert detail["active_device"]["label"] == DEVICE_A["label"]
    assert detail["requesting_device"]["label"] == DEVICE_B["label"]
    # The challenge changes nothing: the first device still owns the session.
    assert _user(email).active_device_id == DEVICE_A["id"]

    # The human confirms -> the retry with force_device_switch takes over.
    switched = _login(email, DEVICE_B, force=True)
    assert switched["status"] == 200, switched
    assert switched["json"]["device_session"]["switched_from"] == DEVICE_A["label"]
    assert _user(email).active_device_id == DEVICE_B["id"]

    # The displaced device is signed out on its very next request.
    stale = client.get(
        "/access/onboarding",
        headers=_headers(switched["json"]["access_token"], DEVICE_A),
    )
    assert stale.status_code == 401, stale.text
    assert "another device" in stale.json()["detail"]

    # ...and the new one works normally.
    live_token = switched["json"]["access_token"]
    assert (
        client.get("/access/onboarding", headers=_headers(live_token, DEVICE_B)).status_code
        == 200
    )


def test_switch_moves_the_live_session_without_burning_a_pass():
    """A paid pass is transferred to the new device; its 6-hour clock continues."""
    email = _register("device_pass@example.com")
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        grant_marketplace_access(db, user)
        AccessTokenService.provision_pack(db, user, token_count=10, source="test")
    finally:
        db.close()

    first = _login(email, DEVICE_A)
    assert first["status"] == 200, first
    session_before = first["json"]["access_session"]
    assert session_before is not None
    assert session_before["reused"] is False  # a pass was allocated

    switched = _login(email, DEVICE_B, force=True)
    assert switched["status"] == 200, switched
    session_after = switched["json"]["access_session"]
    # Same pass, same countdown: switching
    # devices is not a new session.
    assert session_after["expires_at"] == session_before["expires_at"]
    assert session_after["activated_at"] == session_before["activated_at"]
    assert session_after["reused"] is True

    balance = client.get(
        "/access/status",
        headers=_headers(switched["json"]["access_token"], DEVICE_B),
    ).json()
    assert balance["available_tokens"] == 9  # exactly one pass used, not two


def test_logout_releases_the_device_so_the_next_login_is_unchallenged():
    email = _register("device_logout@example.com")
    token = _token(email, DEVICE_A)

    logged_out = client.post("/auth/logout", headers=_headers(token, DEVICE_A))
    assert logged_out.status_code == 200, logged_out.text
    assert _user(email).active_device_id is None

    # Any device may sign in now — logging out IS the way to move deliberately.
    fresh = _login(email, DEVICE_B)
    assert fresh["status"] == 200, fresh


def test_client_without_a_device_id_keeps_working_and_binds_nothing():
    email = _register("device_anon@example.com")

    assert _login(email)["status"] == 200
    assert _login(email)["status"] == 200  # no challenge, ever
    assert _user(email).active_device_id is None
    # A bound-less account is not restricted: an API client with a valid token
    # still reads its own state, device header or not.
    token = _token(email)
    assert client.get("/access/onboarding", headers=_headers(token)).status_code == 200


def test_admin_accounts_are_never_device_locked():
    db = TestingSessionLocal()
    try:
        admin = User(
            email="device_admin@nhaavmaritime.com",
            password_hash=hash_password("Admin@123"),
            role=UserRole.admin,
            full_name="Device Admin",
            is_verified=True,
        )
        db.add(admin)
        db.commit()
        admin_id = admin.id
    finally:
        db.close()

    for device in (DEVICE_A, DEVICE_B):
        resp = client.post(
            "/admin/auth/login",
            json={
                "email": "device_admin@nhaavmaritime.com",
                "password": "Admin@123",
                "device_id": device["id"],
                "device_label": device["label"],
            },
        )
        assert resp.status_code == 200, resp.text

    db = TestingSessionLocal()
    try:
        assert db.query(User).filter(User.id == admin_id).first().active_device_id is None
    finally:
        db.close()
