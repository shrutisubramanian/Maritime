"""Regression tests for the /admin/verification API and the secured
profile/document verification endpoints.

Pins:
  * anonymous  -> 401
  * non-admin  -> 403
  * admin      -> can list, approve, reject (profile + document)
  * rejection never yields a verified status
  * the verifier identity is stored on documents
  * document files are admin-only
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_admin_verification_api.db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest
from fastapi.testclient import TestClient
import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.document import Document, DocumentStatus, DocumentType
from app.models.profile import Profile, VerificationStatus
from app.models.user import User, UserRole

_DB_URL = "sqlite:///./test_admin_verification_api.db"
engine = create_engine(_DB_URL, connect_args={"check_same_thread": False, "timeout": 30})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _isolate_db():
    app.dependency_overrides[get_db] = _override_get_db
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def _auth(user_id: str) -> dict:
    token = jwt.encode(
        {"sub": str(user_id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def seeded():
    db = TestingSessionLocal()
    admin = User(email="admin@x.io", password_hash="x", role=UserRole.admin)
    provider = User(
        email="provider@x.io", password_hash="x", role=UserRole.provider, full_name="Capt A"
    )
    db.add_all([admin, provider])
    db.commit()
    profile = Profile(
        user_id=provider.id,
        company_name="Acme Marine",
        verification_status=VerificationStatus.pending,
    )
    document = Document(
        user_id=provider.id,
        document_type=DocumentType.kyc_due_diligence,
        name="kyc.pdf",
        file_url="uploads/does-not-exist.pdf",
        verification_status=DocumentStatus.pending,
    )
    db.add_all([profile, document])
    db.commit()
    ctx = {
        "admin_id": str(admin.id),
        "provider_id": str(provider.id),
        "profile_id": str(profile.id),
        "document_id": str(document.id),
    }
    db.close()
    return ctx


# --------------------------------------------------------------- authorization
def test_anonymous_is_rejected(seeded):
    assert client.get("/admin/verification/stats").status_code == 401
    assert client.get("/admin/verification/providers").status_code == 401
    assert client.get("/admin/verification/documents").status_code == 401
    assert client.post(
        f"/admin/verification/providers/{seeded['profile_id']}/action", json={"action": "approve"}
    ).status_code == 401
    assert client.post(
        f"/admin/verification/documents/{seeded['document_id']}/action", json={"action": "approve"}
    ).status_code == 401
    assert client.get(
        f"/admin/verification/documents/{seeded['document_id']}/file"
    ).status_code == 401


def test_non_admin_is_forbidden(seeded):
    headers = _auth(seeded["provider_id"])
    assert client.get("/admin/verification/stats", headers=headers).status_code == 403
    assert client.get("/admin/verification/providers", headers=headers).status_code == 403
    assert client.get("/admin/verification/documents", headers=headers).status_code == 403
    assert client.get(
        f"/admin/verification/providers/{seeded['profile_id']}", headers=headers
    ).status_code == 403
    assert client.post(
        f"/admin/verification/providers/{seeded['profile_id']}/action",
        json={"action": "approve"},
        headers=headers,
    ).status_code == 403


# ------------------------------------------------------------------- lifecycle
def test_admin_stats_and_listing(seeded):
    headers = _auth(seeded["admin_id"])
    stats = client.get("/admin/verification/stats", headers=headers).json()
    assert stats["pending"] == 1 and stats["approved"] == 0 and stats["total"] == 1

    listing = client.get("/admin/verification/providers", headers=headers).json()
    assert listing["total"] == 1
    assert listing["data"][0]["company_name"] == "Acme Marine"


def test_admin_document_register_shows_sender_and_status(seeded):
    headers = _auth(seeded["admin_id"])
    resp = client.get("/admin/verification/documents", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1

    item = body["data"][0]
    assert item["id"] == seeded["document_id"]
    assert item["name"] == "kyc.pdf"
    assert item["verification_status"] == "pending"
    assert item["uploader"]["email"] == "provider@x.io"
    assert item["uploader"]["full_name"] == "Capt A"
    assert item["uploader"]["company_name"] == "Acme Marine"
    assert item["uploader"]["role"] == "provider"
    assert body["counts"]["pending"] == 1


def test_admin_document_register_tracks_review_and_filters(seeded):
    headers = _auth(seeded["admin_id"])
    rejected = client.post(
        f"/admin/verification/documents/{seeded['document_id']}/action",
        json={"action": "reject", "reason": "Illegible scan"},
        headers=headers,
    )
    assert rejected.status_code == 200, rejected.text

    resp = client.get(
        "/admin/verification/documents",
        params={"status": "rejected", "q": "Acme"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["counts"]["rejected"] == 1
    item = body["data"][0]
    assert item["verification_status"] == "rejected"
    assert item["reviewed_at"] is not None


def test_admin_approve_provider_marks_verified(seeded):
    """Vendor approval is document-only: no platform fee and no passes.

    Suppliers and service providers have no usage passes and no session time
    limit. What they pay for is listing showcase time, verified separately in
    the listing-fee queue (tests/test_vendor_showcase.py).
    """
    headers = _auth(seeded["admin_id"])
    resp = client.post(
        f"/admin/verification/providers/{seeded['profile_id']}/action",
        json={"action": "approve"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["passes_granted"] is None

    db = TestingSessionLocal()
    profile = db.query(Profile).filter(Profile.id == uuid.UUID(seeded["profile_id"])).first()
    assert profile.verification_status == VerificationStatus.verified
    db.close()


def test_admin_reject_provider_records_reason(seeded):
    headers = _auth(seeded["admin_id"])
    resp = client.post(
        f"/admin/verification/providers/{seeded['profile_id']}/action",
        json={"action": "reject", "reason": "Tax ID missing"},
        headers=headers,
    )
    assert resp.status_code == 200

    db = TestingSessionLocal()
    profile = db.query(Profile).filter(Profile.id == uuid.UUID(seeded["profile_id"])).first()
    assert profile.verification_status == VerificationStatus.rejected
    assert (profile.profile_metadata or {}).get("verification_reason") == "Tax ID missing"
    db.close()


def test_admin_reject_document_stores_verifier(seeded):
    headers = _auth(seeded["admin_id"])

    # A rejection carries a reason; the reviewer's note is what the account is
    # shown, so the server refuses one without it.
    refused = client.post(
        f"/admin/verification/documents/{seeded['document_id']}/action",
        json={"action": "reject"},
        headers=headers,
    )
    assert refused.status_code == 422

    resp = client.post(
        f"/admin/verification/documents/{seeded['document_id']}/action",
        json={"action": "reject", "reason": "Illegible scan"},
        headers=headers,
    )
    assert resp.status_code == 200

    db = TestingSessionLocal()
    document = db.query(Document).filter(Document.id == uuid.UUID(seeded["document_id"])).first()
    assert document.verification_status == DocumentStatus.rejected
    assert str(document.verified_by) == seeded["admin_id"]
    assert document.verified_at is not None
    db.close()


def test_document_file_is_admin_only(seeded):
    # Anonymous / non-admin never reach the file; admin gets 404 only because the
    # fixture points at a path that does not exist on disk.
    assert client.get(
        f"/admin/verification/documents/{seeded['document_id']}/file"
    ).status_code == 401
    assert client.get(
        f"/admin/verification/documents/{seeded['document_id']}/file",
        headers=_auth(seeded["provider_id"]),
    ).status_code == 403
    assert client.get(
        f"/admin/verification/documents/{seeded['document_id']}/file",
        headers=_auth(seeded["admin_id"]),
    ).status_code == 404


# ------------------------------------------- secured verify endpoints (parity)
def test_document_verify_endpoint_requires_admin(seeded):
    path = f"/documents/{seeded['document_id']}/verify"
    assert client.put(path).status_code == 401
    assert client.put(path, headers=_auth(seeded["provider_id"])).status_code == 403
    assert client.put(path, headers=_auth(seeded["admin_id"])).status_code == 200


def test_profile_verify_endpoint_requires_admin(seeded):
    path = f"/profiles/{seeded['profile_id']}/verify"
    assert client.put(path).status_code == 401
    assert client.put(path, headers=_auth(seeded["provider_id"])).status_code == 403
    assert client.put(path, headers=_auth(seeded["admin_id"])).status_code == 200
