import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

# Define enums for statuses
class AvailabilityStatus(str, enum.Enum):
    available = "available"
    busy = "busy"
    unavailable = "unavailable"

class VerificationStatus(str, enum.Enum):
    pending = "pending"
    verified = "verified"
    rejected = "rejected"

class Profile(Base):
    """
    Profile model containing business-specific details for a user in the marketplace.
    Separates authentication logic (User) from professional attributes (Profile).
    """
    __tablename__ = "profiles"

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    
    # One-to-One Relationship with User
    # unique=True enforces that a user can only have one profile
    # ondelete="CASCADE" ensures the profile is deleted if the user is deleted
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # Back-reference to the User model
    user: Mapped["User"] = relationship(back_populates="profile")
    
    # Professional Details
    position: Mapped[str | None] = mapped_column(String, nullable=True, comment="Job title or role description")
    company_name: Mapped[str | None] = mapped_column(String, nullable=True, comment="Name of the company or vessel")
    
    # Organization membership — the STABLE identity for company-level
    # entitlements (access-token pools). company_name above is DISPLAY ONLY:
    # pool membership is keyed off this FK, never off the name string. Nullable
    # because membership is always assigned explicitly (admin/dev provisioning);
    # there is intentionally no fuzzy/string backfill of existing profiles.
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    bio: Mapped[str | None] = mapped_column(String, nullable=True, comment="Short biography or description")
    years_experience: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ---------------------------------------------- company-first marketplace
    # EXACTLY ONE primary business category, chosen from the taxonomy of the
    # company's vendor type (supplier or service provider). This is what the
    # marketplace browses by: a category click lists the COMPANIES in it.
    # Nullable only for legacy companies that have not chosen one yet; such a
    # company is listed under no marketplace category (the marketplace never
    # derives one from its listings — see
    # VendorTaxonomyService.effective_category_names).
    primary_category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("vendor_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    country: Mapped[str | None] = mapped_column(String(80), nullable=True, comment="Country of operation")
    # Head office / main port of operation — deliberately SEPARATE from country
    # and from the other ports the company serves.
    head_office: Mapped[str | None] = mapped_column(
        String(160), nullable=True, comment="Head office or main port of operation"
    )
    service_areas: Mapped[list[str] | None] = mapped_column(
        JSON, nullable=True, comment="Service/supply coverage areas (regions, coasts, ports)"
    )
    # Business location for the profile map. Never fabricated: NULL means no map.
    location_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_lng: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Company brochure (PDF, up to 15 MB): whatever the company wants to hand to
    # a buyer. Private storage; served only through the authorized endpoint that
    # re-checks marketplace access and discovery eligibility.
    brochure_path: Mapped[str | None] = mapped_column(String, nullable=True)
    brochure_filename: Mapped[str | None] = mapped_column(String, nullable=True)
    brochure_content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    brochure_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    brochure_uploaded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    primary_category: Mapped["VendorCategory | None"] = relationship(
        "VendorCategory", foreign_keys=[primary_category_id], lazy="joined"
    )
    # Declared + admin-approved capabilities under the primary category.
    subcategory_links: Mapped[list["ProfileSubcategory"]] = relationship(
        "ProfileSubcategory", cascade="all, delete-orphan", lazy="selectin"
    )
    
    # Complex Data stored natively in PostgreSQL JSONB
    # Free-form capabilities used by the marketplace `skill` filter. Nullable so
    # legacy profiles keep working; an empty/absent list means "no skills listed".
    skills: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, comment="Skills / capabilities used for filtering")
    ports_served: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, comment="List of ports where the provider operates")
    
    # 1-to-Many Relationship to dedicated Service model
    services: Mapped[list["Service"]] = relationship("Service", back_populates="provider", cascade="all, delete-orphan")
    
    # Extended Company Profile Data
    contacts: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True, comment="List of contacts (name, email, phone)")
    licenses: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, comment="List of licenses")
    team: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True, comment="List of team members")
    offices: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, comment="List of office locations")
    social_links: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="Social media URLs")
    profile_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="Custom maritime profile metadata")
    
    # Status Enums
    availability_status: Mapped[AvailabilityStatus] = mapped_column(
        SQLEnum(AvailabilityStatus), nullable=False, default=AvailabilityStatus.available
    )
    verification_status: Mapped[VerificationStatus] = mapped_column(
        SQLEnum(VerificationStatus), nullable=False, default=VerificationStatus.pending
    )
    
    # Reputation & Metrics
    badge_label: Mapped[str | None] = mapped_column(String, nullable=True, comment="e.g., 'Top Rated', 'Verified Tech'")
    rating_avg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    jobs_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def primary_category_name(self) -> str | None:
        """The company's single marketplace category, as a plain name."""
        category = self.primary_category
        return category.name if category is not None else None

    @property
    def subcategory_names(self) -> list[str]:
        """Declared capabilities under the primary category, alphabetical."""
        names: list[str] = []
        for link in self.subcategory_links or []:
            sub = getattr(link, "subcategory", None)
            if sub is not None:
                names.append(sub.name)
        return sorted(names)

    def __repr__(self) -> str:
        """String representation for easier debugging."""
        return f"<Profile(id={self.id}, user_id={self.user_id}, status={self.availability_status})>"
