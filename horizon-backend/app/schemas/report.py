import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from app.models.report import ReportType, ReportReason, ReportStatus

class ReportBase(BaseModel):
    reported_user_id: uuid.UUID
    service_id: Optional[uuid.UUID] = None
    request_id: Optional[uuid.UUID] = None
    job_id: Optional[uuid.UUID] = None
    review_id: Optional[uuid.UUID] = None
    report_type: ReportType
    reason: ReportReason
    description: Optional[str] = None
    evidence: Optional[List[str]] = None

class ReportCreate(ReportBase):
    pass

class ReportUpdate(BaseModel):
    status: Optional[ReportStatus] = None
    assigned_admin_id: Optional[uuid.UUID] = None
    admin_notes: Optional[str] = None

class ReportResponse(ReportBase):
    id: uuid.UUID
    reporter_id: uuid.UUID
    status: ReportStatus
    assigned_admin_id: Optional[uuid.UUID] = None
    admin_notes: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
