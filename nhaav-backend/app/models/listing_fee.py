"""
Paid marketplace publication for service and supply listings.

Product rule: putting a listing on the marketplace is a PAID placement, and the
vendor chooses how long it is shown:

    ₹1,000  -> visible for **1 month**  (30 days)
    ₹10,000 -> visible for **1 year**   (365 days)

Vendors have NO usage passes and NO session time limit — this placement window is
the only thing their money buys. The window starts when the payment is verified
(and the listing itself has passed content moderation).

Nhaav has no card/UPI gateway: money moves by bank transfer and an admin
verifies each submission, exactly like subscription payments. This model is that
submission, scoped to ONE listing rather than a subscription plan.

Lifecycle (explicit):

    PENDING    created but not submitted (reserved)
    SUBMITTED  provider uploaded the transfer proof; awaiting admin review
    VERIFIED   admin approved — this is the ONLY state that publishes a listing
    REJECTED   admin rejected, with a reason the owner can read
    CANCELLED  abandoned before review

Money is INTEGER PAISE and always set server-side from the fee constant; a
client-supplied amount is never trusted. `starts_at`/`expires_at` record the
window a verified fee granted, so an expired placement is a fact about the
payment and not a number recomputed from "now" on every read.
"""
import uuid
import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ListingType(str, enum.Enum):
    """Which marketplace the placement is for. Member names equal values."""

    service = "service"
    supply = "supply"


class ListingFeeStatus(str, enum.Enum):
    """Member names equal their values so persisted state is unambiguous."""

    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class ListingFee(Base):
    __tablename__ = "listing_fees"
    __table_args__ = (
        Index("ix_listing_fees_owner_status", "owner_user_id", "status"),
        Index("ix_listing_fees_listing", "listing_type", "listing_id"),
        # One bank reference backs at most one LIVE fee submission, the same
        # rule subscription payments use. REJECTED/CANCELLED rows leave the
        # index scope so a corrected reference may be re-submitted.
        Index(
            "ux_listing_fees_live_utr",
            "utr",
            unique=True,
            sqlite_where=text("status IN ('PENDING', 'SUBMITTED', 'VERIFIED')"),
            postgresql_where=text("status IN ('PENDING', 'SUBMITTED', 'VERIFIED')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)

    # The ACCOUNT that paid. Ownership is per account, never per company.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    listing_type: Mapped[ListingType] = mapped_column(
        SQLEnum(ListingType, native_enum=False, length=10), nullable=False
    )
    # The service listing id OR supply listing id, per `listing_type`. No FK is
    # declared because a single column would have to reference two tables; the
    # service always re-checks that the owner owns the listing it points at.
    listing_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    # Snapshot of the listing's name at submission time, so the admin queue and
    # the owner's payment history stay readable even if the listing is renamed.
    listing_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")

    # Money — INTEGER PAISE, server-derived from the fee constant.
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    # How long this placement buys, in days (30 = 1 month, 365 = 1 year). Stored
    # per row so a future price or duration change cannot silently rewrite the
    # terms an older fee was sold on.
    period_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    # Bank-transfer evidence. The UTR is a CLAIM; only an admin VERIFIED decision
    # publishes anything.
    utr: Mapped[str] = mapped_column(String(64), nullable=False)
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Private receipt: stored path + display metadata, served only through an
    # authorized endpoint (owner or admin).
    receipt_path: Mapped[str] = mapped_column(String, nullable=False)
    receipt_filename: Mapped[str] = mapped_column(String, nullable=False)
    receipt_content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    receipt_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # The shared bank credit this submission reserved — one transfer funds one
    # purchase across every paid surface.
    bank_credit_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("bank_credits.id", ondelete="SET NULL"), nullable=True, index=True
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[ListingFeeStatus] = mapped_column(
        SQLEnum(ListingFeeStatus, native_enum=False, length=20),
        nullable=False,
        default=ListingFeeStatus.PENDING,
        index=True,
    )

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The placement window THIS fee bought. Set only when VERIFIED.
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self) -> str:
        return (
            f"<ListingFee(id={self.id}, {self.listing_type.value}:{self.listing_id}, "
            f"status={self.status.value})>"
        )
