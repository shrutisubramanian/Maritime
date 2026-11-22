import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.middleware.auth_guard import get_current_user, get_current_client, get_optional_user
from app.models.user import User
from app.models.request import UrgencyLevel, RequestStatus, RequestType
from app.schemas.request import (
    ServiceRequestCreate,
    ServiceRequestUpdate,
    ServiceRequestResponse,
    ServiceRequestPaginatedResponse,
    PublicServiceRequestResponse,
)
from app.services.onboarding_service import OnboardingService, require_marketplace_access
from app.services.request_service import ServiceRequestService

router = APIRouter(
    prefix="/requests",
    tags=["Service Requests"]
)

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@router.post("/", response_model=ServiceRequestResponse, status_code=status.HTTP_201_CREATED, summary="Create a new service request")
def create_request(
    request_data: ServiceRequestCreate,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Create a new service request.
    
    **Lifecycle & Authorization**:
    - ONLY users with the 'client' role can hit this endpoint (`get_current_client` dependency enforces this).
    - The new request inherently starts in the 'open' state (enforced by the schema omitting the status field).
    """
    return ServiceRequestService.create_request(db=db, user_id=current_client.id, request_data=request_data)


@router.get("/", summary="Browse service requests")
def get_all_requests(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=settings.MAX_SEARCH_PAGE_SIZE, description="Items per page"),
    port: Optional[str] = Query(None, description="Filter by port"),
    service_type: Optional[str] = Query(None, description="Filter by service type"),
    service_group: Optional[str] = Query(None,description="Filter by service category group"),
    urgency: Optional[UrgencyLevel] = Query(None, description="Filter by urgency level"),
    status_req: Optional[RequestStatus] = Query(None, alias="status", description="Filter by status"),
    client_id: Optional[uuid.UUID] = Query(None, description="Filter by client ID"),
    request_type: Optional[RequestType] = Query(None, description="Filter by request type (service|supply)"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Browse and filter the public marketplace of service requests.
    
    **Lifecycle & Authorization**:
    - This is completely public (no JWT required) so providers can browse open jobs on the market.
    - Supports rich filtering and pagination.
    """
    # Anonymous callers may browse OPEN opportunities only, and never receive
    # the client identity, budget, attachments or award state. A fully
    # authenticated marketplace participant gets the complete record.
    can_view_private = False
    if current_user is not None:
        try:
            OnboardingService.ensure_marketplace_access(db, current_user)
            can_view_private = True
        except HTTPException:
            can_view_private = False

    # A non-admin may filter only their own client id; providers cannot use this
    # parameter to enumerate a client's request history.
    effective_client_id = None
    if can_view_private and client_id is not None:
        if current_user.role.value == "admin" or (
            current_user.role.value == "client" and client_id == current_user.id
        ):
            effective_client_id = client_id

    requests, total, page, pages = ServiceRequestService.get_all_requests(
        db=db, page=page, limit=limit, port=port, service_type=service_type,
        urgency=urgency, status_req=status_req, client_id=effective_client_id,
        service_group=service_group, request_type=request_type,
        public_only=not can_view_private,
    )
    if can_view_private:
        data = [ServiceRequestResponse.model_validate(item) for item in requests]
    else:
        data = [PublicServiceRequestResponse.model_validate(item) for item in requests]
    return {
        "data": data,
        "total": total,
        "page": page,
        "pages": pages
    }


@router.get("/{request_id}", summary="Get a specific request")
def get_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Retrieve a specific service request by its ID.
    
    **Lifecycle & Authorization**:
    - Anonymous callers see only OPEN requests and the public projection.
    - Eligible authenticated marketplace participants see the complete record.
    """
    request_obj = ServiceRequestService.get_request_by_id(db=db, request_id=request_id)

    can_view_private = False
    if current_user is not None:
        try:
            OnboardingService.ensure_marketplace_access(db, current_user)
            can_view_private = True
        except HTTPException:
            can_view_private = False

    if can_view_private:
        return ServiceRequestResponse.model_validate(request_obj)
    if request_obj.status != RequestStatus.open:
        raise HTTPException(status_code=404, detail="Service request not found")
    return PublicServiceRequestResponse.model_validate(request_obj)


@router.put("/{request_id}", response_model=ServiceRequestResponse, summary="Update a service request")
def update_request(
    request_id: uuid.UUID,
    update_data: ServiceRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Update a service request.
    
    **Lifecycle & Authorization**:
    - Requires authentication.
    - The Service layer strictly enforces that `current_user.id` MUST match the request's original `client_id`.
    - Commonly used to update details or cancel the request (status update).
    """
    return ServiceRequestService.update_request(db=db, request_id=request_id, user_id=current_user.id, update_data=update_data)


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a service request")
def delete_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Delete a service request entirely.
    
    **Lifecycle & Authorization**:
    - Requires authentication.
    - The Service layer strictly enforces that `current_user.id` MUST match the request's original `client_id`.
    """
    ServiceRequestService.delete_request(db=db, request_id=request_id, user_id=current_user.id)
    return None
