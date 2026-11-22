"""
H9 Phase 4i — ShipOwner Dashboard & Admin surfaces honest-rework contract
(per H9_SHIPOWNER_ADMIN_AUDIT.md, approved §10 plan).

Before this pass: the client-facing ship-owner dashboard shipped hardcoded KPIs,
three invented quotation providers, a fake fleet persona, a fabricated IMPA-code
column, and mapped real quotes to nonexistent price/eta fields (rendering
"$undefined"). The admin area was worse: the index page was a fully static
mockup (invented user counts, procurement rows, support tickets, system
telemetry), the user-management page had no backend at all (invented personal
data, a KYC success-rate KPI, and action menus where nothing was clickable),
the marketplace-services page generated per-row ratings/views with Math.random()
on every render, the admin procurement page was 100% static, and the sidebar's
sign-out handler compared against the wrong label so the admin JWT was never
cleared.

Approved rework: dashboards render only real API data, the unsupported
user-management surface was removed outright, the two backed admin pages were
wired to their real endpoints, and the sign-out bug was fixed. As always, no
ranking/scoring of quotations was introduced.

Bans are scoped to specific files; the same strings may legitimately exist on
still-queued surfaces.
"""
import re
from pathlib import Path

from fastapi.testclient import TestClient  # noqa: F401  (kept for parity with sibling contracts)

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "nhaav-frontend" / "src"
ROUTER = FRONTEND_SRC / "router" / "index.tsx"
ADMIN_SIDEBAR = FRONTEND_SRC / "components" / "AdminSidebar.tsx"
SHIP_OWNER = FRONTEND_SRC / "pages" / "Dashboard" / "ShipOwnerDashboard" / "ShipOwnerDashboard.tsx"
ADMIN_INDEX = FRONTEND_SRC / "pages" / "Admin" / "index.tsx"
ADMIN_USERS_PAGE = FRONTEND_SRC / "pages" / "Admin" / "AdminUsersPage.tsx"
ADMIN_USERS_SHIM = FRONTEND_SRC / "pages" / "Admin" / "AdminUsers.tsx"
MARKETPLACE_SERVICES = FRONTEND_SRC / "pages" / "Admin" / "MarketplaceServices.tsx"
ADMIN_PROCUREMENT = FRONTEND_SRC / "pages" / "Admin" / "ProcurementRequests.tsx"
PROVIDER_VERIFICATION = FRONTEND_SRC / "pages" / "Admin" / "ProviderVerification.tsx"
ADMIN_LOGIN = FRONTEND_SRC / "pages" / "Admin" / "AdminLogin.tsx"
ADMIN_SERVICE = FRONTEND_SRC / "services" / "adminOverview.ts"

TEXT_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".json", ".md", ".svg"}


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def _src_tree_files() -> list[Path]:
    return [
        p for p in FRONTEND_SRC.rglob("*")
        if p.is_file() and p.suffix.lower() in TEXT_SUFFIXES
    ]


# ---------------------------------------------------------------- ShipOwner


class TestShipOwnerFabricationRemoval:
    def test_sample_data_blocks_are_gone(self):
        src = _read(SHIP_OWNER)
        for const in ("QUOTATIONS_DEFAULTS", "SPEND_CATS", "TOP_PROVIDERS", "TIMELINE_DATA"):
            assert const not in src, f"Fabricated block {const} must stay deleted"

    def test_persona_and_fleet_chips_are_gone(self):
        src = _read(SHIP_OWNER)
        banned = (
            "Captain John", "Maersk", "Data updated 2m ago",
            "Top in Singapore", "SINGAPORE (SGSIN)",
        )
        offenders = [b for b in banned if b in src]
        assert not offenders, f"Persona fabrications back in ShipOwnerDashboard: {offenders}"

    def test_invented_providers_and_metrics_are_gone(self):
        src = _read(SHIP_OWNER)
        banned = (
            "OceanTech Marine", "Global Marine Supply", "DeepSea Parts",
            "SinMar Tech", "Pacific Marine",
            "Verified Provider", "Verified Jobs",
            "Invoice #INV-892", "#4505",
            "Total Price (Locked)", "Official Quotation", "Tax Applied",
        )
        offenders = [b for b in banned if b in src]
        assert not offenders, f"Fabricated values back in ShipOwnerDashboard: {offenders}"

    def test_fake_impa_column_is_gone(self):
        assert "IMPA" not in _read(SHIP_OWNER), (
            "The dead IMPA-code header (uuid fragment shown as an industry code) must stay gone"
        )

    def test_no_stock_imagery(self):
        src = _read(SHIP_OWNER)
        assert "aida-public" not in src and "images.unsplash.com" not in src

    def test_identity_comes_from_the_session_user(self):
        src = _read(SHIP_OWNER)
        assert "useAuth" in src and "displayName" in src, (
            "Welcome/header identity must come from the authenticated user"
        )


