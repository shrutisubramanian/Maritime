# H9 Flow Audit — Document Upload → Persisted OCR → Canonical Review Surface

> **STATUS: IMPLEMENTED (Phases A–D executed as one approved pass).**
> Original audit verdict below; the implementation record is in §6.
> Question answered: does the target flow (upload → OCR → structured JSON →
> persisted against uploader → admin reviews the PERSISTED extraction) require
> any schema change, or does the existing `Document` stack already support it
> end-to-end?

## 1. Verdict: NO migration, NO new table, NO schema change needed

The existing `documents` table already carries every field the target flow
needs. The pipeline already persists the extraction in the database. Verified
field-by-field (`app/models/document.py`):

| Target-flow requirement | Existing column | Status |
|---|---|---|
| document identity | `id` (UUID PK) | ✓ |
| uploader (from JWT, never client) | `user_id` FK → `users.id` (`ondelete=CASCADE`), `user` relationship; router sets it from `Depends(get_current_user)` — the client cannot spoof the owner | ✓ |
| profile association | derived: `Profile.user_id` is `unique=True` (1:1 with User) → `profile_id` is resolvable at read time via `user_id`; no denormalized column needed | ✓ (derived) |
| document type | `document_type` (`DocumentType` enum) + `doc_category` | ✓ |
| structured extraction JSON | `ocr_extracted_data` (JSON): `fields`, `missing_fields`, `confidence_available`, `confidence_reason`, `field_completion_rate` | ✓ |
| raw text | `extracted_text` | ✓ |
| extraction provenance | `source` (pdf_ocr / image_ocr / …), `name` (original filename), `file_url` (server-generated storage key) | ✓ |
| verification status | `verification_status` (`DocumentStatus`: pending / extracted / verified / rejected) | ✓ |
| admin decision trail | `verified_by` FK → users, `verified_at` | ✓ |
| timestamps | `created_at`, `updated_at` | ✓ |
| `field_completion_rate` | inside `ocr_extracted_data`; also mirrored in `verification_score` (legacy COMPLETENESS %, H7 semantics — never accuracy) | ✓ |

### Persistence is already synchronous and committed

`DocumentService.upload_document` (verified lines 36–130):
store object → insert row (`pending`) → commit → OCR (`process_document`) →
**write `ocr_extracted_data` / `extracted_text` / `source` / `verification_score` /
`verification_status = extracted` → `db.commit()`**. The JSON lives in the
database, not in frontend memory. Upload responses and `GET /documents/me`
serve the persisted record. No rerun of OCR is needed for review.

## 2. The admin review surface already exists and reads persisted data

`/admin/verification/*` (all `get_current_admin`-gated, audited via
`AdminAuditLog`):

