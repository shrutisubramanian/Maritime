"""Server-side record of an issued refresh token.

A refresh JWT is otherwise bearer-until-expiry: whoever holds it can exchange it
for fresh credentials for its whole lifetime, and nothing on the server can take
it back. Each issued refresh token therefore gets a row here, keyed by its `jti`:

  * `GET /auth/refresh` consumes the row (sets `revoked_at`, links
    `replaced_by_jti`) — a second use of the SAME token is a replay, and replay
    revokes every session the account has.
  * `POST /auth/logout` and a password reset revoke all of the account's rows,
    so a stolen token stops working the moment the owner acts.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.types import Uuid

from app.database import Base


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The JWT `jti` this row tracks. Unique: one row per issued token.
    jti = Column(String(64), nullable=False, unique=True, index=True)
    issued_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    # Set when the token is spent (rotated), logged out, or revoked by a reset.
    revoked_at = Column(DateTime, nullable=True)
    # The `jti` that replaced this one, when it was rotated normally.
    replaced_by_jti = Column(String(64), nullable=True)
    # Why it was revoked: "rotated" | "logout" | "password_reset" | "replay".
    revoked_reason = Column(String(32), nullable=True)
