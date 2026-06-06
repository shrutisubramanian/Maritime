import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.models.job import JobStatus

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
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    # Instructs Pydantic to extract data directly from SQLAlchemy ORM objects
    model_config = ConfigDict(from_attributes=True)
