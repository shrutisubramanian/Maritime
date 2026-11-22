"""
Admin payment review — the only place a Nhaav subscription is activated.

GET  /admin/payments/pending              payments awaiting verification
POST /admin/payments/{id}/approve         verify -> activate (transactional, idempotent)
POST /admin/payments/{id}/reject          reject with a mandatory reason

Only an admin account may call these: the role is checked inside
PaymentService for every operation, so a client, supplier or service provider
token is refused with 403 regardless of which endpoint is guessed.

Receipts are readable by admins through GET /payments/{id}/receipt.
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.user import User
from app.schemas.payment import (
    PaymentDecisionResponse,
    PaymentRejectRequest,
    PendingPaymentItem,
    PendingPaymentListResponse,
)
from app.services.payment_service import PaymentService, money_breakdown
from app.services.subscription_service import plan_validity_days

router = APIRouter(prefix="/admin/payments", tags=["Admin Payments"])


def _serialize_pending(db: Session, payment) -> PendingPaymentItem:
    from app.models.access_token import Organization
    from app.models.subscription import Subscription, SubscriptionStatus

    organization = (
        db.query(Organization).filter(Organization.id == payment.organization_id).first()
        if payment.organization_id
        else None
    )

    # The OWNING ACCOUNT drives the review: company is context, not entitlement.
    owner = (
        db.query(User).filter(User.id == payment.owner_user_id).first()
        if payment.owner_user_id
        else None
    )
    submitter = None
    submitter_email = None
    if payment.submitted_by is not None:
        submitter_user = db.query(User).filter(User.id == payment.submitted_by).first()
        if submitter_user is not None:
            submitter = str(submitter_user.id)
            submitter_email = submitter_user.email

    # Plan-change context for the reviewer: this purchase would switch the
    # account to a different plan than its current live one. Approval is the
    # ONLY way that switch happens; nothing is prorated or auto-migrated.
    plan_change = False
    if payment.owner_user_id:
        conflicting = (
            db.query(Subscription)
            .filter(
                Subscription.owner_user_id == payment.owner_user_id,
                Subscription.id != payment.subscription_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
            )
            .all()
        )
        for row in conflicting:
            if row.plan is not None and row.plan.code != payment.plan.code:
                plan_change = True
                break

    return PendingPaymentItem(
        id=str(payment.id),
        owner_user_id=str(payment.owner_user_id) if payment.owner_user_id else None,
        owner_email=owner.email if owner else None,
        plan_change=plan_change,
        organization_id=str(payment.organization_id) if payment.organization_id else None,
        organization_name=organization.name if organization else None,
        plan_code=payment.plan.code,
        plan_name=payment.plan.name,
        purpose="subscription",
        amount_paise=payment.amount_paise,
        **money_breakdown(payment),
        pass_validity_days=plan_validity_days(payment.plan),
        currency=payment.currency,
        utr=payment.utr,
        payment_date=payment.payment_date,
        submitted_at=payment.submitted_at,
        submitted_by=submitter,
        submitted_by_email=submitter_email,
        notes=payment.notes,
        receipt_filename=payment.receipt_filename,
        receipt_available=bool(payment.receipt_path),
        receipt_url=f"/payments/{payment.id}/receipt",
    )


@router.get(
    "/pending",
    response_model=PendingPaymentListResponse,
    summary="Bank-transfer payments awaiting verification",
)
def pending_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = PaymentService.pending_payments(db, current_user)
    items = [_serialize_pending(db, row) for row in rows]
    return {"data": items, "total": len(items)}


@router.post(
    "/{payment_id}/approve",
    response_model=PaymentDecisionResponse,
    summary="Verify a payment and activate the subscription",
)
def approve_payment(
    payment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Approving verifies the transfer and, in a single transaction, activates the
    subscription, issues its access pack and passes, opens the organization's
    access gate, writes the audit entry and notifies the submitter. Any failure
    rolls the whole activation back. Approving twice changes nothing.
    """
    return PaymentService.approve_payment(db, current_user, payment_id)


@router.post(
    "/{payment_id}/reject",
    response_model=PaymentDecisionResponse,
    summary="Reject a payment with a reason",
)
def reject_payment(
    payment_id: uuid.UUID,
    data: PaymentRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Rejecting leaves the subscription inactive and creates no access pack or
    passes. The reason is stored and shown to the organization.
    """
    return PaymentService.reject_payment(db, current_user, payment_id, data.reason)
