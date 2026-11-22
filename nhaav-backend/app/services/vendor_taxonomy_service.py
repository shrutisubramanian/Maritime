"""
The single source of truth for the company-first marketplace taxonomy.

A company (``Profile``) belongs to exactly ONE primary category for its vendor
type and declares any number of subcategories under that category. This module
owns:

* seeding the default taxonomy from data Nhaav already has (the existing
  ``service_categories`` table for providers, the categories suppliers have
  already used for supplies) — it never invents a category assignment for a
  company;
* looking a category up by name for a vendor type;
* validating a category + subcategory selection (the backend half of the
  "one primary category" rule);
* creating categories/subcategories on behalf of an administrator.

Nothing here writes to a company profile. Assigning a category to a company is
an explicit act by the vendor (profile edit) or by an admin (verification).
"""
import re
import uuid
from typing import Iterable, Optional, Sequence

from fastapi import HTTPException, status as http_status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.models.service import Service
from app.models.service_category import ServiceCategory
from app.models.supply_listing import SupplyListing
from app.models.user import User, UserRole
from app.models.vendor_category import (
    ProfileSubcategory,
    VendorCategory,
    VendorSubcategory,
    VendorType,
)
from app.supplier_catalogue import SUPPLIER_PROFILE_CATEGORIES

_ROLE_TO_TYPE = {
    UserRole.provider: VendorType.provider,
    UserRole.supplier: VendorType.supplier,
}


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).lower()


