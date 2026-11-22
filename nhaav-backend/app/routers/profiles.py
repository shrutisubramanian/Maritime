import uuid
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.middleware.auth_guard import get_current_user, get_optional_user
from app.models.user import User
from app.models.profile import Profile, VerificationStatus
from app.schemas.profile import (
    ProfileCreate,
    ProfileExcelImportValues,
    ProfileUpdate,
    ProfileResponse,
    ProfilePaginatedResponse,
    PublicProfileResponse,
    PublicProfilePaginatedResponse,
)
from app.services.profile_service import ProfileService
from app.services.rate_limit_service import RateLimitService, client_ip
from app.models.user import UserRole
from app.models.supply_listing import SupplyListing, SupplyListingStatus

router = APIRouter(
    prefix="/profiles",
    tags=["Profiles"]
)

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@router.post("/", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED,
             summary="Create a new profile", response_description="The newly created profile.")
def create_profile(
    profile_data: ProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a profile for the currently authenticated user.
    
    **Dependency Injection Flow**:
    1. `get_current_user` extracts the JWT token, validates it, and injects the `User` object.
    2. `get_db` injects a database session.
    3. The request body is validated against `ProfileCreate`.
    4. Passes the validated data, DB session, and the user's ID to `ProfileService`.

    Only suppliers and service providers have a marketplace profile; a client
    account is refused outright (403) rather than being given a vendor shell.
    """
    if current_user.role not in (UserRole.provider, UserRole.supplier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only suppliers and service providers can create a company profile.",
        )
    return ProfileService.create_profile(db=db, user_id=current_user.id, profile_data=profile_data)


@router.get("/me", response_model=ProfileResponse, summary="Get your own profile")
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve the profile of the currently authenticated user.
    
    **Request Flow**:
    1. Authenticates the user via the `get_current_user` dependency.
    2. Calls `ProfileService.get_profile_by_user_id` using the injected user's ID.
    3. Automatically serializes the ORM object into a `ProfileResponse` JSON.
    """
    return ProfileService.get_profile_by_user_id(db=db, user_id=current_user.id)


@router.put("/me", response_model=ProfileResponse, summary="Update your own profile")
def update_my_profile(
    update_data: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update the profile of the currently authenticated user.
    Supports partial updates (only fields provided in the payload will be modified).
    
    **Security Note**: 
    Users can ONLY update their own profile because the `user_id` passed to the service 
    is strictly extracted from the authenticated `current_user.id` from the JWT token.
    """
    return ProfileService.update_profile(db=db, user_id=current_user.id, update_data=update_data)


@router.get(
    "/me/import-excel/template",
    summary="Download the Excel template for filling in your company profile",
)
def download_profile_import_template(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The company-profile workbook vendors fill in, with dropdowns.

    Downloading is harmless for any signed-in user; importing is restricted to
    vendors (they are the only accounts with a company profile). The port
    dropdown is built from the live port catalogue.
    """
    from app.services.profile_excel_import import build_template

    return Response(
        content=build_template(db, current_user),
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": (
                'attachment; filename="nhaav-company-profile-template.xlsx"'
            )
        },
    )


