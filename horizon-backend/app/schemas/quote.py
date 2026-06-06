import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.quote import QuoteStatus

class QuoteBase(BaseModel):
    """
    Base schema for a Quote containing common data fields.
    Centralizes validation for fields shared across creation and responses.
    """
    amount: float = Field(..., gt=0, description="The monetary value of the quote (must be strictly greater than 0)")
    currency: str = Field(..., min_length=3, max_length=3, description="3-letter currency code (e.g., USD, EUR)")
    message: Optional[str] = Field(None, description="Additional message, breakdown, or terms attached to the quote")

class QuoteCreate(QuoteBase):
    """
    Schema for creating a new Quote.
    Used by Providers when they submit a bid for a Service Request.
    'status' is intentionally omitted so providers cannot submit a quote that is already 'accepted'.
    (Note: 'request_id' is typically provided in the URL path, so it's omitted from the body payload).
    """
    pass

class QuoteUpdate(BaseModel):
    """
    Schema for updating an existing Quote.
    All fields are Optional to support partial updates (PATCH requests).
    - Providers might use this to update their 'amount' or 'message' if the quote is still pending.
    - Clients might use this to update the 'status' to 'accepted' or 'rejected'.
    """
    amount: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    message: Optional[str] = None
    status: Optional[QuoteStatus] = None

class QuoteResponse(QuoteBase):
    """
    Schema for returning a Quote from the API.
    Used in GET endpoints. Includes system-generated fields like 
    primary keys, foreign keys (request_id, provider_id), the current status, and timestamps.
    """
    id: uuid.UUID
    request_id: uuid.UUID
    provider_id: uuid.UUID
    status: QuoteStatus
    created_at: datetime
    updated_at: datetime

    # Instructs Pydantic to extract data directly from SQLAlchemy ORM objects
    model_config = ConfigDict(from_attributes=True)
