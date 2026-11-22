"""
Focused suite for the LIVE 6-HOUR ACCESS-PASS COUNTDOWN.

The countdown in the UI is only a renderer. These tests pin the contract it
depends on, at the API boundary:

  * `/subscription/status` and `/access/status` publish the authoritative
    deadline (`expires_at`) and the server-computed `remaining_seconds` for the
    caller's OWN live session — and nothing secret (no access/refresh token, no
    password hash) travels with it
  * `remaining_seconds` agrees with `expires_at` (that difference IS the
    countdown the browser renders)
  * a repeat/re-login REUSES the existing deadline: the timer is never reset and
    no extra pass is burned
  * once the deadline passes, the server reports NO live session (so the client
    must not draw a timer) and protected routes are refused
  * an admin bypasses the pass model entirely, so no timer is published

These are the "countdown calculations / refresh + re-login / expiry / admin
bypass" cases from the timer story, expressed against the real endpoints.
"""
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.access_token import AccessToken, AccessTokenStatus
from app.models.profile import Profile
from app.models.user import User, UserRole
from app.services.access_token_service import SESSION_DURATION_HOURS, AccessTokenService
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_session_countdown.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
    poolclass=None,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _pin_app_db():
    prev = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    if prev is not None:
        app.dependency_overrides[get_db] = prev


def _user(db, email, role=UserRole.client) -> User:
    user = User(
        email=email,
        password_hash=hash_password("Password123!"),
        role=role,
        full_name=email,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(Profile(user_id=user.id, company_name="Countdown Co"))
    db.commit()
    return user


def _login(client: TestClient, email: str, password: str = "Password123!"):
    return client.post("/auth/login", json={"email": email, "password": password})


def _status_payload(client: TestClient, token: str) -> dict:
    resp = client.get(
        "/subscription/status", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _active_row(db, owner: User) -> AccessToken:
    return (
        db.query(AccessToken)
        .filter(
            AccessToken.owner_user_id == owner.id,
            AccessToken.status == AccessTokenStatus.active,
        )
        .first()
    )


class TestCountdownContract:
    def test_status_publishes_the_deadline_and_seconds_left(self):
        """The two fields the live clock renders, and nothing secret."""
        db = TestingSessionLocal()
        owner = _user(db, "clock@c.com")
        AccessTokenService.provision_pack(db, owner, token_count=10)
        db.close()

        client = TestClient(app)
        login = _login(client, "clock@c.com")
        assert login.status_code == 200
        token = login.json()["access_token"]

        body = _status_payload(client, token)
        session = body["active_pass"]
        assert session is not None and session["held_by_me"] is True
        assert session["expires_at"] and session["remaining_seconds"] > 0
        # The browser hardcodes nothing: the server states the session length.
        assert body["session_hours"] == SESSION_DURATION_HOURS

        # Nothing credential-shaped rides along with the countdown payload.
        serialized = repr(body).lower()
        for forbidden in ("access_token", "refresh_token", "password_hash", "jwt"):
            assert forbidden not in serialized

    def test_remaining_seconds_matches_the_deadline(self):
        """
        The countdown is `expires_at - now`. If the server ever sent a remaining
        value that disagreed with its own deadline, the clock would be wrong from
        the first tick, so the two must line up.
        """
        db = TestingSessionLocal()
        owner = _user(db, "math@c.com")
        AccessTokenService.provision_pack(db, owner, token_count=10)
        db.close()

        client = TestClient(app)
        token = _login(client, "math@c.com").json()["access_token"]
        session = _status_payload(client, token)["active_pass"]

        deadline = datetime.fromisoformat(session["expires_at"].replace("Z", ""))
        expected = (deadline - datetime.utcnow()).total_seconds()
        # Generated in the same request, so a few seconds of rounding is all the
        # slack the arithmetic should need.
        assert abs(expected - session["remaining_seconds"]) <= 5
        assert session["remaining_seconds"] <= SESSION_DURATION_HOURS * 3600

    def test_a_full_session_reports_almost_six_hours(self):
        db = TestingSessionLocal()
        owner = _user(db, "full@c.com")
        AccessTokenService.provision_pack(db, owner, token_count=10)
        db.close()

        client = TestClient(app)
        token = _login(client, "full@c.com").json()["access_token"]
        remaining = _status_payload(client, token)["active_pass"]["remaining_seconds"]
        assert remaining > SESSION_DURATION_HOURS * 3600 - 60

    def test_access_status_reports_the_same_window(self):
        """Both status endpoints describe one session — no second timer."""
        db = TestingSessionLocal()
        owner = _user(db, "both@c.com")
        AccessTokenService.provision_pack(db, owner, token_count=10)
        db.close()

        client = TestClient(app)
        token = _login(client, "both@c.com").json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        sub = client.get("/subscription/status", headers=headers).json()["active_pass"]
        access = client.get("/access/status", headers=headers).json()["current_session"]
        assert access is not None
        assert access["expires_at"] == sub["expires_at"]
        assert abs(access["remaining_seconds"] - sub["remaining_seconds"]) <= 5


class TestRefreshAndReLogin:
    def test_repeated_login_keeps_the_same_deadline(self):
        """Re-login must not restart the clock or spend another pass."""
        db = TestingSessionLocal()
        owner = _user(db, "again@c.com")
        AccessTokenService.provision_pack(db, owner, token_count=10)
        db.close()

        client = TestClient(app)
        first = _login(client, "again@c.com").json()
        assert first["access_session"]["reused"] is False
        first_deadline = first["access_session"]["expires_at"]

        second = _login(client, "again@c.com").json()["access_session"]
        assert second["reused"] is True
        assert second["expires_at"] == first_deadline
        # Time only moves forward: the reused window is never longer.
        assert second["remaining_seconds"] <= first["access_session"]["remaining_seconds"]

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "again@c.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["active_tokens"] == 1
        assert status["consumed_tokens"] == 0
        assert status["available_tokens"] == 9
        db.close()

    def test_the_status_endpoint_reports_the_same_deadline_after_a_reload(self):
        """A page reload re-reads the window rather than starting a new one."""
        db = TestingSessionLocal()
        owner = _user(db, "reload@c.com")
        AccessTokenService.provision_pack(db, owner, token_count=10)
        db.close()

        client = TestClient(app)
        token = _login(client, "reload@c.com").json()["access_token"]
        before = _status_payload(client, token)["active_pass"]

        # Reload: a brand-new request with the same session.
        after = _status_payload(client, token)["active_pass"]
        assert after["expires_at"] == before["expires_at"]
        assert after["remaining_seconds"] <= before["remaining_seconds"]

    def test_a_used_up_session_reports_no_active_pass(self):
        """Nothing live => the client must draw no timer (never fabricate one)."""
        db = TestingSessionLocal()
        owner = _user(db, "spent@c.com")
        AccessTokenService.provision_pack(db, owner, token_count=10)
        db.close()

        client = TestClient(app)
        token = _login(client, "spent@c.com").json()["access_token"]

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "spent@c.com").first()
        _active_row(db, user).expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
        db.close()

        body = _status_payload(client, token)
        assert body["active_pass"] is None
        assert client.get(
            "/access/status", headers={"Authorization": f"Bearer {token}"}
        ).json()["current_session"] is None


class TestExpiryAtZero:
    def test_zero_seconds_consumes_the_pass_and_refuses_protected_routes(self):
        """
        The moment the countdown reaches 00:00:00 the backend has already spent
        the pass: the next protected request is a 401 that sends the UI back to
        login through the existing auth flow.
        """
        db = TestingSessionLocal()
        owner = _user(db, "zero@c.com")
        AccessTokenService.provision_pack(db, owner, token_count=10)
        db.close()

        client = TestClient(app)
        token = _login(client, "zero@c.com").json()["access_token"]

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "zero@c.com").first()
        _active_row(db, user)
        _active_row(db, user).expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
        db.close()

        assert client.get(
            "/auth/me", headers={"Authorization": f"Bearer {token}"}
        ).status_code == 401

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "zero@c.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["active_tokens"] == 0
        assert status["consumed_tokens"] == 1
        db.close()