class TestShipOwnerRealWiring:
    def test_maps_real_quote_fields(self):
        src = _read(SHIP_OWNER)
        assert "q.amount" in src, "Quote cards must render the real amount field"
        assert "q.currency" in src
        # The old mapping bugs: backend has no price/eta fields on QuoteResponse.
        assert "q.price" not in src and "q.eta" not in src, (
            "Quotes must not be mapped to nonexistent price/eta fields"
        )

    def test_provider_names_via_profile_api(self):
        src = _read(SHIP_OWNER)
        assert "getProviderById" in src, (
            "Provider names must come from the existing profile API"
        )

    def test_actions_are_wired_and_status_gated(self):
        src = _read(SHIP_OWNER)
        assert "acceptQuote" in src and "rejectQuote" in src
        assert "submitted" in src, "Accept/Reject must be gated to pending (submitted) quotes"

    def test_kpis_derived_from_real_state(self):
        src = _read(SHIP_OWNER)
        assert "getUserRequests" in src and "getQuotesForRequest" in src
        assert "openCount" in src and "pendingCount" in src and "quotesList.length" in src

    def test_no_ranking_or_scoring(self):
        src = _read(SHIP_OWNER)
        assert not re.search(r"(matchScore|bestQuote|recommended|score\s*=|ranked)", src), (
            "No quote ranking or recommendation logic is permitted"
        )

    def test_verification_link_still_pinned(self):
        # Predecessor pin from test_h9_upload_contract.py, restated here for clarity.
        assert "'/verification'" in _read(SHIP_OWNER)


# ---------------------------------------------------------------- Admin index


class TestAdminIndexHonestRework:
    def test_fabricated_kpis_are_gone(self):
        src = _read(ADMIN_INDEX)
        banned = (
            "12,480", "99.98", "+12% MoM", "Platform Health",
            "Operational Terminal", "Revenue &amp; User Growth", "CPU Load",
            "24ms", "Latency",
        )
        offenders = [b for b in banned if b in src]
        assert not offenders, f"Fabricated platform metrics back in Admin index: {offenders}"

    def test_fabricated_rows_are_gone(self):
        src = _read(ADMIN_INDEX)
        banned = (
            "Ever Vanguard", "Evergreen Marine", "Maersk Altair", "Maersk Line",
            "CMA CGM", "Berth 12B", "$142,500.00",
            "Nordic Logistics", "Pacific Port Auth", "Suez Canal Group",
            "API Connection Timeout", "Billing Dispute", "INV-928",
            "Singapore Hub", "Port Hubs", "System Telemetry",
        )
        offenders = [b for b in banned if b in src]
        assert not offenders, f"Fabricated rows/panels back in Admin index: {offenders}"

    def test_dead_action_buttons_are_gone(self):
        src = _read(ADMIN_INDEX)
        # Match the label as a JSX TEXT NODE — a control's own label — rather
        # than any substring. The stat card "Ready To Approve" is a KPI, not a
        # dead button, and must not be mistaken for the removed action.
        for dead in ("Export Report", "Quick Actions", "Filter by Vessel", "Approve"):
            pattern = rf">\s*{re.escape(dead)}\s*<"
            assert re.search(pattern, src) is None, (
                f"Dead control '{dead}' must stay removed"
            )

    def test_real_kpi_source_wired(self):
        src = _read(ADMIN_INDEX)
        assert "adminOverviewService.getOverview" in src, (
            "The only real admin KPI source (/admin/overview aggregates) must stay wired"
        )
        # Each KPI must read a server-computed aggregate, never a constant.
        for field in (
            "data.accounts.total", "data.accounts.vendors",
            "data.verification.pending", "data.payments.awaiting_review",
            "data.visibility.active", "data.procurement.requests_open",
            "data.procurement.quotes_live",
        ):
            assert field in src, f"KPI {field} must come from the overview aggregate"
        assert "adminClient.get('/admin/overview')" in _read(ADMIN_SERVICE), (
            "The overview service must call the real aggregate endpoint"
        )

    def test_launcher_links_to_real_surfaces(self):
        src = _read(ADMIN_INDEX)
        router = _read(ROUTER)
        for pin in (
            "/admin/accounts", "/admin/verification", "/admin/vendors",
            "/admin/procurement", "/admin/payments", "/admin/profile-visibility",
        ):
            assert pin in src, f"Launcher {pin} must stay on the admin index"
            assert f"path: '{pin}'" in router, (
                f"Launcher target {pin} must be a real route"
            )

    def test_no_stock_imagery(self):
        src = _read(ADMIN_INDEX)
        assert "aida-public" not in src


