# app/schemas/document.py

import uuid
from datetime import datetime
from pydantic import BaseModel

from app.models.document import DocumentType, DocumentStatus


class DocumentResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    document_type: DocumentType
    file_url: str
    status: DocumentStatus

    ocr_extracted: dict | None = None

    created_at: datetime

    class Config:
        from_attributes = True