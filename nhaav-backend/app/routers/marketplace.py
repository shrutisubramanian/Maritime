"""
Service Marketplace read API.

Aggregates approved `Service` listings (the DB-backed replacement for the old
localStorage "coverage listings") joined with their *verified* provider
profiles. Everything here is derived from real rows — there are no seeded or
fabricated providers.
"""
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service
from app.models.service_category import ServiceCategory
from app.models.user import User
from app.models.vendor_category import VendorType
from app.services.marketplace_company_service import MarketplaceCompanyService
from app.services.onboarding_service import require_marketplace_access
from app.services.profile_service import ProfileService
from app.services.rate_limit_service import RateLimitService
from app.services.vendor_taxonomy_service import VendorTaxonomyService

router = APIRouter(prefix="/marketplace", tags=["Marketplace"])


def _category_lookup(db: Session) -> Dict[str, ServiceCategory]:
    return {c.name.strip().lower(): c for c in db.query(ServiceCategory).all()}


def _approved_service_rows(db: Session) -> List[Service]:
    """All active (approved) service listings whose provider is verified.

    `provider` is eager-loaded: every card renders the provider's company name and
    rating, so a lazy load here would be one query per row (measured earlier at
    ~2 statements per listing).
    """
    from sqlalchemy.orm import joinedload

    from datetime import datetime

    now = datetime.utcnow()
    return (
        db.query(Service)
        .join(Profile, Profile.user_id == Service.provider_id)
        .options(joinedload(Service.provider))
        .filter(Service.is_active.is_(True))
        .filter(Profile.verification_status == VerificationStatus.verified)
        # PAID PLACEMENT: a card exists only while its 60-day paid window runs.
        # An approved listing whose window is missing or expired is not on the
        # marketplace at all — it is not rejected, it is simply not paid for.
        .filter(Service.expires_at.isnot(None), Service.expires_at > now)
        .all()
    )


def _group_rows(db: Session, rows: List[Service]) -> List[dict]:
    """
    Collapse individual service listings into one entry per normalized service
    name, computing verified-provider and port coverage from real rows.
    """
    cat_map = _category_lookup(db)
    groups: Dict[str, dict] = {}

    for svc in rows:
        key = (svc.name or "").strip()
        if not key:
            continue
        k = key.lower()
        sc = cat_map.get(k)
        entry = groups.get(k)
        if entry is None:
            entry = {
                "service_name": key,
                "description": svc.description or "",
                "category": sc.category_group if sc else (svc.category or "Other"),
                "subcategory": svc.subcategory or (sc.name if sc else svc.category) or key,
                "provider_ids": set(),
                "ports": {},
            }
            groups[k] = entry
        if not entry["description"] and svc.description:
            entry["description"] = svc.description
        entry["provider_ids"].add(svc.provider_id)
        if svc.port_id:
            entry["ports"][svc.port_id] = entry["ports"].get(svc.port_id, 0) + 1

    return list(groups.values())


def _serialize(entry: dict, preview: int = 6) -> dict:
    ports = entry["ports"]
    port_list = [{"port_name": p, "provider_count": c} for p, c in sorted(ports.items())]
    return {
        "service_name": entry["service_name"],
        "description": entry["description"],
        "category": entry["category"],
        "subcategory": entry["subcategory"],
        "verified_provider_count": len(entry["provider_ids"]),
        "ports_covered": len(ports),
        "ports": port_list,
        "preview_ports": [p["port_name"] for p in port_list[:preview]],
    }


