import fitz

path = r"C:\Users\Shruti Subramanian\OneDrive\Desktop\Maritime\nhaav-backend\uploads\Vendor_Registration_Form.pdf"

doc = fitz.open(path)

for i, page in enumerate(doc):
    print("=" * 40)
    print("PAGE", i + 1)
    text = page.get_text()
    print(repr(text[:500]))

doc.close()