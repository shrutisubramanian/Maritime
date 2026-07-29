import uuid
import enum
from datetime import datetime
from sqlalchemy import String, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class ReportType(str, enum.Enum):
    user = "user"
    service = "service"
    review = "review"
    procurement = "procurement"
    quotation = "quotation"

class ReportReason(str, enum.Enum):
    spam = "spam"
    fake_company = "fake_company"
    fake_documents = "fake_documents"
    fraud = "fraud"
    abusive_behavior = "abusive_behavior"
    misleading_listing = "misleading_listing"
    copyright = "copyright"
    other = "other"

class ReportStatus(str, enum.Enum):
    pending = "pending"
    under_review = "under_review"
    resolved = "resolved"
    dismissed = "dismissed"

class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    
    reporter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reporter: Mapped["User"] = relationship(foreign_keys=[reporter_id])
    
    reported_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reported_user: Mapped["User"] = relationship(foreign_keys=[reported_user_id])
    
    service_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("services.id", ondelete="SET NULL"), nullable=True)
    request_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("service_requests.id", ondelete="SET NULL"), nullable=True)
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True)
    review_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("reviews.id", ondelete="SET NULL"), nullable=True)
    
    report_type: Mapped[ReportType] = mapped_column(SQLEnum(ReportType), nullable=False)
    reason: Mapped[ReportReason] = mapped_column(SQLEnum(ReportReason), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    evidence: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[ReportStatus] = mapped_column(SQLEnum(ReportStatus), nullable=False, default=ReportStatus.pending)
    
    assigned_admin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_admin: Mapped["User"] = relationship(foreign_keys=[assigned_admin_id])
    
    admin_notes: Mapped[str | None] = mapped_column(String, nullable=True)
    
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
