"""
Payment API schemas.

Amounts are exposed as INTEGER PAISE (`amount_paise`) — never floats. Bank
details are returned only from backend configuration; nothing is hardcoded in
the frontend.
"""
from datetime import datetime

from pydantic import BaseModel, Field


class PaymentInstructionsResponse(BaseModel):
    configured: bool
    account_holder: str | None = None
    bank_name: str | None = None
    account_number: str | None = None
    ifsc: str | None = None
    branch: str | None = None
    account_type: str | None = None
    instructions: str | None = None
    currency: str


class PaymentItem(BaseModel):
    id: str
    # The ACCOUNT that purchased. `organization_*` is company metadata only.
    owner_user_id: str | None = None
    organization_id: str | None = None
    organization_name: str | None = None
    plan_code: str
    plan_name: str
    # What was actually charged (plan price + GST).
    amount_paise: int
    # The breakdown behind it, both derived from the server-side plan.
    base_paise: int = 0
    gst_paise: int = 0
    gst_rate_percent: int = 0
    currency: str
    pass_count: int
    pass_validity_days: int = 0
    utr: str
    payment_date: datetime
    status: str
    submitted_at: datetime | None = None
    verified_at: datetime | None = None
    rejection_reason: str | None = None
    notes: str | None = None
    receipt_filename: str
    receipt_available: bool
    receipt_url: str
    subscription_status: str | None = None
    created_at: datetime


class PaymentListResponse(BaseModel):
    data: list[PaymentItem]
    total: int


class PaymentSubmitResponse(BaseModel):
    id: str
    status: str
    plan_code: str
    # Total payable, with the GST breakdown that produced it.
    amount_paise: int
    base_paise: int = 0
    gst_paise: int = 0
    gst_rate_percent: int = 0
    currency: str
    pass_count: int
    pass_validity_days: int = 0
    utr: str
    payment_date: datetime
    submitted_at: datetime | None = None
    message: str


class PendingPaymentItem(BaseModel):
    id: str
    owner_user_id: str | None = None
    organization_id: str | None = None
    organization_name: str | None = None
    plan_code: str
    plan_name: str
    # What this transfer pays for. Subscription payments are their own queue;
    # company visibility and listing fees are separate records/queues, so an
    # approver can never mistake one purpose for another.
    purpose: str = "subscription"
    amount_paise: int
    base_paise: int = 0
    gst_paise: int = 0
    gst_rate_percent: int = 0
    currency: str
    pass_validity_days: int = 0
    utr: str
    payment_date: datetime
    submitted_at: datetime | None = None
    submitted_by: str | None = None
    submitted_by_email: str | None = None
    owner_email: str | None = None
    # True when this purchase would CHANGE the account's current plan. A plan
    # change is only ever applied by this admin approval — never automatically.
    plan_change: bool = False
    notes: str | None = None
    receipt_filename: str
    receipt_available: bool
    receipt_url: str


class PendingPaymentListResponse(BaseModel):
    data: list[PendingPaymentItem]
    total: int


class PaymentRejectRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000, description="Why the payment was rejected")


class PaymentDecisionResponse(BaseModel):
    payment_id: str
    owner_user_id: str | None = None
    status: str
    rejection_reason: str | None = None
    subscription_id: str | None = None
    subscription_status: str | None = None
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    pack_id: str | None = None
    total_passes: int | None = None
    accesspack_created: bool
    already_processed: bool
