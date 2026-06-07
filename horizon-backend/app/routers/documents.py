from fastapi import APIRouter, Depends, UploadFile, File, Form
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
    "/upload",
    response_model=DocumentResponse
)
async def upload_document(
    document_type: DocumentType = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await DocumentService.upload_document(
        db=db,
        user_id=current_user.id,
        document_type=document_type,
        file=file
    )


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