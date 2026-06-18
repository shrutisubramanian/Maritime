import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Review(Base):
    __tablename__ = "reviews"

    

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4
    )

    job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"),
        unique=True,
        nullable=False
    )

    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )

    reviewed_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )

    rating: Mapped[int] = mapped_column(nullable=False)

    comment: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow
    )


    job: Mapped["Job"] = relationship(
        back_populates="review"
    )

    reviewer: Mapped["User"] = relationship(
        foreign_keys=[reviewer_id],
        back_populates="reviews_given"
    )

    reviewed_user: Mapped["User"] = relationship(
        foreign_keys=[reviewed_user_id],
        back_populates="reviews_received"
    )