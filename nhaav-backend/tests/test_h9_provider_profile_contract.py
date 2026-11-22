"""
H9 — ProviderProfile trust-surface tests (honest-wire rework, per
H9_PROVIDER_PROFILE_AUDIT.md).

/provider/:id was a fully static template that ignored its id param: fabricated
company ("North Sea Maritime Repairs"), "99.2% Success Rate" (H7-class claim),
"Titanium Verified" badge, fake reviews (Maersk Line / Hapag-Lloyd), fake
vessel/team/response-time data, stock imagery, and dead actions.

The approved honest-wire rework fetches real data — /provider/me via
GET /profiles/me, /provider/:id via GET /profiles/{profile_id} (Profile.id
keyed), reviews via GET /reviews/provider/{user_id} — and removes every
unsupported claim. The Analytics leaderboard link convention bug (user_id vs
profile id) is fixed and pinned here too. No fake fixtures; source-contract
assertions plus live-app endpoint checks.
"""
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "nhaav-frontend" / "src"
PROFILE_PAGE = FRONTEND_SRC / "pages" / "Marketplace" / "ProviderProfile.tsx"
ANALYTICS_PAGE = FRONTEND_SRC / "pages" / "Dashboard" / "AnalyticsDashboard" / "index.tsx"
ROUTER = FRONTEND_SRC / "router" / "index.tsx"

# Fabricated values that must never return (H9_PROVIDER_PROFILE_AUDIT.md §4)
BANNED = (
    "North Sea Maritime Repairs",   # fabricated company
    "99.2%",                        # fabricated success rate (H7 class)
    "Success Rate",                 # no such metric exists in the backend
    "Titanium Verified",            # fabricated badge
    "450+",                         # fabricated job count
    "1.8 Hours",                    # fabricated response time
    "Avg. Quote Response",          # no response-time data
    "Avg. Completion",              # no completion-time data
    "150+",                         # fake team statistics
    "Marine Engineers",             # fake team stats
    "Maersk Line",                  # fabricated review
    "Hapag-Lloyd",                  # fabricated review
    "Maersk Tianjin",               # fabricated vessel
    "Berlin Express",               # fabricated vessel
    "Supported Vessels",            # no vessel-type data exists
    "Heavy Welding",                # fabricated expertise cards
    "Hydraulic Repairs",            # fabricated service chips (no real listing)
    "Underwater Inspection",        # fabricated service chip
    "Mumbai Port",                  # fabricated port lists
    "Chennai Port",
    "Deendayal",
    "+10 More",                     # invented count suffix
    "Verified Unit Slot",           # fabricated slot claim
    "38",                           # fabricated lead counts
    "14 Active Hubs",
    "Capt. Erik Sorensen",          # fabricated contact
    "120 Minutes",                  # fabricated response claim
    "aida-public",                  # stock imagery
    "googleusercontent",            # stock imagery
    "Message Provider",             # no messaging system exists
    "ISO 9001",                     # fabricated certifications
    "Lloyds Register",
    "DNV GL",
)


def _profile_src() -> str:
    return PROFILE_PAGE.read_text(encoding="utf-8")


class TestFabricatedValuesRemoved:
    def test_profile_contains_no_fabricated_values(self):
        src = _profile_src()
        offenders = [b for b in BANNED if b in src]
        assert not offenders, f"Fabricated values back in ProviderProfile: {offenders}"

    def test_no_stock_imagery(self):
        src = _profile_src()
        assert "http://" not in src and "https://" not in src, (
            "No external stock imagery — provider page renders API data only"
        )


class TestWiredToRealApis:
    def test_fetches_by_id_via_providers_service(self):
        src = _profile_src()
        assert "getProviderById" in src, "Third-party view must use GET /profiles/{profile_id}"

    def test_me_path_uses_own_profile_endpoint(self):
        src = _profile_src()
        assert "getMyProfile" in src and "me" in src, (
            "/provider/me must resolve via GET /profiles/me"
        )

    def test_reviews_fetched_via_user_id_endpoint(self):
        src = _profile_src()
        assert "getProviderReviews" in src, "Reviews must come from GET /reviews/provider/{user_id}"

    def test_real_fields_wired(self):
        src = _profile_src()
        for field in (
            "company_name", "verification_status", "badge_label",
            "availability_status", "years_experience", "jobs_completed",
            "rating_avg", "ports_served", "skills", "licenses", "offices",
            "contacts", "bio",
        ):
            assert field in src, f"ProfileResponse field '{field}' must be rendered"

    def test_empty_optional_sections_hidden_not_placeholder(self):
        src = _profile_src()
        # Hide-when-empty pattern: sections render conditionally on list length
        for field in ("licenses.length", "offices.length", "ports.length", "skills.length"):
            assert field in src, f"'{field}' section must be hidden when empty"

    def test_explicit_ui_states(self):
        src = _profile_src()
        assert "Loading profile" in src
        assert "Provider not found" in src
        assert "Could not load this provider profile" in src
        assert "Retry" in src
        assert "No reviews yet" in src
        assert "Loading reviews" in src


class TestAnalyticsLinkConvention:
    def test_analytics_links_by_profile_id_not_user_id(self):
        """GET /profiles/{profile_id} is keyed by Profile.id — the leaderboard
        must navigate with p.id, not p.user_id (which would 404)."""
        src = ANALYTICS_PAGE.read_text(encoding="utf-8")
        assert "/provider/${p.id}" in src
        assert "p.user_id" not in src, "user_id is NOT the profile endpoint key"


class TestRouteContract:
    def test_provider_route_still_exists(self):
        router_src = ROUTER.read_text(encoding="utf-8")
        assert "path: '/provider/:id'" in router_src

    def test_backing_endpoints_exist_on_live_app(self):
        routes = [getattr(r, "path", None) for r in app.routes]
        assert "/profiles/me" in routes
        assert "/profiles/providers" in routes
        assert "/reviews/provider/{provider_id}" in routes
        # The dynamic detail route registers as "/profiles/{profile_id}"
        assert any(r and r.startswith("/profiles/{") for r in routes), (
            "GET /profiles/{profile_id} detail route must exist"
        )

    def test_profile_page_source_exists_for_this_guard(self):
        assert PROFILE_PAGE.is_file()
