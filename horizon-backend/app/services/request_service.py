import uuid
import math
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User, UserRole
from app.models.request import ServiceRequest, UrgencyLevel, RequestStatus
from app.schemas.request import ServiceRequestCreate, ServiceRequestUpdate

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
        urgency: Optional[UrgencyLevel] = None,
        status_req: Optional[RequestStatus] = None,
        client_id: Optional[uuid.UUID] = None
    ) -> Tuple[List[ServiceRequest], int, int, int]:
        """
        Search, filter, and paginate service requests.
        """
        query = db.query(ServiceRequest)
        
        # Apply filters conditionally
        # Using ilike for case-insensitive string matching
        if port:
            query = query.filter(ServiceRequest.port.ilike(f"%{port}%"))
        
        if service_type:
            query = query.filter(ServiceRequest.service_type.ilike(f"%{service_type}%"))
            
        if urgency:
            query = query.filter(ServiceRequest.urgency == urgency)
            
        if status_req:
            query = query.filter(ServiceRequest.status == status_req)
            
        if client_id:
            query = query.filter(ServiceRequest.client_id == client_id)

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
            
        # 3. Apply updates dynamically (exclude_unset=True for partial updates)
        update_dict = update_data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(request_obj, key, value)
            
        # 4. Save changes
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
