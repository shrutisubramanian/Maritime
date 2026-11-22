"""The approved pass-purchase contract, pinned end to end.

    MONTHLY   ₹1,000 + GST   10 passes   valid 6 calendar months
    ANNUAL    ₹10,000 + GST  100 passes  valid 12 calendar months

"Validity" means the window in which a bought pass may still be used: a pass
that is never allocated inside it expires and can never be used. It is stamped
per pass at issuance from the plan, so the two packs differ.

GST is charged ON TOP of the listed price (₹1,000 + 18% = ₹1,180 and
₹10,000 + 18% = ₹11,800). Plans store the taxable value; the payment stores what
was actually charged, and the split is derived from both.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models.access_token import AccessToken
from app.models.profile import VerificationStatus
from app.models.subscription import BillingPeriod
from app.models.user import User, UserRole
from app.services.subscription_service import (
    ANNUAL_CODE,
    MONTHLY_CODE,
    SubscriptionService,
    add_duration,
    plan_pricing,
    plan_validity_days,
)
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_pass_pricing.db"
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
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)


def _account(email: str) -> uuid.UUID:
    db = TestingSessionLocal()
    try:
        user = User(
            email=email,
            password_hash=hash_password("Password123!"),
            role=UserRole.client,
            full_name="Pass Buyer",
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.id
    finally:
        db.close()


def _token(email: str) -> str:
    resp = TestClient(app).post(
        "/auth/login", json={"email": email, "password": "Password123!"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def buyer_token():
    email = "pass_buyer@example.com"
    _account(email)
    _verified_profile(email)
    return _token(email)


def _verified_profile(email: str) -> None:
    """A profile the admins have already approved.

    Admin approval IS the marketplace gate. The plan purchased below is a
    billing/pass record, not an access condition.
    """
    _profile(email, VerificationStatus.verified, "VERIFIED")


def _pending_profile(email: str) -> None:
    """A profile that exists but is still awaiting admin review."""
    _profile(email, VerificationStatus.pending, None)


def _profile(email: str, verification_status, badge_label) -> None:
    from app.models.profile import Profile

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one()
        db.add(
            Profile(
                user_id=user.id,
                company_name="Verified Buyer Co",
                verification_status=verification_status,
                badge_label=badge_label,
            )
        )
        db.commit()
    finally:
        db.close()


def _admin(email: str) -> None:
    db = TestingSessionLocal()
    try:
        db.add(
            User(
                email=email,
                password_hash=hash_password("Password123!"),
                role=UserRole.admin,
                full_name="Pricing Admin",
                is_verified=True,
            )
        )
        db.commit()
    finally:
        db.close()


# --------------------------------------------------------------------- pricing
def test_ten_pack_costs_one_thousand_plus_gst(buyer_token):
    plans = TestClient(app).get(
        "/subscription/plans", headers={"Authorization": f"Bearer {buyer_token}"}
    ).json()["plans"]
    monthly = next(p for p in plans if p["code"] == MONTHLY_CODE)

    assert monthly["price_paise"] == 100_000          # ₹1,000 taxable value
    assert monthly["gst_rate_percent"] == 18
    assert monthly["gst_paise"] == 18_000             # ₹180
    assert monthly["total_paise"] == 118_000          # ₹1,180 payable
    assert monthly["pass_count"] == 10


def test_hundred_pack_costs_ten_thousand_plus_gst(buyer_token):
    plans = TestClient(app).get(
        "/subscription/plans", headers={"Authorization": f"Bearer {buyer_token}"}
    ).json()["plans"]
    annual = next(p for p in plans if p["code"] == ANNUAL_CODE)

    assert annual["price_paise"] == 1_000_000         # ₹10,000 taxable value
    assert annual["gst_paise"] == 180_000             # ₹1,800
    assert annual["total_paise"] == 1_180_000         # ₹11,800 payable
    assert annual["pass_count"] == 100
    # …and those 100 passes stay usable for twelve calendar months.
    assert annual["duration_value"] == 12
    assert annual["duration_unit"] == "MONTH"
    assert annual["pass_validity_days"] == 360  # nominal 30-day months, display only


def test_tax_is_always_exactly_the_difference(buyer_token):
    """base + gst == total, in integer paise, for every plan."""
    db = TestingSessionLocal()
    try:
        for plan in SubscriptionService.list_plans(db):
            pricing = plan_pricing(plan)
            assert pricing["total_paise"] == pricing["price_paise"] + pricing["gst_paise"]
            assert isinstance(pricing["total_paise"], int)
    finally:
        db.close()


# -------------------------------------------------------------------- validity
def test_validity_is_six_months_for_the_ten_pack(buyer_token):
    db = TestingSessionLocal()
    try:
        plan = SubscriptionService.get_plan(db, MONTHLY_CODE)
        assert plan.duration_unit == BillingPeriod.MONTH
        assert plan.duration_value == 6
        assert plan_validity_days(plan) == 180  # nominal
    finally:
        db.close()


def test_validity_is_twelve_months_for_the_hundred_pack(buyer_token):
    db = TestingSessionLocal()
    try:
        plan = SubscriptionService.get_plan(db, ANNUAL_CODE)
        assert plan.duration_unit == BillingPeriod.MONTH
        assert plan.duration_value == 12
        assert plan_validity_days(plan) == 360  # nominal
    finally:
        db.close()


def _activate(email: str, plan_code: str) -> dict:
    """Buy a pack the way the paid path does and read out what it granted.

    Returns plain values, not ORM instances: the session is closed here, and a
    detached instance cannot lazily load the fields the assertions need.
    """
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one()
        subscription = SubscriptionService.create_subscription(db, user, plan_code)
        pack = SubscriptionService.activate_subscription(db, subscription)
        passes = db.query(AccessToken).filter(AccessToken.pack_id == pack.id).all()
        return {
            "pass_count": pack.token_count,
            "starts_at": subscription.starts_at,
            "subscription_expires_at": subscription.expires_at,
            "subscription_window": subscription.expires_at - subscription.starts_at,
            "pass_windows": [
                (p.unused_expires_at - p.available_at, p.unused_expires_at)
                for p in passes
            ],
        }
    finally:
        db.close()


@pytest.mark.parametrize(
    "email,plan_code,passes,months",
    [
        ("ten_pack_buyer@example.com", MONTHLY_CODE, 10, 6),
        ("hundred_pack_buyer@example.com", ANNUAL_CODE, 100, 12),
    ],
)
def test_a_pack_issues_its_passes_with_the_matching_window(
    email, plan_code, passes, months
):
    _account(email)
    granted = _activate(email, plan_code)

    assert granted["pass_count"] == passes
    assert len(granted["pass_windows"]) == passes
    expected_expiry = add_duration(granted["starts_at"], months, BillingPeriod.MONTH)
    # The subscription clock and every pass's unused window are calendar-exact.
    assert granted["subscription_expires_at"] == expected_expiry
    for window, expiry in granted["pass_windows"]:
        assert expiry == expected_expiry
        assert window == expected_expiry - granted["starts_at"]


def test_a_100_pass_pack_outlives_six_months():
    """The whole point: 100 passes run for twelve months, not six."""
    email = "long_window@example.com"
    _account(email)
    granted = _activate(email, ANNUAL_CODE)

    soonest = min(expiry for _window, expiry in granted["pass_windows"])
    assert soonest > datetime.utcnow() + timedelta(days=360)


# ------------------------------------------------------------------ at payment
def test_a_pre_gst_claim_is_refused():
    """Paying the listed ₹1,000 instead of the ₹1,180 total is rejected."""
    email = "pre_gst_buyer@example.com"
    _account(email)
    token = _token(email)
    client = TestClient(app)

    resp = client.post(
        "/payments/submit",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "plan_code": MONTHLY_CODE,
            "utr": "UTR-PREGST-01",
            "payment_date": "2026-10-20",
            "amount_paise": "100000",          # the pre-GST figure
        },
        files={"receipt": ("receipt.pdf", b"%PDF-1.4 test", "application/pdf")},
    )

    assert resp.status_code == 400, resp.text
    assert "does not match" in resp.json()["detail"]


# ------------------------------------------- buying is what unlocks the shop
MARKETPLACE_ROUTES = (
    "/marketplace/category-groups",
    "/marketplace/services",
    "/marketplace/categories",
    "/marketplace/services/aggregate/Hull%20Survey",
)


def _pay_and_approve(email: str, plan_code: str, amount_paise: int, utr: str) -> None:
    """Walk the paid path the way a buyer does: submit, then an admin approves."""
    client = TestClient(app)
    token = _token(email)

    submitted = client.post(
        "/payments/submit",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "plan_code": plan_code,
            "utr": utr,
            "payment_date": "2026-10-20",
            "amount_paise": str(amount_paise),
        },
        files={"receipt": ("receipt.pdf", b"%PDF-1.4 paid", "application/pdf")},
    )
    assert submitted.status_code == 201, submitted.text

    admin_email = f"admin-{utr.lower()}@nhaavmaritime.com"
    _admin(admin_email)
    admin_headers = {"Authorization": f"Bearer {_token(admin_email)}"}
    approved = client.post(
        f"/admin/payments/{submitted.json()['id']}/approve", headers=admin_headers
    )
    assert approved.status_code == 200, approved.text


def test_a_verified_client_must_pay_before_the_marketplace_opens():
    """For a CLIENT the platform fee is part of the access gate.

    Verification approval alone is not enough: with no paid subscription there
    are no passes and the marketplace refuses data, not just UI. Paying the fee
    and having an admin verify it is what opens the account.
    """
    email = "gated_buyer@example.com"
    _account(email)
    _verified_profile(email)
    headers = {"Authorization": f"Bearer {_token(email)}"}
    client = TestClient(app)

    # Verified but unpaid: every marketplace route is refused.
    for route in MARKETPLACE_ROUTES:
        resp = client.get(route, headers=headers)
        assert resp.status_code == 403, f"{route} should be locked, got {resp.status_code}"
        assert resp.json()["detail"]["code"] == "onboarding_incomplete"

    onboarding = client.get("/access/onboarding", headers=headers)
    assert onboarding.status_code == 200, onboarding.text
    assert onboarding.json()["subscription_active"] is False
    assert onboarding.json()["payment_required"] is True
    assert onboarding.json()["payment_submitted"] is False
    assert onboarding.json()["marketplace_unlocked"] is False
    assert onboarding.json()["next_step"] == "pay_subscription"

    # After paying the GST-inclusive total AND the admin approving it, the shop
    # opens — and what the account gets is the 10 passes it paid for. A session
    # started BEFORE activation carries no pass behind it, so the account signs
    # in again to start one that does.
    _pay_and_approve(email, MONTHLY_CODE, 118_000, "UTR-GATED-0001")
    headers = {"Authorization": f"Bearer {_token(email)}"}

    for route in MARKETPLACE_ROUTES:
        resp = client.get(route, headers=headers)
        assert resp.status_code == 200, f"{route} should be open, got {resp.status_code}"

    status = client.get("/subscription/status", headers=headers).json()
    assert status["access_control_enabled"] is True
    # The account paid for 10 passes; signing in to claim them consumes one.
    assert status["passes"]["total"] == 10
    assert status["passes"]["used"] == 1
    assert status["passes"]["remaining"] == 9
    assert 180 <= status["packs"][0]["pass_validity_days"] <= 185
    assert status["pass_validity_days"] == 180  # nominal six months


def test_the_hundred_pass_pack_is_billed_for_twelve_months():
    email = "gated_hundred@example.com"
    _account(email)
    _verified_profile(email)
    headers = {"Authorization": f"Bearer {_token(email)}"}
    client = TestClient(app)

    # A verified client is still locked until the platform fee is paid.
    assert client.get("/marketplace/services", headers=headers).status_code == 403

    _pay_and_approve(email, ANNUAL_CODE, 1_180_000, "UTR-GATED-0100")
    headers = {"Authorization": f"Bearer {_token(email)}"}

    assert client.get("/marketplace/services", headers=headers).status_code == 200
    status = client.get("/subscription/status", headers=headers).json()
    assert status["passes"]["total"] == 100
    assert 360 <= status["packs"][0]["pass_validity_days"] <= 366


def test_an_unverified_account_stays_locked_even_after_buying():
    """Verification approval is required in addition to the payment."""
    email = "unverified_buyer@example.com"
    _account(email)                      # email verified, profile NOT approved
    _pending_profile(email)              # a profile exists, still awaiting review
    headers = {"Authorization": f"Bearer {_token(email)}"}
    client = TestClient(app)

    _pay_and_approve(email, MONTHLY_CODE, 118_000, "UTR-UNVER-0001")
    headers = {"Authorization": f"Bearer {_token(email)}"}

    resp = client.get("/marketplace/services", headers=headers)
    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"]["code"] == "onboarding_incomplete"

    status = client.get("/subscription/status", headers=headers).json()
    assert status["passes"]["total"] == 10          # the passes exist…

    # …and they buy nothing on their own: verification is checked BEFORE the
    # subscription, so with no documents uploaded the account is still told to
    # finish its profile, not to pay again.
    onboarding = client.get("/access/onboarding", headers=headers).json()
    assert onboarding["subscription_active"] is True
    assert onboarding["marketplace_unlocked"] is False
    assert onboarding["next_step"] in {"complete_profile", "awaiting_review"}
