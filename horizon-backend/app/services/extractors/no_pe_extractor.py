from app.parsers.no_pe_parser import NoPEParser
from app.services.extractors.docx_reader import extract_docx_text


def extract(file_path):

    text = extract_docx_text(file_path)

    return NoPEParser.extract(text)


def extract_from_text(lines):

    return NoPEParser.extract(
        "\n".join(lines)
    )
