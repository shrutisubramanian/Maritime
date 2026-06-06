import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Float, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class QuoteStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"

class Quote(Base):
    """
    Model representing a price quote submitted by a service provider
    in response to a client's service request.
    """
    __tablename__ = "quotes"

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    
    # Foreign Keys
    # Link to the service request the quote is for (note: table name is service_requests)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False)
    # Link to the user (provider) submitting the quote
    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Back-references
    request: Mapped["ServiceRequest"] = relationship(back_populates="quotes")
    provider: Mapped["User"] = relationship(back_populates="quotes")
    
    # One-to-One relationship to Job (If this quote was accepted)
    job: Mapped["Job"] = relationship(back_populates="quote", uselist=False, cascade="all, delete-orphan")
    
    # Quote Details
    amount: Mapped[float] = mapped_column(Float, nullable=False, comment="Proposed price for the service")
    currency: Mapped[str] = mapped_column(String, nullable=False, default="USD")
    message: Mapped[str | None] = mapped_column(String, nullable=True, comment="Message or terms included with the quote")
    
    # Status
    status: Mapped[QuoteStatus] = mapped_column(SQLEnum(QuoteStatus), nullable=False, default=QuoteStatus.pending)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        """String representation for easier debugging."""
        return f"<Quote(id={self.id}, request_id={self.request_id}, provider_id={self.provider_id}, amount={self.amount}, status={self.status})>"
