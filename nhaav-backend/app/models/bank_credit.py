"""
One bank credit per transfer reference, shared by every paid surface.

Nhaav collects money as offline bank transfers, and three separate surfaces
record the submission a transfer paid for:

    payments              pass packs (subscriptions)
    listing_fees          marketplace placements for one service/supply listing
    profile_visibilities  paid company-profile visibility

Each of those tables carries its own partial unique index on ``utr``. That stops
the SAME surface being paid twice with one reference, but it says nothing ACROSS
surfaces: one transfer could previously be claimed — and then separately
verified by three different admin queues — as a pass payment, a listing fee and
a visibility fee at the same time.

``BankCredit`` is the single record of "this bank reference has been claimed".
Every submission reserves a credit inside the same transaction as its claim row,
and the partial unique index below (``utr`` WHERE status = 'CLAIMED') is the
database-level backstop if two submissions of the same reference race across
different tables. Rejecting or cancelling the claim releases the reference, which
matches the per-table rule that a corrected reference may be re-submitted.

A credit is a CLAIM, never proof: verification still happens per claim, by an
admin, exactly as before. The credit only says the reference is spoken for.
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
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BankCreditClaimType(str, enum.Enum):
    """Which paid surface reserved this credit. Member names equal values."""

    payment = "payment"
    listing_fee = "listing_fee"
    profile_visibility = "profile_visibility"


class BankCreditStatus(str, enum.Enum):
    """CLAIMED holds the reference; RELEASED frees it for a correction."""

    CLAIMED = "CLAIMED"
    RELEASED = "RELEASED"


class BankCredit(Base):
    __tablename__ = "bank_credits"
    __table_args__ = (
        Index("ix_bank_credits_utr", "utr"),
        Index("ix_bank_credits_claim_id", "claim_id"),
        # One LIVE credit per reference. Released rows leave the index scope so a
        # rejected/cancelled claim's reference can be corrected and re-submitted,
        # and this is also what makes two simultaneous cross-table submissions
        # resolve to exactly one winner.
        Index(
            "ux_bank_credits_live_utr",
            "utr",
            unique=True,
            sqlite_where=text("status = 'CLAIMED'"),
            postgresql_where=text("status = 'CLAIMED'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)

    # The normalized (stripped, upper-cased) bank reference.
    utr: Mapped[str] = mapped_column(String(64), nullable=False)

    # What reserved it. claim_type is known at reservation time; claim_id is
    # filled in once the claim row has been flushed, in the same transaction.
    claim_type: Mapped[BankCreditClaimType | None] = mapped_column(
        SQLEnum(BankCreditClaimType, native_enum=False, length=24), nullable=True
    )
    claim_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # What was claimed against it, as submitted. The admin decision on the claim
    # row remains the only authority; these are for operators reading the credit.
    amount_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    receipt_path: Mapped[str | None] = mapped_column(String, nullable=True)
    receipt_filename: Mapped[str | None] = mapped_column(String, nullable=True)

    status: Mapped[BankCreditStatus] = mapped_column(
        SQLEnum(BankCreditStatus, native_enum=False, length=10),
        nullable=False,
        default=BankCreditStatus.CLAIMED,
        index=True,
    )
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self) -> str:
        return (
            f"<BankCredit(utr='{self.utr}', claim={self.claim_type}, "
            f"status={self.status.value})>"
        )
