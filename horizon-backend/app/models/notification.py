import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NotificationType(str, enum.Enum):
    quote = "quote"
    quotation = "quotation"
    procurement = "procurement"
    job = "job"
    review = "review"
    verification = "verification"
    request = "request"
    system = "system"
    support = "support"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )

    title: Mapped[str] = mapped_column(String, nullable=False)

    message: Mapped[str] = mapped_column(String, nullable=False)

    type: Mapped[NotificationType] = mapped_column(
        SQLEnum(NotificationType),
        nullable=False
    )
    
    priority: Mapped[str] = mapped_column(String, default="normal")
    related_entity: Mapped[str | None] = mapped_column(String, nullable=True)
    related_entity_id: Mapped[uuid.UUID | None] = mapped_column(String, nullable=True)

    is_read: Mapped[bool] = mapped_column(
        Boolean,
        default=False
    )
    
    is_archived: Mapped[bool] = mapped_column(
        Boolean,
        default=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow
    )