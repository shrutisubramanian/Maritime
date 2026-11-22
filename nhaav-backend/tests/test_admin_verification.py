"""Admin verification endpoints — contract tests.

Admin identity lives in the ``users`` table with ``role = admin`` (there is no
separate admin credential store). The ``/admin/verification/*`` routes require
that role via their ``_require_admin`` dependency, which reads
``get_current_user``; these tests override that dependency to act as an admin
(and, for the denial case, as a non-admin).
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.middleware.auth_guard import get_current_user
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_admin_verification_api.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    db = TestingSessionLocal()
    try:
        provider = User(
            email="admin_verif_provider@example.com",
            password_hash=hash_password("Password123!"),
            role=UserRole.provider,
            full_name="Verif Provider",
            is_verified=True,
        )
        db.add(provider)
        db.flush()
        db.add(
            Profile(
                user_id=provider.id,
                company_name="Verif Co",
                verification_status=VerificationStatus.pending,
            )
        )
        admin = User(
            email="admin_verif_admin@example.com",
            password_hash=hash_password("Admin123!"),
            role=UserRole.admin,
            full_name="Verif Admin",
            is_verified=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        # Detach so the override can read attributes after this session closes.
        db.expunge(admin)
        admin_user = admin
    finally:
        db.close()

    previous_db = app.dependency_overrides.get(get_db)
    previous_user = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: admin_user
    yield
    for dep, prev in ((get_db, previous_db), (get_current_user, previous_user)):
        if prev is None:
            app.dependency_overrides.pop(dep, None)
        else:
            app.dependency_overrides[dep] = prev


client = TestClient(app)


class TestAdminVerificationAPI:
    def test_stats_returns_queue_counts(self):
        res = client.get("/admin/verification/stats")
        assert res.status_code == 200, res.text
        data = res.json()
        for key in ("pending", "approved", "under_review", "rejected"):
            assert key in data

    def test_providers_listing_has_data_and_total(self):
        res = client.get("/admin/verification/providers")
        assert res.status_code == 200, res.text
        body = res.json()
        assert "data" in body and "total" in body
        assert body["total"] >= 1

    def test_provider_detail_has_expected_fields(self):
        listing = client.get("/admin/verification/providers").json()["data"]
        assert listing, "expected at least one verifiable provider"
        profile_id = listing[0]["id"]
        res = client.get(f"/admin/verification/providers/{profile_id}")
        assert res.status_code == 200, res.text
        detail = res.json()
        assert "company_name" in detail
        assert "ocr_comparisons" in detail

    def test_non_admin_is_denied(self):
        """A signed-in client/provider must NOT reach the admin verification API."""
        client_user = User(
            email="admin_verif_client@example.com",
            password_hash=hash_password("Password123!"),
            role=UserRole.client,
            full_name="Verif Client",
            is_verified=True,
        )
        app.dependency_overrides[get_current_user] = lambda: client_user
        try:
            res = client.get("/admin/verification/stats")
            assert res.status_code == 403, res.text
        finally:
            # Restore the admin identity for any later test in this module.
            db = TestingSessionLocal()
            try:
                admin_user = (
                    db.query(User)
                    .filter(User.email == "admin_verif_admin@example.com")
                    .one()
                )
            finally:
                db.close()
            app.dependency_overrides[get_current_user] = lambda: admin_user
