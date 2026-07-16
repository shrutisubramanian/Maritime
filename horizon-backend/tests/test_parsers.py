import os
import json
import pytest
from pathlib import Path
from app.services.ocr_service import process_document

# Map test folder names to internal document type IDs
DOC_TYPE_MAP = {
    "vendor": "vendor_registration"
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
        assert parsed_data["vendor_name"] == "Atlantic Marine Engineering Pvt. Ltd."
        assert parsed_data["gst"] == "27AABCA1234B1Z3"
        assert parsed_data["pan"] == "AABCA1234B"
