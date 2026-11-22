"""
H9 Phase 4e — Upload page removal contract (per H9_UPLOAD_AUDIT.md, Option 1).

The /upload page shipped the largest fabrication cluster in the client: a fake
onboarding stepper ("Profile — done"), fabricated LIVE_STATUS chips ("Certificate
of Registry VERIFIED"), invented REQUIRED document cards (Tonnage/ISPS), a
hardcoded "Maersk Tianjin / IMO 9632117" vessel block, a "Bulk Import" button
with no handler, a dead "Save Progress" button, an unverifiable "Encrypted
Connection" badge, a false "MAX 50 MB" formats line (real limit is 25 MB), a
marketing claim about cross-referencing "global port authorities and IMO
databases" (no such integration), and — most consequential — a hardcoded
document_type="vendor_registration" appended to every upload, which persisted
user documents under the wrong classification in the database.

Per the approved audit (H9_UPLOAD_AUDIT.md §10 Option 1) the page was deleted,
the /upload route pin removed, and all inbound links re-pointed to the
canonical /verification page. These tests pin that contract. Like the other H9
frontend-contract tests, they assert on frontend source content plus the live
FastAPI app where applicable.

Shared-string caution (H9_UPLOAD_AUDIT.md §8): "Maersk Tianjin" also appears in
ProcurementOpportunities.tsx (queued for a later audit) and the heading
"Trust is our / primary anchor" legitimately belongs to /verification — bans
below are scoped so those remain out of scope here.
"""
import os
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "nhaav-frontend" / "src"
ROUTER = FRONTEND_SRC / "router" / "index.tsx"
CLIENT_SIDEBAR = FRONTEND_SRC / "components" / "ClientSidebar.tsx"
PROVIDER_SIDEBAR = FRONTEND_SRC / "components" / "ProviderSidebar.tsx"
LEGACY_SIDEBAR = FRONTEND_SRC / "components" / "Sidebar.tsx"
DASHBOARD = FRONTEND_SRC / "pages" / "Dashboard" / "index.tsx"
SHIP_OWNER_DASHBOARD = (
    FRONTEND_SRC / "pages" / "Dashboard" / "ShipOwnerDashboard" / "ShipOwnerDashboard.tsx"
)
UPLOAD_DIR = FRONTEND_SRC / "pages" / "Upload"

# Upload-only fabricated strings (full list in H9_UPLOAD_AUDIT.md §8).
BANNED_IN_FRONTEND_SRC = (
    "IMO 9632117",             # hardcoded vessel identifier (Upload only)
    "Bulk Import",             # dead button, no backend bulk endpoint
    "Save Progress",           # dead button, no handler
    "Encrypted Connection",    # unverifiable system claim
    "MAX 50 MB",               # false limit; real cap is 25 MB
    "50 MB",
    "Deposit Vessel Certificates",
)
BANNED_SENTENCES = (
    # Marketing claim with no integration behind it.
    "global port authorities and IMO databases",
    # Invented obligations; backend imposes no per-document requirements.
    "International Tonnage",
    "ISPS Certification",
    "Onboarding Phase 02",     # no onboarding state machine exists
    "Live Verification Status",
)
BANNED_IN_ROUTER = ("pages/Upload", "/upload")


TEXT_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".json", ".md", ".svg",
}


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _src_tree_files() -> list[Path]:
    return [
        p for p in FRONTEND_SRC.rglob("*")
        if p.is_file() and p.suffix.lower() in TEXT_SUFFIXES
    ]


