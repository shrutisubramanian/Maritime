"""
Subscription / plan layer on top of the access-token entitlement system.

Nhaav has exactly two approved plans, seeded from PLAN_DEFINITIONS in
app/services/subscription_service.py:

  MONTHLY   ₹1,000 + GST      10 passes     6 calendar months
  ANNUAL    ₹10,000 + GST     100 passes    12 calendar months

GST (18%) is added ON TOP of the listed price, so ₹1,000 is charged as ₹1,180
and ₹10,000 as ₹11,800; the plan rows hold the taxable value.

MONEY: this layer stores money as INTEGER PAISE (100000 paise = ₹1,000) and
never uses floating point. The frozen marketplace keeps its legacy Float quote
amounts untouched — that is a separate, unrelated convention documented in
SUBSCRIPTION_IMPLEMENTATION_REPORT.md.

A Subscription belongs to the individual ACCOUNT that purchased it (never to
a shared company pool). Activating a subscription creates exactly ONE AccessPack
whose `token_count` is the plan's `pass_count`; those passes ARE the existing
AccessToken rows used by the entitlement system. No second token system exists.

An account may hold SEVERAL subscriptions/packs at once (e.g. a second pack
purchased while passes from the first are still unused). Each pack and each pass
keeps its own lifecycle and expiry; nothing is overwritten or extended.

A subscription is NOT active merely because it exists: it is created PENDING and
only a verified payment (admin-approved bank transfer) or explicit dev/test
provisioning activates it.
"""
import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, Boolean, Enum as SQLEnum, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BillingPeriod(str, enum.Enum):
    """
    Duration unit of a plan. Names equal values so persisted state is
    unambiguous.

    MONTH is what the approved packs use (6 months for 10 passes, 12 for 100),
    stamped exactly per pass: a 6-month window from 31 Aug clamps to 28/29 Feb,
    so "6 months" never silently loses or gains days. DAY/YEAR remain supported
    for legacy rows.
    """
    DAY = "DAY"
    MONTH = "MONTH"
    YEAR = "YEAR"


class SubscriptionStatus(str, enum.Enum):
    """
    Explicit subscription lifecycle.

    PENDING   created, no verified payment yet — NO clock running, NO passes
    ACTIVE    activated: starts_at/expires_at set, access pack issued
    EXPIRED   expires_at passed: no NEW sessions may be allocated
    CANCELLED terminated before expiry (manual/admin)

    Member names equal their values so persisted state is unambiguous.
    """
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class SubscriptionPlan(Base):
    """
    A purchasable plan definition (MONTHLY / ANNUAL).

    `pass_count` is the authoritative pass count. The figures 10 and 100 are
    never hardcoded in business logic — they exist only in seeded plan rows.
    """
    __tablename__ = "subscription_plans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # INTEGER PAISE — never floating point.
    price_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    duration_value: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    duration_unit: Mapped[BillingPeriod] = mapped_column(
        SQLEnum(BillingPeriod, native_enum=False, length=10),
        nullable=False,
        default=BillingPeriod.MONTH,
    )
    pass_count: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    def __repr__(self) -> str:
        return (
            f"<SubscriptionPlan(code='{self.code}', price_paise={self.price_paise}, "
            f"passes={self.pass_count})>"
        )


class Subscription(Base):
    """
    An account's subscription to a plan.

    starts_at / expires_at are stamped at ACTIVATION, not at creation: a
    PENDING subscription has no running clock. The subscription clock is
    entirely independent of individual 6-hour pass sessions AND of the
    per-pass unused-validity window (6 or 12 months).
    """
    __tablename__ = "subscriptions"
    __table_args__ = (
        # Hot lookups: "this account's subscriptions by status".
        Index("ix_subscriptions_owner_status", "owner_user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)

    # THE OWNERSHIP BOUNDARY. A subscription belongs to the individual ACCOUNT
    # that purchased it, never to a shared company pool. Nullable only for
    # pre-ownership legacy rows that cannot be mapped without guessing.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # Optional business/company metadata only — never an entitlement boundary.
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subscription_plans.id"), nullable=False, index=True
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        SQLEnum(SubscriptionStatus, native_enum=False, length=20),
        nullable=False,
        default=SubscriptionStatus.PENDING,
        index=True,
    )
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # One-directional: the service layer queries packs by subscription_id FK.
    plan: Mapped["SubscriptionPlan"] = relationship("SubscriptionPlan")

    def __repr__(self) -> str:
        return (
            f"<Subscription(id={self.id}, owner={self.owner_user_id}, "
            f"plan={self.plan_id}, status={self.status.value})>"
        )
