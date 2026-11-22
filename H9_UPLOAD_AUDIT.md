# H9 Phase 4e — Upload Page Audit

**STATUS: AUDITED AND IMPLEMENTED (Option 1 — remove + re-point; no drag-drop port).**

Implementation record (all verified by the full battery): deleted `pages/Upload/`;
removed the router import and `/upload` pin; re-pointed all 7 inbound links to
`/verification` (Dashboard ×2 CTAs, ClientSidebar ×3 incl. expanded-state logic,
ProviderSidebar incl. its expanded-state check, legacy Sidebar,
ShipOwnerDashboard "Upload Docs"); reworded `/verification`'s "Onboarding Phase 02"
chip to "Documents & Verification" (C-8 applied to the canonical page too);
new `nhaav-backend/tests/test_h9_upload_contract.py` (14 tests: removal pins,
inbound-link pins, Upload-only fabrication bans incl. hardcoded
`"vendor_registration"` append, canonical-surface checks); predecessor pins
updated (test_h6_cors.py ×3, test_h9_ocrresult_contract.py ×1) so they guard
the removal instead of the removed page. Battery: 258/258 pytest; tsc clean;
build clean; reference check clean (known vite-env.d.ts FP only); fresh-bundle
grep 0 for every removed string (`vendor_registration` ×3 residual traced to
Dashboard label map + Verification selector + CreateProcurementRequest's own
queued hardcoded append; aida-public ×31 = queued imagery sweep).
Target: `nhaav-frontend/src/pages/Upload/index.tsx` (629 lines, read in full).
Method: full source read; router/sidebar/Dashboard trace; backend contract read
(`app/routers/documents.py`, `document_service.py` contract from H9_FLOW_AUDIT);
cross-source grep of every Upload-specific string.

---

## 1. Reachability & inbound links

Route pin: `router/index.tsx` line 80 — `{ path: '/upload', element: <UploadPage /> }`,
inside the common `ProtectedRoute` block. **Not role-restricted**: clients, providers,
and suppliers can all reach it (ProviderSidebar links to it — see below).

Inbound links (7 total):

| Source | Line | Link | Note |
|---|---|---|---|
| `components/ClientSidebar.tsx` | 96 | "Upload Documents" → `/upload` | Legit |
| `components/ClientSidebar.tsx` | 97 | **"My Documents" → `/upload`** | **Misleading** — Upload has no document list; the persisted-list view is `/verification` |
| `components/ProviderSidebar.tsx` | 98 | "Upload Documents" → `/upload` | Legit (route is shared-role) |
| `components/Sidebar.tsx` | 8 | "Upload Documents" → `/upload` | Legacy sidebar |
| `pages/Dashboard/index.tsx` | 107 | CTA button → `/upload` | Dashboard already H9-audited; `test_h9_dashboard_contract.py` pins its CTA behavior |
| `pages/Dashboard/index.tsx` | 149 | CTA button → `/upload` | Same |
| `pages/Dashboard/ShipOwnerDashboard/ShipOwnerDashboard.tsx` | 230 | "Upload Docs" → `/upload` | ShipOwnerDashboard is a queued audit item |

## 2. Real upload flow verification (frontend → backend)

`handleRunOcr` (Upload lines 68–111):
- POST `${API_BASE_URL}/documents/upload` with `getAuthHeaders()` — **real endpoint, real auth** ✓
- formData contains exactly two fields: `file` (line 83) and `document_type` (line 84,
  **hardcoded `"vendor_registration"` for every file** — see D-1).
- Uses raw `fetch` instead of `documentsService.uploadDocument`, which posts to the same
  endpoint with the same two fields — inconsistency only, same wire behavior (B-1).

Backend `POST /documents/upload` (`app/routers/documents.py`):
- `user_id` = `current_user.id` derived from JWT server-side; **no client-supplied
  ownership field exists** → the client cannot choose someone else's ownership ✓
- Synchronous: store file → persist row → OCR → write `ocr_extracted_data` → commit.
- Response (raw dict):

```python
{
  "status": "success",
  "document_type": <value>,
  "confidence": document.verification_score,   # legacy completion %, NOT accuracy
  "confidence_available": <bool, False today>,
  "field_completion_rate": <float | None>,
  "fields": <fields dict>,
  "document": <full persisted ORM Document>
}
```

The `document` object serializes with: `id`, `user_id`, `document_type`, `name`,
`file_url`, `ocr_extracted_data` (`fields`, `missing_fields`,
`confidence_available: False`, `confidence_reason`, `field_completion_rate`),
`extracted_text`, `verification_status`, `verified_by/at`, timestamps.

**Observation (not a fabrication):** returning the raw ORM object also exposes
`file_url` (internal storage path) and `user_id` to the uploader. Same-user data, so
no cross-user leak — optional hardening: return a `DocumentResponse`-shaped subset.
Flagged for a future hardening pass, not part of H9 fake-data scope.

