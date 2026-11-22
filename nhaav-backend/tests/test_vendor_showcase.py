"""
Vendor (supplier + service provider) rules: no passes, paid showcase time.

The captain's rules for the two vendor roles:

  * they have NO usage passes and NO session time limit, so nothing about their
    account is measured in 6-hour windows;
  * what they pay for is how long a LISTING is shown on the marketplace, in one
    of two approved choices:
        ₹1,000  -> 1 month  (30 days)
        ₹10,000 -> 1 year   (365 days)
  * the admin console offers both choices at verification, and the chosen period
    must match what the vendor actually paid;
  * account approval itself is document-only (no platform fee, no passes).

Also pins that the admin console keeps two separate approval queues.
"""
import io
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
from app.models.access_token import AccessToken
from app.models.document import Document, DocumentType
from app.models.listing_fee import ListingFee, ListingFeeStatus, ListingType
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service, ServiceListingStatus
from app.models.subscription import Subscription
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.user import User, UserRole
from app.services.listing_fee_service import ListingFeeService
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_vendor_showcase.db"
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


client = TestClient(app)
PASSWORD = "Password123!"
PNG = b"\x89PNG\r\n\x1a\n" + b"vendor-showcase-receipt"


def _headers(user: User) -> dict:
    token = jwt.encode(
        {"sub": str(user.id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )
    return {"Authorization": f"Bearer {token}"}


def _make_account(db, email: str, role: UserRole, *, with_document: bool = True, verified: bool = False):
    user = User(
        email=email,
        password_hash=hash_password(PASSWORD),
        role=role,
        full_name=email.split("@")[0],
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    user_id = user.id

    profile = Profile(
        user_id=user_id,
        company_name=f"{role.value.title()} Co",
        verification_status=(
            VerificationStatus.verified if verified else VerificationStatus.pending
        ),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    profile_id = profile.id

    if with_document:
        db.add(
            Document(
                user_id=user_id,
                document_type=DocumentType.kyc_due_diligence,
                file_url="https://storage.example.com/kyc.pdf",
                name="KYC",
            )
        )
        db.commit()

    db.close()
    return {"user_id": str(user_id), "profile_id": str(profile_id), "email": email}


def _admin_headers() -> dict:
    db = TestingSessionLocal()
    try:
        admin = db.query(User).filter(User.email == "showcase-admin@nhaav.com").first()
        if admin is None:
            admin = User(
                email="showcase-admin@nhaav.com",
                password_hash=hash_password(PASSWORD),
                role=UserRole.admin,
                full_name="Showcase Admin",
                is_verified=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        return _headers(admin)
    finally:
        db.close()


def _token_for(email: str) -> dict:
    resp = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _service_listing(db, provider_id) -> Service:
    listing = Service(
        provider_id=provider_id,
        name="Dock-side Generator Overhaul",
        category="Repairs & Maintenance",
        status=ServiceListingStatus.approved,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


def _submit_showcase(provider_headers, listing_id, plan: str, utr: str, amount=None):
    data = {
        "listing_type": "service",
        "listing_id": str(listing_id),
        "plan": plan,
        "utr": utr,
        "payment_date": datetime.utcnow().isoformat(),
    }
    if amount is not None:
        data["amount_paise"] = str(amount)
    return client.post(
        "/listing-fees/submit",
        data=data,
        files={"receipt": ("receipt.png", io.BytesIO(PNG), "image/png")},
        headers=provider_headers,
    )


@pytest.mark.parametrize("role", [UserRole.supplier, UserRole.provider])
def test_a_vendor_has_no_passes_and_no_session_limit(role):
    """Verified vendors are open for business without any pass allocation."""
    email = f"no-passes-{role.value}@vendors.com"
    db = TestingSessionLocal()
    _make_account(db, email, role, verified=True)
    db.close()

    login = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    body = login.json()
    # No pass is issued: there is no 6-hour session to count down.
    assert body["access_session"] is None
    assert body["access_blocked"] is None
    headers = {"Authorization": f"Bearer {body['access_token']}"}

    onboarding = client.get("/access/onboarding", headers=headers).json()
    assert onboarding["payment_required"] is False
    assert onboarding["marketplace_unlocked"] is True

    # And no subscription/access-pack rows exist for this account.
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == email).first()
    assert db.query(AccessToken).filter(AccessToken.owner_user_id == user.id).count() == 0
    assert db.query(Subscription).filter(Subscription.owner_user_id == user.id).count() == 0
    # ...so the access-pass gate is never switched on for a vendor.
    assert user.access_control_enabled is False
    db.close()

    # The marketplace answers without any pass being consumed.
    assert client.get("/marketplace/category-groups", headers=headers).status_code == 200


def test_vendor_approval_is_document_only():
    """No platform fee is involved in approving a vendor's account."""
    db = TestingSessionLocal()
    account = _make_account(db, "approve-me@vendors.com", UserRole.supplier)
    db.close()

    admin = _admin_headers()
    approved = client.post(
        f"/admin/verification/providers/{account['profile_id']}/action",
        json={"action": "approve"},
        headers=admin,
    )
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["passes_granted"] is None
    assert "passes" not in body["message"].lower()

    db = TestingSessionLocal()
    profile = db.query(Profile).filter(Profile.id == uuid.UUID(account["profile_id"])).first()
    assert profile.verification_status == VerificationStatus.verified
    user = db.query(User).filter(User.id == profile.user_id).first()
    assert db.query(AccessToken).filter(AccessToken.owner_user_id == user.id).count() == 0
    db.close()


def test_vendor_approval_without_documents_is_refused():
    db = TestingSessionLocal()
    account = _make_account(
        db, "no-docs-supplier@vendors.com", UserRole.supplier, with_document=False
    )
    db.close()

    resp = client.post(
        f"/admin/verification/providers/{account['profile_id']}/action",
        json={"action": "approve"},
        headers=_admin_headers(),
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["code"] == "documents_required"


def test_access_passes_cannot_be_granted_to_a_vendor():
    """The pack grant is client-only: vendors simply do not use passes."""
    db = TestingSessionLocal()
    account = _make_account(db, "no-packs@vendors.com", UserRole.supplier)
    db.close()

    resp = client.post(
        f"/admin/verification/providers/{account['profile_id']}/grant-passes",
        json={"pack": "10"},
        headers=_admin_headers(),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"]["code"] == "passes_client_only"

    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "no-packs@vendors.com").first()
    assert db.query(AccessToken).filter(AccessToken.owner_user_id == user.id).count() == 0
    db.close()


class TestShowcasePlans:
    def test_the_two_plans_are_one_month_and_one_year(self):
        resp = client.get("/listing-fees/instructions", headers=_admin_headers())
        assert resp.status_code == 200, resp.text
        plans = {p["code"]: p for p in resp.json()["plans"]}
        assert plans["month"]["amount_paise"] == 100_000
        assert plans["month"]["period_days"] == 30
        assert plans["year"]["amount_paise"] == 1_000_000
        assert plans["year"]["period_days"] == 365

    def test_an_unknown_plan_is_refused(self):
        db = TestingSessionLocal()
        account = _make_account(db, "bad-plan@vendors.com", UserRole.provider, verified=True)
        listing = _service_listing(db, uuid.UUID(account["user_id"]))
        db.close()

        resp = _submit_showcase(
            _token_for(account["email"]), listing.id, "decade", "UTR-BADPLAN-1"
        )
        assert resp.status_code == 400, resp.text
        assert resp.json()["detail"]["code"] == "unsupported_listing_plan"

    def test_the_amount_must_match_the_chosen_plan(self):
        db = TestingSessionLocal()
        account = _make_account(db, "wrong-amount@vendors.com", UserRole.provider, verified=True)
        listing = _service_listing(db, uuid.UUID(account["user_id"]))
        db.close()

        resp = _submit_showcase(
            _token_for(account["email"]), listing.id, "year", "UTR-WRONG-1", amount=100_000
        )
        assert resp.status_code == 400, resp.text
        assert "1 year" in resp.json()["detail"]

    def test_a_1000_payment_buys_one_month(self):
        db = TestingSessionLocal()
        account = _make_account(db, "month-vendor@vendors.com", UserRole.provider, verified=True)
        listing = _service_listing(db, uuid.UUID(account["user_id"]))
        db.close()
        headers = _token_for(account["email"])

        submitted = _submit_showcase(headers, listing.id, "month", "UTR-MONTH-1")
        assert submitted.status_code == 201, submitted.text
        fee_body = submitted.json()
        assert fee_body["amount_paise"] == 100_000
        assert fee_body["period_days"] == 30
        assert fee_body["plan_code"] == "month"
        assert fee_body["expires_at"] is None  # nothing live until verified

        # The admin picks "1 month" from the two choices.
        approved = client.post(
            f"/admin/listing-fees/{fee_body['id']}/approve",
            params={"period": "month"},
            headers=_admin_headers(),
        )
        assert approved.status_code == 200, approved.text

        db = TestingSessionLocal()
        listing_row = db.query(Service).filter(Service.id == listing.id).first()
        assert ListingFeeService.is_live(listing_row) is True
        window = listing_row.expires_at - listing_row.published_at
        assert timedelta(days=29) < window <= timedelta(days=30)
        db.close()

    def test_a_10000_payment_buys_one_year(self):
        db = TestingSessionLocal()
        account = _make_account(db, "year-vendor@vendors.com", UserRole.provider, verified=True)
        listing = _service_listing(db, uuid.UUID(account["user_id"]))
        db.close()
        headers = _token_for(account["email"])

        submitted = _submit_showcase(headers, listing.id, "year", "UTR-YEAR-1")
        assert submitted.status_code == 201, submitted.text
        fee_body = submitted.json()
        assert fee_body["amount_paise"] == 1_000_000
        assert fee_body["period_days"] == 365
        assert fee_body["plan_code"] == "year"

        approved = client.post(
            f"/admin/listing-fees/{fee_body['id']}/approve",
            params={"period": "year"},
            headers=_admin_headers(),
        )
        assert approved.status_code == 200, approved.text

        db = TestingSessionLocal()
        listing_row = db.query(Service).filter(Service.id == listing.id).first()
        assert ListingFeeService.is_live(listing_row) is True
        window = listing_row.expires_at - listing_row.published_at
        assert timedelta(days=364) < window <= timedelta(days=365)
        db.close()

    def test_the_admin_cannot_grant_a_longer_period_than_was_paid(self):
        """A ₹1,000 transfer must not be upgraded to a year by mistake."""
        db = TestingSessionLocal()
        account = _make_account(db, "mismatch-vendor@vendors.com", UserRole.provider, verified=True)
        listing = _service_listing(db, uuid.UUID(account["user_id"]))
        db.close()
        headers = _token_for(account["email"])

        fee_body = _submit_showcase(headers, listing.id, "month", "UTR-MISMATCH-1").json()
        admin = _admin_headers()

        wrong = client.post(
            f"/admin/listing-fees/{fee_body['id']}/approve",
            params={"period": "year"},
            headers=admin,
        )
        assert wrong.status_code == 409, wrong.text
        detail = wrong.json()["detail"]
        assert detail["code"] == "period_mismatch"
        assert detail["paid_period_days"] == 30

        # Nothing was published, and the fee is still awaiting a real decision.
        db = TestingSessionLocal()
        fee = db.query(ListingFee).filter(ListingFee.id == uuid.UUID(fee_body["id"])).first()
        listing_row = db.query(Service).filter(Service.id == listing.id).first()
        assert fee.status == ListingFeeStatus.SUBMITTED
        assert listing_row.expires_at is None
        db.close()

        # The period they actually paid for still works.
        right = client.post(
            f"/admin/listing-fees/{fee_body['id']}/approve",
            params={"period": "month"},
            headers=admin,
        )
        assert right.status_code == 200, right.text

    def test_verifying_without_choosing_a_period_uses_the_paid_one(self):
        db = TestingSessionLocal()
        account = _make_account(db, "default-plan@vendors.com", UserRole.provider, verified=True)
        listing = _service_listing(db, uuid.UUID(account["user_id"]))
        db.close()

        # A submission with no `plan` field means the ₹1,000 / 1-month choice.
        resp = client.post(
            "/listing-fees/submit",
            data={
                "listing_type": "service",
                "listing_id": str(listing.id),
                "utr": "UTR-DEFAULT-1",
                "payment_date": datetime.utcnow().isoformat(),
            },
            files={"receipt": ("receipt.png", io.BytesIO(PNG), "image/png")},
            headers=_token_for(account["email"]),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["plan_code"] == "month"

        approved = client.post(
            f"/admin/listing-fees/{resp.json()['id']}/approve",
            headers=_admin_headers(),
        )
        assert approved.status_code == 200, approved.text
        expires = datetime.fromisoformat(approved.json()["expires_at"].replace("Z", ""))
        assert timedelta(days=29) < expires - datetime.utcnow() <= timedelta(days=30)


def test_the_admin_console_has_two_separate_approval_queues():
    db = TestingSessionLocal()
    client_account = _make_account(db, "queue-buyer@showcase.com", UserRole.client)
    supplier_account = _make_account(db, "queue-supplier@showcase.com", UserRole.supplier)
    provider_account = _make_account(db, "queue-provider@showcase.com", UserRole.provider)
    db.close()

    admin = _admin_headers()

    clients = client.get(
        "/admin/verification/providers", params={"role": "client", "limit": 200}, headers=admin
    ).json()
    assert {row["role"] for row in clients["data"]} == {"client"}
    assert any(row["id"] == client_account["profile_id"] for row in clients["data"])

    vendors = client.get(
        "/admin/verification/providers", params={"role": "vendor", "limit": 200}, headers=admin
    ).json()
    vendor_ids = {row["id"] for row in vendors["data"]}
    assert {supplier_account["profile_id"], provider_account["profile_id"]} <= vendor_ids
    assert client_account["profile_id"] not in vendor_ids
    assert {row["role"] for row in vendors["data"]} == {"supplier", "provider"}

    everyone = client.get(
        "/admin/verification/providers", params={"limit": 200}, headers=admin
    ).json()["data"]
    assert {row["role"] for row in everyone} == {"client", "supplier", "provider"}

    # Counts follow the scope, and the two queues apply their own readiness rule:
    # a vendor with documents but no bank transfer is still approvable.
    vendor_stats = client.get(
        "/admin/verification/stats", params={"role": "vendor"}, headers=admin
    ).json()
    assert vendor_stats["scope"] == "vendor"
    assert vendor_stats["ready_for_approval"] >= 2
    client_stats = client.get(
        "/admin/verification/stats", params={"role": "client"}, headers=admin
    ).json()
    assert client_stats["scope"] == "client"
    # The client in this test has documents but no payment, so nothing is ready.
    assert client_stats["ready_for_approval"] == 0

    ready_vendors = client.get(
        "/admin/verification/providers",
        params={"role": "vendor", "ready_only": "true", "limit": 200},
        headers=admin,
    ).json()["data"]
    assert {row["id"] for row in ready_vendors} >= {supplier_account["profile_id"]}
    ready_clients = client.get(
        "/admin/verification/providers",
        params={"role": "client", "ready_only": "true", "limit": 200},
        headers=admin,
    ).json()["data"]
    assert client_account["profile_id"] not in {row["id"] for row in ready_clients}
