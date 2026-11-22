import uuid
from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field
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

class SupportTicketContactRequest(BaseModel):
    """Public submission from the in-app support popup.

    Deliberately unauthenticated: the popup is reachable from public pages, so
    name/email are optional and the message is the only required field.
    """
    name: Optional[str] = Field(default=None, max_length=120)
    email: Optional[EmailStr] = None
    subject: Optional[str] = Field(default=None, max_length=200)
    message: str = Field(..., min_length=10, max_length=5000)
    category: TicketCategory = TicketCategory.general


class ContactEnquiryRequest(BaseModel):
    """Public website contact form (Services page).

    Unauthenticated like the support popup: the submitter types their own
    details, so the notification marks the reply address as unverified.
    """
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    company: Optional[str] = Field(default=None, max_length=160)
    phone: Optional[str] = Field(default=None, max_length=40)
    inquiry_type: Literal["buyer", "supplier", "other"] = "other"
    subject: Optional[str] = Field(default=None, max_length=200)
    message: str = Field(..., min_length=10, max_length=5000)


class SupportTicketContactResponse(BaseModel):
    ticket_number: str
    message: str


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
