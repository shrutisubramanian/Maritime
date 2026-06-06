import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user, get_current_client
from app.models.user import User
from app.models.request import UrgencyLevel, RequestStatus
from app.schemas.request import (
    ServiceRequestCreate,
    ServiceRequestUpdate,
    ServiceRequestResponse,
    ServiceRequestPaginatedResponse
)
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
    current_client: User = Depends(get_current_client)
):
    """
    Create a new service request.
    
    **Lifecycle & Authorization**:
    - ONLY users with the 'client' role can hit this endpoint (`get_current_client` dependency enforces this).
    - The new request inherently starts in the 'open' state (enforced by the schema omitting the status field).
    """
    return ServiceRequestService.create_request(db=db, user_id=current_client.id, request_data=request_data)


@router.get("/", response_model=ServiceRequestPaginatedResponse, summary="Browse service requests")
def get_all_requests(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    port: Optional[str] = Query(None, description="Filter by port"),
    service_type: Optional[str] = Query(None, description="Filter by service type"),
    urgency: Optional[UrgencyLevel] = Query(None, description="Filter by urgency level"),
    status_req: Optional[RequestStatus] = Query(None, alias="status", description="Filter by status"),
    client_id: Optional[uuid.UUID] = Query(None, description="Filter by client ID"),
    db: Session = Depends(get_db)
):
    """
    Browse and filter the public marketplace of service requests.
    
    **Lifecycle & Authorization**:
    - This is completely public (no JWT required) so providers can browse open jobs on the market.
    - Supports rich filtering and pagination.
    """
    requests, total, page, pages = ServiceRequestService.get_all_requests(
        db=db, page=page, limit=limit, port=port, service_type=service_type,
        urgency=urgency, status_req=status_req, client_id=client_id
    )
    return {
        "data": requests,
        "total": total,
        "page": page,
        "pages": pages
    }


@router.get("/{request_id}", response_model=ServiceRequestResponse, summary="Get a specific request")
def get_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Retrieve a specific service request by its ID.
    
    **Lifecycle & Authorization**:
    - Public endpoint (no JWT required) so interested providers can view the details before quoting.
    """
    return ServiceRequestService.get_request_by_id(db=db, request_id=request_id)


@router.put("/{request_id}", response_model=ServiceRequestResponse, summary="Update a service request")
def update_request(
    request_id: uuid.UUID,
    update_data: ServiceRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
):
    """
    Delete a service request entirely.
    
    **Lifecycle & Authorization**:
    - Requires authentication.
    - The Service layer strictly enforces that `current_user.id` MUST match the request's original `client_id`.
    """
    ServiceRequestService.delete_request(db=db, request_id=request_id, user_id=current_user.id)
    return None
