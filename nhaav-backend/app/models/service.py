import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.utils.timezone import as_utc


class ServiceListingStatus(str, enum.Enum):
    """
    Lifecycle of a provider's service listing (the service-provider analogue of
    SupplyListingStatus). Only `approved` listings are publicly visible in the
    Service Marketplace and eligible for request matching — but visibility is
    enforced through the derived `is_active` flag so the deterministic matcher
    (which filters on `Service.is_active`) keeps working unchanged.
    """
    draft = "draft"
    pending_review = "pending_review"
    approved = "approved"
    rejected = "rejected"
    archived = "archived"


class Service(Base):
    __tablename__ = "services"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)

    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.user_id", ondelete="CASCADE"), nullable=False)
    provider: Mapped["Profile"] = relationship(back_populates="services")

    name: Mapped[str] = mapped_column(String, nullable=False)
    # Canonical matching keys. `service_id` mirrors the request's service_type and
    # `port_id` mirrors the request's port so eligibility is deterministic.
    service_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    port_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    category: Mapped[str] = mapped_column(String, nullable=False)
    subcategory: Mapped[str | None] = mapped_column(String, nullable=True)

    description: Mapped[str | None] = mapped_column(String, nullable=True)
    pricing_model: Mapped[str | None] = mapped_column(String, nullable=True)
    # LISTED price for THIS provider's offering, in INTEGER PAISE (never a float).
    # NULL means the provider has not published one — the marketplace then shows
    # "Price on request" rather than inventing a number. Quotes are a separate,
    # per-request negotiation; this is the headline figure on the card.
    price_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Unit qualifier for the listed price, e.g. "per survey", "per day", "per unit".
    price_note: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # Derived public-eligibility flag: True iff status == approved. The service
    # layer is the only writer; supplier-style moderation drives it.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    certifications_required: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    images: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    # Lifecycle (server-controlled; providers cannot self-approve).
    status: Mapped[ServiceListingStatus] = mapped_column(
        SQLEnum(ServiceListingStatus), nullable=False, default=ServiceListingStatus.draft, index=True
    )
    # Populated only when an admin rejects the listing.
    rejection_reason: Mapped[str | None] = mapped_column(String, nullable=True)

    # PAID PLACEMENT WINDOW. A listing is shown for the period its payment bought
    # (₹1,000 = 1 month, ₹10,000 = 1 year). `expires_at` is stamped when the fee is
    # verified (or when moderation approves a listing that already has one), so
    # visibility is a fact about the purchase rather than a number recomputed on
    # every read. NULL means "paid placement not started" — approved but not
    # published until the fee clears.
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def is_live(self) -> bool:
        """Visible in the marketplace right now: approved AND inside a paid window."""
        return bool(
            self.status == ServiceListingStatus.approved
            and self.expires_at is not None
            # as_utc on both sides: PostgreSQL returns `timestamptz` as an
            # AWARE datetime while utcnow() is naive, and comparing the two
            # raises TypeError (SQLite masks it by returning naive values).
            and as_utc(self.expires_at) > as_utc(datetime.utcnow())
        )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return (
            f"<Service(id={self.id}, provider_id={self.provider_id}, "
            f"name={self.name}, status={self.status})>"
        )
