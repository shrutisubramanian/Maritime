from PIL import Image
import pytesseract


class OCRService:

    @staticmethod
    def extract_text(file_path: str) -> str:

        print("FILE PATH:", file_path)

        image = Image.open(file_path)

        print("IMAGE OPENED")

        text = pytesseract.image_to_string(image)

        print("OCR COMPLETE")

        return text