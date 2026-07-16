from app.parsers.parser_engine import ParserEngine
from app.templates.kyc_template import KYC_TEMPLATE
from app.services.extractors.docx_reader import extract_docx_text


def extract(file_path: str) -> dict:
    """
    Extract data from a KYC document file path.
    """
    text = extract_docx_text(file_path)
    return ParserEngine.extract(text, KYC_TEMPLATE)


def extract_from_text(lines: list[str]) -> dict:
    """
    Extract data from a list of extracted text lines from a KYC document.
    """
    text = "\n".join(lines)
    return ParserEngine.extract(text, KYC_TEMPLATE)

