# pyrefly: ignore [missing-import]
import cv2, pytesseract
# pyrefly: ignore [missing-import]
import fitz  # PyMuPDF
from app.services.extractors.document_detector import detect_from_text
from app.services.extractors import (
    vendor_extractor,
    kyc_extractor,
    form10f_extractor,
    no_pe_extractor,
    invoice_extractor,
)
from pathlib import Path

EXTRACTOR_MAP = {
    "vendor_registration": vendor_extractor,
    "kyc_due_diligence":   kyc_extractor,
    "form_10f":            form10f_extractor,
    "no_pe_declaration":   no_pe_extractor,
    "tax_invoice":         invoice_extractor,
}

def process_document(file_path: str, expected_type: str = None) -> dict:
    try:
        suffix = Path(file_path).suffix.lower()
        lines, source = _extract_lines(file_path, suffix)

        doc_type = detect_from_text(lines)
        if doc_type == "unknown":
            if expected_type and expected_type in EXTRACTOR_MAP:
                doc_type = expected_type
            else:
                return _error(
                    "The uploaded file was read successfully, but it could not be identified as a supported document type. "
                    "Supported documents are Vendor Registration, KYC, Form 10F, No Permanent Establishment Declaration, and Tax Invoice."
                )

        extractor = EXTRACTOR_MAP[doc_type]
        data = extractor.extract_from_text(lines)

        confidence_score, missing_fields = _calculate_confidence_and_missing(data)

        return {
            "status": "success",
            "source": source,
            "document_type": doc_type,
            "data": data,
            "confidence": confidence_score,
            "missing_fields": missing_fields,
        }
    except Exception as e:
        return _error(str(e))

def _calculate_confidence_and_missing(data: dict) -> tuple[int, list[str]]:
    total_fields = len(data)
    if total_fields == 0:
        return 0, []

    missing_fields = []
    filled_fields = 0
    for k, v in data.items():
        if v is None or str(v).strip() == "":
            missing_fields.append(k)
        else:
            filled_fields += 1

    confidence_score = int(round((filled_fields / total_fields) * 100))
    return confidence_score, missing_fields

def _extract_lines(file_path: str, suffix: str) -> tuple[list[str], str]:
    if suffix in (".docx", ".doc"):
        from app.services.extractors.docx_reader import extract_docx_text
        text = extract_docx_text(file_path)
        return text.splitlines(), "word_direct"

    elif suffix == ".pdf":
        doc = fitz.open(file_path)
        lines = []
        for page in doc:
            text = page.get_text()
            if text.strip():
                lines.extend(text.splitlines())
        doc.close()

        if lines and len(" ".join(lines).strip()) > 50:
            return lines, "pdf_direct"
        else:
            return _extract_lines_from_scanned_pdf(file_path), "pdf_ocr"

    elif suffix in (".jpg", ".jpeg", ".png", ".tiff"):
        img = cv2.imread(file_path)
        if img is None:
            raise ValueError("Cannot read image file")
        return _ocr_image(img), "image_ocr"

    else:
        raise ValueError(f"Unsupported file type: {suffix}")

def _extract_lines_from_scanned_pdf(file_path: str) -> list[str]:
    # pyrefly: ignore [missing-import]
    from pdf2image import convert_from_path
    import numpy as np
    images = convert_from_path(file_path, dpi=300)
    all_lines = []
    for img in images:
        all_lines.extend(_ocr_image(np.array(img)))
    return all_lines

def _ocr_image(img) -> list[str]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    binary = cv2.adaptiveThreshold(enhanced, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    raw = pytesseract.image_to_string(binary, lang="eng")
    return [l.strip() for l in raw.splitlines() if l.strip()]

def _error(msg: str) -> dict:
    return {"status": "error", "source": None,
            "document_type": "unknown", "data": {}, "confidence": 0, "missing_fields": [],
            "error": msg, "message": msg}