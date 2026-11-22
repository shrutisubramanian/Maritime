"""Marketplace cards say WHO is selling and WHAT it costs.

A card is one company's offering, not one service name shared by every provider
who happens to offer it — so the card can carry that company's own price, badge
and rating. The detail page behind it carries the description, the company's
business contact number and its reviews.

  * service card  -> price_paise / price_note + company_name + profile_id
  * supply card   -> price_paise / price_note + supplier_company_name
  * profile       -> phone (the ONE public business contact)
  * no price      -> null, and the UI shows "Price on request"; never invented
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service, ServiceListingStatus
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.user import User, UserRole
from app.utils.password import hash_password
from entitlement_helpers import grant_marketplace_access

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_marketplace_cards.db"
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


PASSWORD = "Password123!"


def _add_account(email: str, role: UserRole, company: str, phone: str | None = None):
    """Create an entitled account. Returns plain ids — a detached ORM instance
    cannot lazily load the fields the assertions need."""
    db = TestingSessionLocal()
    try:
        user = User(
            email=email,
            password_hash=hash_password(PASSWORD),
            role=role,
            full_name=company,
            is_verified=True,
            phone=phone,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        profile = Profile(
            user_id=user.id,
            company_name=company,
            position="Surveyor",
            verification_status=VerificationStatus.verified,
            badge_label="VERIFIED",
            rating_avg=4.2,
            jobs_completed=11,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return user.id, profile.id
    finally:
        db.close()


def _add_service(
    provider_id, name, price_paise=None, price_note=None, port="mumbai",
    expires_in_days=60,
):
    """An approved listing with a PAID placement window (that is what "approved"
    means in the marketplace now: content approved AND ₹1,000 fee verified)."""
    db = TestingSessionLocal()
    now = datetime.utcnow()
    try:
        db.add(
            Service(
                provider_id=provider_id,
                name=name,
                service_id=name.lower().replace(" ", "_"),
                port_id=port,
                category="Inspection",
                description=f"{name} carried out properly.",
                price_paise=price_paise,
                price_note=price_note,
                is_active=True,
                status=ServiceListingStatus.approved,
                published_at=now,
                expires_at=now + timedelta(days=expires_in_days),
            )
        )
        db.commit()
    finally:
        db.close()


@pytest.fixture(scope="module")
def entitled_client():
    """A signed-in, verified, subscribed client — the marketplace gate's job."""
    email = "card_buyer@example.com"
    _add_account(email, UserRole.client, "Card Buyer Co")
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one()
        grant_marketplace_access(db, user)
    finally:
        db.close()
    resp = TestClient(app).post(
        "/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return TestClient(app), {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture(scope="module")
def two_providers():
    """Two verified companies offering the SAME service at different prices."""
    alpha_user_id, _alpha_profile_id = _add_account(
        "alpha@example.com", UserRole.provider, "Alpha Surveys", phone="+91 90000 00001"
    )
    beta_user_id, _beta_profile_id = _add_account(
        "beta@example.com", UserRole.provider, "Beta Marine", phone="+91 90000 00002"
    )
    _add_service(alpha_user_id, "Hull Survey", price_paise=50_000, price_note="per survey")
    _add_service(beta_user_id, "Hull Survey", price_paise=80_000, price_note="per survey")
    _add_service(beta_user_id, "Cargo Survey")          # published no price at all


def _cards(client, headers):
    resp = client.get("/marketplace/services", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


# ------------------------------------------------------------------ one company
def test_a_service_card_carries_the_company_and_its_own_price(entitled_client, two_providers):
    client, headers = entitled_client
    cards = _cards(client, headers)
    hull = [c for c in cards if c["service_name"] == "Hull Survey"]

    # ONE CARD PER COMPANY, not one shared card for the service name.
    assert {c["company_name"] for c in hull} == {"Alpha Surveys", "Beta Marine"}
    by_company = {c["company_name"]: c for c in hull}

    assert by_company["Alpha Surveys"]["price_paise"] == 50_000
    assert by_company["Alpha Surveys"]["price_note"] == "per survey"
    assert by_company["Beta Marine"]["price_paise"] == 80_000


def test_a_card_links_to_the_company_profile_it_shows(entitled_client, two_providers):
    """The profile_id on the card must open a profile that really is that company."""
    client, headers = entitled_client
    alpha_card = next(c for c in _cards(client, headers) if c["company_name"] == "Alpha Surveys")

    opened = client.get(f"/profiles/{alpha_card['profile_id']}/public")
    assert opened.status_code == 200, opened.text
    body = opened.json()
    assert body["company_name"] == "Alpha Surveys"
    # The detail view it lands on carries that company's own services with
    # their descriptions.
    assert [s["name"] for s in body["services"]] == ["Hull Survey"]


def test_cards_are_ordered_cheapest_first(entitled_client, two_providers):
    client, headers = entitled_client
    prices = [c["price_paise"] for c in _cards(client, headers) if c["price_paise"]]
    assert prices == sorted(prices)


def test_searching_a_company_name_finds_its_offering(entitled_client, two_providers):
    client, headers = entitled_client
    resp = client.get("/marketplace/services", params={"search": "alpha"}, headers=headers)
    assert resp.status_code == 200, resp.text
    names = {c["company_name"] for c in resp.json()["data"]}
    assert "Alpha Surveys" in names


# ------------------------------------------------------------------- no price
def test_a_listing_without_a_price_says_so_rather_than_inventing_one(entitled_client, two_providers):
    client, headers = entitled_client
    cargo = next(c for c in _cards(client, headers) if c["service_name"] == "Cargo Survey")

    assert cargo["price_paise"] is None
    assert cargo["price_note"] is None
    # The company is still named, so an unpriced card is not anonymous either.
    assert cargo["company_name"] == "Beta Marine"


# ------------------------------------------------------------- supplies + phone
@pytest.fixture(scope="module")
def supplier_with_listing():
    user_id, _profile_id = _add_account(
        "chandler@example.com", UserRole.supplier, "Demo Chandlers", phone="+91 90000 00003"
    )
    db = TestingSessionLocal()
    now = datetime.utcnow()
    try:
        db.add(
            SupplyListing(
                supplier_id=user_id,
                name="Mooring Rope 24mm",
                category="Deck Supplies",
                description="Polyester mooring rope, 24mm, sold per metre.",
                ports=["Mumbai"],
                price_paise=2_500,
                price_note="per metre",
                availability="in_stock",
                status=SupplyListingStatus.approved,
                published_at=now,
                expires_at=now + timedelta(days=60),
            )
        )
        db.commit()
    finally:
        db.close()
    return user_id


def test_a_supply_card_carries_its_price_and_the_selling_company(entitled_client, supplier_with_listing):
    client, headers = entitled_client
    listing = client.get("/supplies/", headers=headers).json()["data"][0]

    assert listing["price_paise"] == 2_500
    assert listing["price_note"] == "per metre"
    assert listing["supplier_company_name"] == "Demo Chandlers"


def test_the_supply_detail_carries_the_description_and_the_selling_company(entitled_client, supplier_with_listing):
    client, headers = entitled_client
    listing_id = client.get("/supplies/", headers=headers).json()["data"][0]["id"]

    detail = client.get(f"/supplies/{listing_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert "mooring rope" in body["description"].lower()
    assert body["supplier_company_name"] == "Demo Chandlers"


def test_the_public_profile_publishes_the_business_phone_and_not_the_contacts_list(
    entitled_client, supplier_with_listing
):
    client, _headers = entitled_client
    user_id = supplier_with_listing

    body = client.get(f"/profiles/by-user/{user_id}/public").json()

    assert body["phone"] == "+91 90000 00003"
    # The private contacts list stays private — only the single number is public.
    assert "contacts" not in body


def test_reviews_are_reachable_for_the_company_on_the_card(entitled_client, two_providers):
    """The detail page shows reviews; the endpoint it uses must answer."""
    client, headers = entitled_client
    alpha_card = next(c for c in _cards(client, headers) if c["company_name"] == "Alpha Surveys")

    resp = client.get(f"/reviews/provider/{alpha_card['provider_id']}")
    assert resp.status_code == 200, resp.text
    assert resp.json() == []          # none yet — an empty list, not an error