# ------------------------------------------------------- AdminUsers removal


class TestAdminUsersSurfaceRemoved:
    def test_files_are_gone(self):
        assert not ADMIN_USERS_PAGE.exists()
        assert not ADMIN_USERS_SHIM.exists()

    def test_no_source_references_remain(self):
        offenders = []
        for p in _src_tree_files():
            if "AdminUsersPage" in _read(p):
                offenders.append(str(p.relative_to(FRONTEND_SRC)))
        assert not offenders, f"Dangling references to the removed page: {offenders}"

    def test_router_has_no_admin_users_route(self):
        assert "/admin/users" not in _read(ROUTER)

    def test_sidebar_has_no_user_management_entry(self):
        assert "'/admin/users'" not in _read(ADMIN_SIDEBAR)

    def test_invented_user_data_is_gone_from_src(self):
        banned = (
            "Anders Lindgren", "Chen Wei", "Marcus Thorne",
            "anders.l@nordicship.no", "98.4%", "1,822", "2,481",
        )
        offenders: dict[str, list[str]] = {}
        for p in _src_tree_files():
            text = _read(p)
            for b in banned:
                if b in text:
                    offenders.setdefault(b, []).append(str(p.relative_to(FRONTEND_SRC)))
        assert not offenders, f"Invented user/KYC data reintroduced: {offenders}"


# ------------------------------------------------------ MarketplaceServices


class TestMarketplaceServicesHonestRework:
    def test_random_fabrication_is_gone(self):
        src = _read(MARKETPLACE_SERVICES)
        assert "Math.random" not in src, (
            "Per-row random ratings/views/leads must never come back"
        )
        assert "getStatusForService" not in src and "idx % 5" not in src, (
            "Status must not be derived from row position"
        )

    def test_hardcoded_kpis_are_gone(self):
        src = _read(MARKETPLACE_SERVICES)
        banned = ("totalServices = ", "pendingReviews", "featuredServices", "monthlyLeads",
                  "Advanced Filters", "New Service Entry", "Featured")
        offenders = [b for b in banned if b in src]
        assert not offenders, f"Hardcoded KPIs/dead controls back in MarketplaceServices: {offenders}"

    def test_real_totals_wired(self):
        src = _read(MARKETPLACE_SERVICES)
        assert "apiClient.get('/marketplace/services'" in src
        assert "res.data.total" in src and "res.data.pages" in src, (
            "Real total/pages from the API must drive the KPIs and pagination"
        )
        assert "verified_provider_count" in src and "ports_covered" in src, (
            "Real per-service aggregates must be displayed"
        )


# ----------------------------------------------------- Admin procurement


class TestAdminProcurementWired:
    def test_sample_rows_are_gone(self):
        src = _read(ADMIN_PROCUREMENT)
        banned = (
            "SAMPLE_REQUESTS", "PRQ-8821", "PR-2023-9021", "Blue Titan",
            "MS Arctic", "Orient Express", "Sea Pioneer", "Ocean Guardian",
            "Nordic Star", "EuroNav Ltd", "Global Marin",
            "842", "$12.4M", "Avg Quotations",
            "New Manual Entry", "Export Report", "GLOBAL OPS",
        )
        offenders = [b for b in banned if b in src]
        assert not offenders, f"Static sample data back in admin procurement: {offenders}"

    def test_real_endpoint_wired_with_supported_params(self):
        src = _read(ADMIN_PROCUREMENT)
        service = _read(ADMIN_SERVICE)
        assert "adminOverviewService.getProcurementRequests" in src, (
            "Must read the real paginated oversight endpoint"
        )
        assert "adminClient.get('/admin/procurement/requests'" in service, (
            "The oversight call must hit GET /admin/procurement/requests"
        )
        # Only filters the endpoint actually supports may be sent.
        for param in ("params.status", "params.request_type", "params.q",
                      "params.created_from", "params.created_to"):
            assert param in src, f"Supported filter {param} must be sent"
        assert "params.port" not in src, (
            "The endpoint has no port filter; port matches through the q search"
        )
        assert "adminOverviewService.getProcurementSummary" in src, (
            "KPI counts must come from the server-side summary, not the page rows"
        )
        assert "requests_by_status" in src and "quotes_total" in src
        assert "data.total" in src and "data.pages" in src


