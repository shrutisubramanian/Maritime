import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.user import User
from app.models.job import JobStatus
from app.schemas.job import JobResponse, JobDetailResponse
from app.services.job_service import JobService
from app.services.onboarding_service import require_marketplace_access

router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"]
)

# ----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@router.get("/", response_model=List[JobResponse], summary="Get all jobs you are involved in")
def get_my_jobs(
    status: Optional[JobStatus] = Query(None, description="Filter jobs by status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Retrieve a list of all jobs where you are either the Client or the Provider.
    
    **Authorization Flow**:
    - `get_current_user` extracts the JWT token to authenticate the user.
    - Uses the database relationships to strictly filter jobs by the logged-in user.
    """
    return JobService.get_all_jobs_for_user(db=db, user_id=current_user.id, status=status)


@router.get("/{job_id}", response_model=JobDetailResponse, summary="Get details of a specific job")
def get_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Retrieve the private details of a specific job execution.
    
    **Authorization Flow**:
    - Job details are strictly confidential.
    - `JobService.get_job_by_id` forcefully verifies that `current_user.id` is either the 
      `provider_id` on the Job or the `client_id` on the parent ServiceRequest.
    """
    return JobService.get_job_by_id(db=db, job_id=job_id, user_id=current_user.id)


@router.put("/{job_id}/complete", response_model=JobResponse, summary="Mark a job as completed")
def complete_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Mark an active job as formally completed.
    
    **Workflow**:
    - Only the involved provider or client can trigger this.
    - Transitions the Job to `JobStatus.completed`.
    - Automatically updates the parent ServiceRequest to `RequestStatus.completed`.
    - Unlocks the ability to leave a Review for this job.
    """
    return JobService.complete_job(db=db, job_id=job_id, user_id=current_user.id)


@router.put("/{job_id}/cancel", response_model=JobResponse, summary="Cancel an active job")
def cancel_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _gate: User = Depends(require_marketplace_access),
):
    """
    Cancel an active job in an emergency.
    
    **Workflow**:
    - Only the involved provider or client can trigger this.
    - Transitions the Job to `JobStatus.cancelled`.
    - Automatically updates the parent ServiceRequest to `RequestStatus.cancelled`.
    """
    return JobService.cancel_job(db=db, job_id=job_id, user_id=current_user.id)