def _offerings(db: Session, rows: List[Service]) -> List[dict]:
    """
    One entry per COMPANY's offering — one card, one company, one listed price.

    The service-name grouping above is still right for category totals and for
    the detail page's cross-provider port coverage, but it cannot answer "whose
    service is this, and what does it cost": a name-level card has no single
    owner. These are grouped by (service name, provider) so each card can carry
    the company's own price, badge and rating.

    A provider that lists the same service for several ports collapses to one
    card (the cheapest listed price wins; ports accumulate).
    """
    cat_map = _category_lookup(db)
    grouped: Dict[tuple, dict] = {}

    for svc in rows:
        name = (svc.name or "").strip()
        if not name:
            continue
        profile = svc.provider
        key = (name.lower(), svc.provider_id)
        entry = grouped.get(key)
        if entry is None:
            sc = cat_map.get(name.lower())
            entry = {
                "service_name": name,
                "description": svc.description or "",
                "category": sc.category_group if sc else (svc.category or "Other"),
                "subcategory": svc.subcategory or (sc.name if sc else svc.category) or name,
                "price_paise": svc.price_paise,
                "price_note": svc.price_note,
                # End of the paid 60-day placement this card is running on.
                "expires_at": svc.expires_at,
                "provider_id": str(svc.provider_id),
                "profile_id": str(profile.id) if profile is not None else None,
                "company_name": (profile.company_name if profile else None) or "",
                "badge_label": profile.badge_label if profile else None,
                "rating_avg": float(profile.rating_avg) if profile else 0.0,
                "jobs_completed": int(profile.jobs_completed) if profile else 0,
                "ports": {},
            }
            grouped[key] = entry

        if not entry["description"] and svc.description:
            entry["description"] = svc.description
        if svc.port_id:
            entry["ports"][svc.port_id] = entry["ports"].get(svc.port_id, 0) + 1
        # Cheapest published price for this company's version of the service.
        if svc.price_paise is not None and (
            entry["price_paise"] is None or svc.price_paise < entry["price_paise"]
        ):
            entry["price_paise"] = svc.price_paise
            entry["price_note"] = svc.price_note
        # One card = one company; the card stays as long as its longest-running
        # paid placement for this service does.
        if svc.expires_at is not None and (
            entry["expires_at"] is None or svc.expires_at > entry["expires_at"]
        ):
            entry["expires_at"] = svc.expires_at

    return list(grouped.values())


def _serialize_offering(entry: dict, preview: int = 6) -> dict:
    """Card payload: what a buyer needs to judge ONE company's offer."""
    port_list = [{"port_name": p, "provider_count": c} for p, c in sorted(entry["ports"].items())]
    return {
        "service_name": entry["service_name"],
        "description": entry["description"],
        "category": entry["category"],
        "subcategory": entry["subcategory"],
        # Listed price. NULL means the provider published no figure — the UI
        # shows "Price on request" rather than inventing one.
        "price_paise": entry["price_paise"],
        "price_note": entry["price_note"],
        "expires_at": entry["expires_at"].isoformat() if entry["expires_at"] else None,
        "provider_id": entry["provider_id"],
        "profile_id": entry["profile_id"],
        "company_name": entry["company_name"],
        "badge_label": entry["badge_label"],
        "rating_avg": entry["rating_avg"],
        "jobs_completed": entry["jobs_completed"],
        # This card IS one provider, so the legacy field stays for old callers.
        "verified_provider_count": 1,
        "ports_covered": len(port_list),
        "ports": port_list,
        "preview_ports": [p["port_name"] for p in port_list[:preview]],
    }


@router.get("/category-groups", summary="Service categories grouped by group")
def category_groups(
    db: Session = Depends(get_db),
    _user: User = Depends(require_marketplace_access),
):
    groups = _group_rows(db, _approved_service_rows(db))

    by_group: Dict[str, dict] = {}
    for g in groups:
        bucket = by_group.setdefault(
            g["category"], {"group_name": g["category"], "services": [], "total_services": 0, "total_verified_providers": 0}
        )
        ports = g["ports"]
        bucket["services"].append({
            "name": g["service_name"],
            "description": g["description"],
            "verified_provider_count": len(g["provider_ids"]),
            "ports_covered": len(ports),
            "ports": sorted(ports.keys()),
        })
        bucket["total_services"] += 1
        bucket["total_verified_providers"] += len(g["provider_ids"])

    ordered = sorted(by_group.values(), key=lambda b: b["group_name"].lower())
    return {"data": ordered}


@router.get("/services", summary="Service cards for the marketplace grid",
           dependencies=[Depends(RateLimitService.rate_limit_user("vendor_search"))])
