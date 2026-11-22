"""
H9 §C — admin verification honesty tests (per H9_FLOW_AUDIT.md §3a/§4 Phase C).

The admin verification endpoints used to manufacture trust data:

  - providers with ZERO scored documents got an invented average/max score of
    85.0, which then produced a fabricated "Low Risk (Clean Match)" badge;
  - the detail endpoint filled missing certifications with fake credentials
    ("ISO 9001:2026 Quality Management", "DNV GL Classification License");
  - missing positions got invented defaults ("Chief Engineer", "Maritime
    Provider") and the badge fell back to a hardcoded value.

The honest contract (now pinned): unavailable data is None/empty — never a
manufactured number, badge, or credential. `verification_score` is the legacy
field-COMPLETENESS percentage (H7) and must never be presented as OCR
accuracy.
"""
import io
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.models.profile import Profile
from app.models.document import Document, DocumentType, DocumentStatus
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_h9_admin_honesty.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


PROVIDER_EMAIL = "h9_provider@nhaav.com"
PROVIDER_PASSWORD = "Password123!"
ADMIN_EMAIL = "h9_admin@nhaav.com"
ADMIN_PASSWORD = "AdminPass123!"


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    try:
        # Provider with NO documents and NO score — the exact case that used
        # to receive the fabricated 85.0 average and "Clean Match" badge.
        provider = User(
            email=PROVIDER_EMAIL,
            password_hash=hash_password(PROVIDER_PASSWORD),
            role=UserRole.provider,
            full_name="H9 Honest Provider",
        )
        db.add(provider)
        db.flush()
        db.add(Profile(user_id=provider.id, company_name="H9 Marine Ltd", years_experience=3))
        db.commit()

        # The admin identity lives in the users table with role=admin; the
        # admin routes' _require_admin dependency reads get_current_user, so
        # overriding that lets the tests call the endpoints without a login.
        from app.middleware.auth_guard import get_current_user

        admin = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_PASSWORD),
            role=UserRole.admin,
            full_name="H9 Admin",
            is_verified=True,
        )
        db.add(admin)
        db.commit()
        # Detach the loaded instance so the dependency override can read its
        # attributes after this seeding session is closed (no expired-attrs).
        db.refresh(admin)
        db.expunge(admin)

        app.dependency_overrides[get_current_user] = lambda: admin
    finally:
        db.close()
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def _admin_list_providers():
    # get_current_user is dependency-overridden in the module fixture.
    res = client.get("/admin/verification/providers")
    assert res.status_code == 200, res.text
    return res.json()


class TestNoInventedScores:
    def test_provider_without_documents_gets_null_score_not_85(self):
        data = _admin_list_providers()["data"]
        target = [p for p in data if p["email"] == PROVIDER_EMAIL]
        assert target, "seeded provider missing from admin provider list"
        provider = target[0]
        assert provider["verification_score"] is None, (
            "Providers with no scored documents must get null, not an invented default (85.0)"
        )
        assert provider["max_score"] is None

    def test_provider_without_documents_gets_no_risk_claim(self):
        data = _admin_list_providers()["data"]
        provider = [p for p in data if p["email"] == PROVIDER_EMAIL][0]
        assert provider["risk_indicator"] is None
        assert provider["risk_level"] is None
        assert "Clean Match" not in (provider["risk_indicator"] or "")

    def test_banned_fabricated_defaults_absent_from_source(self):
        from pathlib import Path
        src = (Path(__file__).resolve().parents[1] / "app" / "routers" / "admin_verification.py").read_text(encoding="utf-8")
        assert "85.0" not in src, "fabricated default score must not return"
        assert "Clean Match" not in src, "fabricated risk badge must not return"
        assert "Chief Engineer" not in src, "invented position default must not return"
        assert "Maritime Provider" not in src, "invented position default must not return"
        assert "DNV GL Classification License" not in src, "fake certification fallback must not return"
        assert "ISO 9001" not in src, "fake certification fallback must not return"
        assert "Mismatch Detected" not in src, "fabricated mismatch claim has no detection source"


class TestNoFakeCredentials:
    def test_detail_certifications_empty_when_no_licenses(self):
        providers = _admin_list_providers()["data"]
        profile_id = [p for p in providers if p["email"] == PROVIDER_EMAIL][0]["id"]

        detail = client.get(f"/admin/verification/providers/{profile_id}").json()
        assert detail["certifications"] == [], (
            "Certifications must be the profile's real licenses (possibly empty), never fake credentials"
        )
        assert detail["position"] is None
        assert detail["badge_label"] is None
