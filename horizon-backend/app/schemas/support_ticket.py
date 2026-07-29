import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from app.models.support_ticket import TicketCategory, TicketPriority, TicketStatus

class SupportTicketBase(BaseModel):
    subject: str
    description: str
    category: TicketCategory
    priority: Optional[TicketPriority] = TicketPriority.low
    attachments: Optional[List[str]] = None

class SupportTicketCreate(SupportTicketBase):
    pass

class SupportTicketUpdate(BaseModel):
    status: Optional[TicketStatus] = None
    assigned_admin_id: Optional[uuid.UUID] = None
    resolution_notes: Optional[str] = None

class SupportTicketResponse(SupportTicketBase):
    id: uuid.UUID
    ticket_number: str
    user_id: uuid.UUID
    status: TicketStatus
    assigned_admin_id: Optional[uuid.UUID] = None
    resolution_notes: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
