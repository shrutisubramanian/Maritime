"""
Supplier + Supplies Marketplace + Procurement regression suite.

Covers the two-ecosystem model:
  - SERVICE requests  -> service providers
  - SUPPLY requests   -> suppliers

Verifies request typing, the supply listing lifecycle + ownership, deterministic
matching, notification fan-out/isolation, and type-aware quote authorization.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import jwt
from pydantic import ValidationError

from app.main import app
from app.database import Base, get_db
from app.config import settings
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.notification import Notification
from app.models.request import RequestType
from app.schemas.request import ServiceRequestCreate
from app.schemas.supply_listing import SupplyListingCreate, SupplyListingUpdate
from app.schemas.quote import QuoteCreate
from entitlement_helpers import grant_subscription
from app.services.request_service import ServiceRequestService
from app.services.matching_service import MatchingService
from app.services.supply_listing_service import SupplyListingService
from app.services.quote_service import QuoteService
from fastapi import HTTPException

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_supplier_marketplace.db"
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
    # The app is a single global; other test modules also override get_db at
    # import time. Pin (and restore) this module's DB around each test so
    # results do not depend on collection order.
    prev = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    if prev is not None:
        app.dependency_overrides[get_db] = prev


def _token(user: User) -> dict:
    tok = jwt.encode({"sub": str(user.id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return {"Authorization": f"Bearer {tok}"}


def _make_account(db, email, role, company=None, verified=True):
    # Keep emails unique across the module-scoped DB regardless of caller reuse.
    email = f"{uuid.uuid4().hex[:8]}_{email}"
    # is_verified: the marketplace / requests / quotes / jobs gate requires a
    # verified email plus an admin-approved profile before it answers.
    user = User(email=email, password_hash="x", role=role, full_name=company or email, is_verified=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(Profile(
        user_id=user.id,
        company_name=company or email,
        verification_status=VerificationStatus.verified if verified else VerificationStatus.pending,
    ))
    db.commit()
    if role == UserRole.client:
        # A client's platform fee is part of the onboarding gate.
        grant_subscription(db, user)
    return user


# ---------------------------------------------------------------- Phase 1: typing
class TestRequestTyping:
    def test_supply_request_persists_type_and_quantity(self):
        db = TestingSessionLocal()
        client = _make_account(db, "client1@h.com", UserRole.client, "Client One")
        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Need 50 marine fire extinguishers",
            service_type="Safety Equipment",
            port="Mumbai Port",
            description="SOLAS approved",
            request_type="supply",
            quantity=50,
        ))
        assert req.request_type == RequestType.supply
        assert req.quantity == 50
        db.close()

    def test_service_request_defaults_to_service(self):
        db = TestingSessionLocal()
        client = _make_account(db, "client2@h.com", UserRole.client, "Client Two")
        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Underwater hull inspection",
            service_type="Hull & Underwater",
            port="Kochi Port",
            description="diving inspection",
        ))
        assert req.request_type == RequestType.service
        db.close()

    def test_invalid_request_type_rejected(self):
        with pytest.raises(ValidationError):
            ServiceRequestCreate(
                title="x", service_type="y", port="z", request_type="bogus"
            )


# ------------------------------------------------------- Phase 2: supply listings
class TestSupplyListingLifecycle:
    def test_create_is_draft_and_not_public(self):
        db = TestingSessionLocal()
        supplier = _make_account(db, "sup1@h.com", UserRole.supplier, "Oceanic Marine Supplies")
        listing = SupplyListingService.create_listing(db, supplier.id, SupplyListingCreate(
            name="45kVA Marine Generator", category="Generator Parts", ports=["Mumbai Port"],
        ))
        assert listing.status == SupplyListingStatus.draft
        with pytest.raises(HTTPException) as exc:
            SupplyListingService.get_public(db, listing.id)
        assert exc.value.status_code == 404
        db.close()

    def test_submit_then_admin_approve_then_public(self):
        db = TestingSessionLocal()
        supplier = _make_account(db, "sup2@h.com", UserRole.supplier, "ABC Marine Equipment")
        listing = SupplyListingService.create_listing(db, supplier.id, SupplyListingCreate(
            name="Hydraulic Pump", category="Hydraulic Equipment", ports=["Nhava Sheva Port"],
        ))
        SupplyListingService.submit_for_review(db, listing.id, supplier.id)
        assert listing.status == SupplyListingStatus.pending_review

        # supplier cannot self-approve: status is not settable via update
        SupplyListingService.update_listing(db, listing.id, supplier.id, SupplyListingUpdate(description="x"))
        assert listing.status == SupplyListingStatus.pending_review

        SupplyListingService.moderate_listing(db, listing.id, SupplyListingStatus.approved)
        # Approved content alone is NOT on the marketplace: the ₹1,000 placement
        # fee has not been verified, so buyers still cannot see it.
        with pytest.raises(HTTPException) as unpaid:
            SupplyListingService.get_public(db, listing.id)
        assert unpaid.value.status_code == 404
        assert listing.expires_at is None

        # A verified placement opens a 60-day window and the listing goes live.
        now = datetime.utcnow()
        listing.published_at = now
        listing.expires_at = now + timedelta(days=60)
        db.commit()
        assert SupplyListingService.get_public(db, listing.id).status == SupplyListingStatus.approved
        assert listing.is_live is True
        db.close()

    def test_supplier_cannot_edit_another_suppliers_listing(self):
        db = TestingSessionLocal()
        a = _make_account(db, "supA@h.com", UserRole.supplier, "Supplier A")
        b = _make_account(db, "supB@h.com", UserRole.supplier, "Supplier B")
        listing = SupplyListingService.create_listing(db, a.id, SupplyListingCreate(
            name="Deck Rope", category="Deck Stores",
        ))
        with pytest.raises(HTTPException) as exc:
            SupplyListingService.update_listing(db, listing.id, b.id, SupplyListingUpdate(name="Hacked"))
        assert exc.value.status_code == 403
        db.close()

    def test_non_supplier_cannot_create_listing(self):
        db = TestingSessionLocal()
        provider = _make_account(db, "provX@h.com", UserRole.provider, "Provider X")
        with pytest.raises(HTTPException) as exc:
            SupplyListingService.create_listing(db, provider.id, SupplyListingCreate(
                name="Nope", category="Deck Stores",
            ))
        assert exc.value.status_code == 403
        db.close()

    def test_public_search_only_returns_approved(self):
        db = TestingSessionLocal()
        supplier = _make_account(db, "sup3@h.com", UserRole.supplier, "Searchable Supplies")
        draft = SupplyListingService.create_listing(db, supplier.id, SupplyListingCreate(
            name="Draft Widget", category="Engine Stores",
        ))
        approved = SupplyListingService.create_listing(db, supplier.id, SupplyListingCreate(
            name="Approved Widget", category="Engine Stores",
        ))
        SupplyListingService.moderate_listing(db, approved.id, SupplyListingStatus.approved)
        now = datetime.utcnow()
        approved.published_at = now
        approved.expires_at = now + timedelta(days=60)
        db.commit()

        results, total, *_ = SupplyListingService.search_public(db, search="Widget")
        ids = {l.id for l in results}
        assert approved.id in ids and draft.id not in ids

        # The paid window runs out -> the listing drops out of the marketplace
        # without being rejected or deleted.
        approved.expires_at = now - timedelta(days=1)
        db.commit()
        results, *_ = SupplyListingService.search_public(db, search="Widget")
        assert all(l.id != approved.id for l in results)
        db.close()


# ------------------------------------------------------------- Phase 3: matching
class TestMatching:
    def _seed(self, db):
        client = _make_account(db, "mclient@h.com", UserRole.client, "ABC Shipping")

        # Provider matching a service request at Mumbai
        prov = _make_account(db, "mprov@h.com", UserRole.provider, "Provider A Marine")
        db.add(Service(provider_id=prov.id, service_id="Hydraulic Repairs", port_id="Mumbai Port",
                       name="Hydraulic Repairs", category="Repairs & Maintenance", is_active=True))
        db.commit()

        # Could-be provider for the same service, wrong port
        prov_bad = _make_account(db, "mprov2@h.com", UserRole.provider, "Provider B Marine")
        db.add(Service(provider_id=prov_bad.id, service_id="Hydraulic Repairs", port_id="Chennai Port",
                       name="Hydraulic Repairs", category="Repairs & Maintenance", is_active=True))
        db.commit()

        # Supplier offering generator parts at Mumbai
        sup = _make_account(db, "msup@h.com", UserRole.supplier, "Oceanic Marine Supplies")
        SupplyListingService.create_listing(db, sup.id, SupplyListingCreate(
            name="Generator Spare Parts", category="Generator Parts", ports=["Mumbai Port"],
        ))
        sup_listing = SupplyListingService.get_mine(db, sup.id)[0]
        SupplyListingService.moderate_listing(db, sup_listing.id, SupplyListingStatus.approved)

        # Supplier offering unrelated provisions at Mumbai
        sup_bad = _make_account(db, "msup2@h.com", UserRole.supplier, "Provisions Co")
        SupplyListingService.create_listing(db, sup_bad.id, SupplyListingCreate(
            name="Fresh Vegetables", category="Provisions", ports=["Mumbai Port"],
        ))
        bad_listing = SupplyListingService.get_mine(db, sup_bad.id)[0]
        SupplyListingService.moderate_listing(db, bad_listing.id, SupplyListingStatus.approved)

        return client, prov, prov_bad, sup, sup_bad

    def test_supply_request_matches_only_relevant_supplier(self):
        db = TestingSessionLocal()
        client, prov, prov_bad, sup, sup_bad = self._seed(db)
        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Need marine generator spare parts at Mumbai",
            service_type="Generator Parts", port="Mumbai Port",
            description="spares", request_type="supply", quantity=4,
        ))
        recipients = set(MatchingService.get_eligible_recipients(db, req))
        assert sup.id in recipients
        assert sup_bad.id not in recipients
        assert prov.id not in recipients, "providers must not be matched to procurement requests"
        db.close()

    def test_service_request_matches_only_provider(self):
        db = TestingSessionLocal()
        client, prov, prov_bad, sup, sup_bad = self._seed(db)
        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Emergency hydraulic repair", service_type="Hydraulic Repairs",
            port="Mumbai Port", description="urgent", request_type="service",
        ))
        recipients = set(MatchingService.get_eligible_recipients(db, req))
        assert prov.id in recipients
        assert prov_bad.id not in recipients
        assert sup.id not in recipients, "suppliers must not be matched to service requests"
        db.close()


# ---------------------------------------------------------- Phase 4: notifications
class TestNotificationIsolation:
    def test_fan_out_and_isolation(self):
        db = TestingSessionLocal()
        client = _make_account(db, "nclient@h.com", UserRole.client, "Nordic Shipping")
        sup = _make_account(db, "nsup@h.com", UserRole.supplier, "Notified Supplies")
        SupplyListingService.create_listing(db, sup.id, SupplyListingCreate(
            name="Fire Extinguishers", category="Safety Equipment", ports=["Kochi Port"],
        ))
        lst = SupplyListingService.get_mine(db, sup.id)[0]
        SupplyListingService.moderate_listing(db, lst.id, SupplyListingStatus.approved)

        provider = _make_account(db, "nprov@h.com", UserRole.provider, "Unrelated Provider")

        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Need marine fire extinguishers", service_type="Safety Equipment",
            port="Kochi Port", description="SOLAS", request_type="supply",
        ))

        sup_notifs = db.query(Notification).filter(Notification.user_id == sup.id).all()
        assert len(sup_notifs) == 1
        assert sup_notifs[0].title == "New Procurement Request"
        assert "Safety Equipment" in sup_notifs[0].message
        assert "Kochi Port" in sup_notifs[0].message

        prov_notifs = db.query(Notification).filter(Notification.user_id == provider.id).all()
        assert prov_notifs == [], "unrelated provider must not receive a procurement notification"

        client_notifs = db.query(Notification).filter(Notification.user_id == client.id).all()
        assert any(n.title == "Request Created" for n in client_notifs)
        db.close()

    def test_no_duplicate_notifications(self):
        db = TestingSessionLocal()
        client = _make_account(db, "dclient@h.com", UserRole.client, "Dedupe Shipping")
        sup = _make_account(db, "dsup@h.com", UserRole.supplier, "Dedupe Supplies")
        SupplyListingService.create_listing(db, sup.id, SupplyListingCreate(
            name="Anchor Chain", category="Deck Stores", ports=["Mumbai Port"],
        ))
        lst = SupplyListingService.get_mine(db, sup.id)[0]
        SupplyListingService.moderate_listing(db, lst.id, SupplyListingStatus.approved)

        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Need anchor chain", service_type="Deck Stores", port="Mumbai Port",
            description="x", request_type="supply",
        ))
        # Simulate the fan-out running twice for the same notification identity.
        from app.services.notification_service import NotificationService
        from app.models.notification import NotificationType
        NotificationService.create_notification(
            db=db, user_id=sup.id, title="New Procurement Request", message="dup",
            notification_type=NotificationType.procurement, related_entity="service_request",
            related_entity_id=req.id, dedupe=True,
        )
        db.commit()
        count = db.query(Notification).filter(
            Notification.user_id == sup.id, Notification.related_entity_id == str(req.id)
        ).count()
        assert count == 1
        db.close()


# ----------------------------------------------------------- Phase 5: quoting auth
class TestTypeAwareQuoting:
    def _approved_supplier_with_supply(self, db, email="qsup@h.com", cat="Safety Equipment", port="Mumbai Port"):
        sup = _make_account(db, email, UserRole.supplier, "Quoting Supplies")
        SupplyListingService.create_listing(db, sup.id, SupplyListingCreate(
            name="Safety Kit", category=cat, ports=[port],
        ))
        lst = SupplyListingService.get_mine(db, sup.id)[0]
        SupplyListingService.moderate_listing(db, lst.id, SupplyListingStatus.approved)
        return sup

    def test_supplier_can_quote_supply_request(self):
        db = TestingSessionLocal()
        client = _make_account(db, "qc@h.com", UserRole.client, "Quote Client")
        sup = self._approved_supplier_with_supply(db)
        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Need safety kit", service_type="Safety Equipment", port="Mumbai Port",
            description="x", request_type="supply",
        ))
        quote = QuoteService.create_quote(db, sup.id, req.id, QuoteCreate(amount=100.0, currency="USD"))
        assert quote.provider_id == sup.id
        db.close()

    def test_provider_cannot_quote_supply_request(self):
        db = TestingSessionLocal()
        client = _make_account(db, "qc2@h.com", UserRole.client, "Quote Client 2")
        provider = _make_account(db, "qp2@h.com", UserRole.provider, "Provider Q")
        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Need safety kit", service_type="Safety Equipment", port="Mumbai Port",
            description="x", request_type="supply",
        ))
        with pytest.raises(HTTPException) as exc:
            QuoteService.create_quote(db, provider.id, req.id, QuoteCreate(amount=100.0, currency="USD"))
        assert exc.value.status_code == 403
        db.close()

    def test_supplier_cannot_quote_service_request(self):
        db = TestingSessionLocal()
        client = _make_account(db, "qc3@h.com", UserRole.client, "Quote Client 3")
        sup = _make_account(db, "qs3@h.com", UserRole.supplier, "Supplier Q")
        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Hull inspection", service_type="Inspection & Survey", port="Mumbai Port",
            description="x", request_type="service",
        ))
        with pytest.raises(HTTPException) as exc:
            QuoteService.create_quote(db, sup.id, req.id, QuoteCreate(amount=100.0, currency="USD"))
        assert exc.value.status_code == 403
        db.close()

    def test_provider_can_quote_service_request(self):
        db = TestingSessionLocal()
        client = _make_account(db, "qc4@h.com", UserRole.client, "Quote Client 4")
        provider = _make_account(db, "qp4@h.com", UserRole.provider, "Provider Q4")
        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Hull inspection", service_type="Inspection & Survey", port="Mumbai Port",
            description="x", request_type="service",
        ))
        quote = QuoteService.create_quote(db, provider.id, req.id, QuoteCreate(amount=200.0, currency="USD"))
        assert quote.provider_id == provider.id
        db.close()


# ------------------------------------------------------------- API-level checks
class TestSuppliesApi:
    def test_mine_requires_supplier_role(self):
        db = TestingSessionLocal()
        provider = _make_account(db, "apiprov@h.com", UserRole.provider, "API Provider")
        headers = _token(provider)
        db.close()
        client = TestClient(app)
        resp = client.get("/supplies/mine", headers=headers)
        assert resp.status_code == 403

    def test_public_browse_returns_paginated_shape(self):
        client = TestClient(app)
        resp = client.get("/supplies/")
        assert resp.status_code == 200
        body = resp.json()
        assert {"data", "total", "page", "pages"} <= set(body.keys())


class TestEndToEndProcurementFlow:
    """Full HTTP trace: supplier catalogue -> moderation -> marketplace ->
    client procurement request -> matching notification -> supplier quote."""

    def test_supplier_to_quote_end_to_end(self):
        db = TestingSessionLocal()
        supplier = _make_account(db, "e2e_sup@h.com", UserRole.supplier, "E2E Marine Supplies")
        client_user = _make_account(db, "e2e_cli@h.com", UserRole.client, "E2E Shipping")
        admin = _make_account(db, "e2e_admin@h.com", UserRole.admin, "E2E Admin")
        # Vendors hold NO usage passes and need no platform subscription: their
        # money buys listing showcase time, verified in the listing-fee queue.
        sup_headers = _token(supplier)
        cli_headers = _token(client_user)
        adm_headers = _token(admin)
        db.close()

        api = TestClient(app)

        # 1. Supplier creates a draft listing
        created = api.post("/supplies/", headers=sup_headers, json={
            "name": "Marine Generator Spare Parts",
            "category": "Generator Parts",
            "ports": ["Mumbai Port"],
        })
        assert created.status_code == 201, created.text
        listing_id = created.json()["id"]
        assert created.json()["status"] == "draft"

        # 2. Not visible in the public marketplace while draft
        public_before = api.get("/supplies/").json()["data"]
        assert all(l["id"] != listing_id for l in public_before)

        # 3. Supplier submits; admin approves
        assert api.post(f"/supplies/{listing_id}/submit", headers=sup_headers).status_code == 200
        moderated = api.post(f"/supplies/{listing_id}/moderate", headers=adm_headers,
                             json={"status": "approved"})
        assert moderated.status_code == 200, moderated.text

        # 4. Approval is only the content half: with no payment verified the
        #    listing is still NOT on the marketplace.
        public_unpaid = api.get("/supplies/").json()["data"]
        assert all(l["id"] != listing_id for l in public_unpaid)

        # 4b. Supplier pays ₹1,000 and the admin verifies the transfer.
        submitted = api.post(
            "/listing-fees/submit",
            headers=sup_headers,
            data={
                "listing_type": "supply",
                "listing_id": listing_id,
                "utr": "E2EUTR000123",
                "payment_date": datetime.utcnow().isoformat(),
            },
            files={"receipt": ("transfer.pdf", b"%PDF-1.4 e2e", "application/pdf")},
        )
        assert submitted.status_code == 201, submitted.text
        fee_id = submitted.json()["id"]
        assert submitted.json()["amount_paise"] == 100_000

        verified = api.post(f"/admin/listing-fees/{fee_id}/approve", headers=adm_headers)
        assert verified.status_code == 200, verified.text
        assert verified.json()["status"] == "VERIFIED"

        # 4c. Paid placement running -> now visible, with the 60-day window.
        public_after = api.get("/supplies/").json()["data"]
        card = next((l for l in public_after if l["id"] == listing_id), None)
        assert card is not None
        assert card["is_live"] is True
        assert card["expires_at"] is not None

        # 5. Client creates a matching procurement request
        req = api.post("/requests/", headers=cli_headers, json={
            "title": "Need marine generator spare parts at Mumbai",
            "service_type": "Generator Parts",
            "port": "Mumbai Port",
            "description": "urgent",
            "request_type": "supply",
            "quantity": 3,
        })
        assert req.status_code == 201, req.text
        assert req.json()["request_type"] == "supply"
        request_id = req.json()["id"]

        # 6. Supplier receives the matching notification
        notes = api.get("/notifications/me", headers=sup_headers).json()
        assert any(n["title"] == "New Procurement Request" for n in notes)

        # 7. Supplier quotes the procurement request
        quote = api.post(f"/quotes/?request_id={request_id}", headers=sup_headers, json={
            "amount": 5400.0, "currency": "USD",
        })
        assert quote.status_code == 201, quote.text

        # 8. Client sees the quotation on their own request
        quotes = api.get(f"/client/requests/{request_id}/quotations", headers=cli_headers)
        assert quotes.status_code == 200, quotes.text
        assert len(quotes.json()) == 1
