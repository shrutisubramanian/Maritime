from app.services.job_service import JobService
from app.services.notification_service import NotificationService
from app.models.notification import NotificationType
import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User, UserRole
from app.models.request import ServiceRequest, RequestStatus, RequestType
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
        Submit a new quote for an open request.
        Business Rule: providers quote SERVICE requests; suppliers quote SUPPLY requests.
        """
        # 1. Verify responder is a provider or a supplier
        user = db.query(User).filter(User.id == provider_id).first()
        if not user or user.role not in (UserRole.provider, UserRole.supplier):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Only providers or suppliers can submit quotes"
            )

        # 2. Verify the request actually exists and is open
        service_request = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
        if not service_request:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")

        # 2b. The request type dictates which kind of responder may quote.
        allowed_role = (
            UserRole.supplier
            if service_request.request_type == RequestType.supply
            else UserRole.provider
        )
        if user.role != allowed_role:
            kind = "supply" if service_request.request_type == RequestType.supply else "service"
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only {'suppliers' if kind == 'supply' else 'service providers'} can quote {kind} requests"
            )

        # A request stays quotable while it is `open` OR already `quoted` — the
        # first quote flips the status to `quoted`, but competing providers /
        # suppliers must still be able to respond until one is awarded.
        if service_request.status not in (RequestStatus.open, RequestStatus.quoted):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Cannot submit a quote to a request that is not open"
            )

        # 3. Prevent multiple quotes from the same provider on the same request.
        # This lookup is only the fast path; the uq_quotes_provider_request
        # constraint is what actually wins a two-thread race, and the
        # IntegrityError below is converted into the same 400.
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
            
            # Notify Client. The session runs with autoflush=False, so a
            # notification added after the commit above would be left pending
            # and discarded when the request's session closed — commit it.
            NotificationService.create_notification(
                db=db,
                user_id=service_request.client_id,
                title="New Quote Received",
                message=f"You have received a new quote of {quote_data.currency} {quote_data.amount} for your request '{service_request.title}'.",
                notification_type=NotificationType.quote
            )
            db.commit()
            
            return db_quote
        except IntegrityError:
            # A concurrent submission by the same provider won the unique
            # constraint. Same answer as the sequential check above.
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You have already submitted a quote for this request"
            )
        except HTTPException:
            raise
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
    def update_quote(
        db: Session,
        quote_id: uuid.UUID,
        provider_id: uuid.UUID,
        update_data: QuoteUpdate
    ) -> Quote:
        """
        Update an existing quote.
        Business Rule: Only the provider who created the quote can update it.
        Can only update if the quote is in 'draft' or 'submitted' status.
        """
        quote_obj = QuoteService.get_quote_by_id(db, quote_id)

        if quote_obj.provider_id != provider_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to update this quote"
            )

        if quote_obj.status not in [QuoteStatus.draft, QuoteStatus.submitted]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only draft or submitted quotes can be updated"
            )

        update_dict = update_data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(quote_obj, key, value)

        try:
            db.commit()
            db.refresh(quote_obj)
            return quote_obj
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update quote"
            )

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
    def get_quotes_for_provider(db: Session, provider_id: uuid.UUID) -> List[Quote]:
        """
        Retrieve all quotes submitted by a specific provider.
        """
        return db.query(Quote).filter(Quote.provider_id == provider_id).all()

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

        if service_request.status in [RequestStatus.assigned, RequestStatus.awarded]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This request has already been assigned to a provider"
            )

        try:
            # Atomic award. The status read above is only a fast pre-check: two
            # concurrent acceptances can both pass it, so the flip to `awarded`
            # is a single conditional UPDATE and exactly one caller may win it.
            # The loser gets a 409 instead of silently double-awarding.
            awarded = (
                db.query(ServiceRequest)
                .filter(
                    ServiceRequest.id == service_request.id,
                    ServiceRequest.status.notin_(
                        [
                            RequestStatus.assigned,
                            RequestStatus.awarded,
                            RequestStatus.cancelled,
                            RequestStatus.completed,
                        ]
                    ),
                )
                .update(
                    {
                        ServiceRequest.status: RequestStatus.awarded,
                        ServiceRequest.selected_quotation_id: quote_obj.id,
                    },
                    synchronize_session=False,
                )
            )
            if awarded != 1:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This request has already been awarded to another quotation",
                )

            # Accept the selected quote
            quote_obj.status = QuoteStatus.accepted

            # Reject all competing quotes and get their provider IDs to notify
            competing_quotes = db.query(Quote).filter(
                Quote.request_id == quote_obj.request_id,
                Quote.id != quote_obj.id
            ).all()
            
            for cq in competing_quotes:
                cq.status = QuoteStatus.rejected
                NotificationService.create_notification(
                    db=db,
                    user_id=cq.provider_id,
                    title="Quote Rejected",
                    message=f"Your quote for request '{service_request.title}' has been rejected.",
                    notification_type=NotificationType.quote
                )

            # The conditional UPDATE above already awarded the request; refresh
            # the instance so the response reflects the committed row.
            db.refresh(service_request)
            
            # Notify the accepted provider
            NotificationService.create_notification(
                db=db,
                user_id=quote_obj.provider_id,
                title="Quote Accepted!",
                message=f"Congratulations! Your quote for request '{service_request.title}' has been accepted.",
                notification_type=NotificationType.quote
            )

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
    # ------------------------------------------------ two-sided acceptance
    @staticmethod
    def contact_revealed(quote: Quote) -> bool:
        """True only once BOTH sides have accepted the job.

        The client's side is ``status == accepted`` (they awarded the quote);
        the provider's side is ``provider_accepted_at``. Before that the offer is
        anonymous: job title and price, nothing identifying.
        """
        return (
            quote.status == QuoteStatus.accepted
            and quote.provider_accepted_at is not None
        )

    @staticmethod
    def client_visible_quote(quote: Quote, label: Optional[str] = None) -> dict:
        """Serialize a quote for the CLIENT without leaking who the bidder is.

        While the two sides have not both accepted, ``provider`` / ``provider_id``
        are None and the row carries a neutral label, so the client can still
        compare offers (title + price) without being able to contact — or even
        identify — a provider who has not committed.
        """
        from app.schemas.quote import QuoteResponse

        provider = quote.provider
        profile = getattr(provider, "profile", None) if provider else None
        revealed = QuoteService.contact_revealed(quote)

        data = QuoteResponse.model_validate(quote).model_dump()
        data["contact_revealed"] = revealed
        data["provider_label"] = label or "Offer"

        if not revealed or provider is None:
            data["provider_id"] = None
            data["provider"] = None
            data["provider_contact"] = None
            return data

        contact_name = (
            getattr(profile, "company_name", None)
            or getattr(provider, "full_name", None)
            or None
        )
        data["provider"] = {
            "company_name": contact_name,
            "logo": getattr(profile, "logo_url", None) if profile else None,
            "average_rating": getattr(profile, "rating", None) if profile else None,
            "completed_jobs": getattr(profile, "completed_jobs", 0) if profile else 0,
            "verification_status": getattr(profile, "verification_status", None)
            if profile
            else None,
        }
        data["provider_contact"] = {
            "name": contact_name,
            "phone": getattr(provider, "phone", None),
            "company_name": getattr(profile, "company_name", None) if profile else None,
        }
        return data

    @staticmethod
    def provider_accept(db: Session, quote_id: uuid.UUID, provider_id: uuid.UUID) -> Quote:
        """The provider confirms it can take the job the client awarded it.

        Only valid on a quote the client has already accepted. On success the
        client is notified and the offer stops being anonymous. Idempotent: a
        provider clicking again does not spam a second notification.
        """
        quote_obj = QuoteService.get_quote_by_id(db, quote_id)
        if quote_obj.provider_id != provider_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the provider who submitted this quote can accept the job",
            )

        if quote_obj.status == QuoteStatus.rejected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The client awarded this job to another provider",
            )
        if quote_obj.status != QuoteStatus.accepted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The client has not accepted this quotation yet",
            )

        if quote_obj.provider_accepted_at is None:
            service_request = (
                db.query(ServiceRequest)
                .filter(ServiceRequest.id == quote_obj.request_id)
                .first()
            )
            quote_obj.provider_accepted_at = datetime.utcnow()

            if service_request is not None:
                provider = quote_obj.provider
                profile = getattr(provider, "profile", None) if provider else None
                who = (
                    getattr(profile, "company_name", None)
                    or getattr(provider, "full_name", None)
                    or "The provider"
                )
                NotificationService.create_notification(
                    db=db,
                    user_id=service_request.client_id,
                    title="Provider accepted your job",
                    message=(
                        f"{who} is ready to proceed with '{service_request.title}'. "
                        "Their name and contact number are now available on the request."
                    ),
                    notification_type=NotificationType.job,
                    related_entity="quote",
                    related_entity_id=quote_obj.id,
                    dedupe=True,
                )

            try:
                db.commit()
                db.refresh(quote_obj)
            except Exception:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to record the provider's acceptance",
                )

        return quote_obj

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
            
            # Notify the rejected provider
            NotificationService.create_notification(
                db=db,
                user_id=quote_obj.provider_id,
                title="Quote Rejected",
                message=f"Your quote for request '{service_request.title}' has been rejected.",
                notification_type=NotificationType.quote
            )
            # autoflush=False: without this commit the notification stays
            # pending and is discarded when the session closes.
            db.commit()
            
            db.refresh(quote_obj)
            return quote_obj
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to reject quote"
            )
