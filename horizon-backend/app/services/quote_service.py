from app.services.job_service import JobService
import uuid
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User, UserRole
from app.models.request import ServiceRequest, RequestStatus
from app.models.quote import Quote, QuoteStatus
from app.schemas.quote import QuoteCreate, QuoteUpdate


class QuoteService:
    """
    Service class handling business logic for the Bidding/Quote system.
    Encapsulates rules for submitting quotes, accepting bids, and auto-rejecting competitors.
    """

    @staticmethod
    def create_quote(
        db: Session, 
        provider_id: uuid.UUID, 
        request_id: uuid.UUID, 
        quote_data: QuoteCreate
    ) -> Quote:
        """
        Submit a new quote for a service request.
        Business Rule: Only users with the 'provider' role can submit quotes.
        """
        # 1. Verify user is a provider
        user = db.query(User).filter(User.id == provider_id).first()
        if not user or user.role != UserRole.provider:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Only providers can submit quotes"
            )

        # 2. Verify the Service Request actually exists and is open
        service_request = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
        if not service_request:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")
            
        if service_request.status != RequestStatus.open:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Cannot submit a quote to a request that is not open"
            )

        # 3. Prevent multiple quotes from the same provider on the same request
        existing_quote = db.query(Quote).filter(Quote.provider_id == provider_id, Quote.request_id == request_id).first()
        if existing_quote:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="You have already submitted a quote for this request"
            )

        # 4. Create the Quote
        db_quote = Quote(
            request_id=request_id,
            provider_id=provider_id,
            **quote_data.model_dump()
        )
        
        try:
            db.add(db_quote)
            
            # Optional Workflow trigger: Move request status to 'quoted' if this is the first quote
            if service_request.status == RequestStatus.open:
                service_request.status = RequestStatus.quoted
                
            db.commit()
            db.refresh(db_quote)
            return db_quote
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to submit quote due to an internal error"
            )

    @staticmethod
    def get_quote_by_id(db: Session, quote_id: uuid.UUID) -> Quote:
        """
        Retrieve a single quote by its ID.
        """
        quote_obj = db.query(Quote).filter(Quote.id == quote_id).first()
        if not quote_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
        return quote_obj

    @staticmethod
    def get_quotes_for_request(db: Session, request_id: uuid.UUID, client_id: uuid.UUID) -> List[Quote]:
        """
        Retrieve all quotes submitted for a specific request.
        Business Rule: Only the client who owns the request should see all competing quotes.
        """
        # 1. Verify the request exists and belongs to the client requesting the data
        service_request = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
        if not service_request:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")
            
        if service_request.client_id != client_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="You do not have permission to view quotes for this request"
            )

        # 2. Return all quotes for this request
        return db.query(Quote).filter(Quote.request_id == request_id).all()

    @staticmethod
    def accept_quote(db: Session, quote_id: uuid.UUID, client_id: uuid.UUID) -> Quote:
        """
        Accept a specific quote.
        Business Workflow:
        1. Verifies the client actually owns the associated Service Request.
        2. Sets this quote to 'accepted'.
        3. Automatically bulk-rejects all competing quotes on the same request.
        4. Updates the request status to 'assigned'.
        5. Creates a Job from the accepted quote.
        """

        # 1. Fetch the quote and the associated request
        quote_obj = QuoteService.get_quote_by_id(db, quote_id)
        service_request = db.query(ServiceRequest).filter(
            ServiceRequest.id == quote_obj.request_id
        ).first()

        # 2. Authorization check
        if not service_request or service_request.client_id != client_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the owner of the request can accept a quote"
            )

        # 3. State machine validation
        if quote_obj.status == QuoteStatus.accepted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quote is already accepted"
            )

        if service_request.status == RequestStatus.assigned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This request has already been assigned to a provider"
            )

        try:
            # Accept the selected quote
            quote_obj.status = QuoteStatus.accepted

            # Reject all competing quotes
            db.query(Quote).filter(
                Quote.request_id == quote_obj.request_id,
                Quote.id != quote_obj.id
            ).update(
                {"status": QuoteStatus.rejected},
                synchronize_session=False
            )

            # Update request status
            service_request.status = RequestStatus.assigned

            # Save changes so the quote is officially accepted
            db.commit()

            # Create job from accepted quote
            JobService.create_job_from_quote(
                db=db,
                quote_id=quote_obj.id
            )

            db.refresh(quote_obj)
            return quote_obj

        except HTTPException:
            raise
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to accept quote"
            )
    @staticmethod
    def reject_quote(db: Session, quote_id: uuid.UUID, client_id: uuid.UUID) -> Quote:
        """
        Explicitly reject a specific quote.
        Business Workflow: Only the client who owns the request can explicitly reject quotes.
        """
        quote_obj = QuoteService.get_quote_by_id(db, quote_id)
        service_request = db.query(ServiceRequest).filter(ServiceRequest.id == quote_obj.request_id).first()

        if not service_request or service_request.client_id != client_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Only the owner of the request can reject a quote"
            )

        if quote_obj.status == QuoteStatus.accepted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Cannot reject a quote that has already been formally accepted"
            )

        try:
            quote_obj.status = QuoteStatus.rejected
            db.commit()
            db.refresh(quote_obj)
            return quote_obj
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to reject quote"
            )
