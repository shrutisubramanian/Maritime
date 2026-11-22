"""
Vendor showcase regression suite: ₹1,000 for 1 month, ₹10,000 for 1 year.

Vendors have no usage passes and no session time limit — their money buys how
long a listing is SHOWN, in one of two approved plans.

Covers the product rule behind ListingFeeService:
  - the amount and period are SERVER constants, never client-chosen
  - submitting a UTR + receipt makes a fee SUBMITTED, never live
  - one open submission (or a running window) blocks a second payment
  - only the owner in the right role can pay, and only an admin can verify
  - the admin picks the 1-month or 1-year period, which must match what was paid
  - verification stamps that window on an approved listing
  - an approved listing is invisible in the marketplace until a verified fee
  - rejection needs a reason and leaves the listing unpublished (re-submittable)
  - payment verified BEFORE content moderation: moderation publishes it
"""
import io
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.config import settings
from app.models.listing_fee import ListingFee, ListingFeeStatus, ListingType
from app.models.profile import Profile, VerificationStatus
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.service import Service, ServiceListingStatus
from app.models.user import User, UserRole
from app.services.listing_fee_service import (
    LISTING_FEE_PAISE,
    LISTING_PERIOD_DAYS,
    ListingFeeService,
)
from app.services.moderation_service import ModerationService

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_listing_fees.db"
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
    # Other modules override get_db on the same global app at import time.
    prev = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    if prev is not None:
        app.dependency_overrides[get_db] = prev


client = TestClient(app)


