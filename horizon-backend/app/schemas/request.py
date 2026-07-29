import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.request import UrgencyLevel, RequestStatus

class ServiceRequestBase(BaseModel):
    """
    Base schema for ServiceRequest containing core data fields.
    Centralizes validation logic for shared attributes.
    """
    title: str = Field(..., description="Title of the procurement request")
    service_type: str = Field(..., description="Category of service required (e.g., 'Hull Inspection')")
    subcategory: Optional[str] = Field(None, description="Subcategory of the service")
    vessel_name: Optional[str] = Field(None, description="Name of the vessel")
    vessel_type: Optional[str] = Field(None, description="Type of the vessel")
    port: str = Field(..., description="Port or location where the service is needed")
    description: Optional[str] = Field(None, description="Detailed scope of work and vessel specifics")
    budget: Optional[float] = Field(None, description="Estimated budget")
    required_completion_date: Optional[datetime] = Field(None, description="Required completion date")
    attachments: Optional[List[str]] = Field(None, description="List of attachment URLs")
    urgency: UrgencyLevel = Field(default=UrgencyLevel.medium, description="Urgency of the request")

class ServiceRequestCreate(ServiceRequestBase):
    """
    Schema for creating a new Service Request.
    Used in POST endpoints by clients. Inherits required fields from Base.
    We specifically omit fields like 'status' here so that clients cannot
    maliciously spawn a request with an 'assigned' or 'completed' status.
    """
    pass

class ServiceRequestUpdate(BaseModel):
    """
    Schema for updating an existing Service Request.
    Used in PUT/PATCH endpoints. All fields are explicitly marked as Optional
    to support partial updates (updating just one field without erasing others).
    """
    title: Optional[str] = None
    service_type: Optional[str] = None
    subcategory: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_type: Optional[str] = None
    port: Optional[str] = None
    description: Optional[str] = None
    budget: Optional[float] = None
    required_completion_date: Optional[datetime] = None
    attachments: Optional[List[str]] = None
    urgency: Optional[UrgencyLevel] = None
    # We include status here so that the client (or an admin) can mark it as 'cancelled'
    status: Optional[RequestStatus] = None
    selected_quotation_id: Optional[uuid.UUID] = None

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
