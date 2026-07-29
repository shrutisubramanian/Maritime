from app.models.profile import Profile, VerificationStatus
from app.models.document import DocumentStatus

import os
import uuid

from fastapi import UploadFile, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
import logging

from app.models.document import Document, DocumentType
from app.schemas import document
from app.services.ocr_service import process_document
from app.database import SessionLocal

logger = logging.getLogger(__name__)


def _get_category(doc_type: str) -> str:
    return {
        "vendor_registration": "vendor_reg",
        "kyc_due_diligence":   "kyc",
        "form_10f":            "foreign_tax",
        "no_pe_declaration":   "foreign_tax",
        "tax_invoice":         "invoice",
    }.get(doc_type, "other")


class DocumentService:

    @staticmethod
    async def upload_document(
        db: Session,
        user_id: uuid.UUID,
        document_type: DocumentType,
        file: UploadFile,
        background_tasks: BackgroundTasks = None
    ):

        os.makedirs("uploads", exist_ok=True)

        filename = f"{uuid.uuid4()}_{file.filename}"
        filepath = os.path.join("uploads", filename)

        with open(filepath, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        doc_category = _get_category(document_type.value)

        document = Document(
            user_id=user_id,
            document_type=document_type,
            name=file.filename,
            file_url=filepath,
            doc_category=doc_category,
            verification_status=DocumentStatus.pending
        )
        db.add(document)
        db.commit()
        db.refresh(document)

        if background_tasks:
            background_tasks.add_task(
                DocumentService._process_document_background,
                document.id,
                filepath,
                document_type.value
            )
        else:
            # Fallback for testing/sync environments if needed
            DocumentService._process_document_background(document.id, filepath, document_type.value)

        return document

    @staticmethod
    def _process_document_background(document_id: uuid.UUID, filepath: str, expected_type: str):
        db = SessionLocal()
        try:
            document = db.query(Document).filter(Document.id == document_id).first()
            if not document:
                return

            result = process_document(filepath, expected_type=expected_type)

            if result["status"] == "error":
                logger.error(f"Failed to process document {document_id}: {result.get('error')}")
                document.verification_status = DocumentStatus.rejected
                db.commit()
                return

            detected_type = result.get("document_type")
            if detected_type and detected_type != "unknown":
                try:
                    document.document_type = DocumentType(detected_type)
                    document.doc_category = _get_category(document.document_type.value)
                except ValueError:
                    pass

            document.extracted_text = result.get("extracted_text")
            document.ocr_extracted_data = {
                "fields": result.get("data"),
                "missing_fields": result.get("missing_fields", [])
            }
            document.source = result.get("source")
            document.verification_score = float(result.get("confidence")) if result.get("confidence") is not None else 0.0
            document.verification_status = DocumentStatus.extracted
            
            db.commit()
        except Exception as e:
            logger.error(f"Exception during background document processing: {e}")
            db.rollback()
        finally:
            db.close()

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

        document.verification_status = DocumentStatus.verified

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

        document.verification_status = DocumentStatus.rejected

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
