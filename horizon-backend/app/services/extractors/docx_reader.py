import docx


def extract_docx_text(file_path: str) -> str:
    doc = docx.Document(file_path)

    text = []

    # Normal paragraphs
    for p in doc.paragraphs:
        if p.text.strip():
            text.append(p.text.strip())

    # Tables
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                cell_text = cell.text.strip()
                if cell_text:
                    text.append(cell_text)

    return "\n".join(text)
