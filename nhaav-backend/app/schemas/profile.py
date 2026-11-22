import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
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
    skills: Optional[List[str]] = Field(default_factory=list, description="Skills / capabilities used for filtering")
    ports_served: Optional[List[str]] = Field(default_factory=list, description="List of ports where the provider operates")
    
    contacts: Optional[List[dict]] = Field(default_factory=list, description="List of contacts")
    licenses: Optional[List[str]] = Field(default_factory=list, description="List of licenses")
    team: Optional[List[dict]] = Field(default_factory=list, description="List of team members")
    offices: Optional[List[str]] = Field(default_factory=list, description="List of offices")
    social_links: Optional[dict] = Field(default_factory=dict, description="Social media links")
    profile_metadata: Optional[dict] = Field(default_factory=dict, description="Custom maritime profile metadata")

    # Company-first marketplace details. `country` and `head_office` are kept
    # separate on purpose: "Country: India" and "Head office / main port"
    # answer different questions and are displayed as separate rows.
    country: Optional[str] = Field(None, max_length=80, description="Country of operation")
    head_office: Optional[str] = Field(
        None, max_length=160, description="Head office or main port of operation"
    )
    service_areas: Optional[List[str]] = Field(
        default_factory=list, description="Regions / coasts / ports the company covers"
    )
    location_lat: Optional[float] = Field(None, ge=-90, le=90)
    location_lng: Optional[float] = Field(None, ge=-180, le=180)
    
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
    skills: Optional[List[str]] = None
    ports_served: Optional[List[str]] = None
    
    contacts: Optional[List[dict]] = None
    licenses: Optional[List[str]] = None
    team: Optional[List[dict]] = None
    offices: Optional[List[str]] = None
    social_links: Optional[dict] = None
    profile_metadata: Optional[dict] = None
    
    availability_status: Optional[AvailabilityStatus] = None

    # --- company-first marketplace selection ---------------------------------
    # `primary_category` is a NAME from the taxonomy of the caller's vendor type;
    # the service resolves it to the persistent category row and enforces that
    # every subcategory belongs to it. One primary category, always.
    primary_category: Optional[str] = Field(
        None, description="Primary business category (single, vendor-type specific)"
    )
    subcategories: Optional[List[str]] = Field(
        None, description="Capabilities under the primary category"
    )
    #: Further business categories the company also operates in (e.g. a ship
    #: chandler that also supplies paints). Purely descriptive: they are shown on
    #: the public profile and never change what the marketplace files the company
    #: under, which stays the single primary category.
    additional_categories: Optional[List[str]] = Field(
        None,
        max_length=5,
        description=(
            "Other business categories the company also operates in. Shown on the "
            "profile; they never affect marketplace discovery."
        ),
    )

    # --- marketplace location -------------------------------------------------
    # `head_office` MUST be a port from the catalogue: it is what places the
    # company under a port filter in the marketplace. `ports_served` is the
    # wider list of ports the company works in — profile information only, it
    # never creates extra discovery entries.
    country: Optional[str] = Field(None, max_length=80)
    head_office: Optional[str] = Field(
        None, max_length=160, description="Port the company's head office operates from"
    )
    service_areas: Optional[List[str]] = Field(
        None, description="Regions / coasts the company covers"
    )
    location_lat: Optional[float] = Field(None, ge=-90, le=90)
    location_lng: Optional[float] = Field(None, ge=-180, le=180)

class ProfileExcelImportValues(BaseModel):
    """The nine importable fields, as edited in the import review form.

    Multi-value fields arrive as a comma-separated string (or a list); the
    importer normalises them exactly as it does for a workbook cell.
    """
    primary_category: Optional[Any] = None
    other_categories: Optional[Any] = None
    additional_categories: Optional[Any] = None
    head_office: Optional[Any] = None
    phone: Optional[Any] = None
    other_ports: Optional[Any] = None
    social_links: Optional[Any] = None
    registration_number: Optional[Any] = None
    email: Optional[Any] = None
    address: Optional[Any] = None
    # Extra profile fields a wider (legacy) workbook carries. They have no input
    # in the review form, but the form sends them back so editing one field does
    # not drop them from the import.
    company_name: Optional[Any] = None
    company_type: Optional[Any] = None


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
    # Read-only projections of the category relationship (see Profile model).
    primary_category_name: Optional[str] = None
    subcategory_names: List[str] = Field(default_factory=list)
    # Company brochure metadata (the stored path is never exposed).
    brochure_filename: Optional[str] = None
    brochure_size_bytes: Optional[int] = None
    brochure_uploaded_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    # This allows Pydantic to read directly from SQLAlchemy ORM objects
    model_config = ConfigDict(from_attributes=True)

