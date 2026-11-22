"""A client who opens a provider or supplier profile must see everything that
account offers — not just the one service or supply they arrived from.

Two public endpoints back the profile pages:

  GET /profiles/{profile_id}/public          -> provider card (services)
  GET /profiles/by-user/{user_id}/public     -> supplier card (listings)

These tests pin the offering lists against a seeded account that has several
approved offerings plus one unapproved, and against the id contract the
marketplace uses to link to those pages (the availability list hands the UI a
*profile* id; the supplies marketplace hands it a *user* id).
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

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_public_profile_offerings.db"
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


def _add_account(email: str, role: UserRole, company: str) -> tuple[uuid.UUID, uuid.UUID]:
    """Create an entitled account. Returns (user_id, profile_id)."""
    db = TestingSessionLocal()
    try:
        user = User(
            email=email,
            password_hash=hash_password("Password123!"),
            role=role,
            full_name=company,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        profile = Profile(
            user_id=user.id,
            company_name=company,
            position="Surveyor" if role == UserRole.provider else "Supplier",
            verification_status=VerificationStatus.verified,
            badge_label="VERIFIED",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        grant_marketplace_access(db, user)
        return user.id, profile.id
    finally:
        db.close()


def _add_service(provider_id: uuid.UUID, name: str, approved: bool) -> None:
    """`approved=True` models a list that is ALSO paid for: an approved listing
    with no paid 60-day window is not shown anywhere publicly."""
    db = TestingSessionLocal()
    now = datetime.utcnow()
    try:
        db.add(
            Service(
                provider_id=provider_id,
                name=name,
                service_id=name.lower().replace(" ", "_"),
                port_id="mumbai",
                category="Inspection",
                subcategory=name.split()[0],
                description=f"{name} description",
                is_active=approved,
                status=(
                    ServiceListingStatus.approved if approved
                    else ServiceListingStatus.pending_review
                ),
                published_at=now if approved else None,
                expires_at=now + timedelta(days=60) if approved else None,
            )
        )
        db.commit()
    finally:
        db.close()


def _add_listing(
    supplier_id: uuid.UUID,
    name: str,
    approved: bool,
    price_paise: int | None = None,
    price_note: str | None = None,
) -> None:
    db = TestingSessionLocal()
    now = datetime.utcnow()
    try:
        db.add(
            SupplyListing(
                supplier_id=supplier_id,
                name=name,
                category="Deck Supplies",
                subcategory="Consumables",
                description=f"{name} description",
                price_paise=price_paise,
                price_note=price_note,
                ports=["Mumbai", "Chennai"],
                availability="in_stock",
                status=(
                    SupplyListingStatus.approved if approved
                    else SupplyListingStatus.pending_review
                ),
                published_at=now if approved else None,
                expires_at=now + timedelta(days=60) if approved else None,
            )
        )
        db.commit()
    finally:
        db.close()


@pytest.fixture(scope="module")
def provider() -> tuple[uuid.UUID, uuid.UUID]:
    user_id, profile_id = _add_account(
        "offerings_provider@example.com", UserRole.provider, "Offerings Marine Services"
    )
    for name in ("Hull Survey", "Engine Inspection", "Cargo Survey"):
        _add_service(user_id, name, approved=True)
    _add_service(user_id, "Draft Only Service", approved=False)
    return user_id, profile_id


@pytest.fixture(scope="module")
def supplier() -> tuple[uuid.UUID, uuid.UUID]:
    user_id, profile_id = _add_account(
        "offerings_supplier@example.com", UserRole.supplier, "Offerings Chandlers"
    )
    for name in ("Mooring Rope 24mm", "Life Raft", "Galley Stores"):
        _add_listing(user_id, name, approved=True)
    _add_listing(user_id, "Priced Rope 12mm", approved=True, price_paise=125000, price_note="per metre")
    _add_listing(user_id, "Unapproved Listing", approved=False)
    return user_id, profile_id


@pytest.fixture(scope="module")
def client_token(provider) -> str:
    client_ = TestClient(app)
    email = "offerings_client@example.com"
    db = TestingSessionLocal()
    try:
        user = User(
            email=email,
            password_hash=hash_password("Password123!"),
            role=UserRole.client,
            full_name="Offerings Client",
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        db.add(
            Profile(
                user_id=user.id,
                company_name="Offerings Client Co",
                verification_status=VerificationStatus.verified,
            )
        )
        db.commit()
        grant_marketplace_access(db, user)
    finally:
        db.close()
    resp = client_.post("/auth/login", json={"email": email, "password": "Password123!"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def test_provider_public_profile_lists_every_approved_service(provider, client_token):
    _user_id, profile_id = provider

    resp = TestClient(app).get(
        f"/profiles/{profile_id}/public",
        headers={"Authorization": f"Bearer {client_token}"},
    )

    assert resp.status_code == 200, resp.text
    names = sorted(s["name"] for s in resp.json()["services"])
    assert names == ["Cargo Survey", "Engine Inspection", "Hull Survey"]


def test_provider_public_profile_hides_unapproved_service(provider, client_token):
    _user_id, profile_id = provider

    body = TestClient(app).get(
        f"/profiles/{profile_id}/public",
        headers={"Authorization": f"Bearer {client_token}"},
    ).json()

    assert "Draft Only Service" not in [s["name"] for s in body["services"]]


def test_service_availability_ids_open_the_provider_profile(provider, client_token):
    """The availability list must link by profile id, which is what /profiles/{id}/public takes."""
    _user_id, profile_id = provider
    headers = {"Authorization": f"Bearer {client_token}"}

    availability = TestClient(app).get(
        "/marketplace/services/aggregate/Hull Survey/availability",
        params={"port": "mumbai"},
        headers=headers,
    )
    assert availability.status_code == 200, availability.text
    listed = availability.json()["providers"]
    assert [p["id"] for p in listed] == [str(profile_id)]

    opened = TestClient(app).get(f"/profiles/{listed[0]['id']}/public", headers=headers)
    assert opened.status_code == 200, opened.text
    assert [s["name"] for s in opened.json()["services"]] == [
        "Hull Survey", "Engine Inspection", "Cargo Survey",
    ] or sorted(s["name"] for s in opened.json()["services"]) == [
        "Cargo Survey", "Engine Inspection", "Hull Survey",
    ]


def test_provider_profile_opens_by_user_id_too(provider, client_token):
    """Quotations/orders only carry a user id, so that id must resolve to the
    same profile with the same full service list."""
    user_id, profile_id = provider
    headers = {"Authorization": f"Bearer {client_token}"}

    by_user = TestClient(app).get(f"/profiles/by-user/{user_id}/public", headers=headers)
    by_profile = TestClient(app).get(f"/profiles/{profile_id}/public", headers=headers)

    assert by_user.status_code == 200, by_user.text
    assert by_user.json()["id"] == str(profile_id)
    assert by_user.json()["services"] == by_profile.json()["services"]
    assert len(by_user.json()["services"]) == 3


def test_supplier_public_profile_lists_every_approved_listing(supplier, client_token):
    user_id, _profile_id = supplier

    resp = TestClient(app).get(
        f"/profiles/by-user/{user_id}/public",
        headers={"Authorization": f"Bearer {client_token}"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    names = sorted(l["name"] for l in body["listings"])
    assert names == [
        "Galley Stores", "Life Raft", "Mooring Rope 24mm", "Priced Rope 12mm"
    ]
    assert body["role"] == "supplier"
    # The catalogue carries each listing's published price, in integer paise,
    # and an unpriced listing reports None instead of an invented figure.
    by_name = {l["name"]: l for l in body["listings"]}
    assert by_name["Priced Rope 12mm"]["price_paise"] == 125000
    assert by_name["Priced Rope 12mm"]["price_note"] == "per metre"
    assert by_name["Life Raft"]["price_paise"] is None
    # A supplier's supplies never leak into the provider `services` list.
    assert body["services"] == []
