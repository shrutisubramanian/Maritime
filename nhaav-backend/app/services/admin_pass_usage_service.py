"""Admin visibility into WHO spends access passes, when, and how many are left.

There is no new ledger here: an access pass IS the 6-hour session record
(`AccessToken`), so its activation/expiry/consumption timestamps are already the
audit trail. This service turns those rows into a per-ACCOUNT usage view for the
admin console:

    issued      every pass the account has ever been given (sum of its packs)
    available   unused passes still inside their validity window
    active      the one pass bound to a live session right now
    consumed    passes whose session ended (logout or 6-hour expiry)
    expired     passes never used inside their validity window

Pass ownership is the ACCOUNT (`owner_user_id`), never a company, so one
colleague's usage is never folded into another's.

Expiry is applied before reporting (`sweep_expired`), so the figures match what
the client's own dashboard would show instead of drifting until someone logs in.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import func, or_, update
from sqlalchemy.orm import Session

from app.models.access_token import AccessPack, AccessToken, AccessTokenStatus
from app.models.profile import Profile
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User
from app.utils.timezone import as_utc


def _utcnow() -> datetime:
    return datetime.utcnow()


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _remaining_seconds(expires_at: Optional[datetime], now: datetime) -> int:
    if expires_at is None:
        return 0
    return max(0, int((as_utc(expires_at) - as_utc(now)).total_seconds()))


class AdminPassUsageService:
    """Read-only pass-usage reporting for the admin console."""

    # ------------------------------------------------------------------ expiry
    @staticmethod
    def sweep_expired(db: Session, now: Optional[datetime] = None) -> dict:
        """Apply BOTH pass clocks across every account, once.

        * an ACTIVE pass past its 6-hour expiry becomes CONSUMED
        * an AVAILABLE pass past its 6/12-month window becomes EXPIRED

        This mirrors the lazy per-request sweep in ``AccessTokenService`` so the
        admin view reports the same state a client's dashboard reports. Bulk
        UPDATEs, no background worker, one commit.
        """
        now = now or _utcnow()
        consumed = db.execute(
            update(AccessToken)
            .where(
                AccessToken.status == AccessTokenStatus.active,
                AccessToken.expires_at.isnot(None),
                AccessToken.expires_at <= now,
            )
            .values(status=AccessTokenStatus.consumed, consumed_at=now)
            .execution_options(synchronize_session=False)
        )
        expired = db.execute(
            update(AccessToken)
            .where(
                AccessToken.status == AccessTokenStatus.available,
                AccessToken.unused_expires_at.isnot(None),
                AccessToken.unused_expires_at <= now,
            )
            .values(status=AccessTokenStatus.expired)
            .execution_options(synchronize_session=False)
        )
        # Commit unconditionally: both statements take the write lock whether or
        # not any row matched, and holding it open blocks every other writer.
        db.commit()
        return {
            "sessions_expired": int(consumed.rowcount or 0),
            "unused_expired": int(expired.rowcount or 0),
        }

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def _active_subscription(db: Session, owner_id: uuid.UUID, now: datetime):
        rows = (
            db.query(Subscription)
            .filter(
                Subscription.owner_user_id == owner_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
            )
            .all()
        )
        live = [
            row
            for row in rows
            if row.expires_at is None or as_utc(row.expires_at) > as_utc(now)
        ]
        if not live:
            return None
        return max(live, key=lambda row: as_utc(row.expires_at) if row.expires_at else now)

    @staticmethod
    def _packs_by_owner(db: Session, owner_ids: list[uuid.UUID]) -> dict:
        if not owner_ids:
            return {}
        packs: dict = {}
        for pack in (
            db.query(AccessPack)
            .filter(AccessPack.owner_user_id.in_(owner_ids))
            .order_by(AccessPack.created_at.asc())
            .all()
        ):
            packs.setdefault(pack.owner_user_id, []).append(pack)
        return packs

    @staticmethod
    def _account_summary(
        db: Session,
        user: User,
        profile: Optional[Profile],
        counts: dict,
        active_pass: Optional[AccessToken],
        last_used: Optional[datetime],
        last_consumed: Optional[datetime],
        next_unused_expiry: Optional[datetime],
        packs: list[AccessPack],
        now: datetime,
    ) -> dict:
        subscription = AdminPassUsageService._active_subscription(db, user.id, now)
        plan = getattr(subscription, "plan", None) if subscription is not None else None
        session = None
        if active_pass is not None and active_pass.expires_at is not None:
            session = {
                "pass_id": str(active_pass.id),
                "activated_at": _iso(active_pass.activated_at),
                "expires_at": _iso(active_pass.expires_at),
                "remaining_seconds": _remaining_seconds(active_pass.expires_at, now),
            }
        total = sum(counts.values())
        return {
            "user_id": str(user.id),
            "email": user.email,
            "full_name": user.full_name or "",
            "company_name": (profile.company_name if profile is not None else None) or "",
            "role": user.role.value if user.role else None,
            "access_control_enabled": bool(user.access_control_enabled),
            "plan": (
                {
                    "code": getattr(plan, "code", None),
                    "name": getattr(plan, "name", None),
                    "expires_at": _iso(subscription.expires_at),
                }
                if subscription is not None
                else None
            ),
            "total_passes": total,
            "available_passes": counts.get("available", 0),
            "active_passes": counts.get("active", 0),
            "consumed_passes": counts.get("consumed", 0),
            "expired_passes": counts.get("expired", 0),
            "current_session": session,
            "last_used_at": _iso(last_used),
            "last_consumed_at": _iso(last_consumed),
            "next_unused_expiry": _iso(next_unused_expiry),
            "packs": [
                {
                    "pack_id": str(pack.id),
                    "source": pack.source,
                    "token_count": pack.token_count,
                    "status": pack.status.value,
                    "created_at": _iso(pack.created_at),
                }
                for pack in packs
            ],
        }

    # ------------------------------------------------------------------- list
    @staticmethod
    def list_accounts(
        db: Session,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 25,
    ) -> dict:
        """One row per account that owns passes, newest activity first."""
        now = _utcnow()
        sweep = AdminPassUsageService.sweep_expired(db, now)

        status_rows = (
            db.query(
                AccessToken.owner_user_id,
                AccessToken.status,
                func.count(AccessToken.id),
            )
            .filter(AccessToken.owner_user_id.isnot(None))
            .group_by(AccessToken.owner_user_id, AccessToken.status)
            .all()
        )
        owner_ids = sorted({row[0] for row in status_rows}, key=str)
        if not owner_ids:
            return {
                "data": [],
                "total": 0,
                "page": page,
                "pages": 1,
                "totals": {
                    "accounts": 0,
                    "passes_total": 0,
                    "available": 0,
                    "active": 0,
                    "consumed": 0,
                    "expired": 0,
                },
                "generated_at": _iso(now),
                "sweep": sweep,
            }

        counts_by_owner: dict = {
            owner_id: {"available": 0, "active": 0, "consumed": 0, "expired": 0}
            for owner_id in owner_ids
        }
        for owner_id, status, count in status_rows:
            key = status.value if hasattr(status, "value") else str(status)
            counts_by_owner[owner_id][key.lower()] = int(count)

        active_by_owner: dict = {}
        for token in (
            db.query(AccessToken)
            .filter(
                AccessToken.owner_user_id.in_(owner_ids),
                AccessToken.status == AccessTokenStatus.active,
            )
            .all()
        ):
            current = active_by_owner.get(token.owner_user_id)
            if current is None or (
                token.activated_at
                and current.activated_at
                and token.activated_at > current.activated_at
            ):
                active_by_owner[token.owner_user_id] = token

        last_used = dict(
            db.query(AccessToken.owner_user_id, func.max(AccessToken.activated_at))
            .filter(AccessToken.owner_user_id.in_(owner_ids))
            .group_by(AccessToken.owner_user_id)
            .all()
        )
        last_consumed = dict(
            db.query(AccessToken.owner_user_id, func.max(AccessToken.consumed_at))
            .filter(AccessToken.owner_user_id.in_(owner_ids))
            .group_by(AccessToken.owner_user_id)
            .all()
        )
        next_unused = dict(
            db.query(AccessToken.owner_user_id, func.min(AccessToken.unused_expires_at))
            .filter(
                AccessToken.owner_user_id.in_(owner_ids),
                AccessToken.status == AccessTokenStatus.available,
                AccessToken.unused_expires_at.isnot(None),
            )
            .group_by(AccessToken.owner_user_id)
            .all()
        )

        users = db.query(User).filter(User.id.in_(owner_ids)).all()
        profiles = {
            profile.user_id: profile
            for profile in db.query(Profile).filter(Profile.user_id.in_(owner_ids)).all()
        }
        packs = AdminPassUsageService._packs_by_owner(db, owner_ids)

        needle = (search or "").strip().lower()
        rows: list[dict] = []
        for user in users:
            profile = profiles.get(user.id)
            company = (profile.company_name if profile is not None else "") or ""
            if needle and not (
                needle in (user.email or "").lower()
                or needle in (user.full_name or "").lower()
                or needle in company.lower()
            ):
                continue
            rows.append(
                AdminPassUsageService._account_summary(
                    db,
                    user,
                    profile,
                    counts_by_owner.get(user.id, {}),
                    active_by_owner.get(user.id),
                    last_used.get(user.id),
                    last_consumed.get(user.id),
                    next_unused.get(user.id),
                    packs.get(user.id, []),
                    now,
                )
            )

        rows.sort(
            key=lambda row: (
                row["last_used_at"] or "",
                row["email"].lower(),
            ),
            reverse=True,
        )

        totals = {
            "accounts": len(rows),
            "passes_total": sum(row["total_passes"] for row in rows),
            "available": sum(row["available_passes"] for row in rows),
            "active": sum(row["active_passes"] for row in rows),
            "consumed": sum(row["consumed_passes"] for row in rows),
            "expired": sum(row["expired_passes"] for row in rows),
        }

        total = len(rows)
        pages = (total + limit - 1) // limit if limit else 1
        start = (page - 1) * limit
        return {
            "data": rows[start : start + limit],
            "total": total,
            "page": page,
            "pages": pages,
            "totals": totals,
            "generated_at": _iso(now),
            "sweep": sweep,
        }

    # ----------------------------------------------------------------- detail
    @staticmethod
    def account_detail(db: Session, user_id: uuid.UUID) -> Optional[dict]:
        """One account's packs and its full pass history (newest activity first)."""
        now = _utcnow()
        AdminPassUsageService.sweep_expired(db, now)

        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            return None

        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        tokens = (
            db.query(AccessToken)
            .filter(AccessToken.owner_user_id == user.id)
            .all()
        )

        counts = {"available": 0, "active": 0, "consumed": 0, "expired": 0}
        for token in tokens:
            key = token.status.value if hasattr(token.status, "value") else str(token.status)
            counts[key.lower()] = counts.get(key.lower(), 0) + 1

        active_pass = next(
            (token for token in tokens if token.status == AccessTokenStatus.active),
            None,
        )
        last_used = max(
            (token.activated_at for token in tokens if token.activated_at), default=None
        )
        last_consumed = max(
            (token.consumed_at for token in tokens if token.consumed_at), default=None
        )
        next_unused_expiry = min(
            (
                token.unused_expires_at
                for token in tokens
                if token.status == AccessTokenStatus.available
                and token.unused_expires_at is not None
            ),
            default=None,
        )
        packs = AdminPassUsageService._packs_by_owner(db, [user.id]).get(user.id, [])

        summary = AdminPassUsageService._account_summary(
            db,
            user,
            profile,
            counts,
            active_pass,
            last_used,
            last_consumed,
            next_unused_expiry,
            packs,
            now,
        )

        def _ordered(token: AccessToken):
            return token.activated_at or token.available_at or token.created_at

        history = sorted(
            tokens,
            key=lambda token: _ordered(token) or datetime.min,
            reverse=True,
        )

        pack_source = {pack.id: pack.source for pack in packs}
        passes = []
        for token in history:
            session_seconds = 0
            if token.activated_at and token.expires_at:
                session_seconds = max(
                    0,
                    int(
                        (as_utc(token.expires_at) - as_utc(token.activated_at)).total_seconds()
                    ),
                )
            passes.append(
                {
                    "pass_id": str(token.id),
                    "status": (
                        token.status.value
                        if hasattr(token.status, "value")
                        else str(token.status)
                    ),
                    "pack_id": str(token.pack_id),
                    "pack_source": pack_source.get(token.pack_id),
                    "available_at": _iso(token.available_at),
                    "unused_expires_at": _iso(token.unused_expires_at),
                    "activated_at": _iso(token.activated_at),
                    "expires_at": _iso(token.expires_at),
                    "consumed_at": _iso(token.consumed_at),
                    "session_seconds": session_seconds,
                }
            )

        return {
            "account": summary,
            "passes": passes,
            "generated_at": _iso(now),
        }
