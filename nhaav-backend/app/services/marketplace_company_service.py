"""
Company-first marketplace discovery.

Browsing is: choose vendor type -> choose a primary category -> see the COMPANIES
in that category -> open a company's business profile. Individual service or
supply listings are supporting content inside a profile, never the thing that is
listed or paid for.

Discovery eligibility is enforced here on the server (the frontend only renders
what it receives):

* the company profile is admin-approved (``verification_status == verified``);
* the company has an active paid visibility entitlement — either the new
  company-profile plan or, for companies that predate it, the remaining window of
  the listing placements they already paid for;
* the company is filtered into the category it actually belongs to.

Numbers come from real rows: no fabricated badges, ratings or coverage claims.
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status as http_status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.profile import Profile, VerificationStatus
from app.models.service import Service, ServiceListingStatus
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.user import User, UserRole
from app.models.vendor_category import ProfileSubcategory, VendorType
from app.services.profile_service import ProfileService
from app.services.profile_visibility_service import ProfileVisibilityService
from app.services.vendor_taxonomy_service import VendorTaxonomyService, _norm

_ROLE_FOR_TYPE = {
    VendorType.provider: UserRole.provider,
    VendorType.supplier: UserRole.supplier,
}


def _utcnow() -> datetime:
    return datetime.utcnow()


class MarketplaceCompanyService:
    # ------------------------------------------------------------ listings
    @staticmethod
    def _live_services(db: Session, owner_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[Service]]:
        if not owner_ids:
            return {}
        now = _utcnow()
        rows = (
            db.query(Service)
            .filter(
                Service.provider_id.in_(owner_ids),
                Service.status == ServiceListingStatus.approved,
                Service.is_active.is_(True),
                Service.expires_at.isnot(None),
                Service.expires_at > now,
            )
            .order_by(Service.name)
            .all()
        )
        grouped: dict[uuid.UUID, list[Service]] = {}
        for row in rows:
            grouped.setdefault(row.provider_id, []).append(row)
        return grouped

    @staticmethod
    def _live_supplies(db: Session, owner_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[SupplyListing]]:
        if not owner_ids:
            return {}
        now = _utcnow()
        rows = (
            db.query(SupplyListing)
            .filter(
                SupplyListing.supplier_id.in_(owner_ids),
                SupplyListing.status == SupplyListingStatus.approved,
                SupplyListing.expires_at.isnot(None),
                SupplyListing.expires_at > now,
            )
            .order_by(SupplyListing.name)
            .all()
        )
        grouped: dict[uuid.UUID, list[SupplyListing]] = {}
        for row in rows:
            grouped.setdefault(row.supplier_id, []).append(row)
        return grouped

    # --------------------------------------------------------------- cards
    @staticmethod
    def _card(
        profile: Profile,
        user: User,
        live_services: list[Service],
        live_supplies: list[SupplyListing],
        visibility: dict,
    ) -> dict:
        declared = VendorTaxonomyService.subcategory_names(profile)
        # What the company can actually do right now. Declared capabilities come
        # first; a legacy company's live listings fill the gap so a card never
        # looks empty just because it predates the new model.
        if declared:
            capabilities = declared
        elif live_services:
            capabilities = sorted({s.name for s in live_services})
        elif live_supplies:
            capabilities = sorted({(l.subcategory or l.category) for l in live_supplies})
        else:
            capabilities = []

        ports = list(profile.ports_served or [])
        # Lowest live listed price, so a card can say "from X". A company
        # whose listings are all quoted per request has no number at all and
        # the card says TBC — never a fabricated figure.
        listed_prices = [
            row.price_paise
            for row in list(live_services) + list(live_supplies)
            if row.price_paise is not None
        ]
        return {
            "profile_id": str(profile.id),
            "user_id": str(profile.user_id),
            "company_name": (profile.company_name or "").strip(),
            # The marketplace card shows the company's own words.
            "bio": profile.bio,
            "vendor_type": user.role.value,
            "primary_category": profile.primary_category.name if profile.primary_category else None,
            # Filled by `discover`, which resolves legacy categories from the
            # company's own live listings.
            "categories": [],
            "subcategories": capabilities,
            "country": profile.country,
            "head_office": profile.head_office,
            "service_areas": list(profile.service_areas or []),
            "ports": ports,
            "verification_status": profile.verification_status.value,
            "badge_label": profile.badge_label,
            "rating_avg": float(profile.rating_avg or 0.0),
            "jobs_completed": int(profile.jobs_completed or 0),
            "years_experience": int(profile.years_experience or 0),
            "live_capability_count": len(live_services) + len(live_supplies),
            "price_from_paise": min(listed_prices) if listed_prices else None,
            "visibility": {
                "is_visible": bool(visibility.get("is_visible")),
                "source": visibility.get("source"),
                "expires_at": visibility.get("expires_at"),
            },
        }

    # ------------------------------------------------------------ discover
    @staticmethod
    def discover(
        db: Session,
        vendor_type: VendorType,
        category: Optional[str] = None,
        subcategory: Optional[str] = None,
        country: Optional[str] = None,
        port: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        # `None` returns every match (used for taxonomy counts); the public
        # endpoint always passes an explicit, validated limit.
        limit: Optional[int] = 20,
    ) -> dict:
        """Companies in a category, with their capabilities and coverage."""
        role = _ROLE_FOR_TYPE[vendor_type]

        # SQL narrows to verified companies of the right type; the paid-window
        # and JSON (ports) checks run below because they depend on per-company
        # state and JSON arrays that are not portable across SQLite/Postgres.
        query = (
            db.query(Profile)
            .join(User, User.id == Profile.user_id)
            # Capabilities and their category are loaded in two extra queries
            # rather than one per company (a card renders both).
            .options(
                # User, capabilities and their category are all rendered on a
                # card, so they are eager-loaded in a fixed number of queries.
                joinedload(Profile.user),
                selectinload(Profile.subcategory_links).joinedload(ProfileSubcategory.subcategory),
            )
            .filter(
                User.role == role,
                Profile.verification_status == VerificationStatus.verified,
            )
        )
        # Plain columns filter in SQL; only the JSON arrays (ports/areas) and the
        # paid-window check stay in Python.
        if (country or "").strip():
            query = query.filter(func.lower(Profile.country) == (country or "").strip().lower())
        profiles = query.order_by(func.lower(Profile.company_name), Profile.id).all()

        # ONE CARD PER COMPANY. A company is a single discovery result no matter
        # how many listings it holds or how many rows a join could produce, so
        # the page is de-duplicated on the profile identity before any counting.
        unique: list[Profile] = []
        seen: set[uuid.UUID] = set()
        for profile in profiles:
            if profile.id in seen:
                continue
            seen.add(profile.id)
            unique.append(profile)
        profiles = unique

        owner_ids = [p.user_id for p in profiles]
        services_by_owner = MarketplaceCompanyService._live_services(db, owner_ids)
        supplies_by_owner = MarketplaceCompanyService._live_supplies(db, owner_ids)

        # BATCHED eligibility + taxonomy: two queries per concern for the whole
        # page rather than two or three per company.
        visibility_by_profile = ProfileVisibilityService.visibility_states(db, profiles)
        categories_by_owner = VendorTaxonomyService.effective_category_names_bulk(
            db, [(profile, profile.user) for profile in profiles]
        )

        wanted_category = (category or "").strip()
        wanted_sub = (subcategory or "").strip()
        wanted_country = (country or "").strip()
        wanted_port = (port or "").strip()
        needle = (search or "").strip().lower()

        cards: list[dict] = []
        for profile in profiles:
            user = profile.user
            if user is None:
                continue
            visibility = visibility_by_profile.get(profile.id) or {
                "is_visible": False,
                "source": None,
                "expires_at": None,
            }
            if not visibility["is_visible"]:
                continue

            live_services = services_by_owner.get(profile.user_id, [])
            live_supplies = supplies_by_owner.get(profile.user_id, [])

            categories = categories_by_owner.get(profile.user_id, [])
            if wanted_category and _norm(wanted_category) not in {_norm(c) for c in categories}:
                continue

            card = MarketplaceCompanyService._card(
                profile, user, live_services, live_supplies, visibility
            )
            card["categories"] = categories

            if wanted_sub:
                # A capability comes from the declared taxonomy, but a company's
                # live approved listings are equally real deliverables. Matching
                # both means "find companies that provide X" cannot miss a
                # company merely because X lives on a listing rather than in its
                # declared capability list.
                declared = {_norm(s) for s in card["subcategories"]}
                delivered = {
                    _norm(value)
                    for row in list(live_services) + list(live_supplies)
                    for value in (
                        row.name,
                        getattr(row, "subcategory", None),
                        getattr(row, "category", None),
                    )
                    if value
                }
                if _norm(wanted_sub) not in declared and _norm(wanted_sub) not in delivered:
                    continue

            if wanted_country and _norm(profile.country or "") != _norm(wanted_country):
                continue

            if wanted_port:
                # HEAD OFFICE ONLY. A company appears under the port it is based
                # at, not under every port it works in — otherwise a vendor with
                # fifteen other ports would surface fifteen extra times and the
                # filter would stop meaning "companies based here".
                office = _norm(profile.head_office or "")
                wanted = _norm(wanted_port)
                # Exact match on the canonical port name, plus a padded contains
                # fallback so legacy free-text head offices ("Head office, Mumbai")
                # still land under the right filter.
                if not office or not (
                    office == wanted or f" {wanted} " in f" {office} "
                ):
                    continue

            if needle:
                haystack = " ".join(
                    filter(
                        None,
                        [
                            profile.company_name or "",
                            profile.bio or "",
                            card["primary_category"] or "",
                            " ".join(categories),
                            " ".join(card["subcategories"]),
                            profile.country or "",
                            profile.head_office or "",
                        ],
                    )
                ).lower()
                if needle not in haystack:
                    continue

            cards.append(card)

        cards.sort(key=lambda c: (c["company_name"].lower(), c["profile_id"]))
        total = len(cards)
        if limit is None:
            return {
                "data": cards,
                "total": total,
                "page": 1,
                "pages": 1,
                "vendor_type": vendor_type.value,
            }
        pages = (total + limit - 1) // limit if limit > 0 else 1
        offset = (page - 1) * limit
        return {
            "data": cards[offset:offset + limit],
            "total": total,
            "page": page,
            "pages": pages,
            "vendor_type": vendor_type.value,
        }

    # ------------------------------------------------------------ profile
    @staticmethod
    def company_profile(
        db: Session,
        profile_id: uuid.UUID,
        viewer: Optional[User] = None,
    ) -> dict:
        """A company's business profile, from its own declared + approved data."""
        profile = db.query(Profile).filter(Profile.id == profile_id).first()
        if profile is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Company not found")
        user = profile.user
        if user is None or user.role not in (UserRole.provider, UserRole.supplier):
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Company not found")

        # Buyers can inspect a company; vendors only their own. Admins retain
        # support access. This runs before visibility so a vendor cannot probe
        # whether a competitor's paid window is active.
        ProfileService.assert_public_profile_access(profile, viewer)

        # A buyer may only inspect a company that is approved and paid for; the
        # owner and admins use the dashboard/profile endpoints instead.
        visibility = ProfileVisibilityService.visibility_state(db, profile)
        if not visibility["is_visible"]:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Company not found")

        vendor_type = VendorType(user.role.value)
        live_services = MarketplaceCompanyService._live_services(db, [profile.user_id]).get(
            profile.user_id, []
        )
        live_supplies = MarketplaceCompanyService._live_supplies(db, [profile.user_id]).get(
            profile.user_id, []
        )

        declared = VendorTaxonomyService.subcategory_names(profile)
        categories = VendorTaxonomyService.effective_category_names(db, profile, user)

        capabilities = []
        for svc in live_services:
            capabilities.append(
                {
                    "id": str(svc.id),
                    "name": svc.name,
                    "category": svc.category,
                    "subcategory": svc.subcategory,
                    "description": svc.description,
                    "price_paise": svc.price_paise,
                    "price_note": svc.price_note,
                    "kind": "service",
                }
            )
        for listing in live_supplies:
            capabilities.append(
                {
                    "id": str(listing.id),
                    "name": listing.name,
                    "category": listing.category,
                    "subcategory": listing.subcategory,
                    "description": listing.description,
                    "price_paise": listing.price_paise,
                    "price_note": listing.price_note,
                    "kind": "supply",
                }
            )

        location = None
        if profile.location_lat is not None and profile.location_lng is not None:
            location = {"lat": float(profile.location_lat), "lng": float(profile.location_lng)}

        # The vendor's own brochure (PDF, 15 MB max). Only metadata is returned;
        # the file itself is served by the authorized download endpoint.
        from app.services.profile_brochure_service import ProfileBrochureService

        brochure = ProfileBrochureService.metadata(profile)
        if brochure is not None:
            brochure = {
                **brochure,
                "download_url": f"/marketplace/companies/{profile.id}/brochure",
            }

        return {
            "profile_id": str(profile.id),
            "user_id": str(profile.user_id),
            "vendor_type": vendor_type.value,
            "company_name": (profile.company_name or "").strip(),
            # The account's single business number is the one deliberately
            # public contact; the private contacts list and KYC stay private.
            "phone": getattr(user, "phone", None),
            "bio": profile.bio,
            "primary_category": profile.primary_category.name if profile.primary_category else (
                categories[0] if categories else None
            ),
            "categories": categories,
            "subcategories": declared,
            "capabilities": capabilities,
            # Descriptive extras: the company also works in these categories.
            # They never add the company to another discovery category — that
            # stays the single `primary_category` above.
            "additional_categories": [
                str(name).strip()
                for name in ((profile.profile_metadata or {}).get("additional_categories") or [])
                if str(name or "").strip()
            ],
            "country": profile.country,
            "head_office": profile.head_office,
            "ports": list(profile.ports_served or []),
            "service_areas": list(profile.service_areas or []),
            "verification_status": profile.verification_status.value,
            "badge_label": profile.badge_label,
            "rating_avg": float(profile.rating_avg or 0.0),
            "jobs_completed": int(profile.jobs_completed or 0),
            "years_experience": int(profile.years_experience or 0),
            # Storefront facts the company filled in: its registered address and
            # the links it published. Empty ones are omitted, never placeholders.
            "address": (profile.profile_metadata or {}).get("address") or None,
            "registration_number": (profile.profile_metadata or {}).get("regNumber") or None,
            "social_links": {
                network: url
                for network, url in (profile.social_links or {}).items()
                if url and str(url).strip()
            },
            "location": location,
            "brochure": brochure,
            "visibility": {
                "expires_at": visibility.get("expires_at"),
                "source": visibility.get("source"),
            },
        }
