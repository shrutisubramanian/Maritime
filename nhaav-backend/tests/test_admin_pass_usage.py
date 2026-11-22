"""Admin pass-usage reporting: who is spending passes, when, and what is left.

Verifies the read-only admin view against the pass rows the entitlement system
already writes — no new tables, no fabricated figures.
"""
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models.access_token import AccessToken, AccessTokenStatus
from app.models.profile import Profile, VerificationStatus
from app.models.user import User, UserRole
from app.services.access_token_service import AccessTokenService
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_admin_pass_usage.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "Password123!"
ADMIN_EMAIL = "passes_admin@nhaav.com"
CLIENT_EMAIL = "passes_client@nhaav.com"
EMPTY_EMAIL = "passes_nopack@nhaav.com"


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
    admin = User(
        email=ADMIN_EMAIL,
        password_hash=hash_password(PASSWORD),
        role=UserRole.admin,
        full_name="Pass Admin",
        is_verified=True,
    )
    client = User(
        email=CLIENT_EMAIL,
        password_hash=hash_password(PASSWORD),
        role=UserRole.client,
        full_name="Pass Client",
        is_verified=True,
    )
    empty = User(
        email=EMPTY_EMAIL,
        password_hash=hash_password(PASSWORD),
        role=UserRole.client,
        full_name="No Pack",
        is_verified=True,
    )
    db.add_all([admin, client, empty])
    db.flush()
    db.add_all(
        [
            Profile(
                user_id=client.id,
                company_name="Pass Client Co",
                verification_status=VerificationStatus.verified,
            ),
            Profile(
                user_id=empty.id,
                company_name="No Pack Co",
                verification_status=VerificationStatus.verified,
            ),
        ]
    )
    db.commit()

    # 10 passes, then one live session and one finished session.
    pack = AccessTokenService.provision_pack(db, client, token_count=10, source="admin_grant")
    now = datetime.utcnow()
    tokens = (
        db.query(AccessToken)
        .filter(AccessToken.pack_id == pack.id)
        .order_by(AccessToken.created_at)
        .all()
    )
    tokens[0].status = AccessTokenStatus.active
    tokens[0].current_user_id = client.id
    tokens[0].activated_at = now - timedelta(hours=1)
    tokens[0].expires_at = now + timedelta(hours=5)
    tokens[1].status = AccessTokenStatus.consumed
    tokens[1].current_user_id = client.id
    tokens[1].activated_at = now - timedelta(hours=4)
    tokens[1].expires_at = now - timedelta(hours=0, minutes=-4)
    tokens[1].consumed_at = now - timedelta(hours=3)
    db.commit()
    yield
    Base.metadata.drop_all(bind=engine)


def _login(email: str) -> TestClient:
    client = TestClient(app)
    response = client.post(
        "/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    client.headers.update(
        {
            "X-Device-Id": f"test-{email}",
            "X-CSRF-Token": client.cookies.get("nhaav_csrf") or "",
        }
    )
    return client


def test_admin_sees_balances_and_last_use():
    admin = _login(ADMIN_EMAIL)
    response = admin.get("/admin/passes/usage")
    assert response.status_code == 200, response.text
    body = response.json()

    row = next(
        (item for item in body["data"] if item["email"] == CLIENT_EMAIL), None
    )
    assert row is not None, body
    assert row["total_passes"] == 10
    assert row["available_passes"] == 8
    assert row["active_passes"] == 1
    assert row["consumed_passes"] == 1
    assert row["expired_passes"] == 0
    assert row["company_name"] == "Pass Client Co"
    assert row["last_used_at"] is not None
    assert row["last_consumed_at"] is not None
    assert row["current_session"] is not None
    assert row["current_session"]["remaining_seconds"] > 4 * 3600
    assert row["current_session"]["activated_at"] is not None
    assert any(pack["source"] == "admin_grant" for pack in row["packs"])

    # An account with no passes owns no row at all.
    assert all(item["email"] != EMPTY_EMAIL for item in body["data"])

    totals = body["totals"]
    assert totals["accounts"] >= 1
    assert totals["available"] >= 8
    assert totals["consumed"] >= 1


def test_admin_sees_each_pass_with_timestamps():
    admin = _login(ADMIN_EMAIL)
    usage = admin.get("/admin/passes/usage").json()["data"]
    client_id = next(item["user_id"] for item in usage if item["email"] == CLIENT_EMAIL)

    response = admin.get(f"/admin/passes/usage/{client_id}")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["account"]["email"] == CLIENT_EMAIL
    assert len(body["passes"]) == 10
    activated = [p for p in body["passes"] if p["activated_at"]]
    consumed = [p for p in body["passes"] if p["consumed_at"]]
    assert len(activated) == 2
    assert len(consumed) == 1
    assert all(p["session_seconds"] > 0 for p in activated)
    statuses = {p["status"] for p in body["passes"]}
    assert "AVAILABLE" in statuses and "ACTIVE" in statuses and "CONSUMED" in statuses


def test_non_admin_is_refused():
    client = _login(CLIENT_EMAIL)
    assert client.get("/admin/passes/usage").status_code == 403
    usage = _login(ADMIN_EMAIL).get("/admin/passes/usage").json()["data"]
    client_id = next(item["user_id"] for item in usage if item["email"] == CLIENT_EMAIL)
    assert client.get(f"/admin/passes/usage/{client_id}").status_code == 403


def test_expired_session_is_reported_as_consumed():
    """A 6-hour pass past its expiry is swept to CONSUMED before reporting."""
    db = TestingSessionLocal()
    client = db.query(User).filter(User.email == CLIENT_EMAIL).first()
    active = (
        db.query(AccessToken)
        .filter(
            AccessToken.owner_user_id == client.id,
            AccessToken.status == AccessTokenStatus.active,
        )
        .first()
    )
    active.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()

    admin = _login(ADMIN_EMAIL)
    row = next(
        item
        for item in admin.get("/admin/passes/usage").json()["data"]
        if item["email"] == CLIENT_EMAIL
    )
    assert row["active_passes"] == 0
    assert row["consumed_passes"] == 2
    assert row["available_passes"] == 8
    assert row["current_session"] is None
    assert row["last_consumed_at"] is not None
    db.close()
