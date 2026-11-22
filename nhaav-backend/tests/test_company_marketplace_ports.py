"""
Head-office ports, "other ports" and the company brochure.

The rules these tests protect:

  * the port catalogue is real database state, seeded with the Indian seaport
    list, and an admin can add a missing port during verification;
  * a company's HEAD OFFICE must be a catalogue port, and it is stored in its
    canonical form no matter how it was typed;
  * the marketplace port filter matches HEAD OFFICE ONLY — the other ports a
    company works in are profile information and never create extra discovery
    entries;
  * a brochure is a PDF of at most 15 MB, and it is served only while the
    company is still discoverable.
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
from app.models.service_category import ServiceCategory
from app.models.user import User, UserRole
from app.services.port_catalogue_service import DEFAULT_PORTS
from entitlement_helpers import grant_marketplace_access

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_company_marketplace_ports.db"
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
    buyer = _user(db, UserRole.client, "Port Buyer", email_prefix="client")
    grant_marketplace_access(db, buyer)
    return buyer


def _provider(db, company, head_office=None, other_ports=None, verified=True, paid=True):
    user = _user(db, UserRole.provider, company, verified=verified, email_prefix="vendor")
    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    profile.head_office = head_office
    profile.ports_served = other_ports or []
    db.commit()
    if paid:
        now = datetime.utcnow()
        db.add(
            ProfileVisibility(
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
                receipt_path="uploads/payment_receipts/test.pdf",
                receipt_filename="test.pdf",
                status=ProfileVisibilityStatus.VERIFIED,
                starts_at=now,
                expires_at=now + timedelta(days=30),
            )
        )
        db.commit()
    return user, profile


def _seed_category(db):
    if db.query(ServiceCategory).filter(ServiceCategory.name == "Underwater Hull Cleaning").first() is None:
        db.add(ServiceCategory(name="Underwater Hull Cleaning", category_group="Hull & Underwater"))
        db.commit()


class TestPortCatalogue:
    def test_catalogue_is_seeded_with_the_indian_seaport_list(self, api):
        db = TestingSessionLocal()
        buyer = _buyer(db)
        resp = api.get("/ports", headers=_token(buyer))
        db.close()

        assert resp.status_code == 200
        names = {row["name"] for row in resp.json()["data"]}
        # Ports from the reference map, including the intermediate ones that
        # were missing before this change.
        for expected in (
            "Kandla", "Mumbai", "JNPT", "Mormugao", "New Mangalore", "Cochin",
            "Tuticorin", "Chennai", "Ennore", "Visakhapatnam", "Paradip", "Haldia",
            "Okha", "Bhavnagar", "Bharuch", "Surat", "Veraval", "Ratnagiri",
            "Kozhikode", "Alappuzha", "Karaikal", "Nagapattinam", "Machilipatnam",
        ):
            assert expected in names, expected

    def test_every_default_port_is_unique(self):
        names = [row[0].strip().lower() for row in DEFAULT_PORTS]
        assert len(names) == len(set(names))

    def test_ports_endpoint_requires_authentication(self, api):
        assert api.get("/ports").status_code in (401, 403)

    def test_only_an_admin_can_add_a_port(self, api):
        db = TestingSessionLocal()
        vendor, _ = _provider(db, "No Port Rights Ltd", head_office="Mumbai", paid=False)
        payload = {"name": "Kollam", "state": "Kerala"}
        assert api.post("/ports", json=payload, headers=_token(vendor)).status_code == 403

        admin = _user(db, UserRole.admin, "Nhaav Admin", email_prefix="admin")
        headers = _token(admin)
        created = api.post("/ports", json=payload, headers=headers)
        assert created.status_code == 201, created.text
        assert created.json()["name"] == "Kollam"

        # Duplicates (including an alias of an existing port) are refused.
        assert api.post("/ports", json=payload, headers=headers).status_code == 409
        assert (
            api.post("/ports", json={"name": "Nhava Sheva"}, headers=headers).status_code
            == 409
        )
        # And the new port is immediately selectable by vendors.
        listed = api.get("/ports", headers=headers).json()["data"]
        assert "Kollam" in {row["name"] for row in listed}
        db.close()


class TestVendorHeadOffice:
    def test_head_office_is_canonicalised_from_any_alias(self, api):
        db = TestingSessionLocal()
        vendor, profile = _provider(db, "Alias Marine", paid=False)
        headers = _token(vendor)

        resp = api.put("/profiles/me", json={"head_office": "nhava sheva"}, headers=headers)
        assert resp.status_code == 200, resp.text
        db.refresh(profile)
        assert profile.head_office == "JNPT"

        # An update to the other ports canonicalises and de-duplicates them too.
        resp = api.put(
            "/profiles/me",
            json={"ports_served": ["cochin", "Kochi", "Chennai", ""]},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        db.refresh(profile)
        assert profile.ports_served == ["Cochin", "Chennai"]
        db.close()

    def test_unknown_head_office_is_refused(self, api):
        db = TestingSessionLocal()
        vendor, profile = _provider(db, "Wrong Port Ltd", head_office="Mumbai", paid=False)
        resp = api.put(
            "/profiles/me",
            json={"head_office": "Atlantis Deep Harbour"},
            headers=_token(vendor),
        )
        assert resp.status_code == 400
        assert resp.json()["detail"]["code"] == "unknown_port"
        db.refresh(profile)
        assert profile.head_office == "Mumbai"  # unchanged
        db.close()


class TestMarketplacePortFilter:
    def test_filter_uses_head_office_only(self, api):
        db = TestingSessionLocal()
        _seed_category(db)
        buyer = _buyer(db)
        vendor, profile = _provider(
            db,
            "Based In Mumbai Marine",
            head_office="Mumbai",
            other_ports=["Cochin", "Chennai", "Visakhapatnam"],
        )
        # Give it a live capability so nothing else filters it out.
        resp = api.put(
            "/profiles/me",
            json={
                "primary_category": "Hull & Underwater",
                "subcategories": ["Underwater Hull Cleaning"],
            },
            headers=_token(vendor),
        )
        assert resp.status_code == 200, resp.text

        headers = _token(buyer)

        def names(port):
            result = api.get(
                "/marketplace/companies",
                params={"vendor_type": "provider", "port": port, "limit": 50},
                headers=headers,
            )
            assert result.status_code == 200, result.text
            return {card["company_name"] for card in result.json()["data"]}

        assert "Based In Mumbai Marine" in names("Mumbai")
        # The other ports it merely works in must NOT surface the company.
        for other in ("Cochin", "Chennai", "Visakhapatnam"):
            assert "Based In Mumbai Marine" not in names(other), other

        # And the profile itself still advertises the wider coverage.
        cards = api.get(
            "/marketplace/companies",
            params={"vendor_type": "provider", "port": "Mumbai"},
            headers=headers,
        ).json()["data"]
        card = next(c for c in cards if c["company_name"] == "Based In Mumbai Marine")
        assert card["head_office"] == "Mumbai"
        assert set(card["ports"]) == {"Cochin", "Chennai", "Visakhapatnam"}
        db.close()


PDF_MIN = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


class TestCompanyBrochure:
    def _upload(self, api, user, content, filename="brochure.pdf", content_type="application/pdf"):
        return api.put(
            "/profiles/me/brochure",
            files={"file": (filename, content, content_type)},
            headers=_token(user),
        )

    def test_only_pdf_under_the_limit_is_accepted(self, api, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "PROFILE_BROCHURE_DIR", str(tmp_path))
        monkeypatch.setattr(settings, "PROFILE_BROCHURE_MAX_BYTES", 1024)
        db = TestingSessionLocal()
        vendor, profile = _provider(db, "Brochure Marine", head_office="Mumbai", paid=False)

        not_pdf = self._upload(api, vendor, b"<html>not a pdf</html>", "brochure.pdf")
        assert not_pdf.status_code == 400
        assert not_pdf.json()["detail"]["code"] == "brochure_not_a_pdf"

        wrong_type = self._upload(api, vendor, PDF_MIN, "notes.txt", "text/plain")
        assert wrong_type.status_code == 400
        assert wrong_type.json()["detail"]["code"] == "brochure_must_be_pdf"

        too_big = self._upload(api, vendor, PDF_MIN + b"x" * 2000)
        assert too_big.status_code == 413
        assert too_big.json()["detail"]["code"] == "brochure_too_large"

        ok = self._upload(api, vendor, PDF_MIN)
        assert ok.status_code == 200, ok.text
        assert ok.json()["status"] == "success"
        assert ok.json()["brochure"]["filename"] == "brochure.pdf"
        db.refresh(profile)
        assert profile.brochure_path and profile.brochure_path.endswith(".pdf")
        assert profile.brochure_size_bytes == len(PDF_MIN)

        # Replacing keeps exactly one file on disk.
        second = self._upload(api, vendor, PDF_MIN, "brochure-v2.pdf")
        assert second.status_code == 200, second.text
        assert len([p for p in tmp_path.iterdir() if p.is_file()]) == 1

        removed = api.delete("/profiles/me/brochure", headers=_token(vendor))
        assert removed.status_code == 200
        db.refresh(profile)
        assert profile.brochure_path is None
        db.close()

    def test_clients_cannot_attach_a_company_brochure(self, api):
        db = TestingSessionLocal()
        client = _buyer(db)
        resp = self._upload(api, client, PDF_MIN)
        assert resp.status_code == 403
        db.close()

    def test_download_requires_discovery(self, api, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "PROFILE_BROCHURE_DIR", str(tmp_path))
        db = TestingSessionLocal()
        buyer = _buyer(db)
        # Approved and paid: the buyer can download it.
        listed_vendor, listed_profile = _provider(
            db, "Listed Brochure Co", head_office="Mumbai", paid=True
        )
        assert self._upload(api, listed_vendor, PDF_MIN).status_code == 200

        # Verified but NOT paid: not discoverable, so no download even with the id.
        unlisted_vendor, unlisted_profile = _provider(
            db, "Unlisted Brochure Co", head_office="Mumbai", paid=False
        )
        assert self._upload(api, unlisted_vendor, PDF_MIN).status_code == 200

        headers = _token(buyer)
        ok = api.get(f"/marketplace/companies/{listed_profile.id}/brochure", headers=headers)
        assert ok.status_code == 200
        assert ok.content.startswith(b"%PDF-")

        blocked = api.get(
            f"/marketplace/companies/{unlisted_profile.id}/brochure", headers=headers
        )
        assert blocked.status_code == 404

        anonymous = api.get(f"/marketplace/companies/{listed_profile.id}/brochure")
        assert anonymous.status_code in (401, 403)
        db.close()

    def test_company_profile_exposes_brochure_metadata_only(self, api, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "PROFILE_BROCHURE_DIR", str(tmp_path))
        db = TestingSessionLocal()
        buyer = _buyer(db)
        vendor, profile = _provider(db, "Meta Brochure Co", head_office="Kandla", paid=True)
        assert self._upload(api, vendor, PDF_MIN).status_code == 200

        resp = api.get(
            f"/marketplace/companies/{profile.id}", headers=_token(buyer)
        )
        assert resp.status_code == 200, resp.text
        brochure = resp.json()["brochure"]
        assert brochure["filename"] == "brochure.pdf"
        assert brochure["download_url"].endswith(f"/marketplace/companies/{profile.id}/brochure")
        # Never the storage path.
        assert "path" not in brochure
        db.close()
