# pyrefly: ignore [missing-import]
import fitz

doc = fitz.open(
    r"C:\Users\Shruti Subramanian\OneDrive\Desktop\Maritime\nhaav-backend\uploads\Vendor_Registration_Form.pdf"
)

for i, page in enumerate(doc):
    print("PAGE", i + 1)
    text = page.get_text()
    print(repr(text[:500]))

doc.close()