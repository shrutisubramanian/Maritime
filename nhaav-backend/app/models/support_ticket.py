import uuid
import enum
from datetime import datetime
from sqlalchemy import String, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class TicketCategory(str, enum.Enum):
    account = "account"
    verification = "verification"
    procurement = "procurement"
    quotation = "quotation"
    technical = "technical"
    payment = "payment"
    general = "general"

class TicketPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"

class TicketStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    waiting_for_user = "waiting_for_user"
    resolved = "resolved"
    closed = "closed"

class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    ticket_number: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    
    # Optional: the support popup is reachable from public pages, so a ticket
    # may be raised by a visitor who is not signed in (user_id = NULL). For
    # those, contact_name / contact_email are how support replies.
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    user: Mapped["User"] = relationship(foreign_keys="[SupportTicket.user_id]")

    contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    subject: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    
    category: Mapped[TicketCategory] = mapped_column(SQLEnum(TicketCategory), nullable=False)
    priority: Mapped[TicketPriority] = mapped_column(SQLEnum(TicketPriority), nullable=False, default=TicketPriority.low)
    status: Mapped[TicketStatus] = mapped_column(SQLEnum(TicketStatus), nullable=False, default=TicketStatus.open)
    
    assigned_admin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_admin: Mapped["User"] = relationship(foreign_keys=[assigned_admin_id])
    
    attachments: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(String, nullable=True)
    
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
