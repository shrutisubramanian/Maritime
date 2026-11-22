import os
import json
import pytest
from pathlib import Path
from app.services.ocr_service import process_document

# Map test folder names to internal document type IDs
DOC_TYPE_MAP = {
    "vendor": "vendor_registration",
    "form_10f": "form_10f",
    "no_pe": "no_pe_declaration"
}



def get_test_cases():
    """
    Dynamically discover directories under tests/ that contain expected.json.
    Returns a list of tuples: (doc_type, extension, file_path, expected_data)
    """
    test_cases = []
    tests_dir = Path(__file__).parent
    
    for subdir in tests_dir.iterdir():
        if not subdir.is_dir() or subdir.name.startswith("__") or subdir.name == ".pytest_cache":
            continue
            
        expected_json_path = subdir / "expected.json"
        if not expected_json_path.exists():
            continue
            
        with open(expected_json_path, "r", encoding="utf-8") as f:
            expected_all = json.load(f)
            
        for ext in ["docx", "pdf"]:
            file_path = subdir / f"filled.{ext}"
            if file_path.exists() and ext in expected_all:
                test_cases.append((subdir.name, ext, str(file_path), expected_all[ext]))
                
    return test_cases

@pytest.mark.parametrize("doc_type, ext, file_path, expected", get_test_cases())
def test_document_parser(doc_type, ext, file_path, expected):
    # Run the document processing pipeline
    result = process_document(file_path)
    
    # Assert successful processing
    assert result["status"] == "success", f"Failed to parse {file_path}: {result.get('error')}"
    
    # Assert correct document type detection
    expected_doc_type = DOC_TYPE_MAP.get(doc_type, doc_type)
    assert result["document_type"] == expected_doc_type
    
    # Verify metadata fields
    assert result["confidence"] == expected["confidence"]
    assert set(result["missing_fields"]) == set(expected["missing_fields"])
    assert result["source"] == expected["source"]
    
    # Verify parsed data
    parsed_data = result["data"]
    expected_data = expected["data"]
    
    # Check that all keys in expected data match
    for key, val in expected_data.items():
        assert parsed_data.get(key) == val, f"Mismatch in field '{key}' for {ext} parser"

    # Specific assertions for vendor document type (as requested by user)
    if doc_type == "vendor":
        assert parsed_data["vendor_name"] == "Northwind Marine Services Pvt. Ltd."
        assert parsed_data["gst"] == "33AAECN4567M1Z9"
        assert parsed_data["pan"] == "AAECN4567M"


def test_form_10f_parser_mock():
    from app.parsers.form10f_parser import Form10FParser

    mock_form10f_text = """
    Form No. 10F
    I Sundar Iyer on behalf of vendor Northwind Marine Services Pvt. Ltd. (Corporate Reg. no. MFCR-TN-2012-00891) do hereby declare...
    Status (permanent or temporary): Private Limited Company (ii)
    Permanent Account Number (PAN): AAECN4567M (iii)
    Nationality: Indian (iv)
    tax identification number: TIN-12345 (v)
    applicable: 2025-2026 (vi)
    Address of the assessee: 410, Marina Commercial Tower, Chennai 2.
    This is issued under Government of India.
    Name: Sundar Iyer Address: 410, Marina Commercial Tower, Chennai
    Permanent Account Number: AAECN4567M
    Verified today the 16th day of July, 2026.
    For the financial year 2025-26.
    """

    data = Form10FParser.extract(mock_form10f_text)

    assert data["vendor_name"] == "Northwind Marine Services Pvt. Ltd."
    assert data["registration_number"] == "MFCR-TN-2012-00891"
    assert data["status"] == "Private Limited Company"
    assert data["pan"] == "AAECN4567M"
    assert data["country"] == "Indian"
    assert data["tax_identification_number"] == "TIN-12345"
    assert data["residential_period"] == "2025-2026"
    assert data["address"] == "410, Marina Commercial Tower, Chennai"
    assert data["government"] == "India"
    assert data["signatory_name"] == "Sundar Iyer"
    assert data["signatory_pan"] == "AAECN4567M"
    assert data["verification_date"] == "16th day of July, 2026."
    assert data["financial_year"] == "2025-26"


def test_no_pe_parser_mock():
    from app.parsers.no_pe_parser import NoPEParser

    mock_no_pe_text = """
    We, Northwind Marine Services Pvt. Ltd. (Corporate Reg. no. MFCR-TN-2012-00891), registered address at Survey No. 22, Harbour Industrial Estate, Chennai, India, is a limited company...
    tax resident in India as per the tax laws...
    under India-Singapore Double Taxation Avoidance Agreement...
    The assessee does not have a permanent establishment in India...
    The assessee does not have any business connection in India...
    The title of goods/services is passed outside India...
    Name: Sundar Iyer
    Title: Managing Director
    Declaration for the period 2025-2026
    """

    data = NoPEParser.extract(mock_no_pe_text)

    assert data["vendor_name"] == "Northwind Marine Services Pvt. Ltd."
    assert data["registration_number"] == "MFCR-TN-2012-00891"
    assert data["registered_address"] == "Survey No. 22, Harbour Industrial Estate, Chennai, India"
    assert data["country"] == "India"
    assert data["tax_residency"] == "India"
    assert data["dtaa_country"] == "Singapore"
    assert data["permanent_establishment"] == "No"
    assert data["business_connection"] == "No"
    assert data["goods_passed_outside_india"] == "Yes"
    assert data["signatory_name"] == "Sundar Iyer"
    assert data["signatory_title"] == "Managing Director"
    assert data["declaration_period"] == "2025-2026"


