import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict
from typing import Optional

from app.models.notification import NotificationType


class NotificationResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID

    title: str
    message: str

    type: NotificationType
    priority: str = "normal"
    related_entity: Optional[str] = None
    related_entity_id: Optional[uuid.UUID] = None
    is_read: bool = False
    is_archived: bool = False

    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )