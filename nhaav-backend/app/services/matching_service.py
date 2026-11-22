import re
import uuid
from typing import List

from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.request import ServiceRequest, RequestType
from app.services.port_catalogue_service import PortCatalogueService


class MatchingService:
    """
    Deterministic eligibility resolution for the two marketplace ecosystems.

    No AI / no probabilistic scoring: eligibility is derived strictly from
    existing structured fields (category / listing name / port / active+verified).

    - SERVICE requests resolve *service providers* by the profile's MAIN CATEGORY
      (the single marketplace category a company chooses), with the legacy
      `Service` rows kept as an additional capability signal so an existing
      provider is never dropped.
    - SUPPLY requests resolve *suppliers* via their `SupplyListing` catalogue.

    The two sets never cross: a supplier can never be matched to a service
    request and a provider can never be matched to a supply request.

    Ports are compared through the PORT CATALOGUE (``PortCatalogueService``), so
    "Mumbai", "Mumbai Port" and "Bombay" are the same location while two
    different ports never collapse into each other. No substring matching is
    used: only canonical names and their declared aliases are equivalent.
    """

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _normalise(value: str | None) -> str:
        return (value or "").strip().lower()

    # ------------------------------------------------------------------- ports
    @staticmethod
    def _port_norm(value: str | None) -> str:
        """Same normalisation the port catalogue applies to stored names."""
        cleaned = re.sub(r"[^a-z0-9 ]+", " ", (value or "").lower())
        return re.sub(r"\s+", " ", cleaned).strip()

    @staticmethod
    def _port_key_map(db: Session) -> dict[str, str]:
        """Every canonical port name and alias -> one key per PORT ROW."""
        mapping: dict[str, str] = {}
        for port in PortCatalogueService.list_ports(db, include_inactive=True):
            key = f"id:{port.id}"
            for candidate in [port.name, *(port.aliases or [])]:
                mapping.setdefault(MatchingService._port_norm(candidate), key)
        return mapping

    @staticmethod
    def _port_variants(value: str | None) -> list[str]:
        """Normalised spellings to try for one value: whole string, head office
        part before a comma, and the same with a leading "port of " or a
        trailing " port"/" harbour" removed. These are exact spellings — never
        substrings — so unrelated ports cannot collide."""
        raw = (value or "").strip()
        if not raw:
            return []
        variants: list[str] = []
        for candidate in (raw, raw.split(",")[0].strip()):
            if not candidate:
                continue
            norm = MatchingService._port_norm(candidate)
            if not norm:
                continue
            if norm not in variants:
                variants.append(norm)
            stripped = re.sub(r"^port of\s+", "", norm)
            stripped = re.sub(r"\s+(port|harbou?r)$", "", stripped).strip()
            if stripped and stripped not in variants:
                variants.append(stripped)
        return variants

    @staticmethod
    def _port_key(value: str | None, key_map: dict[str, str]) -> str | None:
        """Resolve one port spelling to a catalogue key, or a name fallback."""
        variants = MatchingService._port_variants(value)
        if not variants:
            return None
        for variant in variants:
            key = key_map.get(variant)
            if key is not None:
                return key
        return f"name:{variants[-1]}"

    @staticmethod
    def _same_port(a: str | None, b: str | None, key_map: dict[str, str]) -> bool:
        """True when two port spellings mean the same port."""
        if not (a or "").strip() or not (b or "").strip():
            return False
        return MatchingService._port_key(a, key_map) == MatchingService._port_key(b, key_map)

    # ------------------------------------------------------------- categories
    @staticmethod
    def _profile_category(profile: Profile) -> str:
        """The company's ONE marketplace category (primary category name)."""
        try:
            return profile.primary_category_name or ""
        except Exception:  # pragma: no cover - defensive for detached profiles
            category = getattr(profile, "primary_category", None)
            return getattr(category, "name", "") or ""

    @staticmethod
    def _primary_category_matches(profile: Profile, target_type: str) -> bool:
        category = MatchingService._normalise(MatchingService._profile_category(profile))
        return bool(category) and category == target_type

    @staticmethod
    def _request_keywords(request: ServiceRequest) -> List[str]:
        """Category + subcategory + individual words of the title, lower-cased."""
        keywords = set()
        for raw in (request.service_type, request.subcategory):
            n = MatchingService._normalise(raw)
            if n:
                keywords.add(n)
        title = MatchingService._normalise(request.title)
        for word in title.replace("/", " ").replace("-", " ").split():
            if len(word) >= 3:
                keywords.add(word)
        return list(keywords)

    # ------------------------------------------------------------- service side
    @staticmethod
    def get_eligible_providers(db: Session, request: ServiceRequest) -> List[Profile]:
        """
        Return the verified service-provider Profiles eligible for a SERVICE request.

        Eligibility (all must hold):
        - user role == provider and profile verification_status == verified
        - EITHER the profile's Main Category is the requested service type,
          OR the provider owns an active `Service` whose name/service_id matches
          it (legacy rows stay valid, but never override the Main Category)
        - the provider serves the requested port (head office / other ports, or
          the matching Service row's port)
        """
        if request.request_type != RequestType.service:
            return []

        target_type = MatchingService._normalise(request.service_type)
        target_port = request.port
        key_map = MatchingService._port_key_map(db)

        profiles = (
            db.query(Profile)
            .join(User, User.id == Profile.user_id)
            .filter(User.role == UserRole.provider)
            .filter(Profile.verification_status == VerificationStatus.verified)
            .all()
        )

        eligible: List[Profile] = []
        seen: set[uuid.UUID] = set()
        for profile in profiles:
            legacy = MatchingService._legacy_service_speaks_for(
                profile, target_type, target_port, key_map
            )
            if legacy is not None:
                # A legacy Service row decides for this provider exactly as
                # before (including "matches the type but not the port").
                if legacy and profile.user_id not in seen:
                    eligible.append(profile)
                    seen.add(profile.user_id)
                continue

            # No legacy row speaks for this provider: the profile's Main
            # Category is its primary service category.
            if not MatchingService._primary_category_matches(profile, target_type):
                continue
            if not MatchingService._profile_serves_port(profile, target_port, key_map):
                continue
            if profile.user_id not in seen:
                eligible.append(profile)
                seen.add(profile.user_id)

        return eligible

    @staticmethod
    def _legacy_service_speaks_for(
        profile: Profile,
        target_type: str,
        target_port: str | None,
        key_map: dict[str, str],
    ) -> bool | None:
        """Legacy `Service` row verdict for this provider.

        ``True``  a matching active row serves the port
        ``False`` a matching active row exists but does not serve the port
        ``None``  no active row matches the requested type at all
        """
        matched = False
        for svc in profile.services or []:
            if not svc.is_active:
                continue
            if (
                MatchingService._normalise(svc.service_id) != target_type
                and MatchingService._normalise(svc.name) != target_type
            ):
                continue
            matched = True
            if not (target_port or "").strip():
                return True
            if MatchingService._same_port(svc.port_id, target_port, key_map):
                return True
            if not (svc.port_id or "").strip() and MatchingService._profile_serves_port(
                profile, target_port, key_map
            ):
                return True
        if not matched:
            return None
        # Preserve the original fallback: the profile itself may declare the port.
        return MatchingService._profile_serves_port(profile, target_port, key_map)

    @staticmethod
    def _profile_serves_port(
        profile: Profile, target_port: str | None, key_map: dict[str, str]
    ) -> bool:
        if not (target_port or "").strip():
            return True
        if any(
            MatchingService._same_port(port, target_port, key_map)
            for port in (profile.ports_served or [])
        ):
            return True
        return MatchingService._same_port(profile.head_office, target_port, key_map)

    # ------------------------------------------------------------ supply side
    @staticmethod
    def get_eligible_suppliers(db: Session, request: ServiceRequest) -> List[Profile]:
        """
        Return the verified supplier Profiles eligible for a SUPPLY request.

        Eligibility (all must hold):
        - user role == supplier and profile verification_status == verified
        - the supplier owns an APPROVED SupplyListing whose category / subcategory /
          name matches the requested supply type (or a title keyword)
        - when the listing declares served ports, the request's port must be one
          of them (compared through the canonical port catalogue, so
          "Mumbai" and "Mumbai Port" are the same port)
        """
        if request.request_type != RequestType.supply:
            return []

        keywords = MatchingService._request_keywords(request)
        target_port = request.port
        key_map = MatchingService._port_key_map(db)

        candidates = (
            db.query(Profile)
            .join(User, User.id == Profile.user_id)
            .join(SupplyListing, SupplyListing.supplier_id == Profile.user_id)
            .filter(User.role == UserRole.supplier)
            .filter(Profile.verification_status == VerificationStatus.verified)
            .filter(SupplyListing.status == SupplyListingStatus.approved)
            .all()
        )

        eligible: List[Profile] = []
        seen: set[uuid.UUID] = set()
        for profile in candidates:
            if profile.user_id in seen:
                continue
            listings = (
                db.query(SupplyListing)
                .filter(SupplyListing.supplier_id == profile.user_id)
                .filter(SupplyListing.status == SupplyListingStatus.approved)
                .all()
            )
            if MatchingService._any_listing_matches(listings, keywords, target_port, key_map):
                eligible.append(profile)
                seen.add(profile.user_id)
        return eligible

    @staticmethod
    def _any_listing_matches(
        listings: List[SupplyListing],
        keywords: List[str],
        target_port: str | None,
        key_map: dict[str, str],
    ) -> bool:
        for listing in listings:
            haystack = " ".join(
                filter(None, [
                    MatchingService._normalise(listing.name),
                    MatchingService._normalise(listing.category),
                    MatchingService._normalise(listing.subcategory),
                    MatchingService._normalise(listing.manufacturer),
                    MatchingService._normalise(listing.part_number),
                    MatchingService._normalise(listing.model_number),
                ])
            )
            keyword_hit = any(kw in haystack for kw in keywords) if keywords else False
            if not keyword_hit:
                continue

            ports = listing.ports or []
            if ports and (target_port or "").strip():
                if not any(
                    MatchingService._same_port(port, target_port, key_map)
                    for port in ports
                ):
                    continue
            return True
        return False

    # ------------------------------------------------------------------ bridge
    @staticmethod
    def get_eligible_recipients(db: Session, request: ServiceRequest) -> List[uuid.UUID]:
        """
        Resolve the recipient user ids for a request, branching on request_type.
        Returns an empty list for unknown/unsupported types.
        """
        if request.request_type == RequestType.service:
            return [p.user_id for p in MatchingService.get_eligible_providers(db, request)]
        if request.request_type == RequestType.supply:
            return [p.user_id for p in MatchingService.get_eligible_suppliers(db, request)]
        return []
