import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class ModerationListing(BaseModel):
    """A single listing as seen in the admin moderation queue (both ecosystems)."""
    id: uuid.UUID
    kind: str = Field(..., description="service | supply")
    name: str
    category: str
    subcategory: Optional[str] = None
    description: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None

    # Owner info appropriate for an admin to see.
    owner_id: uuid.UUID
    owner_company: Optional[str] = None
    owner_email: Optional[str] = None

    # Matching keys / coverage.
    service_id: Optional[str] = None
    port_id: Optional[str] = None
    ports: List[str] = Field(default_factory=list)

    created_at: datetime
    updated_at: datetime


class ModerationQueueResponse(BaseModel):
    data: List[ModerationListing]
    total: int


class ModerationAction(BaseModel):
    """Approve or reject a listing, optionally with a reason."""
    status: str = Field(..., description="approved or rejected")
    reason: Optional[str] = Field(None, max_length=2000)


class ModerationActionResult(BaseModel):
    id: uuid.UUID
    kind: str
    status: str
    rejection_reason: Optional[str] = None
