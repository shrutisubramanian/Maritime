from app.services.ocr_service import process_document

result = process_document(
    "uploads/Vendor_Registration_Form.pdf"
)

print(result)