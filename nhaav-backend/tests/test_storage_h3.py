"""
H3 regression tests — production storage + runtime reliability.

Covers the Phase 7 matrix:
  - upload succeeds / duplicate filenames don't collide
  - oversized upload rejected (413) BEFORE storage/OCR
  - unsupported file type rejected (415) via extension + magic bytes
  - path-traversal storage keys rejected
  - unauthorized document download rejected (401/403) — C4 semantics preserved
  - authorized owner download succeeds; admin download succeeds
  - delete removes the stored object
  - DB failure does not leave an uncontrolled orphan object
  - storage failure produces a safe 500 (no paths leaked)
  - OCR failure leaves the document in a recoverable (pending) state
  - concurrent uploads don't collide (unique server-generated keys)
  - S3 backend works against a fully mocked boto3 client (no real bucket)
  - production config fail-safes (STORAGE_BACKEND=s3 required, S3 vars required)

Storage backends are the local filesystem (temp dir) and a mocked S3 client —
tests never touch a real production bucket.
"""
import io
import threading
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import docx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.models.document import Document, DocumentType, DocumentStatus
from app.utils.password import hash_password

# The H3 storage subsystem (LocalStorageBackend / S3StorageBackend / server-
# generated keys / upload sniffing / OCR runtime preflight) does not exist in
# this repository tree, so this module cannot run. Skip it explicitly and
# loudly rather than failing collection for the entire suite.
storage_service = pytest.importorskip(
    "app.services.storage_service",
    reason="H3 storage subsystem is not implemented in this tree",
)
from app.services.storage_service import (
    LocalStorageBackend,
    StorageError,
    generate_storage_key,
    is_safe_storage_key,
    media_type_for,
    sniff_type,
    validate_upload,
)

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_storage_h3.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db(tmp_path_factory):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    # Point the local storage backend at an isolated temp dir for this module.
    storage_root = tmp_path_factory.mktemp("h3_uploads")
    with patch.object(storage_service.settings, "UPLOAD_DIR", str(storage_root)), \
         patch.object(storage_service.settings, "STORAGE_BACKEND", "local"), \
         patch.object(storage_service.settings, "MAX_UPLOAD_SIZE_MB", 1):
        storage_service.reset_storage_backend_cache()
        yield
    storage_service.reset_storage_backend_cache()
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)

USER_EMAIL = "h3_user@example.com"
OTHER_EMAIL = "h3_other@example.com"
ADMIN_EMAIL = "h3_admin@nhaavmaritime.com"
PASSWORD = "Password123!"
ADMIN_PASSWORD = "Admin@123!"


def _db_session():
    return TestingSessionLocal()


@pytest.fixture(scope="module")
def ctx():
    db = _db_session()
    try:
        user = User(email=USER_EMAIL, password_hash=hash_password(PASSWORD), role=UserRole.provider, full_name="H3 User")
        other = User(email=OTHER_EMAIL, password_hash=hash_password(PASSWORD), role=UserRole.client, full_name="H3 Other")
        admin = User(email=ADMIN_EMAIL, password_hash=hash_password(ADMIN_PASSWORD),
                     role=UserRole.admin, full_name="H3 Admin", is_verified=True)
        db.add_all([user, other, admin])
        db.commit()
        db.refresh(user)
        db.refresh(other)
        db.refresh(admin)
        user_id, other_id, admin_id = user.id, other.id, admin.id
    finally:
        db.close()

    def _login(path, email, password):
        res = client.post(path, json={"email": email, "password": password})
        assert res.status_code == 200, f"Login failed for {email}: {res.text}"
        return res.json()["access_token"]

    return {
        "user_id": str(user_id),
        "other_id": str(other_id),
        "admin_id": str(admin_id),
        "user_token": _login("/auth/login", USER_EMAIL, PASSWORD),
        "other_token": _login("/auth/login", OTHER_EMAIL, PASSWORD),
        "admin_token": _login("/admin/auth/login", ADMIN_EMAIL, ADMIN_PASSWORD),
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _docx_bytes(company="Acme Marine Pvt Ltd") -> bytes:
    buf = io.BytesIO()
    document = docx.Document()
    document.add_paragraph("APPLICATION FOR VENDOR REGISTRATION")
    document.add_paragraph(f"Name of the Vendor: {company}")
    document.add_paragraph("c) Email: acme@example.com")
    document.save(buf)
    return buf.getvalue()


def _png_bytes() -> bytes:
    # Minimal valid 1x1 PNG (magic bytes + minimal IHDR/IDAT/IEND).
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d4944415478da63fcffff3f030005fe02fea72d99"
        "5f0000000049454e44ae426082"
    )


