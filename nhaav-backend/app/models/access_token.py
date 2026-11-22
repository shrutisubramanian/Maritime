"""
ACCOUNT-LEVEL access-pass entitlement models.

OWNERSHIP (Captain's final rule): a purchased access pass belongs to the
individual ACCOUNT that bought it — never to a company/Organization and never
shared between employees. The ownership boundary is `owner_user_id` on the
Subscription, the AccessPack and every individual AccessToken.

`organization_id` is retained on these rows ONLY as optional company/business
metadata (so admins can still see which company an account belongs to, and the
marketplace's organization relationships stay untouched). It is NEVER used to
decide who may consume a pass.

Structure:

    Account (User)
      └── Subscription (plan purchased by this account)
            └── AccessPack (one pack per subscription — 10 or 100 passes)
                  └── AccessToken (one pass == one 6-hour login session)
                        AVAILABLE -> ACTIVE -> CONSUMED
                        AVAILABLE -> EXPIRED   (plan window unused: 6/12 months)

A pass is a consumable entitlement row, NOT a JWT. The JWT stays responsible for
identity; this row controls whether the account may start (and keep) a session.
"""

import uuid
import enum
from datetime import datetime

from sqlalchemy import (
    String,
    Integer,
    DateTime,
    Boolean,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AccessTokenStatus(str, enum.Enum):
    """Lifecycle of a single pass.

    available  issued, unused, still inside its plan validity window
    active     bound to a live 6-hour session for `current_user_id`
    consumed   the session ended (logout or 6-hour expiry) — permanent
    expired    never used and its unused-validity window closed — permanent
    """
    available = "AVAILABLE"
    active = "ACTIVE"
    consumed = "CONSUMED"
    expired = "EXPIRED"


class AccessPackStatus(str, enum.Enum):
    """Lifecycle of a pack itself (distinct from its passes' status).

    Member names equal their values so persisted state is unambiguous.
    """
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class Organization(Base):
    """
    A company / organization — BUSINESS IDENTITY ONLY.

    This is NOT the entitlement boundary any more. Passes belong to individual
    accounts; `Organization` exists so the marketplace, company profiles and
    admin views can describe whose company an account works for.

    Identity = this row's primary key. `name` is DISPLAY DATA. There is
    intentionally NO fuzzy/string backfill from Profile.company_name.
    Admins are platform staff, never members of any Organization.
    """
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)

    # LEGACY FLAG. Company-level gating was replaced by account-level gating
    # (User.access_control_enabled). The column is kept so existing data and
    # migrations stay valid, but nothing reads it to decide entitlement any more.
    access_control_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    members: Mapped[list["Profile"]] = relationship(
        "Profile",
        primaryjoin="Profile.organization_id == Organization.id",
        foreign_keys="Profile.organization_id",
        viewonly=True,
    )

    # Informational only. NOT delete-orphan: a pack is owned by an ACCOUNT and
    # must survive the organization link being cleared (owner_user_id is the
    # entitlement boundary).
    packs: Mapped[list["AccessPack"]] = relationship(
        back_populates="organization", viewonly=True
    )

    def __repr__(self) -> str:
        return f"<Organization(id={self.id}, name='{self.name}')>"


class AccessPack(Base):
    """
    A pack of passes OWNED BY ONE ACCOUNT.

    `owner_user_id` is the entitlement boundary: only that account may ever
    allocate a pass from this pack. `subscription_id` ties the pack to the
    subscription that created it; the UNIQUE constraint keeps activation
    idempotent while still allowing an account to hold MANY packs (a second
    purchase is a second subscription and therefore a second pack — never a
    replacement).

    `token_count` IS the plan's pass count (total_passes); the 10/100 figures
    live only in the seeded SubscriptionPlan rows.
    """
    __tablename__ = "access_packs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)

    # THE OWNERSHIP BOUNDARY. Nullable only for pre-ownership legacy rows that
    # cannot be mapped to a single account without guessing (see the migration
    # and ACCESS_OWNERSHIP_REPORT.md); such packs are inert until an operator
    # assigns an owner explicitly.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # Optional business/company metadata only — never an entitlement boundary.
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # NULL = legacy/dev-provisioned pack, not tied to any subscription.
    # UNIQUE (multiple NULLs allowed) => a subscription owns exactly ONE pack.
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True, unique=True
    )

    # Total passes in this pack (== plan.pass_count).
    token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    status: Mapped[AccessPackStatus] = mapped_column(
        SQLEnum(AccessPackStatus, native_enum=False, length=20),
        nullable=False,
        default=AccessPackStatus.ACTIVE,
    )
    source: Mapped[str] = mapped_column(
        String, nullable=False, default="test_helper",
        comment="test_helper / dev_endpoint / payment",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    organization: Mapped["Organization | None"] = relationship(back_populates="packs")
    tokens: Mapped[list["AccessToken"]] = relationship(
        back_populates="pack", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<AccessPack(id={self.id}, owner={self.owner_user_id}, tokens={self.token_count})>"
        )


class AccessToken(Base):
    """
    ONE pass — one 6-hour login session — owned by a single account.

    This is an opaque server-side ENTITLEMENT record: it is NOT a JWT and never
    travels to the client.

    Expiry has two independent clocks:

      * UNUSED validity — 6 or 12 calendar months from `available_at`, stamped
        from the plan it was bought under. If the pass is never
        allocated inside that window it becomes EXPIRED and can never be used.
      * SESSION length — 6 hours from allocation. A pass that IS used is
        consumed by that session; the unused-validity window no longer applies.
    """
    __tablename__ = "access_tokens"
    __table_args__ = (
        # Hot path: "this account's AVAILABLE / ACTIVE passes".
        Index("ix_access_tokens_owner_status", "owner_user_id", "status"),
        Index("ix_access_tokens_pack", "pack_id"),
        Index("ix_access_tokens_current_user", "current_user_id"),
        Index("ix_access_tokens_unused_expiry", "unused_expires_at"),
        # ONE ACTIVE pass per ACCOUNT, enforced by the database as well as the
        # service. The partial predicate means only ACTIVE rows are constrained,
        # so the AVAILABLE pool and CONSUMED/EXPIRED history are untouched.
        # Guarded on BOTH columns: `owner_user_id` is the entitlement boundary,
        # `current_user_id` is the session holder — they must never diverge for
        # an ACTIVE row, so either index alone would fail a double-commit.
        Index(
            "uq_access_tokens_active_per_owner",
            "owner_user_id",
            unique=True,
            sqlite_where=text("status = 'ACTIVE'"),
            postgresql_where=text("status = 'ACTIVE'"),
        ),
        Index(
            "uq_access_tokens_active_per_user",
            "current_user_id",
            unique=True,
            sqlite_where=text("status = 'ACTIVE'"),
            postgresql_where=text("status = 'ACTIVE'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)

    # THE OWNERSHIP BOUNDARY — the account that purchased this pass.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )

    # Optional business/company metadata only.
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    pack_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("access_packs.id", ondelete="CASCADE"), nullable=False
    )

    status: Mapped[AccessTokenStatus] = mapped_column(
        SQLEnum(AccessTokenStatus, native_enum=False, length=20),
        nullable=False,
        default=AccessTokenStatus.available,
    )

    # UNUSED-validity window (per pass, starts when the pass is issued).
    available_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    unused_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Session binding. current_user_id names the ACTIVE holder (nullable).
    current_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    pack: Mapped["AccessPack"] = relationship(back_populates="tokens")

    def __repr__(self) -> str:
        return (
            f"<AccessToken(id={self.id}, owner={self.owner_user_id}, status={self.status})>"
        )
