"""
Read-only admin directory over EVERY profile.

The verification queues answer "who is waiting to be approved". This answers a
different question: "show me every profile a client or a vendor has created",
with the same oversight the admin already has during verification, and nothing
more.

READ ONLY, by construction:

* only GET routes are declared here — any PUT/PATCH/DELETE on these paths is a
  405, and nothing in this module writes to the database;
* approval stays with the verification workflow (`/admin/verification/...`), so
  reading a profile can never change its status;
* credentials are never serialized: no password hash, no tokens or sessions, no
  private storage paths (the brochure is represented by its filename only).
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.profile import Profile
from app.models.service import Service
from app.models.supply_listing import SupplyListing
from app.models.user import User, UserRole
from app.services.profile_visibility_service import ProfileVisibilityService
from app.services.rate_limit_service import RateLimitService
from app.services.vendor_taxonomy_service import VendorTaxonomyService

router = APIRouter(prefix="/admin/profiles", tags=["Admin Profiles"])

#: Every role that can own a profile. Admins are excluded: they do not have a
#: marketplace profile of their own.
_PROFILE_ROLES = (UserRole.client, UserRole.provider, UserRole.supplier)

_ROLE_FILTERS: dict[str, tuple[UserRole, ...]] = {
    "client": (UserRole.client,),
    "clients": (UserRole.client,),
    "buyer": (UserRole.client,),
    "vendor": (UserRole.provider, UserRole.supplier),
    "vendors": (UserRole.provider, UserRole.supplier),
    "provider": (UserRole.provider,),
    "supplier": (UserRole.supplier,),
}


def _require_admin(user: User) -> None:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")


def _scope(role: Optional[str]) -> tuple[UserRole, ...]:
    wanted = (role or "").strip().lower()
    if not wanted or wanted == "all":
        return _PROFILE_ROLES
    found = _ROLE_FILTERS.get(wanted)
    if found is None:
        raise HTTPException(
            status_code=400,
            detail="role must be one of: all, client, vendor, provider, supplier",
        )
    return found


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _list_item(profile: Profile, user: User, visibility: Optional[dict] = None) -> dict:
    return {
        "profile_id": str(profile.id),
        "user_id": str(profile.user_id),
        "role": user.role.value if user.role else None,
        "company_name": profile.company_name or "",
        "full_name": user.full_name or "",
        "email": user.email or "",
        "phone": user.phone or "",
        "country": profile.country,
        "head_office": profile.head_office,
        "primary_category": profile.primary_category_name,
        "subcategories": VendorTaxonomyService.subcategory_names(profile),
        "verification_status": profile.verification_status.value,
        "availability_status": (
            profile.availability_status.value if profile.availability_status else None
        ),
        "is_visible": bool(visibility["is_visible"]) if visibility else None,
        "created_at": _iso(profile.created_at),
        "updated_at": _iso(profile.updated_at),
    }


@router.get(
    "",
    summary="Every profile, read-only (clients and vendors)",
    dependencies=[Depends(RateLimitService.rate_limit_user("vendor_search"))],
)
def list_profiles(
    role: Optional[str] = Query(None, description="all | client | vendor | provider | supplier"),
    verification_status: Optional[str] = Query(None, description="pending | verified | rejected"),
    q: Optional[str] = Query(None, description="Company, contact name or email"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated read of every profile, with per-role totals for the tabs."""
    _require_admin(current_user)
    scoped = _scope(role)

    query = db.query(Profile).join(User, User.id == Profile.user_id).filter(
        User.role.in_(scoped)
    )

    if verification_status:
        wanted = verification_status.strip().lower()
        if wanted not in ("pending", "verified", "rejected"):
            raise HTTPException(
                status_code=400,
                detail="verification_status must be pending, verified or rejected",
            )
        query = query.filter(Profile.verification_status == wanted)

    needle = (q or "").strip()
    if needle:
        pattern = f"%{needle.lower()}%"
        query = query.filter(
            or_(
                func.lower(Profile.company_name).like(pattern),
                func.lower(User.full_name).like(pattern),
                func.lower(User.email).like(pattern),
            )
        )

    total = query.count()
    pages = (total + limit - 1) // limit if limit else 1
    rows = (
        query.order_by(Profile.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Tab counts are of the WHOLE directory, not the filtered slice, so the
    # admin can see how much exists in each section.
    counts = {"all": 0, "client": 0, "vendor": 0}
    for row_role, count in (
        db.query(User.role, func.count(Profile.id))
        .join(Profile, Profile.user_id == User.id)
        .filter(User.role.in_(_PROFILE_ROLES))
        .group_by(User.role)
        .all()
    ):
        counts["all"] += count
        if row_role == UserRole.client:
            counts["client"] += count
        else:
            counts["vendor"] += count

    data = []
    for profile in rows:
        user = profile.user
        if user is None:
            continue
        data.append(_list_item(profile, user))

    return {
        "data": data,
        "total": total,
        "page": page,
        "pages": pages,
        "counts": counts,
    }


@router.get(
    "/{profile_id}",
    summary="One profile in full, read-only",
    dependencies=[Depends(RateLimitService.rate_limit_user("vendor_detail"))],
)
def get_profile(
    profile_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The complete profile an admin needs for oversight.

    Read-only and never a credential: no password hash, tokens, sessions or
    private file paths. The brochure is represented by its filename, and the
    file itself is only ever served through the marketplace endpoint.
    """
    _require_admin(current_user)

    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    user = db.query(User).filter(User.id == profile.user_id).first()
    if user is None or user.role not in _PROFILE_ROLES:
        raise HTTPException(status_code=404, detail="Profile not found")

    visibility = ProfileVisibilityService.visibility_state(db, profile)
    item = _list_item(profile, user, visibility)

    service_total = (
        db.query(func.count(Service.id))
        .filter(Service.provider_id == user.id)
        .scalar()
        or 0
    )
    listing_total = (
        db.query(func.count(SupplyListing.id))
        .filter(SupplyListing.supplier_id == user.id)
        .scalar()
        or 0
    )

    item.update(
        {
            "position": profile.position,
            "bio": profile.bio,
            "years_experience": profile.years_experience or 0,
            # Business contact details the company recorded for Nhaav. Admin
            # oversight only; they are never returned by a public endpoint.
            "contacts": profile.contacts or [],
            "team": profile.team or [],
            "offices": profile.offices or [],
            "licenses": profile.licenses or [],
            "social_links": profile.social_links or {},
            "profile_metadata": profile.profile_metadata or {},
            "ports_served": profile.ports_served or [],
            "service_areas": profile.service_areas or [],
            "location": (
                {"lat": profile.location_lat, "lng": profile.location_lng}
                if profile.location_lat is not None and profile.location_lng is not None
                else None
            ),
            "badge_label": profile.badge_label,
            "rating_avg": float(profile.rating_avg or 0.0),
            "jobs_completed": int(profile.jobs_completed or 0),
            "brochure_filename": profile.brochure_filename,
            "brochure_size_bytes": profile.brochure_size_bytes,
            "visibility": {
                "is_visible": visibility["is_visible"],
                "source": visibility["source"],
                "plan": visibility["plan"],
                "starts_at": _iso(visibility["starts_at"]),
                "expires_at": _iso(visibility["expires_at"]),
            },
            "services_count": int(service_total),
            "supply_listings_count": int(listing_total),
            # Stated explicitly so the client never grows a write affordance.
            "read_only": True,
        }
    )
    return item
