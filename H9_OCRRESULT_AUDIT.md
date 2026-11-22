# H9 Audit — OCRResult (`/ocr-result`)

> **STATUS: AUDITED — AWAITING USER APPROVAL. No edits made.**
> Scope: `nhaav-frontend/src/pages/OCRResult/index.tsx` (117 lines, single
> component `OCRResultPage`), its route pin, and its inbound navigation.
> This audit is read-only: every claim below was verified against source.

## A. Reachability — how users get to `/ocr-result`

| Inbound edge | Location | Status |
|---|---|---|
| Route pin | `router/index.tsx` line 120, inside `ProtectedRoute` → `DashboardLayout` children; import at line 40 | LIVE |
| Sidebar nav "OCR Inspection" | `components/Sidebar.tsx` line 9 → `/ocr-result` | LIVE — `Sidebar` is rendered by `layouts/DashboardLayout.tsx` (line 4), i.e. the actual chrome around `/dashboard`, `/profile`, `/ocr-result` |
| Dashboard View action | previously targeted `/ocr-result` | **DECOUPLED** in Dashboard pass; now `/verification` (pinned by `test_h9_dashboard_contract.py::test_view_action_does_not_route_to_ocr_result`) |
| Upload flow | shows real OCR results **inline** (`extractedFields` state, Upload lines ~97–108 and ~524–526); never navigates to `/ocr-result` | NOT an entry point |
| Any other `navigate('/ocr-result')` / `<Link>` | searched all of `src` | ZERO hits |

**Conclusion:** reachable through exactly two edges — the route pin and the
legacy Sidebar's "OCR Inspection" item. Nothing else sends users here.

## B. Real backend data — what exists to back an OCR result view

Real, verified sources (no invention required):

- `GET /documents/me` → `DocumentResponse[]` including `ocr_extracted_data`
  (dict: `fields`, `missing_fields`, `confidence_available`,
  `confidence_reason`, `field_completion_rate`), `extracted_text`,
  `document_type`, `verification_status`, `name`, `doc_category`.
- `POST /documents/upload` returns the same extraction payload synchronously
  (`fields`, `document_type`, `confidence` [legacy completion rate],
  `confidence_available`, `field_completion_rate`) — Upload renders it inline.
- OCR pipeline is genuinely real: tesseract / PyMuPDF → `process_document()`
  → per-type extractors for `vendor_registration`, `kyc_due_diligence`,
  `form_10f`, `no_pe_declaration`, `tax_invoice` (`EXTRACTOR_MAP`).
- H7 contract (already tested): the engine provides **no per-field accuracy
  metric**; `confidence_available` is always `False`, and any number shown as
  "OCR accuracy" is a banned trust-surface claim.

What does **not** exist anywhere in the backend: a confidence score like
`0.998`, vessel/IMO/voyage extraction, bounding-box data, page counts, or a
parser named `invoice_parser.py`. (Real invoice field keys are
`INVOICE_TEMPLATE`'s: `supplier_name`, `invoice_number`, `invoice_date`,
`recipient`, `supplier_gstin`, `recipient_gstin`, `supplier_pan`,
`place_of_supply`, `irn`, `eway_bill`, `description`, `hsn`, `gst_rate`,
`quantity`, `rate`, `amount`, `bank_name`, `account_number`, `ifsc`, `total`.)

## C. Route contract — why the page cannot be "just wired" as-is

`/ocr-result` takes **no parameter of any kind**. There is no document id, no
query string, no navigation state. The page therefore cannot know which
document to show and renders one hardcoded object. Wiring it honestly would
require an id-bearing route (`/ocr-result/:id` or `?doc=`) plus selecting the
document from `GET /documents/me` client-side (documentsService has no single-
document endpoint; H9 rules forbid inventing one). No current caller passes a
document id — the only caller (Sidebar) passes nothing.

## D. Fabricated value inventory (every instance)

All strings verified to live ONLY in `OCRResult/index.tsx` — zero occurrences
elsewhere in `nhaav-frontend/src`:

| Line(s) | Fabricated value | Why it's false |
|---|---|---|
| 22 | `confidence_score: 0.998` | No accuracy metric exists (H7); 99.8% precision is invented |
| 11, 41 | `document_id: 'INV-2026-0891'` | Not a real document id (real ids are UUIDs); not a real field key |
| 12 | `document_type: 'Commercial Maritime Invoice'` | Not a `DocumentType` (real: `tax_invoice`, etc.) |
| 13 | `vessel_name: 'MV Pacific Nhaav'` | No vessel extraction exists |
| 14 | `imo_number: '9812736'` | No IMO extraction exists |
| 15 | `voyage_number: 'VY-2026-04A'` | No voyage extraction exists |
| 16 | `registered_address: '742 Shipping Way, Singapore 018989'` | Invented |
| 17 | `extracted_country: 'Singapore'` | Invented |
| 18 | `shipper: 'Nhaav Logistics Global Ltd'` | Invented company |
| 19 | `consignee: 'Apex Port Terminals Inc'` | Invented company |
| 20 | `total_amount: '$48,500.00 USD'` | Invented (real key would be `total`) |
| 21 | `tax_identifier: 'SG-99812401'` | Invented (real keys: GSTIN/PAN) |
| 23 | `parser_used: 'invoice_parser.py (Regex Engine)'` | No such file; real pipeline is `services/extractors/*` + `ParserEngine` |
| 40 | badge **"OCR Verified"** (green) | Nothing marks OCR as verified; `verified` is an admin action on the document, and this page isn't backed by one |
| 60–70 | "Source Document Preview … extraction highlights", `Commercial_Invoice_MV_Pacific_Nhaav.pdf`, "Parsed 1 page, **32 bounding boxes detected**" | No preview renderer, no bounding boxes, no page metadata anywhere in the stack |
| 68 | "100% Zoom" overlay | Non-functional decoration |
| every field row | green `CheckCircle2` per field | Asserts extraction success for data that was never extracted |
| 51 | "Export Result" button | No `onClick` — dead control |
| 48 | "Copy JSON" | Functional — but copies the fabricated JSON, which makes it worse |

**Severity: HIGH.** This is the same banned class as the Dashboard's deleted
"accuracy 99.4%" — a fake trust signal (0.998 + "OCR Verified" badge) sitting
on a trust-adjacent surface (document extraction), fully visible to any
authenticated user via the sidebar.

## E. Wire-or-remove options

### Option 1 — Remove (RECOMMENDED)
Delete `pages/OCRResult/`, the router import + `/ocr-result` route pin, and
the Sidebar "OCR Inspection" entry. Precedent: §A dead-file deletions and the
Analytics dead-`/support`-link removal. Loss to the user: nothing real — the
page contains only fabricated data. Real extraction results remain visible
inline in Upload (already implemented) and will be covered properly by the
Documents/Verification audit (the next §D target), which is the natural home
for a document's extraction detail.

### Option 2 — Wire honestly
Repurpose the page as an id-bearing "Extraction detail" viewer:
`/ocr-result/:id` (or `?doc=`) → `documentsService.getDocuments()` → find by
id → render `ocr_extracted_data.fields` with real keys, `missing_fields`,
`extracted_text`, and the document's real `verification_status` (no "OCR
Verified" unless the document actually is; no accuracy number — show the H7
"confidence not provided by engine" note). Sidebar's context-free "OCR
Inspection" entry would then need to become a document-list entry point or be
dropped anyway. Cost: meaningful work that overlaps with the upcoming
Documents/Verification rewire; the entry-point problem (nobody links here
with an id) remains.

### Recommendation
**Option 1.** Option 2's honest version is better built as part of the
Documents/Verification page (next queue item) where a document list already
exists, rather than propping up a second, id-less route.

## F. Proposed contract tests (`test_h9_ocrresult_contract.py`)

If Option 1: router has no `/ocr-result` route and no OCRResult import;
`pages/OCRResult/` absent; Sidebar contains no "OCR Inspection" → `/ocr-result`
link; Dashboard's existing not-routed-to-ocr-result pin remains green.
If Option 2: banned-value pins (0.998, MV Pacific Nhaav, INV-2026-0891,
"OCR Verified", bounding boxes, parser_used) absent from the page source; page
must derive everything from `ocr_extracted_data`/document status; accuracy
presentation banned (H7 semantics).
(Gotcha from prior passes: banned-string tests flag the page's own docstring —
source comments must be worded to avoid the literals.)

## G. Verification battery after implementation

`pytest tests/ -q` (expect 233 + new OCRResult tests), `tsc --noEmit` +
`npm run build`, `python tools/h9_reference_check.py`, and the fresh-bundle
per-string grep for every §D value (expect 0).
