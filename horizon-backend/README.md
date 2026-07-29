# Horizon Backend

Backend service for the Maritime Horizon document processing pipeline.

## Known Limitations

Known limitation: Standard DOCX extraction relies on python-docx, which reads paragraphs and tables. Some Microsoft Word documents store user-entered data in text boxes, drawing objects, or content controls that are not exposed through python-docx. In those cases, the PDF version of the same document provides complete text extraction and is the recommended upload format.
