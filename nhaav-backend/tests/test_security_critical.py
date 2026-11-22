"""
Regression tests for CRITICAL security fixes C1-C4.

C2 - Verification endpoints are admin-only:
  - unauthenticated request -> rejected (401)
  - client -> 403
  - provider (own document/profile and another provider's) -> 403
  - admin -> allowed

C3 - /documents/debug is removed and can never leak documents.

C4 - Uploaded files are no longer served from a public /uploads mount:
  - only the document owner (or an admin) can retrieve the stored file
  - cross-user access is rejected
  - deleting a document removes its stored file
  - normal upload + OCR extraction still works
"""
import io
import os
import sys
import time
import uuid
from unittest.mock import patch

import pytest
import docx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.models.document import Document, DocumentType, DocumentStatus
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_security_critical.db"
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


client = TestClient(app)

CLIENT_EMAIL = "sec_client@example.com"
PROVIDER_A_EMAIL = "sec_provider_a@example.com"
PROVIDER_B_EMAIL = "sec_provider_b@example.com"
ADMIN_EMAIL = "sec_admin@nhaavmaritime.com"
PASSWORD = "Password123!"
ADMIN_PASSWORD = "Admin@123"


def _db_session():
    return TestingSessionLocal()


def _add_user(email: str, role: UserRole) -> User:
    db = _db_session()
    try:
        user = User(email=email, password_hash=hash_password(PASSWORD), role=role, full_name=f"User {email}")
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def _add_profile(user_id) -> Profile:
    db = _db_session()
    try:
        profile = Profile(user_id=user_id, company_name=f"Co {user_id}", verification_status=VerificationStatus.pending)
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile
    finally:
        db.close()


