# H9 Phase 4h — Procurement Pages Audit

**STATUS: AUDITED AND IMPLEMENTED (approved per-page plan).**

Implementation record: ProcurementOpportunities — dead `OPPS`/`NAV` consts, fake KPIs,
"Global Market Insights", sidebar, footer and fake client chips removed; KPIs derived
from real state; "My Submitted Quotes" → `/my-quotations`; "View Full Request" →
`/request/{id}`; `o.desc`→`o.description` bug fixed; error state added.
CompareQuotations — fabricated 4-provider grid, "Trust Score A+", IMPA fragment and
fake "Live Request PR-4482" removed; real per-request quotes panel via
`GET /quotes/request/{id}` with provider names from `GET /profiles/{id}` and working
Accept/Reject; no ranking/scoring introduced (pinned by regex ban).
SubmitQuotation — real request context via `GET /requests/{id}`; payload now sends
`warranty_period`, `payment_terms`, `validity_date`, `emergency_charges`,
`travel_charges` (correctly unmixed from the surcharge), `quotation_reference`,
`attachments` (real document ids); grand total computed from inputs; fabricated
RFP/vessel/client/match/quality-score chrome removed.

New `tests/test_h9_procurement_contract.py` (11 tests). Battery: 289/289 pytest;
tsc + build clean; reference check clean; bundle grep 0 for all trio fabrications
(residuals: IMPA ×1 → ShipOwnerDashboard queued surface; aida-public ×18, down from
×30 — this pass removed 12).
Targets (all read in full):
- `pages/Procurement/ProcurementRequests/ProcurementOpportunities.tsx` (278 lines)
- `pages/Procurement/Quotes/CompareQuotations.tsx` (200 lines)
- `pages/Procurement/Quotes/SubmitQuotation.tsx` (367 lines)

Backend contracts verified: `GET /requests/?status=open`, `GET /quotes/my-quotations`,
`POST /quotes/`, `GET /quotes/request/{request_id}`, `PUT /quotes/{id}/accept|reject`,
`GET /requests/{request_id}`, `QuoteBase` schema (amount, currency,
quotation_reference, pricing_model, travel_charges, **emergency_charges**,
taxes_included, message, scope_of_work, estimated_duration, estimated_start/completion_date,
**warranty_period**, **payment_terms**, **attachments**, **validity_date**).

---

## 1. Reachability

- `/procurement-opportunities` — inbound: ProviderDashboard ×3, Notifications nav,
  ProviderSidebar ×2. Provider-facing; live route.
