"""
Paid marketplace placement endpoints (provider / supplier side).

GET  /listing-fees/instructions     bank details + the two showcase plans
                                    (₹1,000 / 1 month, ₹10,000 / 1 year)
POST /listing-fees/submit           submit a transfer + receipt for review
GET  /listing-fees/mine             the caller's own fee submissions
GET  /listing-fees/{id}/receipt     private receipt download (owner or admin)

These use the IDENTITY-ONLY dependency, exactly like subscription payments: an
account whose subscription has lapsed is precisely the account that must be able
to pay. Ownership of the listing is enforced in the service, so a token can never
buy a placement for someone else's listing.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user_identity
from app.models.listing_fee import ListingFee, ListingFeeStatus, ListingType
from app.models.user import User
from app.schemas.listing_fee import (
    ListingFeeInstructionsResponse,
    ListingFeeItem,
    ListingFeeListResponse,
)
from app.services.listing_fee_service import ListingFeeService

router = APIRouter(prefix="/listing-fees", tags=["Listing Fees"])


def serialize_fee(fee) -> ListingFeeItem:
    """Owner view of one fee submission. Nothing derived from the plan table."""
    plan = ListingFeeService.plan_for_days(fee.period_days)
    return ListingFeeItem(
        id=str(fee.id),
        owner_user_id=str(fee.owner_user_id) if fee.owner_user_id else None,
        listing_type=fee.listing_type.value,
        listing_id=str(fee.listing_id),
        listing_name=fee.listing_name,
        amount_paise=fee.amount_paise,
        currency=fee.currency,
        period_days=fee.period_days,
        plan_code=plan["code"] if plan else None,
        utr=fee.utr,
        payment_date=fee.payment_date,
        status=fee.status.value,
        submitted_at=fee.submitted_at,
        decided_at=fee.decided_at,
        rejection_reason=fee.rejection_reason,
        notes=fee.notes,
        receipt_filename=fee.receipt_filename,
        receipt_available=bool(fee.receipt_path),
        receipt_url=f"/listing-fees/{fee.id}/receipt",
        starts_at=fee.starts_at,
        expires_at=fee.expires_at,
        created_at=fee.created_at,
    )


@router.get(
    "/instructions",
    response_model=ListingFeeInstructionsResponse,
    summary="Bank details and terms for a paid marketplace placement",
)
def listing_fee_instructions(
    current_user: User = Depends(get_current_user_identity),
):
    """Bank details from configuration, plus the server-side fee and period."""
    return ListingFeeService.instructions()


@router.post(
    "/submit",
    response_model=ListingFeeItem,
    status_code=201,
    summary="Submit the ₹1,000 listing payment for admin verification",
)
async def submit_listing_fee(
    listing_type: str = Form(..., description="service | supply"),
    listing_id: uuid.UUID = Form(..., description="The listing being placed"),
    utr: str = Form(..., description="Bank UTR / transaction reference"),
    payment_date: str = Form(..., description="ISO date/time the transfer was made"),
    receipt: UploadFile = File(..., description="Transfer receipt (pdf/jpg/png)"),
    notes: str | None = Form(None),
    plan: str = Form(
        "month",
        description="Showcase plan paid for: month (₹1,000 / 1 month) or year (₹10,000 / 1 year)",
    ),
    amount_paise: int | None = Form(
        None, description="Optional: must equal the chosen plan's amount exactly"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    try:
        kind = ListingType(listing_type.strip().lower())
    except ValueError:
        raise HTTPException(status_code=400, detail="listing_type must be 'service' or 'supply'")

    try:
        parsed_date = datetime.fromisoformat(payment_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="payment_date must be an ISO date/time")

    fee = ListingFeeService.submit(
        db=db,
        user=current_user,
        listing_type=kind,
        listing_id=listing_id,
        utr=utr,
        payment_date=parsed_date,
        file=receipt,
        notes=notes,
        claimed_amount=amount_paise,
        plan=plan,
    )
    return serialize_fee(fee)


@router.get("/mine", response_model=ListingFeeListResponse, summary="My listing payments")
def my_listing_fees(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    fees = ListingFeeService.list_for_owner(db, current_user)
    return {"data": [serialize_fee(f) for f in fees], "total": len(fees)}


@router.get("/{fee_id}/receipt", summary="Download a listing-fee receipt (private)")
def download_receipt(
    fee_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    """Owner or admin only; anyone else receives 404 so existence never leaks."""
    fee = ListingFeeService.authorize_receipt(db, current_user, fee_id)
    return FileResponse(
        fee.receipt_path,
        media_type=fee.receipt_content_type or "application/octet-stream",
        filename=fee.receipt_filename,
    )


@router.get("/status", summary="Fee status for one listing")
def listing_fee_status(
    listing_type: str,
    listing_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    """The owner's view of a listing's placement: live window or latest payment."""
    try:
        kind = ListingType(listing_type.strip().lower())
    except ValueError:
        raise HTTPException(status_code=400, detail="listing_type must be 'service' or 'supply'")

    listing = ListingFeeService.owned_listing(db, current_user, kind, listing_id)
    latest = (
        db.query(ListingFee)
        .filter(ListingFee.listing_type == kind, ListingFee.listing_id == listing_id)
        .order_by(ListingFee.created_at.desc())
        .first()
    )
    return {
        "listing_type": kind.value,
        "listing_id": str(listing.id),
        "status": ListingFeeService._status_value(listing),
        "is_live": ListingFeeService.is_live(listing),
        "published_at": listing.published_at,
        "expires_at": listing.expires_at,
        "amount_paise": ListingFeeService.amount_paise(),
        "period_days": ListingFeeService.period_days(),
        "latest_fee": serialize_fee(latest) if latest is not None else None,
        "awaiting_verification": bool(
            latest is not None and latest.status in (ListingFeeStatus.PENDING, ListingFeeStatus.SUBMITTED)
        ),
    }
