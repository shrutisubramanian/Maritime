"""
Admin review of paid marketplace placements.

GET  /admin/listing-fees            fee submissions (default: awaiting review)
POST /admin/listing-fees/{id}/approve   verify -> the paid showcase window starts
                                     (admin picks 1 month or 1 year)
POST /admin/listing-fees/{id}/reject    reject with a mandatory reason

Verifying a fee is the ONLY way a paid placement starts. If content moderation
has already approved the listing, it goes live immediately; otherwise it goes
live the moment moderation approves it (see ModerationService.act).

Receipts are readable through GET /listing-fees/{id}/receipt, which authorizes
admins as well as the owner.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.listing_fee import ListingFeeStatus
from app.models.profile import Profile
from app.models.user import User
from app.routers.listing_fees import serialize_fee
from app.schemas.listing_fee import (
    AdminListingFeeItem,
    AdminListingFeeListResponse,
    ListingFeeDecisionResponse,
    ListingFeeRejectRequest,
)
from app.services.listing_fee_service import ListingFeeService

router = APIRouter(prefix="/admin/listing-fees", tags=["Admin Listing Fees"])


def _serialize_admin(db: Session, fee) -> AdminListingFeeItem:
    base = serialize_fee(fee).model_dump()
    owner = db.query(User).filter(User.id == fee.owner_user_id).first() if fee.owner_user_id else None
    profile = (
        db.query(Profile).filter(Profile.user_id == fee.owner_user_id).first()
        if fee.owner_user_id
        else None
    )
    listing = ListingFeeService._load_listing(db, fee)
    return AdminListingFeeItem(
        **base,
        owner_email=owner.email if owner is not None else None,
        owner_company=profile.company_name if profile is not None else None,
        listing_status=(
            ListingFeeService._status_value(listing) if listing is not None else None
        ),
    )


@router.get(
    "",
    response_model=AdminListingFeeListResponse,
    summary="Listing-fee submissions (awaiting review by default)",
)
def list_listing_fees(
    fee_status: str | None = Query(
        None, alias="status", description="PENDING | SUBMITTED | VERIFIED | REJECTED | CANCELLED"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parsed = None
    if fee_status:
        try:
            parsed = ListingFeeStatus(fee_status.strip().upper())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status filter")
    fees = ListingFeeService.pending_for_admin(db, current_user, parsed)
    return {"data": [_serialize_admin(db, f) for f in fees], "total": len(fees)}


@router.post(
    "/{fee_id}/approve",
    response_model=ListingFeeDecisionResponse,
    summary="Verify a listing payment and start the showcase it paid for",
)
def approve_listing_fee(
    fee_id: uuid.UUID,
    period: str | None = Query(
        None,
        description=(
            "Showcase period granted: month (1 month) or year (1 year). Must match "
            "what the vendor paid; omitted means 'the period the payment bought'."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fee = ListingFeeService.approve(db, current_user, fee_id, period=period)
    return ListingFeeDecisionResponse(
        fee_id=str(fee.id),
        status=fee.status.value,
        listing_type=fee.listing_type.value,
        listing_id=str(fee.listing_id),
        starts_at=fee.starts_at,
        expires_at=fee.expires_at,
    )


@router.post(
    "/{fee_id}/reject",
    response_model=ListingFeeDecisionResponse,
    summary="Reject a listing payment with a reason",
)
def reject_listing_fee(
    fee_id: uuid.UUID,
    data: ListingFeeRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fee = ListingFeeService.reject(db, current_user, fee_id, data.reason)
    return ListingFeeDecisionResponse(
        fee_id=str(fee.id),
        status=fee.status.value,
        listing_type=fee.listing_type.value,
        listing_id=str(fee.listing_id),
        rejection_reason=fee.rejection_reason,
        starts_at=fee.starts_at,
        expires_at=fee.expires_at,
    )