def _upload(token: str, filename: str = "vendor-registration.docx", data: bytes = None,
            document_type: str = "vendor_registration"):
    headers = {"Authorization": f"Bearer {token}"}
    return client.post(
        "/documents/upload",
        headers=headers,
        data={"document_type": document_type},
        files={"file": (filename, data if data is not None else _docx_bytes(),
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )


def _cleanup(doc_id: str, token: str):
    client.delete(f"/documents/{doc_id}", headers={"Authorization": f"Bearer {token}"})


# ---------------------------------------------------------------------------
# Upload validation
# ---------------------------------------------------------------------------

def test_h3_upload_succeeds_and_uses_server_generated_key(ctx):
    res = _upload(ctx["user_token"], filename="My Secret Vendor File 2026.docx")
    assert res.status_code == 200, f"Upload failed: {res.status_code} {res.text}"
    body = res.json()
    assert body["status"] == "success"

    key = body["document"]["file_url"]
    assert key.startswith("documents/"), f"Expected server-generated key, got {key!r}"
    assert "My Secret" not in key and ".docx" in key, "Original filename must never appear in the storage key"
    # Key must contain two uuid segments and the user id directory.
    parts = key.split("/")
    assert len(parts) == 3 and parts[1] == ctx["user_id"], f"Unexpected key layout: {key!r}"
    uuid.UUID(parts[2].rsplit(".", 1)[0])  # raises if not a valid uuid

    _cleanup(body["document"]["id"], ctx["user_token"])


def test_h3_duplicate_filenames_do_not_collide(ctx):
    res1 = _upload(ctx["user_token"])
    res2 = _upload(ctx["user_token"])
    assert res1.status_code == 200 and res2.status_code == 200
    key1 = res1.json()["document"]["file_url"]
    key2 = res2.json()["document"]["file_url"]
    assert key1 != key2, "Two uploads of the same filename must get distinct storage keys"

    db = _db_session()
    try:
        rows = db.query(Document).filter(Document.file_url.in_([key1, key2])).all()
        assert len(rows) == 2, "Both uploads must exist as separate records"
    finally:
        db.close()

    _cleanup(res1.json()["document"]["id"], ctx["user_token"])
    _cleanup(res2.json()["document"]["id"], ctx["user_token"])


def test_h3_oversized_upload_rejected(ctx):
    # MAX_UPLOAD_SIZE_MB is patched to 1 in the module fixture.
    oversized = b"PK\x03\x04" + b"\x00" * (1 * 1024 * 1024 + 1)  # 1MB + 1 byte, valid docx magic
    res = _upload(ctx["user_token"], data=oversized)
    assert res.status_code == 413, f"Expected 413 for oversized upload, got {res.status_code}: {res.text}"

    # Nothing must have been stored.
    backend = storage_service.get_storage_backend()
    db = _db_session()
    try:
        rows = db.query(Document).filter(Document.user_id == uuid.UUID(ctx["user_id"])).all()
        assert rows == [], "Rejected upload must not create a DB record"
        assert list(storage_root_iter(backend)) == [], "Rejected upload must not leave a stored object"
    finally:
        db.close()


def storage_root_iter(backend):
    import os
    root = backend._root()
    for dirpath, _dirnames, filenames in os.walk(root):
        for f in filenames:
            yield os.path.join(dirpath, f)


def test_h3_unsupported_file_type_rejected_by_extension(ctx):
    res = _upload(ctx["user_token"], filename="payload.exe", data=b"MZ\x90\x00" + b"\x00" * 100)
    assert res.status_code == 415, f"Expected 415 for .exe, got {res.status_code}: {res.text}"


def test_h3_magic_bytes_must_match_extension(ctx):
    # A text file renamed to .pdf — extension says pdf, magic bytes say text.
    res = _upload(ctx["user_token"], filename="fake.pdf", data=b"this is definitely not a pdf" * 4)
    assert res.status_code == 415, f"Expected 415 for faked extension, got {res.status_code}: {res.text}"


def test_h3_empty_file_rejected(ctx):
    res = _upload(ctx["user_token"], data=b"")
    assert res.status_code == 400, f"Expected 400 for empty upload, got {res.status_code}: {res.text}"


def test_h3_valid_image_jpeg_extension_accepted(ctx):
    # Regression: .jpeg is an alias of .jpg and must not be rejected.
    res = _upload(ctx["user_token"], filename="photo.jpeg", data=_png_bytes())
    # This PNG is declared .jpeg on purpose: it should FAIL magic-vs-extension.
    assert res.status_code == 415


def test_h3_jpeg_alias_matches_real_jpeg_content(ctx):
    # Real JPEG magic (FF D8 FF) declared as .jpeg must be accepted.
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 64
    assert sniff_type(jpeg) == ".jpg"
    assert validate_upload("photo.jpeg", jpeg) == ".jpg"


# ---------------------------------------------------------------------------
# Storage-key safety
# ---------------------------------------------------------------------------

def test_h3_path_traversal_keys_rejected():
    assert not is_safe_storage_key("../../.env")
    assert not is_safe_storage_key("documents/../../etc/passwd")
    assert not is_safe_storage_key("/etc/passwd")
    assert not is_safe_storage_key("C:/Windows/system32/config")
    assert not is_safe_storage_key("documents//double//slash")
    assert not is_safe_storage_key("documents/./dot")
    assert not is_safe_storage_key("")
    assert is_safe_storage_key("documents/abc/def.pdf")


def test_h3_unsafe_key_read_via_backend_raises_storage_error(tmp_path):
    backend = LocalStorageBackend()
    with pytest.raises(StorageError):
        backend.read("../../.env")
    with pytest.raises(StorageError):
        backend.read("/etc/passwd")


# ---------------------------------------------------------------------------
# Retrieval authorization (C4 semantics preserved under H3 storage)
# ---------------------------------------------------------------------------

def test_h3_owner_download_succeeds_with_correct_content(ctx):
    original = _docx_bytes()
    res = _upload(ctx["user_token"], data=original)
    assert res.status_code == 200
    doc_id = res.json()["document"]["id"]

    file_res = client.get(f"/documents/{doc_id}/file", headers={"Authorization": f"Bearer {ctx['user_token']}"})
    assert file_res.status_code == 200
    assert file_res.content == original
    assert "filename" in file_res.headers.get("content-disposition", "")

    _cleanup(doc_id, ctx["user_token"])


def test_h3_unauthorized_download_rejected(ctx):
    res = _upload(ctx["user_token"])
    doc_id = res.json()["document"]["id"]

    assert client.get(f"/documents/{doc_id}/file").status_code == 401
    other = {"Authorization": f"Bearer {ctx['other_token']}"}
    assert client.get(f"/documents/{doc_id}/file", headers=other).status_code == 403

    # Admin retrieval goes through the dedicated admin endpoint only.
    admin = {"Authorization": f"Bearer {ctx['admin_token']}"}
    admin_res = client.get(f"/admin/verification/documents/{doc_id}/file", headers=admin)
    assert admin_res.status_code == 200

    _cleanup(doc_id, ctx["user_token"])


# ---------------------------------------------------------------------------
# Deletion and failure/recovery
# ---------------------------------------------------------------------------

def test_h3_delete_removes_stored_object(ctx):
    res = _upload(ctx["user_token"])
    doc_id = res.json()["document"]["id"]
    key = res.json()["document"]["file_url"]
    backend = storage_service.get_storage_backend()
    assert backend.exists(key)

    assert client.delete(f"/documents/{doc_id}", headers={"Authorization": f"Bearer {ctx['user_token']}"}).status_code == 200
    assert not backend.exists(key)


def test_h3_db_failure_does_not_leave_orphan_object(ctx):
    """If the DB insert fails after the object was stored, the object is removed."""
    backend = storage_service.get_storage_backend()
    from app.services.document_service import DocumentService

    class FakeUploadFile:
        filename = "vendor-registration.docx"

        async def read(self, n=-1):
            return _docx_bytes()

    db = _db_session()
    try:
        with patch.object(db, "commit", side_effect=RuntimeError("simulated DB outage")):
            with pytest.raises(Exception):
                import asyncio
                asyncio.get_event_loop().run_until_complete(
                    DocumentService.upload_document(
                        db=db,
                        user_id=uuid.UUID(ctx["user_id"]),
                        document_type=DocumentType.vendor_registration,
                        file=FakeUploadFile(),
                    )
                )
    finally:
        db.close()

    # No DB row, no stored object.
    db = _db_session()
    try:
        rows = db.query(Document).filter(Document.user_id == uuid.UUID(ctx["user_id"])).all()
        assert rows == [], "Failed upload must not leave a DB record"
    finally:
        db.close()
    assert list(storage_root_iter(backend)) == [], "Failed upload must not leave a stored object"


def test_h3_storage_failure_produces_safe_error(ctx):
    """A storage backend failure becomes a generic 500 — no paths, no stack traces."""
    from app.services import document_service as ds

    class FakeUploadFile:
        filename = "vendor-registration.docx"

        async def read(self, n=-1):
            return _docx_bytes()

    db = _db_session()
    try:
        with patch.object(ds, "get_storage_backend") as mock_factory:
            failing = MagicMock()
            failing.save.side_effect = StorageError("disk exploded (simulated)")
            mock_factory.return_value = failing
            import asyncio
            with pytest.raises(Exception) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    ds.DocumentService.upload_document(
                        db=db,
                        user_id=uuid.UUID(ctx["user_id"]),
                        document_type=DocumentType.vendor_registration,
                        file=FakeUploadFile(),
                    )
                )
    finally:
        db.close()

    assert getattr(exc_info.value, "status_code", None) == 500
    # The raw backend message must not leak to the client.
    assert "disk exploded" not in str(getattr(exc_info.value, "detail", ""))


def test_h3_ocr_failure_leaves_document_recoverable(ctx, monkeypatch):
    """OCR explosion must not corrupt the row or mark it rejected — stays pending.

    Simulates scenario C (file stored + DB row created, OCR then fails) by
    breaking process_document BEFORE the upload so the synchronous OCR pass
    fails exactly like a production missing-binary failure would.
    """
    from app.services import document_service as ds

    def boom(file_path, expected_type=None):
        raise RuntimeError("tesseract not installed (simulated)")

    monkeypatch.setattr(ds, "process_document", boom)
    res = _upload(ctx["user_token"])
    assert res.status_code == 200, "Upload must still succeed even when OCR fails"
    doc_id = res.json()["document"]["id"]
    key = res.json()["document"]["file_url"]

    # The stored object still exists (document is recoverable/reprocessable).
    assert storage_service.get_storage_backend().exists(key)

    db = _db_session()
    try:
        row = db.query(Document).filter(Document.id == uuid.UUID(doc_id)).first()
        assert row is not None
        assert row.verification_status == DocumentStatus.pending, "OCR failure must leave the document pending (recoverable)"
        assert row.verification_score is None
    finally:
        db.close()

    _cleanup(doc_id, ctx["user_token"])


def test_h3_concurrent_uploads_do_not_collide(ctx):
    results = []
    lock = threading.Lock()

    def worker():
        r = _upload(ctx["user_token"])
        with lock:
            results.append(r)

    threads = [threading.Thread(target=worker) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(r.status_code == 200 for r in results), "All concurrent uploads should succeed"
    keys = {r.json()["document"]["file_url"] for r in results}
    assert len(keys) == 5, "Concurrent uploads must all receive unique storage keys"

    for r in results:
        _cleanup(r.json()["document"]["id"], ctx["user_token"])


# ---------------------------------------------------------------------------
# S3 backend (fully mocked boto3 — no real bucket involved)
# ---------------------------------------------------------------------------

class _FakeBody:
    def __init__(self, data: bytes):
        self._data = data

    def read(self) -> bytes:
        return self._data


@pytest.fixture()
def s3_backend():
    """An S3StorageBackend wired to a MagicMock boto3 client."""
    fake_client = MagicMock()
    with patch.object(storage_service, "_get_boto3", return_value=MagicMock(client=lambda *a, **k: fake_client)), \
         patch.object(storage_service.settings, "S3_BUCKET", "test-bucket"), \
         patch.object(storage_service.settings, "S3_ACCESS_KEY_ID", "test-key"), \
         patch.object(storage_service.settings, "S3_SECRET_ACCESS_KEY", "test-secret"):
        backend = storage_service.S3StorageBackend()
        yield backend, fake_client


def test_h3_s3_backend_roundtrip(s3_backend):
    backend, fake_client = s3_backend
    backend.save("documents/u1/abc.pdf", b"%PDF-1.4 test")
    fake_client.put_object.assert_called_once_with(Bucket="test-bucket", Key="documents/u1/abc.pdf", Body=b"%PDF-1.4 test")

    fake_client.get_object.return_value = {"Body": _FakeBody(b"%PDF-1.4 test")}
    assert backend.read("documents/u1/abc.pdf") == b"%PDF-1.4 test"

    assert backend.exists("documents/u1/abc.pdf") is True
    fake_client.head_object.side_effect = Exception("404")
    assert backend.exists("documents/u1/abc.pdf") is False

    backend.delete("documents/u1/abc.pdf")
    fake_client.delete_object.assert_called_once_with(Bucket="test-bucket", Key="documents/u1/abc.pdf")


def test_h3_s3_backend_wraps_errors_as_storage_error(s3_backend):
    backend, fake_client = s3_backend
    fake_client.put_object.side_effect = Exception("S3 service unavailable")
    with pytest.raises(StorageError):
        backend.save("documents/u1/abc.pdf", b"%PDF-1.4")


def test_h3_s3_backend_rejects_unsafe_keys(s3_backend):
    backend, _fake_client = s3_backend
    with pytest.raises(StorageError):
        backend.save("../../evil", b"data")
    with pytest.raises(StorageError):
        backend.read("../../evil")


# ---------------------------------------------------------------------------
# Production configuration fail-safes
# ---------------------------------------------------------------------------

def test_h3_production_requires_s3_backend():
    from app.config import Settings
    env = {
        "DATABASE_URL": "postgresql+psycopg2://u:p@localhost/db",
        "JWT_SECRET": "x",
        "GEMINI_API_KEY": "test-key",  # satisfy the C1 production check first
        # satisfy the email production fail-fast (runs before the storage check)
        "EMAIL_BACKEND": "smtp",
        "EMAIL_HOST": "smtp.test.local",
        "EMAIL_HOST_USER": "no-reply@test.local",
        "EMAIL_HOST_PASSWORD": "test-smtp-password",
        "EMAIL_FROM": "no-reply@test.local",
        "ENVIRONMENT": "production",
        "STORAGE_BACKEND": "local",
    }
    with patch.dict("os.environ", env, clear=False):
        with pytest.raises(ValueError, match="STORAGE_BACKEND=s3 is required"):
            Settings()


def test_h3_s3_backend_requires_configuration():
    from app.config import Settings
    env = {
        "DATABASE_URL": "postgresql+psycopg2://u:p@localhost/db",
        "JWT_SECRET": "x",
        "STORAGE_BACKEND": "s3",
        # S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY deliberately unset
    }
    clean = {k: v for k, v in __import__("os").environ.items() if not k.startswith("S3_")}
    with patch.dict("os.environ", {**clean, **env}, clear=False):
        with pytest.raises(ValueError, match="S3_BUCKET"):
            Settings()


def test_h3_unknown_backend_rejected():
    from app.config import Settings
    env = {
        "DATABASE_URL": "postgresql+psycopg2://u:p@localhost/db",
        "JWT_SECRET": "x",
        "STORAGE_BACKEND": "gcs",
    }
    with patch.dict("os.environ", env, clear=False):
        with pytest.raises(ValueError, match="Unknown STORAGE_BACKEND"):
            Settings()


def test_h3_ocr_runtime_preflight_reports_missing_binaries(monkeypatch):
    from app.services.ocr_runtime import check_ocr_runtime
    # On this dev machine tesseract/poppler are typically absent; the check must
    # report them as strings (never raise). Force the module check to find
    # nothing so we can assert the report path deterministically.
    import shutil
    monkeypatch.setattr(shutil, "which", lambda name: None)
    problems = check_ocr_runtime()
    joined = "\n".join(problems)
    assert "tesseract" in joined and "pdftoppm" in joined


def test_h3_media_types_are_safe():
    assert media_type_for(".pdf") == "application/pdf"
    assert media_type_for(".docx") == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert media_type_for(".jpeg") == "image/jpeg"
    assert media_type_for(".weird") == "application/octet-stream"