def _add_document(user_id) -> Document:
    db = _db_session()
    try:
        doc = Document(
            user_id=user_id,
            document_type=DocumentType.vendor_registration,
            name="credential.pdf",
            file_url="uploads/unused-test-file.pdf",
            verification_status=DocumentStatus.pending,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return doc
    finally:
        db.close()


@pytest.fixture(scope="module")
def ctx():
    """Seed users/profiles/admin once and return ids + tokens."""
    client_user = _add_user(CLIENT_EMAIL, UserRole.client)
    provider_a = _add_user(PROVIDER_A_EMAIL, UserRole.provider)
    provider_b = _add_user(PROVIDER_B_EMAIL, UserRole.provider)

    profile_client = _add_profile(client_user.id)
    profile_a = _add_profile(provider_a.id)
    profile_b = _add_profile(provider_b.id)

    db = _db_session()
    try:
        admin = User(email=ADMIN_EMAIL, password_hash=hash_password(ADMIN_PASSWORD),
                     role=UserRole.admin, full_name="Sec Admin", is_verified=True)
        db.add(admin)
        db.commit()
        db.refresh(admin)
        admin_id = admin.id
    finally:
        db.close()

    def _user_token(email: str, password: str = PASSWORD) -> str:
        res = client.post("/auth/login", json={"email": email, "password": password})
        assert res.status_code == 200, f"Login failed for {email}: {res.text}"
        return res.json()["access_token"]

    def _admin_token() -> str:
        res = client.post("/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert res.status_code == 200, f"Admin login failed: {res.text}"
        return res.json()["access_token"]

    return {
        "client_id": str(client_user.id),
        "provider_a_id": str(provider_a.id),
        "provider_b_id": str(provider_b.id),
        "client_profile_id": str(profile_client.id),
        "provider_a_profile_id": str(profile_a.id),
        "provider_b_profile_id": str(profile_b.id),
        "admin_id": str(admin_id),
        "client_token": _user_token(CLIENT_EMAIL),
        "provider_a_token": _user_token(PROVIDER_A_EMAIL),
        "provider_b_token": _user_token(PROVIDER_B_EMAIL),
        "admin_token": _admin_token(),
    }


# ---------------------------------------------------------------------------
# C2 — PUT /documents/{id}/verify | /reject are admin-only
# ---------------------------------------------------------------------------


def test_c2_document_verify_unauthenticated_rejected(ctx):
    doc = _add_document(uuid.UUID(ctx["provider_a_id"]))
    # The shared client still holds the cookie from the fixture's login; a truly
    # anonymous caller has neither header nor cookie.
    client.cookies.clear()
    res = client.put(f"/documents/{doc.id}/verify")
    assert res.status_code == 401, f"Expected 401 for anonymous verify, got {res.status_code}: {res.text}"


def test_c2_document_verify_client_forbidden(ctx):
    doc = _add_document(uuid.UUID(ctx["provider_a_id"]))
    headers = {"Authorization": f"Bearer {ctx['client_token']}"}
    res = client.put(f"/documents/{doc.id}/verify", headers=headers)
    assert res.status_code == 403, f"Expected 403 for client, got {res.status_code}: {res.text}"


def test_c2_document_verify_provider_self_forbidden(ctx):
    """A provider must not be able to verify their own document."""
    doc = _add_document(uuid.UUID(ctx["provider_a_id"]))
    headers = {"Authorization": f"Bearer {ctx['provider_a_token']}"}
    res = client.put(f"/documents/{doc.id}/verify", headers=headers)
    assert res.status_code == 403, f"Expected 403 for self-verification, got {res.status_code}: {res.text}"


def test_c2_document_verify_provider_other_forbidden(ctx):
    """A provider must not be able to verify another provider's document."""
    doc = _add_document(uuid.UUID(ctx["provider_a_id"]))
    headers = {"Authorization": f"Bearer {ctx['provider_b_token']}"}
    res = client.put(f"/documents/{doc.id}/verify", headers=headers)
    assert res.status_code == 403, f"Expected 403 for cross-provider verify, got {res.status_code}: {res.text}"


def test_c2_document_verify_admin_allowed(ctx):
    doc = _add_document(uuid.UUID(ctx["provider_a_id"]))
    headers = {"Authorization": f"Bearer {ctx['admin_token']}"}
    res = client.put(f"/documents/{doc.id}/verify", headers=headers)
    assert res.status_code == 200, f"Expected 200 for admin verify, got {res.status_code}: {res.text}"
    assert res.json()["verification_status"] == "verified"


def test_c2_document_reject_admin_allowed_and_users_forbidden(ctx):
    doc = _add_document(uuid.UUID(ctx["provider_b_id"]))

    client.cookies.clear()  # no cookie, no header = anonymous
    res = client.put(f"/documents/{doc.id}/reject")
    assert res.status_code == 401

    headers = {"Authorization": f"Bearer {ctx['client_token']}"}
    res = client.put(f"/documents/{doc.id}/reject", headers=headers)
    assert res.status_code == 403, f"Expected 403 for client reject, got {res.status_code}: {res.text}"

    headers = {"Authorization": f"Bearer {ctx['admin_token']}"}
    # A rejection carries a reason (the account is shown it); without one the
    # admin request is refused by the service, not by the auth layer.
    missing_reason = client.put(f"/documents/{doc.id}/reject", headers=headers)
    assert missing_reason.status_code == 400, missing_reason.text

    res = client.put(
        f"/documents/{doc.id}/reject?reason=Illegible%20scan", headers=headers
    )
    assert res.status_code == 200, f"Expected 200 for admin reject, got {res.status_code}: {res.text}"
    assert res.json()["verification_status"] == "rejected"


# ---------------------------------------------------------------------------
# C2 — PUT /profiles/{profile_id}/verify is admin-only
# ---------------------------------------------------------------------------


def test_c2_profile_verify_unauthenticated_rejected(ctx):
    client.cookies.clear()  # no cookie, no header = anonymous
    res = client.put(f"/profiles/{ctx['provider_a_profile_id']}/verify")
    assert res.status_code == 401, f"Expected 401 for anonymous profile verify, got {res.status_code}: {res.text}"


def test_c2_profile_verify_client_forbidden(ctx):
    headers = {"Authorization": f"Bearer {ctx['client_token']}"}
    res = client.put(f"/profiles/{ctx['provider_a_profile_id']}/verify", headers=headers)
    assert res.status_code == 403, f"Expected 403 for client, got {res.status_code}: {res.text}"


def test_c2_profile_verify_provider_self_forbidden(ctx):
    """A provider must not be able to verify their own profile."""
    headers = {"Authorization": f"Bearer {ctx['provider_a_token']}"}
    res = client.put(f"/profiles/{ctx['provider_a_profile_id']}/verify", headers=headers)
    assert res.status_code == 403, f"Expected 403 for self profile verify, got {res.status_code}: {res.text}"


def test_c2_profile_verify_provider_other_forbidden(ctx):
    """A provider must not be able to verify another provider's profile."""
    headers = {"Authorization": f"Bearer {ctx['provider_b_token']}"}
    res = client.put(f"/profiles/{ctx['provider_a_profile_id']}/verify", headers=headers)
    assert res.status_code == 403, f"Expected 403 for cross-provider profile verify, got {res.status_code}: {res.text}"


def test_c2_profile_verify_admin_allowed(ctx):
    headers = {"Authorization": f"Bearer {ctx['admin_token']}"}
    res = client.put(f"/profiles/{ctx['provider_b_profile_id']}/verify", headers=headers)
    assert res.status_code == 200, f"Expected 200 for admin profile verify, got {res.status_code}: {res.text}"
    assert res.json()["verification_status"] == "verified"


# ---------------------------------------------------------------------------
# C3 — /documents/debug is removed
# ---------------------------------------------------------------------------


def test_c3_debug_endpoint_removed(ctx):
    # Anonymous callers must never reach a document dump.
    # 404 = route gone; 405 = no GET handler for the path — either way the
    # debug dump is unreachable and must never return document data.
    res = client.get("/documents/debug")
    assert res.status_code in (404, 405), f"Debug endpoint should be gone, got {res.status_code}"
    assert "ocr_extracted_data" not in res.text

    # Even an admin must not have a route that dumps every user's documents.
    headers = {"Authorization": f"Bearer {ctx['admin_token']}"}
    res = client.get("/documents/debug", headers=headers)
    assert res.status_code in (404, 405), f"Debug endpoint should be gone, got {res.status_code}"


# ---------------------------------------------------------------------------
# C4 — files are private; owner/admin-only retrieval; deletion removes file
# ---------------------------------------------------------------------------


def _make_vendor_docx_bytes() -> bytes:
    buf = io.BytesIO()
    document = docx.Document()
    document.add_paragraph("APPLICATION FOR VENDOR REGISTRATION")
    # VendorParser reads label-only lines (the layout of the real form); an
    # inline "Name of the Vendor: X" line is not a supported field layout.
    document.add_paragraph("Name of the Vendor")
    document.add_paragraph("Acme Marine Pvt Ltd")
    document.add_paragraph("Nationality: Indian")
    document.add_paragraph("c) Email: acme@example.com")
    document.add_paragraph("PAN: AAAAA1234F")
    document.add_paragraph("GSTIN: 27AAAAA0000A1Z5")
    document.save(buf)
    return buf.getvalue()


def _upload_document(token: str, data: bytes = None):
    """Upload a vendor docx. Returns the response; pass `data` to compare the
    exact bytes later (docx zip metadata embeds timestamps, so a second
    _make_vendor_docx_bytes() call may not be byte-identical)."""
    headers = {"Authorization": f"Bearer {token}"}
    return client.post(
        "/documents/upload",
        headers=headers,
        data={"document_type": "vendor_registration"},
        files={
            "file": (
                "vendor-registration.docx",
                data if data is not None else _make_vendor_docx_bytes(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )


def test_c4_upload_and_ocr_still_works(ctx):
    """Uploading a document still succeeds and OCR extraction runs.

    The upload response is a snapshot taken before the background task commits,
    so the extracted state is read back from the database. The background task
    opens its own ``SessionLocal``; in tests that must be the test database, not
    whatever ``.env`` points at (otherwise the task silently updates no row).
    """
    from app.services import document_service

    with patch.object(document_service, "SessionLocal", TestingSessionLocal):
        res = _upload_document(ctx["provider_a_token"])
    assert res.status_code == 200, f"Upload failed: {res.status_code} {res.text}"
    body = res.json()
    assert body["status"] == "success"
    document_payload = body["document"]
    assert document_payload["document_type"] == "vendor_registration"
    doc_id = document_payload["id"]

    deadline = time.time() + 5
    while True:
        db = _db_session()
        try:
            stored = db.query(Document).filter(Document.id == uuid.UUID(doc_id)).first()
            assert stored is not None, "Uploaded document row should exist"
            if stored.verification_status == DocumentStatus.extracted or time.time() >= deadline:
                break
        finally:
            db.close()
        time.sleep(0.05)

    assert stored.verification_status == DocumentStatus.extracted, (
        "OCR extraction should mark the document as extracted, "
        f"got {stored.verification_status}"
    )
    assert stored.verification_score is not None
    fields = (stored.ocr_extracted_data or {}).get("fields") or {}
    assert fields.get("vendor_name") == "Acme Marine Pvt Ltd", f"Expected extracted vendor name, got {fields}"
    assert fields.get("pan") == "AAAAA1234F", f"Expected extracted PAN, got {fields}"

    # Do not leave test documents in the real upload directory.
    client.delete(
        f"/documents/{doc_id}",
        headers={"Authorization": f"Bearer {ctx['provider_a_token']}"},
    )


def test_c4_uploads_static_route_removed(ctx):
    """The public /uploads static mount is gone."""
    res = client.get("/uploads/anything-random.pdf")
    assert res.status_code == 404, f"Public /uploads route should be removed, got {res.status_code}"


def test_c4_owner_can_access_own_file(ctx):
    expected = _make_vendor_docx_bytes()  # generate ONCE — zip timestamps make a second call non-identical
    res = _upload_document(ctx["provider_a_token"], data=expected)
    assert res.status_code == 200, f"Upload failed: {res.status_code} {res.text}"
    doc_id = res.json()["document"]["id"]

    headers = {"Authorization": f"Bearer {ctx['provider_a_token']}"}
    try:
        file_res = client.get(f"/documents/{doc_id}/file", headers=headers)
        assert file_res.status_code == 200, (
            f"Owner should access their file, got {file_res.status_code}: {file_res.text[:200]}"
        )
        import hashlib
        assert file_res.content == expected, (
            "Served file must match the uploaded content: "
            f"got {len(file_res.content)} bytes (sha256={hashlib.sha256(file_res.content).hexdigest()[:16]}), "
            f"expected {len(expected)} bytes (sha256={hashlib.sha256(expected).hexdigest()[:16]})"
        )
    finally:
        client.delete(f"/documents/{doc_id}", headers=headers)


def test_c4_cross_user_file_access_rejected(ctx):
    expected = _make_vendor_docx_bytes()  # generate ONCE — see test_c4_owner_can_access_own_file
    res = _upload_document(ctx["provider_a_token"], data=expected)
    assert res.status_code == 200
    doc_id = res.json()["document"]["id"]

    # Unauthenticated (clear the fixture's login cookie first: with a session
    # cookie the caller IS the owner, and a 200 would be correct).
    client.cookies.clear()
    assert client.get(f"/documents/{doc_id}/file").status_code == 401

    # Another provider
    other = {"Authorization": f"Bearer {ctx['provider_b_token']}"}
    assert client.get(f"/documents/{doc_id}/file", headers=other).status_code == 403

    # A client
    client_headers = {"Authorization": f"Bearer {ctx['client_token']}"}
    assert client.get(f"/documents/{doc_id}/file", headers=client_headers).status_code == 403

    # Admin can access through the dedicated admin endpoint
    admin_headers = {"Authorization": f"Bearer {ctx['admin_token']}"}
    admin_res = client.get(f"/admin/verification/documents/{doc_id}/file", headers=admin_headers)
    assert admin_res.status_code == 200, f"Admin should access the file, got {admin_res.status_code}"
    assert admin_res.content == expected

    # cleanup
    owner_headers = {"Authorization": f"Bearer {ctx['provider_a_token']}"}
    client.delete(f"/documents/{doc_id}", headers=owner_headers)


def test_c4_delete_removes_row_and_stored_file(ctx):
    res = _upload_document(ctx["provider_a_token"])
    assert res.status_code == 200
    body = res.json()["document"]
    doc_id = body["id"]
    storage_key = body["file_url"]
    # Storage is the configured local private directory (there is no object
    # storage backend in this codebase): <DOCUMENT_UPLOAD_DIR>/<uuid>_<name>.
    # The uuid prefix means two users uploading the same filename never collide,
    # and the path must stay inside the upload directory.
    from app.config import settings

    normalized = (storage_key or "").replace("\\", "/")
    upload_dir = settings.DOCUMENT_UPLOAD_DIR.replace("\\", "/").rstrip("/")
    assert normalized.startswith(upload_dir + "/"), (
        f"Expected a path under {upload_dir}/, got {storage_key!r}"
    )
    basename = os.path.basename(storage_key)
    prefix, _, original = basename.partition("_")
    uuid.UUID(prefix)  # raises ValueError unless a real generated UUID prefix
    assert original, f"Stored filename should keep the original name, got {basename!r}"
    assert ".." not in normalized.split("/"), "Stored path must not traverse directories"
    assert os.path.isfile(storage_key), "Uploaded file should exist on disk"

    owner_headers = {"Authorization": f"Bearer {ctx['provider_a_token']}"}
    del_res = client.delete(f"/documents/{doc_id}", headers=owner_headers)
    assert del_res.status_code == 200

    # Row is gone
    db = _db_session()
    try:
        row = db.query(Document).filter(Document.id == uuid.UUID(doc_id)).first()
        assert row is None, "Document row should be deleted"
    finally:
        db.close()

    # Stored object is gone and the endpoint 404s
    assert not os.path.exists(storage_key), "Stored file should be removed from disk"
    file_res = client.get(f"/documents/{doc_id}/file", headers=owner_headers)
    assert file_res.status_code == 404
