"""
Organization-side payment endpoints (offline bank transfer).

GET  /payments/instructions        configured bank details (never hardcoded)
POST /payments/submit              submit a transfer + receipt for review
GET  /payments/my                  the caller's own organization's payments
GET  /payments/{id}/receipt        private receipt download (member or admin)

These use the IDENTITY-ONLY dependency on purpose: an organization whose
subscription has expired (or whose passes are exhausted) has no valid access
session, and it is exactly that organization which must be able to submit a
renewal payment. Authorization for payment data stays organization-scoped in
the service, so no session gate is required to pay — or to be refused.
"""
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user_identity
from app.models.user import User
from app.schemas.payment import (
    PaymentInstructionsResponse,
    PaymentItem,
    PaymentListResponse,
    PaymentSubmitResponse,
)
from app.services.payment_service import PaymentService, money_breakdown
from app.services.rate_limit_service import RateLimitService
from app.services.subscription_service import (
    SubscriptionService,
    plan_validity_days,
)

router = APIRouter(prefix="/payments", tags=["Payments"])


def _serialize_payment(db: Session, payment) -> PaymentItem:
    from app.models.access_token import Organization
    from app.models.subscription import Subscription

    subscription_status = None
    if payment.subscription_id:
        subscription = (
            db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
        )
        subscription_status = subscription.status.value if subscription else None

    return PaymentItem(
        id=str(payment.id),
        owner_user_id=str(payment.owner_user_id) if payment.owner_user_id else None,
        organization_id=str(payment.organization_id) if payment.organization_id else None,
        organization_name=(
            org.name
            if payment.organization_id
            and (org := db.query(Organization)
                 .filter(Organization.id == payment.organization_id).first()) is not None
            else None
        ),
        plan_code=payment.plan.code,
        plan_name=payment.plan.name,
        amount_paise=payment.amount_paise,
        **money_breakdown(payment),
        currency=payment.currency,
        pass_count=payment.plan.pass_count,
        pass_validity_days=plan_validity_days(payment.plan),
        utr=payment.utr,
        payment_date=payment.payment_date,
        status=payment.status.value,
        submitted_at=payment.submitted_at,
        verified_at=payment.verified_at,
        rejection_reason=payment.rejection_reason,
        notes=payment.notes,
        receipt_filename=payment.receipt_filename,
        receipt_available=bool(payment.receipt_path),
        receipt_url=f"/payments/{payment.id}/receipt",
        subscription_status=subscription_status,
        created_at=payment.created_at,
    )


@router.get(
    "/instructions",
    response_model=PaymentInstructionsResponse,
    summary="Nhaav bank-transfer details for offline payment",
)
def payment_instructions(current_user: User = Depends(get_current_user_identity)):
    """
    The configured Nhaav bank details, plus the supported plans (see
    GET /subscription/plans). Sourced entirely from backend configuration — no
    bank information ships in frontend source.
    """
    return PaymentService.get_instructions()


@router.post(
    "/submit",
    response_model=PaymentSubmitResponse,
    status_code=201,
    summary="Submit a bank-transfer payment for admin verification",
)
async def submit_payment(
    plan_code: str = Form(..., description="MONTHLY | ANNUAL"),
    utr: str = Form(..., description="Bank UTR / transaction reference"),
    payment_date: str = Form(..., description="ISO date/time the transfer was made"),
    receipt: UploadFile = File(..., description="Transfer receipt (pdf/jpg/png)"),
    notes: str | None = Form(None),
    amount_paise: int | None = Form(
        None,
        description=(
            "Optional claimed amount. Validated against the server-side plan price; "
            "never stored or trusted."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
    _rl: None = Depends(RateLimitService.rate_limit_user("payment_submit")),
    _receipt_rl: None = Depends(
        RateLimitService.rate_limit_user("payment_receipt_upload")
    ),
):
    """
    Record a transfer for the CALLER'S ACCOUNT. The amount and pass count come
    from the plan server-side; a mismatched claimed amount is refused. Nothing is
    activated here — an admin must verify the payment, and that approval is what
    authorises a plan change.
    """
    from datetime import datetime as _datetime

    raw_date = (payment_date or "").strip().replace("Z", "+00:00")
    try:
        parsed_date = _datetime.fromisoformat(raw_date)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="payment_date must be an ISO-8601 date or date-time (e.g. 2026-10-06 or 2026-10-06T12:30:00).",
        )
    if parsed_date.tzinfo is not None:
        parsed_date = parsed_date.astimezone(tz=None).replace(tzinfo=None)

    payment = PaymentService.submit_payment(
        db,
        current_user,
        plan_code=plan_code,
        utr=utr,
        payment_date=parsed_date,
        file=receipt,
        notes=notes,
        claimed_amount=amount_paise,
    )
    plan = SubscriptionService.get_plan(db, payment.plan.code)
    return PaymentSubmitResponse(
        id=str(payment.id),
        status=payment.status.value,
        plan_code=plan.code,
        amount_paise=payment.amount_paise,
        **money_breakdown(payment),
        currency=payment.currency,
        pass_count=plan.pass_count,
        pass_validity_days=plan_validity_days(plan),
        utr=payment.utr,
        payment_date=payment.payment_date,
        submitted_at=payment.submitted_at,
        message=(
            "Payment submitted for verification. Your subscription activates once "
            "Nhaav verifies the transfer."
        ),
    )


@router.get("/my", response_model=PaymentListResponse, summary="My payments")
def my_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    """Payments belonging to the caller's OWN account, newest first.

    Account-scoped on purpose: a colleague in the same company can never see or
    pay against these records.
    """
    rows = PaymentService.list_payments_for_user(db, current_user)
    items = [_serialize_payment(db, row) for row in rows]
    return {"data": items, "total": len(items)}


@router.get("/{payment_id}/receipt", summary="Download a payment receipt (private)")
def download_receipt(
    payment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_identity),
):
    """
    Stream the stored receipt. Authorized for admins and for members of the
    organization that submitted the payment; anyone else receives 404. Receipts
    live outside any static mount, so this is the only way to read one.
    """
    payment = PaymentService.authorize_receipt(db, current_user, payment_id)
    return FileResponse(
        payment.receipt_path,
        media_type=payment.receipt_content_type or "application/octet-stream",
        filename=payment.receipt_filename,
    )
