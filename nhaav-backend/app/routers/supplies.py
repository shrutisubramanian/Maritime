import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user, get_optional_user
from app.models.user import User, UserRole
from app.models.supply_listing import SupplyListingStatus
from app.schemas.supply_listing import (
    SupplyListingCreate,
    SupplyListingUpdate,
    SupplyListingModerate,
    SupplyListingResponse,
    SupplyListingPaginatedResponse,
)
from app.services.moderation_service import ModerationService
from app.services.supply_listing_service import SupplyListingService
from fastapi import HTTPException

router = APIRouter(prefix="/supplies", tags=["Supplies"])


# ------------------------------------------------------------------ supplier
@router.get("/mine", response_model=list[SupplyListingResponse], summary="Get my supply listings")
def get_my_listings(
    listing_status: Optional[SupplyListingStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return SupplyListingService.get_mine(db, current_user.id, listing_status)


@router.get("/dashboard", summary="Supplier dashboard counts (real data)")
def get_supplier_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return SupplyListingService.dashboard_counts(db, current_user.id)


@router.post(
    "/",
    response_model=SupplyListingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a supply listing",
)
def create_listing(
    data: SupplyListingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return SupplyListingService.create_listing(db, current_user.id, data)


# -------------------------------------------------------------- public browse
def _with_company(db: Session, listing):
    """Resolve the SELLER's company name for one listing.

    A card must say who is selling; a product row with no company behind it is
    not a marketplace. Uses the supplier's own profile — the same one the
    public profile page shows — so the name never disagrees with the detail page.
    """
    from app.models.profile import Profile

    payload = SupplyListingResponse.model_validate(listing).model_dump(mode="json")
    if listing.supplier_id is not None:
        profile = db.query(Profile).filter(Profile.user_id == listing.supplier_id).first()
        payload["supplier_company_name"] = (
            profile.company_name if profile is not None else None
        )
    return payload


def _with_company_batch(db: Session, listings):
    """Same as `_with_company` but ONE query for a whole page, not one per row."""
    from app.models.profile import Profile

    payloads = [SupplyListingResponse.model_validate(l).model_dump(mode="json") for l in listings]
    ids = [l.supplier_id for l in listings if l.supplier_id is not None]
    names = {}
    if ids:
        for p in db.query(Profile).filter(Profile.user_id.in_(ids)).all():
            names[p.user_id] = p.company_name
    for payload, listing in zip(payloads, listings):
        payload["supplier_company_name"] = names.get(listing.supplier_id)
    return payloads


@router.get("/", response_model=SupplyListingPaginatedResponse, summary="Browse the Supplies Marketplace")
def search_supplies(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    supplier_id: Optional[uuid.UUID] = Query(None),
    port: Optional[str] = Query(None),
    availability: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    listings, total, page, pages = SupplyListingService.search_public(
        db=db, page=page, limit=limit, category=category, subcategory=subcategory,
        supplier_id=supplier_id, port=port, availability=availability, search=search,
    )
    return {
        "data": _with_company_batch(db, listings),
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.get("/{listing_id}", response_model=SupplyListingResponse, summary="Get a supply listing")
def get_listing(
    listing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    # Company name included: the detail page shows who is selling, so the buyer
    # never has to go looking for it.
    return _with_company(db, SupplyListingService.get_visible_to(db, listing_id, current_user))


# ------------------------------------------------------------------- owner ops
@router.patch("/{listing_id}", response_model=SupplyListingResponse, summary="Update my listing")
def update_listing(
    listing_id: uuid.UUID,
    data: SupplyListingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return SupplyListingService.update_listing(db, listing_id, current_user.id, data)


@router.post("/{listing_id}/submit", response_model=SupplyListingResponse, summary="Submit for review")
def submit_listing(
    listing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return SupplyListingService.submit_for_review(db, listing_id, current_user.id)


@router.post("/{listing_id}/archive", response_model=SupplyListingResponse, summary="Archive my listing")
def archive_listing(
    listing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return SupplyListingService.archive_listing(db, listing_id, current_user.id)


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete my listing")
def delete_listing(
    listing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    SupplyListingService.delete_listing(db, listing_id, current_user.id)
    return None


# ----------------------------------------------------------------- moderation
@router.post("/{listing_id}/moderate", response_model=SupplyListingResponse, summary="Admin moderate a listing")
def moderate_listing(
    listing_id: uuid.UUID,
    data: SupplyListingModerate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    # Delegate to the unified moderation surface so the audit log and owner
    # notification are always written, regardless of which endpoint an admin hits.
    ModerationService.act(db, current_user.id, "supply", listing_id, data.status.value)
    return SupplyListingService.get_visible_to(db, listing_id, current_user)
