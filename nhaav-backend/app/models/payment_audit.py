"""
Append-only audit trail for the payment workflow.

Mirrors the marketplace's `ModerationAuditLog` convention: every decision is
recorded with who did it, what they did and why, so an approval or rejection can
always be explained after the fact. Submission is recorded too, giving a
complete chain from submission to admin decision.
"""
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PaymentAuditLog(Base):
    __tablename__ = "payment_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    payment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_role: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="admin | organization"
    )
    action: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="submitted | approved | rejected | cancelled"
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    def __repr__(self) -> str:
        return (
            f"<PaymentAuditLog(payment_id={self.payment_id}, actor_role={self.actor_role}, "
            f"action={self.action})>"
        )
