import uuid
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.job import Job, JobStatus
from app.models.quote import Quote, QuoteStatus
from app.models.request import ServiceRequest, RequestStatus
from app.services.notification_service import NotificationService
from app.models.notification import NotificationType


class JobService:
    """
    Service class handling business logic for the execution phase (Jobs).
    A Job bridges the gap between an accepted Quote and the actual service delivery.
    """

    @staticmethod
    def create_job_from_quote(db: Session, quote_id: uuid.UUID) -> Job:
        """
        Automatically spawns a new Job when a quote is formally accepted.
        Business Rule: One accepted quote = exactly one active job.
        """
        # 1. Verify quote exists and is currently marked as accepted
        quote = db.query(Quote).filter(Quote.id == quote_id).first()
        if not quote or quote.status != QuoteStatus.accepted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="A job can only be created from an accepted quote"
            )
            
        # 2. Enforce the 1:1 rule: ensure no job already exists for this quote
        existing_job = db.query(Job).filter(Job.quote_id == quote_id).first()
        if existing_job:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="A job has already been spawned for this quote"
            )

        # 3. Create the Job linked to the original request and the provider
        db_job = Job(
            request_id=quote.request_id,
            provider_id=quote.provider_id,
            quote_id=quote.id,
            status=JobStatus.active,
            started_at=datetime.now(timezone.utc)
        )
        
        try:
            db.add(db_job)
            db.commit()
            db.refresh(db_job)
            return db_job
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create job from quote due to an internal database error"
            )

    @staticmethod
    def get_job_by_id(db: Session, job_id: uuid.UUID, user_id: uuid.UUID) -> Job:
        """
        Retrieve a job by its ID.
        Business Rule: Only the involved client (who owns the request) or the 
        involved provider (who submitted the quote) can view this job's details.
        """
        job_obj = db.query(Job).filter(Job.id == job_id).first()
        if not job_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
            
        # Security: Fetch the original request to check client ownership
        service_request = db.query(ServiceRequest).filter(ServiceRequest.id == job_obj.request_id).first()
        
        # Check authorization: user_id must be either the provider or the client
        if user_id != job_obj.provider_id and (not service_request or user_id != service_request.client_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="You do not have permission to view this job's private details"
            )
            
        return job_obj

    @staticmethod
    def get_all_jobs_for_user(db: Session, user_id: uuid.UUID, status: Optional[JobStatus] = None) -> list[Job]:
        """
        Retrieve all jobs associated with a specific user (either as the provider or the client).
        Optionally filter by job status.
        """
        query = db.query(Job).join(ServiceRequest, Job.request_id == ServiceRequest.id).filter(
            (Job.provider_id == user_id) | (ServiceRequest.client_id == user_id)
        )
        
        if status:
            query = query.filter(Job.status == status)
            
        return query.all()

    @staticmethod
    def complete_job(db: Session, job_id: uuid.UUID, user_id: uuid.UUID) -> Job:
        """
        Marks a job as fully completed.
        Business Workflow: 
        1. Transitions Job status to 'completed'.
        2. Sets 'completed_at' timestamp.
        3. Updates the parent ServiceRequest status to 'completed'.
        4. Job instantly becomes 'reviewable' via the ReviewService.
        """
        # Re-use our secure getter which inherently checks permissions!
        job_obj = JobService.get_job_by_id(db, job_id, user_id)
        
        if job_obj.status == JobStatus.completed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Job is already completed")
            
        if job_obj.status == JobStatus.cancelled:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot complete a cancelled job")

        try:
            # 1. Mark job as completed
            job_obj.status = JobStatus.completed
            job_obj.completed_at = datetime.now(timezone.utc)
            
            # 2. Keep the parent ServiceRequest in perfect sync
            service_request = db.query(ServiceRequest).filter(ServiceRequest.id == job_obj.request_id).first()
            if service_request:
                service_request.status = RequestStatus.completed
                
            db.commit()
            db.refresh(job_obj)
            
            # Notify the other party. The session runs with autoflush=False, so
            # the notification must be committed or it is silently discarded
            # when the request's session closes.
            notify_user_id = service_request.client_id if user_id == job_obj.provider_id else job_obj.provider_id
            NotificationService.create_notification(
                db=db,
                user_id=notify_user_id,
                title="Job Completed",
                message=f"The job for '{service_request.title}' has been marked as completed. You can now leave a review.",
                notification_type=NotificationType.job
            )
            db.commit()
            
            return job_obj
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to mark job as completed"
            )

    @staticmethod
    def cancel_job(db: Session, job_id: uuid.UUID, user_id: uuid.UUID) -> Job:
        """
        Cancels an active job.
        Can be triggered by either the provider or the client.
        """
        # Permission is validated inherently
        job_obj = JobService.get_job_by_id(db, job_id, user_id)
        
        if job_obj.status == JobStatus.completed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel a job that is already completed")

        try:
            job_obj.status = JobStatus.cancelled
            
            # Sync parent request
            service_request = db.query(ServiceRequest).filter(ServiceRequest.id == job_obj.request_id).first()
            if service_request:
                service_request.status = RequestStatus.cancelled
                
            db.commit()
            db.refresh(job_obj)

            # Tell the other party the job is off (the canceller already knows).
            # Committed explicitly: the session has autoflush=False, so a staged
            # notification would otherwise never reach the database.
            if service_request is not None:
                notify_user_id = (
                    service_request.client_id
                    if user_id == job_obj.provider_id
                    else job_obj.provider_id
                )
                NotificationService.create_notification(
                    db=db,
                    user_id=notify_user_id,
                    title="Job Cancelled",
                    message=f"The job for '{service_request.title}' has been cancelled.",
                    notification_type=NotificationType.job
                )
                db.commit()

            return job_obj
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to cancel job"
            )
