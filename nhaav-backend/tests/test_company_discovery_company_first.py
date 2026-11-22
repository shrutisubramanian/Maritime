"""Company-first discovery guarantees.

The marketplace browses COMPANIES. These tests pin the properties that make that
true after the discovery query was batched:

* one company = one card, regardless of how many live listings it holds;
* a capability filter finds a company through either its declared taxonomy OR
  its live approved listings;
* category / capability / port / country / search filters compose;
* eligibility still requires BOTH an approved profile AND an active paid window;
* pagination is stable and empty results are valid;
* public payloads carry no private account, payment or document data.

Taxonomy note: provider categories are seeded from ``ServiceCategory.category_group``
and their capabilities from ``ServiceCategory.name`` — that is the existing
source of truth, so the tests use it rather than inventing a parallel taxonomy.
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
from app.models.service import Service, ServiceListingStatus
from app.models.service_category import ServiceCategory
from app.models.user import User, UserRole
from entitlement_helpers import grant_marketplace_access

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_company_discovery_company_first.db"
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


def _buyer(db):
    buyer = User(
        email=f"{uuid.uuid4().hex[:8]}_buyer@nhaav.test",
        password_hash="x",
        role=UserRole.client,
        full_name="Buyer Co",
        phone="+91 90000 00001",
        is_verified=True,
    )
    db.add(buyer)
    db.commit()
    db.refresh(buyer)
    grant_marketplace_access(db, buyer)
    return buyer


def _seed_category(db, service_name, group):
    """Seed the provider taxonomy the same way production data does."""
    if db.query(ServiceCategory).filter(ServiceCategory.name == service_name).first() is None:
        db.add(ServiceCategory(name=service_name, category_group=group))
        db.commit()


def _vendor(db, name, category=None, subs=(), verified=True, head_office="Mumbai Port", country="India"):
    user = User(
        email=f"{uuid.uuid4().hex[:8]}_vendor@nhaav.test",
        password_hash="x",
        role=UserRole.provider,
        full_name=name,
        phone="+91 90000 00002",
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    profile = Profile(
        user_id=user.id,
        company_name=name,
        head_office=head_office,
        country=country,
        verification_status=(
            VerificationStatus.verified if verified else VerificationStatus.pending
        ),
        contacts=[{"name": "Private Contact", "email": "private@vendor.test", "phone": "+91 99999 99999"}],
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    if category:
        from app.models.vendor_category import VendorType
        from app.services.vendor_taxonomy_service import VendorTaxonomyService

        cat, chosen = VendorTaxonomyService.validate_selection(
            db, VendorType(user.role.value), category, list(subs)
        )
        VendorTaxonomyService.set_company_selection(db, profile, VendorType(user.role.value), cat, chosen)
        db.commit()
    return user, profile


def _live_service(db, user, name, category="Hull & Underwater", days=20):
    row = Service(
        provider_id=user.id,
        name=name,
        service_id=name,
        category=category,
        port_id="Mumbai Port",
        status=ServiceListingStatus.approved,
        is_active=True,
        expires_at=datetime.utcnow() + timedelta(days=days),
    )
    db.add(row)
    db.commit()
    return row


def _grant_visibility(db, profile, days=30):
    now = datetime.utcnow()
    row = ProfileVisibility(
        profile_id=profile.id,
        owner_user_id=profile.user_id,
        plan=ProfileVisibilityPlan.monthly,
        period_days=30,
        base_amount_paise=100_000,
        gst_rate_percent=18,
        gst_amount_paise=18_000,
        total_amount_paise=118_000,
        utr=f"UTR{uuid.uuid4().hex[:10].upper()}",
        payment_date=now,
        receipt_path="/private/receipts/company.pdf",
        receipt_filename="company.pdf",
        status=ProfileVisibilityStatus.VERIFIED,
        starts_at=now,
        expires_at=now + timedelta(days=days),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _discover(api, headers, **params):
    response = api.get("/marketplace/companies", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_company_with_many_listings_appears_exactly_once(api):
    db = TestingSessionLocal()
    _seed_category(db, "Discovery Capability", "Discovery Group")
    buyer = _buyer(db)
    vendor, profile = _vendor(db, "Multi Service Marine", "Discovery Group", ["Discovery Capability"])
    for name in ("Hull Survey A", "Hull Survey B", "Hull Survey C"):
        _live_service(db, vendor, name)
    _grant_visibility(db, profile)

    body = _discover(api, _token(buyer), vendor_type="provider", category="Discovery Group")
    matching = [c for c in body["data"] if c["company_name"] == "Multi Service Marine"]
    assert len(matching) == 1
    assert matching[0]["live_capability_count"] == 3
    assert body["total"] == 1
    db.close()


def test_capability_filter_matches_declared_and_live_capabilities(api):
    db = TestingSessionLocal()
    _seed_category(db, "Live Capability", "Live Capability Group")
    buyer = _buyer(db)
    vendor, profile = _vendor(db, "Diver Co", "Live Capability Group", ["Live Capability"])
    # The company DECLARES one capability but only LISTS propeller work.
    _live_service(db, vendor, "Propeller Polishing")
    _grant_visibility(db, profile)

    headers = _token(buyer)
    by_live = _discover(
        api, headers,
        vendor_type="provider",
        category="Live Capability Group",
        subcategory="Propeller Polishing",
    )
    assert "Diver Co" in {c["company_name"] for c in by_live["data"]}

    missing = _discover(
        api, headers,
        vendor_type="provider",
        category="Live Capability Group",
        subcategory="Hydraulic Repairs",
    )
    assert "Diver Co" not in {c["company_name"] for c in missing["data"]}
    db.close()


def test_filters_compose_and_pagination_is_stable(api):
    db = TestingSessionLocal()
    _seed_category(db, "Filter Capability", "Filter Group")
    buyer = _buyer(db)
    _vendor(
        db, "Alpha Diving", "Filter Group", ["Filter Capability"],
        head_office="JNPT", country="India",
    )[1]
    alpha_profile = db.query(Profile).filter(Profile.company_name == "Alpha Diving").first()
    _vendor(
        db, "Beta Diving", "Filter Group", ["Filter Capability"],
        head_office="Mumbai Port", country="India",
    )
    beta_profile = db.query(Profile).filter(Profile.company_name == "Beta Diving").first()
    _grant_visibility(db, alpha_profile)
    _grant_visibility(db, beta_profile)

    headers = _token(buyer)
    combined = _discover(
        api, headers,
        vendor_type="provider",
        category="Filter Group",
        port="JNPT",
        country="India",
        search="alpha",
    )
    assert {c["company_name"] for c in combined["data"]} == {"Alpha Diving"}

    by_port = _discover(api, headers, vendor_type="provider", category="Filter Group", port="Mumbai Port")
    assert {c["company_name"] for c in by_port["data"]} == {"Beta Diving"}

    first = _discover(api, headers, vendor_type="provider", category="Filter Group", page=1, limit=1)
    second = _discover(api, headers, vendor_type="provider", category="Filter Group", page=2, limit=1)
    assert first["total"] == 2 and first["pages"] == 2
    assert len(first["data"]) == len(second["data"]) == 1
    assert first["data"][0]["profile_id"] != second["data"][0]["profile_id"]

    empty = _discover(api, headers, vendor_type="provider", category="Filter Group", search="no-such-company")
    assert empty["data"] == []
    assert empty["total"] == 0
    db.close()


def test_eligibility_requires_approval_and_active_paid_window(api):
    db = TestingSessionLocal()
    _seed_category(db, "Eligibility Capability", "Eligibility Group")
    buyer = _buyer(db)

    _vendor(db, "Unpaid Marine", "Eligibility Group", ["Eligibility Capability"])
    _, pending_profile = _vendor(
        db, "Pending Marine", "Eligibility Group", ["Eligibility Capability"], verified=False
    )
    _grant_visibility(db, pending_profile)
    _, paid_profile = _vendor(db, "Paid Marine", "Eligibility Group", ["Eligibility Capability"])
    payment = _grant_visibility(db, paid_profile)

    headers = _token(buyer)
    names = {c["company_name"] for c in _discover(
        api, headers, vendor_type="provider", category="Eligibility Group"
    )["data"]}
    assert names == {"Paid Marine"}

    # Expiry removes the company from discovery immediately.
    payment.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()
    after = _discover(api, headers, vendor_type="provider", category="Eligibility Group")
    assert after["data"] == []
    assert after["total"] == 0
    db.close()


def test_public_payload_exposes_no_private_data(api):
    db = TestingSessionLocal()
    _seed_category(db, "Privacy Capability", "Privacy Group")
    buyer = _buyer(db)
    _, profile = _vendor(db, "Private Data Marine", "Privacy Group", ["Privacy Capability"])
    _grant_visibility(db, profile)

    headers = _token(buyer)
    cards = _discover(api, headers, vendor_type="provider", category="Privacy Group")
    detail = api.get(f"/marketplace/companies/{profile.id}", headers=headers)
    assert detail.status_code == 200

    card_text = str(cards).lower()
    detail_text = detail.text.lower()
    for forbidden in ("password", "receipt", "utr", "private@vendor.test", "reset_code", "access_token"):
        assert forbidden not in card_text
        assert forbidden not in detail_text

    # The approved public contact (the account phone) is still available.
    assert detail.json()["phone"] == "+91 90000 00002"
    assert "contacts" not in detail.json()
    assert "documents" not in detail.json()

    # An unpaid company is not inspectable, even with a profile id.
    _, hidden_profile = _vendor(db, "Hidden Marine", "Privacy Group", ["Privacy Capability"])
    assert api.get(
        f"/marketplace/companies/{hidden_profile.id}", headers=headers
    ).status_code == 404
    db.close()


def test_taxonomy_counts_cover_every_match(api):
    db = TestingSessionLocal()
    _seed_category(db, "Count Capability", "Count Group")
    buyer = _buyer(db)
    for name in ("Count One", "Count Two", "Count Three"):
        _, profile = _vendor(db, name, "Count Group", ["Count Capability"])
        _grant_visibility(db, profile)

    response = api.get(
        "/marketplace/vendor-categories",
        params={"vendor_type": "provider"},
        headers=_token(buyer),
    )
    assert response.status_code == 200, response.text
    category = next(c for c in response.json()["data"] if c["name"] == "Count Group")
    assert category["company_count"] == 3
    db.close()
