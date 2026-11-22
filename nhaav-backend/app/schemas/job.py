import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.models.job import JobStatus, JobStage
from app.schemas.quote import QuoteResponse

class RequestSnippet(BaseModel):
    title: str
    service_type: str
    vessel_name: Optional[str] = None
    port: Optional[str] = None
    client: Optional['UserSnippet'] = None
    model_config = ConfigDict(from_attributes=True)

class UserSnippet(BaseModel):
    company_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class JobResponse(BaseModel):
    """
    Schema for formatting Job data in API responses.
    Includes timestamps and the current status of the job execution.
    """
    id: uuid.UUID
    request_id: uuid.UUID
    provider_id: uuid.UUID
    quote_id: uuid.UUID
    status: JobStatus
    current_stage: JobStage
    completion_percentage: int = 0
    progress: Optional[list[dict]] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    
    request: Optional[RequestSnippet] = None
    provider: Optional[UserSnippet] = None

    # Instructs Pydantic to extract data directly from SQLAlchemy ORM objects
    model_config = ConfigDict(from_attributes=True)

class ReviewSnippet(BaseModel):
    rating: int
    comment: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class JobDetailResponse(JobResponse):
    quote: Optional[QuoteResponse] = None
    review: Optional[ReviewSnippet] = None
    
    model_config = ConfigDict(from_attributes=True)
