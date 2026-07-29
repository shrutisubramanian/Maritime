from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.user import User
from app.models.document import Document, DocumentType
from app.schemas.document import DocumentResponse
from app.services.document_service import DocumentService
from app.models.document import Document, DocumentType

router = APIRouter(
    prefix="/documents",
    tags=["Documents"]
)


@router.post(
    "/upload"
)
async def upload_document(
    background_tasks: BackgroundTasks,
    document_type: DocumentType = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    document = await DocumentService.upload_document(
        db=db,
        user_id=current_user.id,
        document_type=document_type,
        file=file,
        background_tasks=background_tasks
    )
    
    return {
        "status": "Document uploaded successfully",
        "document": document
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

@router.get("/debug")
def debug_documents(
    db: Session = Depends(get_db)
):
    return db.query(Document).all()

@router.put(
    "/{document_id}/verify",
    response_model=DocumentResponse
)
def verify_document(
    document_id: str,
    db: Session = Depends(get_db)
):
    return DocumentService.verify_document(
        db=db,
        document_id=document_id
    )


@router.put(
    "/{document_id}/reject",
    response_model=DocumentResponse
)
def reject_document(
    document_id: str,
    db: Session = Depends(get_db)
):
    return DocumentService.reject_document(
        db=db,
        document_id=document_id
    )