def _headers(user: User) -> dict:
    token = jwt.encode(
        {"sub": str(user.id), "role": user.role.value},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    return {"Authorization": f"Bearer {token}"}


def _account(db, role, company) -> User:
    user = User(email=f"{uuid.uuid4().hex[:10]}@fee.test", password_hash="x", role=role, full_name=company)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(Profile(user_id=user.id, company_name=company, verification_status=VerificationStatus.verified))
    db.commit()
    return user


def _service_listing(db, provider, status=ServiceListingStatus.approved) -> Service:
    listing = Service(
        provider_id=provider.id,
        name=f"Underwater Hull Cleaning {uuid.uuid4().hex[:6]}",
        category="Hull & Underwater",
        subcategory="Hull & Underwater Cleaning",
        description="In-water cleaning by certified divers.",
        service_id="underwater-hull-cleaning",
        port_id="Mumbai",
        price_paise=185_000_00,
        price_note="per vessel",
        status=status,
        is_active=status == ServiceListingStatus.approved,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


def _supply_listing(db, supplier, status=SupplyListingStatus.approved) -> SupplyListing:
    listing = SupplyListing(
        supplier_id=supplier.id,
        name=f"Mooring Rope 64mm {uuid.uuid4().hex[:6]}",
        category="Ship Chandlery",
        description="8-strand polypropylene mooring line.",
        price_paise=24_500_00,
        price_note="per coil",
        ports=["Singapore", "Mumbai"],
        status=status,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


PNG = b"\x89PNG\r\n\x1a\n" + b"demo-receipt"


def _submit(listing_type, listing_id, utr="HDFC2610260001", user=None, amount=None, receipt_name="receipt.png"):
    data = {
        "listing_type": listing_type,
        "listing_id": str(listing_id),
        "utr": utr,
        "payment_date": datetime.utcnow().isoformat(),
    }
    if amount is not None:
        data["amount_paise"] = str(amount)
    return client.post(
        "/listing-fees/submit",
        data=data,
        files={"receipt": (receipt_name, io.BytesIO(PNG), "image/png")},
        headers=_headers(user) if user else {},
    )


@pytest.fixture()
def accounts():
    db = TestingSessionLocal()
    provider = _account(db, UserRole.provider, "OceanTech Marine Services")
    other = _account(db, UserRole.provider, "Atlas Marine Engineering")
    supplier = _account(db, UserRole.supplier, "Northstar Marine Supplies")
    admin = _account(db, UserRole.admin, "NHAAV Admin")
    client_user = _account(db, UserRole.client, "Meridian Ship Management")
    yield {"provider": provider, "other": other, "supplier": supplier, "admin": admin, "client": client_user}
    db.close()


# ------------------------------------------------------------------ constants
class TestFeeConstants:
    def test_instructions_expose_the_server_amount_and_period(self, accounts):
        res = client.get("/listing-fees/instructions", headers=_headers(accounts["provider"]))
        assert res.status_code == 200
        body = res.json()
        assert body["amount_paise"] == 100_000 == LISTING_FEE_PAISE
        assert body["period_days"] == 30 == LISTING_PERIOD_DAYS
        assert body["currency"] == "INR"
        # Both approved showcase choices are published by the server.
        plans = {p["code"]: p for p in body["plans"]}
        assert plans["month"] == {
            "code": "month",
            "label": "1 month",
            "amount_paise": 100_000,
            "period_days": 30,
        }
        assert plans["year"]["amount_paise"] == 1_000_000
        assert plans["year"]["period_days"] == 365

    def test_instructions_never_hardcode_bank_details(self, accounts):
        # `configured` mirrors backend config; the keys exist either way so the
        # UI can decide not to present an unconfigured account as payable.
        body = client.get("/listing-fees/instructions", headers=_headers(accounts["provider"])).json()
        assert isinstance(body["configured"], bool)
        assert set(body) >= {"account_holder", "bank_name", "account_number", "ifsc", "instructions"}


# ----------------------------------------------------------------- submission
class TestSubmission:
    def test_submit_creates_a_submitted_fee_and_publishes_nothing(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"])
        res = _submit("service", listing.id, user=accounts["provider"])
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["status"] == "SUBMITTED"
        assert body["amount_paise"] == LISTING_FEE_PAISE
        assert body["period_days"] == LISTING_PERIOD_DAYS
        assert body["starts_at"] is None and body["expires_at"] is None

        db.refresh(listing)
        assert ListingFeeService.is_live(listing) is False
        db.close()

    def test_client_cannot_choose_a_different_amount(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"])
        res = _submit("service", listing.id, utr="HDFC2610260002", amount=1, user=accounts["provider"])
        assert res.status_code == 400
        assert "cannot be changed" in res.json()["detail"]
        db.close()

    def test_second_submission_is_blocked_while_one_is_open(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"])
        assert _submit("service", listing.id, utr="HDFC2610260003", user=accounts["provider"]).status_code == 201
        again = _submit("service", listing.id, utr="HDFC2610260004", user=accounts["provider"])
        assert again.status_code == 409
        assert "awaiting admin verification" in again.json()["detail"]
        db.close()

    def test_a_live_listing_cannot_be_paid_again_before_expiry(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"])
        assert _submit("service", listing.id, utr="HDFC2610260005", user=accounts["provider"]).status_code == 201
        fee = db.query(ListingFee).filter(ListingFee.listing_id == listing.id).first()
        ListingFeeService.approve(db, accounts["admin"], fee.id)
        db.refresh(listing)

        res = _submit("service", listing.id, utr="HDFC2610260006", user=accounts["provider"])
        assert res.status_code == 409
        assert "placement running" in res.json()["detail"]
        db.close()

    def test_a_utr_backs_at_most_one_live_submission(self, accounts):
        db = TestingSessionLocal()
        one = _service_listing(db, accounts["provider"])
        two = _service_listing(db, accounts["provider"])
        assert _submit("service", one.id, utr="HDFC2610260007", user=accounts["provider"]).status_code == 201
        dupe = _submit("service", two.id, utr="HDFC2610260007", user=accounts["provider"])
        assert dupe.status_code == 409
        assert "already been submitted" in dupe.json()["detail"]
        db.close()

    def test_short_utr_is_rejected(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"])
        res = _submit("service", listing.id, utr="ABC", user=accounts["provider"])
        assert res.status_code == 400
        db.close()

    def test_only_the_right_role_can_pay(self, accounts):
        db = TestingSessionLocal()
        service = _service_listing(db, accounts["provider"])
        supply = _supply_listing(db, accounts["supplier"])

        # A supplier cannot pay for a service listing.
        res = _submit("service", service.id, utr="HDFC2610260008", user=accounts["supplier"])
        assert res.status_code == 403
        # A provider cannot pay for a supply listing.
        res = _submit("supply", supply.id, utr="HDFC2610260009", user=accounts["provider"])
        assert res.status_code == 403
        # Another provider cannot pay for someone else's listing (404, no leak).
        res = _submit("service", service.id, utr="HDFC2610260010", user=accounts["other"])
        assert res.status_code == 404
        # A client cannot pay for anything.
        res = _submit("supply", supply.id, utr="HDFC2610260011", user=accounts["client"])
        assert res.status_code == 403
        db.close()


# -------------------------------------------------------------------- reviews
class TestAdminReview:
    def test_non_admin_cannot_read_the_queue(self, accounts):
        for user in (accounts["provider"], accounts["client"], accounts["supplier"]):
            res = client.get("/admin/listing-fees", headers=_headers(user))
            assert res.status_code == 403

    def test_queue_returns_only_submissions_awaiting_a_decision(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"])
        assert _submit("service", listing.id, utr="HDFC2610260012", user=accounts["provider"]).status_code == 201

        res = client.get("/admin/listing-fees", headers=_headers(accounts["admin"]))
        assert res.status_code == 200
        queue = res.json()["data"]
        mine = [f for f in queue if f["listing_id"] == str(listing.id)]
        assert len(mine) == 1
        assert mine[0]["owner_email"] == accounts["provider"].email
        assert mine[0]["owner_company"] == "OceanTech Marine Services"
        db.close()

    def test_verification_starts_the_one_month_window_and_the_listing_goes_live(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"])
        assert _submit("service", listing.id, utr="HDFC2610260013", user=accounts["provider"]).status_code == 201
        fee = db.query(ListingFee).filter(ListingFee.listing_id == listing.id).first()

        res = client.post(f"/admin/listing-fees/{fee.id}/approve", headers=_headers(accounts["admin"]))
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["status"] == "VERIFIED"
        assert body["starts_at"] is not None and body["expires_at"] is not None

        db.expire_all()
        db.refresh(fee)
        db.refresh(listing)
        assert fee.status == ListingFeeStatus.VERIFIED
        # The default plan is 1 month: ~30 days from verification.
        assert listing.expires_at is not None
        assert timedelta(days=29) < (listing.expires_at - listing.published_at) <= timedelta(days=30)
        assert ListingFeeService.is_live(listing) is True

        # Verifying twice is refused — a decision is terminal.
        again = client.post(f"/admin/listing-fees/{fee.id}/approve", headers=_headers(accounts["admin"]))
        assert again.status_code == 409
        db.close()

    def test_rejection_needs_a_reason_and_publishes_nothing(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"])
        assert _submit("service", listing.id, utr="HDFC2610260014", user=accounts["provider"]).status_code == 201
        fee = db.query(ListingFee).filter(ListingFee.listing_id == listing.id).first()

        short = client.post(
            f"/admin/listing-fees/{fee.id}/reject",
            json={"reason": "x"},
            headers=_headers(accounts["admin"]),
        )
        # 422 from the schema's min_length=3 (400 when the service is called
        # directly) — either way a reason is mandatory.
        assert short.status_code in (400, 422)

        res = client.post(
            f"/admin/listing-fees/{fee.id}/reject",
            json={"reason": "Receipt does not match the bank statement."},
            headers=_headers(accounts["admin"]),
        )
        assert res.status_code == 200
        assert res.json()["status"] == "REJECTED"

        db.expire_all()
        db.refresh(listing)
        assert ListingFeeService.is_live(listing) is False

        # A rejected fee leaves the UTR scope, so a corrected transfer may be
        # re-submitted without re-creating the listing.
        res = _submit("service", listing.id, utr="HDFC2610260015", user=accounts["provider"])
        assert res.status_code == 201
        db.close()

    def test_receipt_is_owner_or_admin_only(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"])
        assert _submit("service", listing.id, utr="HDFC2610260016", user=accounts["provider"]).status_code == 201
        fee = db.query(ListingFee).filter(ListingFee.listing_id == listing.id).first()

        assert client.get(f"/listing-fees/{fee.id}/receipt", headers=_headers(accounts["provider"])).status_code == 200
        assert client.get(f"/listing-fees/{fee.id}/receipt", headers=_headers(accounts["admin"])).status_code == 200
        # A stranger gets 404, not 403, so the receipt's existence never leaks.
        assert client.get(f"/listing-fees/{fee.id}/receipt", headers=_headers(accounts["other"])).status_code == 404
        assert client.get(f"/listing-fees/{fee.id}/receipt").status_code in (401, 404)
        db.close()


# ------------------------------------------------------- moderation + payment
class TestVisibilityGate:
    def test_approved_supply_listing_is_hidden_until_the_fee_is_verified(self, accounts):
        db = TestingSessionLocal()
        listing = _supply_listing(db, accounts["supplier"])

        # Approved, but unpaid: the marketplace must not show it.
        rows = client.get("/supplies/").json()["data"]
        assert str(listing.id) not in [item["id"] for item in rows]

        assert _submit("supply", listing.id, utr="HDFC2610260017", user=accounts["supplier"]).status_code == 201
        fee = db.query(ListingFee).filter(ListingFee.listing_id == listing.id).first()
        client.post(f"/admin/listing-fees/{fee.id}/approve", headers=_headers(accounts["admin"]))

        db.expire_all()
        rows = client.get("/supplies/").json()["data"]
        assert str(listing.id) in [item["id"] for item in rows]

        # And the detail endpoint answers for it too.
        assert client.get(f"/supplies/{listing.id}").status_code == 200
        db.close()

    def test_expired_placement_removes_the_listing_without_rejecting_it(self, accounts):
        db = TestingSessionLocal()
        listing = _supply_listing(db, accounts["supplier"])
        assert _submit("supply", listing.id, utr="HDFC2610260018", user=accounts["supplier"]).status_code == 201
        fee = db.query(ListingFee).filter(ListingFee.listing_id == listing.id).first()
        client.post(f"/admin/listing-fees/{fee.id}/approve", headers=_headers(accounts["admin"]))

        db.expire_all()
        db.refresh(listing)
        listing.expires_at = datetime.utcnow() - timedelta(days=1)
        db.commit()

        assert ListingFeeService.is_live(listing) is False
        ids = [item["id"] for item in client.get("/supplies/").json()["data"]]
        assert str(listing.id) not in ids
        # Expiry hides, it does not reject: content stays approved for renewal.
        assert listing.status == SupplyListingStatus.approved
        db.close()

    def test_payment_verified_before_content_moderation_publishes_on_approval(self, accounts):
        """The two approvals may arrive in either order; both end live."""
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"], status=ServiceListingStatus.pending_review)
        listing.is_active = False
        db.commit()

        assert _submit("service", listing.id, utr="HDFC2610260019", user=accounts["provider"]).status_code == 201
        fee = db.query(ListingFee).filter(ListingFee.listing_id == listing.id).first()
        client.post(f"/admin/listing-fees/{fee.id}/approve", headers=_headers(accounts["admin"]))

        db.expire_all()
        db.refresh(listing)
        # Paid, but still awaiting content review -> not visible.
        assert ListingFeeService.is_live(listing) is False

        ModerationService.act(
            db, accounts["admin"].id, "service", listing.id, "approved"
        )
        db.expire_all()
        db.refresh(listing)
        assert listing.status == ServiceListingStatus.approved
        assert ListingFeeService.is_live(listing) is True
        assert listing.expires_at is not None
        db.close()

    def test_moderation_approval_alone_does_not_publish(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"], status=ServiceListingStatus.pending_review)
        listing.is_active = False
        db.commit()

        ModerationService.act(db, accounts["admin"].id, "service", listing.id, "approved")
        db.expire_all()
        db.refresh(listing)
        assert listing.status == ServiceListingStatus.approved
        assert ListingFeeService.is_live(listing) is False
        assert listing.expires_at is None
        db.close()


# --------------------------------------------------------------- owner's view
class TestOwnerStatus:
    def test_status_endpoint_reports_live_and_awaiting_states(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"])
        res = client.get(
            "/listing-fees/status",
            params={"listing_type": "service", "listing_id": str(listing.id)},
            headers=_headers(accounts["provider"]),
        )
        assert res.status_code == 200
        body = res.json()
        assert body["is_live"] is False
        assert body["awaiting_verification"] is False
        assert body["amount_paise"] == LISTING_FEE_PAISE

        _submit("service", listing.id, utr="HDFC2610260020", user=accounts["provider"])
        res = client.get(
            "/listing-fees/status",
            params={"listing_type": "service", "listing_id": str(listing.id)},
            headers=_headers(accounts["provider"]),
        )
        body = res.json()
        assert body["awaiting_verification"] is True
        assert body["latest_fee"]["status"] == "SUBMITTED"
        db.close()

    def test_owner_may_not_inspect_another_owners_listing(self, accounts):
        db = TestingSessionLocal()
        listing = _service_listing(db, accounts["provider"])
        res = client.get(
            "/listing-fees/status",
            params={"listing_type": "service", "listing_id": str(listing.id)},
            headers=_headers(accounts["other"]),
        )
        assert res.status_code == 404
        db.close()

    def test_my_submissions_are_scoped_to_the_owner(self, accounts):
        db = TestingSessionLocal()
        own = _service_listing(db, accounts["provider"])
        theirs = _service_listing(db, accounts["other"])
        _submit("service", own.id, utr="HDFC2610260021", user=accounts["provider"])
        _submit("service", theirs.id, utr="HDFC2610260022", user=accounts["other"])

        mine = client.get("/listing-fees/mine", headers=_headers(accounts["provider"])).json()["data"]
        assert {f["listing_id"] for f in mine} == {str(own.id)}
        db.close()
