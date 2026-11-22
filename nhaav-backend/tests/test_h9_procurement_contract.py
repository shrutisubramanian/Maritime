"""
H9 Phase 4h — Procurement trio honest-rework contract (per H9_PROCUREMENT_AUDIT.md,
approved per-page plan).

Before this pass the request -> quote -> award flow carried the last big cluster of
fabricated trust data: a dead OPPS mock (still bundled), invented KPIs and "Global
Market Insights", a four-provider comparison grid of fictional companies with
invented prices/ratings/"Trust Score A+" audit claims, a fabricated request context
("RFP #9910-SGP", "MV Nhaav Explorer", "Ocean Shipping Ltd", "Smart Match 96%"),
and a SubmitQuotation that collected warranty/payment/validity/surcharge/attachments
and silently dropped every one of them.

Approved rework: pages render only what the real APIs return
(GET /requests?status=open, GET /quotes/my-quotations, GET /quotes/request/{id},
GET /requests/{id}, GET /profiles/{id}), the accept/reject endpoints are actually
wired, the quote payload now carries every QuoteBase-supported field, and NO ranking
or "best quote" indicator was introduced — the client compares and decides.

Bans are scoped to the three files; the same strings may exist on still-queued
surfaces.
"""
import re
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "nhaav-frontend" / "src"
PO = FRONTEND_SRC / "pages" / "Procurement" / "ProcurementRequests" / "ProcurementOpportunities.tsx"
CQ = FRONTEND_SRC / "pages" / "Procurement" / "Quotes" / "CompareQuotations.tsx"
SQ = FRONTEND_SRC / "pages" / "Procurement" / "Quotes" / "SubmitQuotation.tsx"


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


class TestFabricationRemoval:
    def test_dead_mock_constants_are_gone(self):
        po_src = _read(PO)
        assert "const OPPS" not in po_src and "OPPS[" not in po_src, (
            "The dead OPPS mock array must stay deleted (it still shipped in the bundle)"
        )
        assert "const NAV" not in po_src
        assert "PROVIDERS" not in _read(CQ), "The fabricated four-provider grid must stay deleted"

    def test_po_fabricated_values_are_gone(self):
        src = _read(PO)
        banned = (
            "Hydraulic Pump Repair", "Maersk Tianjin", "MSC Elmira",
            "Annual Fire Safety Inspection", "Main Engine Overhaul",
            "ISO 9001",                     # last src copy lived in the dead OPPS tags
            "Engine Retrofitting", "Port of Neom", "Fleet Command System",
            "Global Vision", "Oceanic Nhaav",
            # invented KPI-row labels (values were 48/27/19/8 — labels are the
            # unique, number-agnostic pin; bare numbers trip icon dimensions)
            "New Opportunities", "Matching Services", "Quotes Submitted", "Won Contracts",
            "New Match", "★ 4.8",
        )
        offenders = [b for b in banned if b in src]
        assert not offenders, f"Fabricated values back in ProcurementOpportunities: {offenders}"

    def test_cq_fabricated_values_are_gone(self):
        src = _read(CQ)
        banned = (
            "Maersk Technical", "Global Marine Eng", "TechVessel Solutions",
            "OceanInspect Ltd", "Trust Score", "A+ Rated", "rigorous technical audit",
            "Cost Variance", "$142,500", "$138,900", "$131,200", "$124,000",
            "PR-4482", "IMPA", "Export Comparison", "Award Contract",
        )
        offenders = [b for b in banned if b in src]
        assert not offenders, f"Fabricated values back in CompareQuotations: {offenders}"

    def test_sq_fabricated_values_are_gone(self):
        src = _read(SQ)
        banned = (
            "RFP #9910-SGP", "Hydraulic Pump Overhaul", "MV Nhaav Explorer",
            "Ocean Shipping Ltd", "HZN-QT-88219", "Quote Quality Score",
            "Auto-saved", "Grammar check active", "Drafting Mode Active",
            "Chief Engineer", "Fleet Operations", "Robert Chen", "Technician #2",
            "ISO 9001:2015", "DNV-GL Type Approval", "IACS Certified",
            "Smart Match", "96%", "92%", "12 Completed Contracts",
            "(Locked Rate)", "$14,850.00", "Max 50MB", "Port of Singapore",
        )
        offenders = [b for d, b in enumerate(banned) if b in src]
        assert not offenders, f"Fabricated values back in SubmitQuotation: {offenders}"

    def test_no_stock_imagery_in_the_trio(self):
        for p, label in ((PO, "ProcurementOpportunities"), (CQ, "CompareQuotations"), (SQ, "SubmitQuotation")):
            src = _read(p)
            assert "aida-public" not in src, f"{label} must not ship stock imagery"
            assert "images.unsplash.com" not in src, f"{label} must not ship stock imagery"