- `GET /providers` — list with per-provider docs incl. `ocr_extracted_data`.
- `GET /providers/{profile_id}` — full detail: uploader identity
  (`full_name/email/phone`), `ocr_comparisons` (OCR-vs-profile field matrix via
  `normalize_comparison`), per-document `ocr_status` ("OCR Complete"/"OCR
  Pending"), persisted `ocr_extracted_data`.
- `POST /providers/{profile_id}/action` — approve/reject/under_review;
  approve sets `Profile.verified` + `user.is_verified` + all docs verified +
  notification.
- `POST /documents/{document_id}/action` — per-document verify/reject.
- `GET /documents/{document_id}/file` — original file streaming (admin-only
  path; owner path is `GET /documents/{id}/file`).

Frontend `pages/Admin/ProviderVerification.tsx` already renders the persisted
matrix (`activeDetail.ocr_comparisons`), per-doc status, filenames, upload
dates, and streams the original via `adminClient` (`openAdminDocument`).

**The user-side target surface is `Documents/Verification` (route
`/verification`)** — and here is the key discovery: it already calls the REAL
upload pipeline (`documentsService.uploadDocument`) and renders real extraction
(`ExtractedDataGrid`, `ParsedResultBox`). It is NOT a fake page like OCRResult.

## 3. Fabrications found during this audit (candidate H9 items)

### 3a. Backend (`app/routers/admin_verification.py`) — trust-adjacent defaults

| Line(s) | Finding | Class |
|---|---|---|
| ~146–147 | `avg_score`/`max_score` default **`85.0`** when a provider has NO scored documents — invented trust number feeding risk levels | H7-class |
| ~163/174 | Risk labels "Low Risk (Clean Match)" etc. derived from that default 85 → fabricates "Clean Match" for providers with zero extraction | H7-class |
| ~357 | `avg_score` again defaults to None here (detail endpoint is honest) — but ~146 list endpoint is not; **inconsistent** | — |
| ~437 | `"certifications": prof.licenses or ["ISO 9001:2024 Quality Management", "DNV GL Classification License"]` — fake credentials for anyone without licenses | HIGH |
| ~366 | `"position": prof.position or "Chief Engineer"` — invented job title | MEDIUM |
| ~367 | `"badge_label": prof.badge_label or "Unverified"` — cosmetic default, low risk | LOW |

### 3b. Frontend `pages/Documents/Verification/index.tsx` — real flow, fake chrome

Real: drop zone → `uploadDocument` → `ExtractedDataGrid` / `ParsedResultBox`
(true fields, `missing_fields`, completion semantics).

Fabricated around it:

| Line(s) | Finding |
|---|---|
| 25 | stock avatar image (`aida-public` URL) in nav — §D imagery class |
| 32–35 | `LIVE_STATUS`: "Certificate of Registry **VERIFIED**" hardcoded — fake verification claim |
| 37–40 | `REQUIREMENTS`: Tonnage/ISPS requirement cards — invented requirements |
| 176–179 | "Maersk Tianjin / IMO 9632117" hardcoded vessel |
| 65–67 | Marketing copy: "cross-reference … global port authorities and IMO databases" — no such integration exists |
| ~289 | "Bulk Import" — dead button (no handler) |
| ~402 | "Save Progress" — dead button (no handler) |
| ~439 | "System Online: Encrypted Connection" — unverifiable claim |

### 3c. Legacy Sidebar (already queued from OCRResult audit)

`components/Sidebar.tsx:9` "OCR Inspection" → `/ocr-result`; also `Contact
Maritime OCR parser support` copy. Both die when OCRResult is removed.

## 4. Implementation plan (pending approval)

### Phase A — OCRResult removal (approved direction, unchanged)
1. Delete `pages/OCRResult/`, router import + `/ocr-result` pin, Sidebar
   "OCR Inspection" entry (and OCR-support copy).
2. Contract tests `test_h9_ocrresult_contract.py`: no `/ocr-result` route in
   `app.routes`-style pin of router config; no OCRResult import; Sidebar
   source contains no "OCR Inspection"; Dashboard's existing decoupling pin
   stays green.
3. Keep the real inline extraction UI in Upload untouched.

### Phase B — Documents/Verification becomes the canonical user-side review surface
4. Remove §3b fabrications: fake LIVE_STATUS, Maersk Tianjin/IMO block, stock
   avatar, dead Bulk Import/Save Progress buttons, "Encrypted Connection"
   claim, unverifiable marketing copy; replace the fake requirements list with
   the REAL accepted `DocumentType`s (cdc, coc, surveyor_license,
   vendor_registration, kyc_due_diligence, form_10f, no_pe_declaration,
   tax_invoice, verification) — no invented requirements.
5. Add "my documents" persistence view: `documentsService.getDocuments()` →
   list `name`, `document_type`, `verification_status`, `created_at`, and
   per-doc extracted-fields view from `ocr_extracted_data` (hide-empty),
   so the persisted JSON is reviewable by the user too.
6. Fix the hardcoded `document_type: 'verification'` if trivially wrong for
   the file being uploaded — expose real type selection, do not invent one.

### Phase C — Backend honesty fixes (§3a)
7. `85.0` default → `None` end-to-end (list endpoint matches detail endpoint);
   risk labels only computed when a real score exists; `certifications`
   fallback removed (serve `prof.licenses or []`); "Chief Engineer" default →
   neutral/empty.
8. Contract tests pinning: no `85.0` default, no fabricated certification
   strings, no invented position default; H7 pins still green.

### Phase D — Battery + docs
9. `pytest tests/ -q` (233 + new), `tsc --noEmit` + `npm run build`,
   `tools/h9_reference_check.py`, fresh-bundle per-string grep (0 hits:
   Pacific Nhaav, INV-2026, 0.998, OCR Verified, bounding boxes, ISO 9001,
   DNV, Maersk Tianjin, IMO 9632117, 85.0 fallback). Update `H9_INVENTORY.md`
   §D and mark `H9_OCRRESULT_AUDIT.md` / this doc IMPLEMENTED.

## 5. Explicit non-goals
- No new table, no Alembic migration, no new endpoint — everything the target
  flow needs exists and is verified.
- No client-trusted ownership: never added anywhere; `user_id` comes from JWT.
- No verification-status shortcut: `verification` remains admin-decided via
  the audited action endpoints.

## 6. Implementation record (Phases A–D, executed 2026-09-25)

### Phase A — OCRResult removal
- Deleted `pages/OCRResult/` (117-line fabricated demo page).
- Removed router import + `/ocr-result` pin from `router/index.tsx`.
- Removed Sidebar "OCR Inspection" entry and the OCR-parser support-card copy;
  the footer card promised a nonexistent support channel, so the card was
  removed entirely (wire-or-remove: nothing real existed to wire).
- New `tests/test_h9_ocrresult_contract.py` (7 tests): page dir absent, no
  router import/route, no Sidebar entry, no backend route, verification/upload
  routes intact, Upload still calls the real pipeline, Dashboard View action
  still targets `/verification`.

### Phase B — Documents/Verification as canonical review surface
- Rewrote `pages/Documents/Verification/index.tsx` (515 lines, was 451).
  Removed: fabricated VERIFIED status rows, "Maersk Tianjin / IMO 9632117",
  stock avatar (aida-public), port-authority/IMO cross-reference claim, dead
  Bulk Import / Save Progress buttons, fake "System Online: Encrypted
  Connection" badge, fake requirements cards, "MAX 50MB" note (real limit:
  25 MB), dead Vessels/Contracts/Logistics nav links, fake done-state
  stepper. Added: real `DocumentType` selector for uploads (fixes hardcoded
  `'verification'` type), status summary computed from real data, and a
  **"My Documents"** persisted-records view from `GET /documents/me` with
  expandable per-document extraction detail (`fields`, `missing_fields`,
  completion % with the H7 not-accuracy note, real `verification_status`,
  authenticated original-file open via blob). Kept: the real upload → OCR →
  persist pipeline and the `ExtractedDataGrid`/`ParsedResultBox` honest
  components, untouched.