class VendorTaxonomyService:
    # ------------------------------------------------------------- seeding
    @staticmethod
    def ensure_seeded(db: Session) -> None:
        """Idempotently seed categories from data the platform already holds.

        Seeding runs from read paths (the marketplace sidebar), so two browsers
        opening the marketplace for the first time can race. The uniqueness
        constraints pick a winner; the loser must adopt the stored rows instead
        of surfacing a 500, which is what the rollback here does.
        """
        try:
            VendorTaxonomyService._seed(db)
        except IntegrityError:
            db.rollback()

    @staticmethod
    def _seed(db: Session) -> None:
        """Seed categories from data the platform already holds.

        Providers: the seeded ``service_categories`` table (group -> service
        name) is the existing, maintained provider taxonomy, so it is reused
        rather than duplicated. Suppliers: the canonical profile categories
        plus any categories their live listings already use, so the selector is
        complete without making an existing listing invalid.
        """
        existing: dict[tuple[str, str], VendorCategory] = {
            (c.vendor_type.value, _norm(c.name)): c
            for c in db.query(VendorCategory).all()
        }
        added = False

        # --- provider taxonomy from the existing service category table
        grouped: dict[str, list[str]] = {}
        for row in db.query(ServiceCategory).all():
            grouped.setdefault(row.category_group.strip(), []).append(row.name.strip())
        # …plus the categories providers' own service rows already use. Without
        # this, a company would be discoverable under a category the sidebar
        # never lists (the two tables drifted historically).
        for row in db.query(Service.category, Service.name).all():
            category_name = (row[0] or "").strip()
            if not category_name:
                continue
            grouped.setdefault(category_name, [])
            if row[1]:
                grouped[category_name].append(row[1].strip())
        for group_name, service_names in grouped.items():
            key = (VendorType.provider.value, _norm(group_name))
            category = existing.get(key)
            if category is None:
                category = VendorCategory(
                    vendor_type=VendorType.provider,
                    name=group_name.strip(),
                    sort_order=len(existing),
                )
                db.add(category)
                db.flush()
                existing[key] = category
                added = True
            VendorTaxonomyService._add_subcategory_names(db, category, service_names)

        # Retire auto-seeded categories that the canonical service catalogue no
        # longer contains. An assigned company keeps its category (and the
        # category stays selectable) so an existing profile is never orphaned;
        # admin-created categories are also left alone.
        assigned_category_ids = {
            row[0]
            for row in db.query(Profile.primary_category_id)
            .filter(Profile.primary_category_id.isnot(None))
            .all()
        }
        canonical_groups = {_norm(name) for name in grouped}
        for (vendor_type_value, category_key), category in existing.items():
            if vendor_type_value != VendorType.provider.value:
                continue
            if category_key in canonical_groups:
                continue
            if category.created_by is not None:
                continue
            if category.id in assigned_category_ids:
                continue
            if category.is_active:
                category.is_active = False
                added = True

        # --- supplier taxonomy: the canonical profile categories first, then
        # any categories suppliers already use for live listings. Existing
        # categories are never removed: a listing must keep the category it was
        # published under.
        canonical_supplier = {
            _norm(name): name for name in SUPPLIER_PROFILE_CATEGORIES
        }
        supplier_categories: dict[str, list[str]] = {
            name: [] for name in SUPPLIER_PROFILE_CATEGORIES
        }
        legacy_supplier: dict[str, dict] = {}

        for row in db.query(SupplyListing.category, SupplyListing.subcategory).all():
            raw_category = (row[0] or "").strip()
            if not raw_category:
                continue
            canonical_name = canonical_supplier.get(_norm(raw_category))
            if canonical_name is not None:
                bucket = supplier_categories[canonical_name]
            else:
                key = _norm(raw_category)
                if key not in legacy_supplier:
                    legacy_supplier[key] = {"name": raw_category, "sub_names": []}
                bucket = legacy_supplier[key]["sub_names"]
            if row[1]:
                bucket.append(row[1].strip())

        # Include existing supplier categories that currently have no listing,
        # so retiring one is an explicit admin action rather than a seed side
        # effect. They follow the canonical choices in the dropdown.
        for (vendor_type_value, category_key), category in existing.items():
            if vendor_type_value != VendorType.supplier.value:
                continue
            if category_key in canonical_supplier or category_key in legacy_supplier:
                continue
            legacy_supplier[category_key] = {"name": category.name, "sub_names": []}

        for entry in sorted(legacy_supplier.values(), key=lambda value: value["name"].lower()):
            supplier_categories[entry["name"]] = entry["sub_names"]

        for index, (name, sub_names) in enumerate(supplier_categories.items()):
            key = (VendorType.supplier.value, _norm(name))
            category = existing.get(key)
            if category is None:
                category = VendorCategory(
                    vendor_type=VendorType.supplier,
                    name=name.strip(),
                    sort_order=index,
                )
                db.add(category)
                db.flush()
                existing[key] = category
                added = True
            elif category.sort_order != index:
                # Keep the eight profile choices in their published order and
                # put preserved legacy categories after them.
                category.sort_order = index
                added = True
            VendorTaxonomyService._add_subcategory_names(db, category, sub_names)

        if added:
            db.commit()

    @staticmethod
    def _add_subcategory_names(
        db: Session, category: VendorCategory, names: Iterable[str]
    ) -> None:
        have = {_norm(s.name) for s in category.subcategories}
        for raw in names:
            cleaned = (raw or "").strip()
            if not cleaned or _norm(cleaned) in have:
                continue
            db.add(VendorSubcategory(category_id=category.id, name=cleaned))
            have.add(_norm(cleaned))
        db.flush()
        db.refresh(category)

    # ------------------------------------------------------------- reads
    @staticmethod
    def vendor_type_for_user(user: User) -> VendorType:
        """Vendors only; a client has no marketplace category."""
        found = _ROLE_TO_TYPE.get(user.role)
        if found is None:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Only suppliers and service providers have a marketplace category.",
            )
        return found

    @staticmethod
    def categories(
        db: Session, vendor_type: VendorType, include_inactive: bool = False
    ) -> list[VendorCategory]:
        VendorTaxonomyService.ensure_seeded(db)
        query = db.query(VendorCategory).filter(VendorCategory.vendor_type == vendor_type)
        if not include_inactive:
            query = query.filter(VendorCategory.is_active.is_(True))
        return query.order_by(VendorCategory.sort_order, VendorCategory.name).all()

    @staticmethod
    def find_category(
        db: Session, vendor_type: VendorType, name: str
    ) -> Optional[VendorCategory]:
        wanted = _norm(name)
        if not wanted:
            return None
        for category in VendorTaxonomyService.categories(db, vendor_type, include_inactive=True):
            if _norm(category.name) == wanted:
                return category
        return None

    @staticmethod
    def resolve_category(db: Session, vendor_type: VendorType, name: str) -> VendorCategory:
        category = VendorTaxonomyService.find_category(db, vendor_type, name)
        if category is None:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "unknown_category",
                    "message": (
                        f"'{name}' is not a {vendor_type.value} category. "
                        "Choose one of the marketplace categories."
                    ),
                },
            )
        if not category.is_active:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "inactive_category",
                    "message": f"'{category.name}' is no longer open to new companies.",
                },
            )
        return category

    @staticmethod
    def validate_selection(
        db: Session,
        vendor_type: VendorType,
        category_name: Optional[str],
        subcategory_names: Optional[Sequence[str]],
    ) -> tuple[Optional[VendorCategory], list[VendorSubcategory]]:
        """Validate a company's category + capabilities.

        Rules enforced here (and nowhere else, so no surface can drift):
        * the primary category must exist for this vendor type;
        * every subcategory must belong to that category;
        * a company cannot hold capabilities from a second category.

        ``category_name=None`` means "no change / not provided"; the caller
        decides what that means for its own write.
        """
        if category_name is None:
            if subcategory_names:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "category_required",
                        "message": "Select a primary business category before adding subcategories.",
                    },
                )
            return None, []

        category = VendorTaxonomyService.resolve_category(db, vendor_type, category_name)
        by_name = {_norm(s.name): s for s in category.subcategories}

        chosen: list[VendorSubcategory] = []
        unknown: list[str] = []
        for raw in subcategory_names or []:
            cleaned = (raw or "").strip()
            if not cleaned:
                continue
            found = by_name.get(_norm(cleaned))
            if found is None:
                unknown.append(cleaned)
                continue
            if found not in chosen:
                chosen.append(found)

        if unknown:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "invalid_subcategories",
                    "message": (
                        f"These capabilities are not offered under '{category.name}': "
                        + ", ".join(sorted(unknown))
                        + ". Pick the primary category that matches them, or remove them."
                    ),
                    "invalid": sorted(unknown),
                    "allowed": sorted(s.name for s in category.subcategories),
                },
            )
        return category, chosen

    @staticmethod
    def set_company_selection(
        db: Session,
        profile: Profile,
        vendor_type: VendorType,
        category: Optional[VendorCategory],
        subcategories: Sequence[VendorSubcategory],
    ) -> None:
        """Write the single category + capability links for one company."""
        profile.primary_category_id = category.id if category is not None else None
        db.query(ProfileSubcategory).filter(ProfileSubcategory.profile_id == profile.id).delete()
        db.flush()
        for sub in subcategories:
            db.add(ProfileSubcategory(profile_id=profile.id, subcategory_id=sub.id))
        db.flush()
        db.refresh(profile)

    @staticmethod
    def subcategory_names(profile: Profile) -> list[str]:
        try:
            links = profile.subcategory_links or []
        except Exception:  # detached instance / lazy load unavailable
            return []
        names = []
        for link in links:
            sub = getattr(link, "subcategory", None)
            if sub is not None:
                names.append(sub.name)
        return sorted(names)

    # ------------------------------------------------------------- writes
    @staticmethod
    def create_category(
        db: Session,
        admin: User,
        vendor_type: VendorType,
        name: str,
        subcategory_names: Optional[Sequence[str]] = None,
    ) -> VendorCategory:
        """Admin-only creation of a persistent marketplace category."""
        if admin.role != UserRole.admin:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Only an administrator can create marketplace categories.",
            )
        cleaned = re.sub(r"\s+", " ", (name or "").strip())
        if len(cleaned) < 3:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Category name must be at least 3 characters.",
            )
        if VendorTaxonomyService.find_category(db, vendor_type, cleaned) is not None:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail={
                    "code": "duplicate_category",
                    "message": f"'{cleaned}' already exists for {vendor_type.value}s.",
                },
            )
        category = VendorCategory(
            vendor_type=vendor_type, name=cleaned, created_by=admin.id, sort_order=0
        )
        db.add(category)
        db.flush()
        VendorTaxonomyService._add_subcategory_names(db, category, subcategory_names or [])
        db.commit()
        db.refresh(category)
        return category

    @staticmethod
    def add_subcategories(
        db: Session, admin: User, category_id: uuid.UUID, names: Sequence[str]
    ) -> VendorCategory:
        if admin.role != UserRole.admin:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Only an administrator can manage marketplace categories.",
            )
        category = db.query(VendorCategory).filter(VendorCategory.id == category_id).first()
        if category is None:
            raise HTTPException(status_code=404, detail="Category not found")
        VendorTaxonomyService._add_subcategory_names(db, category, names)
        db.commit()
        db.refresh(category)
        return category

    # ------------------------------------------------- legacy compatibility
    @staticmethod
    def effective_category_names(db: Session, profile: Profile, user: User) -> list[str]:
        """Category names a company should be discoverable under.

        The company's primary category (Profile → Main Category) is the SOLE
        source of truth: a company is placed under that one marketplace
        category and no other. Legacy `Service` / `SupplyListing` rows are
        deliberately not consulted here — they still exist and still render on
        the company's own profile, but they never add marketplace categories.
        A company with no primary category is therefore listed under none.
        """
        if profile.primary_category is None:
            return []
        return [profile.primary_category.name]

    @staticmethod
    def effective_category_names_bulk(db: Session, pairs) -> dict:
        """Batch form of ``effective_category_names`` for one discovery page.

        Same rule — the profile's primary category only, never derived from
        listings. No extra queries: the relationship is already loaded.
        """
        return {
            profile.user_id: (
                [profile.primary_category.name]
                if profile.primary_category is not None
                else []
            )
            for profile, user in pairs
            if user is not None
        }

    @staticmethod
    def category_company_counts(
        db: Session, vendor_type: VendorType
    ) -> dict[str, int]:
        """Companies whose PRIMARY category is each category.

        Legacy companies (no primary category) are counted against their derived
        categories by ``MarketplaceCompanyService`` at read time, so this is only
        the authoritative half used by the admin screens.
        """
        rows = (
            db.query(VendorCategory.name, func.count(Profile.id))
            .join(Profile, Profile.primary_category_id == VendorCategory.id)
            .filter(VendorCategory.vendor_type == vendor_type)
            .group_by(VendorCategory.name)
            .all()
        )
        return {name: count for name, count in rows}
