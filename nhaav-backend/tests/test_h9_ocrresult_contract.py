"""
H9 §D — OCRResult removal tests (per H9_OCRRESULT_AUDIT.md).

The /ocr-result page shipped a fully fabricated OCR demo result: a
"confidence_score" of 0.998 (the H7-banned trust-signal class — the OCR engine
provides no per-field accuracy metric), a fake "OCR Verified" badge, invented
document/vessel/company data, a nonexistent parser name, "32 bounding boxes
detected", and a dead "Export Result" button. The page took no id, so it could
never be honestly wired, and no caller ever navigated to it with a document.

Approved plan (H9_OCRRESULT_AUDIT.md §E, Option 1): delete the page, its route
pin, and the legacy Sidebar "OCR Inspection" entry. Real extraction results
remain visible in Documents/Verification, the canonical surface (the separate
Upload page was itself removed in Phase 4e per H9_UPLOAD_AUDIT.md). These
tests pin that removal. They assert on frontend source content (the
convention used by the other H9 frontend-contract tests) plus the live
FastAPI route table.
"""
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "nhaav-frontend" / "src"
ROUTER = FRONTEND_SRC / "router" / "index.tsx"
SIDEBAR = FRONTEND_SRC / "components" / "Sidebar.tsx"
DASHBOARD = FRONTEND_SRC / "pages" / "Dashboard" / "index.tsx"
OCR_RESULT_DIR = FRONTEND_SRC / "pages" / "OCRResult"


class TestOcrResultRemoved:
    def test_ocr_result_page_directory_is_gone(self):
        assert not OCR_RESULT_DIR.exists(), (
            "pages/OCRResult/ was approved for removal and must not return"
        )

    def test_router_has_no_ocr_result_route_or_import(self):
        src = ROUTER.read_text(encoding="utf-8")
        assert "OCRResult" not in src, "Router must not import the removed OCRResult page"
        assert "/ocr-result" not in src, "Router must not register the removed /ocr-result route"

    def test_sidebar_has_no_ocr_inspection_entry(self):
        src = SIDEBAR.read_text(encoding="utf-8")
        assert "OCR Inspection" not in src
        assert "/ocr-result" not in src
        assert "Maritime OCR parser support" not in src, (
            "Sidebar must not reference a nonexistent OCR parser support channel"
        )


class TestCanonicalSurfacesIntact:
    """Removal must not take the real extraction surfaces down with it."""

    def test_backend_never_served_an_ocr_result_path(self):
        routes = [getattr(r, "path", None) for r in app.routes]
        assert "/ocr-result" not in routes

    def test_verification_route_still_exists(self):
        src = ROUTER.read_text(encoding="utf-8")
        assert "path: '/verification'" in src, (
            "/verification is the canonical document review surface and must stay routed"
        )

    def test_upload_route_removal_must_not_regress(self):
        # Phase 4e (H9_UPLOAD_AUDIT.md, Option 1) removed the /upload page and
        # its fabricated data. The canonical extraction surface is /verification.
        router_src = ROUTER.read_text(encoding="utf-8")
        assert "path: '/upload'" not in router_src, (
            "The removed /upload page must not be re-pinned into the router"
        )
        assert not (FRONTEND_SRC / "pages" / "Upload").exists(), (
            "pages/Upload/ was removed in Phase 4e and must stay gone"
        )

    def test_dashboard_still_routes_view_action_to_verification(self):
        src = DASHBOARD.read_text(encoding="utf-8")
        assert "/ocr-result" not in src
        assert "navigate('/verification')" in src, (
            "Dashboard View action must keep targeting the real verification page"
        )
