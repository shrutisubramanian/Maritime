"""
Subscription API schemas.

Money is exposed as INTEGER PAISE (`price_paise`) plus a 3-letter currency —
never as a float. Formatting (₹1,000/month) is a presentation concern handled by
the client.

Ownership: a subscription/pack/pass belongs to the individual ACCOUNT. An account
may hold SEVERAL packs at once, each with its own passes and their own plan
unused-validity windows — hence the `packs` / `subscriptions` lists.
"""
from datetime import datetime

from pydantic import BaseModel


class SubscriptionPlanInfo(BaseModel):
    code: str                      # MONTHLY | ANNUAL
    name: str
    price_paise: int               # TAXABLE VALUE in paise: ₹1,000 -> 100000
    currency: str
    duration_value: int            # pack validity, e.g. 6 / 12 (MONTH)
    duration_unit: str             # DAY | MONTH | YEAR
    pass_count: int                # 10 | 100
    # GST is charged ON TOP of price_paise, so total_paise is what is payable.
    gst_rate_percent: int = 18
    gst_paise: int = 0
    total_paise: int = 0
    # Nominal days for display; the stamped expiry is calendar-exact.
    pass_validity_days: int = 180


class SubscriptionPlanListResponse(BaseModel):
    plans: list[SubscriptionPlanInfo]


class SubscriptionInfo(BaseModel):
    status: str                    # PENDING | ACTIVE | EXPIRED | CANCELLED
    starts_at: datetime | None = None
    expires_at: datetime | None = None


class PassBalanceInfo(BaseModel):
    total: int
    used: int
    remaining: int


class ActivePassInfo(BaseModel):
    expires_at: datetime
    remaining_seconds: int
    held_by_me: bool = True


class OwnedPackInfo(BaseModel):
    """One pack the account owns. Separate purchases stay separate."""
    pack_id: str
    status: str
    source: str
    plan_code: str | None = None
    plan_name: str | None = None
    subscription_status: str | None = None
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    total: int
    used: int
    remaining: int
    # Nominal validity this pack was sold with (6 / 12 months), when known.
    pass_validity_days: int | None = None
    # Earliest closing unused window among this pack's remaining passes.
    next_pass_expiry: datetime | None = None


class AccountSubscriptionInfo(BaseModel):
    id: str
    status: str | None = None
    plan_code: str | None = None
    plan_name: str | None = None
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    total: int
    remaining: int


class SubscriptionStatusResponse(BaseModel):
    access_control_enabled: bool
    # The account (email) the passes belong to.
    account: str | None = None
    # Company metadata only — NOT an entitlement owner.
    organization: str | None = None
    plan: SubscriptionPlanInfo | None = None
    subscription: SubscriptionInfo | None = None
    subscriptions: list[AccountSubscriptionInfo] = []
    packs: list[OwnedPackInfo] = []
    passes: PassBalanceInfo
    active_pass: ActivePassInfo | None = None
    # Server-stated business rules so the client never hardcodes them. This is
    # the base window for dev-provisioned packs; a paid pack carries its own
    # plan's `pass_validity_days` on `packs[]` (nominal 6 / 12 months).
    # Nominal days for display; the stamped expiry is calendar-exact.
    pass_validity_days: int = 180
    session_hours: int = 6
