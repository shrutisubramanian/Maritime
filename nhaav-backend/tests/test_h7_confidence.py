"""
H7 regression tests — honest OCR "confidence" semantics.

The OCR engine (tesseract / PyMuPDF text extraction) does NOT provide a
per-field accuracy metric. Historically the pipeline reported
filled_fields / total_fields as "confidence", presenting field COMPLETENESS
as OCR CORRECTNESS on a trust surface. These tests pin the honest contract:

  - 'confidence' (and the stored verification_score) is a field-completeness
    percentage kept ONLY for API compatibility.
  - 'confidence_available' is always False — no accuracy is ever claimed.
  - 'field_completion_rate' is the explicit, honestly-named completeness metric.
  - The golden fixture reflects human-verified ground truth (real contact
    answers, aligned bank rows), not whatever the parser historically returned.
"""
import io
import json
import re
from pathlib import Path

import docx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.utils.password import hash_password
from app.services.ocr_service import (
    _calculate_confidence_and_missing,
    process_document,
)

TESTS_DIR = Path(__file__).parent

# ---------------------------------------------------------------------------
# Unit level — the metric itself
# ---------------------------------------------------------------------------


class TestMetricSemantics:
    def test_all_fields_filled_is_100_completion_not_confidence_claim(self):
        pct, missing, rate = _calculate_confidence_and_missing(
            {"a": "x", "b": "y", "c": "z"}
        )
        # A fully-populated dict yields 100% COMPLETION — the tests below pin
        # that this number is never presented as OCR accuracy.
        assert pct == 100
        assert rate == 1.0
        assert missing == []

    def test_completion_rate_and_missing_fields_agree(self):
        pct, missing, rate = _calculate_confidence_and_missing(
            {"a": "x", "b": "", "c": None, "d": "w"}
        )
        assert pct == 50
        assert rate == 0.5
        assert set(missing) == {"b", "c"}

    def test_empty_data(self):
        pct, missing, rate = _calculate_confidence_and_missing({})
        assert pct == 0
        assert rate == 0.0
        assert missing == []

    def test_function_is_named_for_completion(self):
        # The metric function's name/doc must describe completeness, not
        # accuracy, so future contributors don't reintroduce the old lie.
        import inspect
        doc = inspect.getdoc(_calculate_confidence_and_missing) or ""
        assert "COMPLETENESS" in doc.upper()
        assert "correct" in doc.lower()


# ---------------------------------------------------------------------------
# Golden fixture — human-verified ground truth (original-report H7 part 1)
# ---------------------------------------------------------------------------


class TestGoldenGroundTruth:
    """The fixture must hold real values read directly from the source
    document, not historically mis-extracted output."""

    @pytest.fixture(scope="class")
    def expected(self):
        with open(TESTS_DIR / "vendor" / "expected.json", encoding="utf-8") as f:
            return json.load(f)

    def test_contact_answers_are_real_values_not_questions(self, expected):
        # The form has question lines a)-d) and a separate answer block.
        # 'email' must never contain a question label like 'd) Website'.
        for ext in ("docx", "pdf"):
            data = expected[ext]["data"]
            assert data["email"] == "vendors@northwindmarine.example"
            assert data["website"] == "www.northwindmarine.example"
            assert data["telephone"] == "+91 44 4567 8000 / +91 90000 12345"
            assert data["correspondence_address"].startswith("302, Marina Commercial Tower")
            # Guard: no field holds another field's question label
            # (the old bug produced values like 'd) Website' / 'c) Email').
            for key in ("email", "website", "telephone", "correspondence_address"):
                assert not re.match(r"^[a-d]\)", str(data[key])), (
                    f"{ext}.{key} looks like a question label: {data[key]!r}"
                )

    def test_bank_rows_are_aligned(self, expected):
        # IBAN='Not Applicable' is the vendor's real answer for an Indian
        # account; SWIFT and IFSC must hold their actual values.
        for ext in ("docx", "pdf"):
            data = expected[ext]["data"]
            assert data["bank_name"] == "HDFC Bank Ltd."
            assert data["account_number"] == "60200198765432"
            assert data["iban"] == "Not Applicable"
            assert data["swift"] == "HDFCINBB"
            assert data["ifsc"] == "HDFC0000001"

    def test_fixture_declares_honest_confidence_semantics(self, expected):
        for ext in ("docx", "pdf"):
            assert expected[ext]["confidence_available"] is False
            assert "accuracy" in expected[ext]["confidence_reason"]
            assert isinstance(expected[ext]["field_completion_rate"], float)


# ---------------------------------------------------------------------------
# Parser pipeline — live behaviour against the real fixture document
# ---------------------------------------------------------------------------


class TestPipelineBehavior:
    @pytest.mark.parametrize("ext", ["docx", "pdf"])
    def test_process_document_honest_contract(self, ext):
        result = process_document(str(TESTS_DIR / "vendor" / f"filled.{ext}"))
        assert result["status"] == "success"
        assert result["confidence_available"] is False
        assert result["field_completion_rate"] == (1.0 if ext == "docx" else pytest.approx(0.8333))
        # 'confidence' equals the completion percentage (compat), nothing more.
        assert result["confidence"] == int(round(result["field_completion_rate"] * 100))
        # Real values, not question labels.
        assert result["fields"]["email"] == "vendors@northwindmarine.example"
        assert result["fields"]["swift"] == "HDFCINBB"

    def test_docx_and_pdf_agree_on_extracted_values(self):
        """Both generations of the same document must produce the same core
        values — a regression guard for format-specific parser drift."""
        values = []
        for ext in ("docx", "pdf"):
            r = process_document(str(TESTS_DIR / "vendor" / f"filled.{ext}"))
            values.append({k: r["fields"][k] for k in
                           ("email", "telephone", "website", "swift", "ifsc", "pan", "gst")})
        assert values[0] == values[1]


# ---------------------------------------------------------------------------
# API surface — upload response compatibility (H7 requirement)
# ---------------------------------------------------------------------------

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_h7_confidence.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

USER_EMAIL = "h7_user@nhaav.com"
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
        db.add(User(email=USER_EMAIL, password_hash=hash_password(PASSWORD),
                    role=UserRole.provider, full_name="H7 User"))
        db.commit()
    finally:
        db.close()
    yield
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def _docx_bytes() -> bytes:
    buf = io.BytesIO()
    document = docx.Document()
    document.add_paragraph("APPLICATION FOR VENDOR REGISTRATION")
    document.add_paragraph("Name of the Vendor: H7 Marine Pvt Ltd")
    document.add_paragraph("c) Email: h7@example.com")
    document.save(buf)
    return buf.getvalue()


class TestUploadAPIContract:
    def test_upload_response_contains_honest_metrics(self):
        login = client.post("/auth/login", json={"email": USER_EMAIL, "password": PASSWORD})
        token = login.json()["access_token"]

        res = client.post(
            "/documents/upload",
            headers={"Authorization": f"Bearer {token}"},
            data={"document_type": "vendor_registration"},
            files={"file": ("h7-vendor.docx", _docx_bytes(),
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )
        assert res.status_code == 200, res.text
        body = res.json()

        # New honest fields present.
        assert body["confidence_available"] is False
        assert isinstance(body["field_completion_rate"], (int, float))
        # Legacy 'confidence' still present for frontend compatibility.
        assert "confidence" in body

        # Stored verification_score matches the completion percentage.
        doc = body["document"]
        assert doc["verification_score"] == pytest.approx(body["confidence"])
        stored = doc["ocr_extracted_data"]
        assert stored["confidence_available"] is False
        assert stored["field_completion_rate"] == pytest.approx(body["field_completion_rate"])
