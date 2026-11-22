"""
H9 Phase 4g — ServiceDetails honest-rework contract (per H9_SERVICEDETAILS_AUDIT.md,
approved Option 1).

The page previously rendered a ~560-line hardcoded per-category content map
(CATEGORY_CONTENT + DEFAULT_CONTENT) as if it were provider truth: invented client
reviews ("Maersk Atlantic", "saved us $2M"), static certification grids (ISO 9001,
DNV GL, CLASS APPR., ...), fabricated SLAs/warranties/country counts, vessel
compatibility claims, a "Response Rate 98%" chip, "24x7 Support Active", dead
"Save Service"/share controls, and — worst — a rating computed by formula
(Math.min(totalProviders * 4.6 + 0.2, 5.0)) with review counts derived the same way
(totalProviders * 12). Algorithmically fabricated trust signals are harder to spot
than hardcoded ones, so they are pinned explicitly.

Approved rework: the page now renders ONLY what the aggregated service API returns
(provider counts, port coverage, per-port providers, description) plus honest
platform-voice guidance. Category content maps, stock imagery, fabricated metrics,
and dead routes (/service/:listingId, /service/:providerId/:skill — no in-app
callers, and the backend has no GET /marketplace/services/{id} endpoint to support
them) were removed.

Bans are file-scoped to pages/Marketplace/ServiceDetails.tsx: the same fabricated
strings legitimately belong to the audit queue of other pages
(ProcurementOpportunities, CompareQuotations, SubmitQuotation).
"""
import os
import re
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "nhaav-frontend" / "src"
SERVICE_DETAILS = FRONTEND_SRC / "pages" / "Marketplace" / "ServiceDetails.tsx"
ROUTER = FRONTEND_SRC / "router" / "index.tsx"
MARKETPLACE_SVC = FRONTEND_SRC / "services" / "marketplace.ts"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class TestFabricatedContentMapRemoved:
    def test_category_content_maps_are_gone(self):
        src = _read(SERVICE_DETAILS)
        assert "CATEGORY_CONTENT" not in src, "The fabricated per-category content map must stay deleted"
        assert "DEFAULT_CONTENT" not in src, "The fabricated fallback content map must stay deleted"
        assert "CATEGORY_IMAGES" not in src and "STORE_IMAGES" not in src, (
            "Hardcoded stock imagery maps must stay deleted"
        )

    def test_fabricated_trust_strings_are_gone(self):
        src = _read(SERVICE_DETAILS)
        banned = (
            # Invented reviews and their companies/roles
            "Maersk Atlantic", "Star Pacific Shipping", "Nordic Pioneer",
            "Carnival Pacific", "Blue Water Shipping", "SafeVoyage Marine",
            "Vanguard Marine", "Client Feedback",
            # Certification claims with no verification source
            "ISO 9001", "DNV GL", "ISO 14001", "ISO 17020", "ISO 28000",
            "CLASS APPR.", "IMCA", "OEM CERT", "OEM AUTH", "BIMCO",
            # Fabricated metrics and spec labels
            "Response Rate", "RESPONSE SLA", "COUNTRIES SERVED",
            "EST. LEAD TIME", "MIN. ORDER", "WARRANTY",
            # Fabricated sections
            "Vessel Compatibility", "Commercial Terms", "24x7 Support Active",
            # Dead controls
            "Save Service",
        )
        offenders = [b for b in banned if b in src]
        assert not offenders, f"Fabricated trust signals back in ServiceDetails: {offenders}"

    def test_formula_derived_rating_is_gone(self):
        """The worst finding: a rating computed from a provider count."""
        src = _read(SERVICE_DETAILS)
        assert "4.6 + 0.2" not in src and "* 4.6" not in src
        assert "* 12" not in src, "Reviews must not be derived from provider counts"
        assert "Math.min(totalProviders" not in src

    def test_no_stock_imagery_left(self):
        src = _read(SERVICE_DETAILS)
        assert "images.unsplash.com" not in src
        assert "aida-public" not in src

    def test_no_dead_auth_or_unused_state(self):
        src = _read(SERVICE_DETAILS)
        assert "useAuth" not in src and "isAuthenticated" not in src, (
            "Dead auth wiring was removed with the fabricated gate"
        )


class TestApiBackedSectionsRetained:
    def test_real_api_consumption_is_pinned(self):
        src = _read(SERVICE_DETAILS)
        assert "getServiceDetail" in src, "Must keep consuming the aggregated service API"
        assert "getPortAvailability" in src
        assert "verified_provider_count" in src or "totalProviders" in src
        assert "port_coverage" in src

    def test_honest_fallbacks_are_pinned(self):
        src = _read(SERVICE_DETAILS)
        assert "No description has been added for this service yet." in src
        assert "No Port Coverage Data" in src
        # Fabricated default description must not return.
        assert "defaultDescription" not in src

    def test_real_per_port_provider_rows_are_pinned(self):
        src = _read(SERVICE_DETAILS)
        assert "company_name" in src and "rating_avg" in src, (
            "Real per-port provider data must stay rendered"
        )
        assert "badge_label" in src, "Verified badge must stay tied to the real badge_label"

    def test_request_action_still_routes_to_create_request(self):
        src = _read(SERVICE_DETAILS)
        assert "/create-request" in src


class TestRouteContract:
    def test_dead_service_routes_are_gone(self):
        """No in-app callers and no backing endpoint existed for these."""
        src = _read(ROUTER)
        assert "/service/:listingId" not in src
        assert "/service/:providerId" not in src
        assert "/marketplace/service/:category" in src, "Live aggregated route must stay"

    def test_dead_service_by_id_method_is_gone(self):
        src = _read(MARKETPLACE_SVC)
        assert "getServiceById" not in src, (
            "getServiceById targeted a nonexistent endpoint and had zero callers"
        )

    def test_live_backend_aggregate_endpoints_exist(self):
        routes = [getattr(r, "path", None) for r in app.routes]
        assert "/marketplace/services/aggregate/{service_name}" in routes
        assert "/marketplace/services/aggregate/{service_name}/availability" in routes

    def test_service_param_prefill_only_uses_real_title_field(self):
        """ServiceDetails may pass ?service= only because ServiceRequestCreate
        has a real title field to receive it — no invented query parameter."""
        src = _read(SERVICE_DETAILS)
        assert "params.set('service'" in src
