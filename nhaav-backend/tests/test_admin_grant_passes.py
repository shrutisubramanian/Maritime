"""Admin-issued access packs: the two fixed options.

The admin panel may hand an account passes directly, but only in the two sizes
the product offers — 10 passes for 6 months, or 100 passes for 12 months. The
server owns both numbers, so a crafted request cannot mint an arbitrary pack.

A CLIENT also has to clear the onboarding gate (verified profile + paid platform
fee), so granting passes to a client whose plan is not active opens the plan for
the pack's window. Otherwise the admin would hand out passes that change nothing.

Runs against its own SQLite file (the test_h9_* pattern).
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.access_token import AccessPack, AccessToken
from app.models.profile import Profile, VerificationStatus
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_admin_grant_passes.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "Password123!"
ADMIN_EMAIL = "grant_admin@nhaav.com"
CLIENT_EMAIL = "grant_client@nhaav.com"


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    # Manual issue is OFF in production; these tests exercise the exceptional
    # offline path an operator has to enable deliberately.
    _manual_grants = pytest.MonkeyPatch()
    _manual_grants.setattr(settings, "ALLOW_MANUAL_PASS_GRANTS", True)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    try:
        admin = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(PASSWORD),
            role=UserRole.admin,
            full_name="Grant Admin",
            is_verified=True,
        )
        client = User(
            email=CLIENT_EMAIL,
            password_hash=hash_password(PASSWORD),
            role=UserRole.client,
            full_name="Grant Client",
            is_verified=True,
        )
        db.add_all([admin, client])
        db.flush()
        # Verified but NOT paid: this is exactly the account the gate holds back
        # until an admin issues something.
        db.add(
            Profile(
                user_id=client.id,
                company_name="Grant Client Co",
                verification_status=VerificationStatus.verified,
            )
        )
        db.commit()
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)
    _manual_grants.undo()


def _token(email: str) -> str:
    r = TestClient(app).post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _client_profile_id() -> str:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == CLIENT_EMAIL).first()
        return str(db.query(Profile).filter(Profile.user_id == user.id).first().id)
    finally:
        db.close()


def _passed_days(pack_id: str) -> int:
    """Days between issuance and the unused-expiry stamped on the pack's passes."""
    db = TestingSessionLocal()
    try:
        row = (
            db.query(AccessToken)
            .filter(AccessToken.pack_id == uuid.UUID(pack_id))
            .first()
        )
        assert row is not None
        return round((row.unused_expires_at - row.available_at).total_seconds() / 86400)
    finally:
        db.close()


def test_client_is_locked_until_passes_are_granted():
    headers = _auth(_token(CLIENT_EMAIL))
    state = TestClient(app).get("/access/onboarding", headers=headers).json()
    assert state["payment_required"] is True
    assert state["subscription_active"] is False
    assert state["marketplace_unlocked"] is False


