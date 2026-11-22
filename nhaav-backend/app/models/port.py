"""
The port catalogue a company's HEAD OFFICE is chosen from.

Why this is database state and not a constant: a vendor whose head office is a
port nobody has listed yet must still be able to join. During verification an
administrator adds that port here, and it instantly becomes selectable by every
vendor of that kind — no deploy needed.

Head office is what places a company in the marketplace port filter. The other
ports a company works in (`Profile.ports_served`) are profile information only:
they describe reach, they do not create extra discovery entries.

Names are the canonical short form ("Kandla", "JNPT", "Tuticorin") because that
is what vendors and buyers type. `aliases` keeps the fuller forms that arrive
from data sources and old records resolvable to the same row.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Port(Base):
    __tablename__ = "ports"
    __table_args__ = (
        # Case-insensitive uniqueness is enforced in the service layer; this is
        # the last line of defence for exact duplicate names.
        UniqueConstraint("name", name="ux_ports_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # "Major", "Intermediate" or "Commercial" — display grouping only.
    kind: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Alternative names that resolve to this port (e.g. "Nhava Sheva" -> JNPT).
    aliases: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    # Admins retire a port instead of deleting it: existing companies keep a
    # valid head office, new vendors can no longer select it.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<Port({self.name}, {self.state})>"
