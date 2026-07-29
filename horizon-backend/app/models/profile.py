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
    bio: Mapped[str | None] = mapped_column(String, nullable=True, comment="Short biography or description")
    years_experience: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Complex Data stored natively in PostgreSQL JSONB
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

    def __repr__(self) -> str:
        """String representation for easier debugging."""
        return f"<Profile(id={self.id}, user_id={self.user_id}, status={self.availability_status})>"
