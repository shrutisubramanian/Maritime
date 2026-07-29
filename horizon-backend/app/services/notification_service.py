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
        user_id: uuid.UUID,
        include_archived: bool = False
    ):
        query = db.query(Notification).filter(
            Notification.user_id == user_id
        )
        
        if not include_archived:
            query = query.filter(Notification.is_archived == False)
            
        return query.order_by(
            Notification.created_at.desc()
        ).all()

    @staticmethod
    def mark_as_read(db: Session, user_id: uuid.UUID, notification_id: uuid.UUID):
        notification = db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).first()
        
        if notification:
            notification.is_read = True
            db.commit()
            db.refresh(notification)
        return notification

    @staticmethod
    def mark_all_as_read(db: Session, user_id: uuid.UUID):
        db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).update({"is_read": True})
        db.commit()

    @staticmethod
    def archive_notification(db: Session, user_id: uuid.UUID, notification_id: uuid.UUID):
        notification = db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).first()
        
        if notification:
            notification.is_archived = True
            db.commit()
            db.refresh(notification)
        return notification

    @staticmethod
    def delete_notification(db: Session, user_id: uuid.UUID, notification_id: uuid.UUID):
        notification = db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).first()
        
        if notification:
            db.delete(notification)
            db.commit()
            return True
        return False