"""
Service-provider marketplace regression suite.

Mirrors the supplier suite (test_supplier_marketplace.py) for the *service*
ecosystem: DB-backed Service listing lifecycle + ownership, provider-only
creation, duplicate (service+port) rejection, approved-only public visibility,
deterministic service matching, notification isolation, and a complete
HTTP end-to-end provider flow:

    provider catalogue -> moderation -> Service Marketplace
      -> client service request -> matching notification -> provider quote
      -> client sees the quotation

Also covers the public provider/supplier profile endpoint (safe fields only).

PAID PLACEMENT: a marketplace card needs BOTH halves — content moderation
approving the listing AND a verified ₹1,000 payment whose 60-day window is
running. These tests call `_grant_paid_window` to represent the verified
payment; the fee itself (submission, verification, expiry) is covered by
tests/test_listing_fees.py.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import jwt

from app.main import app
from app.database import Base, get_db
from app.config import settings
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service, ServiceListingStatus
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.notification import Notification
from app.models.request import RequestType
from app.schemas.request import ServiceRequestCreate
from app.schemas.service import ServiceCreate, ServiceUpdate
from app.schemas.supply_listing import SupplyListingCreate
from app.schemas.quote import QuoteCreate
from app.services.request_service import ServiceRequestService
from app.services.matching_service import MatchingService
from app.services.service_listing_service import ServiceListingService
from app.services.supply_listing_service import SupplyListingService
from app.services.quote_service import QuoteService
from fastapi import HTTPException

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_service_provider_marketplace.db"
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


def _token(user: User) -> dict:
    tok = jwt.encode({"sub": str(user.id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return {"Authorization": f"Bearer {tok}"}


from entitlement_helpers import grant_marketplace_access


def _grant_paid_window(db, listing, days: int = 60):
    """Stand in for a verified ₹1,000 fee: stamp the paid placement window.

    The fee lifecycle itself is exercised in tests/test_listing_fees.py; here
    the window is what the marketplace queries look at.
    """
    now = datetime.utcnow()
    listing.published_at = now
    listing.expires_at = now + timedelta(days=days)
    db.commit()
    db.refresh(listing)
    return listing


def _make_account(db, email, role, company=None, verified=True):
    email = f"{uuid.uuid4().hex[:8]}_{email}"
    # is_verified: the marketplace / requests / quotes / jobs gate requires a
    # verified email plus an admin-approved profile before it answers.
    user = User(email=email, password_hash="x", role=role, full_name=company or email, is_verified=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    profile = Profile(
        user_id=user.id,
        company_name=company or email,
        verification_status=VerificationStatus.verified if verified else VerificationStatus.pending,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return user, profile


# ------------------------------------------------------- Phase 1: listing model
class TestServiceListingLifecycle:
    def test_create_is_draft_and_not_public(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, "p1@h.com", UserRole.provider, "Provider One")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Hydraulic Repairs", category="Repairs & Maintenance",
            service_id="Hydraulic Repairs", port_id="Mumbai Port",
        ))
        assert listing.status == ServiceListingStatus.draft
        assert listing.is_active is False
        with pytest.raises(HTTPException) as exc:
            ServiceListingService.get_public(db, listing.id)
        assert exc.value.status_code == 404
        db.close()

    def test_submit_then_admin_approve_then_public(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, "p2@h.com", UserRole.provider, "Provider Two")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Electrical Repairs", category="Repairs & Maintenance",
            service_id="Electrical Repairs", port_id="Chennai Port",
        ))
        ServiceListingService.submit_for_review(db, listing.id, provider.id)
        assert listing.status == ServiceListingStatus.pending_review
        assert listing.is_active is False

        # provider cannot self-approve: status is not settable through update
        ServiceListingService.update_listing(db, listing.id, provider.id, ServiceUpdate(description="x"))
        assert listing.status == ServiceListingStatus.pending_review
        assert listing.is_active is False

        ServiceListingService.moderate_listing(db, listing.id, ServiceListingStatus.approved)
        assert listing.status == ServiceListingStatus.approved
        assert listing.is_active is True

        # Approval alone is not enough: without a verified placement fee the
        # approved listing stays off the marketplace.
        with pytest.raises(HTTPException) as exc:
            ServiceListingService.get_public(db, listing.id)
        assert exc.value.status_code == 404

        # Once the ₹1,000 placement is paid for, the approved listing is public.
        _grant_paid_window(db, listing)
        public = ServiceListingService.get_public(db, listing.id)
        assert public.status == ServiceListingStatus.approved
        assert public.expires_at > datetime.utcnow()
        db.close()

    def test_duplicate_service_port_rejected(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, "p3@h.com", UserRole.provider, "Provider Three")
        ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Hull Cleaning", category="Hull & Underwater",
            service_id="Underwater Hull Cleaning", port_id="Mumbai Port",
        ))
        with pytest.raises(HTTPException) as exc:
            ServiceListingService.create_listing(db, provider.id, ServiceCreate(
                name="Hull Cleaning", category="Hull & Underwater",
                service_id="Underwater Hull Cleaning", port_id="Mumbai Port",
            ))
        assert exc.value.status_code == 409
        assert "Duplicate listing" in exc.value.detail

        # same service, different port is allowed
        ok = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Hull Cleaning", category="Hull & Underwater",
            service_id="Underwater Hull Cleaning", port_id="Chennai Port",
        ))
        assert ok.status == ServiceListingStatus.draft
        db.close()

    def test_provider_cannot_edit_another_providers_listing(self):
        db = TestingSessionLocal()
        a, _ = _make_account(db, "pA@h.com", UserRole.provider, "Provider A")
        b, _ = _make_account(db, "pB@h.com", UserRole.provider, "Provider B")
        listing = ServiceListingService.create_listing(db, a.id, ServiceCreate(
            name="Propeller Polishing", category="Hull & Underwater",
        ))
        with pytest.raises(HTTPException) as exc:
            ServiceListingService.update_listing(db, listing.id, b.id, ServiceUpdate(name="Hacked"))
        assert exc.value.status_code == 403
        db.close()

    def test_non_provider_cannot_create_listing(self):
        db = TestingSessionLocal()
        supplier, _ = _make_account(db, "supX@h.com", UserRole.supplier, "Supplier X")
        with pytest.raises(HTTPException) as exc:
            ServiceListingService.create_listing(db, supplier.id, ServiceCreate(
                name="Nope", category="Repairs & Maintenance",
            ))
        assert exc.value.status_code == 403
        db.close()

    def test_public_search_only_returns_approved(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, "p4@h.com", UserRole.provider, "Provider Four")
        draft = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Draft Survey", category="Inspection & Survey",
        ))
        approved = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Approved Survey", category="Inspection & Survey",
        ))
        ServiceListingService.moderate_listing(db, approved.id, ServiceListingStatus.approved)

        # Approved but unpaid: not public yet.
        ids = {s.id for s in ServiceListingService.search_public(db, search="Survey")[0]}
        assert approved.id not in ids

        _grant_paid_window(db, approved)
        results, total, *_ = ServiceListingService.search_public(db, search="Survey")
        ids = {s.id for s in results}
        assert approved.id in ids and draft.id not in ids
        db.close()


# ------------------------------------------------------------- Phase 2: matching
class TestServiceMatching:
    def _seed(self, db):
        client, _ = _make_account(db, "mclient@h.com", UserRole.client, "ABC Shipping")

        prov, _ = _make_account(db, "mprov@h.com", UserRole.provider, "Provider A Marine")
        ServiceListingService.create_listing(db, prov.id, ServiceCreate(
            name="Hydraulic Repairs", category="Repairs & Maintenance",
            service_id="Hydraulic Repairs", port_id="Mumbai Port", submit_now=True,
        ))
        lst = ServiceListingService.get_mine(db, prov.id)[0]
        ServiceListingService.moderate_listing(db, lst.id, ServiceListingStatus.approved)

        prov_bad, _ = _make_account(db, "mprov2@h.com", UserRole.provider, "Provider B Marine")
        ServiceListingService.create_listing(db, prov_bad.id, ServiceCreate(
            name="Hydraulic Repairs", category="Repairs & Maintenance",
            service_id="Hydraulic Repairs", port_id="Chennai Port", submit_now=True,
        ))
        lst_bad = ServiceListingService.get_mine(db, prov_bad.id)[0]
        ServiceListingService.moderate_listing(db, lst_bad.id, ServiceListingStatus.approved)

        sup, _ = _make_account(db, "msup@h.com", UserRole.supplier, "Oceanic Supplies")
        SupplyListingService.create_listing(db, sup.id, SupplyListingCreate(
            name="Generator Spare Parts", category="Generator Parts", ports=["Mumbai Port"],
        ))
        sup_listing = SupplyListingService.get_mine(db, sup.id)[0]
        SupplyListingService.moderate_listing(db, sup_listing.id, SupplyListingStatus.approved)

        return client, prov, prov_bad, sup

    def test_service_request_matches_only_relevant_provider(self):
        db = TestingSessionLocal()
        client, prov, prov_bad, sup = self._seed(db)
        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Emergency hydraulic repair", service_type="Hydraulic Repairs",
            port="Mumbai Port", description="urgent", request_type="service",
        ))
        recipients = set(MatchingService.get_eligible_recipients(db, req))
        assert prov.id in recipients
        assert prov_bad.id not in recipients, "wrong-port provider must not match"
        assert sup.id not in recipients, "suppliers must not be matched to service requests"
        db.close()

    def test_draft_provider_service_is_not_matchable(self):
        db = TestingSessionLocal()
        client, _ = _make_account(db, "dclient@h.com", UserRole.client, "Draft Shipping")
        prov, _ = _make_account(db, "dprov@h.com", UserRole.provider, "Draft Provider")
        # draft (never approved) -> is_active False -> not matchable
        ServiceListingService.create_listing(db, prov.id, ServiceCreate(
            name="Lifeboat Servicing", category="Marine Safety & Appliances",
            service_id="Lifeboat Servicing", port_id="Kochi Port",
        ))
        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Lifeboat servicing", service_type="Lifeboat Servicing",
            port="Kochi Port", description="x", request_type="service",
        ))
        assert prov.id not in set(MatchingService.get_eligible_recipients(db, req))
        db.close()


# ---------------------------------------------------------- Phase 3: notifications
class TestServiceNotificationIsolation:
    def test_fan_out_and_isolation(self):
        db = TestingSessionLocal()
        client, _ = _make_account(db, "nclient@h.com", UserRole.client, "Nordic Shipping")
        prov, _ = _make_account(db, "nprov@h.com", UserRole.provider, "Notified Provider")
        ServiceListingService.create_listing(db, prov.id, ServiceCreate(
            name="Fire Safety Inspection", category="Marine Safety & Appliances",
            service_id="Fire Safety Inspection", port_id="Kochi Port", submit_now=True,
        ))
        lst = ServiceListingService.get_mine(db, prov.id)[0]
        ServiceListingService.moderate_listing(db, lst.id, ServiceListingStatus.approved)

        supplier, _ = _make_account(db, "nsup@h.com", UserRole.supplier, "Unrelated Supplier")

        ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Fire safety inspection needed", service_type="Fire Safety Inspection",
            port="Kochi Port", description="annual", request_type="service",
        ))

        prov_notifs = db.query(Notification).filter(Notification.user_id == prov.id).all()
        assert len(prov_notifs) == 1
        assert prov_notifs[0].title == "New Procurement Request"
        assert "Fire Safety Inspection" in prov_notifs[0].message

        sup_notifs = db.query(Notification).filter(Notification.user_id == supplier.id).all()
        assert sup_notifs == [], "suppliers must not receive service-request notifications"
        db.close()


# -------------------------------------------------------- Phase 4: API-level checks
class TestServicesApi:
    def test_mine_requires_provider_role(self):
        db = TestingSessionLocal()
        client_user, _ = _make_account(db, "apicli@h.com", UserRole.client, "API Client")
        headers = _token(client_user)
        db.close()
        api = TestClient(app)
        assert api.get("/services/mine", headers=headers).status_code == 403

    def test_public_browse_returns_paginated_shape(self):
        api = TestClient(app)
        resp = api.get("/services/")
        assert resp.status_code == 200
        body = resp.json()
        assert {"data", "total", "page", "pages"} <= set(body.keys())

    def test_marketplace_aggregate_shapes(self):
        api = TestClient(app)
        db = TestingSessionLocal()
        viewer, _ = _make_account(db, "viewer@h.com", UserRole.client, "Viewer Co")
        grant_marketplace_access(db, viewer)
        headers = _token(viewer)
        db.close()
        groups = api.get("/marketplace/category-groups", headers=headers)
        assert groups.status_code == 200
        assert "data" in groups.json()
        services = api.get("/marketplace/services", headers=headers)
        assert services.status_code == 200
        assert {"data", "total", "page", "pages"} <= set(services.json().keys())

    def test_public_profile_excludes_pii_and_unapproved_services(self):
        db = TestingSessionLocal()
        provider, profile = _make_account(db, "pubprof@h.com", UserRole.provider, "Public Provider Co")
        profile.contacts = [{"label": "Email", "value": "secret@example.com"}]
        profile.licenses = ["INTERNAL-LICENSE-123"]
        db.commit()

        approved = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Public Survey", category="Inspection & Survey",
        ))
        ServiceListingService.moderate_listing(db, approved.id, ServiceListingStatus.approved)
        _grant_paid_window(db, approved)
        ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Secret Draft Service", category="Inspection & Survey",
        ))
        profile_id = profile.id
        user_id = provider.id
        db.close()

        api = TestClient(app)
        resp = api.get(f"/profiles/by-user/{user_id}/public")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # private fields must never be exposed
        # `social_links` is public by design (the profile page shows the
        # company's LinkedIn/Instagram/Facebook); the rest stays private.
        for leaked in ("contacts", "licenses", "offices", "team", "profile_metadata"):
            assert leaked not in body
        names = {s["name"] for s in body["services"]}
        assert "Public Survey" in names
        assert "Secret Draft Service" not in names
        # and the by-profile-id variant agrees
        assert api.get(f"/profiles/{profile_id}/public").status_code == 200


# ------------------------------------------------------------- HTTP end-to-end
class TestEndToEndServiceProviderFlow:
    def test_provider_to_quote_end_to_end(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, "e2e_prov@h.com", UserRole.provider, "E2E Marine Services")
        client_user, _ = _make_account(db, "e2e_cli@h.com", UserRole.client, "E2E Shipping")
        admin, _ = _make_account(db, "e2e_admin@h.com", UserRole.admin, "E2E Admin")
        # Vendors hold NO usage passes and need no platform subscription: their
        # money buys listing showcase time, verified in the listing-fee queue.
        prov_headers = _token(provider)
        cli_headers = _token(client_user)
        adm_headers = _token(admin)
        db.close()

        # The client needs an entitled session to read the marketplace.
        db = TestingSessionLocal()
        try:
            granted = db.query(User).filter(User.id == client_user.id).one()
            grant_marketplace_access(db, granted)
        finally:
            db.close()

        api = TestClient(app)

        # 1. Provider creates a draft service listing
        created = api.post("/services/", headers=prov_headers, json={
            "name": "Propeller & Shaft Alignment",
            "category": "Repairs & Maintenance",
            "service_id": "Propeller & Shaft Alignment",
            "port_id": "Mumbai Port",
        })
        assert created.status_code == 201, created.text
        listing_id = created.json()["id"]
        assert created.json()["status"] == "draft"

        # 2. Not visible in the public Service Marketplace while draft
        public_before = api.get("/services/").json()["data"]
        assert all(s["id"] != listing_id for s in public_before)

        # 3. Provider submits; admin approves
        assert api.post(f"/services/{listing_id}/submit", headers=prov_headers).status_code == 200
        moderated = api.post(f"/services/{listing_id}/moderate", headers=adm_headers,
                             json={"status": "approved"})
        assert moderated.status_code == 200, moderated.text

        # 4. Moderation approved it, but it is still unpaid — not on the
        #    marketplace until the ₹1,000 placement window is granted.
        assert all(s["id"] != listing_id for s in api.get("/services/").json()["data"])
        db = TestingSessionLocal()
        try:
            _grant_paid_window(db, db.query(Service).filter(Service.id == uuid.UUID(listing_id)).one())
        finally:
            db.close()

        # 5. Visible in the marketplace + aggregate endpoints
        public_after = api.get("/services/").json()["data"]
        assert any(s["id"] == listing_id for s in public_after)

        marketplace = api.get("/marketplace/services", headers=cli_headers,
                              params={"search": "Propeller"}).json()["data"]
        assert any(m["service_name"] == "Propeller & Shaft Alignment" for m in marketplace)

        detail = api.get("/marketplace/services/aggregate/Propeller & Shaft Alignment",
                         headers=cli_headers)
        assert detail.status_code == 200
        assert detail.json()["exists"] is True
        assert detail.json()["verified_provider_count"] >= 1

        avail = api.get(
            "/marketplace/services/aggregate/Propeller & Shaft Alignment/availability",
            headers=cli_headers,
            params={"port": "Mumbai Port"},
        )
        assert avail.status_code == 200
        assert avail.json()["available"] is True

        # 5. Client creates a matching service request
        req = api.post("/requests/", headers=cli_headers, json={
            "title": "Propeller alignment at Mumbai",
            "service_type": "Propeller & Shaft Alignment",
            "port": "Mumbai Port",
            "description": "urgent",
            "request_type": "service",
        })
        assert req.status_code == 201, req.text
        assert req.json()["request_type"] == "service"
        request_id = req.json()["id"]

        # 6. Provider receives the matching notification
        notes = api.get("/notifications/me", headers=prov_headers).json()
        assert any(n["title"] == "New Procurement Request" for n in notes)

        # 7. Provider quotes the service request
        quote = api.post(f"/quotes/?request_id={request_id}", headers=prov_headers, json={
            "amount": 7200.0, "currency": "USD",
        })
        assert quote.status_code == 201, quote.text

        # 8. Client sees the quotation on their own request
        quotes = api.get(f"/client/requests/{request_id}/quotations", headers=cli_headers)
        assert quotes.status_code == 200, quotes.text
        assert len(quotes.json()) == 1