- `/compare-quotations` — inbound: ClientSidebar ×3 ("Received/Compare/Accepted
  Quotations" all point here). Client-facing; live route.
- `/submit-quotation` — inbound: ProcurementOpportunities card CTA
  (`?requestId={real id}`); ProviderSidebar. Live route.

## 2. ProcurementOpportunities

**Real (A):** fetches `getUserRequests({status:'open'})` + `getMyQuotations()`,
diffs already-quoted requests, honest empty state, urgency badge from real
`o.urgency`, title/port from real fields, Submit Quotation navigates with the real
request id, loading state.

**D (fabricated trust data):**
- D-1 **Fake KPI row**: "New Opportunities 48 / Matching Services 27 / Quotes
  Submitted 19 / Won Contracts 8" — all hardcoded.
- D-2 **"Global Market Insights"**: "Engine Retrofitting +24% this QTR", "Port of
  Neom +312% Growth", "Avg. Quotation Value **,800 USD**" (broken string) — no
  analytics backend exists.
- D-3 **Right sidebar**: "Top Matching Categories 85%/72%" bars, "Avg. Project
  Budget **,500**" (broken), "Closing Soon 12 Requests", "Smart Recommendation:
  Main Deck Sandblasting… your previous 5-star rating", Premium "Upgrade to Global
  Vision" banner — all invented; no payments system exists.
- D-4 **Per-card "New Match ★4.8 Verified"** on the client chip — rating/verified
  fabricated; the API response carries no client rating (and `client` itself is
  not in `ServiceRequestResponse`).

**C (remove/reduce):**
- C-1 **Dead `OPPS` const still bundled** — "Hydraulic Pump Repair"/"Maersk
  Tianjin (Bulk Carrier)"/"MSC Elmira"/"ISO 9001 Required" rows are unreachable
  (the real list renders instead) but ship in the JS bundle.
- C-2 Dead `NAV` const; stock images `PROF`, `BANNER`, `LOGOS[3]`; footer
  "© 2023 Fleet Command System" / "Oceanic Nhaav" branding; dead footer links.
- C-3 Dead controls: search input, 6 empty filter selects, "Saved Opportunities"
  button, per-card Save/bookmark, `{false&&…}` tags block.
- C-4 Mis-wired: top-nav "Vessels" → `/provider-dashboard`; header brand
  "Oceanic Nhaav Marketplace".

**B (wire to existing data):**
- B-1 "My Submitted Quotes" header button → real target exists: `/my-quotations`
  (MyQuotations page).
- B-2 "View Full Request" dead button → real target exists: `/request/{id}`
  (RequestDetails route).
- B-3 Description never renders — code reads `o.desc` but sends `o.description`
  (`{o.desc&&<p>{o.description}</p>}`); fix to `o.description`.
- B-4 KPI row → compute from real data: `unquotedOpps.length`,
  `submittedQuotes.length`; drop the two metrics with no source.
- B-5 Render only fields `ServiceRequestResponse` actually has (vessel_name,
  budget, required_completion_date exist as optionals); omit client block when
  absent — never "Unknown Company ★4.8 Verified".

## 3. CompareQuotations

**Real (A):** Procurement Overview table from `getClientRequests()` (title,
port, status, row-click → `/request/{id}`), honest "No active requests found"
empty state, Back button.

**D (fabricated):**
- D-1 **Entire 4-provider comparison grid** (`PROVIDERS` const): "Maersk
  Technical / Global Marine Eng / TechVessel Solutions / OceanInspect Ltd" with
  invented prices ($142,500…), timelines, warranties, ratings (4.9/4.2/5.0/3.8),
  jobs (1,240+ Ships), response times, proposals, certification chips
  (ISO 9001, ISO 14001, ABS, DNV, ClassNK), validity countdowns, payment terms,
  stock logos ×4. Rendered unconditionally — for every request, always the same
  four fictional bidders.
- D-2 **Summary cards**: "Cost Variance $18,500.00", "Average Timeline 16.5
  Days", "Trust Score A+ Rated — All 4 providers have passed Nhaav rigorous
  technical audit" (no such audit exists).
- D-3 Header chip "Live Request **PR-4482** • Engine Overhaul Services" — hardcoded.
- D-4 "IMPA Code" column showing `r.id.substring(0,6)` — a request UUID fragment
  labeled as an IMPA code is a fabricated identifier.
- D-5 "Quotes" column from `r.quotes?.length` — `ServiceRequestResponse` has no
  nested quotes; effectively always 0.

**C:** stock `PROF` avatar; dead Export Comparison / Award Contract buttons;
"Live Request" pulse chip styling implying realtime.

**B (wire — the decisive finding):**
- **`GET /quotes/request/{request_id}` EXISTS** and returns real `QuoteResponse`s
  (amount, currency, pricing_model, scope, warranty, payment terms, status), and
  **`PUT /quotes/{id}/accept|reject` exist** — the canonical accept flow the fake
  "Award Contract" button pretends to perform. The page uses none of it.

## 4. SubmitQuotation

**Real (A):** posts `POST /quotes/` via `quotesService.createQuote(requestId, …)`
with real fields (amount, currency, pricing_model, taxes_included, scope_of_work,
message, estimated_duration, start/completion dates); requestId from URL with
honest "Missing Request ID" guard; attachments upload through the REAL
`documentsService.uploadDocument(file, { document_type: "quotation" })` (correctly
typed!) with `ExtractedDataGrid` feedback; Submit/submitting states.

**D (fabricated):**
- D-1 **Request context sidebar entirely invented**: "RFP #9910-SGP", "Hydraulic
  Pump Overhaul", "Port of Singapore (PSA Terminal)", "MV Nhaav Explorer",
  "18h 42m remaining", "Key Requirements: … Genuine Rexroth spare parts only.",
  "Ocean Shipping Ltd ★4.9 UK Based", "12 Completed Contracts", "Smart Match
  96%" — while the REAL request (`GET /requests/{request_id}`) is never fetched.
- D-2 "Quote Quality Score 92%" circular gauge + "Suggestion: Add a company
  brochure to reach 100%"; Pricing/Team/Proposal checklist states.
- D-3 `CERTS` = "ISO 9001:2015 / DNV-GL Type Approval / IACS Certified" + "+2
  more"; team section with stock "Robert Chen — Lead Hydraulic Engineer" photo,
  "Technician #2", dead "+ Assign Member". No team/cert API exists.
- D-4 "Estimated Grand Total $14,850.00" hardcoded (independent of the typed
  base price); "USD (Locked Rate)".
- D-5 Header persona "Chief Engineer / Fleet Operations"; "Auto-saved 2m ago",
  "Grammar check active", "Drafting Mode Active" — no such systems.
- D-6 Fake "Quote Reference ID" `HZN-QT-88219` readOnly.

**C:** dead top-nav links (Vessels/Contracts/Logistics), dead search, editorial
toolbar buttons, dead Save Draft / Preview Quote buttons, stock `PROF`/`ENG`
images, "(Max 50MB)" formats claim (real: 25MB; backend whitelist).

**B (wire — schema already supports, currently collected-but-dropped):**
- B-1 Warranty Period select → `warranty_period` (field exists; never sent).
- B-2 Payment Terms select → `payment_terms` (same).
- B-3 Validity Until date (defaultValue "2024-12-31"!) → `validity_date` (same).
- B-4 "Emergency/Weekend Surcharge" currently mis-mapped to `travel_charges`;
  schema has `emergency_charges` — map correctly.
- B-5 Uploaded document IDs collected into `uploadedDocIds` then **never sent** →
  pass as `attachments` (schema: `List[str]`).
- B-6 Grand total → compute from base + surcharge (+ tax toggle); remove
  "(Locked Rate)".
- B-7 Quote Reference → editable optional input persisted as
  `quotation_reference` (no fake server-assigned ID).
- B-8 Request sidebar → fetch `GET /requests/{request_id}` and render real
  title/port/urgency/vessel_name/description; omit what's absent. Client name/
  rating/"collaborations" have no source → omit entirely.
- B-9 Discounts free-text input → no schema field; remove (do not invent).

## 5. Cross-source string attribution (for bundle greps)

| String | Lives in (after this pass target = 0) | Notes |
|---|---|---|
| `Maersk Tianjin` | ProcurementOpportunities dead OPPS | Last copy in src (Upload gone) |
| `ISO 9001` | PO tags (dead block, still bundled), CQ certs, SQ CERTS | After pass, remaining copies: none expected in src |
| `Chief Engineer` | SQ header persona | |
| `Hydraulic Pump Repair` / `Annual Fire Safety Inspection` / `Main Engine Overhaul` / `MSC Elmira` | PO OPPS | |
| `Maersk Technical` / `Global Marine Eng` / `TechVessel Solutions` / `OceanInspect Ltd` | CQ PROVIDERS | |
| `Trust Score` / `A+ Rated` | CQ | |
| `RFP #9910-SGP` / `MV Nhaav Explorer` / `Ocean Shipping Ltd` / `HZN-QT-88219` / `Quote Quality Score` / `Auto-saved` | SQ | |
| `Engine Retrofitting` / `Port of Neom` / `Fleet Command System` / `Global Vision` | PO | |
| `IMPA` | PO search placeholder, CQ column | |
| aida-public | PO ×5 URLs, CQ ×5, SQ ×2 | Removes 12 of the remaining ×30 |
| `96%` / `92%` | SQ (Smart Match, quality gauge) | |

## 6. Classification summary

- **A (keep):** PO real API list + dedup + empty state + real CTA; CQ overview
  table + empty state + row nav; SQ real submit payload + real document upload +
  request guard.
- **B (wire to existing endpoints/fields):** PO B-1…B-5; CQ real per-request
  quotes panel; SQ B-1…B-9 (all supported by `QuoteBase` / existing routes —
  nothing invented).
- **C (remove):** dead consts/buttons/images/branding listed per page.
- **D (fabricated, remove):** PO D-1…D-4; CQ D-1…D-5; SQ D-1…D-6.

## 7. Options

### Per-page plan (RECOMMENDED — wire-or-remove, no new endpoints)
- **ProcurementOpportunities:** strip C/D, apply B. KPI row shows only real
  counts; client chip omitted when no source; keep honest empty state.
- **CompareQuotations:** remove the PROVIDERS grid + summary cards + IMPA
  fabrication. Add a real comparison panel: select a request (or land with
  `?requestId=`) → `GET /quotes/request/{id}` renders actual quotes side by side
  (amount, currency, pricing model, warranty, payment terms, scope, status) with
  Accept/Reject wired to the existing admin-approved endpoints. Cost variance can
  then be computed from REAL amounts or omitted.
- **SubmitQuotation:** strip D/C, apply B-1…B-9; fetch real request context.

### Alternative (minimal)
Same removals, but CQ gets no new panel — a pointer line to RequestDetails
instead. Less build, leaves the client comparison flow with no honest surface
(accept/reject still unreachable from UI).

## 8. Proposed contract tests

`tests/test_h9_procurement_contract.py` (file-scoped bans per §5 + positive pins):
- Bans: `OPPS`, `PROVIDERS`, `Trust Score`, `Quote Quality Score`, `HZN-QT-88219`,
  `RFP #9910-SGP`, `MV Nhaav Explorer`, `Maersk Tianjin`, `Chief Engineer`,
  `Engine Retrofitting`, `Port of Neom`, `Fleet Command System`, `IMPA`,
  `ISO 9001`, `DNV`, `Auto-saved`, `Locked Rate`, aida-public in these 3 files.
- Positive pins: `createQuote` payload includes `warranty_period`,
  `payment_terms`, `validity_date`, `emergency_charges`, `attachments`;
  `getRequestById` consumed in SQ; `getQuotesForRequest` + accept/reject wired in
  CQ; PO renders `o.description` and computes KPIs from state.
- Live-app pins: `/quotes/request/{request_id}`, `/quotes/{quote_id}/accept`,
  `/quotes/{quote_id}/reject` exist on `app.routes`.

---

**STOP — no source files modified.** Awaiting approval of the recommended
per-page plan (or the minimal alternative), then implementation → tests →
full battery → inventory update.
