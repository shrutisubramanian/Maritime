"""
Lifecycle rules for paid COMPANY-PROFILE visibility.

These close the gaps left by the main marketplace suite: the paid window a
verification actually grants, renewal extending instead of stacking, a rejected
payment granting nothing, expired entitlement disappearing from discovery, and a
receipt that is no longer on disk reporting a clean 404 rather than an error.

Nothing here touches the legacy listing-fee workflow: a listing fee buys showcase
time for ONE listing, a visibility payment buys the WHOLE company profile.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.profile import Profile, VerificationStatus
from app.models.profile_visibility import (
    ProfileVisibility,
    ProfileVisibilityPlan,
    ProfileVisibilityStatus,
)
from app.models.user import User, UserRole
from entitlement_helpers import grant_marketplace_access

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_profile_visibility_lifecycle.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
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


@pytest.fixture(scope="module")
def api():
    return TestClient(app)


def _token(user: User) -> dict:
    tok = jwt.encode({"sub": str(user.id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return {"Authorization": f"Bearer {tok}"}


def _user(db, role, company, verified=True, email_prefix="u"):
    user = User(
        email=f"{uuid.uuid4().hex[:8]}_{email_prefix}@nhaav.test",
        password_hash="x",
        role=role,
        full_name=company,
        phone="+91 90000 00000",
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(
        Profile(
            user_id=user.id,
            company_name=company,
            verification_status=(
                VerificationStatus.verified if verified else VerificationStatus.pending
            ),
        )
    )
    db.commit()
    return user


def _buyer(db):
    buyer = _user(db, UserRole.client, "Buyer Co", verified=True, email_prefix="client")
    grant_marketplace_access(db, buyer)
    return buyer


def _profile_of(db, user: User) -> Profile:
    return db.query(Profile).filter(Profile.user_id == user.id).first()


def _payment(db, profile, plan="monthly", status=ProfileVisibilityStatus.SUBMITTED, receipt_path=None):
    days = 365 if plan == "annual" else 30
    base = 1_000_000 if plan == "annual" else 100_000
    gst = round(base * settings.GST_RATE_PERCENT / 100)
    payment = ProfileVisibility(
        profile_id=profile.id,
        owner_user_id=profile.user_id,
        plan=ProfileVisibilityPlan(plan),
        period_days=days,
        base_amount_paise=base,
        gst_rate_percent=settings.GST_RATE_PERCENT,
        gst_amount_paise=gst,
        total_amount_paise=base + gst,
        utr=f"UTR{uuid.uuid4().hex[:10].upper()}",
        payment_date=datetime.utcnow(),
        receipt_path=receipt_path or "uploads/payment_receipts/test.pdf",
        receipt_filename="test.pdf",
        status=status,
        submitted_at=datetime.utcnow(),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


def _granted(db, profile, days=30):
    """An already-verified window, for renewal/expiry setup."""
    now = datetime.utcnow()
    db.add(
        ProfileVisibility(
            profile_id=profile.id,
            owner_user_id=profile.user_id,
            plan=ProfileVisibilityPlan.monthly,
            period_days=days,
            base_amount_paise=100_000,
            gst_rate_percent=18,
            gst_amount_paise=18_000,
            total_amount_paise=118_000,
            utr=f"UTR{uuid.uuid4().hex[:10].upper()}",
            payment_date=now,
            receipt_path="uploads/payment_receipts/test.pdf",
            receipt_filename="test.pdf",
            status=ProfileVisibilityStatus.VERIFIED,
            starts_at=now,
            expires_at=now + timedelta(days=days),
        )
    )
    db.commit()


def _parse(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=None)


def _discovered(api, buyer, company: str) -> list[str]:
    resp = api.get(
        "/marketplace/companies",
        params={"vendor_type": "provider", "search": company},
        headers=_token(buyer),
    )
    assert resp.status_code == 200, resp.text
    return [card.get("company_name") for card in resp.json()["data"]]


class TestVerificationWindow:
    def test_monthly_approval_grants_exactly_30_days(self, api):
        db = TestingSessionLocal()
        admin = _user(db, UserRole.admin, "Nhaav Admin", email_prefix="admin")
        vendor = _user(db, UserRole.provider, "Thirty Day Marine", email_prefix="prov")
        payment = _payment(db, _profile_of(db, vendor), plan="monthly")

        resp = api.post(f"/admin/profile-visibility/{payment.id}/verify", headers=_token(admin))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "VERIFIED"
        start = _parse(body["starts_at"])
        end = _parse(body["expires_at"])
        assert end - start == timedelta(days=30)
        assert start <= datetime.utcnow() + timedelta(minutes=1)
        db.close()

    def test_annual_approval_grants_exactly_365_days(self, api):
        db = TestingSessionLocal()
        admin = _user(db, UserRole.admin, "Nhaav Admin", email_prefix="admin")
        vendor = _user(db, UserRole.provider, "Full Year Marine", email_prefix="prov")
        payment = _payment(db, _profile_of(db, vendor), plan="annual")

        resp = api.post(f"/admin/profile-visibility/{payment.id}/verify", headers=_token(admin))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["plan"] == "annual"
        assert _parse(body["expires_at"]) - _parse(body["starts_at"]) == timedelta(days=365)
        db.close()

    def test_renewal_extends_the_running_window_instead_of_stacking(self, api):
        db = TestingSessionLocal()
        admin = _user(db, UserRole.admin, "Nhaav Admin", email_prefix="admin")
        vendor = _user(db, UserRole.provider, "Renewing Marine", email_prefix="prov")
        profile = _profile_of(db, vendor)
        _granted(db, profile, days=10)
        current = (
            db.query(ProfileVisibility)
            .filter(ProfileVisibility.profile_id == profile.id)
            .one()
        )
        current_expiry = current.expires_at

        payment = _payment(db, profile, plan="monthly")
        resp = api.post(f"/admin/profile-visibility/{payment.id}/verify", headers=_token(admin))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert _parse(body["starts_at"]) == current_expiry
        assert _parse(body["expires_at"]) == current_expiry + timedelta(days=30)
        db.close()


class TestRejectionAndExpiry:
    def test_rejected_payment_activates_nothing(self, api):
        db = TestingSessionLocal()
        admin = _user(db, UserRole.admin, "Nhaav Admin", email_prefix="admin")
        vendor = _user(db, UserRole.provider, "Rejected Marine", email_prefix="prov")
        buyer = _buyer(db)
        payment = _payment(db, _profile_of(db, vendor))

        resp = api.post(
            f"/admin/profile-visibility/{payment.id}/reject",
            json={"reason": "Transfer not found on the bank statement"},
            headers=_token(admin),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "REJECTED"

        mine = api.get("/profile-visibility/mine", headers=_token(vendor))
        assert mine.status_code == 200, mine.text
        assert mine.json()["is_visible"] is False
        assert mine.json()["latest_payment"]["status"] == "REJECTED"
        assert mine.json()["latest_payment"]["rejection_reason"]
        assert "Rejected Marine" not in _discovered(api, buyer, "Rejected Marine")
        db.close()

    def test_expired_entitlement_disappears_from_discovery(self, api):
        db = TestingSessionLocal()
        vendor = _user(db, UserRole.provider, "Expiring Marine", email_prefix="prov")
        buyer = _buyer(db)
        profile = _profile_of(db, vendor)

        now = datetime.utcnow()
        db.add(
            ProfileVisibility(
                profile_id=profile.id,
                owner_user_id=vendor.id,
                plan=ProfileVisibilityPlan.monthly,
                period_days=30,
                base_amount_paise=100_000,
                gst_rate_percent=18,
                gst_amount_paise=18_000,
                total_amount_paise=118_000,
                utr=f"UTR{uuid.uuid4().hex[:10].upper()}",
                payment_date=now - timedelta(days=40),
                receipt_path="uploads/payment_receipts/test.pdf",
                receipt_filename="test.pdf",
                status=ProfileVisibilityStatus.VERIFIED,
                starts_at=now - timedelta(days=40),
                expires_at=now - timedelta(days=10),
            )
        )
        db.commit()

        assert "Expiring Marine" not in _discovered(api, buyer, "Expiring Marine")
        mine = api.get("/profile-visibility/mine", headers=_token(vendor))
        assert mine.status_code == 200, mine.text
        assert mine.json()["is_visible"] is False
        db.close()

    def test_missing_receipt_file_returns_404(self, api, tmp_path):
        db = TestingSessionLocal()
        admin = _user(db, UserRole.admin, "Nhaav Admin", email_prefix="admin")
        vendor = _user(db, UserRole.provider, "Lost Receipt Marine", email_prefix="prov")
        payment = _payment(db, _profile_of(db, vendor), receipt_path=str(tmp_path / "gone.pdf"))

        resp = api.get(f"/profile-visibility/{payment.id}/receipt", headers=_token(admin))
        assert resp.status_code == 404
        db.close()
