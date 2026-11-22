import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user, get_optional_user
from app.models.service import ServiceListingStatus
from app.models.user import User, UserRole
from app.schemas.service import (
    ServiceCreate,
    ServiceModerate,
    ServicePaginatedResponse,
    ServiceResponse,
    ServiceUpdate,
)
from app.services.moderation_service import ModerationService
from app.services.service_listing_service import ServiceListingService

router = APIRouter(prefix="/services", tags=["Services"])


# ------------------------------------------------------------------ provider
@router.get("/mine", response_model=list[ServiceResponse], summary="Get my service listings")
def get_my_listings(
    listing_status: Optional[ServiceListingStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ServiceListingService.get_mine(db, current_user.id, listing_status)


@router.get("/dashboard", summary="Provider dashboard counts (real data)")
def get_provider_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ServiceListingService.dashboard_counts(db, current_user.id)


@router.post(
    "/",
    response_model=ServiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a service listing",
)
def create_listing(
    data: ServiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ServiceListingService.create_listing(db, current_user.id, data)


# -------------------------------------------------------------- public browse
@router.get("/", response_model=ServicePaginatedResponse, summary="Browse the Service Marketplace")
def search_services(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    provider_id: Optional[uuid.UUID] = Query(None),
    port: Optional[str] = Query(None),
    service_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    listings, total, page, pages = ServiceListingService.search_public(
        db=db, page=page, limit=limit, category=category, subcategory=subcategory,
        provider_id=provider_id, port=port, service_id=service_id, search=search,
    )
    return {"data": listings, "total": total, "page": page, "pages": pages}


@router.get("/{listing_id}", response_model=ServiceResponse, summary="Get a service listing")
def get_listing(
    listing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    return ServiceListingService.get_visible_to(db, listing_id, current_user)


# ------------------------------------------------------------------- owner ops
@router.patch("/{listing_id}", response_model=ServiceResponse, summary="Update my service listing")
def update_listing(
    listing_id: uuid.UUID,
    data: ServiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ServiceListingService.update_listing(db, listing_id, current_user.id, data)


@router.post("/{listing_id}/submit", response_model=ServiceResponse, summary="Submit for review")
def submit_listing(
    listing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ServiceListingService.submit_for_review(db, listing_id, current_user.id)


@router.post("/{listing_id}/archive", response_model=ServiceResponse, summary="Archive my service listing")
def archive_listing(
    listing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ServiceListingService.archive_listing(db, listing_id, current_user.id)


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete my service listing")
def delete_listing(
    listing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ServiceListingService.delete_listing(db, listing_id, current_user.id)
    return None


# ----------------------------------------------------------------- moderation
@router.post("/{listing_id}/moderate", response_model=ServiceResponse, summary="Admin moderate a service listing")
def moderate_listing(
    listing_id: uuid.UUID,
    data: ServiceModerate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    # Delegate to the unified moderation surface so the audit log and owner
    # notification are always written, regardless of which endpoint an admin hits.
    ModerationService.act(db, current_user.id, "service", listing_id, data.status.value)
    return ServiceListingService.get_visible_to(db, listing_id, current_user)
