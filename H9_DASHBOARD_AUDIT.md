# H9 Phase 4b — Dashboard Mock-Data Audit (READ-ONLY)

> **STATUS: IMPLEMENTED (2026-09-24).** The approved wire-and-rework plan below
> has been executed — see "Implementation record" in `H9_INVENTORY.md` §J.
> The page now consumes `GET /documents/me`; all fabricated values removed;
> regression-pinned by `tests/test_h9_dashboard_contract.py` (9 tests).
> `/dashboard` was intentionally retained (no routing changes).

> Scope: `/dashboard` (`nhaav-frontend/src/pages/Dashboard/index.tsx`, 156 lines).
> Nothing has been modified. No endpoints created. No files deleted.
> Verified facts only; every claim below was checked against the code.

## 1. Reachability & role exposure

| Question | Answer | Evidence |
|---|---|---|
| Routed? | Yes — `{ path: '/dashboard', element: <DashboardPage /> }` under `DashboardLayout` ("Legacy/Common") | `router/index.tsx:117` |
| Who can reach it? | **Any authenticated user** (client, provider) via `ProtectedRoute` | router structure |
| Linked from where? | `Navbar.tsx:32` (logo link), `Landing` CTA, `SuccessScreen` action buttons (×3), `ProviderDashboard` "Service Deleted" flow, legacy `Sidebar.tsx` nav, `Financials.tsx` quick links | repo-wide grep |
| Role-specific dashboards also exist? | Yes — `/ship-owner` (ShipOwnerDashboard, client-only), `/provider-dashboard` (ProviderDashboard, provider-only). `/dashboard` competes with both. | `router/index.tsx:87-101` |
| Tests pinning current values? | **None** — `grep -rln "dashboard" nhaav-backend/tests/` is empty | backend tests |

## 2. Real backend sources that already exist

| Source | What it provides | Frontend wiring |
|---|---|---|
| `GET /documents/me` (`documents.py:53`) | Own documents: `id`, `document_type`, `verification_status` (pending/verified/rejected/extracted), `doc_category`, `name`, `ocr_extracted_data`, `created_at` | `documentsService.getDocuments()` already exists (`services/documents.ts:25`) |
| Parsers | `app/parsers/invoice_parser.py`, `no_pe_parser.py`, `form10f_parser.py`, `vendor_parser.py`, `parser_engine.py` exist. **`bol_extractor.py` does not exist** — grep for "bill of lading/BOL" across parsers/extractors/document_parser: zero hits | — |
| No telemetry anywhere | No endpoint or table tracks parse counts over time, accuracy, latency, or "exceptions" | confirmed by route/schema sweep |

## 3. Element-by-element classification

### Stat cards (`stats` array)
| Element (hardcoded value) | Class | Basis / proposed action |
|---|---|---|
| Total Parsed Documents `1,482` `+14%` | **B (count) + D (delta)** | Count of *my* documents is derivable from `GET /documents/me` client-side. The `+14% vs last month` delta has **no time-series source anywhere** → remove deltas. Relabel honestly: "My Documents". |
| Extraction Accuracy Rate `99.4%` `+0.8%` | **D — remove** | This is precisely the metric class H7 banned (presenting completeness/none as accuracy). `verification_score` is nullable and explicitly NOT accuracy. No accuracy data exists. Must not be reintroduced in any form. |
| Avg OCR Latency `380ms` `-45ms` | **D — remove** | No latency telemetry exists anywhere in backend or frontend. Building it (option C) is not justified by any product need today. |
| Flagged Exceptions `3` `-2` | **B (rework)** | "Exceptions" doesn't exist as a concept. Honest equivalent computable from the existing API: "Documents pending review" = count of own docs with `verification_status ∈ {pending, extracted}`. |