def test_admin_grants_ten_passes_for_six_months():
    admin = TestClient(app)
    headers = _auth(_token(ADMIN_EMAIL))

    res = admin.post(
        f"/admin/verification/providers/{_client_profile_id()}/grant-passes",
        json={
            "pack": "10",
            "reason": "Bank transfer settled offline, UTR-ABC-123",
            "confirm_no_payment": True,
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["passes_granted"] == 10
    assert body["validity_months"] == 6
    assert 180 <= body["validity_days"] <= 185
    assert body["subscription_opened"] is True

    # The passes are real, with the pack's own six-month window.
    assert 180 <= _passed_days(body["pack_id"]) <= 185

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == CLIENT_EMAIL).first()
        assert db.query(AccessToken).filter(AccessToken.owner_user_id == user.id).count() == 10
        active = (
            db.query(Subscription)
            .filter(
                Subscription.owner_user_id == user.id,
                Subscription.status == SubscriptionStatus.ACTIVE,
            )
            .count()
        )
        assert active == 1
    finally:
        db.close()

    # …and the client can actually get in now.
    client_headers = _auth(_token(CLIENT_EMAIL))
    state = TestClient(app).get("/access/onboarding", headers=client_headers).json()
    assert state["subscription_active"] is True
    assert state["marketplace_unlocked"] is True


def test_admin_grants_a_hundred_passes_for_twelve_months():
    admin = TestClient(app)
    headers = _auth(_token(ADMIN_EMAIL))

    res = admin.post(
        f"/admin/verification/providers/{_client_profile_id()}/grant-passes",
        json={
            "pack": "100",
            "reason": "Annual fee settled offline, UTR-DEF-456",
            "confirm_no_payment": True,
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["passes_granted"] == 100
    assert body["validity_months"] == 12
    assert 360 <= body["validity_days"] <= 366
    assert 360 <= _passed_days(body["pack_id"]) <= 366

    # A second pack is additive; the earlier active plan is left alone.
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == CLIENT_EMAIL).first()
        assert db.query(AccessToken).filter(AccessToken.owner_user_id == user.id).count() == 110
    finally:
        db.close()


def test_a_non_admin_cannot_grant_passes():
    headers = _auth(_token(CLIENT_EMAIL))
    res = TestClient(app).post(
        f"/admin/verification/providers/{_client_profile_id()}/grant-passes",
        json={"pack": "10"},
        headers=headers,
    )
    assert res.status_code == 403, res.text


def test_an_unsupported_pack_is_refused_with_the_two_options():
    headers = _auth(_token(ADMIN_EMAIL))
    res = TestClient(app).post(
        f"/admin/verification/providers/{_client_profile_id()}/grant-passes",
        json={"pack": "500"},
        headers=headers,
    )
    assert res.status_code == 422, res.text
    detail = res.json()["detail"]
    assert detail["code"] == "unsupported_pack"
    assert {(o["pack"], o["passes"], o["validity_months"]) for o in detail["options"]} == {
        ("10", 10, 6),
        ("100", 100, 12),
    }


def test_manual_grants_are_disabled_by_default(monkeypatch):
    """The production rule is payment-first: without an explicit operator
    switch the endpoint refuses and mints nothing."""
    monkeypatch.setattr(settings, "ALLOW_MANUAL_PASS_GRANTS", False)
    headers = _auth(_token(ADMIN_EMAIL))

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == CLIENT_EMAIL).first()
        before = db.query(AccessToken).filter(AccessToken.owner_user_id == user.id).count()
    finally:
        db.close()

    res = TestClient(app).post(
        f"/admin/verification/providers/{_client_profile_id()}/grant-passes",
        json={
            "pack": "10",
            "reason": "Trying the disabled manual path",
            "confirm_no_payment": True,
        },
        headers=headers,
    )
    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "manual_grants_disabled"

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == CLIENT_EMAIL).first()
        after = db.query(AccessToken).filter(AccessToken.owner_user_id == user.id).count()
    finally:
        db.close()
    assert after == before, "a disabled manual grant must not mint passes"


def test_a_manual_grant_needs_a_reason_and_no_payment_confirmation():
    headers = _auth(_token(ADMIN_EMAIL))
    path = f"/admin/verification/providers/{_client_profile_id()}/grant-passes"

    no_reason = TestClient(app).post(
        path,
        json={"pack": "10", "confirm_no_payment": True},
        headers=headers,
    )
    assert no_reason.status_code == 422, no_reason.text
    assert no_reason.json()["detail"]["code"] == "grant_reason_required"

    no_confirmation = TestClient(app).post(
        path,
        json={"pack": "10", "reason": "Bank transfer settled offline, UTR-GHI-789"},
        headers=headers,
    )
    assert no_confirmation.status_code == 422, no_confirmation.text
    assert (
        no_confirmation.json()["detail"]["code"]
        == "no_payment_confirmation_required"
    )


def test_the_manual_grant_is_reported_as_not_payment_linked():
    headers = _auth(_token(ADMIN_EMAIL))
    reason = "Complimentary access approved by the director"
    res = TestClient(app).post(
        f"/admin/verification/providers/{_client_profile_id()}/grant-passes",
        json={"pack": "10", "reason": reason, "confirm_no_payment": True},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["payment_linked"] is False
    assert body["reason"] == reason


def test_the_grant_policy_reports_the_payment_rule():
    headers = _auth(_token(ADMIN_EMAIL))
    res = TestClient(app).get(
        "/admin/verification/pass-grants/policy", headers=headers
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["enabled"] is True
    assert body["requires_reason"] is True
    assert body["requires_no_payment_confirmation"] is True
    assert {p["passes"] for p in body["packs"]} == {10, 100}


def test_a_non_admin_cannot_read_the_grant_policy():
    headers = _auth(_token(CLIENT_EMAIL))
    res = TestClient(app).get(
        "/admin/verification/pass-grants/policy", headers=headers
    )
    assert res.status_code == 403, res.text
