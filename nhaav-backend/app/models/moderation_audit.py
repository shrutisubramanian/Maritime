import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ModerationAuditLog(Base):
    """
    Append-only record of every marketplace moderation decision.

    Written whenever an admin approves/rejects a service or supply listing so
    the decision (who, what, why) is auditable.
    """
    __tablename__ = "moderation_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    entity_type: Mapped[str] = mapped_column(String, nullable=False, index=True, comment="service | supply")
    entity_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    admin_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String, nullable=False, comment="approved | rejected")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    def __repr__(self) -> str:
        return (
            f"<ModerationAuditLog(entity_type={self.entity_type}, entity_id={self.entity_id}, "
            f"action={self.action}, admin_id={self.admin_id})>"
        )
