"""
Admin control of the company-first marketplace.

Categories
    GET   /admin/vendor-categories                     taxonomy for both types
    POST  /admin/vendor-categories                     create a category (+capabilities)
    POST  /admin/vendor-categories/{id}/subcategories  add capabilities
    PATCH /admin/vendor-categories/{id}                retire / re-open a category
    POST  /admin/companies/{profile_id}/category       assign or correct a company

Profile visibility
    GET   /admin/profile-visibility                    submissions awaiting review
    POST  /admin/profile-visibility/{id}/verify        approve -> paid window starts
    POST  /admin/profile-visibility/{id}/reject        reject with a reason

Only an administrator may create marketplace categories: vendors select from the
admin-maintained list, they never invent public taxonomy. Verifying a payment is
the ONLY way paid visibility starts, and it refuses to run until the company
profile itself is approved — verification and paid visibility are separate
states that must both be satisfied.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.profile import Profile
from app.models.profile_visibility import ProfileVisibilityStatus
from app.models.user import User, UserRole
from app.models.vendor_category import VendorCategory, VendorType
from app.routers.profile_visibility import serialize_visibility
from app.schemas.vendor_marketplace import (
    AdminVisibilityItem,
    CompanyCategoryAssign,
    VendorCategoryCreate,
    VendorCategoryPatch,
    VendorSubcategoryCreate,
    VisibilityRejectRequest,
)
from app.services.profile_visibility_service import ProfileVisibilityService
from app.services.vendor_taxonomy_service import VendorTaxonomyService

router = APIRouter(prefix="/admin", tags=["Admin Company Marketplace"])


def _require_admin(user: User) -> None:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")


def _serialize_category(category: VendorCategory, counts: dict[str, int]) -> dict:
    return {
        "id": str(category.id),
        "vendor_type": category.vendor_type.value,
        "name": category.name,
        "is_active": category.is_active,
        "company_count": counts.get(category.name.strip().lower(), 0),
        "subcategories": [
            {"id": str(sub.id), "name": sub.name} for sub in category.subcategories
        ],
    }


# ---------------------------------------------------------------- categories
@router.get("/vendor-categories", summary="Marketplace categories (admin view)")
def list_categories(
    vendor_type: Optional[VendorType] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    VendorTaxonomyService.ensure_seeded(db)
    types = [vendor_type] if vendor_type else list(VendorType)
    payload = []
    for kind in types:
        counts = VendorTaxonomyService.category_company_counts(db, kind)
        payload.extend(
            _serialize_category(c, counts)
            for c in VendorTaxonomyService.categories(db, kind, include_inactive=True)
        )
    return {"data": payload, "total": len(payload)}


@router.post("/vendor-categories", status_code=201, summary="Create a marketplace category")
def create_category(
    data: VendorCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = VendorTaxonomyService.create_category(
        db, current_user, data.vendor_type, data.name, data.subcategories
    )
    counts = VendorTaxonomyService.category_company_counts(db, category.vendor_type)
    return _serialize_category(category, counts)


@router.post(
    "/vendor-categories/{category_id}/subcategories",
    summary="Add capabilities to a category",
)
def add_subcategories(
    category_id: uuid.UUID,
    data: VendorSubcategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = VendorTaxonomyService.add_subcategories(
        db, current_user, category_id, data.names
    )
    counts = VendorTaxonomyService.category_company_counts(db, category.vendor_type)
    return _serialize_category(category, counts)


@router.patch("/vendor-categories/{category_id}", summary="Retire or re-open a category")
def patch_category(
    category_id: uuid.UUID,
    data: VendorCategoryPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    category = db.query(VendorCategory).filter(VendorCategory.id == category_id).first()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    if data.is_active is not None:
        category.is_active = data.is_active
    db.commit()
    db.refresh(category)
    counts = VendorTaxonomyService.category_company_counts(db, category.vendor_type)
    return _serialize_category(category, counts)


@router.post(
    "/companies/{profile_id}/category",
    summary="Assign or correct a company's category during verification",
)
def assign_company_category(
    profile_id: uuid.UUID,
    data: CompanyCategoryAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if profile is None:
        raise HTTPException(status_code=404, detail="Company profile not found")
    user = db.query(User).filter(User.id == profile.user_id).first()
    if user is None or user.role not in (UserRole.provider, UserRole.supplier):
        raise HTTPException(status_code=400, detail="Only a vendor company has a category.")

    vendor_type = VendorType(user.role.value)
    category, subcategories = VendorTaxonomyService.validate_selection(
        db, vendor_type, data.primary_category, data.subcategories
    )
    VendorTaxonomyService.set_company_selection(db, profile, vendor_type, category, subcategories)
    # Profile approval is intentionally NOT settable here: it must keep going
    # through the verification workflow that checks documents and payment.
    db.commit()
    db.refresh(profile)

    # Paid visibility only ever follows approval; report the current state so the
    # admin can see whether a payment still has to be verified.
    state = ProfileVisibilityService.visibility_state(db, profile)
    return {
        "profile_id": str(profile.id),
        "company_name": profile.company_name,
        "vendor_type": vendor_type.value,
        "primary_category": profile.primary_category_name,
        "subcategories": profile.subcategory_names,
        "verification_status": profile.verification_status.value,
        "is_visible": state["is_visible"],
        "visibility_source": state["source"],
        "visibility_expires_at": state["expires_at"],
    }


# ------------------------------------------------------------------ payments
def _admin_item(db: Session, record) -> AdminVisibilityItem:
    base = serialize_visibility(record).model_dump()
    owner = db.query(User).filter(User.id == record.owner_user_id).first() if record.owner_user_id else None
    profile = db.query(Profile).filter(Profile.id == record.profile_id).first()
    state = ProfileVisibilityService.visibility_state(db, profile) if profile is not None else {}
    return AdminVisibilityItem(
        **base,
        owner_email=owner.email if owner is not None else None,
        owner_company=profile.company_name if profile is not None else None,
        profile_approved=bool(profile and profile.verification_status.value == "verified"),
        current_visibility_expires_at=state.get("expires_at"),
    )


@router.get("/profile-visibility", summary="Visibility payments awaiting review")
def list_visibility_payments(
    payment_status: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    wanted = None
    if payment_status:
        try:
            wanted = ProfileVisibilityStatus(payment_status.strip().upper())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status filter")
    records = ProfileVisibilityService.pending_for_admin(db, current_user, wanted)
    return {"data": [_admin_item(db, r) for r in records], "total": len(records)}


@router.post("/profile-visibility/{payment_id}/verify", summary="Verify a visibility payment")
def verify_visibility_payment(
    payment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = ProfileVisibilityService.verify(db, current_user, payment_id)
    return _admin_item(db, record)


@router.post("/profile-visibility/{payment_id}/reject", summary="Reject a visibility payment")
def reject_visibility_payment(
    payment_id: uuid.UUID,
    data: VisibilityRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = ProfileVisibilityService.reject(db, current_user, payment_id, data.reason)
    return _admin_item(db, record)
