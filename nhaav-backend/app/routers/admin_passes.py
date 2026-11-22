"""Admin pass-usage console API.

    GET /admin/passes/usage               who holds passes, how many are left,
                                          what is running now and when it was used
    GET /admin/passes/usage/{user_id}     one account: its packs and full history

Read-only and admin-only. Passes belong to individual ACCOUNTS, so every row is
one account — a company's colleagues are never merged into a shared balance.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.user import User, UserRole
from app.services.admin_pass_usage_service import AdminPassUsageService

router = APIRouter(prefix="/admin/passes", tags=["Admin Pass Usage"])


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/usage", summary="Pass usage per client account")
def pass_usage(
    search: Optional[str] = Query(
        None, description="Company, contact name or e-mail"
    ),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Every account that owns passes, with its balance and last activity.

    `available_passes` is what the account has left to start new sessions;
    `active_passes` is the one pass bound to a live 6-hour session; `consumed`
    counts ended sessions and `expired` counts unused passes whose window closed.
    """
    return AdminPassUsageService.list_accounts(db, search=search, page=page, limit=limit)


@router.get("/usage/{user_id}", summary="One account's pass history")
def pass_usage_detail(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Packs, balance and every pass the account was issued, newest first.

    Each pass carries `activated_at` (when it was used), `expires_at` (its
    6-hour end), `consumed_at` (when the session ended) and
    `unused_expires_at` (when an unused pass would lapse).
    """
    payload = AdminPassUsageService.account_detail(db, user_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return payload
