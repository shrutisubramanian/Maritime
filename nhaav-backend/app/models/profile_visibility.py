"""
Paid marketplace visibility for a COMPANY PROFILE.

Product rule: the whole company profile is the unit of paid visibility — never
an individual service, supply, job or subcategory:

    ₹1,000  + GST  -> profile discoverable for 1 month   (30 days)
    ₹10,000 + GST  -> profile discoverable for 12 months (365 days)

The prices are the PRE-GST list prices from the single plan table in
``app/services/profile_visibility_service.py``; GST is derived from
``settings.GST_RATE_PERCENT`` and snapshotted per submission so a later rate
change cannot rewrite history.

Lifecycle (mirrors the existing bank-transfer flows):

    PENDING    reserved, not submitted
    SUBMITTED  vendor uploaded the transfer proof; awaiting admin review
    VERIFIED   admin approved — the ONLY state that grants paid visibility
    REJECTED   admin rejected, with a reason the vendor can read
    CANCELLED  abandoned before review

Visibility is separate from verification: a company may be verified (profile
approved) with no paid plan, and it then stays out of paid marketplace discovery
until an admin verifies a payment. Money is INTEGER PAISE and always derived
server-side; a client-supplied amount is never trusted.
"""
import enum
import uuid
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


class ProfileVisibilityPlan(str, enum.Enum):
    """Member names equal values so persisted state is unambiguous."""

    monthly = "monthly"
    annual = "annual"


class ProfileVisibilityStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class ProfileVisibility(Base):
    __tablename__ = "profile_visibilities"
    __table_args__ = (
        Index("ix_profile_visibilities_profile_status", "profile_id", "status"),
        Index("ix_profile_visibilities_owner_status", "owner_user_id", "status"),
        # One bank reference backs at most one live submission, like every other
        # payment surface in Nhaav. Rejected/cancelled rows leave the index scope
        # so a corrected reference can be re-submitted.
        Index(
            "ux_profile_visibilities_live_utr",
            "utr",
            unique=True,
            sqlite_where=text("status IN ('PENDING', 'SUBMITTED', 'VERIFIED')"),
            postgresql_where=text("status IN ('PENDING', 'SUBMITTED', 'VERIFIED')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)

    profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The account that paid. Kept alongside profile_id so payment history
    # survives even if the company profile is later re-keyed.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    plan: Mapped[ProfileVisibilityPlan] = mapped_column(
        SQLEnum(ProfileVisibilityPlan, native_enum=False, length=12), nullable=False
    )
    period_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    # Money — INTEGER PAISE. base + gst == total; all three are stored because
    # they are a financial record of what was actually quoted and paid.
    base_amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    gst_rate_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=18)
    gst_amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    total_amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")

    # Bank-transfer evidence. The UTR is a CLAIM; only an admin VERIFIED decision
    # grants visibility.
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

    status: Mapped[ProfileVisibilityStatus] = mapped_column(
        SQLEnum(ProfileVisibilityStatus, native_enum=False, length=20),
        nullable=False,
        default=ProfileVisibilityStatus.PENDING,
        index=True,
    )

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The visibility window THIS payment bought. Set only when VERIFIED.
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self) -> str:
        return (
            f"<ProfileVisibility(profile={self.profile_id}, plan={self.plan.value}, "
            f"status={self.status.value})>"
        )
