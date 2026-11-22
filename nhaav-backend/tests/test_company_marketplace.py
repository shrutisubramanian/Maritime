"""
Company-first marketplace + paid profile visibility.

The marketplace browses COMPANIES: pick a vendor type, pick a primary category,
see the companies in it, open a company's business profile. A company holds
exactly ONE primary category with many capabilities beneath it, and it only
appears in paid discovery once an admin has BOTH approved the profile AND
verified a visibility payment.

These tests cover the rules that make that safe:
  * supplier and provider taxonomies stay separate;
  * one primary category per company, capabilities restricted to it;
  * category/subcategory clicks return companies (never generic descriptions);
  * admin-only category creation, with duplicates refused;
  * GST-inclusive plan totals from the configured rate;
  * no paid visibility before approval + payment verification;
  * expiry removes a company from every discovery query;
  * companies that predate the model stay discoverable through their own paid
    listings instead of silently disappearing.
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
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.user import User, UserRole
from app.supplier_catalogue import SUPPLIER_PROFILE_CATEGORIES
from entitlement_helpers import grant_marketplace_access

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_company_marketplace.db"
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


def _provider_category(db):
    """Seed the source data the taxonomy derives from. Idempotent: the module
    shares one database, so every test may call this freely."""
    wanted = {
        "Underwater Hull Cleaning": "Hull & Underwater",
        "Propeller Polishing": "Hull & Underwater",
        "Hydraulic Repairs": "Repairs & Maintenance",
    }
    have = {row.name for row in db.query(ServiceCategory).all()}
    for name, group in wanted.items():
        if name not in have:
            db.add(ServiceCategory(name=name, category_group=group))

    supplier = (
        db.query(User)
        .filter(User.role == UserRole.supplier, User.full_name == "Seed Chandlers")
        .first()
    )
    if supplier is None:
        supplier = _user(db, UserRole.supplier, "Seed Chandlers", email_prefix="seed")
        # A supply row seeds the supplier half of the taxonomy from real data.
        db.add(
            SupplyListing(
                supplier_id=supplier.id,
                name="Bonded Stores Pack",
                category="Ship Chandlers",
                subcategory="Bonded Stores",
                status=SupplyListingStatus.approved,
                expires_at=datetime.utcnow() + timedelta(days=30),
            )
        )
    db.commit()
    return supplier


def _set_category(db, user, category, subcategories):
    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    from app.models.vendor_category import VendorType
    from app.services.vendor_taxonomy_service import VendorTaxonomyService

    vendor_type = VendorType(user.role.value)
    cat, subs = VendorTaxonomyService.validate_selection(db, vendor_type, category, subcategories)
    VendorTaxonomyService.set_company_selection(db, profile, vendor_type, cat, subs)
    db.commit()
    return profile


def _grant_visibility(db, profile, days=30):
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


class TestTaxonomy:
    def test_supplier_and_provider_categories_are_separate(self, api):
        db = TestingSessionLocal()
        _provider_category(db)
        buyer = _buyer(db)
        headers = _token(buyer)

        providers = api.get(
            "/marketplace/vendor-categories?vendor_type=provider", headers=headers
        )
        assert providers.status_code == 200, providers.text
        provider_names = {c["name"] for c in providers.json()["data"]}
        assert "Hull & Underwater" in provider_names
        assert "Ship Chandlers" not in provider_names

        suppliers = api.get(
            "/marketplace/vendor-categories?vendor_type=supplier", headers=headers
        )
        assert suppliers.status_code == 200, suppliers.text
        supplier_names = {c["name"] for c in suppliers.json()["data"]}
        assert "Ship Chandlers" in supplier_names
        assert "Hull & Underwater" not in supplier_names

        hull = next(c for c in providers.json()["data"] if c["name"] == "Hull & Underwater")
        assert {"Underwater Hull Cleaning", "Propeller Polishing"} <= {
            s["name"] for s in hull["subcategories"]
        }
        db.close()

    def test_supplier_profile_dropdown_has_the_canonical_categories(self, api):
        db = TestingSessionLocal()
        _provider_category(db)
        buyer = _buyer(db)
        headers = _token(buyer)

        suppliers = api.get(
            "/marketplace/vendor-categories?vendor_type=supplier", headers=headers
        )
        assert suppliers.status_code == 200, suppliers.text
        names = [c["name"] for c in suppliers.json()["data"]]

        # The eight profile choices come first, in their published order.
        assert names[: len(SUPPLIER_PROFILE_CATEGORIES)] == list(
            SUPPLIER_PROFILE_CATEGORIES
        )
        assert set(SUPPLIER_PROFILE_CATEGORIES) <= set(names)
        db.close()

    def test_provider_cannot_take_capability_from_another_category(self, api):
        db = TestingSessionLocal()
        _provider_category(db)
        provider = _user(db, UserRole.provider, "Indus Marine", email_prefix="prov")
        headers = _token(provider)

        ok = api.put(
            "/profiles/me",
            json={
                "primary_category": "Hull & Underwater",
                "subcategories": ["Underwater Hull Cleaning", "Propeller Polishing"],
            },
            headers=headers,
        )
        assert ok.status_code == 200, ok.text
        body = ok.json()
        assert body["primary_category_name"] == "Hull & Underwater"
        assert body["subcategory_names"] == ["Propeller Polishing", "Underwater Hull Cleaning"]

        bad = api.put(
            "/profiles/me",
            json={"primary_category": "Hull & Underwater", "subcategories": ["Hydraulic Repairs"]},
            headers=headers,
        )
        assert bad.status_code == 400
        assert bad.json()["detail"]["code"] == "invalid_subcategories"
        assert "Hydraulic Repairs" in bad.json()["detail"]["invalid"]

        unknown = api.put(
            "/profiles/me",
            json={"primary_category": "Not A Category", "subcategories": []},
            headers=headers,
        )
        assert unknown.status_code == 400
        assert unknown.json()["detail"]["code"] == "unknown_category"

        # Changing category without re-sending capabilities drops the stale ones.
        moved = api.put(
            "/profiles/me",
            json={"primary_category": "Repairs & Maintenance"},
            headers=headers,
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["primary_category_name"] == "Repairs & Maintenance"
        assert moved.json()["subcategory_names"] == []
        db.close()

    def test_client_has_no_marketplace_category(self, api):
        db = TestingSessionLocal()
        _provider_category(db)
        buyer = _buyer(db)
        resp = api.put(
            "/profiles/me",
            json={"primary_category": "Hull & Underwater"},
            headers=_token(buyer),
        )
        assert resp.status_code == 400
        db.close()

    def test_admin_only_category_creation_and_duplicate_refusal(self, api):
        db = TestingSessionLocal()
        _provider_category(db)
        provider = _user(db, UserRole.provider, "Indus Marine", email_prefix="prov")
        admin = _user(db, UserRole.admin, "Nhaav Admin", email_prefix="admin")

        forbidden = api.post(
            "/admin/vendor-categories",
            json={"vendor_type": "provider", "name": "Engine Overhaul", "subcategories": ["Top Overhaul"]},
            headers=_token(provider),
        )
        assert forbidden.status_code == 403

        created = api.post(
            "/admin/vendor-categories",
            json={
                "vendor_type": "provider",
                "name": "Underwater Services",
                "subcategories": ["Hull Cleaning", "UWILD Inspection", "Propeller Polishing"],
            },
            headers=_token(admin),
        )
        assert created.status_code == 201, created.text
        category_id = created.json()["id"]
        assert {s["name"] for s in created.json()["subcategories"]} >= {
            "Hull Cleaning",
            "UWILD Inspection",
        }

        duplicate = api.post(
            "/admin/vendor-categories",
            json={"vendor_type": "provider", "name": "underwater services"},
            headers=_token(admin),
        )
        assert duplicate.status_code == 409

        more = api.post(
            f"/admin/vendor-categories/{category_id}/subcategories",
            json={"names": ["Underwater Welding"]},
            headers=_token(admin),
        )
        assert more.status_code == 200, more.text
        assert "Underwater Welding" in {s["name"] for s in more.json()["subcategories"]}

        # The new category is immediately selectable by another vendor.
        other = _user(db, UserRole.provider, "Deep Works", email_prefix="prov2")
        assigned = api.put(
            "/profiles/me",
            json={"primary_category": "Underwater Services", "subcategories": ["Underwater Welding"]},
            headers=_token(other),
        )
        assert assigned.status_code == 200, assigned.text
        assert assigned.json()["primary_category_name"] == "Underwater Services"
        db.close()


class TestVisibilityPlans:
    def test_plan_totals_include_configured_gst(self, api):
        db = TestingSessionLocal()
        provider = _user(db, UserRole.provider, "Indus Marine", email_prefix="prov")
        resp = api.get("/profile-visibility/plans", headers=_token(provider))
        assert resp.status_code == 200, resp.text
        plans = {p["code"]: p for p in resp.json()["plans"]}

        rate = settings.GST_RATE_PERCENT
        monthly = plans["monthly"]
        assert monthly["base_amount_paise"] == 100_000
        assert monthly["gst_rate_percent"] == rate
        assert monthly["gst_amount_paise"] == round(100_000 * rate / 100)
        assert monthly["total_amount_paise"] == 100_000 + round(100_000 * rate / 100)
        assert monthly["period_days"] == 30

        annual = plans["annual"]
        assert annual["base_amount_paise"] == 1_000_000
        assert annual["total_amount_paise"] == 1_000_000 + round(1_000_000 * rate / 100)
        assert annual["period_days"] == 365
        db.close()

    def test_verification_requires_approved_profile(self, api):
        db = TestingSessionLocal()
        _provider_category(db)
        admin = _user(db, UserRole.admin, "Nhaav Admin", email_prefix="admin")
        pending = _user(db, UserRole.provider, "Unapproved Marine", verified=False, email_prefix="prov")
        _set_category(db, pending, "Hull & Underwater", ["Underwater Hull Cleaning"])
        profile = db.query(Profile).filter(Profile.user_id == pending.id).first()

        payment = ProfileVisibility(
            profile_id=profile.id,
            owner_user_id=pending.id,
            plan=ProfileVisibilityPlan.monthly,
            period_days=30,
            base_amount_paise=100_000,
            gst_rate_percent=18,
            gst_amount_paise=18_000,
            total_amount_paise=118_000,
            utr=f"UTR{uuid.uuid4().hex[:10].upper()}",
            payment_date=datetime.utcnow(),
            receipt_path="uploads/payment_receipts/test.pdf",
            receipt_filename="test.pdf",
            status=ProfileVisibilityStatus.SUBMITTED,
            submitted_at=datetime.utcnow(),
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)

        blocked = api.post(
            f"/admin/profile-visibility/{payment.id}/verify", headers=_token(admin)
        )
        assert blocked.status_code == 409
        assert blocked.json()["detail"]["code"] == "profile_not_approved"

        # Once the profile is approved the payment can be verified and the paid
        # window starts.
        profile.verification_status = VerificationStatus.verified
        db.commit()
        verified = api.post(
            f"/admin/profile-visibility/{payment.id}/verify", headers=_token(admin)
        )
        assert verified.status_code == 200, verified.text
        assert verified.json()["status"] == "VERIFIED"
        assert verified.json()["expires_at"] is not None
        db.close()


class TestDiscovery:
    def _company(self, db, name, category, subs, visible=True, city="Mumbai Port", country="India"):
        provider = _user(db, UserRole.provider, name, email_prefix="prov")
        profile = _set_category(db, provider, category, subs)
        profile.head_office = city
        profile.country = country
        profile.service_areas = ["West Coast"]
        db.commit()
        if visible:
            _grant_visibility(db, profile)
        return provider, profile

    def test_category_click_returns_companies_only_with_paid_visibility(self, api):
        db = TestingSessionLocal()
        _provider_category(db)
        admin = _user(db, UserRole.admin, "Nhaav Admin", email_prefix="admin")
        buyer = _buyer(db)

        paid, paid_profile = self._company(
            db, "Indus Marine", "Hull & Underwater", ["Underwater Hull Cleaning"]
        )
        unpaid, unpaid_profile = self._company(
            db, "Dry Dock Divers", "Hull & Underwater", ["Underwater Hull Cleaning"], visible=False
        )

        resp = api.get(
            "/marketplace/companies?vendor_type=provider&category=Hull%20%26%20Underwater",
            headers=_token(buyer),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        names = {c["company_name"] for c in body["data"]}
        assert "Indus Marine" in names
        assert "Dry Dock Divers" not in names
        card = next(c for c in body["data"] if c["company_name"] == "Indus Marine")
        assert card["primary_category"] == "Hull & Underwater"
        assert "Underwater Hull Cleaning" in card["subcategories"]
        assert card["country"] == "India"
        assert card["head_office"] == "Mumbai Port"

        # Subcategory click narrows to companies that actually provide it.
        other, _ = self._company(
            db, "Prop Polish Co", "Hull & Underwater", ["Propeller Polishing"]
        )
        narrowed = api.get(
            "/marketplace/companies",
            params={
                "vendor_type": "provider",
                "category": "Hull & Underwater",
                "subcategory": "Propeller Polishing",
            },
            headers=_token(buyer),
        )
        assert narrowed.status_code == 200
        assert {c["company_name"] for c in narrowed.json()["data"]} == {"Prop Polish Co"}

        searched = api.get(
            "/marketplace/companies",
            params={"vendor_type": "provider", "search": "indus"},
            headers=_token(buyer),
        )
        assert {c["company_name"] for c in searched.json()["data"]} == {"Indus Marine"}

        # Expiring the paid window removes the company from discovery.
        record = (
            db.query(ProfileVisibility)
            .filter(ProfileVisibility.profile_id == paid_profile.id)
            .first()
        )
        record.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()
        after = api.get(
            "/marketplace/companies?vendor_type=provider&category=Hull%20%26%20Underwater",
            headers=_token(buyer),
        )
        assert "Indus Marine" not in {c["company_name"] for c in after.json()["data"]}
        db.close()

    def test_company_profile_carries_declared_capabilities(self, api):
        db = TestingSessionLocal()
        _provider_category(db)
        buyer = _buyer(db)
        provider, profile = self._company(
            db,
            "Indus Marine",
            "Hull & Underwater",
            ["Underwater Hull Cleaning", "Propeller Polishing"],
        )
        profile.location_lat = 19.0760
        profile.location_lng = 72.8777
        db.commit()

        resp = api.get(f"/marketplace/companies/{profile.id}", headers=_token(buyer))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["company_name"] == "Indus Marine"
        assert body["primary_category"] == "Hull & Underwater"
        assert set(body["subcategories"]) == {"Underwater Hull Cleaning", "Propeller Polishing"}
        assert body["country"] == "India"
        assert body["head_office"] == "Mumbai Port"
        assert body["location"] == {"lat": 19.076, "lng": 72.8777}
        assert body["phone"] == "+91 90000 00000"

        # A company without paid visibility is not inspectable by a buyer.
        _, hidden = self._company(
            db, "Hidden Diving", "Hull & Underwater", ["Underwater Hull Cleaning"], visible=False
        )
        assert (
            api.get(f"/marketplace/companies/{hidden.id}", headers=_token(buyer)).status_code
            == 404
        )
        db.close()

    def test_legacy_company_listing_does_not_add_a_marketplace_category(self, api):
        """Profile → Main Category is the sole marketplace category.

        A legacy company's service rows still make it discoverable (legacy
        listing placement) and still show as capabilities on its own profile,
        but they must never file the company under a marketplace category: with
        no primary category it is listed under none — not under the category
        named on the Service row.
        """
        db = TestingSessionLocal()
        _provider_category(db)
        buyer = _buyer(db)
        provider = _user(db, UserRole.provider, "Legacy Marine", email_prefix="legacy")
        db.add(
            Service(
                provider_id=provider.id,
                name="Hydraulic Repairs",
                service_id="Hydraulic Repairs",
                category="Repairs & Maintenance",
                port_id="Mumbai Port",
                status=ServiceListingStatus.approved,
                is_active=True,
                expires_at=datetime.utcnow() + timedelta(days=10),
            )
        )
        db.commit()

        filtered = api.get(
            "/marketplace/companies?vendor_type=provider&category=Repairs%20%26%20Maintenance",
            headers=_token(buyer),
        )
        assert filtered.status_code == 200, filtered.text
        assert "Legacy Marine" not in {c["company_name"] for c in filtered.json()["data"]}

        # Still discoverable when browsing without a category filter, with the
        # listing shown as a capability rather than as its marketplace category.
        everything = api.get("/marketplace/companies?vendor_type=provider", headers=_token(buyer))
        assert everything.status_code == 200, everything.text
        cards = {c["company_name"]: c for c in everything.json()["data"]}
        assert "Legacy Marine" in cards
        assert cards["Legacy Marine"]["primary_category"] is None
        assert cards["Legacy Marine"]["categories"] == []
        assert "Hydraulic Repairs" in cards["Legacy Marine"]["subcategories"]
        db.close()

    def test_discovery_requires_authentication(self, api):
        resp = api.get("/marketplace/companies", params={"vendor_type": "provider"})
        assert resp.status_code in (401, 403)


class TestSecurity:
    """Authorization and payment-integrity checks on the new surface.

    The company-first endpoints must not become a way to read someone else's
    receipt, to reach admin actions, to self-approve a profile, or to publish a
    company without a verified payment.
    """

    def _vendor_with_payment(self, db, tmp_dir, status=ProfileVisibilityStatus.SUBMITTED):
        _provider_category(db)
        provider = _user(db, UserRole.provider, "Secure Marine", email_prefix="sec")
        _set_category(db, provider, "Hull & Underwater", ["Underwater Hull Cleaning"])
        profile = db.query(Profile).filter(Profile.user_id == provider.id).first()

        receipt = tmp_dir / "receipt.pdf"
        receipt.write_bytes(b"%PDF-1.4 receipt")
        payment = ProfileVisibility(
            profile_id=profile.id,
            owner_user_id=provider.id,
            plan=ProfileVisibilityPlan.monthly,
            period_days=30,
            base_amount_paise=100_000,
            gst_rate_percent=18,
            gst_amount_paise=18_000,
            total_amount_paise=118_000,
            utr=f"UTR{uuid.uuid4().hex[:10].upper()}",
            payment_date=datetime.utcnow(),
            receipt_path=str(receipt),
            receipt_filename="receipt.pdf",
            receipt_content_type="application/pdf",
            status=status,
            submitted_at=datetime.utcnow(),
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)
        return provider, profile, payment

    def test_receipt_is_private_to_owner_and_admin(self, api, tmp_path):
        db = TestingSessionLocal()
        owner, profile, payment = self._vendor_with_payment(db, tmp_path)
        stranger = _user(db, UserRole.provider, "Other Marine", email_prefix="other")
        admin = _user(db, UserRole.admin, "Nhaav Admin", email_prefix="admin")

        assert api.get(
            f"/profile-visibility/{payment.id}/receipt", headers=_token(stranger)
        ).status_code == 404
        assert api.get(
            f"/profile-visibility/{payment.id}/receipt", headers=_token(owner)
        ).status_code == 200
        assert api.get(
            f"/profile-visibility/{payment.id}/receipt", headers=_token(admin)
        ).status_code == 200
        db.close()

    def test_admin_visibility_actions_reject_non_admins(self, api, tmp_path):
        db = TestingSessionLocal()
        vendor, profile, payment = self._vendor_with_payment(db, tmp_path)
        headers = _token(vendor)

        assert api.get("/admin/profile-visibility", headers=headers).status_code == 403
        assert api.post(
            f"/admin/profile-visibility/{payment.id}/verify", headers=headers
        ).status_code == 403
        assert api.post(
            f"/admin/profile-visibility/{payment.id}/reject",
            json={"reason": "not mine"},
            headers=headers,
        ).status_code == 403
        assert api.post(
            f"/admin/companies/{profile.id}/category",
            json={"primary_category": "Hull & Underwater"},
            headers=headers,
        ).status_code == 403
        db.close()

    def test_payment_submission_rejects_wrong_amount_then_blocks_duplicates(
        self, api, tmp_path, monkeypatch
    ):
        monkeypatch.setattr(settings, "PAYMENT_RECEIPTS_DIR", str(tmp_path))
        db = TestingSessionLocal()
        _provider_category(db)
        vendor = _user(db, UserRole.provider, "Paying Marine", email_prefix="pay")
        _set_category(db, vendor, "Hull & Underwater", ["Underwater Hull Cleaning"])
        headers = _token(vendor)

        files = {"receipt": ("receipt.pdf", b"%PDF-1.4 paid", "application/pdf")}
        data = {
            "plan": "monthly",
            "utr": f"UTR{uuid.uuid4().hex[:10].upper()}",
            "payment_date": datetime.utcnow().isoformat(),
            "amount_paise": "1",
        }
        wrong = api.post("/profile-visibility/submit", data=data, files=files, headers=headers)
        assert wrong.status_code == 400, wrong.text
        assert "₹1,180" in wrong.text or "1,180" in wrong.text

        data["amount_paise"] = "118000"
        ok = api.post("/profile-visibility/submit", data=data, files=files, headers=headers)
        assert ok.status_code == 201, ok.text
        assert ok.json()["status"] == "SUBMITTED"
        assert ok.json()["total_amount_paise"] == 118_000

        again = api.post("/profile-visibility/submit", data=data, files=files, headers=headers)
        assert again.status_code == 409
        db.close()

    def test_profile_update_cannot_self_verify_or_self_grant_badge(self, api):
        db = TestingSessionLocal()
        _provider_category(db)
        vendor = _user(db, UserRole.provider, "Sneaky Marine", verified=False, email_prefix="sneak")
        resp = api.put(
            "/profiles/me",
            json={
                "primary_category": "Hull & Underwater",
                "subcategories": ["Underwater Hull Cleaning"],
                "verification_status": "verified",
                "badge_label": "Top Rated",
                "rating_avg": 5.0,
            },
            headers=_token(vendor),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["verification_status"] != "verified"
        assert body.get("badge_label") in (None, "")
        assert body["rating_avg"] == 0
        db.close()

    def test_verified_payment_cannot_be_verified_twice(self, api, tmp_path):
        db = TestingSessionLocal()
        _, profile, payment = self._vendor_with_payment(db, tmp_path)
        admin = _user(db, UserRole.admin, "Nhaav Admin", email_prefix="admin")
        profile.verification_status = VerificationStatus.verified
        db.commit()

        first = api.post(
            f"/admin/profile-visibility/{payment.id}/verify", headers=_token(admin)
        )
        assert first.status_code == 200, first.text
        second = api.post(
            f"/admin/profile-visibility/{payment.id}/verify", headers=_token(admin)
        )
        assert second.status_code == 409
        db.close()
