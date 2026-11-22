import uuid
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.middleware.auth_guard import get_current_client
from app.models.user import User
from app.models.request import ServiceRequest
from app.models.quote import Quote
from app.schemas.request import ServiceRequestResponse, ServiceRequestPaginatedResponse
from app.schemas.quote import QuoteResponse
from app.services.onboarding_service import require_marketplace_access
from app.services.request_service import ServiceRequestService
from app.services.quote_service import QuoteService

router = APIRouter(
    prefix="/client",
    tags=["Client Procurement"]
)

@router.get("/requests", response_model=ServiceRequestPaginatedResponse, summary="Get client's procurement requests")
def get_client_requests(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Return all procurement requests created by the logged-in client.
    """
    requests, total, page, pages = ServiceRequestService.get_all_requests(
        db=db, page=page, limit=limit, client_id=current_client.id
    )
    return {
        "data": requests,
        "total": total,
        "page": page,
        "pages": pages
    }

@router.get("/requests/{request_id}", summary="Get full request details with quotation count")
def get_client_request_details(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Return full procurement request details with quotation count.
    """
    request_obj = ServiceRequestService.get_request_by_id(db=db, request_id=request_id)
    if request_obj.client_id != current_client.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this request")
        
    quote_count = db.query(func.count(Quote.id)).filter(Quote.request_id == request_id).scalar()
    
    # We can serialize using the Pydantic schema and then add the count
    request_data = ServiceRequestResponse.model_validate(request_obj).model_dump()
    request_data["quotation_count"] = quote_count
    
    return request_data

@router.get("/requests/{request_id}/quotations", summary="Get all quotations for a request")
def get_client_request_quotations(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Return all quotations for the selected request, anonymised until both sides
    have accepted.

    Before mutual acceptance each row is "Offer N" with the price and terms but
    no provider identity or contact details; after the provider accepts the
    awarded job, `provider_contact` carries their name and phone number.
    """
    quotes = QuoteService.get_quotes_for_request(db=db, request_id=request_id, client_id=current_client.id)
    return [
        QuoteService.client_visible_quote(q, label=f"Offer {i}")
        for i, q in enumerate(quotes, start=1)
    ]

@router.get("/quotations/{quote_id}", summary="Get complete quotation details")
def get_client_quotation(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Return complete quotation details, under the same anonymity rule as the
    list: the provider's identity and phone arrive only after they accept.
    """
    quote_obj = QuoteService.get_quote_by_id(db=db, quote_id=quote_id)
    # verify ownership
    service_request = db.query(ServiceRequest).filter(ServiceRequest.id == quote_obj.request_id).first()
    if not service_request or service_request.client_id != current_client.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this quote")
    return QuoteService.client_visible_quote(quote_obj)

@router.patch("/quotations/{quote_id}/accept", summary="Accept quotation")
def accept_client_quotation(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Accept a quotation, award the request, and notify providers.

    The response goes through the anonymity rule, so accepting does not itself
    reveal who the provider is — that happens when they accept the job.
    """
    quote = QuoteService.accept_quote(db=db, quote_id=quote_id, client_id=current_client.id)
    return QuoteService.client_visible_quote(quote)

@router.patch("/quotations/{quote_id}/reject", summary="Reject quotation")
def reject_client_quotation(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Reject an individual quotation.
    """
    quote = QuoteService.reject_quote(db=db, quote_id=quote_id, client_id=current_client.id)
    return QuoteService.client_visible_quote(quote)

@router.get("/requests/{request_id}/comparison", summary="Get comparison-ready data for quotations")
def get_quotation_comparison(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Return comparison-ready data including:
    - Price
    - Timeline
    - Warranty
    - Rating
    - Completed Jobs
    - Certifications
    - Ports Covered
    - Payment Terms
    """
    quotes = QuoteService.get_quotes_for_request(db=db, request_id=request_id, client_id=current_client.id)
    
    comparison_data = []
    for i, q in enumerate(quotes, start=1):
        provider = q.provider
        profile = provider.profile
        revealed = QuoteService.contact_revealed(q)

        comparison_data.append({
            "quote_id": q.id,
            # Identity is part of the reveal, not part of the comparison.
            "provider_name": (
                (profile.company_name if profile else provider.email) if revealed else None
            ),
            "provider_label": f"Offer {i}",
            "contact_revealed": revealed,
            "provider_logo": getattr(profile, 'logo_url', None) if revealed and profile else None,
            "price": q.amount,
            "currency": q.currency,
            "taxes_included": q.taxes_included,
            "travel_charges": q.travel_charges,
            "timeline": q.estimated_duration,
            "warranty": q.warranty_period,
            "payment_terms": q.payment_terms,
            "rating": getattr(profile, 'rating', None) if profile else None,
            "completed_jobs": getattr(profile, 'completed_jobs', 0) if profile else 0,
            "certifications": getattr(profile, 'certifications', []) if profile else [],
            "ports_covered": getattr(profile, 'ports_covered', []) if profile else [],
            "status": q.status
        })
        
    return comparison_data
