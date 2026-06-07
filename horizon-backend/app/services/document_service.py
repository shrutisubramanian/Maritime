import os
import uuid

from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentType


class DocumentService:

    @staticmethod
    async def upload_document(
        db: Session,
        user_id: uuid.UUID,
        document_type: DocumentType,
        file: UploadFile
    ):

        os.makedirs("uploads", exist_ok=True)

        filename = f"{uuid.uuid4()}_{file.filename}"
        filepath = os.path.join("uploads", filename)

        with open(filepath, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        document = Document(
            user_id=user_id,
            document_type=document_type,
            file_url=filepath
        )

        db.add(document)
        db.commit()
        db.refresh(document)

        return document