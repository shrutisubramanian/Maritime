from app.parsers.parser_engine import ParserEngine
from app.templates.invoice_template import INVOICE_TEMPLATE
from app.services.extractors.docx_reader import extract_docx_text


def extract(file_path: str) -> dict:
    """
    Extract data from an invoice document file path.
    """
    text = extract_docx_text(file_path)
    return ParserEngine.extract(text, INVOICE_TEMPLATE)


def extract_from_text(lines: list[str]) -> dict:
    """
    Extract data from a list of extracted text lines from an invoice.
    """
    text = "\n".join(lines)
    return ParserEngine.extract(text, INVOICE_TEMPLATE)
