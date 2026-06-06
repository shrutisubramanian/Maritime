import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class Review(Base):
    """
    Model representing a review and rating left by a client for a provider after a job is completed.
    """
    __tablename__ = "reviews"

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    
    # Foreign Keys
    # Link to the completed job. unique=True enforces one review per job.
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # Link to the user who wrote the review (the Client)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Link to the user receiving the review (the Provider)
    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Back-references
    job: Mapped["Job"] = relationship(back_populates="review")
    
    # Since there are multiple foreign keys pointing to the User model, 
    # we explicitly define the foreign_keys here to avoid ambiguity.
    reviewer: Mapped["User"] = relationship(foreign_keys=[reviewer_id], back_populates="reviews_given")
    provider: Mapped["User"] = relationship(foreign_keys=[provider_id], back_populates="reviews_received")
    
    # Review Details
    rating: Mapped[int] = mapped_column(Integer, nullable=False, comment="Rating from 1 to 5")
    comment: Mapped[str | None] = mapped_column(String, nullable=True, comment="Optional written feedback")
    
    # Audit Timestamp
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Database Constraints
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="check_rating_range"),
    )

    def __repr__(self) -> str:
        """String representation for easier debugging."""
        return f"<Review(id={self.id}, job_id={self.job_id}, rating={self.rating})>"
