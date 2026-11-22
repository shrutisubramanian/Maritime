"""
Paid company-profile visibility — vendor side.

GET  /profile-visibility/plans      the two plans with GST broken out
GET  /profile-visibility/mine       this company's visibility state + payments
POST /profile-visibility/submit     submit a bank transfer + receipt for review
GET  /profile-visibility/{id}/receipt   private receipt (owner or admin)

Visibility is bought for the WHOLE company profile (₹1,000 / month or
₹10,000 / year, plus the configured GST), never per service or subcategory.
Nothing becomes visible here: only an admin verification does that.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user_identity
from app.models.profile import Profile
from app.models.user import User
from app.schemas.vendor_marketplace import VisibilityPaymentView
from app.services.profile_visibility_service import ProfileVisibilityService
from app.services.rate_limit_service import RateLimitService

router = APIRouter(prefix="/profile-visibility", tags=["Profile Visibility"])


def serialize_visibility(record) -> VisibilityPaymentView:
    return VisibilityPaymentView(
        id=str(record.id),
        profile_id=str(record.profile_id),
        owner_user_id=str(record.owner_user_id) if record.owner_user_id else None,
        plan=record.plan.value,
        period_days=record.period_days,
        base_amount_paise=record.base_amount_paise,
        gst_rate_percent=record.gst_rate_percent,
        gst_amount_paise=record.gst_amount_paise,
        total_amount_paise=record.total_amount_paise,
        currency=record.currency,
        utr=record.utr,
        payment_date=record.payment_date,
        status=record.status.value,
        submitted_at=record.submitted_at,
        decided_at=record.decided_at,
        rejection_reason=record.rejection_reason,
        starts_at=record.starts_at,
        expires_at=record.expires_at,
        notes=record.notes,
        receipt_filename=record.receipt_filename,
        receipt_available=bool(record.receipt_path),
        receipt_url=f"/profile-visibility/{record.id}/receipt",
        created_at=record.created_at,
    )


@router.get("/plans", summary="The two profile visibility plans, with GST")
def plans(current_user: User = Depends(get_current_user_identity)):
    return {
        "plans": ProfileVisibilityService.plans(),
        "instructions": ProfileVisibilityService.instructions(),
    }


@router.get("/mine", summary="My company's visibility state and payment history")
def my_visibility(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    profile = ProfileVisibilityService._owned_profile(db, current_user)
    state = ProfileVisibilityService.visibility_state(db, profile)
    payments = ProfileVisibilityService.list_for_owner(db, current_user)
    latest = payments[0] if payments else None
    return {
        "profile_id": str(profile.id),
        "profile_approved": profile.verification_status.value == "verified",
        "is_visible": state["is_visible"],
        "source": state["source"],
        "plan": state["plan"],
        "starts_at": state["starts_at"],
        "expires_at": state["expires_at"],
        "latest_payment": serialize_visibility(latest) if latest is not None else None,
        "payments": [serialize_visibility(p) for p in payments],
    }


@router.post(
    "/submit",
    status_code=201,
    summary="Submit a visibility payment for verification",
    dependencies=[
        Depends(RateLimitService.rate_limit_user("payment_submit")),
        Depends(RateLimitService.rate_limit_user("payment_receipt_upload")),
    ],
)
async def submit_visibility(
    plan: str = Form("monthly", description="monthly (₹1,000 + GST) or annual (₹10,000 + GST)"),
    utr: str = Form(..., description="Bank UTR / transaction reference"),
    payment_date: str = Form(..., description="ISO date/time of the transfer"),
    receipt: UploadFile = File(..., description="Transfer receipt (pdf/jpg/png)"),
    notes: str | None = Form(None),
    amount_paise: int | None = Form(None, description="Optional: must equal the plan total"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    try:
        parsed_date = datetime.fromisoformat(payment_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="payment_date must be an ISO date/time")

    record = ProfileVisibilityService.submit(
        db=db,
        user=current_user,
        plan_code=plan,
        utr=utr,
        payment_date=parsed_date,
        file=receipt,
        notes=notes,
        claimed_amount=amount_paise,
    )
    return serialize_visibility(record)


@router.get("/{payment_id}/receipt", summary="Download a visibility receipt (private)")
def download_receipt(
    payment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    record = ProfileVisibilityService.authorize_receipt(db, current_user, payment_id)
    return FileResponse(
        record.receipt_path,
        media_type=record.receipt_content_type or "application/octet-stream",
        filename=record.receipt_filename,
    )
