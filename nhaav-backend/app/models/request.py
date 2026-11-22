import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class RequestType(str, enum.Enum):
    """
    Discriminates the two parallel marketplace ecosystems.
    - service  -> routed to Service Providers (service marketplace)
    - supply   -> routed to Suppliers (supplies marketplace)
    """
    service = "service"
    supply = "supply"

class UrgencyLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"

class RequestStatus(str, enum.Enum):
    open = "open"
    quoted = "quoted"
    assigned = "assigned"
    awarded = "awarded"
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
    title: Mapped[str] = mapped_column(String, nullable=False, default="Untitled Request", comment="Title of the procurement request")
    request_type: Mapped[RequestType] = mapped_column(SQLEnum(RequestType), nullable=False, default=RequestType.service, comment="'service' routes to providers, 'supply' routes to suppliers")
    service_type: Mapped[str] = mapped_column(String, nullable=False, comment="Category of service required (e.g., 'Hull Inspection') or supply category")
    subcategory: Mapped[str | None] = mapped_column(String, nullable=True, comment="Subcategory of the service")
    vessel_name: Mapped[str | None] = mapped_column(String, nullable=True, comment="Name of the vessel")
    vessel_type: Mapped[str | None] = mapped_column(String, nullable=True, comment="Type of the vessel")
    port: Mapped[str] = mapped_column(String, nullable=False, comment="Port or location where the service is needed")
    description: Mapped[str | None] = mapped_column(String, nullable=True, comment="Detailed scope of work and vessel specifics")
    budget: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Estimated budget")
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="Quantity required (procurement requests)")
    specifications: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="Free-form specification key/value pairs for supply requests")
    required_completion_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="Required completion date")
    attachments: Mapped[list | None] = mapped_column(JSON, nullable=True, comment="List of attachment URLs")
    selected_quotation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("quotes.id", ondelete="SET NULL"), nullable=True)
    
    # Enums
    urgency: Mapped[UrgencyLevel] = mapped_column(SQLEnum(UrgencyLevel), nullable=False, default=UrgencyLevel.medium)
    status: Mapped[RequestStatus] = mapped_column(SQLEnum(RequestStatus), nullable=False, default=RequestStatus.open)
    
    # One-to-Many relationship to Quotes (Quotes received for this request)
    quotes: Mapped[list["Quote"]] = relationship(back_populates="request", cascade="all, delete-orphan", foreign_keys="[Quote.request_id]")
    
    # One-to-One relationship to Job (If the request is accepted and assigned)
    job: Mapped["Job"] = relationship(back_populates="request", uselist=False, cascade="all, delete-orphan")
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        """String representation for easier debugging."""
        return f"<ServiceRequest(id={self.id}, client_id={self.client_id}, request_type={self.request_type}, type={self.service_type}, status={self.status})>"
