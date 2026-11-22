import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.models.service import ServiceListingStatus


class ServiceBase(BaseModel):
    name: str
    category: str
    subcategory: Optional[str] = None
    description: Optional[str] = None
    pricing_model: Optional[str] = None
    # Listed price for this provider's own offering, in INTEGER PAISE
    # (₹1,000 -> 100000). Optional: a provider may leave it unset and the
    # marketplace shows "Price on request". Never floats.
    price_paise: Optional[int] = Field(None, ge=0, description="Listed price in paise (0 or more)")
    price_note: Optional[str] = Field(None, max_length=60, description="Unit, e.g. per survey, per day")

    # Deterministic matching keys (mirror the request's service_type / port).
    service_id: Optional[str] = Field(None, description="Canonical service key used for matching")
    port_id: Optional[str] = Field(None, description="Port served by this listing")


class ServiceCreate(ServiceBase):
    """
    Provider creation payload. `status` / `is_active` are intentionally absent —
    lifecycle is server-controlled (draft, or pending_review via submit_now).
    """
    certifications_required: Optional[List[str]] = None
    images: Optional[List[str]] = None
    submit_now: bool = Field(default=False, description="Create then immediately submit for review")


class ServiceUpdate(BaseModel):
    """Partial update. `status` / `is_active` are deliberately excluded."""
    name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    description: Optional[str] = None
    pricing_model: Optional[str] = None
    price_paise: Optional[int] = Field(None, ge=0)
    price_note: Optional[str] = Field(None, max_length=60)
    service_id: Optional[str] = None
    port_id: Optional[str] = None
    certifications_required: Optional[List[str]] = None
    images: Optional[List[str]] = None


class ServiceModerate(BaseModel):
    """Admin moderation action."""
    status: ServiceListingStatus = Field(..., description="approved or rejected")


class ServiceResponse(ServiceBase):
    id: uuid.UUID
    provider_id: uuid.UUID
    is_active: bool
    status: ServiceListingStatus
    certifications_required: Optional[List[str]] = None
    images: Optional[List[str]] = None
    # Paid placement: ₹1,000 buys 1 month, ₹10,000 buys 1 year. `is_live` is the
    # single answer to "would a buyer see this card right now?".
    published_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_live: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ServicePaginatedResponse(BaseModel):
    data: List[ServiceResponse]
    total: int
    page: int
    pages: int
