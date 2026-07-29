import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.profile import AvailabilityStatus, VerificationStatus
from app.schemas.service import ServiceResponse

class ProfileBase(BaseModel):
    """
    Base schema containing common fields for the Profile.
    Used to share attributes between Create, Update, and Response schemas.
    """
    position: Optional[str] = Field(None, description="Job title or role description")
    company_name: Optional[str] = Field(None, description="Name of the company or vessel")
    bio: Optional[str] = Field(None, description="Short biography or description")
    years_experience: Optional[int] = Field(0, ge=0, description="Years of professional experience (must be >= 0)")
    ports_served: Optional[List[str]] = Field(default_factory=list, description="List of ports where the provider operates")
    
    contacts: Optional[List[dict]] = Field(default_factory=list, description="List of contacts")
    licenses: Optional[List[str]] = Field(default_factory=list, description="List of licenses")
    team: Optional[List[dict]] = Field(default_factory=list, description="List of team members")
    offices: Optional[List[str]] = Field(default_factory=list, description="List of offices")
    social_links: Optional[dict] = Field(default_factory=dict, description="Social media links")
    profile_metadata: Optional[dict] = Field(default_factory=dict, description="Custom maritime profile metadata")
    
    availability_status: Optional[AvailabilityStatus] = Field(
        AvailabilityStatus.available, description="Current working status of the provider"
    )

class ProfileCreate(ProfileBase):
    """
    Schema for creating a new Profile.
    Inherits fields from ProfileBase. Clients use this schema in POST requests.
    Note: We omit fields like 'verification_status' or 'badge_label' because 
    those are system-controlled attributes that a user shouldn't set themselves upon creation.
    """
    pass

class ProfileUpdate(BaseModel):
    """
    Schema for updating an existing Profile.
    All fields are completely optional to support partial updates (PATCH requests).
    """
    position: Optional[str] = None
    company_name: Optional[str] = None
    bio: Optional[str] = None
    years_experience: Optional[int] = Field(None, ge=0)
    ports_served: Optional[List[str]] = None
    
    contacts: Optional[List[dict]] = None
    licenses: Optional[List[str]] = None
    team: Optional[List[dict]] = None
    offices: Optional[List[str]] = None
    social_links: Optional[dict] = None
    profile_metadata: Optional[dict] = None
    
    availability_status: Optional[AvailabilityStatus] = None

class ProfileResponse(ProfileBase):
    """
    Schema for reading a Profile from the API.
    Includes system-generated fields like IDs, metrics, and timestamps.
    Used to format outgoing JSON responses.
    """
    id: uuid.UUID
    user_id: uuid.UUID
    verification_status: VerificationStatus
    badge_label: Optional[str] = None
    rating_avg: float
    jobs_completed: int
    services: Optional[List[ServiceResponse]] = None
    created_at: datetime
    updated_at: datetime

    # This allows Pydantic to read directly from SQLAlchemy ORM objects
    model_config = ConfigDict(from_attributes=True)

class ProfilePaginatedResponse(BaseModel):
    """
    Schema for paginated profile results (e.g. searching the provider marketplace).
    Wraps the data array with pagination metadata.
    """
    data: List[ProfileResponse]
    total: int
    page: int
    pages: int
