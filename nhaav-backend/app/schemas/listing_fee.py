"""Listing-fee API schemas.

Amounts are INTEGER PAISE. The fee and the placement period come from the server
(`ListingFeeService`), never from the client, and are echoed here so the UI can
render exactly what will be charged.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ListingFeePlan(BaseModel):
    """One of the two approved showcase choices. Money is INTEGER PAISE."""

    code: str
    label: str
    amount_paise: int
    period_days: int


class ListingFeeInstructionsResponse(BaseModel):
    """Bank details plus the two showcase plans a placement can buy."""

    configured: bool
    account_holder: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None
    branch: Optional[str] = None
    account_type: Optional[str] = None
    instructions: Optional[str] = None
    currency: str
    amount_paise: int
    period_days: int
    plans: List[ListingFeePlan] = []


class ListingFeeItem(BaseModel):
    id: str
    owner_user_id: Optional[str] = None
    listing_type: str
    listing_id: str
    listing_name: str
    amount_paise: int
    currency: str
    period_days: int
    # Which showcase plan this payment bought: `month` (1 month) or `year`
    # (1 year). None for a period that predates the two-plan model.
    plan_code: Optional[str] = None
    utr: str
    payment_date: datetime
    status: str
    submitted_at: Optional[datetime] = None
    decided_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    receipt_filename: str
    receipt_available: bool
    receipt_url: str
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: datetime


class ListingFeeListResponse(BaseModel):
    data: List[ListingFeeItem]
    total: int


class AdminListingFeeItem(ListingFeeItem):
    owner_email: Optional[str] = None
    owner_company: Optional[str] = None
    # The listing's own status, so an admin can see whether verifying the fee
    # will actually put something on the marketplace.
    listing_status: Optional[str] = None


class AdminListingFeeListResponse(BaseModel):
    data: List[AdminListingFeeItem]
    total: int


class ListingFeeRejectRequest(BaseModel):
    reason: str = Field(
        ..., min_length=3, max_length=1000, description="Why the payment was rejected"
    )


class ListingFeeDecisionResponse(BaseModel):
    fee_id: str
    status: str
    listing_type: str
    listing_id: str
    rejection_reason: Optional[str] = None
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
