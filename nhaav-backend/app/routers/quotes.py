import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user, get_current_client, get_current_provider, get_current_responder
from app.models.user import User, UserRole
from app.models.request import ServiceRequest
from app.schemas.quote import QuoteCreate, QuoteResponse, QuoteWithRequestResponse, QuoteUpdate
from app.services.onboarding_service import require_marketplace_access
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
    request_id: uuid.UUID = Query(..., description="The ID of the request you are bidding on"),
    db: Session = Depends(get_db),
    current_responder: User = Depends(get_current_responder),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Submit a new quote for an open request.

    **Authorization Flow**:
    - `get_current_responder` allows providers and suppliers.
    - The quote service enforces the *request type*: providers may only quote
      SERVICE requests, suppliers may only quote SUPPLY requests.
    """
    return QuoteService.create_quote(
        db=db, 
        provider_id=current_responder.id, 
        request_id=request_id, 
        quote_data=quote_data
    )


@router.get("/my-quotations", response_model=List[QuoteWithRequestResponse], summary="Get all quotations submitted by the logged-in provider")
def get_my_quotations(
    db: Session = Depends(get_db),
    current_responder: User = Depends(get_current_responder),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Retrieve a list of all quotes submitted by the current provider or supplier.
    """
    return QuoteService.get_quotes_for_provider(db=db, provider_id=current_responder.id)

@router.patch("/{quote_id}/provider-accept", response_model=QuoteResponse, summary="Provider confirms it can take an awarded job")
def provider_accept_job(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_responder: User = Depends(get_current_responder),
    _gate: User = Depends(require_marketplace_access),
):
    """
    The provider or supplier accepts the job the client awarded it.

    This is the second half of the two-sided agreement: the client's acceptance
    awards the work, the provider's acceptance confirms it. Only after both does
    the client see the provider's name and phone number; until then the offer is
    shown as job title + price only, and the client is notified the moment this
    call succeeds.
    """
    return QuoteService.provider_accept(
        db=db, quote_id=quote_id, provider_id=current_responder.id
    )


@router.get("/request/{request_id}", summary="Get all quotes for a specific request")
def get_quotes_for_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Retrieve a list of all quotes submitted for a specific service request.

    **Authorization Flow**:
    - Route uses `get_current_client` to ensure only clients access it.
    - `QuoteService` further verifies that the authenticated client actually owns the `request_id`.

    Each row goes through the anonymity rule: until the provider has accepted
    the awarded job, the offer carries only the job title and the price — no
    company name, no provider id, no contact number.
    """
    quotes = QuoteService.get_quotes_for_request(
        db=db, request_id=request_id, client_id=current_client.id
    )
    return [
        QuoteService.client_visible_quote(q, label=f"Offer {i}")
        for i, q in enumerate(quotes, start=1)
    ]


@router.get("/{quote_id}", summary="Get a specific quote")
def get_quote(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Retrieve details of a specific quote.

    **Authorization Flow**:
    - The submitting provider, the client who owns the parent request, or an
      admin may read the quote; anyone else gets 403 (same policy/message as
      the sibling `GET /client/quotations/{id}`).
    """
    quote = QuoteService.get_quote_by_id(db=db, quote_id=quote_id)
    if current_user.role != UserRole.admin and quote.provider_id != current_user.id:
        parent = (
            db.query(ServiceRequest)
            .filter(ServiceRequest.id == quote.request_id)
            .first()
        )
        if not parent or parent.client_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this quote")
        # The client reads their own bid through the anonymity rule.
        return QuoteService.client_visible_quote(quote)
    return quote


@router.put("/{quote_id}", response_model=QuoteResponse, summary="Update a draft quote")
def update_quote(
    quote_id: uuid.UUID,
    update_data: QuoteUpdate,
    db: Session = Depends(get_db),
    current_responder: User = Depends(get_current_responder),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Update an existing draft quote.

    **Authorization Flow**:
    - `get_current_responder` ensures only providers/suppliers can access this route.
    - `QuoteService` verifies ownership and draft/submitted state.
    """
    return QuoteService.update_quote(
        db=db,
        quote_id=quote_id,
        provider_id=current_responder.id,
        update_data=update_data
    )


@router.put("/{quote_id}/accept", summary="Accept a quote")
def accept_quote(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Accept a quote, formally awarding the job to the provider.
    
    **Authorization & Lifecycle Flow**:
    - `get_current_client` enforces that only clients can trigger this action.
    - `QuoteService` verifies that the client strictly owns the underlying Service Request.
    - Auto-rejects all competing quotes and transitions the Service Request to 'assigned'.

    The response is client-safe: accepting reveals nothing about the provider,
    who becomes visible only once they accept the job themselves.
    """
    quote = QuoteService.accept_quote(
        db=db, quote_id=quote_id, client_id=current_client.id
    )
    return QuoteService.client_visible_quote(quote)


@router.put("/{quote_id}/reject", summary="Reject a quote")
def reject_quote(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Explicitly reject a quote.
    
    **Authorization Flow**:
    - `get_current_client` enforces that only clients can trigger this action.
    - `QuoteService` verifies that the client strictly owns the underlying Service Request.
    """
    quote = QuoteService.reject_quote(
        db=db, quote_id=quote_id, client_id=current_client.id
    )
    return QuoteService.client_visible_quote(quote)
