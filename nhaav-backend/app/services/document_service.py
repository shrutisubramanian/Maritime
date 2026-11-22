from app.models.profile import Profile, VerificationStatus
from app.models.document import DocumentStatus

import os
import uuid
from datetime import datetime

from fastapi import UploadFile, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
import logging

from app.models.document import Document, DocumentType
from app.models.user import User
from app.schemas import document
from app.services.admin_audit import (
    ACTION_APPROVED,
    ACTION_REJECTED,
    ENTITY_DOCUMENT,
    record_decision,
)
from app.services.ocr_service import process_document
from app.database import SessionLocal
from app.config import settings
from app.utils.file_signatures import validate_upload_signature

logger = logging.getLogger(__name__)


def _get_category(doc_type: str) -> str:
    return {
        "vendor_registration": "vendor_reg",
        "kyc_due_diligence":   "kyc",
        "form_10f":            "foreign_tax",
        "no_pe_declaration":   "foreign_tax",
        "tax_invoice":         "invoice",
    }.get(doc_type, "other")


def _remove_quietly(path: str) -> None:
    """Delete a rejected upload without masking the error that caused it."""
    try:
        os.remove(path)
    except OSError:
        pass


class DocumentService:

    @staticmethod
    async def upload_document(
        db: Session,
        user_id: uuid.UUID,
        document_type: DocumentType,
        file: UploadFile,
        background_tasks: BackgroundTasks = None
    ):

        os.makedirs(settings.DOCUMENT_UPLOAD_DIR, exist_ok=True)

        # Validate before touching disk: extension allowlist + size cap + a
        # sanitized basename (no directory components, so no path traversal).
        original_name = os.path.basename(file.filename or "")
        extension = os.path.splitext(original_name)[1].lower().lstrip(".")
        allowed = {
            item.strip().lower()
            for item in settings.DOCUMENT_UPLOAD_ALLOWED_EXTENSIONS.split(",")
            if item.strip()
        }
        if not original_name or not extension or extension not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Unsupported document type. Allowed extensions: "
                    + ", ".join(sorted(allowed))
                ),
            )

        filename = f"{uuid.uuid4()}_{original_name}"
        filepath = os.path.join(settings.DOCUMENT_UPLOAD_DIR, filename)

        # Streamed to disk in chunks, stopping at the cap. Reading the whole
        # body first (as this used to) meant a 25 MB limit that never bounded
        # memory: twenty concurrent onboarding uploads held 500 MB in RAM, and
        # an oversize body was buffered in full before being rejected.
        written = 0
        try:
            with open(filepath, "wb") as buffer:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > settings.DOCUMENT_UPLOAD_MAX_BYTES:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                "File too large. Maximum size is "
                                f"{settings.DOCUMENT_UPLOAD_MAX_BYTES} bytes."
                            ),
                        )
                    buffer.write(chunk)
        except HTTPException:
            # Never leave a half-written oversize file behind.
            _remove_quietly(filepath)
            raise

        # Extension and the browser's Content-Type are both attacker-supplied.
        # Validate the bytes that actually landed on disk before creating a
        # Document row or scheduling OCR.
        signature_ok, signature_error = validate_upload_signature(filepath, extension)
        if not signature_ok:
            _remove_quietly(filepath)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=signature_error,
            )

        doc_category = _get_category(document_type.value)

        document = Document(
            user_id=user_id,
            document_type=document_type,
            name=original_name,
            file_url=filepath,
            doc_category=doc_category,
            verification_status=DocumentStatus.pending
        )
        db.add(document)
        try:
            db.commit()
            db.refresh(document)
        except Exception:
            # A DB failure must not leave an unreferenced private document on
            # disk. Re-raise the original failure after removing the upload.
            db.rollback()
            _remove_quietly(filepath)
            raise

        # Generic uploads ("other") are evidence for manual admin review and
        # deliberately skip OCR. Specialized document types keep the extraction
        # pipeline they were designed for.
        #
        # Extraction runs inline, in the threadpool so the event loop keeps
        # serving, because the upload response has to carry the extraction
        # payload the Upload and verification screens render (fields,
        # missing_fields, field_completion_rate, confidence_available). A
        # background pass could not report fields it had not produced yet -
        # clients received an empty payload and never saw their own result.
        if document_type != DocumentType.other:
            result = None
            try:
                result = await run_in_threadpool(
                    process_document, filepath, document_type.value
                )
            except Exception:
                # A crashing extractor must not fail the upload or the row:
                # the document stays pending and recoverable.
                logger.exception("OCR failed for document %s", document.id)

            if result is not None:
                try:
                    DocumentService._apply_extraction(document, result)
                    db.commit()
                except Exception:
                    logger.exception("Could not store extraction for %s", document.id)
                    db.rollback()
                db.refresh(document)

        return document

    @staticmethod
    def _apply_extraction(document: Document, result: dict) -> None:
        """Write an extraction result onto the row (caller commits)."""
        if result.get("status") == "error":
            # The file could not be read as its declared type; an admin decides.
            document.verification_status = DocumentStatus.rejected
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
            "fields": result.get("fields") or result.get("data") or {},
            "missing_fields": result.get("missing_fields", []),
            # H7: the engines report no per-field accuracy, so the stored score
            # is completeness only and `confidence_available` says exactly that.
            "confidence_available": bool(result.get("confidence_available", False)),
            "confidence_reason": result.get("confidence_reason"),
            "field_completion_rate": result.get("field_completion_rate"),
        }
        document.source = result.get("source")
        document.verification_score = float(result.get("confidence") or 0.0)
        document.verification_status = DocumentStatus.extracted

    @staticmethod
    def verify_document(
        db: Session,
        document_id: uuid.UUID,
        verifier_id: uuid.UUID | None = None,
        admin: User | None = None,
    ):
        """Approve ONE verification document.

        A document decision deliberately does NOT change the account's
        verification verdict. Account approval is a separate, audited action
        that also enforces the submission's rule (documents on file, and for a
        client a bank transfer awaiting verification). Approving a single
        document used to mark the whole profile verified, which let one click
        clear an account whose paperwork or payment had not been reviewed.
        """
        document = db.query(Document).filter(
            Document.id == document_id
        ).first()

        if not document:
            raise ValueError("Document not found")

        document.verification_status = DocumentStatus.verified
        if verifier_id is not None:
            document.verified_by = verifier_id
            document.verified_at = datetime.utcnow()

        record_decision(
            db,
            entity_type=ENTITY_DOCUMENT,
            entity_id=document.id,
            admin=admin,
            action=ACTION_APPROVED,
        )

        db.commit()
        db.refresh(document)

        return document

    @staticmethod
    def reject_document(
        db: Session,
        document_id: uuid.UUID,
        verifier_id: uuid.UUID | None = None,
        reason: str | None = None,
        admin: User | None = None,
    ):
        """Reject ONE document. A reason is mandatory and is shown to the account.

        As with approval, the account's own verdict is not touched here: the
        reviewer rejects the account explicitly (with its own reason) once the
        submission as a whole has been assessed.
        """
        clean_reason = (reason or "").strip()
        if len(clean_reason) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A rejection reason of at least 3 characters is required.",
            )

        document = db.query(Document).filter(
            Document.id == document_id
        ).first()

        if not document:
            raise ValueError("Document not found")

        document.verification_status = DocumentStatus.rejected
        if verifier_id is not None:
            document.verified_by = verifier_id
            document.verified_at = datetime.utcnow()

        record_decision(
            db,
            entity_type=ENTITY_DOCUMENT,
            entity_id=document.id,
            admin=admin,
            action=ACTION_REJECTED,
            reason=clean_reason,
        )

        db.commit()
        db.refresh(document)

        return document
