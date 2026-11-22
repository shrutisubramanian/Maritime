import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    String,
    Float,
    DateTime,
    Boolean,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    JSON,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

# Statuses where a quote is still "live" (a provider may hold only one per
# request). Rejected/expired/draft rows fall outside the partial index.
LIVE_QUOTE_STATUSES_SQL = "status IN ('submitted', 'under_review', 'accepted')"


class QuoteStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    under_review = "under_review"
    accepted = "accepted"
    rejected = "rejected"
    expired = "expired"

class Quote(Base):
    """
    Model representing a price quote submitted by a service provider
    in response to a client's service request.
    """
    __tablename__ = "quotes"
    # One LIVE quote per provider per request. The service checks first for a
    # friendly message; this index is what makes two concurrent submissions
    # deterministic (the loser gets a 400, never a duplicate). Partial, so a
    # rejected quote can be re-submitted and historical rows are never rewritten.
    __table_args__ = (
        Index(
            "uq_quotes_provider_request_live",
            "provider_id",
            "request_id",
            unique=True,
            sqlite_where=text(LIVE_QUOTE_STATUSES_SQL),
            postgresql_where=text(LIVE_QUOTE_STATUSES_SQL),
        ),
    )

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    
    # Foreign Keys
    # Link to the service request the quote is for (note: table name is service_requests)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False)
    # Link to the user (provider) submitting the quote
    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Back-references
    request: Mapped["ServiceRequest"] = relationship(back_populates="quotes", foreign_keys="[Quote.request_id]")
    provider: Mapped["User"] = relationship(back_populates="quotes")
    
    # One-to-One relationship to Job (If this quote was accepted)
    job: Mapped["Job"] = relationship(back_populates="quote", uselist=False, cascade="all, delete-orphan")
    
    # Quote Details
    quotation_reference: Mapped[str | None] = mapped_column(String, nullable=True, comment="Provider's reference ID")
    pricing_model: Mapped[str | None] = mapped_column(String, nullable=True, comment="E.g. Fixed Price, Hourly")
    amount: Mapped[float] = mapped_column(Float, nullable=False, comment="Proposed price for the service")
    currency: Mapped[str] = mapped_column(String, nullable=False, default="USD")
    travel_charges: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    emergency_charges: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    taxes_included: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    message: Mapped[str | None] = mapped_column(String, nullable=True, comment="Message or terms included with the quote")
    estimated_duration: Mapped[str | None] = mapped_column(String, nullable=True, comment="E.g. 3 days")
    estimated_start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_completion_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    warranty_period: Mapped[str | None] = mapped_column(String, nullable=True)
    payment_terms: Mapped[str | None] = mapped_column(String, nullable=True)
    attachments: Mapped[list | None] = mapped_column(JSON, nullable=True)
    validity_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Status
    status: Mapped[QuoteStatus] = mapped_column(SQLEnum(QuoteStatus), nullable=False, default=QuoteStatus.submitted)

    # Two-sided acceptance. The client accepting a quote (status == accepted)
    # awards the job; this timestamp records the PROVIDER confirming it can do
    # the work. Identity and phone stay hidden from the client until both sides
    # have agreed.
    provider_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        """String representation for easier debugging."""
        return f"<Quote(id={self.id}, request_id={self.request_id}, provider_id={self.provider_id}, amount={self.amount}, status={self.status})>"
