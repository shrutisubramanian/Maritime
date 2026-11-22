import uuid
import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class JobStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"

class JobStage(str, enum.Enum):
    accepted = "Accepted"
    scheduled = "Scheduled"
    engineer_assigned = "Engineer Assigned"
    in_progress = "In Progress"
    waiting_approval = "Waiting Approval"
    completed = "Completed"
    cancelled = "Cancelled"

class Job(Base):
    """
    Model representing an accepted and active service request.
    Connects the client's request, the provider, and the accepted quote into a single execution entity.
    """
    __tablename__ = "jobs"

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    
    # Foreign Keys
    # Link to the original service request. unique=True makes this a one-to-one relationship.
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_requests.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # Link to the assigned provider (who is a User).
    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Link to the accepted quote. unique=True makes this a one-to-one relationship.
    quote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quotes.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # Back-references
    request: Mapped["ServiceRequest"] = relationship(back_populates="job")
    provider: Mapped["User"] = relationship(back_populates="jobs")
    quote: Mapped["Quote"] = relationship(back_populates="job")
    
    # One-to-One relationship to Review
    review: Mapped["Review"] = relationship(back_populates="job", uselist=False, cascade="all, delete-orphan")
    
    # Status & Progress
    status: Mapped[JobStatus] = mapped_column(SQLEnum(JobStatus), nullable=False, default=JobStatus.active)
    current_stage: Mapped[JobStage] = mapped_column(SQLEnum(JobStage), nullable=False, default=JobStage.accepted)
    completion_percentage: Mapped[int] = mapped_column(Integer, default=0)
    progress: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    
    # Execution Timestamps
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="When the job officially commenced")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="When the job was marked completed")
    
    # Audit Timestamp
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    def __repr__(self) -> str:
        """String representation for easier debugging."""
        return f"<Job(id={self.id}, request_id={self.request_id}, provider_id={self.provider_id}, status={self.status}, stage={self.current_stage})>"
