from app.models.profile import Profile, VerificationStatus
from app.models.document import DocumentStatus

import os
import uuid

from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentType
from app.schemas import document
from app.services.ocr_service import process_document


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
        file: UploadFile
    ):

        os.makedirs("uploads", exist_ok=True)

        filename = f"{uuid.uuid4()}_{file.filename}"
        filepath = os.path.join("uploads", filename)

        with open(filepath, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Process document using modular pipeline
        result = process_document(filepath, expected_type=document_type.value)

        if result["status"] == "error":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=result.get("error", "Processing failed")
            )

        # Map document type
        detected_type = result.get("document_type")
        if detected_type and detected_type != "unknown":
            try:
                final_doc_type = DocumentType(detected_type)
            except ValueError:
                final_doc_type = document_type
        else:
            final_doc_type = document_type

        doc_category = _get_category(final_doc_type.value)

        document = Document(
            user_id=user_id,
            document_type=final_doc_type,
            file_url=filepath,
            ocr_extracted={
                "fields": result.get("data"),
                "missing_fields": result.get("missing_fields", [])
            },
            doc_category=doc_category,
            source=result.get("source"),
            confidence=str(result.get("confidence")),
            verification_score=float(result.get("confidence")) if result.get("confidence") is not None else 0.0,
            status=DocumentStatus.extracted
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
