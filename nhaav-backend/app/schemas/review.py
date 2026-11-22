import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    job_id: uuid.UUID
    rating: int = Field(..., ge=1, le=5)
    communication: Optional[int] = Field(None, ge=1, le=5)
    quality: Optional[int] = Field(None, ge=1, le=5)
    timeliness: Optional[int] = Field(None, ge=1, le=5)
    professionalism: Optional[int] = Field(None, ge=1, le=5)
    comment: Optional[str] = None
    review_text: Optional[str] = None


class ReviewResponse(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    reviewer_id: uuid.UUID
    reviewed_user_id: uuid.UUID
    rating: int
    comment: str | None
    created_at: datetime

    class Config:
        from_attributes = True