### Recent Parsed Documents table (`recentDocs` array — 4 fake rows)
| Column | Class | Basis / proposed action |
|---|---|---|
| Document ID (`INV-2026-0891`…) | **B** | Real `id` from `/documents/me` |
| Type (`Commercial Invoice`…) | **B** | Real `document_type` (DocumentType enum) |
| Vessel (`MV Pacific Nhaav`…) | **D** | `Document` has **no vessel field**. `vessel_name` lives on `service_requests`, unrelated to documents. `ocr_extracted_data` may contain a vessel key for *some* doc types but is not guaranteed → column cannot be honestly populated → remove column (not fake it) |
| Confidence (`99.8%`…) | **D — remove** | Same H7 violation as the stat card. Nothing honest to put here |
| Status (`Parsed` / `Review Needed`) | **B (remap)** | Real `verification_status`: pending / verified / rejected / extracted → map to honest badges |
| Date (`10 mins ago`) | **B** | Real `created_at` (render as relative time) |
| Action `View` → `navigate('/ocr-result')` | **D — rewire** | `/ocr-result` is the H9 §D fake demo page (hardcoded `0.998`). Must link to a real document view (`/verification`) or be removed |
| Empty state | **E (add)** | New user with 0 docs currently sees fake rows; after wiring, needs an honest empty state |

### Active Parser Engines card
| Element | Class | Basis / proposed action |
|---|---|---|
| Invoice Parser (`invoice_parser.py`) ACTIVE | **E (module real) / D (badge fake)** | Module exists; "ACTIVE" has no health-check source |
| Non-PE Extractor (`no_pe_parser.py`) ACTIVE | **E / D** | Same |
| Bill of Lading Regex (`bol_extractor.py`) READY | **D — remove** | **File does not exist in the backend.** Entirely fabricated |
| Whole card | **D — remove** | No engine-health endpoint exists; per instruction #9 no endpoint should be invented for a card. Listing parsers without status badges is an option, but the card's entire premise ("status & regex health") is unsupported → remove |

### Header / chrome
| Element | Class | Action |
|---|---|---|
| Title "Maritime OCR Dashboard" | **E** | Legitimate; consider "Documents" to match honest content |
| Subtitle "Real-time telemetry and OCR extraction metrics across port operations" | **D — reword** | False claim — there is no telemetry |
| "Upload New Document" button → `/upload` | **E** | Legitimate; `/upload` is a real routed page |

## 4. Proposed wire-or-remove plan (NO code changed yet)

**Chosen direction: WIRE (Option 1), not redirect-and-delete (Option 2).**
Rationale: `/dashboard` is linked from the Navbar logo, Landing CTA and three
SuccessScreen flows; deleting/redirecting it is a bigger product decision. The
page has one honest, already-backed data source (`GET /documents/me`) that
covers most of its surface.

1. **Wire the table** to `documentsService.getDocuments()` (service already
   exists): real id, type, status badge (pending/verified/rejected/extracted),
   relative created_at. Loading + error + honest empty state ("No documents
   yet — upload your first document").
2. **Remove** the vessel column and the confidence column (H7-aligned; no
   honest source).
3. **Rewire "View"** to `/verification` (real document verification page) —
   removes the page's dependency on the fake `/ocr-result` demo.
4. **Rework stat cards** to: "My Documents" (count from API), "Pending Review"
   (count from API), "Verified" (count from API). **Delete** the accuracy and
   latency cards entirely. All `+x% vs last month` deltas removed.
5. **Remove** the Active Parser Engines card (one row references a non-existent
   module; badges have no source).
6. **Reword** the subtitle to describe what the page actually is.

Items deliberately NOT done: no new backend endpoint (nothing justifies one);
no vessel data invented; no latency/accuracy telemetry invented;
`/ocr-result` and `Documents/Verification` mock surfaces remain their own
H9 items.

## 5. Open product decision (for review before implementation) — RESOLVED

**Decision: Option 1 (wire) approved; `/dashboard` retained.** No redirect, no
deletion. Option 2 remains available in future if role-dashboard routing is
revisited — the honest documents table would move to `Documents/Verification`.

**Should `/dashboard` stay a page at all?** Since role-specific dashboards
already exist, an alternative is redirecting `/dashboard` → role dashboard and
deleting this page. That would break Navbar-logo/Landing/SuccessScreen links
to a generic dashboard and needs a product owner's call. The audit defaults to
**Option 1 (wire)** as the minimal, reversible change; Option 2 can supersede
it without wasting the work (the honest "My Documents" table could move into
`Documents/Verification`).
