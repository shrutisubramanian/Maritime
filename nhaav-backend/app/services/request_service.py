import uuid
import math
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app import services
from app.models.user import User, UserRole
from app.models.request import ServiceRequest, UrgencyLevel, RequestStatus, RequestType
from app.schemas.request import ServiceRequestCreate, ServiceRequestUpdate
from app.models.service_category import ServiceCategory
from app.models.profile import Profile
from app.services.notification_service import NotificationService
from app.services.matching_service import MatchingService
from app.models.notification import NotificationType

class ServiceRequestService:
    """
    Service class handling business logic for Service Requests.
    Encapsulates rules for creation, filtering, and authorization (ownership).
    """

    @staticmethod
    def create_request(
        db: Session, 
        user_id: uuid.UUID, 
        request_data: ServiceRequestCreate
    ) -> ServiceRequest:
        """
        Create a new service request.
        Business Rule: Only users with the 'client' role can create requests.
        """
        # 1. Verify user is a client
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
            
        if user.role != UserRole.client:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Only clients are authorized to create service requests"
            )

        # 2. Create the request ORM object
        db_request = ServiceRequest(
            client_id=user_id,
            **request_data.model_dump()
        )
        
        # 3. Save to database
        try:
            db.add(db_request)
            db.commit()
            db.refresh(db_request)
            
            # Notify the client that their request is live.
            NotificationService.create_notification(
                db=db,
                user_id=user_id,
                title="Request Created",
                message=f"Your {'procurement' if db_request.request_type == RequestType.supply else 'service'} request '{db_request.title}' is now live on the marketplace.",
                notification_type=NotificationType.request
            )

            # Fan out to matching providers (service) or suppliers (supply).
            client_profile = db.query(Profile).filter(Profile.user_id == user_id).first()
            client_name = (
                (client_profile.company_name if client_profile and client_profile.company_name else None)
                or user.full_name
                or user.email
            )
            recipients = MatchingService.get_eligible_recipients(db, db_request)
            for recipient_id in recipients:
                if recipient_id == user_id:
                    continue
                NotificationService.create_notification(
                    db=db,
                    user_id=recipient_id,
                    title="New Procurement Request",
                    message=(
                        f"{client_name} posted a new request: {db_request.service_type} "
                        f"at {db_request.port}. [View Request]"
                    ),
                    notification_type=NotificationType.procurement,
                    related_entity="service_request",
                    related_entity_id=db_request.id,
                    dedupe=True
                )

            db.commit()
            db.refresh(db_request)
            return db_request
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create service request due to an internal error"
            )

    @staticmethod
    def get_request_by_id(db: Session, request_id: uuid.UUID) -> ServiceRequest:
        """
        Retrieve a single service request by its ID.
        """
        request_obj = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
        if not request_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Service request not found"
            )
        return request_obj

    @staticmethod
    def get_all_requests(
        db: Session,
        page: int = 1,
        limit: int = 20,
        port: Optional[str] = None,
        service_type: Optional[str] = None,
        service_group: Optional[str] = None,
        urgency: Optional[UrgencyLevel] = None,
        status_req: Optional[RequestStatus] = None,
        client_id: Optional[uuid.UUID] = None,
        request_type: Optional[RequestType] = None,
        public_only: bool = False,
    ) -> Tuple[List[ServiceRequest], int, int, int]:
        """
        Search, filter, and paginate service requests.
        """
        query = db.query(ServiceRequest)

        # Anonymous browse is limited to OPEN requests. Awarded, completed,
        # rejected and cancelled requests are not public procurement material.
        if public_only:
            query = query.filter(ServiceRequest.status == RequestStatus.open)
        
        # Apply filters conditionally
        # Using ilike for case-insensitive string matching
        if port:
            query = query.filter(ServiceRequest.port.ilike(f"%{port}%"))
        
        if service_type:
            query = query.filter(ServiceRequest.service_type.ilike(f"%{service_type}%"))

        if service_group:

            services = db.query(ServiceCategory.name).filter(
        ServiceCategory.category_group == service_group
            ).all()

            service_names = [s.name for s in services]

            query = query.filter(
        ServiceRequest.service_type.in_(service_names)
    )    

            
        if urgency:
            query = query.filter(ServiceRequest.urgency == urgency)
            
        if status_req:
            query = query.filter(ServiceRequest.status == status_req)
            
        if client_id:
            query = query.filter(ServiceRequest.client_id == client_id)

        if request_type:
            query = query.filter(ServiceRequest.request_type == request_type)

        # Count total records for pagination
        total = query.count()
        pages = math.ceil(total / limit) if limit > 0 else 1
        
        # Apply pagination offset and limit
        offset = (page - 1) * limit
        requests = query.offset(offset).limit(limit).all()
        
        return requests, total, page, pages

    @staticmethod
    def update_request(
        db: Session, 
        request_id: uuid.UUID, 
        user_id: uuid.UUID, 
        update_data: ServiceRequestUpdate
    ) -> ServiceRequest:
        """
        Update a service request using partial data.
        Business Rule: Only the client who created the request can edit it.
        """
        # 1. Fetch the request (reuses our existing method to handle 404s cleanly)
        request_obj = ServiceRequestService.get_request_by_id(db, request_id)
        
        # 2. Check ownership - Strict authorization check
        if request_obj.client_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="You do not have permission to edit this request"
            )
            
        # 3. State-machine guard. Status is NOT a free-form field: a request is
        # awarded only by accepting a quotation (which creates the job), and an
        # awarded request can no longer be edited into another state. Without
        # this, a client could award themselves or cancel an awarded job and
        # leave the quote/job records inconsistent.
        update_dict = update_data.model_dump(exclude_unset=True)
        requested_status = update_dict.get("status")
        if requested_status is not None:
            requested_status = RequestStatus(requested_status)
            if requested_status in (RequestStatus.assigned, RequestStatus.awarded):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "A request is awarded by accepting a quotation, not by "
                        "editing its status"
                    ),
                )
            if request_obj.status in (RequestStatus.assigned, RequestStatus.awarded):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An awarded request can no longer be changed",
                )

        # 4. Apply updates dynamically (exclude_unset=True for partial updates)
        for key, value in update_dict.items():
            setattr(request_obj, key, value)
            
        # 5. Save changes
        try:
            db.commit()
            db.refresh(request_obj)
            return request_obj
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update service request"
            )

    @staticmethod
    def delete_request(
        db: Session, 
        request_id: uuid.UUID, 
        user_id: uuid.UUID
    ) -> None:
        """
        Delete a service request.
        Business Rule: Only the client who created the request can delete it.
        """
        # 1. Fetch the request
        request_obj = ServiceRequestService.get_request_by_id(db, request_id)
        
        # 2. Check ownership - Strict authorization check
        if request_obj.client_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="You do not have permission to delete this request"
            )
            
        # 3. Delete from database
        try:
            db.delete(request_obj)
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete service request"
            )
