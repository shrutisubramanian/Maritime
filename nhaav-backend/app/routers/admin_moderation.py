import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.user import User
from app.schemas.moderation import (
    ModerationAction,
    ModerationActionResult,
    ModerationQueueResponse,
)
from app.services.moderation_service import ModerationService

router = APIRouter(prefix="/admin/moderation", tags=["Admin Moderation"])


@router.get("/queue", response_model=ModerationQueueResponse, summary="Listings awaiting moderation")
def moderation_queue(
    kind: str = Query("service", description="service | supply"),
    status: Optional[str] = Query(None, description="draft | pending_review | approved | rejected | archived"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = ModerationService.queue(db, current_user.id, kind, status)
    return {"data": items, "total": len(items)}


@router.post(
    "/{kind}/{listing_id}",
    response_model=ModerationActionResult,
    summary="Approve or reject a listing",
)
def moderate_listing(
    kind: str,
    listing_id: uuid.UUID,
    data: ModerationAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ModerationService.act(db, current_user.id, kind, listing_id, data.status, data.reason)
