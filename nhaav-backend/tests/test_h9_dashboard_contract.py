"""
H9 §D — Dashboard trust-surface tests (Phase 4b, per H9_DASHBOARD_AUDIT.md).

The /dashboard page previously shipped entirely fabricated data: fake invoices
(INV-2026-0891, MV Pacific Nhaav), an "Extraction Accuracy Rate: 99.4%" card
(the exact claim class the H7 remediation banned), an "Avg OCR Latency: 380ms"
telemetry card with no telemetry source, a fake "Active Parser Engines" card
(including bol_extractor.py, a module that does not exist in the backend), and
a View action routing into the fake /ocr-result demo page.

The approved wire-and-rework plan rewired the page to the existing
`GET /documents/me` endpoint via documentsService.getDocuments() and removed
every unsupported claim. These tests pin that contract. Like the other H9
frontend-contract tests, they assert on source content — no fake backend
fixture is involved, and the route itself is verified against the live FastAPI
app where applicable.
"""
import os
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "nhaav-frontend" / "src"
DASHBOARD = FRONTEND_SRC / "pages" / "Dashboard" / "index.tsx"
ROUTER = FRONTEND_SRC / "router" / "index.tsx"

# Fabricated values that must never return (from H9_DASHBOARD_AUDIT.md §3)
BANNED_IN_DASHBOARD = (
    "99.4%",                 # fabricated extraction-accuracy claim (H7 contract)
    "380ms",                 # fabricated latency telemetry
    "bol_extractor",         # module does not exist in the backend
    "invoice_parser.py",     # parser-health badges have no source
    "no_pe_parser.py",
    "MV Pacific Nhaav",    # fabricated vessel names
    "Ever Given Container",
    "CMA CGM Antoine",
    "MSC Isabella",
    "INV-2026-0891",         # fabricated document ids
    "NOPE-2026-0412",
    "BOL-9921-7711",
    "Extraction Accuracy Rate",
    "Avg OCR Latency",
    "Flagged Exceptions",
    "Active Parser Engines",
    "Real-time telemetry",
    "vs last month",         # fabricated historical deltas
    "confidence",            # H7 contract: no accuracy/confidence wording
    "Accuracy",
)


def _dashboard_src() -> str:
    return DASHBOARD.read_text(encoding="utf-8")


class TestFabricatedValuesRemoved:
    def test_dashboard_contains_no_fabricated_values(self):
        src = _dashboard_src()
        offenders = [b for b in BANNED_IN_DASHBOARD if b in src]
        assert not offenders, f"Fabricated values back in Dashboard: {offenders}"

    def test_dashboard_has_no_parser_health_badges(self):
        src = _dashboard_src()
        assert "ACTIVE" not in src and "READY" not in src, (
            "Parser-health badges (ACTIVE/READY) have no backend source"
        )


class TestWiredToRealApi:
    def test_dashboard_consumes_documents_service(self):
        src = _dashboard_src()
        assert "documentsService" in src, "Dashboard must use the existing documents service"
        assert "getDocuments" in src, "Dashboard must call GET /documents/me via getDocuments()"

    def test_dashboard_has_loading_error_empty_states(self):
        src = _dashboard_src()
        assert "Loading your documents" in src
        assert "Could not load your documents" in src
        assert "No documents yet" in src

    def test_view_action_does_not_route_to_ocr_result(self):
        src = _dashboard_src()
        assert "/ocr-result" not in src, (
            "Dashboard must not route users into the fake /ocr-result demo page"
        )
        assert 'navigate(\'/verification\')' in src, (
            "View action must route to the real verification page"
        )

    def test_no_invented_document_fields(self):
        """The UI must only display fields the API actually returns."""
        src = _dashboard_src()
        assert "vessel" not in src.lower(), "Document has no vessel field — column must stay removed"


class TestRouteContract:
    def test_dashboard_route_still_exists(self):
        router_src = ROUTER.read_text(encoding="utf-8")
        assert "path: '/dashboard'" in router_src, "/dashboard was intentionally retained"

    def test_documents_me_endpoint_exists(self):
        """The endpoint the Dashboard depends on must exist on the live app."""
        routes = [getattr(r, "path", None) for r in app.routes]
        assert "/documents/me" in routes

    def test_dashboard_source_exists_for_this_guard(self):
        assert DASHBOARD.is_file(), f"Dashboard source not found at {DASHBOARD}"