## 3. What Upload can display immediately from the upload response

From the single `POST /documents/upload` response, with **no** `GET /documents/me` call:
persisted document `id`, `document_type` echo, `verification_status`, `fields`,
`missing_fields`, `extracted_text`, `field_completion_rate` (+`confidence_available`).

`GET /documents/me` is only needed for the historical list — which the canonical
`/verification` page already renders.

**What Upload does with this today:** reads only `fields`, `missing_fields`,
`extracted_text`, `confidence` (→ `verification_score`), `document_type`. It **drops**
`verification_status`, document `id`, `field_completion_rate`, and
`confidence_available` — `ParsedResultBox` already supports both of the latter
(`confidence_available?: boolean`, `field_completion_rate?: number`).

**Silent-success bug (B-2):** `if (data.status === "success" && data.fields)` — when OCR
extracts zero fields, the whole response is ignored: no UI feedback, even though the
backend **did persist the document row**. The user never learns a document was created.

## 4. Ownership / trust verification

Confirmed: `user_id ← get_current_user` (JWT) server-side; no ownership field in the
form; `GET /{document_id}/file` and `DELETE /{document_id}` both enforce
`document.user_id == current_user.id`. Matches the user's required flow exactly.

## 5. Admin access to persisted OCR JSON

Confirmed again with line numbers in `app/routers/admin_verification.py`:
- `/providers/{profile_id}` (line 237) reads `d.ocr_extracted_data` (fields at 260–261,
  full payload at 310); per-doc comparisons via `normalize_comparison`; file streaming
  via the admin file endpoint. **No OCR rerun.** H7 contract intact.

## 6. Redundancy vs canonical `/verification` (Documents/Verification)

The rewritten canonical page already provides: real DocumentType selector (10 backend
types), upload via `documentsService.uploadDocument`, My Documents list from
`GET /documents/me` with expandable persisted extraction detail, authenticated blob
file view, status counts — all H7-honest, reusing `ParsedResultBox`/`ExtractedDataGrid`.

**Verdict: every real function Upload performs is performed truthfully by `/verification`,
with more capability. Upload's unique content is fabricated chrome.**

## 7. Vessel data — presentation-only check

Confirmed: "Maersk Tianjin" (line 334) / "IMO 9632117" (line 340) exist only as JSX
text. No state holds them; the only two `formData.append` calls are `file` and
`document_type`; no other submit exists in the file. **Nothing fabricated is ever sent
to the backend — except the hardcoded `document_type` (D-1), which is real data harm.**

## 8. Cross-source string attribution (bundle-grep guide)

For future bundle greps so hits are not misattributed:

| String | Upload line | Also appears in |
|---|---|---|
| `Maersk Tianjin` | 334 | `ProcurementOpportunities.tsx` line 14 (OPPS array — queued item) |
| `IMO 9632117` | 340 | **Upload only** |
| `Bulk Import` | 445 | Upload only |
| `Save Progress` | 604 | Upload only |
| `Encrypted Connection` | 589 | Upload only |
| `MAX 50 MB` | 453 | Upload only |
| `Deposit Vessel Certificates` | 409 | Upload only |
| `Trust is our / primary anchor` | 215 | `Documents/Verification/index.tsx` line 215 (canonical page heading — **keep**) |
| `vendor_registration` | 84 | `CreateProcurementRequest.tsx` line 295 (hardcoded there too — queued); **legit** selector/label refs in Verification + Dashboard |
| aida-public `PROF_IMG` | 18 | 17 other files (queued imagery sweep) |

## 9. Classification

### A — Real and keep
- **A-1** Drag-and-drop + file select + selected-file name/size display.
- **A-2** `handleRunOcr` real POST to `/documents/upload` with `getAuthHeaders()`.
- **A-3** Rendering of real `fields` / `missing_fields` / `extracted_text` via
  `ParsedResultBox` + `ExtractedDataGrid` (both H7-honest; no accuracy claims).
- **A-4** Process button with real loading state; "Previous Step" (`navigate(-1)`).

### B — Wire to existing data
- **B-1** Use `documentsService.uploadDocument(file, { document_type })` instead of raw
  `fetch` — same endpoint, one source of truth, consistent error handling.
- **B-2** Empty-extraction handling: when `data.fields` is empty, still show the
  persisted confirmation from `data.document` (`verification_status`, id) instead of
  silently ignoring a committed upload.
- **B-3** Pass the truthful metric contract through: `confidence_available` +
  `field_completion_rate` from the response into `ParsedResult` (already supported).
- **B-4** `accept` attribute: add `.tiff,.tif,.docx,.doc` to match backend
  `ALLOWED_EXTENSIONS`.
- **B-5** Correct the formats line to real constraints: "PDF, JPG, PNG, TIFF, DOCX
  (MAX 25 MB)" (only if the page survives — see Option 1).
