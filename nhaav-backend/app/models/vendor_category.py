"""
Company-first marketplace taxonomy.

Nhaav's marketplace is organised around COMPANIES, not around individual service
listings. Every supplier / service-provider company picks exactly ONE primary
business category (``Profile.primary_category_id``) and any number of
subcategories beneath it (``profile_subcategories``).

The taxonomy itself is database state, not source code: an administrator can
create a category and its subcategories during vendor verification (see
``app/routers/admin_vendor_categories.py``), and that category immediately
becomes selectable by other vendors of the same type.

Uniqueness is per vendor type: a supplier "Provisions" category and a provider
"Provisions" category are different rows, because they group different kinds of
company.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VendorType(str, enum.Enum):
    """Which marketplace a company belongs to. Values match ``UserRole``."""

    supplier = "supplier"
    provider = "provider"


class VendorCategory(Base):
    """One primary business category for one vendor type."""

    __tablename__ = "vendor_categories"
    __table_args__ = (
        # Case-insensitive uniqueness is additionally enforced in the service
        # layer; this constraint is the last line of defence for exact names.
        UniqueConstraint("vendor_type", "name", name="ux_vendor_categories_type_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    vendor_type: Mapped[VendorType] = mapped_column(
        SQLEnum(VendorType, native_enum=False, length=20), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Admins can retire a category without deleting it: existing companies keep
    # their assignment, new vendors can no longer select it.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Set when an administrator creates the category from the verification flow.
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    subcategories: Mapped[list["VendorSubcategory"]] = relationship(
        "VendorSubcategory",
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="VendorSubcategory.name",
    )

    def __repr__(self) -> str:
        return f"<VendorCategory({self.vendor_type}, {self.name})>"


class VendorSubcategory(Base):
    """A capability inside one primary category (e.g. 'Hull Cleaning')."""

    __tablename__ = "vendor_subcategories"
    __table_args__ = (
        UniqueConstraint("category_id", "name", name="ux_vendor_subcategories_cat_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vendor_categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    category: Mapped[VendorCategory] = relationship(VendorCategory, back_populates="subcategories")

    def __repr__(self) -> str:
        return f"<VendorSubcategory({self.name})>"


class ProfileSubcategory(Base):
    """A company's declared (and admin-approved) capability.

    One row per (company, subcategory). Because the subcategory row already
    belongs to exactly one category, a company can never hold capabilities from
    two different primary categories — the backend re-validates this on every
    write (see ``VendorTaxonomyService.validate_selection``).
    """

    __tablename__ = "profile_subcategories"
    __table_args__ = (
        UniqueConstraint("profile_id", "subcategory_id", name="ux_profile_subcategories"),
    )

    profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    subcategory_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vendor_subcategories.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    subcategory: Mapped[VendorSubcategory] = relationship(
        VendorSubcategory, lazy="joined"
    )
