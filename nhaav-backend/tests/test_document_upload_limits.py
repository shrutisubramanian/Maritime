"""Upload limits bound RAM, not just the accepted file size.

The upload endpoint used to read the whole request body into memory and check
the 25 MB cap afterwards, so the cap never bounded memory: concurrent onboarding
uploads (many people at once, which is exactly when it matters) were limited by
the machine's RAM, and an oversize body was fully buffered before rejection.

These tests pin the streaming behaviour: an oversize body is refused while being
written, the partial file is removed, and a normal upload still lands byte-exact.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.document import Document, DocumentStatus
from app.models.user import User, UserRole
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_upload_limits.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "Password123!"


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


@pytest.fixture()
def upload_dir(tmp_path, monkeypatch):
    """A throwaway upload directory so leftovers are observable."""
    directory = tmp_path / "uploads"
    monkeypatch.setattr(settings, "DOCUMENT_UPLOAD_DIR", str(directory))
    monkeypatch.setattr(settings, "DOCUMENT_UPLOAD_MAX_BYTES", 2048)
    return directory


@pytest.fixture(scope="module")
def token():
    client = TestClient(app)
    email = f"upload_limit_{uuid.uuid4().hex[:8]}@example.com"
    db = TestingSessionLocal()
    try:
        db.add(
            User(
                email=email,
                password_hash=hash_password(PASSWORD),
                role=UserRole.provider,
                full_name="Upload Limit",
            )
        )
        db.commit()
    finally:
        db.close()
    resp = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _upload(token: str, data: bytes, name: str = "notes.txt"):
    return TestClient(app).post(
        "/documents/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"document_type": "other"},
        files={"file": (name, data, "text/plain")},
    )


def test_oversize_upload_is_refused_and_leaves_no_partial_file(token, upload_dir):
    resp = _upload(token, b"x" * 5000)

    assert resp.status_code == 400, resp.text
    assert "File too large" in resp.text
    stored = list(upload_dir.glob("*")) if upload_dir.exists() else []
    assert stored == [], f"rejected upload left a file behind: {stored}"


def test_upload_within_the_limit_is_stored_byte_exact(token, upload_dir):
    payload = ("nhaav" * 10).encode()  # 70 bytes, under the 2 KB test cap

    resp = _upload(token, payload)

    assert resp.status_code == 200, resp.text
    stored = list(upload_dir.glob("*"))
    assert len(stored) == 1
    assert stored[0].read_bytes() == payload


def test_generic_upload_skips_ocr_and_waits_for_admin_review(token, upload_dir):
    payload = b"supporting document for admin review"

    resp = _upload(token, payload, "supporting.txt")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["document_type"] == "other"

    db = TestingSessionLocal()
    try:
        stored = (
            db.query(Document)
            .filter(Document.id == uuid.UUID(body["document"]["id"]))
            .first()
        )
        assert stored is not None
        assert stored.verification_status == DocumentStatus.pending
        assert stored.ocr_extracted_data is None
        assert stored.source is None
        assert stored.verification_score is None
    finally:
        db.close()
