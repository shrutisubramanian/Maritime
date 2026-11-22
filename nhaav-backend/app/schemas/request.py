import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator

from app.models.request import UrgencyLevel, RequestStatus, RequestType
from app.utils.url_safety import validate_attachment_list

class ServiceRequestBase(BaseModel):
    """
    Base schema for ServiceRequest containing core data fields.
    Centralizes validation logic for shared attributes.
    """
    title: str = Field(..., description="Title of the procurement request")
    request_type: RequestType = Field(default=RequestType.service, description="'service' routes to providers, 'supply' routes to suppliers")
    service_type: str = Field(..., description="Category of service required (e.g., 'Hull Inspection')")
    subcategory: Optional[str] = Field(None, description="Subcategory of the service")
    vessel_name: Optional[str] = Field(None, description="Name of the vessel")
    vessel_type: Optional[str] = Field(None, description="Type of the vessel")
    port: str = Field(..., description="Port or location where the service is needed")
    description: Optional[str] = Field(None, description="Detailed scope of work and vessel specifics")
    budget: Optional[float] = Field(None, description="Estimated budget")
    quantity: Optional[int] = Field(None, ge=1, description="Quantity required (procurement requests)")
    specifications: Optional[dict] = Field(None, description="Free-form specification key/value pairs for supply requests")
    required_completion_date: Optional[datetime] = Field(None, description="Required completion date")
    attachments: Optional[List[str]] = Field(None, description="List of attachment URLs")
    urgency: UrgencyLevel = Field(default=UrgencyLevel.medium, description="Urgency of the request")

class ServiceRequestCreate(ServiceRequestBase):
    """
    Schema for creating a new Service Request.
    Used in POST endpoints by clients. Inherits required fields from Base.
    We specifically omit fields like 'status' here so that clients cannot
    maliciously spawn a request with an 'assigned' or 'completed' status.

    Attachments are validated on the way IN only (see app/utils/url_safety.py):
    the response model stays permissive so a row stored before this rule existed
    can always be read back.
    """

    @field_validator("attachments")
    @classmethod
    def _attachments_are_safe(cls, v):
        return validate_attachment_list(v)

class ServiceRequestUpdate(BaseModel):
    """
    Schema for updating an existing Service Request.
    Used in PUT/PATCH endpoints. All fields are explicitly marked as Optional
    to support partial updates (updating just one field without erasing others).
    """
    title: Optional[str] = None
    request_type: Optional[RequestType] = None
    service_type: Optional[str] = None
    subcategory: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_type: Optional[str] = None
    port: Optional[str] = None
    description: Optional[str] = None
    budget: Optional[float] = None
    quantity: Optional[int] = Field(None, ge=1)
    specifications: Optional[dict] = None
    required_completion_date: Optional[datetime] = None
    attachments: Optional[List[str]] = None
    urgency: Optional[UrgencyLevel] = None
    # We include status here so that the client (or an admin) can mark it as 'cancelled'
    status: Optional[RequestStatus] = None
    selected_quotation_id: Optional[uuid.UUID] = None

    @field_validator("attachments")
    @classmethod
    def _attachments_are_safe(cls, v):
        return validate_attachment_list(v)

class ServiceRequestResponse(ServiceRequestBase):
    """
    Schema for returning a Service Request from the API.
    Used as the response_model in GET endpoints. Includes system-generated 
    fields like the primary key, foreign keys, status, and timestamps.
    """
    id: uuid.UUID
    client_id: uuid.UUID
    status: RequestStatus
    selected_quotation_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    # Instructs Pydantic to extract data directly from SQLAlchemy ORM objects
    model_config = ConfigDict(from_attributes=True)


class PublicServiceRequestResponse(BaseModel):
    """Anonymous marketplace view of an open request.

    Deliberately excludes the client's identity, budget, attachment locations
    and award state. Those fields are released only to an authenticated,
    marketplace-eligible caller (see GET /requests/).
    """
    id: uuid.UUID
    title: str
    request_type: RequestType
    service_type: str
    subcategory: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_type: Optional[str] = None
    port: str
    description: Optional[str] = None
    quantity: Optional[int] = None
    specifications: Optional[dict] = None
    required_completion_date: Optional[datetime] = None
    urgency: UrgencyLevel
    status: RequestStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ServiceRequestPaginatedResponse(BaseModel):
    """
    Schema for a paginated list of Service Requests.
    Used for endpoints like GET /requests to return arrays of data alongside
    standardized pagination metadata.
    """
    data: List[ServiceRequestResponse]
    total: int
    page: int
    pages: int


class PublicServiceRequestPaginatedResponse(BaseModel):
    """Paginated anonymous request list (no private procurement fields)."""
    data: List[PublicServiceRequestResponse]
    total: int
    page: int
    pages: int
