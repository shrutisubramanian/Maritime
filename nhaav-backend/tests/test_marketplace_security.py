"""
Focused security regression suite for the newly added marketplace surfaces.

Covers:
  - IDOR (service/supply ownership, cross-client quotations)
  - Role escalation (provider vs supplier vs client vs admin)
  - Lifecycle bypass (draft/pending/rejected/archived never public; status not settable)
  - Cross-ecosystem isolation (service ⇄ provider, supply ⇄ supplier)
  - Notification dedupe
  - Public profile exposure (no PII, approved-only)
  - Input validation on marketplace + moderation parameters
  - Admin moderation authorization + audit logging
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
from app.models.moderation_audit import ModerationAuditLog
from app.models.notification import Notification, NotificationType
from app.schemas.request import ServiceRequestCreate
from app.schemas.service import ServiceCreate, ServiceUpdate, ServiceModerate
from app.schemas.supply_listing import SupplyListingCreate, SupplyListingUpdate
from app.schemas.quote import QuoteCreate
from app.services.request_service import ServiceRequestService
from app.services.matching_service import MatchingService
from app.services.service_listing_service import ServiceListingService
from app.services.supply_listing_service import SupplyListingService
from app.services.quote_service import QuoteService
from app.utils.password import hash_password
from fastapi import HTTPException

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_marketplace_security.db"
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


from entitlement_helpers import grant_marketplace_access, grant_subscription


def _token(user: User) -> dict:
    tok = jwt.encode({"sub": str(user.id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return {"Authorization": f"Bearer {tok}"}


def _make_account(db, role, company=None, verified=True, password=None):
    email = f"{uuid.uuid4().hex[:8]}@sec.com"
    user = User(
        email=email,
        password_hash=hash_password(password) if password else "x",
        role=role,
        full_name=company or email,
        # Verified email + approved profile is the marketplace/requests gate.
        is_verified=True,
    )
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
    if role == UserRole.client:
        # A client's platform fee is part of the onboarding gate.
        grant_subscription(db, user)
    return user, profile


def _pay_for_placement(db, listing, days=60):
    """Model a verified ₹1,000 placement: approved content alone is not visible."""
    now = datetime.utcnow()
    listing.published_at = now
    listing.expires_at = now + timedelta(days=days)
    db.commit()
    # The caller closes the session next; expunge so assertions can read fields
    # without a lazy reload against a closed session.
    db.refresh(listing)
    db.expunge(listing)
    return listing


def _approved_service(db, provider_id, name="Hydraulic Repairs", port="Mumbai"):
    listing = ServiceListingService.create_listing(db, provider_id, ServiceCreate(
        name=name, category="Repairs & Maintenance", service_id=name, port_id=port,
    ))
    ServiceListingService.moderate_listing(db, listing.id, ServiceListingStatus.approved)
    _pay_for_placement(db, listing)
    return listing


def _approved_supply(db, supplier_id, name="Generator Parts", port="Mumbai"):
    listing = SupplyListingService.create_listing(db, supplier_id, SupplyListingCreate(
        name=name, category="Generator Parts", ports=[port],
    ))
    SupplyListingService.moderate_listing(db, listing.id, SupplyListingStatus.approved)
    _pay_for_placement(db, listing)
    return listing


# ------------------------------------------------------------------------ IDOR
class TestIDOR:
    def test_provider_cannot_modify_another_providers_service(self):
        db = TestingSessionLocal()
        a, _ = _make_account(db, UserRole.provider, "Provider A")
        b, _ = _make_account(db, UserRole.provider, "Provider B")
        listing = _approved_service(db, a.id)
        with pytest.raises(HTTPException) as exc:
            ServiceListingService.update_listing(db, listing.id, b.id, ServiceUpdate(name="Hijacked"))
        assert exc.value.status_code == 403
        with pytest.raises(HTTPException) as exc:
            ServiceListingService.archive_listing(db, listing.id, b.id)
        assert exc.value.status_code == 403
        with pytest.raises(HTTPException) as exc:
            ServiceListingService.delete_listing(db, listing.id, b.id)
        assert exc.value.status_code == 403
        db.close()

    def test_supplier_cannot_modify_another_suppliers_listing(self):
        db = TestingSessionLocal()
        a, _ = _make_account(db, UserRole.supplier, "Supplier A")
        b, _ = _make_account(db, UserRole.supplier, "Supplier B")
        listing = _approved_supply(db, a.id)
        with pytest.raises(HTTPException) as exc:
            SupplyListingService.update_listing(db, listing.id, b.id, SupplyListingUpdate(name="Hijacked"))
        assert exc.value.status_code == 403
        with pytest.raises(HTTPException) as exc:
            SupplyListingService.delete_listing(db, listing.id, b.id)
        assert exc.value.status_code == 403
        db.close()

    def test_client_cannot_view_another_clients_quotations(self):
        db = TestingSessionLocal()
        owner, _ = _make_account(db, UserRole.client, "Owner Client")
        other, _ = _make_account(db, UserRole.client, "Other Client")
        provider, _ = _make_account(db, UserRole.provider, "Quoting Provider")
        req = ServiceRequestService.create_request(db, owner.id, ServiceRequestCreate(
            title="Hull inspection", service_type="Hull & Underwater", port="Mumbai",
            description="x", request_type="service",
        ))
        QuoteService.create_quote(db, provider.id, req.id, QuoteCreate(amount=100.0, currency="USD"))
        owner_token = _token(owner)
        other_token = _token(other)
        req_id = req.id
        db.close()

        api = TestClient(app)
        assert api.get(f"/client/requests/{req_id}/quotations", headers=owner_token).status_code == 200
        assert api.get(f"/client/requests/{req_id}/quotations", headers=other_token).status_code == 403

    def test_non_owner_cannot_see_unapproved_service_detail(self):
        db = TestingSessionLocal()
        owner, _ = _make_account(db, UserRole.provider, "Owner Provider")
        other, _ = _make_account(db, UserRole.provider, "Other Provider")
        listing = ServiceListingService.create_listing(db, owner.id, ServiceCreate(
            name="Draft Only", category="Repairs & Maintenance",
        ))
        listing_id = listing.id
        owner_token = _token(owner)
        other_token = _token(other)
        db.close()

        api = TestClient(app)
        # unauthenticated and other-user see 404; owner sees their draft
        assert api.get(f"/services/{listing_id}").status_code == 404
        assert api.get(f"/services/{listing_id}", headers=other_token).status_code == 404
        assert api.get(f"/services/{listing_id}", headers=owner_token).status_code == 200


# ------------------------------------------------------------- role escalation
class TestRoleEscalation:
    def test_supplier_cannot_create_service_listing(self):
        db = TestingSessionLocal()
        supplier, _ = _make_account(db, UserRole.supplier, "Supplier")
        with pytest.raises(HTTPException) as exc:
            ServiceListingService.create_listing(db, supplier.id, ServiceCreate(name="X", category="Y"))
        assert exc.value.status_code == 403
        db.close()

    def test_provider_cannot_create_supply_listing(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        with pytest.raises(HTTPException) as exc:
            SupplyListingService.create_listing(db, provider.id, SupplyListingCreate(name="X", category="Y"))
        assert exc.value.status_code == 403
        db.close()

    def test_non_admin_cannot_reach_moderation_queue(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        supplier, _ = _make_account(db, UserRole.supplier, "Supplier")
        client, _ = _make_account(db, UserRole.client, "Client")
        headers = [_token(provider), _token(supplier), _token(client)]
        db.close()
        api = TestClient(app)
        for h in headers:
            assert api.get("/admin/moderation/queue", headers=h).status_code == 403

    def test_provider_cannot_self_approve_via_moderate_endpoint(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        listing = _approved_service(db, provider.id)
        headers = _token(provider)
        db.close()
        api = TestClient(app)
        resp = api.post(f"/services/{listing.id}/moderate", headers=headers, json={"status": "approved"})
        assert resp.status_code == 403


# ------------------------------------------------------------ lifecycle bypass
class TestLifecycleBypass:
    def test_create_cannot_force_status_via_payload(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        headers = _token(provider)
        db.close()
        api = TestClient(app)
        resp = api.post("/services/", headers=headers, json={
            "name": "Sneaky", "category": "Repairs & Maintenance",
            "service_id": "Sneaky", "port_id": "Mumbai",
            "status": "approved", "is_active": True,
        })
        assert resp.status_code == 201
        assert resp.json()["status"] == "draft"
        assert resp.json()["is_active"] is False

    def test_update_cannot_force_status_via_payload(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Draft", category="Repairs & Maintenance",
        ))
        updated = ServiceListingService.update_listing(
            db, listing.id, provider.id, ServiceUpdate(name="Renamed")
        )
        assert updated.status == ServiceListingStatus.draft
        assert updated.is_active is False
        db.close()

    def test_unapproved_states_never_appear_publicly(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        states = {
            "draft": ServiceListingService.create_listing(db, provider.id, ServiceCreate(name="D", category="C", service_id="D", port_id="P")),
            "pending": ServiceListingService.create_listing(db, provider.id, ServiceCreate(name="P", category="C", service_id="P", port_id="P2", submit_now=True)),
            "rejected": ServiceListingService.create_listing(db, provider.id, ServiceCreate(name="R", category="C", service_id="R", port_id="P3")),
            "archived": ServiceListingService.create_listing(db, provider.id, ServiceCreate(name="A", category="C", service_id="A", port_id="P4")),
        }
        ServiceListingService.moderate_listing(db, states["rejected"].id, ServiceListingStatus.rejected)
        ServiceListingService.archive_listing(db, states["archived"].id, provider.id)

        results, *_ = ServiceListingService.search_public(db, page=1, limit=100)
        ids = {s.id for s in results}
        for state, listing in states.items():
            assert listing.id not in ids, f"{state} listing leaked into public search"
        db.close()

    def test_moderation_requires_pending_review(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        admin, _ = _make_account(db, UserRole.admin, "Admin")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Already Approved", category="C",
        ))
        ServiceListingService.moderate_listing(db, listing.id, ServiceListingStatus.approved)
        headers = _token(admin)
        db.close()
        api = TestClient(app)
        # second moderation attempt on an approved listing must be rejected
        resp = api.post(f"/admin/moderation/service/{listing.id}", headers=headers, json={"status": "rejected"})
        assert resp.status_code == 409


# --------------------------------------------------------- cross-ecosystem
class TestCrossEcosystemIsolation:
    def test_matching_never_crosses(self):
        db = TestingSessionLocal()
        client, _ = _make_account(db, UserRole.client, "Client")
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        supplier, _ = _make_account(db, UserRole.supplier, "Supplier")
        _approved_service(db, provider.id, name="Hydraulic Repairs", port="Mumbai")
        _approved_supply(db, supplier.id, name="Hydraulic Repairs", port="Mumbai")

        svc_req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Hydraulic Repairs Mumbai", service_type="Hydraulic Repairs", port="Mumbai",
            description="x", request_type="service",
        ))
        svc_recipients = set(MatchingService.get_eligible_recipients(db, svc_req))
        assert provider.id in svc_recipients
        assert supplier.id not in svc_recipients

        sup_req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Hydraulic Repairs Mumbai", service_type="Hydraulic Repairs", port="Mumbai",
            description="x", request_type="supply", quantity=2,
        ))
        sup_recipients = set(MatchingService.get_eligible_recipients(db, sup_req))
        assert supplier.id in sup_recipients
        assert provider.id not in sup_recipients
        db.close()

    def test_quote_authorization_is_type_aware(self):
        db = TestingSessionLocal()
        client, _ = _make_account(db, UserRole.client, "Client")
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        supplier, _ = _make_account(db, UserRole.supplier, "Supplier")
        _approved_service(db, provider.id, name="Hull Cleaning", port="Mumbai")
        _approved_supply(db, supplier.id, name="Safety Kit", port="Mumbai")

        svc_req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Hull Cleaning", service_type="Hull Cleaning", port="Mumbai",
            description="x", request_type="service",
        ))
        sup_req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Safety Kit", service_type="Safety Kit", port="Mumbai",
            description="x", request_type="supply",
        ))

        # supplier cannot quote the service request
        with pytest.raises(HTTPException) as exc:
            QuoteService.create_quote(db, supplier.id, svc_req.id, QuoteCreate(amount=1.0, currency="USD"))
        assert exc.value.status_code == 403
        # provider cannot quote the supply request
        with pytest.raises(HTTPException) as exc:
            QuoteService.create_quote(db, provider.id, sup_req.id, QuoteCreate(amount=1.0, currency="USD"))
        assert exc.value.status_code == 403
        # correct pairings succeed
        QuoteService.create_quote(db, provider.id, svc_req.id, QuoteCreate(amount=1.0, currency="USD"))
        QuoteService.create_quote(db, supplier.id, sup_req.id, QuoteCreate(amount=1.0, currency="USD"))
        db.close()


# ------------------------------------------------------- notification abuse
class TestNotificationAbuse:
    def test_no_duplicate_fanout(self):
        db = TestingSessionLocal()
        client, _ = _make_account(db, UserRole.client, "Client")
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        _approved_service(db, provider.id, name="Hull Cleaning", port="Mumbai")

        req = ServiceRequestService.create_request(db, client.id, ServiceRequestCreate(
            title="Hull Cleaning", service_type="Hull Cleaning", port="Mumbai",
            description="x", request_type="service",
        ))
        from app.services.notification_service import NotificationService
        from app.models.notification import NotificationType
        for _ in range(3):
            NotificationService.create_notification(
                db=db, user_id=provider.id, title="New Procurement Request", message="dup",
                notification_type=NotificationType.procurement, related_entity="service_request",
                related_entity_id=req.id, dedupe=True,
            )
        db.commit()
        count = db.query(Notification).filter(
            Notification.user_id == provider.id, Notification.related_entity_id == str(req.id)
        ).count()
        assert count == 1
        db.close()


# ----------------------------------------------------------- public exposure
class TestPublicProfileExposure:
    def test_public_profile_hides_private_fields_and_unapproved_listings(self):
        db = TestingSessionLocal()
        provider, profile = _make_account(db, UserRole.provider, "Public Provider")
        profile.contacts = [{"label": "Email", "value": "secret@example.com"}]
        profile.licenses = ["INTERNAL-LIC-1"]
        profile.offices = ["Hidden Office"]
        profile.profile_metadata = {"internal": "secret"}
        db.commit()
        approved = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Public Svc", category="C",
        ))
        ServiceListingService.moderate_listing(db, approved.id, ServiceListingStatus.approved)
        _pay_for_placement(db, approved)
        ServiceListingService.create_listing(db, provider.id, ServiceCreate(name="Secret Svc", category="C"))
        user_id, profile_id = provider.id, profile.id
        db.close()

        api = TestClient(app)
        for url in (f"/profiles/by-user/{user_id}/public", f"/profiles/{profile_id}/public"):
            body = api.get(url).json()
            for leaked in ("contacts", "licenses", "offices", "team", "profile_metadata", "documents"):
                assert leaked not in body
            # Social links and the registered address are the company's own
            # storefront facts and ARE published. Nothing else from
            # profile_metadata may leak through them.
            assert not (body.get("social_links") or {})
            assert body.get("address") is None
            names = {s["name"] for s in body.get("services", [])}
            assert "Public Svc" in names and "Secret Svc" not in names

    def test_archived_listing_drops_out_of_public_profile(self):
        db = TestingSessionLocal()
        provider, profile = _make_account(db, UserRole.provider, "Provider")
        listing = _approved_service(db, provider.id, name="Was Public")
        user_id = provider.id
        ServiceListingService.archive_listing(db, listing.id, provider.id)
        db.close()
        api = TestClient(app)
        body = api.get(f"/profiles/by-user/{user_id}/public").json()
        assert all(s["name"] != "Was Public" for s in body.get("services", []))


# ------------------------------------------------------------ input validation
class TestInputValidation:
    def test_invalid_moderation_kind(self):
        db = TestingSessionLocal()
        admin, _ = _make_account(db, UserRole.admin, "Admin")
        headers = _token(admin)
        db.close()
        api = TestClient(app)
        assert api.get("/admin/moderation/queue?kind=bogus", headers=headers).status_code == 400

    def test_invalid_status_filter(self):
        db = TestingSessionLocal()
        admin, _ = _make_account(db, UserRole.admin, "Admin")
        headers = _token(admin)
        db.close()
        api = TestClient(app)
        assert api.get("/admin/moderation/queue?kind=service&status=nope", headers=headers).status_code == 400

    def test_invalid_moderation_action_status(self):
        db = TestingSessionLocal()
        admin, _ = _make_account(db, UserRole.admin, "Admin")
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(name="X", category="C"))
        ServiceListingService.submit_for_review(db, listing.id, provider.id)
        headers = _token(admin)
        db.close()
        api = TestClient(app)
        resp = api.post(f"/admin/moderation/service/{listing.id}", headers=headers, json={"status": "deleted"})
        assert resp.status_code == 400

    def test_non_uuid_listing_id_rejected(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        headers = _token(provider)
        db.close()
        api = TestClient(app)
        assert api.get("/services/not-a-uuid", headers=headers).status_code == 422

    def test_duplicate_listing_conflict(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Dup", category="C", service_id="Dup", port_id="Mumbai",
        ))
        with pytest.raises(HTTPException) as exc:
            ServiceListingService.create_listing(db, provider.id, ServiceCreate(
                name="Dup", category="C", service_id="Dup", port_id="Mumbai",
            ))
        assert exc.value.status_code == 409
        db.close()

    def test_marketplace_search_params_bounded(self):
        api = TestClient(app)
        db = TestingSessionLocal()
        viewer, _ = _make_account(db, UserRole.client, "Bounded Co")
        grant_marketplace_access(db, viewer)
        headers = _token(viewer)
        db.close()
        # Entitled, so the request reaches parameter validation (422), not the
        # onboarding gate.
        assert api.get("/marketplace/services", headers=headers, params={"limit": 99999}).status_code == 422
        assert api.get("/marketplace/services", headers=headers, params={"limit": 0}).status_code == 422


# ----------------------------------------------------- moderation + auditing
class TestAdminModerationAndAudit:
    def test_admin_queue_and_approve_writes_audit(self):
        db = TestingSessionLocal()
        admin, _ = _make_account(db, UserRole.admin, "Admin", password="Password123!")
        provider, _ = _make_account(db, UserRole.provider, "Provider", password="Password123!")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Pending Svc", category="Repairs & Maintenance", service_id="P", port_id="Mumbai",
        ))
        ServiceListingService.submit_for_review(db, listing.id, provider.id)
        listing_id = listing.id
        admin_email = admin.email
        admin_id = admin.id
        db.close()

        api = TestClient(app)

        # admin login works against the real backend
        login = api.post("/admin/auth/login", json={"email": admin_email, "password": "Password123!"})
        assert login.status_code == 200, login.text
        admin_token = login.json()["access_token"]
        assert api.get("/admin/auth/me", headers={"Authorization": f"Bearer {admin_token}"}).status_code == 200

        # queue shows the pending listing with owner info
        queue = api.get("/admin/moderation/queue?kind=service", headers={"Authorization": f"Bearer {admin_token}"})
        assert queue.status_code == 200
        assert any(item["id"] == str(listing_id) for item in queue.json()["data"])

        # approve
        act = api.post(
            f"/admin/moderation/service/{listing_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "approved"},
        )
        assert act.status_code == 200, act.text
        assert act.json()["status"] == "approved"

        db = TestingSessionLocal()
        audit = db.query(ModerationAuditLog).filter(
            ModerationAuditLog.entity_id == listing_id, ModerationAuditLog.action == "approved"
        ).first()
        assert audit is not None and audit.admin_id == admin_id
        db.close()

    def test_reject_stores_reason_and_audit(self):
        db = TestingSessionLocal()
        admin, _ = _make_account(db, UserRole.admin, "Admin")
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(name="Reject Me", category="C"))
        ServiceListingService.submit_for_review(db, listing.id, provider.id)
        listing_id = listing.id
        headers = _token(admin)
        db.close()

        api = TestClient(app)
        resp = api.post(f"/admin/moderation/service/{listing_id}", headers=headers,
                        json={"status": "rejected", "reason": "Insufficient documentation"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["rejection_reason"] == "Insufficient documentation"

        db = TestingSessionLocal()
        audit = db.query(ModerationAuditLog).filter(ModerationAuditLog.entity_id == listing_id).first()
        assert audit is not None and audit.action == "rejected" and audit.reason == "Insufficient documentation"
        db.close()

    def test_owner_notified_on_service_approval(self):
        db = TestingSessionLocal()
        admin, _ = _make_account(db, UserRole.admin, "Admin")
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Notify Approve", category="C", submit_now=True,
        ))
        listing_id, owner_id = listing.id, provider.id
        headers = _token(admin)
        db.close()

        api = TestClient(app)
        resp = api.post(f"/admin/moderation/service/{listing_id}", headers=headers,
                        json={"status": "approved"})
        assert resp.status_code == 200, resp.text

        db = TestingSessionLocal()
        notifs = db.query(Notification).filter(
            Notification.user_id == owner_id,
            Notification.type == NotificationType.moderation,
            Notification.related_entity == "service_listing",
            Notification.related_entity_id == str(listing_id),
        ).all()
        assert len(notifs) == 1
        assert notifs[0].title == "Your service listing has been approved"
        assert "Notify Approve" in notifs[0].message
        db.close()

    def test_owner_notified_on_service_rejection_with_reason(self):
        db = TestingSessionLocal()
        admin, _ = _make_account(db, UserRole.admin, "Admin")
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Notify Reject", category="C", submit_now=True,
        ))
        listing_id, owner_id = listing.id, provider.id
        headers = _token(admin)
        db.close()

        api = TestClient(app)
        resp = api.post(f"/admin/moderation/service/{listing_id}", headers=headers,
                        json={"status": "rejected", "reason": "Port coverage information is incomplete"})
        assert resp.status_code == 200, resp.text

        db = TestingSessionLocal()
        notifs = db.query(Notification).filter(
            Notification.user_id == owner_id,
            Notification.type == NotificationType.moderation,
            Notification.related_entity_id == str(listing_id),
        ).all()
        assert len(notifs) == 1
        assert notifs[0].title == "Your service listing was rejected"
        assert "Reason: Port coverage information is incomplete" in notifs[0].message
        db.close()

    def test_owner_notified_on_supply_approve_and_reject(self):
        db = TestingSessionLocal()
        admin, _ = _make_account(db, UserRole.admin, "Admin")
        supplier, _ = _make_account(db, UserRole.supplier, "Supplier")
        approved_listing = SupplyListingService.create_listing(db, supplier.id, SupplyListingCreate(
            name="Notify Supply OK", category="Generator Parts", ports=["Mumbai"], submit_now=True,
        ))
        rejected_listing = SupplyListingService.create_listing(db, supplier.id, SupplyListingCreate(
            name="Notify Supply Bad", category="Generator Parts", ports=["Mumbai"], submit_now=True,
        ))
        approved_id, rejected_id, owner_id = approved_listing.id, rejected_listing.id, supplier.id
        headers = _token(admin)
        db.close()

        api = TestClient(app)
        ok = api.post(f"/admin/moderation/supply/{approved_id}", headers=headers,
                      json={"status": "approved"})
        bad = api.post(f"/admin/moderation/supply/{rejected_id}", headers=headers,
                       json={"status": "rejected", "reason": "Missing certification documents"})
        assert ok.status_code == 200, ok.text
        assert bad.status_code == 200, bad.text

        db = TestingSessionLocal()
        notifs = db.query(Notification).filter(
            Notification.user_id == owner_id,
            Notification.type == NotificationType.moderation,
        ).all()
        assert len(notifs) == 2
        by_entity = {n.related_entity_id: n for n in notifs}
        assert by_entity[str(approved_id)].title == "Your supply listing has been approved"
        rej = by_entity[str(rejected_id)]
        assert rej.title == "Your supply listing was rejected"
        assert rej.related_entity == "supply_listing"
        assert "Reason: Missing certification documents" in rej.message
        db.close()

    def test_moderation_notification_reaches_only_the_owner(self):
        db = TestingSessionLocal()
        admin, _ = _make_account(db, UserRole.admin, "Admin")
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        other, _ = _make_account(db, UserRole.provider, "Other Provider")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Owner Scope", category="C", submit_now=True,
        ))
        listing_id, owner_id, other_id = listing.id, provider.id, other.id
        headers = _token(admin)
        db.close()

        api = TestClient(app)
        resp = api.post(f"/admin/moderation/service/{listing_id}", headers=headers,
                        json={"status": "rejected", "reason": "no"})
        assert resp.status_code == 200, resp.text

        db = TestingSessionLocal()
        owner_notifs = db.query(Notification).filter(Notification.user_id == owner_id).all()
        other_notifs = db.query(Notification).filter(Notification.user_id == other_id).all()
        admin_notifs = db.query(Notification).filter(Notification.user_id == admin.id).all()
        assert len(owner_notifs) == 1 and owner_notifs[0].related_entity_id == str(listing_id)
        assert other_notifs == []
        assert admin_notifs == []
        db.close()

    def test_resubmitted_then_rerejected_listing_notifies_again(self):
        db = TestingSessionLocal()
        admin, _ = _make_account(db, UserRole.admin, "Admin")
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Resubmit Flow", category="C", submit_now=True,
        ))
        listing_id, owner_id = listing.id, provider.id
        headers = _token(admin)
        owner_token = _token(provider)
        db.close()

        api = TestClient(app)
        # First rejection
        assert api.post(f"/admin/moderation/service/{listing_id}", headers=headers,
                        json={"status": "rejected", "reason": "first"}).status_code == 200
        # Owner resubmits, admin rejects again with a different reason
        assert api.post(f"/services/{listing_id}/submit", headers=owner_token).status_code == 200
        assert api.post(f"/admin/moderation/service/{listing_id}", headers=headers,
                        json={"status": "rejected", "reason": "second"}).status_code == 200

        db = TestingSessionLocal()
        notifs = db.query(Notification).filter(
            Notification.user_id == owner_id,
            Notification.type == NotificationType.moderation,
        ).all()
        assert len(notifs) == 2
        reasons = sorted(n.message for n in notifs)
        assert any("Reason: first" in m for m in reasons)
        assert any("Reason: second" in m for m in reasons)
        db.close()

    def test_legacy_moderate_endpoint_also_notifies_owner(self):
        """Legacy /services/{id}/moderate must write the same notification + audit."""
        db = TestingSessionLocal()
        admin, _ = _make_account(db, UserRole.admin, "Admin")
        provider, _ = _make_account(db, UserRole.provider, "Provider")
        listing = ServiceListingService.create_listing(db, provider.id, ServiceCreate(
            name="Legacy Path", category="C", submit_now=True,
        ))
        listing_id, owner_id, admin_id = listing.id, provider.id, admin.id
        headers = _token(admin)
        db.close()

        api = TestClient(app)
        resp = api.post(f"/services/{listing_id}/moderate", headers=headers,
                        json={"status": "approved"})
        assert resp.status_code == 200, resp.text

        db = TestingSessionLocal()
        notif = db.query(Notification).filter(
            Notification.user_id == owner_id,
            Notification.type == NotificationType.moderation,
        ).first()
        assert notif is not None and notif.related_entity_id == str(listing_id)
        audit = db.query(ModerationAuditLog).filter(
            ModerationAuditLog.entity_id == listing_id, ModerationAuditLog.action == "approved"
        ).first()
        assert audit is not None and audit.admin_id == admin_id
        db.close()

    def test_non_admin_cannot_login_as_admin(self):
        db = TestingSessionLocal()
        provider, _ = _make_account(db, UserRole.provider, "Provider", password="Password123!")
        email = provider.email
        db.close()
        api = TestClient(app)
        resp = api.post("/admin/auth/login", json={"email": email, "password": "Password123!"})
        assert resp.status_code == 401
