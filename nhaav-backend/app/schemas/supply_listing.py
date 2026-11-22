import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.supply_listing import SupplyListingStatus


class SupplyListingBase(BaseModel):
    name: str = Field(..., description="Product/supply name")
    category: str = Field(..., description="Top-level supply category")
    subcategory: Optional[str] = None
    description: Optional[str] = None

    manufacturer: Optional[str] = None
    model_number: Optional[str] = None
    part_number: Optional[str] = None
    condition: Optional[str] = Field(None, description="oem / aftermarket / refurbished")
    country_of_origin: Optional[str] = None
    specifications: Optional[dict] = Field(None, description="Free-form key/value specifications")

    availability: Optional[str] = None
    lead_time: Optional[str] = None
    minimum_order_quantity: Optional[int] = Field(None, ge=1)
    # Listed price in INTEGER PAISE (₹1,000 -> 100000). Optional: leave unset and
    # the marketplace shows "Price on request". Never floats.
    price_paise: Optional[int] = Field(None, ge=0, description="Listed price in paise")
    price_note: Optional[str] = Field(None, max_length=60, description="Unit, e.g. per metre, per drum")

    ports: Optional[List[str]] = None
    images: Optional[List[str]] = None
    datasheets: Optional[List[str]] = None


class SupplyListingCreate(SupplyListingBase):
    """
    Creation payload for a supplier.
    `status` is intentionally omitted — a supplier can only create a draft or
    submit for review (see SupplyListingSubmit). Approval is admin-only.
    """
    submit_now: bool = Field(default=False, description="Create then immediately submit for review")


class SupplyListingUpdate(BaseModel):
    """Partial update. `status` is deliberately excluded — lifecycle is server-controlled."""
    name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    model_number: Optional[str] = None
    part_number: Optional[str] = None
    condition: Optional[str] = None
    country_of_origin: Optional[str] = None
    specifications: Optional[dict] = None
    availability: Optional[str] = None
    lead_time: Optional[str] = None
    minimum_order_quantity: Optional[int] = Field(None, ge=1)
    price_paise: Optional[int] = None
    price_note: Optional[str] = None
    ports: Optional[List[str]] = None
    images: Optional[List[str]] = None
    datasheets: Optional[List[str]] = None


class SupplyListingModerate(BaseModel):
    """Admin moderation action."""
    status: SupplyListingStatus = Field(..., description="approved or rejected")


class SupplyListingResponse(SupplyListingBase):
    id: uuid.UUID
    supplier_id: uuid.UUID
    status: SupplyListingStatus
    # Paid placement: ₹1,000 buys 60 days on the marketplace.
    published_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_live: bool = False
    created_at: datetime
    updated_at: datetime
    # The seller's company name, resolved from their profile so a card never
    # shows an anonymous product. Null only when the supplier has no profile.
    supplier_company_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SupplyListingPaginatedResponse(BaseModel):
    data: List[SupplyListingResponse]
    total: int
    page: int
    pages: int
