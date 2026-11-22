"""
Admin read-only access to every profile.

The admin console may READ any profile a client or vendor created, for oversight.
These tests pin the boundaries of that power:

  * every role's profile is listed (clients and vendors), with per-section counts;
  * filters (role, status, search) narrow the same data;
  * the detail view carries the business facts an admin needs and NOTHING that
    could be used as a credential (no password hash, tokens or private paths);
  * the surface is read-only: no PUT/PATCH/DELETE, and non-admins are refused.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.profile import Profile, VerificationStatus
from app.models.user import User, UserRole

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_admin_profiles.db"
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


def _account(db, role, company, status=VerificationStatus.pending, **profile_fields):
    user = User(
        email=f"{uuid.uuid4().hex[:8]}_{role.value}@nhaav.test",
        password_hash="not-a-real-hash",
        role=role,
        full_name=f"{company} Contact",
        phone="+91 90000 11111",
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    profile = Profile(
        user_id=user.id,
        company_name=company,
        verification_status=status,
        **profile_fields,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return user, profile


@pytest.fixture(scope="module")
def directory(api):
    """Ids and headers only — ORM objects would be detached once the session closes."""
    db = TestingSessionLocal()
    admin, _ = _account(db, UserRole.admin, "Nhaav Admin")
    client, client_profile = _account(db, UserRole.client, "Acme Shipping", **{
        "country": "India",
        "contacts": [{"name": "Port Captain", "email": "captain@acme.test", "phone": "+91 90000 22222"}],
    })
    provider, provider_profile = _account(
        db,
        UserRole.provider,
        "Indus Underwater",
        status=VerificationStatus.verified,
        head_office="Mumbai",
        country="India",
        ports_served=["Cochin", "Chennai"],
        service_areas=["West coast"],
    )
    supplier, supplier_profile = _account(
        db, UserRole.supplier, "Kandla Chandlers", status=VerificationStatus.rejected
    )
    data = {
        "admin_headers": _token(admin),
        "client_headers": _token(client),
        "provider_headers": _token(provider),
        "supplier_email": supplier.email,
        "client_profile_id": str(client_profile.id),
        "provider_profile_id": str(provider_profile.id),
        "supplier_profile_id": str(supplier_profile.id),
    }
    db.close()
    return data


class TestReadAccess:
    def test_admin_sees_every_client_and_vendor_profile(self, api, directory):
        resp = api.get("/admin/profiles", headers=directory["admin_headers"])
        assert resp.status_code == 200, resp.text
        body = resp.json()

        names = {row["company_name"] for row in body["data"]}
        assert {"Acme Shipping", "Indus Underwater", "Kandla Chandlers"} <= names
        # The admin's own account has no marketplace profile and is never listed.
        assert "Nhaav Admin" not in names

        counts = body["counts"]
        assert counts["client"] >= 1
        assert counts["vendor"] >= 2
        assert counts["all"] == counts["client"] + counts["vendor"]

    def test_role_and_status_filters_scope_the_directory(self, api, directory):
        headers = directory["admin_headers"]

        clients = api.get("/admin/profiles", params={"role": "client"}, headers=headers).json()
        assert {row["role"] for row in clients["data"]} == {"client"}

        vendors = api.get("/admin/profiles", params={"role": "vendor"}, headers=headers).json()
        assert {row["role"] for row in vendors["data"]} <= {"provider", "supplier"}
        assert "client" not in {row["role"] for row in vendors["data"]}

        rejected = api.get(
            "/admin/profiles", params={"verification_status": "rejected"}, headers=headers
        ).json()
        assert {row["verification_status"] for row in rejected["data"]} == {"rejected"}

        assert api.get(
            "/admin/profiles", params={"role": "nonsense"}, headers=headers
        ).status_code == 400

    def test_search_matches_company_and_email(self, api, directory):
        headers = directory["admin_headers"]
        by_company = api.get("/admin/profiles", params={"q": "indus"}, headers=headers).json()
        assert any(row["company_name"] == "Indus Underwater" for row in by_company["data"])

        email = directory["supplier_email"]
        by_email = api.get("/admin/profiles", params={"q": email}, headers=headers).json()
        assert {row["company_name"] for row in by_email["data"]} == {"Kandla Chandlers"}

    def test_detail_is_complete_but_carries_no_credentials(self, api, directory):
        headers = directory["admin_headers"]
        profile_id = directory["provider_profile_id"]
        resp = api.get(f"/admin/profiles/{profile_id}", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()

        assert body["company_name"] == "Indus Underwater"
        assert body["head_office"] == "Mumbai"
        assert body["ports_served"] == ["Cochin", "Chennai"]
        assert body["service_areas"] == ["West coast"]
        assert body["read_only"] is True

        # Nothing that acts as a credential or leaks private storage.
        text = resp.text.lower()
        for forbidden in ("password", "refresh_token", "access_token", "brochure_path"):
            assert forbidden not in text, forbidden
        assert body["brochure_filename"] is None

    def test_client_profile_detail_is_readable(self, api, directory):
        headers = directory["admin_headers"]
        resp = api.get(
            f"/admin/profiles/{directory['client_profile_id']}", headers=headers
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["role"] == "client"
        assert body["contacts"][0]["name"] == "Port Captain"

    def test_unknown_profile_is_404(self, api, directory):
        resp = api.get(f"/admin/profiles/{uuid.uuid4()}", headers=directory["admin_headers"])
        assert resp.status_code == 404


class TestReadOnlyBoundary:
    def test_only_admins_can_read_the_directory(self, api, directory):
        assert api.get("/admin/profiles").status_code in (401, 403)
        # A vendor is authenticated but not an admin.
        assert api.get(
            "/admin/profiles", headers=directory["provider_headers"]
        ).status_code == 403
        assert api.get(
            f"/admin/profiles/{directory['client_profile_id']}",
            headers=directory["client_headers"],
        ).status_code == 403

    def test_no_write_verbs_exist(self, api, directory):
        headers = directory["admin_headers"]
        target = f"/admin/profiles/{directory['client_profile_id']}"
        for method in ("PUT", "PATCH", "DELETE"):
            response = api.request(
                method, target, json={"company_name": "Hacked"}, headers=headers
            )
            assert response.status_code == 405, (method, response.status_code)

        # And the collection cannot be written either.
        for method in ("POST", "PUT", "DELETE"):
            response = api.request(method, "/admin/profiles", json={}, headers=headers)
            assert response.status_code == 405, (method, response.status_code)

    def test_reading_a_profile_does_not_change_it(self, api, directory):
        headers = directory["admin_headers"]
        profile_id = directory["supplier_profile_id"]
        before = api.get(f"/admin/profiles/{profile_id}", headers=headers).json()
        api.get(f"/admin/profiles/{profile_id}", headers=headers)
        after = api.get(f"/admin/profiles/{profile_id}", headers=headers).json()
        assert before["verification_status"] == after["verification_status"]
        assert before["company_name"] == after["company_name"]