@router.post(
    "/me/import-excel",
    summary="Preview an Excel profile import (never saves)",
    dependencies=[Depends(RateLimitService.rate_limit_user("profile_import"))],
)
async def preview_profile_excel_import(
    file: UploadFile = File(..., description="Completed Nhaav profile template (.xlsx)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Parse the workbook and return a review payload.

    This endpoint deliberately writes nothing: the vendor reviews and edits the
    values, then the normal ``PUT /profiles/me`` flow applies them, so existing
    profile validation and verification behaviour stay in one place.
    """
    from app.services.profile_excel_import import MAX_EXCEL_BYTES, parse_preview

    content = bytearray()
    while True:
        chunk = await file.read(256 * 1024)
        if not chunk:
            break
        content.extend(chunk)
        if len(content) > MAX_EXCEL_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "file_too_large",
                    "message": (
                        f"That workbook is larger than "
                        f"{MAX_EXCEL_BYTES // (1024 * 1024)} MB. The template only "
                        "needs one company row."
                    ),
                },
            )

    return parse_preview(db, current_user, file.filename or "", bytes(content))


@router.post(
    "/me/import-excel/validate",
    summary="Re-check values edited after an Excel import (never saves)",
    dependencies=[
        Depends(RateLimitService.rate_limit_user("profile_import_validate"))
    ],
)
def validate_profile_excel_import(
    values: ProfileExcelImportValues,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply the same category/port validation to hand-edited values.

    Editing in the review screen must not require re-uploading the workbook, so
    the corrected values go through exactly the same mapping and review rules.
    """
    from app.services.profile_excel_import import preview_values

    return preview_values(db, current_user, values.model_dump())


@router.put(
    "/me/brochure",
    summary="Attach or replace your company brochure (PDF, 15 MB max)",
    dependencies=[Depends(RateLimitService.rate_limit_user("profile_upload"))],
)
async def upload_my_brochure(
    file: UploadFile = File(..., description="Company brochure (PDF, up to 15 MB)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vendors may attach one PDF describing their business, in their own words.

    Ownership comes from the session, never the payload, and only suppliers and
    service providers have a marketplace profile to attach it to.
    """
    from app.services.profile_brochure_service import ProfileBrochureService

    if current_user.role not in (UserRole.provider, UserRole.supplier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only suppliers and service providers can attach a company brochure.",
        )
    profile = ProfileService.get_profile_by_user_id(db=db, user_id=current_user.id)
    ProfileBrochureService.upload(db, profile, file)
    return {
        "status": "success",
        "brochure": {
            "filename": profile.brochure_filename,
            "size_bytes": profile.brochure_size_bytes,
            "uploaded_at": profile.brochure_uploaded_at,
        },
    }


@router.delete("/me/brochure", summary="Remove your company brochure")
def delete_my_brochure(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.profile_brochure_service import ProfileBrochureService

    profile = ProfileService.get_profile_by_user_id(db=db, user_id=current_user.id)
    ProfileBrochureService.remove(db, profile)
    return {"status": "success", "brochure": None}


@router.get("/providers", response_model=PublicProfilePaginatedResponse, summary="Search Provider Marketplace")
def search_providers(
    request: Request,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=settings.MAX_SEARCH_PAGE_SIZE, description="Items per page"),
    position: Optional[str] = Query(None, description="Filter by job title or position"),
    skill: Optional[str] = Query(None, description="Filter by specific skill"),
    port: Optional[str] = Query(None, description="Filter by port served"),
    verification_status: Optional[VerificationStatus] = Query(None, description="Filter by verification status"),
    min_experience: Optional[int] = Query(None, ge=0, description="Minimum years of experience"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Search and filter public provider profiles.
    
    **Features**:
    - Returns paginated results wrapping the profile data array.
    - Efficiently filters JSONB fields (skills, ports_served) using PostgreSQL operators.
    - Joins with the User model to ensure only users with role='provider' appear in results.
    """
    if current_user is not None:
        RateLimitService.check(db, "vendor_search", str(current_user.id))
    else:
        RateLimitService.check(db, "public_search", client_ip(request))

    profiles, total, page, pages = ProfileService.search_providers(
        db=db, page=page, limit=limit, position=position, skill=skill, 
        port=port, verification_status=verification_status, min_experience=min_experience
    )
    
    return {
        "data": [_build_public_profile(db, profile) for profile in profiles],
        "total": total,
        "page": page,
        "pages": pages
    }





@router.get(
    "/suppliers",
    response_model=PublicProfilePaginatedResponse,
    summary="Search Supplier Marketplace"
)
def search_suppliers(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=settings.MAX_SEARCH_PAGE_SIZE),
    skill: Optional[str] = None,
    port: Optional[str] = None,
    verification_status: Optional[VerificationStatus] = None,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):

    if current_user is not None:
        RateLimitService.check(db, "vendor_search", str(current_user.id))
    else:
        RateLimitService.check(db, "public_search", client_ip(request))

    profiles, total, page, pages = (
        ProfileService.search_suppliers(
            db=db,
            page=page,
            limit=limit,
            skill=skill,
            port=port,
            verification_status=verification_status
        )
    )

    return {
        "data": [_build_public_profile(db, profile) for profile in profiles],
        "total": total,
        "page": page,
        "pages": pages
    }


@router.put(
    "/{profile_id}/verify",
    response_model=ProfileResponse,
    summary="Verify a profile"
)
def verify_profile(
    profile_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verification is an administrative trust action; never self-service.
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return ProfileService.verify_profile(
        db=db,
        profile_id=profile_id,
        reviewer=current_user,
    )




def _additional_categories(profile) -> list[str]:
    """The company's other business categories, as stored strings only."""
    raw = (profile.profile_metadata or {}).get("additional_categories")
    if not isinstance(raw, list):
        return []
    return [str(name).strip() for name in raw if str(name or "").strip()]


def _build_public_profile(db: Session, profile) -> PublicProfileResponse:
    """Assemble the safe public view for a provider or supplier profile."""
    user = profile.user
    role = user.role.value if user and user.role else "unknown"

    services = []
    listings = []
    if user and user.role == UserRole.provider:
        # Only listings that are approved AND inside their paid 60-day placement
        # window are exposed publicly.
        services = [s for s in profile.services if s.is_live]
    elif user and user.role == UserRole.supplier:
        from datetime import datetime

        listings = (
            db.query(SupplyListing)
            .filter(
                SupplyListing.supplier_id == profile.user_id,
                SupplyListing.status == SupplyListingStatus.approved,
                SupplyListing.expires_at.isnot(None),
                SupplyListing.expires_at > datetime.utcnow(),
            )
            .all()
        )

    # Paid visibility window, evaluated server-side (never a browser clock).
    from app.services.profile_visibility_service import ProfileVisibilityService

    visibility = ProfileVisibilityService.visibility_state(db, profile)

    return PublicProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        role=role,
        company_name=profile.company_name,
        # The account's single number, published as the business contact so a
        # buyer can reach the company from the card. The private `contacts` list
        # stays private.
        phone=getattr(user, "phone", None) if user is not None else None,
        position=profile.position,
        bio=profile.bio,
        years_experience=profile.years_experience,
        ports_served=profile.ports_served,
        availability_status=profile.availability_status,
        verification_status=profile.verification_status,
        badge_label=profile.badge_label,
        rating_avg=profile.rating_avg,
        jobs_completed=profile.jobs_completed,
        skills=profile.skills or [],
        services=services,
        listings=listings,
        primary_category_name=profile.primary_category_name,
        subcategory_names=profile.subcategory_names,
        # Extra categories the company says it also works in. Descriptive only;
        # discovery still keys off the primary category.
        additional_categories=_additional_categories(profile),
        country=profile.country,
        head_office=profile.head_office,
        # The storefront's own published links and address (empty ones dropped).
        social_links={
            network: url
            for network, url in (profile.social_links or {}).items()
            if url and str(url).strip()
        },
        address=(profile.profile_metadata or {}).get("address") or None,
        registration_number=(profile.profile_metadata or {}).get("regNumber") or None,
        service_areas=profile.service_areas,
        location_lat=profile.location_lat,
        location_lng=profile.location_lng,
        visibility_expires_at=visibility.get("expires_at"),
    )


@router.get(
    "/by-user/{user_id}/public",
    response_model=PublicProfileResponse,
    summary="Get the public profile of a user (provider or supplier)",
)
def get_public_profile_by_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Public profile view keyed by the user id (used for the supplier profile on
    a supply listing, where only the supplier_id is known).

    Anonymous and client callers may read a vendor's safe public view. A
    provider or supplier may only read its own profile.
    """
    profile = ProfileService.get_profile_by_user_id(db=db, user_id=user_id)
    ProfileService.assert_public_profile_access(profile, current_user)
    return _build_public_profile(db, profile)


@router.get(
    "/{profile_id}/public",
    response_model=PublicProfileResponse,
    summary="Get a public profile by profile ID",
)
def get_public_profile(
    profile_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Safe provider/supplier profile view (no KYC/PII).

    Anonymous and client callers may read it; a vendor may only read its own.
    """
    from app.models.profile import Profile as _Profile
    profile = db.query(_Profile).filter(_Profile.id == profile_id).first()
    if not profile:
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(status_code=404, detail="Profile not found")
    ProfileService.assert_public_profile_access(profile, current_user)
    return _build_public_profile(db, profile)


@router.get("/{profile_id}", summary="Get a profile by ID",
            dependencies=[Depends(RateLimitService.rate_limit_user("vendor_detail"))])
def get_profile_by_id(
    profile_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve a profile by its UUID.
    Must be authenticated to view other users' profiles.
    
    **Request Flow**:
    1. Validates the `profile_id` path parameter as a valid UUID.
    2. Uses `ProfileService` to query the database.
    3. If the profile doesn't exist, the service throws a 404.
    """
    try:
        return ProfileService.get_profile_by_id(
            db=db, profile_id=profile_id, current_user=current_user
        )
    except HTTPException as exc:
        # The endpoint predates the safe public projection. Keep its "200 for a
        # signed-in marketplace user" contract, but never serialize private
        # profile columns to a non-owner: fall back to the same sanitized view
        # used by /profiles/{id}/public.
        if exc.status_code != status.HTTP_403_FORBIDDEN:
            raise
        profile = db.query(Profile).filter(Profile.id == profile_id).first()
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found"
            )
        # Keep the sanitized fallback for clients, but a vendor still may not
        # use this endpoint to read a competitor's public projection.
        ProfileService.assert_public_profile_access(profile, current_user)
        return _build_public_profile(db, profile)
