from app.services.ocr_service import process_document

path = r"uploads\Vendor_Registration_Form.pdf"

print(path)

result = process_document(path)

print(result)