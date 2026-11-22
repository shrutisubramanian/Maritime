"""Admin operational overview, account follow-up and procurement oversight.

Everything here is READ ONLY and derived from rows that already exist. There are
no demo numbers and no placeholders: an empty database produces zeros and empty
lists, and any figure that the schema cannot support is simply not returned.

Authorization is enforced per endpoint (``_require_admin``), on the server, so a
vendor or client token is refused even if the URL is guessed.

The four surfaces:

    GET /admin/overview                     dashboard aggregates + activity
    GET /admin/accounts                     onboarding pipeline / follow-up
    GET /admin/procurement/requests         cross-platform request oversight
    GET /admin/procurement/requests/{id}    one request + its quotes (read-only)

Deliberately absent: passwords, reset codes, access/refresh tokens, private file
paths and receipt URLs. Account e-mail is shown because the admin directory
already exposes it for oversight; nothing here widens that.
"""
from datetime import datetime, timedelta
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, exists, func, literal, or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.document import Document
from app.models.moderation_audit import ModerationAuditLog
from app.models.payment import Payment, PaymentStatus
from app.models.payment_audit import PaymentAuditLog
from app.models.profile import Profile, VerificationStatus
from app.models.profile_visibility import ProfileVisibility, ProfileVisibilityStatus
from app.models.quote import Quote, QuoteStatus
from app.models.request import RequestStatus, RequestType, ServiceRequest
from app.models.service import Service
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.supply_listing import SupplyListing
from app.models.user import User, UserRole

router = APIRouter(prefix="/admin", tags=["Admin Overview"])

#: Roles that own a profile / appear in the operational views. Admins are
#: platform staff, never customers, so they are excluded from every count here.
_ACCOUNT_ROLES = (UserRole.client, UserRole.provider, UserRole.supplier)

#: Onboarding stages, in evaluation order. First match wins, so each account is
#: counted exactly once and the stage totals add up to the account total.
ACCOUNT_STAGES = (
    "unverified_email",
    "profile_missing",
    "awaiting_documents",
    "pending_verification",
    "awaiting_payment",
    "no_visibility",
    "complete",
)


def _require_admin(user: User) -> None:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _utcnow() -> datetime:
    return datetime.utcnow()


# --------------------------------------------------------------------- stages
def _active_subscription_exists(now: datetime):
    return exists(
        select(Subscription.id).where(
            Subscription.owner_user_id == User.id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.expires_at.isnot(None),
            Subscription.expires_at > now,
        )
    )


def _active_visibility_exists(now: datetime):
    return exists(
        select(ProfileVisibility.id).where(
            ProfileVisibility.profile_id == Profile.id,
            ProfileVisibility.status == ProfileVisibilityStatus.VERIFIED,
            ProfileVisibility.expires_at.isnot(None),
            ProfileVisibility.expires_at > now,
        )
    )


def _legacy_window_exists(now: datetime):
    """A still-running paid LISTING placement (pre company-first vendors)."""
    return or_(
        exists(
            select(Service.id).where(
                Service.provider_id == User.id,
                Service.is_active.is_(True),
                Service.expires_at.isnot(None),
                Service.expires_at > now,
            )
        ),
        exists(
            select(SupplyListing.id).where(
                SupplyListing.supplier_id == User.id,
                SupplyListing.expires_at.isnot(None),
                SupplyListing.expires_at > now,
            )
        ),
    )


def _documents_exist():
    return exists(select(Document.id).where(Document.user_id == User.id))


def _stage_expression(now: datetime):
    """One CASE: the account's single current onboarding stage.

    A vendor is 'complete' when approved AND paid for visibility (profile plan,
    or a legacy listing window still running). A client is 'complete' when
    approved AND holding an unexpired subscription. Nothing is inferred beyond
    what these tables record.
    """
    client_stage = case(
        (_active_subscription_exists(now), literal("complete")),
        else_=literal("awaiting_payment"),
    )
    vendor_stage = case(
        (or_(_active_visibility_exists(now), _legacy_window_exists(now)), literal("complete")),
        else_=literal("no_visibility"),
    )
    return case(
        (User.is_verified.is_(False), literal("unverified_email")),
        (Profile.id.is_(None), literal("profile_missing")),
        (
            Profile.verification_status == VerificationStatus.verified,
            case((User.role == UserRole.client, client_stage), else_=vendor_stage),
        ),
        (~_documents_exist(), literal("awaiting_documents")),
        else_=literal("pending_verification"),
    )


