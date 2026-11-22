"""
Offline bank-transfer payment submissions.

Nhaav does NOT use an online payment gateway: the organization transfers money
to the Nhaav bank account externally and this record is the *submission* the
admin reviews. No gateway, no UPI integration, no cards.

Lifecycle (explicit):

    PENDING    created but not yet submitted (reserved for future flows)
    SUBMITTED  the organization has submitted proof; awaiting admin review
    VERIFIED   admin approved — this is the ONLY state that activates a subscription
    REJECTED   admin rejected, with a reason visible to the organization
    CANCELLED  abandoned before review

Money is stored as INTEGER PAISE (never float) and is always derived server-side
from the plan the payment is for — a client-supplied amount is never trusted.

A payment belongs to exactly one ACCOUNT, one plan and the subscription (order)
context it will activate. The company is recorded as optional metadata only.
"""
import uuid
import enum
from datetime import datetime

from sqlalchemy import (
    String,
    Integer,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PaymentStatus(str, enum.Enum):
    """Member names equal their values so persisted state is unambiguous."""
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_owner_status", "owner_user_id", "status"),
        Index("ix_payments_utr", "utr"),
        # F-1: a UTR may back at most ONE LIVE payment (PENDING/SUBMITTED/
        # VERIFIED). DB-enforced so two concurrent submissions with the same
        # reference cannot both commit — the service-level 409 check alone has
        # a check-then-insert race. REJECTED/CANCELLED rows leave the index
        # scope, so a rejected reference may legitimately be corrected and
        # re-submitted (existing business behavior, unchanged).
        Index(
            "ux_payments_live_utr",
            "utr",
            unique=True,
            sqlite_where=text("status IN ('PENDING', 'SUBMITTED', 'VERIFIED')"),
            postgresql_where=text("status IN ('PENDING', 'SUBMITTED', 'VERIFIED')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)

    # Ownership / order context. The ACCOUNT that purchased is the owner —
    # another account (even one in the same company) can never see or use it.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Optional business/company metadata only.
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # The PENDING subscription this payment will activate once VERIFIED.
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subscription_plans.id"), nullable=False, index=True
    )
    submitted_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Money — INTEGER PAISE, server-derived from the plan, never client-supplied.
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")

    # Bank-transfer evidence. A UTR/reference is CLAIMED by the submitter and is
    # never treated as proof of payment by itself — only an admin decision
    # (VERIFIED) activates anything.
    utr: Mapped[str] = mapped_column(String(64), nullable=False, comment="Bank transaction reference")
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Private receipt reference: stored path + display metadata. The file lives
    # outside any public/static mount and is served only via an authorized
    # endpoint (organization member or admin).
    receipt_path: Mapped[str] = mapped_column(String, nullable=False)
    receipt_filename: Mapped[str] = mapped_column(String, nullable=False)
    receipt_content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    receipt_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # The shared bank credit this submission reserved. One transfer can fund only
    # ONE live claim across payments, listing fees and profile visibility.
    bank_credit_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("bank_credits.id", ondelete="SET NULL"), nullable=True, index=True
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[PaymentStatus] = mapped_column(
        SQLEnum(PaymentStatus, native_enum=False, length=20),
        nullable=False,
        default=PaymentStatus.PENDING,
        index=True,
    )

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Records the admin REVIEW decision (who/when). On approval this is the
    # verification; on rejection it is the rejecting decision, explained by
    # `rejection_reason`.
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    plan: Mapped["SubscriptionPlan"] = relationship("SubscriptionPlan")

    def __repr__(self) -> str:
        return (
            f"<Payment(id={self.id}, owner={self.owner_user_id}, "
            f"utr='{self.utr}', status={self.status.value})>"
        )
