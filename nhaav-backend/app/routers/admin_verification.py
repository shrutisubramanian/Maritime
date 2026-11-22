"""
Admin verification API — the surface the admin panel
(`nhaav-frontend/src/services/adminVerification.ts`) already expects.

This router adds NO new verification logic. It is a thin, admin-only HTTP
front for the ONE authoritative path:

  * profiles  -> ProfileService.verify_profile / reject_profile / mark_under_review
  * documents -> DocumentService.verify_document / reject_document

Authorization reuses the existing pattern (admin_moderation / admin_payments):
`get_current_user` + an explicit `User.role == admin` check, so anonymous
callers get 401 and non-admin users get 403 on every endpoint.
"""
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import false, func, or_
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.document import Document, DocumentStatus, DocumentType
from app.models.moderation_audit import ModerationAuditLog
from app.models.payment import Payment, PaymentStatus
from app.models.profile import Profile, VerificationStatus
from app.models.subscription import (
    BillingPeriod,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.models.user import User, UserRole
from app.services.access_token_service import AccessTokenService
from app.services.document_service import DocumentService
from app.services.onboarding_service import OnboardingService
from app.services.payment_service import PaymentService
from app.services.profile_service import ProfileService
from app.services.subscription_service import SubscriptionService

router = APIRouter(prefix="/admin/verification", tags=["Admin Verification"])

# EVERY account is subject to marketplace verification. The onboarding gate
# (app/services/onboarding_service.py) requires an admin-approved profile plus
# an active subscription before the marketplace opens, and that applies to
# clients buying services exactly as much as to providers selling them — a
# client whose documents nobody could review would be locked out permanently.
# Admins are excluded: they operate this queue and need no verification.
_VERIFIABLE_ROLES = (UserRole.client, UserRole.provider, UserRole.supplier)

_DOCUMENT_TYPE_LABELS = {
    DocumentType.cdc.value: "Continuous Discharge Certificate",
    DocumentType.coc.value: "Certificate of Competency",
    DocumentType.surveyor_license.value: "Surveyor License",
    DocumentType.vendor_registration.value: "Vendor Registration",
    DocumentType.kyc_due_diligence.value: "KYC Due Diligence",
    DocumentType.form_10f.value: "Form 10F",
    DocumentType.no_pe_declaration.value: "No PE Declaration",
    DocumentType.tax_invoice.value: "Tax Invoice",
    DocumentType.other.value: "General document",
}


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return current_user


class ProviderActionRequest(BaseModel):
    action: str
    reason: Optional[str] = None


class DocumentActionRequest(BaseModel):
    action: str
    reason: Optional[str] = None


class GrantPassesRequest(BaseModel):
    """A hand-issued pack, plus the justification a no-payment grant requires.

    The pack size stays fixed by ``PASS_GIFTS``; ``reason`` and
    ``confirm_no_payment`` exist so a manual issue can never looked like a
    normal payment approval and is always attributable in the audit trail.
    """
    pack: str
    reason: Optional[str] = None
    confirm_no_payment: bool = False


#: The two packs an admin may grant by hand. Size and unused-validity are FIXED
#: HERE on the server so the admin panel cannot ask for an arbitrary pack and a
#: crafted request cannot mint one either: 10 passes last SIX MONTHS, 100 last
#: TWELVE MONTHS — the same windows a purchase gets.
PASS_GIFTS: dict[str, dict] = {
    "10": {"passes": 10, "validity_months": 6, "plan_code": "MONTHLY"},
    "100": {"passes": 100, "validity_months": 12, "plan_code": "ANNUAL"},
}


# ----------------------------------------------------------------- serializers
def _document_item(doc: Document) -> dict:
    return {
        "id": str(doc.id),
        "document_type": doc.document_type.value,
        "document_type_label": _DOCUMENT_TYPE_LABELS.get(
            doc.document_type.value, doc.document_type.value
        ),
        "name": doc.name,
        "upload_date": doc.created_at.date().isoformat() if doc.created_at else None,
        "ocr_status": doc.source,
        "verification_score": doc.verification_score,
        "verification_status": doc.verification_status.value,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "reviewed_at": doc.verified_at.isoformat() if doc.verified_at else None,
        "reviewer_id": str(doc.verified_by) if doc.verified_by else None,
        "ocr_extracted_data": doc.ocr_extracted_data,
    }


def _document_status_counts(db: Session) -> dict[str, int]:
    counts = {item.value: 0 for item in DocumentStatus}
    rows = (
        db.query(Document.verification_status, func.count(Document.id))
        .group_by(Document.verification_status)
        .all()
    )
    for value, count in rows:
        key = value.value if hasattr(value, "value") else str(value)
        counts[key] = count
    return counts


def _admin_document_item(doc: Document) -> dict:
    """A document plus the account that sent it, for the admin register."""
    item = _document_item(doc)
    user = doc.user
    profile = user.profile if user else None
    item["uploader"] = {
        "user_id": str(user.id) if user else None,
        "full_name": user.full_name if user else None,
        "email": user.email if user else None,
        "role": user.role.value if user and user.role else None,
        "company_name": profile.company_name if profile else None,
    }
    item["profile_id"] = str(profile.id) if profile else None
    return item


def _documents_for(db: Session, profile: Profile) -> list[Document]:
    return (
        db.query(Document)
        .filter(Document.user_id == profile.user_id)
        .order_by(Document.created_at)
        .all()
    )


def _documents_for_many(db: Session, user_ids: list[uuid.UUID]) -> dict:
    """All documents for a whole page of accounts, in ONE query.

    The queue used to call `_documents_for` per profile, so rendering a page of
    20 cost 20 extra round-trips and the cost grew with the number of accounts,
    not with the page size (measured: ~2 statements per row). Keyed by user_id;
    accounts with no documents get no entry and no invented empty list.
    """
    grouped: dict = {}
    if not user_ids:
        return grouped
    rows = (
        db.query(Document)
        .filter(Document.user_id.in_(user_ids))
        .order_by(Document.created_at)
        .all()
    )
    for doc in rows:
        grouped.setdefault(doc.user_id, []).append(doc)
    return grouped


# Sentinel: "the caller did not preload payments", which is different from
# "the account has no submitted payment" (None).
_UNSET = object()


def _payment_item(payment: Payment) -> dict:
    """The bank-transfer context a reviewer needs to make a decision."""
    return {
        "id": str(payment.id),
        "plan_code": payment.plan.code if payment.plan else None,
        "plan_name": payment.plan.name if payment.plan else None,
        "amount_paise": payment.amount_paise,
        "currency": payment.currency,
        "utr": payment.utr,
        "payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
        "submitted_at": payment.submitted_at.isoformat() if payment.submitted_at else None,
        "receipt_available": bool(payment.receipt_path),
        "receipt_url": f"/payments/{payment.id}/receipt",
    }


def _pending_payment_for(db: Session, user_id: uuid.UUID) -> Optional[Payment]:
    """The account's newest SUBMITTED bank transfer, if one is waiting."""
    return (
        db.query(Payment)
        .filter(
            Payment.owner_user_id == user_id,
            Payment.status == PaymentStatus.SUBMITTED,
        )
        .order_by(Payment.submitted_at.desc())
        .first()
    )


def _pending_payments_for_many(db: Session, user_ids: list[uuid.UUID]) -> dict:
    """Newest SUBMITTED payment per account in ONE query (ascending => last wins)."""
    latest: dict = {}
    if not user_ids:
        return latest
    rows = (
        db.query(Payment)
        .filter(
            Payment.owner_user_id.in_(user_ids),
            Payment.status == PaymentStatus.SUBMITTED,
        )
        .order_by(Payment.submitted_at.asc())
        .all()
    )
    for row in rows:
        latest[row.owner_user_id] = row
    return latest


def _field_completeness(docs: list[Document]) -> Optional[int]:
    """H7 semantics: field COMPLETENESS average over the account's documents."""
    scores = [d.verification_score for d in docs if d.verification_score is not None]
    if not scores:
        return None
    return int(round(sum(scores) / len(scores)))


def _approval_blockers(role: Optional[str], documents_submitted: bool, payment: Optional[Payment]) -> list[str]:
    """Why an account is not approvable yet.

    CLIENT RULE: a client is approved only once its paperwork is in AND a
    bank-transfer payment is awaiting verification — approving also issues the
    purchased access passes, so approving without the money would hand out
    passes for free.

    VENDOR RULE: suppliers and service providers hold no passes and pay per
    listing (₹1,000 for a month of showcase, ₹10,000 for a year), so their
    account approval is document-only. Their money is verified in the listing-fee
    queue, where the admin also picks the showcase period.

    Admin accounts are not part of the verification queue at all (see
    ``_VERIFIABLE_ROLES``).
    """
    blockers: list[str] = []
    if not documents_submitted:
        blockers.append("documents_required")
    if role == UserRole.client.value and payment is None:
        blockers.append("payment_required")
    return blockers


def _role_scope(role: Optional[str]) -> Optional[tuple[UserRole, ...]]:
    """
    Translate the admin panel's section selector into the roles it covers.

    The console has two approval queues — clients and vendors (suppliers +
    service providers) — so the list/stats endpoints accept one ``role`` value
    instead of making each section page through the other's rows.

    ``None``/unknown means "every verifiable role", so an older client that
    never sends the parameter keeps working exactly as before.
    """
    wanted = (role or "").strip().lower()
    if wanted in ("client", "clients", "buyer", "buyers"):
        return (UserRole.client,)
    if wanted in ("vendor", "vendors", "supplier", "suppliers", "provider", "providers"):
        return (UserRole.supplier, UserRole.provider)
    return None


def _review_summary(db: Session, profile: Profile) -> dict:
    """Who decided what, and when — read from the append-only audit trail.

    The profile metadata carries the same stamps for convenience, but the audit
    rows are authoritative and keep the whole history, so a reviewer can see
    that an account was rejected earlier and what changed since.
    """
    rows = (
        db.query(ModerationAuditLog)
        .filter(
            ModerationAuditLog.entity_type == "profile",
            ModerationAuditLog.entity_id == profile.id,
        )
        .order_by(ModerationAuditLog.created_at.desc())
        .limit(20)
        .all()
    )
    admin_ids = {row.admin_id for row in rows if row.admin_id is not None}
    reviewers = (
        {user.id: user for user in db.query(User).filter(User.id.in_(admin_ids)).all()}
        if admin_ids
        else {}
    )
    meta = profile.profile_metadata or {}
    latest = rows[0] if rows else None
    latest_admin = (
        reviewers.get(latest.admin_id)
        if latest is not None and latest.admin_id is not None
        else None
    )

    def _name(admin_id) -> Optional[str]:
        reviewer = reviewers.get(admin_id) if admin_id is not None else None
        if reviewer is None:
            return None
        return reviewer.full_name or reviewer.email

    return {
        "review_history": [
            {
                "action": row.action,
                "reason": row.reason,
                "reviewed_at": row.created_at.isoformat() if row.created_at else None,
                "reviewer": _name(row.admin_id),
            }
            for row in rows
        ],
        "last_reviewed_at": (
            latest.created_at.isoformat()
            if latest is not None and latest.created_at
            else meta.get("verification_decided_at")
        ),
        "last_reviewed_by": (
            (latest_admin.full_name or latest_admin.email)
            if latest_admin is not None
            else None
        ),
        "review_note": meta.get("verification_reason"),
        "decision_state": meta.get("verification_state")
        or profile.verification_status.value,
    }


def _provider_item(
    db: Session,
    profile: Profile,
    detail: bool = False,
    docs: Optional[list[Document]] = None,
    payment: object = _UNSET,
) -> dict:
    """Serialize one queue row.

    `docs` and `payment` let a caller that already batch-loaded them for a page
    pass them in, so listing N accounts stays at a constant number of queries.
    """
    user = profile.user
    if docs is None:
        docs = _documents_for(db, profile)
    if payment is _UNSET:
        payment = _pending_payment_for(db, profile.user_id)
    meta = profile.profile_metadata or {}
    offices = profile.offices or []
    country = meta.get("country") or ""
    completeness = _field_completeness(docs)
    role = user.role.value if user and user.role else None
    documents_submitted = len(docs) > 0
    blockers = _approval_blockers(role, documents_submitted, payment)

    item = {
        "id": str(profile.id),
        "user_id": str(profile.user_id),
        # The queue covers every account type, so the item states which one this
        # is rather than assuming "provider".
        "role": role,
        "company_name": profile.company_name or (user.full_name if user else None) or "",
        "full_name": (user.full_name if user else None) or "",
        "email": user.email if user else "",
        "phone": (user.phone if user else None) or "",
        "position": profile.position,
        "years_experience": profile.years_experience or 0,
        "verification_status": profile.verification_status.value,
        "location": offices[0] if offices else country,
        "flag": "",
        "verification_score": completeness,
        # H9 honesty: a provider with no scored documents gets no score and no
        # scale — never an invented 100/85. The frontend types max_score as
        # number | null and renders a "no score" state.
        "max_score": 100 if completeness is not None else None,
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
        "submission_date": (
            profile.created_at.date().isoformat() if profile.created_at else None
        ),
        "risk_indicator": None,
        "risk_level": None,
        "documents_count": len(docs),
        "documents_submitted": documents_submitted,
        "documents": [_document_item(d) for d in docs],
        # Payment + readiness: the admin dashboard shows who paid AND submitted
        # paperwork, so approving can issue the right number of passes.
        "payment": _payment_item(payment) if payment is not None else None,
        "approval_blockers": blockers,
        "ready_for_approval": not blockers,
    }

    if detail:
        item.update(_review_summary(db, profile))
        item.update({
            "country": country,
            "badge_label": profile.badge_label,
            "ocr_confidence": completeness,
            "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
            "offices": offices,
            # Head office is what places the company under a marketplace port
            # filter; the other ports are profile information only. The admin
            # sees both, plus the vendor's brochure filename (the file itself is
            # served through the marketplace endpoint, never here).
            "head_office": profile.head_office,
            "ports_served": profile.ports_served or [],
            "brochure_filename": profile.brochure_filename,
            "services": [
                {
                    "id": str(s.id),
                    "name": s.name,
                    "category": getattr(s, "category", None),
                    "subcategory": getattr(s, "subcategory", None),
                    "is_active": s.is_active,
                }
                for s in (profile.services or [])
            ],
            "certifications": profile.licenses or [],
            "availability_status": (
                profile.availability_status.value
                if profile.availability_status
                else None
            ),
            "registration_info": {
                "registration_number": meta.get("registration_number"),
                "tax_id": meta.get("tax_id"),
                "expiry_date": meta.get("expiry_date"),
            },
            # OCR-vs-profile comparison is not fabricated here; the panel renders
            # an explicit "no extracted fields" state when this is empty.
            "ocr_comparisons": [],
        })

    return item


# --------------------------------------------------------------------- endpoints
@router.get("/stats", summary="Verification queue counts")
def verification_stats(
    role: Optional[str] = Query(
        None,
        description="Section scope: client (buyers) or vendor (suppliers + service providers)",
    ),
    db: Session = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    # One console, two queues: clients and vendors each get their own counts.
    scoped_roles = _role_scope(role) or _VERIFIABLE_ROLES

    # Grouped in SQL: the counts never need the rows themselves, so the badge
    # numbers stay flat as the account table grows.
    rows = (
        db.query(Profile.verification_status, func.count(Profile.id))
        .join(User, Profile.user_id == User.id)
        .filter(User.role.in_(scoped_roles))
        .group_by(Profile.verification_status)
        .all()
    )
    counts = {"pending": 0, "under_review": 0, "approved": 0, "rejected": 0, "total": 0}
    for verification_status, count in rows:
        counts["total"] += count
        if verification_status == VerificationStatus.verified:
            counts["approved"] += count
        elif verification_status == VerificationStatus.rejected:
            counts["rejected"] += count
        else:
            counts["pending"] += count

    # "Ready to approve": the rows this section's reviewer can clear right now.
    # The two queues have different rules: a client needs paperwork AND a bank
    # transfer awaiting verification (approving releases its passes), while a
    # vendor is document-only because its money buys showcase time per listing.
    def _ready(*, payment_required: bool) -> int:
        query = (
            db.query(func.count(Profile.id))
            .join(User, Profile.user_id == User.id)
            .filter(
                User.role.in_(scoped_roles),
                Profile.verification_status != VerificationStatus.verified,
                Profile.user_id.in_(db.query(Document.user_id)),
            )
        )
        if payment_required:
            query = query.filter(
                Profile.user_id.in_(
                    db.query(Payment.owner_user_id).filter(
                        Payment.status == PaymentStatus.SUBMITTED
                    )
                )
            )
        return int(query.scalar() or 0)

    scoped_set = set(scoped_roles)
    counts["ready_for_approval"] = (
        _ready(payment_required=True) if UserRole.client in scoped_set else 0
    ) + (
        _ready(payment_required=False)
        if scoped_set & {UserRole.supplier, UserRole.provider}
        else 0
    )
    counts["scope"] = (
        "client" if scoped_roles == (UserRole.client,) else
        "vendor" if set(scoped_roles) == {UserRole.supplier, UserRole.provider} else
        "all"
    )
    return counts


@router.get("/providers", summary="Accounts awaiting or past verification (all roles)")
def list_providers(
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    score_min: Optional[float] = Query(None),
    score_max: Optional[float] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    ready_only: bool = Query(
        False,
        description="Only accounts whose paperwork is in AND whose payment is awaiting verification",
    ),
    role: Optional[str] = Query(
        None,
        description="Section scope: client (buyers) or vendor (suppliers + service providers)",
    ),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    # Role and the two plain filters run in SQL so the queue page only pulls the
    # rows it will show. `user` is eager-loaded because the item needs full_name /
    # email, and each profile's documents are batch-loaded below — together this
    # keeps a page of 20 at ~3 queries however many accounts exist.
    query = (
        db.query(Profile)
        .join(User, Profile.user_id == User.id)
        .options(joinedload(Profile.user))
        .filter(User.role.in_(_role_scope(role) or _VERIFIABLE_ROLES))
    )
    if status_filter:
        wanted = status_filter.strip().lower()
        if wanted == "approved":
            wanted = "verified"
        matching = [
            s for s in VerificationStatus if s.value == wanted
        ]
        # An unknown status matches nothing, exactly as the previous in-Python
        # comparison did — it must never widen the query.
        query = query.filter(
            Profile.verification_status.in_(matching) if matching else false()
        )
    if search:
        needle = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(
                    func.coalesce(Profile.company_name, User.full_name, "")
                ).like(needle),
                func.lower(func.coalesce(User.full_name, "")).like(needle),
                func.lower(func.coalesce(User.email, "")).like(needle),
            )
        )

    if ready_only:
        # Runs in SQL so the paginated view stays exact. Paperwork is required for
        # everyone; the bank transfer is required only for clients, whose approval
        # issues the passes that payment bought. Vendors pay per listing instead.
        query = query.filter(
            Profile.user_id.in_(db.query(Document.user_id)),
            or_(
                User.role != UserRole.client,
                Profile.user_id.in_(
                    db.query(Payment.owner_user_id).filter(
                        Payment.status == PaymentStatus.SUBMITTED
                    )
                ),
            ),
        )

    # The remaining filters read values that only exist after a row is
    # serialized (a country buried in JSON metadata, a score averaged across the
    # account's documents), so they cannot run in SQL yet.
    late_filters = any(
        v is not None for v in (country, score_min, score_max, date_from, date_to)
    )

    if not late_filters:
        # Common case — the admin just opens the queue. Page in SQL so a view
        # costs one page of work no matter how many accounts exist.
        total = query.enable_eagerloads(False).order_by(None).count()
        profiles = query.offset((page - 1) * limit).limit(limit).all()
        documents = _documents_for_many(db, [p.user_id for p in profiles])
        payments = _pending_payments_for_many(db, [p.user_id for p in profiles])
        return {
            "data": [
                _provider_item(
                    db,
                    p,
                    docs=documents.get(p.user_id, []),
                    payment=payments.get(p.user_id),
                )
                for p in profiles
            ],
            "total": total,
        }

    # Rare path: a late filter is present, so the whole candidate set has to be
    # materialized and filtered before a page can be cut. Correct but O(N) — keep
    # it away from the default queue view.
    profiles = query.all()
    documents = _documents_for_many(db, [p.user_id for p in profiles])
    payments = _pending_payments_for_many(db, [p.user_id for p in profiles])
    items = [
        _provider_item(
            db,
            p,
            docs=documents.get(p.user_id, []),
            payment=payments.get(p.user_id),
        )
        for p in profiles
    ]

    if country:
        c = country.strip().lower()
        items = [i for i in items if c in (i["location"] or "").lower()]
    if score_min is not None:
        items = [i for i in items if (i["verification_score"] or -1) >= score_min]
    if score_max is not None:
        items = [i for i in items if (i["verification_score"] or 101) <= score_max]
    if date_from:
        items = [i for i in items if (i["submission_date"] or "") >= date_from]
    if date_to:
        items = [i for i in items if (i["submission_date"] or "") <= date_to]

    total = len(items)
    start = (page - 1) * limit
    return {"data": items[start:start + limit], "total": total}


@router.get("/providers/{profile_id}", summary="Full verification detail for one account")
def provider_detail(
    # `providers` in the path is kept for API compatibility with the admin
    # panel; the queue itself is role-inclusive (see _VERIFIABLE_ROLES).
    profile_id: uuid.UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return _provider_item(db, profile, detail=True)


@router.post("/providers/{profile_id}/action", summary="Approve / reject / request review")
def provider_action(
    profile_id: uuid.UUID,
    data: ProviderActionRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    action = (data.action or "").strip().lower()
    reason = (data.reason or "").strip() or None

    if action in ("approve", "approved", "verify", "verified"):
        user = profile.user
        if user is not None and user.role == UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Admin accounts are not part of the verification queue.",
            )

        # CLIENT RULE: paperwork + payment first, one action, passes included.
        # Approving activates the bank transfer (subscription, access pack and
        # passes) and then marks the profile verified, so a client is never
        # cleared without the money and never charged without access.
        if user is not None and user.role == UserRole.client:
            # Approving twice would look for a payment that the first approval
            # already consumed; say so plainly instead of "no payment waiting".
            if profile.verification_status == VerificationStatus.verified:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "already_approved",
                        "message": "This account is already approved; its passes were issued at approval.",
                    },
                )
            docs = _documents_for(db, profile)
            payment = _pending_payment_for(db, profile.user_id)
            if not docs:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "documents_required",
                        "message": "This client has not submitted any verification documents yet.",
                    },
                )
            if payment is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "payment_required",
                        "message": "This client has no bank-transfer payment awaiting verification.",
                    },
                )

            decision = PaymentService.approve_payment(db, _admin, payment.id)
            ProfileService.verify_profile(db, profile_id, reviewer=_admin)
            passes = decision.get("total_passes")
            return {
                "message": (
                    f"Client approved and payment verified — {passes} access passes issued."
                    if passes is not None
                    else "Client approved and payment verified."
                ),
                "payment_id": decision.get("payment_id"),
                "passes_granted": passes,
            }

        # VENDOR RULE: document-only approval. Vendors have no passes and no
        # session limit; what they pay for is marketplace showcase time, which is
        # verified (with its 1-month / 1-year period) in the listing-fee queue.
        if profile.verification_status == VerificationStatus.verified:
            # Re-approving would append a duplicate audit row and re-notify the
            # vendor for a decision that was already made.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "already_approved",
                    "message": "This vendor is already approved.",
                },
            )
        docs = _documents_for(db, profile)
        if not docs:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "documents_required",
                    "message": "This vendor has not submitted any verification documents yet.",
                },
            )
        ProfileService.verify_profile(db, profile_id, reviewer=_admin)
        return {
            "message": (
                "Vendor approved and marked verified. Their listings appear on the "
                "marketplace once a listing payment is verified for the showcase "
                "period they paid for."
            ),
            "passes_granted": None,
        }
    if action in ("reject", "rejected"):
        # A rejection without a reason is not reviewable by the account, so it
        # is refused here rather than relying on the browser's dialog.
        if not reason or len(reason) < 3:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "reason_required",
                    "message": "A rejection reason of at least 3 characters is required.",
                },
            )
        ProfileService.reject_profile(db, profile_id, reason, reviewer=_admin)
        return {"message": "Provider application rejected."}
    if action in ("under_review", "review"):
        ProfileService.mark_under_review(db, profile_id, reason, reviewer=_admin)
        return {"message": "Provider marked under review."}

    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported action")


