from app.parsers.parser_engine import ParserEngine
from app.templates.no_pe_template import NO_PE_TEMPLATE
from app.services.extractors.docx_reader import extract_docx_text


def extract(file_path: str) -> dict:
    """
    Extract data from a No PE declaration document file path.
    """
    text = extract_docx_text(file_path)
    return ParserEngine.extract(text, NO_PE_TEMPLATE)


def extract_from_text(lines: list[str]) -> dict:
    """
    Extract data from a list of extracted text lines from a No PE declaration document.
    """
    text = "\n".join(lines)
    return ParserEngine.extract(text, NO_PE_TEMPLATE)