class TestAdminBypass:
    def test_an_admin_gets_no_session_and_no_timer(self):
        db = TestingSessionLocal()
        admin = _user(db, "timer-admin@c.com", role=UserRole.admin)
        admin_email = admin.email
        db.close()

        client = TestClient(app)
        login = _login(client, admin_email)
        assert login.status_code == 200
        assert login.json()["access_session"] is None
        token = login.json()["access_token"]

        body = _status_payload(client, token)
        assert body["access_control_enabled"] is False
        assert body["active_pass"] is None
        # An admin is never bounced by the pass gate.
        assert client.get(
            "/auth/me", headers={"Authorization": f"Bearer {token}"}
        ).status_code == 200

    def test_an_admin_holding_passes_still_holds_no_session(self):
        db = TestingSessionLocal()
        admin = _user(db, "timer-admin2@c.com", role=UserRole.admin)
        AccessTokenService.provision_pack(db, admin, token_count=5)
        admin_email = admin.email
        db.close()

        client = TestClient(app)
        token = _login(client, admin_email).json()["access_token"]
        assert _status_payload(client, token)["active_pass"] is None


class TestNoTokenLeakInTheClockPayload:
    def test_the_identity_only_status_needs_no_authorization_beyond_the_session(self):
        """
        The timer's data source is identity-only on purpose, so a lapsed session
        can still be observed (and explained) instead of hanging on a spinner.
        An anonymous caller is still refused.
        """
        client = TestClient(app)
        assert client.get("/subscription/status").status_code == 401
        assert client.get("/access/status").status_code == 401