@router.get(
    "/pass-grants/policy",
    summary="Whether manual pass issue is available, and under what conditions",
)
def pass_grant_policy(_admin: User = Depends(_require_admin)):
    """What the admin console must show for the manual pass-issue panel.

    Disabled by default: the intended production rule is that a verified
    platform payment issues the plan's passes. When an operator enables
    ``ALLOW_MANUAL_PASS_GRANTS`` for an offline case, the panel must still
    collect a written reason and an explicit no-payment confirmation.
    """
    return {
        "enabled": settings.ALLOW_MANUAL_PASS_GRANTS,
        "requires_reason": True,
        "reason_min_length": 10,
        "requires_no_payment_confirmation": True,
        "packs": [
            {
                "pack": code,
                "passes": cfg["passes"],
                "validity_months": cfg["validity_months"],
                "plan_code": cfg["plan_code"],
            }
            for code, cfg in PASS_GIFTS.items()
        ],
        "payment_flow": {
            "message": (
                "Approve the client's platform-fee payment to issue passes "
                "automatically for the plan they paid for."
            ),
            "monthly": "10 passes",
            "annual": "100 passes",
        },
    }


@router.post(
    "/providers/{profile_id}/grant-passes",
    summary="Give an account one of the two fixed access packs",
)
def grant_passes(
    profile_id: uuid.UUID,
    data: GrantPassesRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
):
    """Hand an account 10 passes (6 months) or 100 passes (12 months).

    This is the operator's manual issue path — for a fee settled outside the
    bank-transfer flow, or as a grant. It issues REAL passes with the same
    unused-validity stamping a purchase gets, so the pass balance and the
    session machinery behave identically.

    A CLIENT also needs an active subscription to pass the onboarding gate, so
    granting a client whose fee is not active opens one for the pack's window;
    otherwise the admin would hand out passes the client could never use.

    VENDORS are refused on purpose: suppliers and service providers have no
    usage passes and no session time limit. Their money buys marketplace showcase
    time, so the equivalent action for a vendor is verifying a listing payment in
    the Listing Fees queue with a 1-month or 1-year period.
    """
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    user = profile.user
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if user.role == UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Admin accounts do not use access passes.",
        )
    if user.role != UserRole.client:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "passes_client_only",
                "message": (
                    "Vendors do not use access passes. Verify the vendor's listing "
                    "payment instead and choose a 1-month or 1-year showcase period."
                ),
            },
        )

    requested = str(data.pack or "").strip()
    gift = PASS_GIFTS.get(requested)
    if gift is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "unsupported_pack",
                "message": "Choose one of the two available packs.",
                "options": [
                    {
                        "pack": code,
                        "passes": cfg["passes"],
                        "validity_months": cfg["validity_months"],
                    }
                    for code, cfg in PASS_GIFTS.items()
                ],
            },
        )

    # Production rule: PASSES FOLLOW A VERIFIED PAYMENT. A hand-issued pack has
    # no payment behind it, so the path is closed unless an operator explicitly
    # enables it, and even then it demands a written reason and a deliberate
    # no-payment confirmation. This runs after the role/pack checks so those
    # still answer with their own, more specific refusals.
    if not settings.ALLOW_MANUAL_PASS_GRANTS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "manual_grants_disabled",
                "message": (
                    "Manual pass issue is disabled. Client passes are issued "
                    "automatically when a platform-fee payment is approved "
                    "(MONTHLY → 10 passes, ANNUAL → 100). Approve the client's "
                    "payment instead."
                ),
            },
        )

    reason_text = (data.reason or "").strip()
    if len(reason_text) < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "grant_reason_required",
                "message": (
                    "A written reason of at least 10 characters is required for "
                    "passes issued without a payment."
                ),
            },
        )
    if data.confirm_no_payment is not True:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "no_payment_confirmation_required",
                "message": (
                    "Confirm that no payment is linked to this grant before "
                    "issuing passes by hand."
                ),
            },
        )

    now = datetime.utcnow()
    # Calendar-exact: 6 or 12 months from this grant, matching a purchase.
    from app.services.subscription_service import add_duration

    expires_at = add_duration(now, gift["validity_months"], BillingPeriod.MONTH)
    pack = AccessTokenService.provision_pack(
        db,
        user,
        token_count=gift["passes"],
        source="admin_grant",
        validity_months=gift["validity_months"],
    )

    subscription_opened = False
    if not OnboardingService.has_active_subscription(db, user):
        # Idempotent upsert of the approved catalogue, so the plan a grant needs
        # is always present (a fresh test database has none until it is seeded).
        SubscriptionService.seed_plans(db)
        plan = (
            db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.code == gift["plan_code"])
            .first()
        )
        if plan is not None:
            db.add(
                Subscription(
                    owner_user_id=user.id,
                    plan_id=plan.id,
                    status=SubscriptionStatus.ACTIVE,
                    starts_at=now,
                    expires_at=expires_at,
                )
            )
            db.commit()
            subscription_opened = True

    # A hand-issued pack is a privileged grant with no payment behind it, so it
    # is recorded on the same append-only trail as the review decisions.
    from app.services.admin_audit import record_decision

    record_decision(
        db,
        entity_type="profile",
        entity_id=profile.id,
        admin=admin,
        action="passes_granted",
        # Explicit that this grant has NO payment behind it, with the operator's
        # own justification, so it is never mistaken for a payment approval.
        reason=(
            f"MANUAL GRANT, NO PAYMENT LINKED: {gift['passes']} passes, "
            f"{gift['validity_months']} months. Reason: {reason_text[:500]}"
        ),
    )
    db.commit()

    return {
        "message": (
            f"{gift['passes']} access passes issued for {gift['validity_months']} months."
            + (" Their platform access is now active." if subscription_opened else "")
        ),
        "passes_granted": gift["passes"],
        "validity_months": gift["validity_months"],
        # Nominal day count for older clients that still display days.
        "validity_days": (expires_at - now).days,
        "pack_id": str(pack.id),
        "expires_at": expires_at.isoformat(),
        "subscription_opened": subscription_opened,
        "payment_linked": False,
        "reason": reason_text,
    }