class TestUploadPageRemoved:
    def test_upload_directory_is_gone(self):
        assert not UPLOAD_DIR.exists(), (
            "pages/Upload/ was approved for removal (Option 1) and must stay gone"
        )

    def test_router_has_no_upload_route(self):
        src = _read(ROUTER)
        offenders = [b for b in BANNED_IN_ROUTER if b in src]
        assert not offenders, f"/upload route remnants in router: {offenders}"

    def test_no_source_file_references_the_upload_page(self):
        offenders = []
        for p in _src_tree_files():
            text = _read(p)
            if "pages/Upload" in text or "UploadPage" in text:
                offenders.append(str(p.relative_to(FRONTEND_SRC)))
        assert not offenders, f"Dangling references to the removed page: {offenders}"

    def test_live_app_has_no_upload_page_route(self):
        """FastAPI serves /documents/upload (API), but no page route contract exists.

        This pins that the frontend router file is the only router surface and
        that the backend was never asked to serve the removed page.
        """
        routes = [getattr(r, "path", None) for r in app.routes]
        assert "/documents/upload" in routes, "real API upload endpoint must remain"
        assert "/upload" not in routes, "no bare /upload page/API route may exist"


class TestInboundLinksRepointed:
    def test_client_sidebar_links_to_verification(self):
        src = _read(CLIENT_SIDEBAR)
        assert "path: '/upload'" not in src
        assert src.count("path: '/verification'") >= 3, (
            "Upload Documents / My Documents / Verification Status must all resolve "
            "to the canonical /verification page"
        )
        assert "currentPath.includes('/upload')" not in src, (
            "expanded-state logic must not reference the removed route"
        )

    def test_provider_sidebar_links_to_verification(self):
        src = _read(PROVIDER_SIDEBAR)
        assert "path: '/upload'" not in src
        assert "currentPath.includes('/upload')" not in src

    def test_legacy_sidebar_links_to_verification(self):
        src = _read(LEGACY_SIDEBAR)
        assert "'/upload'" not in src
        assert "path: '/verification'" in src

    def test_dashboard_ctas_link_to_verification(self):
        src = _read(DASHBOARD)
        assert "navigate('/upload')" not in src
        assert "navigate('/verification')" in src

    def test_ship_owner_dashboard_links_to_verification(self):
        src = _read(SHIP_OWNER_DASHBOARD)
        assert "'/upload'" not in src
        assert "'/verification'" in src


class TestFabricatedValuesRemoved:
    def test_upload_fabricated_strings_are_gone(self):
        offenders: dict[str, list[str]] = {}
        for p in _src_tree_files():
            text = _read(p)
            for b in BANNED_IN_FRONTEND_SRC:
                if b in text:
                    offenders.setdefault(b, []).append(str(p.relative_to(FRONTEND_SRC)))
        assert not offenders, f"Upload fabrications reintroduced: {offenders}"

    def test_hardcoded_upload_document_type_is_gone(self):
        """The D-1 finding: every upload was persisted as vendor_registration."""
        for p in _src_tree_files():
            text = _read(p)
            assert "document_type\", \"vendor_registration\"" not in text, (
                f"{p.relative_to(FRONTEND_SRC)} must not hardcode document_type"
            )

    def test_banned_sentences_are_gone(self):
        offenders: dict[str, list[str]] = {}
        for p in _src_tree_files():
            text = _read(p)
            for b in BANNED_SENTENCES:
                if b in text:
                    offenders.setdefault(b, []).append(str(p.relative_to(FRONTEND_SRC)))
        assert not offenders, f"Banned fabricated sentences reintroduced: {offenders}"


class TestCanonicalSurfaceIntact:
    def test_verification_page_still_owns_upload_flow(self):
        ver = FRONTEND_SRC / "pages" / "Documents" / "Verification" / "index.tsx"
        src = _read(ver)
        assert "documentsService" in src and "uploadDocument" in src, (
            "/verification must remain the canonical upload+review surface"
        )
        assert "/verification" in _read(ROUTER), "canonical route must remain pinned"

    def test_real_api_upload_contract_unchanged(self):
        routes = [getattr(r, "path", None) for r in app.routes]
        assert "/documents/me" in routes
        assert "/documents/{document_id}/file" in routes

    def test_company_profile_upload_uses_a_real_document_type(self):
        profile = FRONTEND_SRC / "pages" / "Profile" / "CompanyProfile.tsx"
        src = _read(profile)
        assert "company_document" not in src, (
            "CompanyProfile must not send a document_type the backend does not accept"
        )
        assert "document_type: 'other'" in src, (
            "CompanyProfile uploads must use the backend's general-purpose type"
        )
