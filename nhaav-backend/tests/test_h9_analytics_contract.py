"""
H9 — AnalyticsDashboard trust-surface tests (wire-minimal rework, per
H9_ANALYTICS_AUDIT.md).

The /analytics page previously shipped an entirely fabricated analytics
template: "Success Rate 99.4%" (an H7-class trust claim with no backend
source), "Avg Response Time 2.4h", fabricated deltas, a fake Top Services
list, a fake provider leaderboard (Rotterdam Marine Services etc.), SVG
charts with invented data, a "Live Port Activity" map with invented hub
counts (14 Active Hubs, 4.2k/8.9k Daily Vol), filter dropdowns that filtered
nothing, a fake avatar, a dead "Schedule Cargo" button and a /support link
with no route.

The approved wire-minimal rework rewired the page to `GET /jobs/` and
`GET /profiles/providers` (used as-is, no invented verified-only filtering)
and removed every unsupported claim. These tests pin that contract on source
content, plus live-app route checks where applicable — no fake fixture.
"""
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "nhaav-frontend" / "src"
ANALYTICS = FRONTEND_SRC / "pages" / "Dashboard" / "AnalyticsDashboard" / "index.tsx"
ROUTER = FRONTEND_SRC / "router" / "index.tsx"

# Fabricated values / claims that must never return (H9_ANALYTICS_AUDIT.md §3)
BANNED = (
    "99.4%",                    # fabricated success rate (H7-class claim)
    "Success Rate",             # no success metric exists in the backend
    "2.4h",                     # fabricated response time
    "Avg Response Time",        # no response-time data anywhere
    "Rotterdam Marine Services",  # fake provider leaderboard
    "Singapore Logistics Hub",
    "Nordic Bergen Technical",
    "422 Jobs",                 # fake top services
    "Engine Repair",            # fabricated per-service aggregates
    "Hull Cleaning",            # (as an analytics value; category pages are separate)
    "Bunkering",
    "14 Active Hubs",           # fabricated port activity
    "4.2k Daily Vol",
    "8.9k Daily Vol",
    "Live Port Activity",
    "Daily Vol",
    "Schedule Cargo",           # dead control
    "PROF",                     # fake external avatar
    "aida-public",              # fake stock imagery domain used by the template
    "Revenue",                  # no revenue concept exists in the backend
    "vs last month",
    "+12%",
    "-4%",
    "-0.4h",
    "Main Sectors",             # fabricated donut
    "Jobs Over Time",           # invented time series
    "Service Categories",       # invented donut (no aggregate source)
    "googleusercontent",        # template imagery
)


def _src() -> str:
    return ANALYTICS.read_text(encoding="utf-8")


class TestFabricatedValuesRemoved:
    def test_analytics_contains_no_fabricated_values(self):
        src = _src()
        offenders = [b for b in BANNED if b in src]
        assert not offenders, f"Fabricated values back in AnalyticsDashboard: {offenders}"

    def test_no_invented_leaderboard_filtering(self):
        """Leaderboard uses GET /profiles/providers as-is — no invented rule."""
        src = _src()
        assert "verification" not in src.lower(), (
            "No invented verified-only leaderboard rule — use the endpoint as-is"
        )


class TestWiredToRealApis:
    def test_consumes_jobs_service(self):
        src = _src()
        assert "jobsService" in src and "getUserJobs" in src, (
            "Jobs KPIs must derive from GET /jobs/ via the existing service"
        )

    def test_consumes_providers_service(self):
        src = _src()
        assert "providersService" in src and "getProviders" in src, (
            "Leaderboard must derive from GET /profiles/providers via the existing service"
        )

    def test_job_counts_derived_from_status(self):
        src = _src()
        assert "'active'" in src and "'completed'" in src, (
            "Active/completed counts must be derived from real job statuses"
        )

    def test_has_loading_error_empty_states(self):
        src = _src()
        assert "Loading providers" in src
        assert "Could not load your jobs" in src
        assert "Could not load providers" in src
        assert "No jobs yet" in src
        assert "No providers listed yet" in src

    def test_provider_rows_link_to_existing_profile_route(self):
        src = _src()
        assert "/provider/" in src, "Leaderboard rows must link to the existing /provider/:id route"

    def test_dead_logout_destructure_removed(self):
        src = _src()
        assert "logout" not in src, "The dead logout destructure was removed in the rework"

    def test_dead_support_link_removed(self):
        src = _src()
        assert "/support" not in src, "The /support link had no route — must stay removed"


class TestRouteContract:
    def test_analytics_route_still_exists(self):
        router_src = ROUTER.read_text(encoding="utf-8")
        assert "path: '/analytics'" in router_src, "/analytics was intentionally retained"

    def test_backing_endpoints_exist_on_live_app(self):
        routes = [getattr(r, "path", None) for r in app.routes]
        assert "/jobs/" in routes
        assert "/profiles/providers" in routes

    def test_analytics_source_exists_for_this_guard(self):
        assert ANALYTICS.is_file(), f"Analytics source not found at {ANALYTICS}"
