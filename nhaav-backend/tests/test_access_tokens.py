"""
Focused suite for the ACCOUNT-LEVEL access-pass entitlement model.

Captain's final rules covered here:

  * passes belong to the individual ACCOUNT — never shared between colleagues
    of the same company, never shared through an organization pool
  * one successful login allocates exactly one AVAILABLE pass
  * a repeat login by an account that already holds a live pass REUSES it
    (no second pass, no timer reset) — including under concurrency
  * the session lasts exactly 6 hours from login
  * logout consumes the pass permanently (idempotent)
  * 6-hour expiry consumes the pass and protected requests are refused
  * every pass has its OWN 40-day unused-validity window; unused passes carry
    forward but only until that window closes, then they are EXPIRED
  * there is NO inactivity/idle timeout anywhere — 6 hours from login is the
    only session duration
"""
import threading
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.config import settings
from app.models.user import User, UserRole
from app.models.profile import Profile
from app.models.access_token import AccessToken, AccessTokenStatus, AccessPack, Organization
from app.services.access_token_service import (
    PASS_UNUSED_VALIDITY_DAYS,
    SESSION_DURATION_HOURS,
    AccessTokenService,
)
from app.utils.password import hash_password
import jwt

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_access_tokens.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # timeout: concurrent-login tests write from several threads; SQLite should
    # wait for the lock instead of failing immediately with "database is locked".
    connect_args={"check_same_thread": False, "timeout": 30},
    poolclass=None,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def _sqlite_concurrency_pragmas(dbapi_connection, _record):
    """WAL + a busy timeout so concurrent logins wait instead of erroring."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()


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


def _headers(user: User) -> dict:
    tok = jwt.encode({"sub": str(user.id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return {"Authorization": f"Bearer {tok}"}


def _user(db, email, company=None, role=UserRole.client) -> User:
    """
    A user + profile. `company` only records OPTIONAL company metadata (it never
    grants entitlement any more — passes are account-owned).
    """
    user = User(
        email=email,
        password_hash=hash_password("Password123!"),
        role=role,
        full_name=email,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    organization_id = None
    if company:
        organization_id = AccessTokenService.get_or_create_organization(db, company).id
    db.add(Profile(user_id=user.id, company_name=company, organization_id=organization_id))
    db.commit()
    return user


def _provision(db, owner: User, count=10):
    """Grant an access pack OWNED BY this account (dev/test provisioning path)."""
    return AccessTokenService.provision_pack(db, owner, token_count=count)


def _login(client, email, password="Password123!"):
    return client.post("/auth/login", json={"email": email, "password": password})


def _passes(db, owner: User):
    return db.query(AccessToken).filter(AccessToken.owner_user_id == owner.id).all()


def _backdate_pass(db, owner: User, *, unused_days_delta: float = 0.0):
    """
    Move every AVAILABLE pass's unused window by `unused_days_delta` days
    (negative = older). Simulates the passage of time without sleeping.
    """
    for token in _passes(db, owner):
        if token.status == AccessTokenStatus.available and token.unused_expires_at:
            token.unused_expires_at = token.unused_expires_at + timedelta(days=unused_days_delta)
    db.commit()


# ------------------------------------------------------------- 1. provisioning
class TestProvisioning:
    def test_account_receives_ten_passes(self):
        db = TestingSessionLocal()
        owner = _user(db, "prov@a.com", "ABC Marine")
        pack = _provision(db, owner)
        tokens = _passes(db, owner)

        assert pack.token_count == 10
        assert pack.owner_user_id == owner.id
        assert len(tokens) == 10
        assert all(t.status == AccessTokenStatus.available for t in tokens)
        assert all(t.owner_user_id == owner.id for t in tokens)
        # provisioning switches THIS ACCOUNT's entitlement gate on
        db.refresh(owner)
        assert owner.access_control_enabled is True
        db.close()

    def test_company_is_recorded_as_metadata_only(self):
        """The company may be shown, but it is not the entitlement owner."""
        db = TestingSessionLocal()
        owner = _user(db, "meta@a.com", "ABC Marine")
        pack = _provision(db, owner)
        org = db.query(Organization).filter(Organization.name == "ABC Marine").first()
        assert pack.organization_id == org.id
        assert pack.owner_user_id == owner.id  # the ACCOUNT owns it
        db.close()

    def test_every_pass_gets_its_own_40_day_window(self):
        db = TestingSessionLocal()
        owner = _user(db, "window@a.com")
        _provision(db, owner, count=3)

        for token in _passes(db, owner):
            assert token.available_at is not None
            assert token.unused_expires_at is not None
            delta = (token.unused_expires_at - token.available_at).total_seconds()
            assert abs(delta - PASS_UNUSED_VALIDITY_DAYS * 86400) < 2
        db.close()

    def test_login_consumes_exactly_one_pass(self):
        db = TestingSessionLocal()
        owner = _user(db, "one@a.com")
        _provision(db, owner)
        db.close()

        client = TestClient(app)
        resp = _login(client, "one@a.com")
        assert resp.status_code == 200, resp.text
        assert resp.json()["access_session"] is not None

        db = TestingSessionLocal()
        status = AccessTokenService.get_status(
            db, db.query(User).filter(User.email == "one@a.com").first()
        )
        assert status["total_tokens"] == 10
        assert status["active_tokens"] == 1
        assert status["available_tokens"] == 9
        db.close()


# ------------------------------------------------- 2. account-level ownership
class TestAccountOwnership:
    def test_two_accounts_do_not_share_passes(self):
        """Colleagues in the SAME company each get their own separate passes."""
        db = TestingSessionLocal()
        a = _user(db, "a@shared.com", "Shared Co")
        b = _user(db, "b@shared.com", "Shared Co")
        _provision(db, a, count=10)
        _provision(db, b, count=10)
        a_email, b_email = a.email, b.email
        db.close()

        client = TestClient(app)
        assert _login(client, a_email).status_code == 200
        assert _login(client, b_email).status_code == 200

        db = TestingSessionLocal()
        a_user = db.query(User).filter(User.email == a_email).first()
        b_user = db.query(User).filter(User.email == b_email).first()
        a_status = AccessTokenService.get_status(db, a_user)
        b_status = AccessTokenService.get_status(db, b_user)
        # Each account only ever sees its OWN 10 passes.
        assert (a_status["total_tokens"], a_status["active_tokens"], a_status["available_tokens"]) == (10, 1, 9)
        assert (b_status["total_tokens"], b_status["active_tokens"], b_status["available_tokens"]) == (10, 1, 9)
        db.close()

    def test_account_cannot_consume_another_accounts_pass(self):
        db = TestingSessionLocal()
        a = _user(db, "owner@x.com", "X Co")
        b = _user(db, "intruder@x.com", "X Co")
        _provision(db, a, count=3)
        # B has NO packs at all
        a_id, b_email = a.id, b.email
        db.close()

        client = TestClient(app)
        resp = _login(client, b_email)
        # B is ungated (never granted anything) → login succeeds with no session
        assert resp.status_code == 200
        assert resp.json()["access_session"] is None

        db = TestingSessionLocal()
        a_passes = _passes(db, db.query(User).filter(User.id == a_id).first())
        assert all(t.status == AccessTokenStatus.available for t in a_passes)
        assert all(t.current_user_id is None for t in a_passes)
        db.close()

    def test_gated_account_b_never_sees_account_a_balance(self):
        db = TestingSessionLocal()
        a = _user(db, "abal@x.com", "X Co")
        b = _user(db, "bbal@x.com", "X Co")
        _provision(db, a, count=5)
        _provision(db, b, count=2)
        b_email = b.email
        db.close()

        client = TestClient(app)
        assert _login(client, "abal@x.com").status_code == 200
        assert _login(client, b_email).status_code == 200

        db = TestingSessionLocal()
        b_user = db.query(User).filter(User.email == b_email).first()
        status = AccessTokenService.get_status(db, b_user)
        assert status["total_tokens"] == 2  # not 7
        db.close()

    def test_company_name_change_does_not_change_pass_ownership(self):
        """Ownership is the account id; company display data is irrelevant."""
        db = TestingSessionLocal()
        owner = _user(db, "rename@x.com", "Old Name")
        _provision(db, owner, count=4)
        owner_id = owner.id
        db.close()

        client = TestClient(app)
        assert _login(client, "rename@x.com").status_code == 200

        db = TestingSessionLocal()
        profile = db.query(Profile).filter(Profile.user_id == owner_id).first()
        profile.company_name = "Completely Different Name"
        db.commit()

        status = AccessTokenService.get_status(db, db.query(User).filter(User.id == owner_id).first())
        assert status["total_tokens"] == 4
        assert status["active_tokens"] == 1
        db.close()

    def test_multiple_packs_per_account_are_independently_tracked(self):
        """Buying again ADDS a pack; it never replaces the earlier one."""
        db = TestingSessionLocal()
        owner = _user(db, "twopacks@x.com")
        first = _provision(db, owner, count=10)
        second = _provision(db, owner, count=10)
        assert first.id != second.id
        assert first.owner_user_id == second.owner_user_id == owner.id
        assert len(_passes(db, owner)) == 20
        # each pack's passes keep their own window
        first_pass = _passes(db, owner)[0]
        last_pass = _passes(db, owner)[-1]
        assert first_pass.pack_id != last_pass.pack_id
        assert first_pass.unused_expires_at is not None
        assert last_pass.unused_expires_at is not None
        db.close()


# ------------------------------------------------ 3. session lifecycle / timer
class TestSessionLifecycle:
    def test_login_starts_six_hour_timer_from_login_time(self):
        db = TestingSessionLocal()
        owner = _user(db, "timer@t.com")
        _provision(db, owner)
        db.close()

        before = datetime.utcnow()
        client = TestClient(app)
        assert _login(client, "timer@t.com").status_code == 200

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "timer@t.com").first()
        token = (
            db.query(AccessToken)
            .filter(
                AccessToken.owner_user_id == user.id,
                AccessToken.status == AccessTokenStatus.active,
            )
            .first()
        )
        assert token is not None and token.activated_at and token.expires_at
        assert abs((token.activated_at.replace(tzinfo=None) - before).total_seconds()) < 30
        assert abs((token.expires_at - token.activated_at).total_seconds() - SESSION_DURATION_HOURS * 3600) < 1
        db.close()

    def test_second_login_reuses_the_existing_pass(self):
        db = TestingSessionLocal()
        owner = _user(db, "reuse@t.com")
        _provision(db, owner)
        db.close()

        client = TestClient(app)
        first = _login(client, "reuse@t.com")
        assert first.status_code == 200
        session_one = first.json()["access_session"]
        assert session_one["reused"] is False

        second = _login(client, "reuse@t.com")
        assert second.status_code == 200
        session_two = second.json()["access_session"]
        assert session_two["reused"] is True
        # same window — no reset, no extension
        assert session_two["expires_at"] == session_one["expires_at"]

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "reuse@t.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["active_tokens"] == 1
        assert status["consumed_tokens"] == 0
        assert status["available_tokens"] == 9
        db.close()

    def test_concurrent_same_account_logins_allocate_one_pass(self):
        """5 simultaneous logins for one account: exactly one ACTIVE pass."""
        db = TestingSessionLocal()
        owner = _user(db, "concurrent@t.com")
        _provision(db, owner)
        db.close()

        client = TestClient(app)
        results: list[int] = []
        lock = threading.Lock()

        def go():
            r = _login(client, "concurrent@t.com")
            with lock:
                results.append(r.status_code)

        threads = [threading.Thread(target=go) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert all(code == 200 for code in results), results

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "concurrent@t.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["active_tokens"] == 1, "one account must never hold two active passes"
        assert status["consumed_tokens"] == 0
        assert status["available_tokens"] == 9
        db.close()

    def test_different_accounts_get_separate_active_passes(self):
        db = TestingSessionLocal()
        a = _user(db, "s1@t.com")
        b = _user(db, "s2@t.com")
        _provision(db, a)
        _provision(db, b)
        db.close()

        client = TestClient(app)
        assert _login(client, "s1@t.com").status_code == 200
        assert _login(client, "s2@t.com").status_code == 200

        db = TestingSessionLocal()
        a_user = db.query(User).filter(User.email == "s1@t.com").first()
        b_user = db.query(User).filter(User.email == "s2@t.com").first()
        assert AccessTokenService.get_status(db, a_user)["active_tokens"] == 1
        assert AccessTokenService.get_status(db, b_user)["active_tokens"] == 1
        # precisely one ACTIVE pass each — never two for one account
        for user in (a_user, b_user):
            held = (
                db.query(AccessToken)
                .filter(
                    AccessToken.owner_user_id == user.id,
                    AccessToken.status == AccessTokenStatus.active,
                )
                .all()
            )
            assert len(held) == 1
        db.close()

    def test_invalid_login_does_not_consume_a_pass(self):
        db = TestingSessionLocal()
        owner = _user(db, "leak@n.com")
        _provision(db, owner)
        db.close()

        client = TestClient(app)
        for _ in range(3):
            assert _login(client, "leak@n.com", "WrongPassword!").status_code == 401

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "leak@n.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["available_tokens"] == 10
        assert status["consumed_tokens"] == 0
        db.close()

    def test_login_fails_when_every_pass_is_used(self):
        db = TestingSessionLocal()
        owner = _user(db, "drain@n.com")
        _provision(db, owner, count=1)
        db.close()

        client = TestClient(app)
        assert _login(client, "drain@n.com").status_code == 200  # uses the single pass
        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "drain@n.com").first()
        # consume it via logout so the next login has nothing left
        AccessTokenService.consume_for_logout(db, user)
        db.close()

        second = _login(client, "drain@n.com")
        assert second.status_code == 403
        assert "no nhaav access passes" in second.json()["detail"].lower()


# ------------------------------------------------- 4. logout / 6-hour expiry
class TestLogoutAndSixHourExpiry:
    def test_logout_consumes_the_pass_permanently(self):
        db = TestingSessionLocal()
        owner = _user(db, "logout@t.com")
        _provision(db, owner)
        db.close()

        client = TestClient(app)
        login = _login(client, "logout@t.com")
        token = login.json()["access_token"]

        assert client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"}).status_code in (200, 204)

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "logout@t.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["active_tokens"] == 0
        assert status["consumed_tokens"] == 1
        assert status["available_tokens"] == 9
        db.close()

    def test_logout_is_idempotent(self):
        db = TestingSessionLocal()
        owner = _user(db, "logout2@t.com")
        _provision(db, owner)
        db.close()

        client = TestClient(app)
        token = _login(client, "logout2@t.com").json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        assert client.post("/auth/logout", headers=h).status_code in (200, 204)
        assert client.post("/auth/logout", headers=h).status_code in (200, 204, 401)

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "logout2@t.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["consumed_tokens"] == 1  # never double-consumed
        db.close()

    def test_can_log_in_again_after_logout(self):
        db = TestingSessionLocal()
        owner = _user(db, "again@t.com")
        _provision(db, owner)
        db.close()

        client = TestClient(app)
        token = _login(client, "again@t.com").json()["access_token"]
        client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})

        second = _login(client, "again@t.com")
        assert second.status_code == 200
        assert second.json()["access_session"]["reused"] is False  # a NEW pass

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "again@t.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["active_tokens"] == 1
        assert status["consumed_tokens"] == 1
        assert status["available_tokens"] == 8
        db.close()

    def test_six_hour_expiry_consumes_the_pass_and_blocks_protected_routes(self):
        db = TestingSessionLocal()
        owner = _user(db, "expire@t.com")
        _provision(db, owner)
        db.close()

        client = TestClient(app)
        token = _login(client, "expire@t.com").json()["access_token"]

        # force the active pass past its 6-hour window
        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "expire@t.com").first()
        active = (
            db.query(AccessToken)
            .filter(AccessToken.owner_user_id == user.id, AccessToken.status == AccessTokenStatus.active)
            .first()
        )
        active.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()
        db.close()

        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "expire@t.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["active_tokens"] == 0
        assert status["consumed_tokens"] == 1
        db.close()

    def test_a_fresh_login_after_expiry_uses_a_new_pass(self):
        db = TestingSessionLocal()
        owner = _user(db, "fresh@t.com")
        _provision(db, owner)
        db.close()

        client = TestClient(app)
        _login(client, "fresh@t.com")

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "fresh@t.com").first()
        active = (
            db.query(AccessToken)
            .filter(AccessToken.owner_user_id == user.id, AccessToken.status == AccessTokenStatus.active)
            .first()
        )
        active.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()
        db.close()

        again = _login(client, "fresh@t.com")
        assert again.status_code == 200
        assert again.json()["access_session"]["reused"] is False

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "fresh@t.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["active_tokens"] == 1
        assert status["available_tokens"] == 8
        db.close()


# ------------------------------------------ 5. the 40-day per-pass unused rule
class TestFortyDayUnusedExpiry:
    def test_pass_can_be_used_inside_the_window(self):
        db = TestingSessionLocal()
        owner = _user(db, "inside@w.com")
        _provision(db, owner, count=1)
        _backdate_pass(db, owner, unused_days_delta=-39)  # 39 days have passed
        db.close()

        client = TestClient(app)
        assert _login(client, "inside@w.com").status_code == 200

    def test_pass_is_expired_after_forty_unused_days(self):
        db = TestingSessionLocal()
        owner = _user(db, "past@w.com")
        _provision(db, owner, count=1)
        _backdate_pass(db, owner, unused_days_delta=-41)  # window already closed
        db.close()

        client = TestClient(app)
        response = _login(client, "past@w.com")
        assert response.status_code == 403
        assert "no nhaav access passes" in response.json()["detail"].lower()

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "past@w.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["expired_tokens"] == 1
        assert status["available_tokens"] == 0
        db.close()

    def test_expired_pass_status_is_permanent(self):
        db = TestingSessionLocal()
        owner = _user(db, "perm@w.com")
        _provision(db, owner, count=2)
        _backdate_pass(db, owner, unused_days_delta=-45)
        db.close()

        client = TestClient(app)
        assert _login(client, "perm@w.com").status_code == 403

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "perm@w.com").first()
        assert all(
            t.status == AccessTokenStatus.expired for t in _passes(db, user)
        )
        db.close()

    def test_unused_pass_carries_forward_while_inside_the_window(self):
        """A lapsed subscription does NOT kill a pass still inside 40 days."""
        db = TestingSessionLocal()
        owner = _user(db, "carry@w.com")
        _provision(db, owner, count=3)
        _backdate_pass(db, owner, unused_days_delta=-20)
        db.close()

        client = TestClient(app)
        assert _login(client, "carry@w.com").status_code == 200

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "carry@w.com").first()
        assert AccessTokenService.get_status(db, user)["available_tokens"] == 2
        db.close()

    def test_passes_from_separate_purchases_expire_independently(self):
        db = TestingSessionLocal()
        owner = _user(db, "indep@w.com")
        first = _provision(db, owner, count=2)
        # age ONLY the first pack's passes
        for token in db.query(AccessToken).filter(AccessToken.pack_id == first.id).all():
            token.unused_expires_at = datetime.utcnow() - timedelta(days=1)
        db.commit()
        second = _provision(db, owner, count=2)
        owner_email = owner.email
        db.close()

        client = TestClient(app)
        assert _login(client, owner_email).status_code == 200

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == owner_email).first()
        status = AccessTokenService.get_status(db, user)
        # first pack's two passes are gone; second pack's are intact
        assert status["expired_tokens"] == 2
        assert status["available_tokens"] == 1  # 2 minus the one just allocated
        assert status["total_tokens"] == 4
        # the reported next expiry comes from the still-valid pack
        assert status["next_pass_expiry"] is not None
        db.close()

    def test_status_reports_the_unused_window_rule(self):
        db = TestingSessionLocal()
        owner = _user(db, "report@w.com")
        _provision(db, owner, count=1)
        status = AccessTokenService.get_status(db, owner)
        assert status["pass_validity_days"] == PASS_UNUSED_VALIDITY_DAYS == 40
        assert status["next_pass_expiry"] is not None
        db.close()


# ------------------------------------------------------------ 6. no idle timer
class TestNoInactivityTimeout:
    def test_service_exposes_no_idle_timeout(self):
        """
        The only session duration is 6 hours from login. Guard against anyone
        re-introducing an inactivity/idle rule: the service must expose no such
        attribute at all.
        """
        import app.services.access_token_service as module

        for name in dir(module):
            if name.startswith("__"):
                continue
            low = name.lower()
            assert "idle" not in low, f"unexpected inactivity concept: {name}"
            assert "inactivity" not in low, f"unexpected inactivity concept: {name}"

    def test_the_only_two_durations_are_six_hours_and_forty_days(self):
        import app.services.access_token_service as module

        assert module.SESSION_DURATION_HOURS == 6
        assert module.PASS_UNUSED_VALIDITY_DAYS == 40

    def test_an_idle_account_keeps_its_session_for_the_full_six_hours(self):
        db = TestingSessionLocal()
        owner = _user(db, "idle@t.com")
        _provision(db, owner)
        db.close()

        client = TestClient(app)
        token = _login(client, "idle@t.com").json()["access_token"]

        # Simulate 3 hours of total inactivity by moving only the CLOCK forward
        # relative to the pass. The pass must still be valid.
        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "idle@t.com").first()
        active = (
            db.query(AccessToken)
            .filter(AccessToken.owner_user_id == user.id, AccessToken.status == AccessTokenStatus.active)
            .first()
        )
        active.activated_at = datetime.utcnow() - timedelta(hours=3)
        active.expires_at = active.activated_at + timedelta(hours=SESSION_DURATION_HOURS)
        db.commit()
        db.close()

        assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200

    def test_session_ends_exactly_six_hours_after_login(self):
        db = TestingSessionLocal()
        owner = _user(db, "exact@t.com")
        _provision(db, owner)
        db.close()

        client = TestClient(app)
        token = _login(client, "exact@t.com").json()["access_token"]

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "exact@t.com").first()
        active = (
            db.query(AccessToken)
            .filter(AccessToken.owner_user_id == user.id, AccessToken.status == AccessTokenStatus.active)
            .first()
        )
        assert abs((active.expires_at - active.activated_at).total_seconds() - 6 * 3600) < 1
        db.close()
        assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200


# ----------------------------------------------------- 7. legacy / gate / admin
class TestGateAndLegacyBehaviour:
    def test_ungated_account_keeps_legacy_behaviour(self):
        """An account that was never granted anything logs in with no pass."""
        db = TestingSessionLocal()
        _user(db, "legacy@l.com")
        db.close()

        client = TestClient(app)
        resp = _login(client, "legacy@l.com")
        assert resp.status_code == 200
        assert resp.json()["access_session"] is None
        assert resp.json()["access_blocked"] is None

    def test_ungated_account_is_not_blocked_from_protected_routes(self):
        db = TestingSessionLocal()
        _user(db, "legacy2@l.com")
        db.close()

        client = TestClient(app)
        token = _login(client, "legacy2@l.com").json()["access_token"]
        # /auth/me is access-enforced; an ungated account passes
        assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200

    def test_admin_login_consumes_no_pass_and_is_never_blocked(self):
        db = TestingSessionLocal()
        admin = _user(db, "admin@l.com", role=UserRole.admin)
        _provision(db, admin, count=5)
        admin_email = admin.email
        db.close()

        client = TestClient(app)
        resp = _login(client, admin_email)
        assert resp.status_code == 200
        assert resp.json()["access_session"] is None  # admins never hold passes

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == admin_email).first()
        assert AccessTokenService.get_status(db, user)["active_tokens"] == 0
        db.close()

    def test_gate_off_account_status_is_empty(self):
        db = TestingSessionLocal()
        _user(db, "off@l.com")
        user = db.query(User).filter(User.email == "off@l.com").first()
        status = AccessTokenService.get_status(db, user)
        assert status["access_control_enabled"] is False
        assert status["total_tokens"] == 0
        db.close()
