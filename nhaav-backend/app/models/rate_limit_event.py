import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


def _hash_user_id(value) -> str:
    import hashlib
    return hashlib.sha256(str(value).strip().lower().encode("utf-8")).hexdigest()


class _UserIdQueryAlias:
    """
    Descriptor for the historical `user_id` name.

    Class access (`RateLimitEvent.user_id == uid`) returns a facade whose
    __eq__ builds the hashed identity comparison; instance access returns the
    hashed value of the stored identity_hash — but since the raw user id is
    unrecoverable from the hash, instance access raises a clear error instead
    of pretending.
    """
    def __get__(self, obj, objtype=None):
        if obj is None:
            return _UserIdQueryFacade()
        raise AttributeError(
            "user_id is write/compare-only: raw ids are never stored (hashed)."
        )


class _UserIdQueryFacade:
    def __eq__(self, other):
        return RateLimitEvent.identity_hash == _hash_user_id(other)

    def __hash__(self):
        return hash("user_id_query_alias")


class RateLimitEvent(Base):
    """
    One counted request for database-backed rate limiting (M-3).

    Privacy (per directive): identity keys are stored HASHED (sha256) — never
    raw emails or IPs. `category` selects the counter bucket. Counters are
    rows within a sliding window; the limiter counts rows newer than the
    window start. Multi-instance safe: every instance reads/writes one table.

    H10-contract compatibility: construction with the historical
    `RateLimitEvent(user_id=...)` hashes into identity_hash, and queries like
    `RateLimitEvent.user_id == uid` compare against the hashed identity.
    """
    __tablename__ = "rate_limit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # sha256 hex of the identity (user id string, email, or client IP)
    identity_hash = Column(String(64), nullable=False, index=True)
    category = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_rate_limit_events_identity_category_created",
              "identity_hash", "category", "created_at"),
    )

    user_id = _UserIdQueryAlias()

    def __init__(self, **kwargs):
        user_id = kwargs.pop("user_id", None)
        if user_id is not None and "identity_hash" not in kwargs:
            kwargs["identity_hash"] = _hash_user_id(user_id)
        super().__init__(**kwargs)
