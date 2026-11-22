"""Deterministic demo profile-view activity for vendors.

This is deliberately NOT customer analytics. The count is derived from the
account id and its age, so it never changes on refresh, differs between
providers, and moves only when a three-day demo interval passes. No analytics
table or schema change is involved.

The existing notifications table is reused for the three-day update. Each
interval has a deterministic id, so a dashboard that polls repeatedly can never
create the same notification twice.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.notification import Notification, NotificationType
from app.models.user import User, UserRole
from app.services.notification_service import NotificationService
from app.utils.timezone import as_utc


class SimulatedProfileViewsService:
    """Demo-only profile-visit counter and three-day notification."""

    INTERVAL_DAYS = 3
    MAX_VIEWS = 99  # keep the dashboard metric a double-digit number
    ELIGIBLE_ROLES = (UserRole.provider, UserRole.supplier)
    RELATED_ENTITY = "profile_view_simulation"

    @staticmethod
    def _baseline(user: User) -> int:
        """Stable 24-79 baseline, different for different account ids."""
        try:
            raw = int(uuid.UUID(str(user.id)))
        except (ValueError, AttributeError, TypeError):
            raw = sum(ord(char) for char in str(user.id))
        return 24 + (raw % 56)

    @classmethod
    def snapshot(
        cls, user: User, now: Optional[datetime] = None
    ) -> Optional[dict]:
        """Current demo count, or None for roles that must not see it."""
        if user.role not in cls.ELIGIBLE_ROLES:
            return None

        now = now or datetime.now(timezone.utc)
        created_at = as_utc(user.created_at or now)
        elapsed_days = max(0, (now - created_at).days)
        intervals = elapsed_days // cls.INTERVAL_DAYS
        views = min(cls.MAX_VIEWS, cls._baseline(user) + intervals * 3)

        return {
            "profile_views": views,
            "profile_views_is_demo": True,
            "profile_views_interval_days": cls.INTERVAL_DAYS,
        }

    @classmethod
    def ensure_due_notification(
        cls,
        db: Session,
        user: User,
        now: Optional[datetime] = None,
    ) -> Optional[Notification]:
        """Create at most one notification for the latest elapsed interval."""
        if user.role not in cls.ELIGIBLE_ROLES:
            return None

        now = now or datetime.now(timezone.utc)
        created_at = as_utc(user.created_at or now)
        intervals = max(0, (now - created_at).days) // cls.INTERVAL_DAYS
        if intervals < 1:
            return None

        interval_id = uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"nhaav:profile-views:{user.id}:{intervals}",
        )
        existing = (
            db.query(Notification)
            .filter(
                Notification.user_id == user.id,
                Notification.type == NotificationType.system,
                Notification.related_entity == cls.RELATED_ENTITY,
                Notification.related_entity_id == str(interval_id),
            )
            .first()
        )
        if existing is not None:
            return existing

        views = cls.snapshot(user, now)["profile_views"]
        notification = NotificationService.create_notification(
            db=db,
            user_id=user.id,
            title="Profile views updated (demo)",
            message=(
                f"Your Nhaav profile received {views} profile views in this "
                "demo simulation."
            ),
            notification_type=NotificationType.system,
            related_entity=cls.RELATED_ENTITY,
            related_entity_id=interval_id,
            dedupe=True,
        )
        try:
            db.commit()
            db.refresh(notification)
        except Exception:
            # A demo notification must never break the notifications page.
            db.rollback()
            return None
        return notification