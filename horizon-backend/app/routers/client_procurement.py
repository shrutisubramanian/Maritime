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
    current_client: User = Depends(get_current_client)
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
    current_client: User = Depends(get_current_client)
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
    current_client: User = Depends(get_current_client)
):
    """
    Return all quotations for the selected request including provider details.
    """
    quotes = QuoteService.get_quotes_for_request(db=db, request_id=request_id, client_id=current_client.id)
    
    result = []
    for q in quotes:
        provider = q.provider
        quote_dict = QuoteResponse.model_validate(q).model_dump()
        quote_dict["provider"] = {
            "company_name": provider.profile.company_name if provider.profile else provider.email,
            "logo": provider.profile.logo_url if provider.profile else None,
            "average_rating": getattr(provider.profile, 'rating', None) if provider.profile else None,
            "completed_jobs": getattr(provider.profile, 'completed_jobs', 0) if provider.profile else 0,
            "verification_status": provider.profile.verification_status if provider.profile else "unverified"
        }
        result.append(quote_dict)
        
    return result

@router.get("/quotations/{quote_id}", response_model=QuoteResponse, summary="Get complete quotation details")
def get_client_quotation(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client)
):
    """
    Return complete quotation details.
    """
    quote_obj = QuoteService.get_quote_by_id(db=db, quote_id=quote_id)
    # verify ownership
    service_request = db.query(ServiceRequest).filter(ServiceRequest.id == quote_obj.request_id).first()
    if not service_request or service_request.client_id != current_client.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this quote")
    return quote_obj

@router.patch("/quotations/{quote_id}/accept", response_model=QuoteResponse, summary="Accept quotation")
def accept_client_quotation(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client)
):
    """
    Accept a quotation, award the request, and notify providers.
    """
    return QuoteService.accept_quote(db=db, quote_id=quote_id, client_id=current_client.id)

@router.patch("/quotations/{quote_id}/reject", response_model=QuoteResponse, summary="Reject quotation")
def reject_client_quotation(
    quote_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client)
):
    """
    Reject an individual quotation.
    """
    return QuoteService.reject_quote(db=db, quote_id=quote_id, client_id=current_client.id)

@router.get("/requests/{request_id}/comparison", summary="Get comparison-ready data for quotations")
def get_quotation_comparison(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_client)
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
    for q in quotes:
        provider = q.provider
        profile = provider.profile
        
        comparison_data.append({
            "quote_id": q.id,
            "provider_name": profile.company_name if profile else provider.email,
            "provider_logo": profile.logo_url if profile else None,
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