@router.get("/documents", summary="All uploaded documents with uploader details")
def all_documents(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None, alias="q"),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    """Every uploaded document, newest first, with who sent it.

    This is the admin-wide register behind `/admin/documents`; the verification
    queues still expose the same files in account context. Files themselves are
    only ever served through the existing admin-only download endpoint.
    """
    query = (
        db.query(Document)
        .join(User, Document.user_id == User.id)
        .outerjoin(Profile, Profile.user_id == User.id)
        .options(joinedload(Document.user).joinedload(User.profile))
    )

    if status_filter:
        try:
            wanted_status = DocumentStatus(status_filter.strip().lower())
        except ValueError:
            # An unknown status must match nothing, never widen the register.
            return {
                "data": [],
                "total": 0,
                "page": page,
                "limit": limit,
                "pages": 0,
                "counts": _document_status_counts(db),
            }
        query = query.filter(Document.verification_status == wanted_status)

    if search:
        needle = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(func.coalesce(User.email, "")).like(needle),
                func.lower(func.coalesce(User.full_name, "")).like(needle),
                func.lower(func.coalesce(Profile.company_name, "")).like(needle),
                func.lower(func.coalesce(Document.name, "")).like(needle),
            )
        )

    total = query.enable_eagerloads(False).order_by(None).count()
    rows = (
        query.order_by(Document.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {
        "data": [_admin_document_item(doc) for doc in rows],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "counts": _document_status_counts(db),
    }


@router.post("/documents/{document_id}/action", summary="Approve or reject one document")
def document_action(
    document_id: uuid.UUID,
    data: DocumentActionRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(_require_admin),
):
    action = (data.action or "").strip().lower()
    reason = (data.reason or "").strip() or None
    if action in ("reject", "rejected") and (reason is None or len(reason) < 3):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "reason_required",
                "message": "A rejection reason of at least 3 characters is required.",
            },
        )
    try:
        if action in ("approve", "approved", "verify", "verified"):
            doc = DocumentService.verify_document(
                db, document_id, verifier_id=admin.id, admin=admin
            )
        elif action in ("reject", "rejected"):
            doc = DocumentService.reject_document(
                db, document_id, verifier_id=admin.id, reason=reason, admin=admin
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported action"
            )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    verdict = "approved" if action in ("approve", "approved", "verify", "verified") else "rejected"
    return {"message": f"Document {verdict}.", "document": _document_item(doc)}


@router.get("/documents/{document_id}/file", summary="Admin-only document file download")
def document_file(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if doc is None or not doc.file_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if not os.path.isfile(doc.file_url):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file not found")
    return FileResponse(doc.file_url, filename=doc.name or os.path.basename(doc.file_url))