def list_services(
    category_group: Optional[str] = Query(None),
    port: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=settings.MAX_SEARCH_PAGE_SIZE),
    db: Session = Depends(get_db),
    _user: User = Depends(require_marketplace_access),
):
    """
    Service cards for the grid — ONE CARD PER COMPANY's offering, so each card
    can show that company's own price and name (the old name-level grouping
    gave every card the same anonymous "N providers").

    Filters behave as before: `category_group`, `port` (a provider's own ports)
    and `search` (which now also matches the company name, so searching "Acme
    Hull" finds Acme's hull survey).
    """
    offerings = _offerings(db, _approved_service_rows(db))

    if category_group:
        target = category_group.strip().lower()
        offerings = [g for g in offerings if g["category"].strip().lower() == target]
    if port:
        target = port.strip().lower()
        offerings = [g for g in offerings if any(p.strip().lower() == target for p in g["ports"])]
    if search:
        target = search.strip().lower()
        offerings = [
            g for g in offerings
            if target in g["service_name"].lower()
            or target in (g["description"] or "").lower()
            or target in g["category"].lower()
            or target in (g["subcategory"] or "").lower()
            or target in g["company_name"].lower()
        ]

    # Cheapest first when prices are published, then alphabetically: a buyer
    # comparing cards reads them in price order. Unpriced offers sink below
    # priced ones rather than being invented a number.
    offerings.sort(
        key=lambda g: (
            g["price_paise"] is None,
            g["price_paise"] if g["price_paise"] is not None else 0,
            g["service_name"].lower(),
        )
    )
    total = len(offerings)
    pages = (total + limit - 1) // limit if limit > 0 else 1
    offset = (page - 1) * limit
    page_items = [_serialize_offering(g) for g in offerings[offset:offset + limit]]
    return {"data": page_items, "total": total, "page": page, "pages": pages}


@router.get("/services/aggregate/{service_name}", summary="Service detail with per-port coverage",
           dependencies=[Depends(RateLimitService.rate_limit_user("port_search"))])
def service_detail(
    service_name: str,
    db: Session = Depends(get_db),
    _user: User = Depends(require_marketplace_access),
):
    target = service_name.strip().lower()
    groups = _group_rows(db, _approved_service_rows(db))
    match = next((g for g in groups if g["service_name"].lower() == target), None)

    if match is None:
        # Honest "not found" shape the UI already understands.
        return {
            "service_name": service_name,
            "description": "",
            "category": "",
            "subcategory": None,
            "verified_provider_count": 0,
            "ports_covered": 0,
            "port_coverage": [],
            "exists": False,
        }

    port_list = [{"port_name": p, "provider_count": c} for p, c in sorted(match["ports"].items())]
    return {
        "service_name": match["service_name"],
        "description": match["description"],
        "category": match["category"],
        "subcategory": match["subcategory"],
        "verified_provider_count": len(match["provider_ids"]),
        "ports_covered": len(match["ports"]),
        "port_coverage": port_list,
        "exists": True,
    }


@router.get(
    "/services/aggregate/{service_name}/availability",
    summary="Port-specific provider availability for a service",
)
def service_availability(
    service_name: str,
    port: str = Query(...),
    db: Session = Depends(get_db),
    _user: User = Depends(require_marketplace_access),
):
    target_name = service_name.strip().lower()
    target_port = port.strip().lower()

    rows = [
        s for s in _approved_service_rows(db)
        if (s.name or "").strip().lower() == target_name
        and (s.port_id or "").strip().lower() == target_port
    ]

    profiles: Dict[str, Profile] = {}
    for s in rows:
        profile = db.query(Profile).filter(Profile.user_id == s.provider_id).first()
        if profile and profile.verification_status == VerificationStatus.verified:
            profiles[str(profile.id)] = profile

    providers = [
        {
            "id": str(p.id),
            "company_name": p.company_name or "Verified provider",
            "rating_avg": p.rating_avg or 0.0,
            "jobs_completed": p.jobs_completed or 0,
            "years_experience": p.years_experience or 0,
            "badge_label": p.badge_label,
        }
        for p in profiles.values()
    ]
    providers.sort(key=lambda p: p["rating_avg"], reverse=True)

    return {
        "service_name": service_name,
        "port": port,
        "provider_count": len(providers),
        "providers": providers,
        "available": len(providers) > 0,
    }


# --------------------------------------------------------------- company-first
#
# The marketplace browses COMPANIES. A category click returns the companies in
# that category; a company card opens the company's business profile. Individual
# service/supply rows remain supporting content inside a profile (and still power
# procurement matching), never the browse unit.


