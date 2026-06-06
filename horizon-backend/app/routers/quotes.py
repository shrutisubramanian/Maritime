import uuid
from typing import List
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user, get_current_client, get_current_provider
from app.models.user import User
from app.schemas.quote import QuoteCreate, QuoteResponse
from app.services.quote_service import QuoteService

router = APIRouter(
    prefix="/quotes",
    tags=["Quotes"]
)

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@router.post("/", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED, summary="Submit a quote for a request")
def create_quote(
    quote_data: QuoteCreate,
    request_id: uuid.UUID = Query(..., description="The ID of the Service Request you are bidding on"),
    db: Session = Depends(get_db),
    current_provider: User = Depends(get_current_provider)
):
    """
    Submit a new quote for an open service request.
    
    **Authorization Flow**:
    - The `get_current_provider` dependency is injected. This strictly guarantees that 
      the endpoint will instantly throw a 403 Forbidden if a 'client' tries to access it.
    - The provider's ID is safely extracted from the validated JWT token.
    """
    return QuoteService.create_quote(
        db=db, 
        provider_id=current_provider.id, 
        request_id=request_id, 
        quote_data=quote_data
    )


@router.get("/request/{request_id}", response_model=List[QuoteResponse], summary="Get all quotes for a specific request")
def get_quotes_for_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client)
):
    """
    Retrieve a list of all quotes submitted for a specific service request.
    
    **Authorization Flow**:
    - Route uses `get_current_client` to ensure only clients access it.
    - `QuoteService` further verifies that the authenticated client actually owns the `request_id`.
    """
    return QuoteService.get_quotes_for_request(db=db, request_id=request_id, client_id=current_client.id)


@router.get("/{quote_id}", response_model=QuoteResponse, summary="Get a specific quote")
def get_quote(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve details of a specific quote.
    
    **Authorization Flow**:
    - Authenticated users (either clients or providers) can view a specific quote.
    """
    return QuoteService.get_quote_by_id(db=db, quote_id=quote_id)


@router.put("/{quote_id}/accept", response_model=QuoteResponse, summary="Accept a quote")
def accept_quote(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client)
):
    """
    Accept a quote, formally awarding the job to the provider.
    
    **Authorization & Lifecycle Flow**:
    - `get_current_client` enforces that only clients can trigger this action.
    - `QuoteService` verifies that the client strictly owns the underlying Service Request.
    - Auto-rejects all competing quotes and transitions the Service Request to 'assigned'.
    """
    return QuoteService.accept_quote(db=db, quote_id=quote_id, client_id=current_client.id)


@router.put("/{quote_id}/reject", response_model=QuoteResponse, summary="Reject a quote")
def reject_quote(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client)
):
    """
    Explicitly reject a quote.
    
    **Authorization Flow**:
    - `get_current_client` enforces that only clients can trigger this action.
    - `QuoteService` verifies that the client strictly owns the underlying Service Request.
    """
    return QuoteService.reject_quote(db=db, quote_id=quote_id, client_id=current_client.id)
