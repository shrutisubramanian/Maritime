from app.parsers.vendor_parser import VendorParser
from app.services.extractors.docx_reader import extract_docx_text


def extract(file_path: str):
    text = extract_docx_text(file_path)
    return VendorParser.extract(text)


def extract_from_text(lines: list[str]):
    text = "\n".join(lines)
    return VendorParser.extract(text)



