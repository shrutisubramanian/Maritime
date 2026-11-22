import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.utils.timezone import as_utc


class SupplyListingStatus(str, enum.Enum):
    """
    Lifecycle of a supplier's product/supply listing.
    Only `approved` listings are publicly visible in the Supplies Marketplace.
    """
    draft = "draft"
    pending_review = "pending_review"
    approved = "approved"
    rejected = "rejected"
    archived = "archived"


class SupplyListing(Base):
    """
    A physical marine product/supply offered by a supplier.

    Mirrors the role the Service model plays for service providers: it is the
    catalogue entry that feeds the marketplace and the procurement matcher.
    """
    __tablename__ = "supply_listings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)

    # Owner — the supplier user. Ownership is enforced in the service layer.
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier: Mapped["User"] = relationship(
        "User", foreign_keys=[supplier_id], overlaps="supply_listings"
    )

    # Basic
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False, index=True)
    subcategory: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)

    # Specifications
    manufacturer: Mapped[str | None] = mapped_column(String, nullable=True)
    model_number: Mapped[str | None] = mapped_column(String, nullable=True)
    part_number: Mapped[str | None] = mapped_column(String, nullable=True)
    condition: Mapped[str | None] = mapped_column(
        String, nullable=True, comment="oem / aftermarket / refurbished etc."
    )
    country_of_origin: Mapped[str | None] = mapped_column(String, nullable=True)
    # Free-form key/value specs so diverse marine supplies are not forced into one schema.
    specifications: Mapped[dict | None] = mapped_column(JSON, nullable=True)    # Availability
    availability: Mapped[str | None] = mapped_column(String, nullable=True, default="in_stock", comment="in_stock / made_to_order / out_of_stock")
    # LISTED price for this offering, in INTEGER PAISE (never a float). NULL means
    # the supplier has not published one — the marketplace then shows "Price on
    # request" rather than inventing a figure. Quotes remain a separate,
    # per-request negotiation.
    price_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Unit qualifier, e.g. "per metre", "per drum", "per unit".
    price_note: Mapped[str | None] = mapped_column(String(60), nullable=True)
    lead_time: Mapped[str | None] = mapped_column(String, nullable=True)
    minimum_order_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Location
    ports: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, comment="Ports/locations served")

    # Media
    images: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    datasheets: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    # Lifecycle
    status: Mapped[SupplyListingStatus] = mapped_column(
        SQLEnum(SupplyListingStatus), nullable=False, default=SupplyListingStatus.draft, index=True
    )
    # Populated only when an admin rejects the listing.
    rejection_reason: Mapped[str | None] = mapped_column(String, nullable=True)

    # PAID PLACEMENT WINDOW — see Service.published_at for the reasoning: a
    # listing is shown for the period its payment bought (1 month or 1 year).
    # NULL means
    # no paid window is running yet, so the listing is not visible even if its
    # content was approved.
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def is_live(self) -> bool:
        """Visible in the marketplace right now: approved AND inside a paid window."""
        return bool(
            self.status == SupplyListingStatus.approved
            and self.expires_at is not None
            # as_utc on both sides: PostgreSQL returns `timestamptz` as an
            # AWARE datetime while utcnow() is naive, and comparing the two
            # raises TypeError (SQLite masks it by returning naive values).
            and as_utc(self.expires_at) > as_utc(datetime.utcnow())
        )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self) -> str:
        return (
            f"<SupplyListing(id={self.id}, supplier_id={self.supplier_id}, "
            f"name={self.name}, status={self.status})>"
        )