class TestRealWiring:
    def test_po_uses_real_request_data(self):
        src = _read(PO)
        assert "getUserRequests" in src and "getMyQuotations" in src, (
            "Opportunities list must stay wired to the real APIs"
        )
        assert "o.description" in src, "Description must render from the real field (was o.desc bug)"
        assert "unquotedOpps.length" in src, "KPI counts must be derived from real state"
        assert "submittedQuotes.length" in src
        assert "/my-quotations" in src and "/request/" in src, (
            "My Submitted Quotes and View Full Request must navigate to real routes"
        )

    def test_cq_fetches_real_quotes_and_wires_actions(self):
        src = _read(CQ)
        assert "getQuotesForRequest" in src, "Must fetch GET /quotes/request/{id}"
        assert "acceptQuote" in src and "rejectQuote" in src, (
            "The real accept/reject endpoints must be wired"
        )
        assert "getProviderById" in src, "Provider names must come from the existing profile API"
        # No ranking/scoring may be introduced.
        assert not re.search(r"(matchScore|bestQuote|recommended|score\s*=|ranked)", src), (
            "No quote ranking or recommendation logic is permitted"
        )
        # No fabricated rating display.
        assert "★★" not in src and "rating_avg" not in src

    def test_sq_sends_every_supported_quote_field(self):
        src = _read(SQ)
        for field in ("warranty_period", "payment_terms", "validity_date",
                      "emergency_charges", "travel_charges", "quotation_reference",
                      "attachments", "estimated_duration", "estimated_start_date",
                      "estimated_completion_date", "taxes_included"):
            assert f"{field}:" in src, f"QuoteBase field {field} must reach the payload"
        assert "getRequestById" in src, "Request context must come from GET /requests/{id}"
        # The surcharge must no longer be mislabeled as travel_charges.
        assert not re.search(r"travel_charges:\s*parseFloat\(surcharge\)", src)
        # document_type stays correct on the attachment upload path.
        assert 'document_type: "quotation"' in src

    def test_no_hardcoded_document_type_anywhere_in_trio(self):
        for p in (PO, CQ, SQ):
            src = _read(p)
            hardcoded = re.search(
                r"document_type['\"]\s*[:,]\s*['\"](?!quotation)[^'\"]+['\"]", src
            )
            assert hardcoded is None, (
                f"Hardcoded non-quotation document_type in {p.name}: {hardcoded.group(0) if hardcoded else ''}"
            )


class TestRouteContract:
    def test_procurement_routes_still_pinned(self):
        router_src = _read(FRONTEND_SRC / "router" / "index.tsx")
        for pin in ("/procurement-opportunities", "/compare-quotations",
                    "/submit-quotation", "/my-quotations", "/request/:id"):
            assert pin in router_src, f"Route {pin} must remain"

    def test_live_quote_routes_exist(self):
        routes = [getattr(r, "path", None) for r in app.routes]
        for pin in ("/quotes/request/{request_id}", "/quotes/{quote_id}/accept",
                    "/quotes/{quote_id}/reject", "/quotes/my-quotations"):
            assert pin in routes, f"Backend route {pin} must exist"
