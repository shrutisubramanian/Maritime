import uuid

from sqlalchemy.orm import Session

from app.models.notification import (
    Notification,
    NotificationType
)


class NotificationService:

    @staticmethod
    def create_notification(
        db: Session,
        user_id: uuid.UUID,
        title: str,
        message: str,
        notification_type: NotificationType
    ):

        notification = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=notification_type
        )

        db.add(notification)

        return notification

    @staticmethod
    def get_notifications(
        db: Session,
        user_id: uuid.UUID
    ):

        return db.query(Notification).filter(
            Notification.user_id == user_id
        ).order_by(
            Notification.created_at.desc()
        ).all()