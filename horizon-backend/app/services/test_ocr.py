from app.services.ocr_service import OCRService

path = r"uploads\9e158f27-849a-46da-b6ca-9f8c0238b08a_ocr file .jpg"

print(path)

text = OCRService.extract_text(path)

print(text)