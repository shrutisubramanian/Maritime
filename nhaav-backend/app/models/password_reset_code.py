"""Emailed one-time password-reset codes.

The reset CODE flow (enter your email, receive a code, then choose a new
password) needs a short-lived secret that the server can recognise without ever
storing it in the clear:

  * only the SHA-256 of ``user_id:code`` is stored — a database dump does not
    hand anyone a working code;
  * a code expires after ``RESET_CODE_TTL_MINUTES`` and is single use
    (``consumed_at``);
  * ``attempts`` bounds guessing: a 6-digit code is only 10^6 wide, so the
    guess budget — not the code space — is what makes it safe;
  * issuing a new code invalidates the previous one for that account, so an
    older email cannot be replayed.

Redeeming a code also resets ``users.password_reset_at``, which is what ends
existing sessions and refuses older reset links.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.types import Uuid

from app.database import Base


class PasswordResetCode(Base):
    __tablename__ = "password_reset_codes"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # sha256("user_id:code") — the code itself is never persisted.
    code_hash = Column(String(64), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    # Wrong guesses so far; a row at MAX_ATTEMPTS can no longer be redeemed.
    attempts = Column(Integer, nullable=False, default=0)
    # Set when the code is spent, replaced by a newer one, or out of attempts.
    consumed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
