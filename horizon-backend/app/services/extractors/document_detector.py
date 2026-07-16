from pathlib import Path
from app.services.extractors.docx_reader import extract_docx_text


def detect(file_path: str) -> str:
    """
    Detect document type from a file path (mainly used for Word documents).
    """
    suffix = Path(file_path).suffix.lower()
    if suffix in (".docx", ".doc"):
        try:
            text = extract_docx_text(file_path)
            return detect_from_text(text.splitlines())
        except Exception:
            return "unknown"
    return "unknown"


def detect_from_text(lines: list[str]) -> str:
    """
    Detect document type from a list of extracted text lines.
    """
    text = "\n".join(lines).upper()

    if "APPLICATION FOR VENDOR REGISTRATION" in text:
        return "vendor_registration"

    if "FORM NO. 10F" in text:
        return "form_10f"

    if "KNOW YOUR COUNTERPARTY" in text:
        return "kyc_due_diligence"

    if "NO PERMANENT ESTABLISHMENT" in text:
        return "no_pe_declaration"

    # Invoice Detection
    invoice_keywords = [
        "INVOICE",
        "GSTIN",
        "IRN",
        "HSN",
        "CGST",
        "SGST",
        "EWAY",
        "AMOUNT",
        "PLACE OF SUPPLY",
    ]

    score = 0
    for keyword in invoice_keywords:
        if keyword in text:
            score += 1

    if score >= 3:
        return "tax_invoice"

    return "unknown"
