"""
Focused suite for the subscription / plan layer under ACCOUNT ownership.

Covers:
  * plan pass counts and prices are the approved INTEGER PAISE figures
  * a subscription/pack is owned by the ACCOUNT that purchased it
  * an account may hold SEVERAL packs at once — a later purchase ADDS a pack and
    never overwrites, extends, merges or cancels the earlier one
  * activation is idempotent (exactly one pack per subscription)
  * the subscription clock and the per-pass 40-day window are independent
  * a lapsed subscription does not kill passes that are still inside their window
  * calendar-correct duration maths
  * money is never floating point
  * no automatic plan switching (a change is only ever applied by an explicit
    decision path)
  * cross-account isolation
"""
import threading
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Integer, create_engine, event
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.config import settings
from app.models.user import User, UserRole
from app.models.profile import Profile
from app.models.access_token import (
    AccessPack,
    AccessPackStatus,
    AccessToken,
    AccessTokenStatus,
    Organization,
)
from app.models.subscription import (
    BillingPeriod,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.services.access_token_service import (
    PASS_UNUSED_VALIDITY_DAYS,
    AccessTokenService,
)
from app.services.subscription_service import (
    ANNUAL_CODE,
    MONTHLY_CODE,
    PLAN_DEFINITIONS,
    SubscriptionService,
    add_duration,
)
from app.utils.password import hash_password
import jwt

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_subscriptions.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
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


def _subscribe(db, owner: User, plan_code: str = MONTHLY_CODE, source: str = "test"):
    subscription = SubscriptionService.create_subscription(db, owner, plan_code)
    pack = SubscriptionService.activate_subscription(db, subscription, source=source)
    return subscription, pack


def _login(client, email, password="Password123!"):
    return client.post("/auth/login", json={"email": email, "password": password})


# -------------------------------------------------------------- 1. plan catalogue
class TestPlanCatalogue:
    def test_monthly_plan_is_one_thousand_for_ten_passes(self):
        db = TestingSessionLocal()
        plan = SubscriptionService.get_plan(db, MONTHLY_CODE)
        assert plan.price_paise == 100_000          # ₹1,000.00 in paise (pre-GST)
        assert plan.pass_count == 10
        # Pack validity is SIX CALENDAR MONTHS (changed from 40 days).
        assert plan.duration_value == 6
        assert plan.duration_unit == BillingPeriod.MONTH
        assert plan.currency == "INR"
        db.close()

    def test_annual_plan_is_ten_thousand_for_one_hundred_passes(self):
        db = TestingSessionLocal()
        plan = SubscriptionService.get_plan(db, ANNUAL_CODE)
        assert plan.price_paise == 1_000_000        # ₹10,000.00 in paise (pre-GST)
        assert plan.pass_count == 100
        # Pack validity is TWELVE CALENDAR MONTHS (changed from 250 days).
        assert plan.duration_value == 12
        assert plan.duration_unit == BillingPeriod.MONTH
        db.close()

    def test_plan_definitions_are_the_single_source_of_the_figures(self):
        figures = {(d["code"], d["price_paise"], d["pass_count"]) for d in PLAN_DEFINITIONS}
        assert figures == {
            (MONTHLY_CODE, 100_000, 10),
            (ANNUAL_CODE, 1_000_000, 100),
        }

    def test_money_columns_are_integers_not_floats(self):
        db = TestingSessionLocal()
        for plan in SubscriptionService.list_plans(db):
            assert isinstance(plan.price_paise, int)
        assert isinstance(SubscriptionPlan.__table__.c.price_paise.type, Integer)
        db.close()

    def test_both_plans_apply_to_every_paid_role(self):
        """Clients, suppliers and providers buy the same two plans."""
        db = TestingSessionLocal()
        for role in (UserRole.client, UserRole.supplier, UserRole.provider):
            owner = _user(db, f"role_{role.value}@plans.com", role=role)
            subscription, pack = _subscribe(db, owner, MONTHLY_CODE)
            assert subscription.status == SubscriptionStatus.ACTIVE
            assert pack.token_count == 10
            assert pack.owner_user_id == owner.id
            db.refresh(owner)
            assert owner.access_control_enabled is True
        db.close()

    def test_plans_endpoint_is_authenticated(self):
        db = TestingSessionLocal()
        _user(db, "plans@auth.com")
        db.close()
        client = TestClient(app)
        token = _login(client, "plans@auth.com").json()["access_token"]
        resp = client.get("/subscription/plans", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        codes = {p["code"] for p in resp.json()["plans"]}
        assert codes == {MONTHLY_CODE, ANNUAL_CODE}


# ------------------------------------------------------- 2. account ownership
class TestAccountOwnership:
    def test_subscription_and_pack_belong_to_the_owning_account(self):
        db = TestingSessionLocal()
        owner = _user(db, "owner@own.com", "Owner Co")
        subscription, pack = _subscribe(db, owner)
        assert subscription.owner_user_id == owner.id
        assert pack.owner_user_id == owner.id
        passes = db.query(AccessToken).filter(AccessToken.pack_id == pack.id).all()
        assert len(passes) == 10
        assert all(p.owner_user_id == owner.id for p in passes)
        db.close()

    def test_company_is_metadata_not_an_owner(self):
        db = TestingSessionLocal()
        owner = _user(db, "meta@own.com", "Meta Co")
        subscription, pack = _subscribe(db, owner)
        org = db.query(Organization).filter(Organization.name == "Meta Co").first()
        assert subscription.organization_id == org.id   # recorded for display
        assert subscription.owner_user_id == owner.id   # but the ACCOUNT owns it
        db.close()

    def test_colleagues_do_not_share_a_subscription(self):
        """Two accounts in the same company each own their own packs."""
        db = TestingSessionLocal()
        a = _user(db, "col_a@own.com", "Col Co")
        b = _user(db, "col_b@own.com", "Col Co")
        _subscribe(db, a)
        _subscribe(db, b)

        a_subs = db.query(Subscription).filter(Subscription.owner_user_id == a.id).all()
        b_subs = db.query(Subscription).filter(Subscription.owner_user_id == b.id).all()
        assert len(a_subs) == 1
        assert len(b_subs) == 1
        assert {s.organization_id for s in a_subs} == {s.organization_id for s in b_subs}
        assert a_subs[0].id != b_subs[0].id
        db.close()

    def test_account_status_never_counts_another_accounts_passes(self):
        db = TestingSessionLocal()
        a = _user(db, "st_a@own.com")
        b = _user(db, "st_b@own.com")
        _subscribe(db, a, MONTHLY_CODE)          # 10 passes
        _subscribe(db, b, ANNUAL_CODE)           # 100 passes
        b_email = b.email
        db.close()

        client = TestClient(app)
        token = _login(client, b_email).json()["access_token"]
        resp = client.get("/subscription/status", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["passes"]["total"] == 100      # not 110
        assert body["account"] == b_email
        db.close()


# -------------------------------------------------------- 3. multiple packs
class TestMultiplePacks:
    def test_second_purchase_adds_a_pack_without_touching_the_first(self):
        """
        Captain's example: 10-pass pack, 4 passes left, buy another 10-pass pack.
        Both packs survive with their own passes.
        """
        db = TestingSessionLocal()
        owner = _user(db, "multi@pack.com")
        first_sub, first_pack = _subscribe(db, owner, MONTHLY_CODE)
        owner_email = owner.email

        client = TestClient(app)
        # burn 6 of the first pack's passes through real logins/logouts
        for _ in range(6):
            token = _login(client, owner_email).json()["access_token"]
            client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})

        db = TestingSessionLocal()
        owner = db.query(User).filter(User.email == owner_email).first()
        status = AccessTokenService.get_status(db, owner)
        assert status["available_tokens"] == 4

        # now buy again
        second_sub, second_pack = _subscribe(db, owner, MONTHLY_CODE)
        assert second_pack.id != first_pack.id
        assert second_sub.id != first_sub.id
        assert first_pack.owner_user_id == second_pack.owner_user_id == owner.id

        status = AccessTokenService.get_status(db, owner)
        assert status["total_tokens"] == 20
        assert status["available_tokens"] == 14      # 4 old + 10 new
        assert db.query(AccessPack).filter(AccessPack.owner_user_id == owner.id).count() == 2
        # the earlier subscription was neither cancelled nor extended
        first_again = db.query(Subscription).filter(Subscription.id == first_sub.id).first()
        assert first_again.status == SubscriptionStatus.ACTIVE
        db.close()

    def test_packs_have_independent_pass_expiry(self):
        db = TestingSessionLocal()
        owner = _user(db, "multi_exp@pack.com")
        _, first_pack = _subscribe(db, owner, MONTHLY_CODE)
        # age the first pack's unused passes beyond 40 days
        db.query(AccessToken).filter(AccessToken.pack_id == first_pack.id).update(
            {"unused_expires_at": datetime.utcnow() - timedelta(days=1)},
            synchronize_session=False,
        )
        db.commit()
        _, second_pack = _subscribe(db, owner, MONTHLY_CODE)
        db.commit()

        now = datetime.utcnow()
        AccessTokenService._expire_unused(db, owner, now)
        first_status = {t.status for t in db.query(AccessToken).filter(AccessToken.pack_id == first_pack.id)}
        second_status = {t.status for t in db.query(AccessToken).filter(AccessToken.pack_id == second_pack.id)}
        assert first_status == {AccessTokenStatus.expired}
        assert second_status == {AccessTokenStatus.available}

        status = AccessTokenService.get_status(db, owner)
        assert status["expired_tokens"] == 10
        assert status["available_tokens"] == 10
        db.close()

    def test_activation_is_idempotent_for_one_subscription(self):
        db = TestingSessionLocal()
        owner = _user(db, "idem@pack.com")
        subscription = SubscriptionService.create_subscription(db, owner, MONTHLY_CODE)
        pack_one = SubscriptionService.activate_subscription(db, subscription)
        pack_two = SubscriptionService.activate_subscription(db, subscription)
        assert pack_one.id == pack_two.id
        assert db.query(AccessPack).filter(AccessPack.subscription_id == subscription.id).count() == 1
        assert db.query(AccessToken).filter(AccessToken.pack_id == pack_one.id).count() == 10
        db.close()

    def test_activating_one_hundred_pass_plan_issues_one_hundred_passes(self):
        db = TestingSessionLocal()
        owner = _user(db, "annual@pack.com")
        _, pack = _subscribe(db, owner, ANNUAL_CODE)
        assert pack.token_count == 100
        assert db.query(AccessToken).filter(AccessToken.pack_id == pack.id).count() == 100
        db.close()


# ------------------------------------------------------------ 4. subscription clock
class TestSubscriptionClock:
    def test_activation_stamps_the_clock_from_the_plan_duration(self):
        db = TestingSessionLocal()
        owner = _user(db, "clock@sub.com")
        subscription, _ = _subscribe(db, owner, MONTHLY_CODE)
        assert subscription.starts_at is not None
        assert subscription.expires_at is not None
        assert subscription.expires_at > subscription.starts_at
        assert subscription.expires_at == add_duration(
            subscription.starts_at, 6, BillingPeriod.MONTH
        )
        db.close()

    def test_annual_subscription_runs_about_a_year(self):
        db = TestingSessionLocal()
        owner = _user(db, "annualclock@sub.com")
        subscription, _ = _subscribe(db, owner, ANNUAL_CODE)
        assert subscription.expires_at == add_duration(
            subscription.starts_at, 12, BillingPeriod.MONTH
        )
        db.close()

    def test_lapsed_subscription_is_swept_to_expired(self):
        db = TestingSessionLocal()
        owner = _user(db, "lapse@sub.com")
        subscription, pack = _subscribe(db, owner, MONTHLY_CODE)
        subscription.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()

        SubscriptionService.expire_due_subscriptions(db, owner, datetime.utcnow())
        db.refresh(subscription)
        db.refresh(pack)
        assert subscription.status == SubscriptionStatus.EXPIRED
        assert pack.status == AccessPackStatus.EXPIRED
        db.close()

    def test_lapsing_subscription_does_not_kill_passes_inside_their_window(self):
        """Unused passes carry forward until their OWN 40-day window closes."""
        db = TestingSessionLocal()
        owner = _user(db, "carry@sub.com")
        subscription, _ = _subscribe(db, owner, MONTHLY_CODE)
        subscription.expires_at = datetime.utcnow() - timedelta(days=1)
        db.commit()
        owner_email = owner.email
        db.close()

        client = TestClient(app)
        resp = _login(client, owner_email)
        assert resp.status_code == 200
        assert resp.json()["access_session"] is not None

        db = TestingSessionLocal()
        owner = db.query(User).filter(User.email == owner_email).first()
        assert AccessTokenService.get_status(db, owner)["active_tokens"] == 1
        db.close()

    def test_lapsed_subscription_with_no_usable_pass_is_a_renewal_login(self):
        """
        Nothing usable left (lapsed subscription AND every unused window closed):
        the login still succeeds so the account can reach the payment flow, but it
        issues NO pass and explains why.
        """
        db = TestingSessionLocal()
        owner = _user(db, "gone@sub.com")
        subscription, pack = _subscribe(db, owner, MONTHLY_CODE)
        subscription.expires_at = datetime.utcnow() - timedelta(days=1)
        db.query(AccessToken).filter(AccessToken.pack_id == pack.id).update(
            {"unused_expires_at": datetime.utcnow() - timedelta(days=1)},
            synchronize_session=False,
        )
        db.commit()
        owner_email = owner.email
        db.close()

        client = TestClient(app)
        resp = _login(client, owner_email)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["access_session"] is None
        assert body["access_blocked"] and "expired" in body["access_blocked"].lower()

    def test_in_flight_session_is_not_extended_or_cut_by_the_subscription(self):
        db = TestingSessionLocal()
        owner = _user(db, "inflight@sub.com")
        subscription, pack = _subscribe(db, owner, MONTHLY_CODE)
        owner_email = owner.email
        db.close()

        client = TestClient(app)
        token = _login(client, owner_email).json()["access_token"]

        db = TestingSessionLocal()
        owner = db.query(User).filter(User.email == owner_email).first()
        active = (
            db.query(AccessToken)
            .filter(AccessToken.owner_user_id == owner.id, AccessToken.status == AccessTokenStatus.active)
            .first()
        )
        planned_expiry = active.expires_at

        # The subscription lapses mid-session.
        subscription = db.query(Subscription).filter(Subscription.owner_user_id == owner.id).first()
        subscription.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()
        db.close()

        # The 6-hour session is untouched and still works.
        assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200

        db = TestingSessionLocal()
        owner = db.query(User).filter(User.email == owner_email).first()
        active = (
            db.query(AccessToken)
            .filter(AccessToken.owner_user_id == owner.id, AccessToken.status == AccessTokenStatus.active)
            .first()
        )
        assert active.expires_at == planned_expiry     # not extended, not shortened
        db.close()

    def test_subscription_status_payload_reports_account_and_packs(self):
        db = TestingSessionLocal()
        owner = _user(db, "payload@sub.com", "Payload Co")
        _subscribe(db, owner, MONTHLY_CODE)
        owner_email = owner.email
        db.close()

        client = TestClient(app)
        token = _login(client, owner_email).json()["access_token"]
        resp = client.get("/subscription/status", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["access_control_enabled"] is True
        assert body["account"] == owner_email
        assert body["organization"] == "Payload Co"          # metadata only
        assert body["plan"]["pass_count"] == 10
        assert body["passes"]["total"] == 10
        assert body["passes"]["remaining"] == 9
        # The plan now carries the 6-month window; PASS_UNUSED_VALIDITY_DAYS is
        # only the legacy/dev fallback for passes provisioned without a plan.
        assert body["pass_validity_days"] == 180
        assert body["session_hours"] == 6
        assert len(body["packs"]) == 1
        assert body["packs"][0]["next_pass_expiry"] is not None
        assert body["active_pass"] is not None


# --------------------------------------------------------- 5. calendar duration
class TestDurationMaths:
    def test_one_month_from_mid_month(self):
        assert add_duration(datetime(2026, 1, 15), 1, BillingPeriod.MONTH) == datetime(2026, 2, 15)

    def test_one_month_clamps_to_the_shorter_month(self):
        assert add_duration(datetime(2026, 1, 31), 1, BillingPeriod.MONTH) == datetime(2026, 2, 28)

    def test_one_month_rolls_over_the_year(self):
        assert add_duration(datetime(2026, 12, 10), 1, BillingPeriod.MONTH) == datetime(2027, 1, 10)

    def test_one_year_from_a_leap_day_clamps(self):
        assert add_duration(datetime(2028, 2, 29), 1, BillingPeriod.YEAR) == datetime(2029, 2, 28)

    def test_day_durations_are_plain_day_arithmetic(self):
        """The approved packs are 6 / 12 CALENDAR MONTHS."""
        assert add_duration(datetime(2026, 1, 15), 6, BillingPeriod.MONTH) == datetime(2026, 7, 15)
        assert add_duration(datetime(2026, 1, 15), 12, BillingPeriod.MONTH) == datetime(2027, 1, 15)


# ------------------------------------------------------------- 6. no auto switch
class TestNoAutomaticPlanSwitching:
    def test_creating_a_second_plan_does_not_switch_the_first(self):
        """Nothing switches automatically; each purchase is its own subscription."""
        db = TestingSessionLocal()
        owner = _user(db, "switch@sub.com")
        monthly, monthly_pack = _subscribe(db, owner, MONTHLY_CODE)
        annual, annual_pack = _subscribe(db, owner, ANNUAL_CODE)

        db.refresh(monthly)
        assert monthly.status == SubscriptionStatus.ACTIVE          # untouched
        assert monthly.plan.code == MONTHLY_CODE
        assert annual.plan.code == ANNUAL_CODE
        # the earlier pack's remaining passes are preserved exactly
        remaining = (
            db.query(AccessToken)
            .filter(
                AccessToken.pack_id == monthly_pack.id,
                AccessToken.status == AccessTokenStatus.available,
            )
            .count()
        )
        assert remaining == 10
        db.close()

    def test_pending_subscription_alone_grants_no_passes(self):
        db = TestingSessionLocal()
        owner = _user(db, "pending@sub.com")
        SubscriptionService.create_subscription(db, owner, MONTHLY_CODE)
        # no activation yet
        assert db.query(AccessToken).filter(AccessToken.owner_user_id == owner.id).count() == 0
        db.refresh(owner)
        assert owner.access_control_enabled is False
        db.close()

    def test_pending_subscription_blocks_a_new_session_with_a_reason(self):
        db = TestingSessionLocal()
        owner = _user(db, "pending2@sub.com")
        SubscriptionService.create_subscription(db, owner, MONTHLY_CODE)
        # simulate the account having been gated by an admin without an activation
        owner.access_control_enabled = True
        db.commit()
        now = datetime.utcnow()
        message = SubscriptionService.subscription_block_message(db, owner, now)
        assert message is not None and "pending" in message.lower()
        db.close()


# ------------------------------------------------------- 7. concurrency safety
class TestConcurrency:
    def test_concurrent_logins_against_one_pack_never_double_allocate(self):
        db = TestingSessionLocal()
        owner = _user(db, "race@sub.com")
        _subscribe(db, owner, MONTHLY_CODE)
        owner_email = owner.email
        db.close()

        client = TestClient(app)
        codes: list[int] = []
        lock = threading.Lock()

        def go():
            r = _login(client, owner_email)
            with lock:
                codes.append(r.status_code)

        threads = [threading.Thread(target=go) for _ in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert all(c == 200 for c in codes), codes
        db = TestingSessionLocal()
        owner = db.query(User).filter(User.email == owner_email).first()
        status = AccessTokenService.get_status(db, owner)
        assert status["active_tokens"] == 1
        assert status["consumed_tokens"] == 0
        assert status["available_tokens"] == 9
        db.close()


# ---------------------------------------------------------- 8. dev provisioning
class TestDevProvisioning:
    def test_dev_provision_endpoint_grants_the_named_account_a_plan(self):
        db = TestingSessionLocal()
        _user(db, "devprov@sub.com")
        db.close()

        client = TestClient(app)
        resp = client.post(
            "/subscription/dev-provision",
            params={"owner_email": "devprov@sub.com", "plan_code": MONTHLY_CODE},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["owner"] == "devprov@sub.com"
        assert body["subscription_status"] == SubscriptionStatus.ACTIVE.value
        assert body["total_passes"] == 10

        db = TestingSessionLocal()
        owner = db.query(User).filter(User.email == "devprov@sub.com").first()
        assert AccessTokenService.get_status(db, owner)["available_tokens"] == 10
        db.close()

    def test_dev_provision_rejects_an_unknown_account(self):
        client = TestClient(app)
        resp = client.post(
            "/subscription/dev-provision",
            params={"owner_email": "nobody@nowhere.com", "plan_code": MONTHLY_CODE},
        )
        assert resp.status_code == 404

    def test_dev_provision_does_not_leak_passes_to_other_accounts(self):
        db = TestingSessionLocal()
        _user(db, "isolated@sub.com")
        _user(db, "bystander@sub.com")
        db.close()

        client = TestClient(app)
        client.post(
            "/subscription/dev-provision",
            params={"owner_email": "isolated@sub.com", "plan_code": MONTHLY_CODE},
        )

        db = TestingSessionLocal()
        bystander = db.query(User).filter(User.email == "bystander@sub.com").first()
        assert AccessTokenService.get_status(db, bystander)["total_tokens"] == 0
        assert bystander.access_control_enabled is False
        db.close()