class PublicServiceItem(BaseModel):
    """Approved service listing as shown on a provider's public profile."""
    id: uuid.UUID
    name: str
    category: str
    subcategory: Optional[str] = None
    description: Optional[str] = None
    pricing_model: Optional[str] = None
    # Listed price in INTEGER PAISE. Absent (None) means the provider published
    # no figure, so callers show "Price on request" instead of guessing.
    price_paise: Optional[int] = None
    price_note: Optional[str] = None
    service_id: Optional[str] = None
    port_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PublicListingSummary(BaseModel):
    """Approved supply listing summary as shown on a supplier's public profile."""
    id: uuid.UUID
    name: str
    category: str
    subcategory: Optional[str] = None
    description: Optional[str] = None
    # Listed price in INTEGER PAISE, same convention as a service listing.
    # None means no figure was published, so the UI says "Price on request".
    price_paise: Optional[int] = None
    price_note: Optional[str] = None
    ports: Optional[List[str]] = None
    availability: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PublicProfileResponse(BaseModel):
    """
    Safe, public view of a provider/supplier profile.

    Excludes PII and private/administrative data: the contacts list, team,
    licenses, offices, the rest of profile_metadata, uploaded KYC documents and
    verification audit details are never included here.

    Two business facts ARE public, because a buyer needs them: the company's
    published social links (``social_links``) and its registered address
    (``address``). Both are the company's own storefront information, not KYC.

    `phone` is the ONE deliberately public business contact: a buyer looking at
    a card must be able to reach the company. It is the account's single number,
    never the private `contacts` list.
    """
    id: uuid.UUID
    user_id: uuid.UUID
    role: str
    company_name: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    bio: Optional[str] = None
    years_experience: Optional[int] = None
    ports_served: Optional[List[str]] = None
    availability_status: AvailabilityStatus
    verification_status: VerificationStatus
    badge_label: Optional[str] = None
    rating_avg: float
    jobs_completed: int
    services: List[PublicServiceItem] = Field(default_factory=list)
    listings: List[PublicListingSummary] = Field(default_factory=list)

    # Company-first profile content. These are public business facts, never KYC.
    primary_category_name: Optional[str] = None
    subcategory_names: List[str] = Field(default_factory=list)
    #: Other categories the company also operates in. Descriptive only: the
    #: marketplace still files (and discovers) the company under its primary one.
    additional_categories: List[str] = Field(default_factory=list)
    country: Optional[str] = None
    head_office: Optional[str] = None
    service_areas: Optional[List[str]] = None
    # Public capability tags: business facts, not KYC/contact data.
    skills: Optional[List[str]] = None
    # Storefront information: the company's own published links, address and
    # business registration number. Empty values are dropped, never sent as
    # placeholders.
    social_links: Optional[Dict[str, str]] = None
    address: Optional[str] = None
    registration_number: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    # Paid visibility window (so the profile can say "listed until ...").
    visibility_expires_at: Optional[datetime] = None


class ProfilePaginatedResponse(BaseModel):
    """
    Schema for paginated profile results (e.g. searching the provider marketplace).
    Wraps the data array with pagination metadata.

    Admin/owner surfaces may still use this full schema. Public marketplace
    search MUST use ``PublicProfilePaginatedResponse``.
    """
    data: List[ProfileResponse]
    total: int
    page: int
    pages: int


class PublicProfilePaginatedResponse(BaseModel):
    """Paginated safe profile results for anonymous/public marketplace search."""
    data: List[PublicProfileResponse]
    total: int
    page: int
    pages: int