- **B-6** `ClientSidebar` "My Documents" → `/verification` (it currently points at
  `/upload`, which has no list).
- **B-7** Replace `alert()` error handling with an inline error state.
- **B-8** Dead top-nav links: remove "Vessels" / "Contracts" / "Logistics" (no routes);
  keep "Marketplace" (real navigate).

### C — Remove/reduce (fabricated decoration)
- **C-1** `STEPS` stepper — fake onboarding state ("Profile — Vessel identity
  established, done: true"; "Awaiting ledger confirmation" — no ledger exists).
- **C-2** `LIVE_STATUS` card — fabricated "Certificate of Registry VERIFIED" /
  "Safety Management PENDING" chips.
- **C-3** `REQUIREMENTS` cards — invented "REQUIRED" obligations (Tonnage, ISPS); the
  backend imposes no such per-document requirements.
- **C-4** "Maersk Tianjin / IMO 9632117" vessel block — hardcoded vessel that isn't
  the user's.
- **C-5** Dead "Bulk Import" button (no onClick; no bulk backend endpoint).
- **C-6** Dead "Save Progress" footer button (no onClick).
- **C-7** "System Online: Encrypted Connection" badge — unverifiable claim.
- **C-8** "Onboarding Phase 02" label — no onboarding state machine exists.
- **C-9** Dead anchor icon (top nav, no handler).
- **C-10** `PROF_IMG` aida-public stock avatar + `navigate("/profile")` on it — part of
  the ×17-file imagery sweep; per-avatar treatment decided there.

### D — Unsupported / fabricated claims (must go)
- **D-1** **Hardcoded `document_type: "vendor_registration"` for every upload** —
  misclassifies every user document in the database (a CDC or tax invoice lands in DB
  as "vendor_registration"). This is real persisted-data corruption, not just UI.
  Wire to a real selector (the canonical page already has one) or accept the type
  explicitly. **Most consequential finding in the page.**
- **D-2** Marketing claim: "Our automated systems cross-reference these with global
  port authorities and IMO databases" — no such integration exists.
- **D-3** "Accepted Formats: PDF, PNG, JPEG (MAX 50 MB)" — wrong size (real 25 MB),
  wrong format set (omits TIFF/DOCX).
- **D-4** VERIFIED/PENDING chips (see C-2) — fabricated verification state presented
  as live system status.

## 10. Options

### Option 1 — Remove the page, re-point links (RECOMMENDED)
Given §6 (full redundancy) and §2 (D-1 data corruption): delete `pages/Upload/`, remove
the `/upload` route pin, and re-point all 7 inbound links to `/verification`:
- Dashboard ×2 CTAs → `/verification` (matches `test_h9_dashboard_contract.py` intent);
- `ClientSidebar`: "Upload Documents" → `/verification`; "My Documents" → `/verification`
  (both become true labels);
- `ProviderSidebar` + legacy `Sidebar`: "Upload Documents" → `/verification`;
- `ShipOwnerDashboard` "Upload Docs" → `/verification` (queued page gets one less fake target).

Pros: eliminates D-1 at the root, removes the largest fabrication cluster (C-1…C-10,
D-2…D-4) in one move, one canonical upload+review surface. Cons: loses the drag-drop
hero UX unless `/verification` grows a drop zone (it has file select today — drop-zone
addition is an optional enhancement there).

### Option 2 — Reduce Upload to an honest minimal uploader
Keep route; apply B-1…B-8 and strip C-1…C-10, D-2…D-4; replace D-1 with a real
DocumentType selector (copy the one from `/verification`). Pros: keeps Dashboard CTA
destination and the drag-drop surface. Cons: two upload surfaces to keep in sync with
the same contract — the exact drift that produced this page.

## 11. Proposed contract tests (for whichever option is approved)

Following the `test_h9_ocrresult_contract.py` / `test_h9_admin_honesty_contract.py`
conventions (source-path ban greps + route pin checks):
- Route assertion matching the chosen option: Option 1 → `/upload` absent from
  `app.routes`-equivalent frontend router pin + no `path: '/upload'` in router source;
  Option 2 → present once.
- Source bans (per option): `vendor_registration` hardcoded append, `Maersk Tianjin`,
  `IMO 9632117`, `Bulk Import`, `Save Progress`, `Encrypted Connection`, `MAX 50 MB`,
  `50 MB`, `aida-public` URL, `LIVE_STATUS`/`VERIFIED` chip block, the IMO
  cross-reference sentence.
- Inbound-link pins: Dashboard CTAs and sidebar labels resolve to the surviving route.
- Reminder (recurring gotcha): Verification's docstring/heading reuse of shared strings
  ("Trust is our / primary anchor") must not trip the bans — attribute per §8.

---

**STOP — no source files modified.** Awaiting approval: Option 1 (remove + re-point)
or Option 2 (reduce + retype), then implementation → contract tests → full battery →
inventory update.
