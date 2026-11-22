import logging
import os
import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.user import User, UserRole
from app.models.document import Document, DocumentType
from app.schemas.document import DocumentResponse
from app.services.document_service import DocumentService
from app.services.rate_limit_service import RateLimitService

router = APIRouter(
    prefix="/documents",
    tags=["Documents"]
)

logger = logging.getLogger(__name__)


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Admin-only guard for verification actions (same policy as moderation)."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


@router.post(
    "/upload"
)
async def upload_document(
    document_type: DocumentType = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rl: None = Depends(RateLimitService.rate_limit_user("document_upload")),
):
    document = await DocumentService.upload_document(
        db=db,
        user_id=current_user.id,
        document_type=document_type,
        file=file,
    )

    stored = document.ocr_extracted_data or {}

    # `status` is the machine-readable result clients gate on ("success"), while
    # `message` carries the human sentence. Returning the sentence in `status`
    # meant every caller that checked for "success" treated a real upload as a
    # failure.
    #
    # The extraction payload is mirrored here (and inside
    # `document.ocr_extracted_data`) because Upload renders it inline without a
    # follow-up GET. `confidence` is the legacy completeness percentage;
    # `confidence_available` is always False because no OCR engine here reports
    # field-level accuracy (H7 contract).
    return {
        "status": "success",
        "message": "Document uploaded successfully",
        "document": document,
        "document_type": getattr(document, "document_type", None),
        "confidence": document.verification_score,
        "confidence_available": stored.get("confidence_available", False),
        "confidence_reason": stored.get("confidence_reason"),
        "field_completion_rate": stored.get("field_completion_rate"),
        "fields": stored.get("fields"),
        "missing_fields": stored.get("missing_fields", []),
    }


@router.get(
    "/me",
    response_model=list[DocumentResponse]
)
def get_my_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Document).filter(
        Document.user_id == current_user.id
    ).all()

@router.get(
    "/{document_id}/file",
    summary="Download one of the current user's own stored documents"
)
def get_my_document_file(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Serve a stored document as a blob to its OWNER (admins may also read).

    `services/documents.ts -> getDocumentFile` calls this to render inline
    previews with the caller's JWT. Storage is a local upload directory (see
    DocumentService.upload_document) and documents are never exposed on a
    public URL, so the lookup is scoped to the caller: someone else's document
    is a 403, an unknown id a 404.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if doc.user_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to access this document",
        )
    if not doc.file_url or not os.path.isfile(doc.file_url):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file not found")

    return FileResponse(
        doc.file_url,
        filename=doc.name or os.path.basename(doc.file_url),
    )


@router.delete(
    "/{document_id}",
    summary="Delete one of the current user's own documents"
)
def delete_my_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a document the caller owns, together with its stored bytes.

    Owner-only: admins have verify/reject, and must not be able to destroy a
    user's evidence. The row is committed away BEFORE the file is unlinked, so
    a storage error can never leave a row pointing at a file that is gone.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if doc.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to delete this document",
        )

    stored_path = doc.file_url
    db.delete(doc)
    db.commit()

    if stored_path and os.path.isfile(stored_path):
        try:
            os.remove(stored_path)
        except OSError:
            # The document is already gone from the user's view; a leftover
            # blob on disk is an operator concern, not a client error.
            logger.warning("Could not remove stored document file %s", stored_path)

    return {"status": "Document deleted"}


@router.put(
    "/{document_id}/verify",
    response_model=DocumentResponse
)
def verify_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin)
):
    try:
        return DocumentService.verify_document(
            db=db,
            document_id=document_id,
            verifier_id=admin.id,
            admin=admin,
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")


@router.put(
    "/{document_id}/reject",
    response_model=DocumentResponse
)
def reject_document(
    document_id: uuid.UUID,
    reason: str | None = Query(
        None,
        description=(
            "Why the document is rejected (required; validated after the admin "
            "check so an anonymous caller still gets 401, not 422)"
        ),
    ),
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin)
):
    try:
        return DocumentService.reject_document(
            db=db,
            document_id=document_id,
            verifier_id=admin.id,
            reason=reason,
            admin=admin,
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")