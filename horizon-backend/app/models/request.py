import uuid
import enum
from datetime import datetime
from sqlalchemy import String, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class UrgencyLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"

class RequestStatus(str, enum.Enum):
    open = "open"
    quoted = "quoted"
    assigned = "assigned"
    completed = "completed"
    cancelled = "cancelled"

class ServiceRequest(Base):
    """
    Model representing a service request (job) posted by a client.
    Named 'ServiceRequest' instead of 'Request' to avoid collision with FastAPI's HTTP Request class.
    """
    __tablename__ = "service_requests"

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    
    # Foreign Key to User (acting as the Client posting the job)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Back-reference to the User model
    client: Mapped["User"] = relationship(back_populates="service_requests")
    
    # Job Details
    service_type: Mapped[str] = mapped_column(String, nullable=False, comment="Category of service required (e.g., 'Hull Inspection')")
    port: Mapped[str] = mapped_column(String, nullable=False, comment="Port or location where the service is needed")
    description: Mapped[str | None] = mapped_column(String, nullable=True, comment="Detailed scope of work and vessel specifics")
    
    # Enums
    urgency: Mapped[UrgencyLevel] = mapped_column(SQLEnum(UrgencyLevel), nullable=False, default=UrgencyLevel.medium)
    status: Mapped[RequestStatus] = mapped_column(SQLEnum(RequestStatus), nullable=False, default=RequestStatus.open)
    
    # One-to-Many relationship to Quotes (Quotes received for this request)
    quotes: Mapped[list["Quote"]] = relationship(back_populates="request", cascade="all, delete-orphan")
    
    # One-to-One relationship to Job (If the request is accepted and assigned)
    job: Mapped["Job"] = relationship(back_populates="request", uselist=False, cascade="all, delete-orphan")
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        """String representation for easier debugging."""
        return f"<ServiceRequest(id={self.id}, client_id={self.client_id}, type={self.service_type}, status={self.status})>"