# -------------------------------------------- ProviderVerification + sidebar


class TestVerificationLabelsAndSignOut:
    def test_document_score_label_is_completion_not_confidence(self):
        src = _read(PROVIDER_VERIFICATION)
        assert "Field Completion:" in src, "H7 wording must be used for the document score"
        assert "Confidence Score:" not in src

    def test_no_hardcoded_pdf_label(self):
        assert '"PDF Document"' not in _read(PROVIDER_VERIFICATION)

    def test_sign_out_clears_the_admin_jwt(self):
        src = _read(ADMIN_SIDEBAR)
        assert "adminAuthService.logout()" in src
        assert "Sign Out" in src
        # The old bug: handler checked a label that no item had.
        assert "=== 'Logout'" not in src, "Sign-out handler must match the actual label"

    def test_duplicate_stub_nav_entries_gone(self):
        src = _read(ADMIN_SIDEBAR)
        assert "System Logs" not in src, "Unbacked stub nav entries must stay removed"

    def test_admin_login_surface_intact(self):
        src = _read(ADMIN_LOGIN)
        assert "adminAuthService.login" in src


# ------------------------------------------------------------- Router pins


class TestRouteContract:
    def test_admin_router_pinned(self):
        src = _read(ROUTER)
        for pin in ('/ship-owner', "'/admin'", "'/admin/verification'",
                    "'/admin/marketplace-services'", "'/admin/procurement'", "'/admin/login'"):
            assert pin in src, f"Route {pin} must remain"

    def test_live_backend_routes_exist(self):
        routes = [getattr(r, "path", None) for r in app.routes]
        for pin in ("/admin/verification/stats", "/admin/auth/login",
                    "/requests/", "/marketplace/services",
                    "/quotes/request/{request_id}"):
            assert pin in routes, f"Backend route {pin} must exist"


# ------------------------------------------------- Imagery sweep (Phase 4j)

# Stock imagery ban: after the sweep, no aida-public/googleusercontent URLs may
# remain anywhere in the frontend source tree. Avatars are initials from the
# signed-in user; decorative panels are CSS gradients/grid patterns; the one
# photographic background uses the bundled local asset.
IMAGERY_FILES = [
    "pages/Dashboard/ProviderDashboard/index.tsx",
    "pages/Dashboard/ProviderDashboard/MyServices.tsx",
    "pages/Dashboard/ShipOwnerDashboard/ShipOwnerDashboard.tsx",
    "pages/Landing/index.tsx",
    "pages/Marketplace/Marketplace.tsx",
    "pages/Notifications/index.tsx",
    "pages/Procurement/ProcurementRequests/CreateProcurementRequest.tsx",
    "pages/Profile/CompanyProfile.tsx",
    "pages/Register/Register.tsx",
]
IMAGERY_BANNED = ("aida-public", "googleusercontent")


class TestImagerySweep:
    def test_no_stock_imagery_anywhere_in_src(self):
        offenders = []
        for rel in IMAGERY_FILES:
            src = _read(FRONTEND_SRC / rel)
            hits = [b for b in IMAGERY_BANNED if b in src]
            if hits:
                offenders.append((rel, hits))
        assert not offenders, f"Stock imagery URLs must stay removed: {offenders}"

    def test_provider_dashboard_reviews_are_real(self):
        src = _read(FRONTEND_SRC / "pages/Dashboard/ProviderDashboard/index.tsx")
        assert "profilesService.getMyProfile" in src, "Reviews must key off the real profile"
        assert "getProviderReviews" in src, "Reviews must come from the reviews API"
        assert "Capt. Mikhail Sokolov" not in src, "Fabricated reviewer must stay removed"
        assert "Elena Rodriguez" not in src, "Fabricated reviewer must stay removed"
        assert "OceanTech Marine Services" not in src, "Fabricated persona must stay removed"

    def test_register_uses_bundled_asset(self):
        src = _read(FRONTEND_SRC / "pages/Register/Register.tsx")
        assert "ship-ocean.jpg" in src, "Register background must use the bundled asset"

    def test_wired_avatars_use_identity_not_stock(self):
        for rel in ("pages/Dashboard/ShipOwnerDashboard/ShipOwnerDashboard.tsx",
                    "pages/Marketplace/Marketplace.tsx",
                    "pages/Procurement/ProcurementRequests/CreateProcurementRequest.tsx"):
            src = _read(FRONTEND_SRC / rel)
            assert "useAuth" in src, f"{rel} avatar must derive from the signed-in user"
            assert "full_name || user?.name" in src, f"{rel} must follow the display-name convention"
