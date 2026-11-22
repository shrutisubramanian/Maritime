import fitz

with open("test_pdf_out.txt", "w", encoding="utf-8") as f:
    doc = fitz.open(r"uploads\Vendor_Registration_Form.pdf")
    for page in doc:
        f.write(page.get_text(sort=True))
    doc.close()
