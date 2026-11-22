# pyrefly: ignore [missing-import]
import docx

doc = docx.Document(
    r"C:\Users\Shruti Subramanian\Downloads\Draft_Form_10F_FILLED.docx"
)

print("Paragraphs:", len(doc.paragraphs))
print("Tables:", len(doc.tables))

for i, table in enumerate(doc.tables):
    print(f"\nTABLE {i}")

    for row in table.rows:
        print([cell.text for cell in row.cells])