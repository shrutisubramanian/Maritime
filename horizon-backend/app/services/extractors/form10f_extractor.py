from app.parsers.form10f_parser import Form10FParser
from app.services.extractors.docx_reader import extract_docx_text


def extract(file_path: str):
    text = extract_docx_text(file_path)
    return Form10FParser.extract(text)


def extract_from_text(lines: list[str]):
    text = "\n".join(lines)
    return Form10FParser.extract(text)
