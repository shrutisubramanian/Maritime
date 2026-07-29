from app.services.extractors.docx_reader import extract_docx_text

text = extract_docx_text(
    r"C:\Users\Shruti Subramanian\Downloads\Draft_Form_10F_FILLED.docx"
)

print(text)