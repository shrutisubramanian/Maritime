from app.models.profile import Profile, VerificationStatus
from app.models.document import DocumentStatus

import os
import uuid

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentType
from app.schemas import document
from app.services.ocr_service import OCRService
from app.services.document_parser import DocumentParser


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

        # OCR
        ocr_text = OCRService.extract_text(filepath)

        fields = DocumentParser.extract_fields(ocr_text)

        document = Document(
            user_id=user_id,
            document_type=document_type,
            file_url=filepath,
            ocr_extracted={
                "raw_text": ocr_text,
                "fields": fields
            }
        )
        db.add(document)
        db.commit()
        db.refresh(document)

        return document

    @staticmethod
    def verify_document(
        db: Session,
        document_id: uuid.UUID
    ):

        document = db.query(Document).filter(
            Document.id == document_id
        ).first()

        if not document:
            raise ValueError("Document not found")

        document.status = DocumentStatus.verified

        profile = db.query(Profile).filter(
            Profile.user_id == document.user_id
        ).first()

        if profile:
            profile.verification_status = (
                VerificationStatus.verified
            )

            profile.badge_label = (
                "Verified Provider"
            )

        db.commit()
        db.refresh(document)

        return document

    @staticmethod
    def reject_document(
        db: Session,
        document_id: uuid.UUID
    ):

        document = db.query(Document).filter(
            Document.id == document_id
        ).first()

        if not document:
            raise ValueError("Document not found")

        document.status = DocumentStatus.rejected

        profile = db.query(Profile).filter(
            Profile.user_id == document.user_id
        ).first()

        if profile:
            profile.verification_status = (
                VerificationStatus.rejected
            )

        db.commit()
        db.refresh(document)

        return document
