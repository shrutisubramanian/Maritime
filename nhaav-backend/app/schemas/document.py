import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.models.document import DocumentType, DocumentStatus

class DocumentBase(BaseModel):
    name: Optional[str] = None
    file_path: Optional[str] = None
    file_type: Optional[str] = None
    size_bytes: Optional[int] = None
    document_type: Optional[str] = None

class DocumentCreate(DocumentBase):
    pass

class DocumentUpdate(BaseModel):
    verification_status: Optional[str] = None
    expiry_date: Optional[datetime] = None
    ocr_extracted_data: Optional[dict] = None
    verified_by: Optional[uuid.UUID] = None
    verified_at: Optional[datetime] = None

class DocumentResponse(DocumentBase):
    id: uuid.UUID
    user_id: uuid.UUID
    file_url: str
    verification_status: str
    expiry_date: Optional[datetime] = None
    ocr_extracted_data: Optional[dict] = None
    extracted_text: Optional[str] = None
    doc_category: Optional[str] = None
    source: Optional[str] = None
    verified_by: Optional[uuid.UUID] = None
    verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)