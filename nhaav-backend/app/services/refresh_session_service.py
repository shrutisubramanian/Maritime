"""Issue / consume / revoke refresh-token records.

The rules, in one place:

* Every refresh token minted by the app gets a `RefreshSession` row.
* Exchanging a token CONSUMES its row (single use). Rotating normally links the
  old row to the new jti.
* Replaying an already-consumed token is treated as theft: every live session of
  that account is revoked, so the attacker and the victim are both signed out
  and the owner has to sign in again.
* Logout and password reset revoke everything the account holds.
"""
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.refresh_session import RefreshSession

REFRESH_TOKEN_DAYS = 7


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


class RefreshSessionService:
    @staticmethod
    def register(
        db: Session,
        user_id: uuid.UUID,
        jti: str,
        expires_at: datetime | None = None,
    ) -> RefreshSession:
        """Record a freshly issued refresh token."""
        row = RefreshSession(
            id=uuid.uuid4(),
            user_id=user_id,
            jti=jti,
            issued_at=datetime.utcnow(),
            expires_at=expires_at or (datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS)),
        )
        db.add(row)
        db.commit()
        return row

    @staticmethod
    def consume(db: Session, user_id: uuid.UUID, jti: str) -> RefreshSession:
        """Spend one refresh token, or refuse it.

        Missing row = the token was never issued by this server (or predates
        revocation tracking): refuse. Already revoked = replay: revoke every
        session the account has, then refuse.
        """
        row = db.query(RefreshSession).filter(RefreshSession.jti == jti).first()
        if row is None or row.user_id != user_id:
            raise _unauthorized("Invalid refresh token")
        if row.revoked_at is not None:
            RefreshSessionService.revoke_all(db, user_id, reason="replay")
            raise _unauthorized("This session has ended. Please sign in again.")
        if row.expires_at <= datetime.utcnow():
            row.revoked_at = datetime.utcnow()
            row.revoked_reason = "expired"
            db.commit()
            raise _unauthorized("Invalid refresh token")
        return row

    @staticmethod
    def rotate(db: Session, row: RefreshSession, new_jti: str) -> None:
        """Mark the consumed token as replaced by a new one."""
        row.revoked_at = datetime.utcnow()
        row.revoked_reason = "rotated"
        row.replaced_by_jti = new_jti
        db.commit()

    @staticmethod
    def revoke_all(
        db: Session,
        user_id: uuid.UUID,
        reason: str = "logout",
    ) -> int:
        """Revoke every live refresh token for one account."""
        rows = (
            db.query(RefreshSession)
            .filter(
                RefreshSession.user_id == user_id,
                RefreshSession.revoked_at.is_(None),
            )
            .all()
        )
        now = datetime.utcnow()
        for row in rows:
            row.revoked_at = now
            row.revoked_reason = reason
        db.commit()
        return len(rows)
