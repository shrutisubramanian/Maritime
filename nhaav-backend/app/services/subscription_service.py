"""
Subscription / plan lifecycle: the entitlement layer ABOVE individual passes.

Login flow  : AccessTokenService.allocate_for_login -> messaging via this service
Status      : GET /subscription/status               -> get_subscription_status
Provisioning: POST /subscription/dev-provision        -> dev/test/admin only

OWNERSHIP
A subscription belongs to the individual ACCOUNT that purchased it:

    Account (User) -> Subscription -> AccessPack -> AccessToken (pass)

One account may hold SEVERAL subscriptions/packs at once — a second purchase
adds a new pack and never overwrites, extends, merges or cancels the earlier
one. Each pack and each pass keeps its own lifecycle and expiry.

`Organization` is recorded on a subscription as optional business/company
metadata; it is never used to decide who may use a pass.

Concepts kept deliberately separate:

  * The SUBSCRIPTION is the PURCHASE RECORD: what was bought and which billing
    period it covers. Plan changes/upgrades require explicit admin approval
    (the bank-transfer review), never an automatic switch.
  * The PASSES (AccessToken rows) are the actual entitlement. Each pass grants
    one 6-hour session and has its own unused-validity window (6 or 12 months), counted
    from when it was issued. Unused passes therefore carry forward, but only
    until their own window closes — never indefinitely.

Deliberately NOT implemented (undecided business rules, see the report): annual
carry-forward beyond the per-pass window, proration, refunds, and
conversion of remaining passes during a plan change.

MONEY: plans are priced in INTEGER PAISE (₹1,000 -> 100000). No floating point.

Idempotency: activating the same subscription twice issues exactly ONE pack.
Guarded twice — a service-level lookup plus a UNIQUE index on
access_packs.subscription_id (multiple NULLs allowed, so legacy packs are
unaffected).
"""
import calendar
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.access_token import (
    AccessPack,
    AccessPackStatus,
    AccessToken,
    AccessTokenStatus,
    Organization,
)
from app.models.subscription import (
    BillingPeriod,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.models.user import User, UserRole
from app.utils.timezone import as_utc

# ---------------------------------------------------------------------------
# Plan catalogue — the SINGLE place the approved figures appear.
# Nothing in business logic hardcodes 10 / 100 / 1000 / 10000.
# ---------------------------------------------------------------------------
MONTHLY_CODE = "MONTHLY"
ANNUAL_CODE = "ANNUAL"

# `price_paise` is the TAXABLE VALUE — GST is added on top at checkout (see
# plan_pricing). `duration_value`/`duration_unit` are the PACK VALIDITY: how long
# the purchased passes may be used before they expire.
PLAN_DEFINITIONS: tuple[dict, ...] = (
    {
        "code": MONTHLY_CODE,
        "name": "Nhaav Monthly",
        "price_paise": 100_000,          # ₹1,000.00 + GST
        "currency": "INR",
        # 10 passes stay usable for SIX CALENDAR MONTHS from issuance.
        "duration_value": 6,
        "duration_unit": BillingPeriod.MONTH,
        "pass_count": 10,
    },
    {
        "code": ANNUAL_CODE,
        "name": "Nhaav Annual",
        "price_paise": 1_000_000,        # ₹10,000.00 + GST
        "currency": "INR",
        # 100 passes stay usable for TWELVE CALENDAR MONTHS from issuance.
        "duration_value": 12,
        "duration_unit": BillingPeriod.MONTH,
        "pass_count": 100,
    },
)


def plan_validity_days(plan: SubscriptionPlan) -> int:
    """NOMINAL day count for display summaries of the plan's pass window.

    The authoritative expiry is calendar-based (`plan_pass_expiry`): 6 months is
    181/182/184 days depending on the start date, not a fixed 180. This helper
    exists only for fields such as `pass_validity_days` on payment summaries that
    must show a number; use the stamped per-pass `unused_expires_at` for
    decisions.
    """
    if plan.duration_unit == BillingPeriod.DAY:
        return int(plan.duration_value)
    if plan.duration_unit == BillingPeriod.MONTH:
        return int(plan.duration_value) * 30
    return int(plan.duration_value) * 365


def plan_pricing(plan: SubscriptionPlan) -> dict:
    """Base price, GST and the total actually payable, all in integer paise.

    GST is charged ON TOP of the listed price: ₹1,000 -> ₹1,180, ₹10,000 ->
    ₹11,800 at 18%. Rounding is done once, on the tax, so base + tax always
    equals the total exactly (no floating point anywhere).
    """
    rate = int(getattr(settings, "GST_RATE_PERCENT", 18))
    base = int(plan.price_paise)
    gst = (base * rate + 50) // 100          # half-up on paise
    return {
        "price_paise": base,
        "gst_rate_percent": rate,
        "gst_paise": gst,
        "total_paise": base + gst,
        "currency": plan.currency,
    }


def plan_total_paise(plan: SubscriptionPlan) -> int:
    """The amount to charge for this plan, GST included."""
    return plan_pricing(plan)["total_paise"]

_EXPIRED_NO_PASSES_MESSAGE = (
    "Your Nhaav subscription has expired and no unused access passes remain. "
    "Please renew your subscription to start a new session."
)


def plan_pass_expiry(now: datetime, plan: SubscriptionPlan) -> datetime:
    """Exact calendar expiry for a pass bought under `plan`.

    6 MONTH from 15 Aug is 15 Feb (clamped for short months); 12 MONTH handles
    leap years. Passes are stamped with this instant, so "6 months" and
    "12 months" mean exactly that rather than 180/360 days.
    """
    return add_duration(now, plan.duration_value, plan.duration_unit)


def add_duration(start: datetime, value: int, unit: BillingPeriod) -> datetime:
    """
    Calendar-correct duration arithmetic (no dateutil dependency):

      6 MONTH from Jan 15 -> Jul 15 (calendar months, clamped for short months)
      1 MONTH from Jan 15 -> Feb 15; Jan 31 -> Feb 28/29 (clamped)
      1 YEAR  from Feb 29 -> Feb 28 (clamped)
    """
    if unit == BillingPeriod.DAY:
        return start + timedelta(days=value)

    if unit == BillingPeriod.YEAR:
        try:
            return start.replace(year=start.year + value)
        except ValueError:  # Feb 29 in a non-leap target year
            return start.replace(year=start.year + value, month=2, day=28)

    month_index = (start.month - 1) + value
    year = start.year + month_index // 12
    month = (month_index % 12) + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return start.replace(year=year, month=month, day=day)


class SubscriptionService:
    # -------------------------------------------------- company metadata only
    @staticmethod
    def _resolve_organization(db: Session, user: User) -> Organization | None:
        """The user's COMPANY, for record-keeping only — not an owner."""
        from app.services.access_token_service import AccessTokenService

        return AccessTokenService._resolve_organization(db, user)

    # ---------------------------------------------------------------- plans
    @staticmethod
    def seed_plans(db: Session) -> list[SubscriptionPlan]:
        """
        Idempotently upsert the approved plan catalogue. Safe to call on every
        startup and in tests; existing rows are reconciled, never duplicated.
        """
        plans: list[SubscriptionPlan] = []
        for definition in PLAN_DEFINITIONS:
            plan = (
                db.query(SubscriptionPlan)
                .filter(SubscriptionPlan.code == definition["code"])
                .first()
            )
            if plan is None:
                plan = SubscriptionPlan(**definition)
                db.add(plan)
            else:
                for field, value in definition.items():
                    setattr(plan, field, value)
                plan.active = True
            plans.append(plan)
        db.commit()
        for plan in plans:
            db.refresh(plan)
        return plans

    @staticmethod
    def list_plans(db: Session, only_active: bool = True) -> list[SubscriptionPlan]:
        SubscriptionService.seed_plans(db)  # ensure the catalogue exists
        query = db.query(SubscriptionPlan)
        if only_active:
            query = query.filter(SubscriptionPlan.active.is_(True))
        return query.order_by(SubscriptionPlan.price_paise).all()

    @staticmethod
    def get_plan(db: Session, code: str) -> SubscriptionPlan:
        SubscriptionService.seed_plans(db)
        plan = (
            db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.code == code.strip().upper())
            .first()
        )
        if plan is None:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"Unknown subscription plan '{code}'.",
            )
        return plan

    # -------------------------------------------------------- subscriptions
    @staticmethod
    def create_subscription(
        db: Session, owner: User, plan_code: str, commit: bool = True
    ) -> Subscription:
        """
        Create a PENDING subscription OWNED BY `owner`. Creating one deliberately
        grants nothing: no clock, no passes, no gate change. Only activation
        (after an admin-approved payment) or dev/test provisioning does that.

        `commit=False` lets a caller include creation in a wider transaction
        (payment submission) so a later failure does not leave a stray
        subscription behind.
        """
        plan = SubscriptionService.get_plan(db, plan_code)
        organization = SubscriptionService._resolve_organization(db, owner)
        subscription = Subscription(
            owner_user_id=owner.id,
            organization_id=organization.id if organization is not None else None,
            plan_id=plan.id,
            status=SubscriptionStatus.PENDING,
        )
        db.add(subscription)
        if commit:
            db.commit()
            db.refresh(subscription)
        else:
            db.flush()
        return subscription

    @staticmethod
    def activate_subscription(
        db: Session,
        subscription: Subscription,
        source: str = "dev",
        now: datetime | None = None,
        commit: bool = True,
    ) -> AccessPack:
        """
        Activate a subscription: stamp the clock, issue ONE access pack of the
        plan's pass_count OWNED BY the subscription's owner, and open that
        ACCOUNT's entitlement gate.

        Every pass in the pack is stamped with its own plan unused-validity
        window starting now.

        Idempotent: processing the same activation twice returns the existing
        pack and creates no duplicate passes.

        `commit=False` lets a caller (payment approval) include this activation
        in a SINGLE wider transaction so a failure anywhere rolls the whole
        activation back instead of leaving a partially activated subscription.
        """
        from app.services.access_token_service import AccessTokenService

        now = now or datetime.utcnow()

        existing = (
            db.query(AccessPack)
            .filter(AccessPack.subscription_id == subscription.id)
            .first()
        )
        if existing is not None:
            return existing  # already activated — nothing to duplicate

        plan = subscription.plan or (
            db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.id == subscription.plan_id)
            .first()
        )
        if plan is None:
            raise ValueError("Subscription has no resolvable plan; cannot activate.")

        owner = subscription.owner_user_id
        if owner is None:
            raise ValueError(
                "Subscription has no owning account; refusing to issue passes "
                "that nobody could use. Assign an owner explicitly first."
            )

        subscription.status = SubscriptionStatus.ACTIVE
        subscription.starts_at = now
        subscription.expires_at = add_duration(now, plan.duration_value, plan.duration_unit)

        organization = (
            db.query(Organization)
            .filter(Organization.id == subscription.organization_id).first()
            if subscription.organization_id
            else None
        )
        owner_user = db.query(User).filter(User.id == owner).first()

        pack = AccessPack(
            owner_user_id=owner,
            organization_id=organization.id if organization is not None else None,
            subscription_id=subscription.id,
            token_count=plan.pass_count,          # 10 / 100 come from the plan row
            status=AccessPackStatus.ACTIVE,
            source=source,
        )
        db.add(pack)
        db.flush()

        # Every pass in the pack expires with the pack: 6 months for the 10-pass
        # plan, 12 months for the 100-pass plan. The window is stamped per pass at
        # issuance (calendar-exact), so a later pack never extends an earlier one.
        pass_expiry = plan_pass_expiry(now, plan)
        db.add_all(
            [
                AccessTokenService._new_pass(
                    pack, owner, organization, now, unused_expires_at=pass_expiry
                )
                for _ in range(plan.pass_count)
            ]
        )

        if owner_user is not None:
            owner_user.access_control_enabled = True

        if commit:
            db.commit()
            db.refresh(pack)
        else:
            db.flush()  # caller owns the transaction
        return pack

    # ------------------------------------------------------------- expiry
    @staticmethod
    def expire_due_subscriptions(db: Session, owner: User, now: datetime) -> int:
        """
        Lazy sweep (no background worker needed): the account's ACTIVE
        subscriptions whose expires_at has passed become EXPIRED and their packs
        become EXPIRED.

        Deliberately does NOT touch individual passes: an already-active 6-hour
        session keeps working until its own expiry, and an UNUSED pass keeps its
        own stamped window (carry-forward). Pass usability is decided by the pass
        window, never by this sweep.
        """
        due = (
            db.query(Subscription)
            .filter(
                Subscription.owner_user_id == owner.id,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.expires_at.isnot(None),
                Subscription.expires_at <= now,
            )
            .all()
        )
        if not due:
            return 0

        for subscription in due:
            subscription.status = SubscriptionStatus.EXPIRED
            db.query(AccessPack).filter(
                AccessPack.subscription_id == subscription.id
            ).update({"status": AccessPackStatus.EXPIRED}, synchronize_session=False)
        db.commit()
        return len(due)

    # ------------------------------------------------------- gate helpers
    @staticmethod
    def latest_subscription(db: Session, owner: User) -> Subscription | None:
        return (
            db.query(Subscription)
            .filter(Subscription.owner_user_id == owner.id)
            .order_by(Subscription.created_at.desc())
            .first()
        )

    @staticmethod
    def subscription_block_message(
        db: Session, owner: User, now: datetime
    ) -> str | None:
        """
        Why this ACCOUNT cannot start a NEW session right now, or None when it
        can. Called only after the pass checks have already failed, so the
        answer explains the most likely reason (never activated vs cancelled vs
        lapsed with nothing left).
        """
        if db.query(Subscription.id).filter(Subscription.owner_user_id == owner.id).first() is None:
            return (
                "No Nhaav subscription is active for your account. "
                "Choose a plan to start using Nhaav."
            )

        latest = SubscriptionService.latest_subscription(db, owner)
        status = latest.status if latest is not None else None
        if status == SubscriptionStatus.PENDING:
            return (
                "Your Nhaav subscription is pending activation. "
                "Please complete payment to start using Nhaav."
            )
        if status == SubscriptionStatus.CANCELLED:
            return (
                "Your Nhaav subscription has been cancelled. "
                "Please subscribe again to continue using Nhaav."
            )
        return _EXPIRED_NO_PASSES_MESSAGE

    @staticmethod
    def get_effective_subscription(
        db: Session, owner: User, now: datetime
    ) -> Subscription | None:
        """The account's ACTIVE unexpired subscription if any, else the latest."""
        active = (
            db.query(Subscription)
            .filter(
                Subscription.owner_user_id == owner.id,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.expires_at.isnot(None),
                Subscription.expires_at > now,
            )
            .order_by(Subscription.created_at.desc())
            .first()
        )
        if active is not None:
            return active
        return SubscriptionService.latest_subscription(db, owner)

    # --------------------------------------------------------------- status
    @staticmethod
    def _pack_payload(
        db: Session, pack: AccessPack, now: datetime
    ) -> dict:
        """Per-pack pass balance + the earliest closing unused window."""
        tokens = db.query(AccessToken).filter(AccessToken.pack_id == pack.id).all()
        available = [t for t in tokens if t.status == AccessTokenStatus.available]
        subscription = (
            db.query(Subscription).filter(Subscription.id == pack.subscription_id).first()
            if pack.subscription_id
            else None
        )
        plan = subscription.plan if subscription is not None else None

        # This pack's own validity (6 months for the 10-pass plan, 12 months for
        # the 100-pass plan). Taken from the passes themselves where possible, so
        # a historical pack keeps reporting the window it was actually sold with
        # even after the plan catalogue changes.
        validity_days = None
        issued = [t for t in tokens if t.available_at is not None and t.unused_expires_at is not None]
        if issued:
            first = min(issued, key=lambda t: t.available_at)
            validity_days = max(0, (first.unused_expires_at - first.available_at).days)
        elif plan is not None:
            validity_days = plan_validity_days(plan)

        return {
            "pack_id": str(pack.id),
            "status": pack.status.value,
            "source": pack.source,
            "plan_code": plan.code if plan is not None else None,
            "plan_name": plan.name if plan is not None else None,
            "subscription_status": subscription.status.value if subscription is not None else None,
            "starts_at": subscription.starts_at if subscription is not None else None,
            "expires_at": subscription.expires_at if subscription is not None else None,
            "total": len(tokens),
            "used": len(tokens) - len(available),
            "remaining": len(available),
            "pass_validity_days": validity_days,
            "next_pass_expiry": min(
                (t.unused_expires_at for t in available if t.unused_expires_at is not None),
                default=None,
            ),
        }

    @staticmethod
    def get_subscription_status(db: Session, user: User) -> dict:
        """
        Plan, subscription state and pass balance for the calling ACCOUNT only.

        Aggregates EVERY pack the account owns (an account may hold several from
        separate purchases) and also reports them individually, because each
        pack's passes carry their own plan expiry.
        """
        from app.services.access_token_service import (
            AccessTokenService,
            PASS_UNUSED_VALIDITY_DAYS,
            SESSION_DURATION_HOURS,
        )

        empty_passes = {"total": 0, "used": 0, "remaining": 0}

        if not AccessTokenService.is_gated(user):
            return {
                "access_control_enabled": False,
                "account": user.email,
                "organization": None,
                "plan": None,
                "subscription": None,
                "subscriptions": [],
                "packs": [],
                "passes": empty_passes,
                "active_pass": None,
                "pass_validity_days": PASS_UNUSED_VALIDITY_DAYS,
                "session_hours": SESSION_DURATION_HOURS,
            }

        now = datetime.utcnow()
        SubscriptionService.expire_due_subscriptions(db, user, now)
        AccessTokenService._consume_expired(db, user, now)
        AccessTokenService._expire_unused(db, user, now)

        organization = SubscriptionService._resolve_organization(db, user)
        subscription = SubscriptionService.get_effective_subscription(db, user, now)

        plan_payload = None
        subscription_payload = None
        if subscription is not None:
            plan = subscription.plan
            if plan is not None:
                plan_payload = {
                    "code": plan.code,
                    "name": plan.name,
                    "price_paise": plan.price_paise,
                    "currency": plan.currency,
                    "duration_value": plan.duration_value,
                    "duration_unit": plan.duration_unit.value,
                    "pass_count": plan.pass_count,
                    **{
                        k: v
                        for k, v in plan_pricing(plan).items()
                        if k in ("gst_rate_percent", "gst_paise", "total_paise")
                    },
                    "pass_validity_days": plan_validity_days(plan),
                }
            subscription_payload = {
                "status": subscription.status.value,
                "starts_at": subscription.starts_at,
                "expires_at": subscription.expires_at,
            }

        # Every pack the ACCOUNT owns. An account may hold several: a later
        # purchase adds a pack, it never replaces an earlier one.
        owned_packs = (
            db.query(AccessPack)
            .filter(AccessPack.owner_user_id == user.id)
            .order_by(AccessPack.created_at)
            .all()
        )
        packs = [SubscriptionService._pack_payload(db, pack, now) for pack in owned_packs]

        totals = {
            "total": sum(p["total"] for p in packs),
            "used": sum(p["used"] for p in packs),
            "remaining": sum(p["remaining"] for p in packs),
        }

        subscriptions_payload = [
            {
                "id": p["pack_id"],
                "status": p["subscription_status"],
                "plan_code": p["plan_code"],
                "plan_name": p["plan_name"],
                "starts_at": p["starts_at"],
                "expires_at": p["expires_at"],
                "remaining": p["remaining"],
                "total": p["total"],
            }
            for p in packs
        ]

        # The caller's own current session, if any. Reported regardless of the
        # subscription clock so an in-flight session stays visible.
        active_pass = None
        active_token = (
            db.query(AccessToken)
            .filter(
                AccessToken.owner_user_id == user.id,
                AccessToken.status == AccessTokenStatus.active,
            )
            .order_by(AccessToken.activated_at.desc())
            .first()
        )
        if active_token is not None and active_token.expires_at is not None:
            active_pass = {
                "expires_at": active_token.expires_at,
                "remaining_seconds": max(
                    0, int((as_utc(active_token.expires_at) - as_utc(now)).total_seconds())
                ),
                "held_by_me": True,
            }

        return {
            "access_control_enabled": True,
            "account": user.email,
            "organization": organization.name if organization is not None else None,
            "plan": plan_payload,
            "subscription": subscription_payload,
            "subscriptions": subscriptions_payload,
            "packs": packs,
            "passes": totals,
            "active_pass": active_pass,
            # The CURRENT plan's window (6 months for 10 passes, 12 for 100),
            # not a single global number. Falls back to the dev-provisioning
            # default when the account holds no plan.
            "pass_validity_days": (
                plan_validity_days(subscription.plan)
                if subscription is not None and subscription.plan is not None
                else PASS_UNUSED_VALIDITY_DAYS
            ),
            "session_hours": SESSION_DURATION_HOURS,
        }
