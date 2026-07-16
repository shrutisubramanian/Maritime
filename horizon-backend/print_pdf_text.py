import docx
import re
from app.services.extractors.docx_reader import extract_docx_text

def print_docx_lines(path):
    text = extract_docx_text(path)
    cleaned_lines = [
        re.sub(r"\s+", " ", line).strip()
        for line in text.splitlines()
        if line.strip()
    ]
    print(f"=== LINES FOR {path} ===")
    for i, line in enumerate(cleaned_lines):
        print(f"{i}: {repr(line)}")

print_docx_lines("uploads/194243de-c173-4b64-af16-c78f96e0a92b_Vendor_Registration_Form_FILLED.docx")