# ------------------------------------------------------------------- overview
@router.get("/overview", summary="Operational dashboard: real platform aggregates")
def overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    now = _utcnow()
    since_7 = now - timedelta(days=7)
    since_30 = now - timedelta(days=30)

    def _count(query) -> int:
        return int(query.scalar() or 0)

    accounts = db.query(func.count(User.id)).filter(User.role.in_(_ACCOUNT_ROLES))
    role_rows = (
        db.query(User.role, func.count(User.id))
        .filter(User.role.in_(_ACCOUNT_ROLES))
        .group_by(User.role)
        .all()
    )
    by_role = {role.value: int(count) for role, count in role_rows}

    verification_rows = (
        db.query(Profile.verification_status, func.count(Profile.id))
        .join(User, Profile.user_id == User.id)
        .filter(User.role.in_(_ACCOUNT_ROLES))
        .group_by(Profile.verification_status)
        .all()
    )
    verification = {"pending": 0, "verified": 0, "rejected": 0}
    for status, count in verification_rows:
        verification[status.value] = int(count)

    # 14-day registration series, zero-filled so the chart never invents a gap.
    window_start = (now - timedelta(days=13)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (
        db.query(func.date(User.created_at), func.count(User.id))
        .filter(User.role.in_(_ACCOUNT_ROLES), User.created_at >= window_start)
        .group_by(func.date(User.created_at))
        .all()
    )
    per_day = {str(day): int(count) for day, count in rows}
    registrations_series = []
    for offset in range(14):
        day = (window_start + timedelta(days=offset)).date()
        registrations_series.append({"date": day.isoformat(), "count": per_day.get(day.isoformat(), 0)})

    payments_pending = _count(
        db.query(func.count(Payment.id)).filter(Payment.status == PaymentStatus.SUBMITTED)
    )
    payments_verified_30 = _count(
        db.query(func.count(Payment.id)).filter(
            Payment.status == PaymentStatus.VERIFIED,
            Payment.verified_at.isnot(None),
            Payment.verified_at >= since_30,
        )
    )

    visibility_active = _count(
        db.query(func.count(ProfileVisibility.id)).filter(
            ProfileVisibility.status == ProfileVisibilityStatus.VERIFIED,
            ProfileVisibility.expires_at.isnot(None),
            ProfileVisibility.expires_at > now,
        )
    )
    visibility_expired = _count(
        db.query(func.count(ProfileVisibility.id)).filter(
            ProfileVisibility.status == ProfileVisibilityStatus.VERIFIED,
            ProfileVisibility.expires_at.isnot(None),
            ProfileVisibility.expires_at <= now,
        )
    )
    visibility_awaiting = _count(
        db.query(func.count(ProfileVisibility.id)).filter(
            ProfileVisibility.status == ProfileVisibilityStatus.SUBMITTED
        )
    )

    requests_open = _count(
        db.query(func.count(ServiceRequest.id)).filter(ServiceRequest.status == RequestStatus.open)
    )
    quotes_live = _count(
        db.query(func.count(Quote.id)).filter(
            Quote.status.in_([QuoteStatus.submitted, QuoteStatus.under_review])
        )
    )

    # Recent registrations, newest first. Company comes from the profile when
    # one exists; e-mail is the account identity the admin already sees.
    recent_rows = (
        db.query(User, Profile)
        .outerjoin(Profile, Profile.user_id == User.id)
        .filter(User.role.in_(_ACCOUNT_ROLES))
        .order_by(User.created_at.desc())
        .limit(8)
        .all()
    )
    recent_registrations = [
        {
            "user_id": str(user.id),
            "email": user.email,
            "role": user.role.value if user.role else None,
            "company_name": (profile.company_name if profile else None) or "",
            "full_name": user.full_name or "",
            "email_verified": bool(user.is_verified),
            "verification_status": (
                profile.verification_status.value if profile else "no_profile"
            ),
            "created_at": _iso(user.created_at),
        }
        for user, profile in recent_rows
    ]

    # Recent administrative decisions, from the two append-only trails that
    # exist today (payments and listing moderation).
    payment_actions = (
        db.query(PaymentAuditLog)
        .order_by(PaymentAuditLog.created_at.desc())
        .limit(10)
        .all()
    )
    moderation_actions = (
        db.query(ModerationAuditLog)
        .order_by(ModerationAuditLog.created_at.desc())
        .limit(10)
        .all()
    )
    actions = [
        {
            "source": "payment",
            "action": row.action,
            "actor_role": row.actor_role,
            "reason": row.reason,
            "created_at": _iso(row.created_at),
        }
        for row in payment_actions
    ] + [
        {
            # The generic trail now carries account-verification, visibility and
            # listing-fee decisions too, so each row states which queue it came
            # from instead of labelling everything "moderation".
            "source": (
                "verification"
                if row.entity_type in ("profile", "document")
                else "visibility"
                if row.entity_type == "profile_visibility"
                else "listing_fee"
                if row.entity_type == "listing_fee"
                else "moderation"
            ),
            "entity_type": row.entity_type,
            "action": row.action,
            "actor_role": "admin",
            "reason": row.reason,
            "created_at": _iso(row.created_at),
        }
        for row in moderation_actions
    ]
    actions.sort(key=lambda item: item["created_at"] or "", reverse=True)

    return {
        "generated_at": _iso(now),
        "accounts": {
            "total": _count(accounts),
            "clients": by_role.get("client", 0),
            "providers": by_role.get("provider", 0),
            "suppliers": by_role.get("supplier", 0),
            "vendors": by_role.get("provider", 0) + by_role.get("supplier", 0),
            "registered_last_7_days": _count(
                db.query(func.count(User.id)).filter(
                    User.role.in_(_ACCOUNT_ROLES), User.created_at >= since_7
                )
            ),
            "registered_last_30_days": _count(
                db.query(func.count(User.id)).filter(
                    User.role.in_(_ACCOUNT_ROLES), User.created_at >= since_30
                )
            ),
            "registrations_series": registrations_series,
        },
        "verification": verification,
        "payments": {
            "awaiting_review": payments_pending,
            "verified_last_30_days": payments_verified_30,
        },
        "visibility": {
            "active": visibility_active,
            "expired": visibility_expired,
            "awaiting_review": visibility_awaiting,
        },
        "procurement": {
            "requests_total": _count(db.query(func.count(ServiceRequest.id))),
            "requests_open": requests_open,
            "quotes_live": quotes_live,
        },
        "recent_registrations": recent_registrations,
        "recent_admin_actions": actions[:10],
    }


# ------------------------------------------------------------------- accounts
@router.get("/accounts", summary="Accounts by onboarding stage (follow-up)")
def accounts(
    stage: Optional[str] = Query(None, description="One of the onboarding stages"),
    role: Optional[str] = Query(None, description="all | client | vendor | provider | supplier"),
    q: Optional[str] = Query(None, description="Company, contact name or e-mail"),
    created_from: Optional[str] = Query(None, description="ISO date (inclusive)"),
    created_to: Optional[str] = Query(None, description="ISO date (inclusive)"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Who registered, and exactly where each account stopped.

    Stage counts are of the WHOLE account table (so the admin sees the size of
    each problem), while `data` honours every filter. Each account appears in
    exactly one stage, so the counts never double-count.
    """
    _require_admin(current_user)
    now = _utcnow()

    stage_col = _stage_expression(now).label("stage")
    base = (
        db.query(
            User.id.label("user_id"),
            User.email.label("email"),
            User.full_name.label("full_name"),
            User.role.label("role"),
            User.is_verified.label("email_verified"),
            User.created_at.label("created_at"),
            Profile.id.label("profile_id"),
            Profile.company_name.label("company_name"),
            Profile.verification_status.label("verification_status"),
            Profile.country.label("country"),
            stage_col,
        )
        .outerjoin(Profile, Profile.user_id == User.id)
        .filter(User.role.in_(_ACCOUNT_ROLES))
    )

    filtered = base
    wanted_stage = (stage or "").strip().lower()
    if wanted_stage:
        if wanted_stage not in ACCOUNT_STAGES:
            raise HTTPException(
                status_code=400,
                detail="stage must be one of: " + ", ".join(ACCOUNT_STAGES),
            )
        filtered = filtered.filter(stage_col == wanted_stage)

    wanted_role = (role or "").strip().lower()
    if wanted_role and wanted_role != "all":
        role_map = {
            "client": (UserRole.client,),
            "clients": (UserRole.client,),
            "vendor": (UserRole.provider, UserRole.supplier),
            "vendors": (UserRole.provider, UserRole.supplier),
            "provider": (UserRole.provider,),
            "supplier": (UserRole.supplier,),
        }
        scoped = role_map.get(wanted_role)
        if scoped is None:
            raise HTTPException(status_code=400, detail="role must be all, client, vendor, provider or supplier")
        filtered = filtered.filter(User.role.in_(scoped))

    needle = (q or "").strip()
    if needle:
        pattern = f"%{needle.lower()}%"
        filtered = filtered.filter(
            or_(
                func.lower(Profile.company_name).like(pattern),
                func.lower(User.full_name).like(pattern),
                func.lower(User.email).like(pattern),
            )
        )

    def _parse_bound(value: str, label: str) -> datetime:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"{label} must be an ISO date")

    if created_from:
        filtered = filtered.filter(User.created_at >= _parse_bound(created_from, "created_from"))
    if created_to:
        # Inclusive end-of-day so a single-date range behaves as expected.
        end = _parse_bound(created_to, "created_to") + timedelta(days=1)
        filtered = filtered.filter(User.created_at < end)

    total = filtered.count()
    pages = (total + limit - 1) // limit if limit else 1
    rows = (
        filtered.order_by(User.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    stage_counts = {name: 0 for name in ACCOUNT_STAGES}
    for name, count in (
        db.query(stage_col, func.count())
        .select_from(User)
        .outerjoin(Profile, Profile.user_id == User.id)
        .filter(User.role.in_(_ACCOUNT_ROLES))
        .group_by(stage_col)
        .all()
    ):
        stage_counts[name] = int(count)

    data = [
        {
            "user_id": str(row.user_id),
            "profile_id": str(row.profile_id) if row.profile_id else None,
            "email": row.email,
            "full_name": row.full_name or "",
            "role": row.role.value if row.role else None,
            "company_name": row.company_name or "",
            "country": row.country,
            "email_verified": bool(row.email_verified),
            "verification_status": (
                row.verification_status.value if row.verification_status else "no_profile"
            ),
            "stage": row.stage,
            "created_at": _iso(row.created_at),
        }
        for row in rows
    ]

    return {
        "data": data,
        "total": total,
        "page": page,
        "pages": pages,
        "stage_counts": stage_counts,
        "generated_at": _iso(now),
    }


# ---------------------------------------------------------------- procurement
def _client_company_join(query):
    return query.outerjoin(Profile, Profile.user_id == ServiceRequest.client_id)


@router.get("/procurement/requests", summary="All procurement requests (admin oversight)")
def procurement_requests(
    q: Optional[str] = Query(None, description="Request id, title, category, port, company or e-mail"),
    status: Optional[str] = Query(None, description="open | quoted | assigned | awarded | completed | cancelled"),
    request_type: Optional[str] = Query(None, description="service | supply"),
    created_from: Optional[str] = Query(None, description="ISO date (inclusive)"),
    created_to: Optional[str] = Query(None, description="ISO date (inclusive)"),
    sort: str = Query("newest", description="newest | oldest"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read-only oversight of customer requests, with their quote volume.

    Administrators inspect; they never quote, edit or act as the customer. There
    is no write route on this path at all.
    """
    _require_admin(current_user)

    quote_count = (
        db.query(func.count(Quote.id))
        .filter(Quote.request_id == ServiceRequest.id)
        .correlate(ServiceRequest)
        .scalar_subquery()
    )

    query = _client_company_join(
        db.query(ServiceRequest, User, Profile, quote_count.label("quote_count"))
    ).join(User, User.id == ServiceRequest.client_id)

    wanted_status = (status or "").strip().lower()
    if wanted_status:
        try:
            query = query.filter(ServiceRequest.status == RequestStatus(wanted_status))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status")

    wanted_type = (request_type or "").strip().lower()
    if wanted_type:
        try:
            query = query.filter(ServiceRequest.request_type == RequestType(wanted_type))
        except ValueError:
            raise HTTPException(status_code=400, detail="request_type must be service or supply")

    needle = (q or "").strip()
    if needle:
        pattern = f"%{needle.lower()}%"
        # A full UUID is matched exactly; anything else is a text search. The
        # cast keeps SQLite and PostgreSQL behaving the same way.
        conditions = [
            func.lower(ServiceRequest.title).like(pattern),
            func.lower(ServiceRequest.service_type).like(pattern),
            func.lower(ServiceRequest.port).like(pattern),
            func.lower(User.email).like(pattern),
            func.lower(Profile.company_name).like(pattern),
        ]
        try:
            conditions.append(ServiceRequest.id == uuid.UUID(needle))
        except ValueError:
            pass
        query = query.filter(or_(*conditions))

    def _bound(value: str, label: str) -> datetime:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"{label} must be an ISO date")

    if created_from:
        query = query.filter(ServiceRequest.created_at >= _bound(created_from, "created_from"))
    if created_to:
        query = query.filter(
            ServiceRequest.created_at < _bound(created_to, "created_to") + timedelta(days=1)
        )

    total = query.count()
    pages = (total + limit - 1) // limit if limit else 1
    order = (
        ServiceRequest.created_at.asc() if (sort or "").lower() == "oldest"
        else ServiceRequest.created_at.desc()
    )
    rows = query.order_by(order).offset((page - 1) * limit).limit(limit).all()

    data = [
        {
            "request_id": str(request.id),
            "title": request.title,
            "request_type": request.request_type.value,
            "category": request.service_type,
            "subcategory": request.subcategory,
            "port": request.port,
            "vessel_name": request.vessel_name,
            "status": request.status.value,
            "urgency": request.urgency.value,
            "quantity": request.quantity,
            "created_at": _iso(request.created_at),
            "client": {
                "user_id": str(user.id),
                "email": user.email,
                "company_name": (profile.company_name if profile else None) or "",
            },
            "quote_count": int(quote_count_value or 0),
        }
        for request, user, profile, quote_count_value in rows
    ]

    return {"data": data, "total": total, "page": page, "pages": pages}


@router.get("/procurement/requests/{request_id}", summary="One procurement request with its quotes")
def procurement_request_detail(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read-only detail: the request, its client context and quote activity.

    Quote rows carry the provider's company name and the commercial figures the
    provider offered. Attachments, private documents and account credentials are
    not included.
    """
    _require_admin(current_user)

    request = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")

    client = db.query(User).filter(User.id == request.client_id).first()
    client_profile = (
        db.query(Profile).filter(Profile.user_id == request.client_id).first()
        if client is not None
        else None
    )

    quote_rows = (
        db.query(Quote, User, Profile)
        .join(User, User.id == Quote.provider_id)
        .outerjoin(Profile, Profile.user_id == Quote.provider_id)
        .filter(Quote.request_id == request.id)
        .order_by(Quote.created_at.desc())
        .all()
    )

    return {
        "request_id": str(request.id),
        "title": request.title,
        "description": request.description,
        "request_type": request.request_type.value,
        "category": request.service_type,
        "subcategory": request.subcategory,
        "port": request.port,
        "vessel_name": request.vessel_name,
        "vessel_type": request.vessel_type,
        "status": request.status.value,
        "urgency": request.urgency.value,
        "quantity": request.quantity,
        "budget": request.budget,
        "required_completion_date": _iso(request.required_completion_date),
        "created_at": _iso(request.created_at),
        "client": {
            "user_id": str(client.id) if client else None,
            "email": client.email if client else None,
            "company_name": (client_profile.company_name if client_profile else None) or "",
            "country": client_profile.country if client_profile else None,
        },
        "quote_count": len(quote_rows),
        "quotes": [
            {
                "quote_id": str(quote.id),
                "provider": {
                    "user_id": str(provider.id),
                    "company_name": (profile.company_name if profile else None) or provider.full_name or "",
                },
                "amount": float(quote.amount or 0),
                "currency": quote.currency,
                "status": quote.status.value,
                "pricing_model": quote.pricing_model,
                "estimated_duration": quote.estimated_duration,
                "created_at": _iso(quote.created_at),
                "decided_at": _iso(getattr(quote, "provider_accepted_at", None)),
            }
            for quote, provider, profile in quote_rows
        ],
        # Stated explicitly: this endpoint has no write affordance by design.
        "read_only": True,
    }


@router.get("/procurement/summary", summary="Procurement counts for the dashboard")
def procurement_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    by_status = {
        status.value: int(count)
        for status, count in db.query(
            ServiceRequest.status, func.count(ServiceRequest.id)
        ).group_by(ServiceRequest.status).all()
    }
    quotes_by_status = {
        status.value: int(count)
        for status, count in db.query(Quote.status, func.count(Quote.id))
        .group_by(Quote.status)
        .all()
    }
    return {
        "requests_by_status": by_status,
        "quotes_by_status": quotes_by_status,
        "requests_total": sum(by_status.values()),
        "quotes_total": sum(quotes_by_status.values()),
    }
