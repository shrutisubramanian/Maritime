"""
H9 Phase 4f — CreateProcurementRequest document-type contract (D-1 twin fix).

The Upload page (removed in Phase 4e per H9_UPLOAD_AUDIT.md) hardcoded
document_type="vendor_registration" on every upload. The same defect survived
in CreateProcurementRequest.tsx: its "Process Documents" handler appended
document_type='vendor_registration' for every attached file, so any KYC
certificate, tax invoice, or quotation attached to a procurement request was
persisted under the wrong classification in the documents table.

Fix: the page now requires an explicit DocumentType selection (mirroring the
canonical selector on Documents/Verification) and passes the selected value
through verbatim. These tests pin that:

  - a non-vendor_registration type persists as its selected type (regression
    guard: a silently-defaulted append must never return);
  - ownership is still derived from the uploader's JWT server-side;
  - the frontend source can no longer contain a hardcoded document_type
    append in ANY quote style (the Phase 4e ban only matched double quotes).
"""
import io
import re
import uuid
from pathlib import Path

import docx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.models.document import Document
from app.utils.password import hash_password


def _doc_id(payload: dict) -> uuid.UUID:
    """Document.id is a UUID column; the API returns it as a string."""
    return uuid.UUID(payload["document"]["id"])

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "nhaav-frontend" / "src"
CPR = FRONTEND_SRC / "pages" / "Procurement" / "ProcurementRequests" / "CreateProcurementRequest.tsx"

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_h9_cpr_doctype.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

USER_A_EMAIL = "h9_cpr_a@nhaav.com"
USER_B_EMAIL = "h9_cpr_b@nhaav.com"
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
    db = TestingSessionLocal()
    try:
        db.add(User(email=USER_A_EMAIL, password_hash=hash_password(PASSWORD),
                    role=UserRole.client, full_name="CPR User A"))
        db.add(User(email=USER_B_EMAIL, password_hash=hash_password(PASSWORD),
                    role=UserRole.client, full_name="CPR User B"))
        db.commit()
    finally:
        db.close()
    yield
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def _docx_bytes(title: str) -> bytes:
    buf = io.BytesIO()
    document = docx.Document()
    document.add_paragraph(title)
    document.add_paragraph("Reference document for the document-type persistence test.")
    document.save(buf)
    return buf.getvalue()


def _upload_as(email: str, document_type: str, filename: str) -> dict:
    login = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    res = client.post(
        "/documents/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"document_type": document_type},
        files={"file": (filename, _docx_bytes(filename), 
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert res.status_code == 200, res.text
    return res.json()


class TestSelectedTypePersists:
    def test_kyc_document_is_not_reclassified(self):
        """The D-1 regression: a KYC upload must land as kyc_due_diligence."""
        body = _upload_as(USER_A_EMAIL, "kyc_due_diligence", "h9-kyc.docx")
        assert body["status"] == "success"
        assert body["document_type"] == "kyc_due_diligence"
        db = TestingSessionLocal()
        try:
            row = db.query(Document).filter(Document.id == _doc_id(body)).first()
            assert row is not None
            assert row.document_type.value == "kyc_due_diligence"
        finally:
            db.close()

    def test_tax_invoice_and_quotation_types_persist(self):
        for doc_type in ("tax_invoice", "quotation"):
            body = _upload_as(USER_A_EMAIL, doc_type, f"h9-{doc_type}.docx")
            db = TestingSessionLocal()
            try:
                row = db.query(Document).filter(Document.id == _doc_id(body)).first()
                assert row.document_type.value == doc_type
            finally:
                db.close()


class TestOwnershipStillJwtDerived:
    def test_row_user_id_matches_token_not_client_input(self):
        body = _upload_as(USER_B_EMAIL, "vendor_registration", "h9-owner.docx")
        db = TestingSessionLocal()
        try:
            row = db.query(Document).filter(Document.id == _doc_id(body)).first()
            user_b = db.query(User).filter(User.email == USER_B_EMAIL).first()
            assert row.user_id == user_b.id
            # The form never carries an ownership field; only the JWT decides.
            assert body["document"]["user_id"] == str(user_b.id)
        finally:
            db.close()


class TestFrontendSourceContract:
    def test_no_hardcoded_document_type_append_any_quote_style(self):
        """Catches both 'vendor_registration' and "vendor_registration" forms.

        The Phase 4e source ban only matched the double-quoted variant, which
        is how this same defect survived in this page after that pass.
        """
        src = CPR.read_text(encoding="utf-8")
        hardcoded = re.search(
            r"formData\.append\(\s*['\"]document_type['\"]\s*,\s*['\"][^'\"]+['\"]\s*\)",
            src,
        )
        assert hardcoded is None, (
            f"Hardcoded document_type append must not return: {hardcoded.group(0) if hardcoded else ''}"
        )
        assert "document_type', documentType" in src, (
            "The selected document type must be passed through verbatim"
        )

    def test_type_selector_is_required_before_processing(self):
        src = CPR.read_text(encoding="utf-8")
        assert "Select a document type before processing." in src, (
            "Processing must be blocked until an explicit type is chosen"
        )
        assert "Select document type" in src, "Selector must not silently preselect a type"

    def test_selector_lists_real_backend_types(self):
        src = CPR.read_text(encoding="utf-8")
        for value in ("cdc", "coc", "surveyor_license", "kyc_due_diligence",
                      "form_10f", "no_pe_declaration", "tax_invoice", "quotation"):
            assert f"value: '{value}'" in src
        assert "'verification'" not in src, (
            "'verification' is not an uploadable DocumentType — it must not be offered"
        )

    def test_formats_line_matches_backend_whitelist(self):
        src = CPR.read_text(encoding="utf-8")
        assert "CAD" not in src and "XLSX" not in src, (
            "Formats the backend does not accept must not be advertised"
        )
        assert "PDF, DOCX, JPG, PNG, TIFF (Max 25MB per file)" in src
