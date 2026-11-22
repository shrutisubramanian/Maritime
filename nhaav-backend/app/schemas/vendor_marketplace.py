"""Request/response models for the company-first marketplace and visibility."""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.vendor_category import VendorType


class VendorCategoryCreate(BaseModel):
    vendor_type: VendorType = Field(..., description="provider or supplier")
    name: str = Field(..., min_length=3, max_length=120)
    subcategories: List[str] = Field(default_factory=list, description="Optional initial capabilities")


class VendorSubcategoryCreate(BaseModel):
    names: List[str] = Field(..., min_length=1, description="One or more capability names")


class VendorCategoryPatch(BaseModel):
    is_active: Optional[bool] = None


class CompanyCategoryAssign(BaseModel):
    """Admin assignment/correction of a company's marketplace category.

    Deliberately does NOT approve the profile: approval stays with the existing
    verification workflow (documents + payment evidence), so this endpoint can
    never become a shortcut around it.
    """

    primary_category: str = Field(..., description="Category name for the company's vendor type")
    subcategories: List[str] = Field(default_factory=list)


class VisibilityRejectRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class VisibilityPaymentView(BaseModel):
    id: str
    profile_id: str
    owner_user_id: Optional[str] = None
    plan: str
    period_days: int
    base_amount_paise: int
    gst_rate_percent: int
    gst_amount_paise: int
    total_amount_paise: int
    currency: str
    utr: str
    payment_date: datetime
    status: str
    submitted_at: Optional[datetime] = None
    decided_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    notes: Optional[str] = None
    receipt_filename: Optional[str] = None
    receipt_available: bool = False
    receipt_url: Optional[str] = None
    created_at: datetime


class AdminVisibilityItem(VisibilityPaymentView):
    owner_email: Optional[str] = None
    owner_company: Optional[str] = None
    profile_approved: bool = False
    current_visibility_expires_at: Optional[datetime] = None