@router.get(
    "/vendor-categories",
    summary="Primary business categories for a vendor type (with subcategories)",
    dependencies=[Depends(RateLimitService.rate_limit_user("vendor_search"))],
)
def vendor_categories(
    vendor_type: VendorType = Query(
        VendorType.provider, description="provider (service providers) or supplier"
    ),
    db: Session = Depends(get_db),
    _user: User = Depends(require_marketplace_access),
):
    """Sidebar taxonomy for one vendor type.

    Counts are of DISCOVERABLE companies (approved profile + active paid
    visibility), so a category with no live company reads as empty instead of
    advertising phantom supply.
    """
    VendorTaxonomyService.ensure_seeded(db)
    categories = VendorTaxonomyService.categories(db, vendor_type)

    # One pass over discoverable companies gives every category its count,
    # whichever category a legacy company is derived into.
    # No page limit: a category's count must describe every discoverable
    # company, not just the first page of them.
    everything = MarketplaceCompanyService.discover(db, vendor_type, limit=None)
    counts: Dict[str, int] = {}
    for card in everything["data"]:
        for name in card.get("categories") or []:
            key = name.strip().lower()
            counts[key] = counts.get(key, 0) + 1

    return {
        "vendor_type": vendor_type.value,
        "data": [
            {
                "id": str(category.id),
                "name": category.name,
                "subcategories": [
                    {"id": str(sub.id), "name": sub.name} for sub in category.subcategories
                ],
                "company_count": counts.get(category.name.strip().lower(), 0),
            }
            for category in categories
        ],
    }


@router.get(
    "/companies",
    summary="Company cards for a vendor type / category / subcategory",
    dependencies=[Depends(RateLimitService.rate_limit_user("vendor_search"))],
)
def list_companies(
    vendor_type: VendorType = Query(VendorType.provider),
    category: Optional[str] = Query(None, description="Primary business category name"),
    subcategory: Optional[str] = Query(None, description="Capability inside that category"),
    country: Optional[str] = Query(None),
    port: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Company name, category or capability"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=settings.MAX_SEARCH_PAGE_SIZE),
    db: Session = Depends(get_db),
    _user: User = Depends(require_marketplace_access),
):
    """Companies, never generic category descriptions.

    Visibility is enforced server-side: only an admin-approved company with an
    active paid visibility window appears here (see
    ``ProfileVisibilityService``).
    """
    return MarketplaceCompanyService.discover(
        db,
        vendor_type,
        category=category,
        subcategory=subcategory,
        country=country,
        port=port,
        search=search,
        page=page,
        limit=limit,
    )


@router.get(
    "/companies/{profile_id}",
    summary="A company's business profile",
    dependencies=[Depends(RateLimitService.rate_limit_user("vendor_detail"))],
)
def company_business_profile(
    profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_marketplace_access),
):
    import uuid as _uuid

    from fastapi import HTTPException as _HTTPException

    try:
        parsed = _uuid.UUID(profile_id)
    except ValueError:
        raise _HTTPException(status_code=404, detail="Company not found")
    return MarketplaceCompanyService.company_profile(db, parsed, viewer=current_user)


@router.get(
    "/companies/{profile_id}/brochure",
    summary="Download a company's brochure (PDF)",
    dependencies=[Depends(RateLimitService.rate_limit_user("download"))],
)
def company_brochure(
    profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_marketplace_access),
):
    """Serve the vendor's own brochure.

    Authorized download, not a static URL: the company must still be
    discoverable (approved + paid visibility) at the moment of download, so an
    expired company cannot keep handing out its document through an old link.
    """
    import os
    import uuid as _uuid

    from fastapi import HTTPException as _HTTPException
    from fastapi.responses import FileResponse

    from app.models.profile import Profile
    from app.services.profile_visibility_service import ProfileVisibilityService

    try:
        parsed = _uuid.UUID(profile_id)
    except ValueError:
        raise _HTTPException(status_code=404, detail="Brochure not found")

    profile = db.query(Profile).filter(Profile.id == parsed).first()
    if profile is None:
        raise _HTTPException(status_code=404, detail="Brochure not found")
    ProfileService.assert_public_profile_access(profile, current_user)
    if not profile.brochure_path:
        raise _HTTPException(status_code=404, detail="Brochure not found")
    if not ProfileVisibilityService.is_publicly_discoverable(db, profile):
        raise _HTTPException(status_code=404, detail="Brochure not found")
    if not os.path.isfile(profile.brochure_path):
        raise _HTTPException(status_code=404, detail="Brochure not found")

    return FileResponse(
        profile.brochure_path,
        media_type="application/pdf",
        filename=profile.brochure_filename or "company-brochure.pdf",
    )


@router.get("/categories", summary="All service categories grouped by group (legacy)")
def categories(
    db: Session = Depends(get_db),
    _user: User = Depends(require_marketplace_access),
):
    grouped: Dict[str, List[dict]] = {}
    for category in db.query(ServiceCategory).all():
        grouped.setdefault(category.category_group, []).append(
            {"id": str(category.id), "name": category.name}
        )
    return grouped
