"""Issue and redeem emailed password-reset codes.

The flow the UI drives:
``POST /auth/forgot-password/code`` mails a random 6-digit code, then
``POST /auth/reset-password/code`` accepts ``email + code + new_password``.

Design notes
------------
* The code is generated with :mod:`secrets` (never :mod:`random`).
* Only ``sha256("<user_id>:<code>")`` is stored, so the database never holds a
  usable code. The user id is part of the hash input so the same six digits on
  two accounts do not share a hash.
* A code lives for ``CODE_TTL_MINUTES`` and can be tried ``MAX_ATTEMPTS`` times;
  after that it is burnt and a new one must be requested. This is what makes a
  6-digit secret safe — the guess budget, not the code space.
* Issuing a code invalidates every earlier unconsumed code for that account, so
  a stale email cannot be replayed.
* Nothing here reveals whether an address exists: the router answers the same
  way for an unknown mailbox, and verification fails identically for a wrong
  code and a missing account.
"""
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models.password_reset_code import PasswordResetCode
from app.models.user import User

logger = logging.getLogger(__name__)


class PasswordResetCodeService:
    CODE_LENGTH = 6
    CODE_TTL_MINUTES = 10
    MAX_ATTEMPTS = 5

    @staticmethod
    def _hash(user_id, code: str) -> str:
        return hashlib.sha256(f"{user_id}:{code}".encode("utf-8")).hexdigest()

    @staticmethod
    def _generate_code() -> str:
        return "".join(secrets.choice("0123456789") for _ in range(PasswordResetCodeService.CODE_LENGTH))

    @classmethod
    def issue(cls, db: Session, user: User) -> str:
        """Mint a fresh code for ``user`` and return it in the clear.

        The plaintext is returned exactly once, to be handed to the email
        composer; it is never logged and never stored.
        """
        now = datetime.utcnow()
        # Any earlier code stops working the moment a new one is requested.
        db.query(PasswordResetCode).filter(
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.consumed_at.is_(None),
        ).update({PasswordResetCode.consumed_at: now}, synchronize_session=False)

        code = cls._generate_code()
        db.add(
            PasswordResetCode(
                user_id=user.id,
                code_hash=cls._hash(user.id, code),
                expires_at=now + timedelta(minutes=cls.CODE_TTL_MINUTES),
                attempts=0,
                created_at=now,
            )
        )
        db.commit()
        return code

    @classmethod
    def _latest_live_code(cls, db: Session, user_id) -> Optional[PasswordResetCode]:
        return (
            db.query(PasswordResetCode)
            .filter(
                PasswordResetCode.user_id == user_id,
                PasswordResetCode.consumed_at.is_(None),
                PasswordResetCode.expires_at > datetime.utcnow(),
            )
            .order_by(PasswordResetCode.created_at.desc())
            .first()
        )

    @classmethod
    def verify_and_consume(cls, db: Session, user: User, code: str) -> bool:
        """Spend ``code`` for ``user``; False for wrong, expired or burnt codes."""
        row = cls._latest_live_code(db, user.id)
        if row is None:
            return False

        if row.attempts >= cls.MAX_ATTEMPTS:
            row.consumed_at = datetime.utcnow()
            db.commit()
            return False

        submitted = (code or "").strip()
        if not hmac.compare_digest(row.code_hash, cls._hash(user.id, submitted)):
            row.attempts += 1
            if row.attempts >= cls.MAX_ATTEMPTS:
                # Burn the row: further guesses must come with a new request.
                row.consumed_at = datetime.utcnow()
            db.commit()
            return False

        row.consumed_at = datetime.utcnow()
        db.commit()
        return True