- `documentsService`: added `getDocumentFile()` (user-JWT blob fetch, mirrors
  the admin service convention); `getDocuments()` filter param now optional.

### Phase C — Backend + admin-frontend honesty fixes
- `admin_verification.py`: killed the invented `85.0` default score
  (now `None` when no scored documents, consistent with the detail endpoint);
  risk indicator computed only from real status/completion data — no risk
  claim at all when nothing adverse is known (was: fabricated "Low Risk
  Clean Match" for every empty provider); removed fake ISO 9001/DNV GL
  certification fallback (now `prof.licenses or []`); removed "Chief
  Engineer" / "Maritime Provider" position defaults and badge_label default.
- Admin frontend (`ProviderVerification.tsx` + `adminVerification.ts`):
  "OCR Score" column relabeled **"Field Completion"** (H7 semantics), detail
  header now "Field Completion (not OCR accuracy)", null-safe score/risk
  rendering (— instead of empty green badge), removed fabricated Norwegian
  phone fallback and invented "Preferred Channel" row, replaced second stock
  avatar with an icon, `"%"` → `"% of fields found"`.
- New `tests/test_h9_admin_honesty_contract.py` (4 tests): DB-backed pin that
  a zero-document provider gets `verification_score: null` and no risk claim;
  detail returns `certifications: []`, `position: null`, `badge_label: null`;
  source-level ban on 85.0 / Clean Match / Chief Engineer / Maritime Provider
  / DNV GL / ISO 9001 / Mismatch Detected in the router.

### Battery results
- Backend: **244/244** pytest (was 233; +7 OCRResult, +4 admin honesty).
- Frontend: `tsc --noEmit` clean, production build clean (2 tsc errors found
  and fixed during the pass: risk-badge null typing, getDocuments optional
  param).
- `h9_reference_check.py`: 1 result = the known `vite-env.d.ts` false
  positive; no new orphans (no orphaning from the OCRResult deletion).
- Fresh-bundle grep (per-string attribution on the single chunk): all removed
  OCRResult values 0; Clean Match 0; ATL4979 0. Residual hits all trace to
  already-queued §D surfaces, none from this pass: Upload (Maersk Tianjin,
  Bulk Import, Save Progress, Encrypted Connection, aida-public, 50MB),
  ProcurementQuotes/ServiceDetails (Chief Engineer, ISO 9001, DNV GL),
  remaining template pages (aida-public ×7 files).
- Convention hit once more (4th time): a source comment quoting a banned
  literal trips source-level tests — reworded source comments, not tests
  (twice: admin_verification.py and the Verification page docstring).
