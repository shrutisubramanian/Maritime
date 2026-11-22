# H9 Inventory — Dead Code, Mock Data & Orphans

> **PHASE 2 (mechanical deletion checkpoint) EXECUTED — see §F at the bottom.**
> Phase 1 was the read-only inventory below; nothing product-facing was touched.
> Baseline after Phase 2: 178/178 backend tests, frontend tsc + build clean.
>
> Verification tool: `nhaav-frontend/tools/h9_reference_check.py` (re-run after
> any deletion to confirm no new orphans appeared).

## A. Dead files — zero references anywhere (safe deletion candidates)

| File | Lines | Notes |
|---|---|---|
| `nhaav-frontend/src/services/api.ts` | 50 | Dead service. 0 importers. Contains the honest `/health` fallback. Original report H9 target. |
| `nhaav-frontend/src/components/ui/infinite-slider.tsx` | 106 | Unused UI-kit component. |
| `nhaav-frontend/src/components/ui/progressive-blur.tsx` | 61 | Unused UI-kit component. |
| `nhaav-frontend/src/pages/Documents/OCRResults/index.tsx` | 12 | Placeholder stub ("This is the OCRResults page"). Never routed. |
| `nhaav-frontend/src/pages/Marketplace/BrowseServices/index.tsx` | 12 | Placeholder stub. Never routed. |
| `nhaav-frontend/src/pages/Marketplace/SearchResults.tsx` | 0 | Empty file. |
| `nhaav-frontend/src/pages/Network/GlobalInfrastructure/index.tsx` | 12 | Placeholder stub. Never routed. |
| `nhaav-frontend/src/pages/Network/ServiceCoverage/index.tsx` | 12 | Placeholder stub. Never routed. |
| `nhaav-frontend/src/pages/Procurement/PurchaseOrders/index.tsx` | 12 | Placeholder stub. Never routed. (NOTE: `pages/Orders/` IS routed — different feature.) |
| `nhaav-frontend/src/vite-env.d.ts` | 16 | **FALSE POSITIVE** — type-declaration file, must NOT be deleted. |

### Duplicate-generation stubs (referenced nowhere, but superseded by real pages)

These are scaffolding-generation leftovers that duplicate *live* pages:

| Stub (unrouted) | Superseded by (routed) |
|---|---|
| `pages/Authentication/Login/index.tsx` | `pages/Login/index.tsx` |
| `pages/Authentication/Register/index.tsx` | `pages/Register/Register.tsx` |
| `pages/Marketplace/Categories/index.tsx` | `pages/Marketplace/Marketplace.tsx` |
| `pages/Marketplace/Categories.tsx` (0 lines) | — |
| `pages/Network/Ports/index.tsx` | (no live equivalent — feature not built) |
| `pages/Onboarding/index.tsx` | (no live equivalent) |
| `pages/Profile/Company/index.tsx` | `pages/Profile/CompanyProfile.tsx` |
| `pages/Profile/Settings/index.tsx` | `pages/Settings/index.tsx` |
| `pages/Profile/Team/index.tsx` | (no live equivalent) |
| `pages/Procurement/ProcurementRequests/index.tsx` | `pages/Procurement/ProcurementRequests/*` real pages |
| `pages/Procurement/Quotes/index.tsx` | `pages/Procurement/Quotes/*` real pages |
| `pages/Documents/Upload/index.tsx` | `pages/Upload/index.tsx` |

All are 12-line "This is the X page" stubs except where noted.

## B. Dead backend models (model + schema + migration exist, no service/router) — ✅ RESOLVED (see §H)

| Orphan | Files | Notes |
|---|---|---|
| `Report` | `app/models/report.py`, `app/schemas/report.py`, table `reports` in migration | No service, no router, no usage. |
| `SupportTicket` | `app/models/support_ticket.py`, `app/schemas/support_ticket.py`, table `support_tickets` | No service, no router. |
| `FavoriteProvider` | `app/models/favorite_provider.py`, table `favorite_providers` | No service, no router, no schema. |

RESOLVED via Option 3: models/schemas deleted + guarded drop-table migration
`e7a8b9c0d1e2`. Decision evidence and safety rails in §H.

## C. API contract mismatch

- Frontend `authService.logout()` calls `POST /auth/logout` — **no such backend
  route exists** (fails silently via `.catch(() => {})`). Backend logout is a
  no-op anyway (JWT is stateless). Either add a trivial backend endpoint or drop
  the call. Cosmetic, but it is an incorrect API contract on the books.

## D. Mock / static / fabricated data (live pages)

| Location | Finding | Severity for H9 |
|---|---|---|
| `pages/Dashboard/index.tsx` | ~~Entire dashboard is static arrays~~ **RESOLVED (§J)** — rewired to `GET /documents/me`. | done |
| `pages/OCRResult/index.tsx` | Static `confidence_score: 0.998` demo result + fabricated fields. Routed at `/ocr-result`. **Also referenced by `/dashboard` View action — now decoupled (see §J).** | HIGH — fake trust signal |
| `pages/Documents/Verification/index.tsx` | Hardcoded doc checklist with `status: 'VERIFIED'` for "Certificate of Registry" (line 42). | HIGH — fake verification claim |
| `pages/Upload/index.tsx` | Same hardcoded VERIFIED checklist (line 31); also hardcodes a vessel name post-upload. | MEDIUM |
| `components/LoginForm.tsx` | ~~"Demo Accounts" panel printing `Demo@123` credentials~~ **RESOLVED (§I)** — panel removed. | done |
| `pages/Dashboard/JobTracking/JobDetails.tsx` | Cleaned in the production pass (no fake engineers/progress). | done |
| `pages/Procurement/ProcurementRequests/RequestDetails.tsx` | Cleaned (real close API). | done |
| `pages/Dashboard/ProviderDashboard/QuotationDetails.tsx` | Cleaned (no mock tax). | done |

## E. Unused exports / minor

- `services/providers.ts` shows 0 importers in the per-file scan BUT exports
  `providersService` used via other import styles — verify manually before any
  deletion (it references `/profiles/providers`, which is a live backend route).
- Route `/service/:providerId/:skill` exists; confirm it resolves to a real page
  during the deletion pass.

## Recommended deletion order (for the NEXT stage — not executed yet)

1. Zero-reference files in §A (mechanical, low risk; keep `vite-env.d.ts`).
2. Duplicate stubs table in §A (verify each with a fresh reference check first).
3. Decide backend orphan models (§B) — delete files, optionally drop tables.
4. Fix the `/auth/logout` contract (§C) — one-line backend route or remove call.
5. Mock-data surfaces (§D) — largest item, needs product decisions per page
   (wire-to-API vs empty-state vs remove), same discipline as the earlier
   production pass. Dashboard + OCRResult + Verification are the priority trio.
6. Re-run: backend suite, `h9_reference_check.py`, frontend tsc + build after
   every deletion batch.

---

## F. PHASE 2 EXECUTION RECORD — mechanical deletion checkpoint

**Date:** 2026-09-20 · **Scope:** §A dead files + clearly-obsolete §B stubs ONLY.
Mock-data surfaces, backend orphan models, and `/auth/logout` deliberately untouched.

### Pre-deletion verification (per instruction protocol)
- Zero static imports: confirmed per candidate (exact-specifier grep for §B,
  name-reference checker for §A)
- Zero dynamic imports: `grep -rn "import("` across src → clean
- Zero router references: router/index.tsx checked per candidate → none
- Zero string/path references: broad greps → only live lookalikes (`apiClient.ts`, `apiEnv.ts`)
- Zero build/config tooling refs: vite.config.ts, tsconfig*, tailwind, eslint, index.html → clean
- No barrel files exist in services/ or components/ui → no re-export breakage
- Fresh reference check before deletion: 10 candidates listed

### Deleted (18 files)
| File | Reason |
|---|---|
| `src/services/api.ts` | 0 importers; dead service (H9 core finding) |
| `src/components/ui/infinite-slider.tsx` | 0 references |
| `src/components/ui/progressive-blur.tsx` | 0 references |
| `src/pages/Marketplace/SearchResults.tsx` | 0 lines |
| `src/pages/Documents/OCRResults/index.tsx` | unrouted stub, superseded by `pages/OCRResult` |
| `src/pages/Marketplace/BrowseServices/index.tsx` | unrouted stub, superseded by `Marketplace.tsx` |
| `src/pages/Marketplace/Categories/index.tsx` + `Categories.tsx` | unrouted stubs, superseded by `Marketplace.tsx` |
| `src/pages/Network/GlobalInfrastructure/index.tsx` | unrouted stub (no live equivalent — scaffolding remnant, not a feature page) |
| `src/pages/Network/ServiceCoverage/index.tsx` | unrouted stub (same) |
| `src/pages/Procurement/PurchaseOrders/index.tsx` | unrouted stub, superseded by routed `pages/Orders` |
| `src/pages/Authentication/Login/index.tsx` | unrouted stub, superseded by routed `pages/Login` |
| `src/pages/Authentication/Register/index.tsx` | unrouted stub, superseded by routed `Register/Register.tsx` |
| `src/pages/Profile/Company/index.tsx` | unrouted stub, superseded by routed `Profile/CompanyProfile.tsx` |
| `src/pages/Profile/Settings/index.tsx` | unrouted stub, superseded by routed `pages/Settings` |
| `src/pages/Procurement/ProcurementRequests/index.tsx` | unrouted stub, superseded by real subpages |
| `src/pages/Procurement/Quotes/index.tsx` | unrouted stub, superseded by real subpages |
| `src/pages/Documents/Upload/index.tsx` | unrouted stub, superseded by routed `pages/Upload` |

Empty directories removed after file deletion: Documents/OCRResults,
Marketplace/BrowseServices, Marketplace/Categories, Network/GlobalInfrastructure,
Network/ServiceCoverage, Procurement/PurchaseOrders, Authentication/Login,
Authentication/Register, Profile/Company, Profile/Settings, Documents/Upload.

### Deliberately retained
| File/feature | Why |
|---|---|
| `src/vite-env.d.ts` | Type-declaration file (checker false positive — framework convention) |
| `pages/Network/Ports/index.tsx` | Per instruction: possibly unfinished feature, not proven abandoned |
| `pages/Onboarding/` | Same (empty dir predates this pass — left exactly as found) |
| `pages/Profile/Team/index.tsx` | Same |
| Backend `Report` / `SupportTicket` / `FavoriteProvider` models | Orphan-model decision (abandoned vs planned) deferred to its own pass |
| `/auth/logout` mismatch | Contract decision deferred (implement endpoint vs remove call) |
| ALL §D mock-data surfaces | Explicitly out of scope for this pass |

### Test results after deletion
| Check | Result |
|---|---|
| `h9_reference_check.py` (after) | Clean — only the retained vite-env.d.ts false positive |
| `npx tsc --noEmit` | Pass (exit 0) |
| `npm run build` (production) | Pass |
| Backend pytest (full) | **178 passed, 0 failed** |

### Newly discovered references/dependencies during deletion
- Two H6 contract tests read `src/services/api.ts` directly and failed after
  deletion. Updated honestly: consumers list no longer includes the dead file,
  a **new guard test** (`test_dead_api_ts_service_stays_deleted`) now asserts
  the file stays deleted, and the health-fallback contract was re-pinned on the
  backend `/health` endpoint instead. No application code referenced the file.

### Remaining H9 items (in recommended order)
1. ~~`/auth/logout` contract decision (§C)~~ → **RESOLVED — see §G below**
2. Backend orphan-model decision incl. table handling (§B)
3. Mock-data surfaces (§D): Dashboard → OCRResult → Documents/Verification →
   Upload → LoginForm Demo Accounts (product decision per page)

## G. PHASE 2a EXECUTION RECORD — /auth/logout contract resolution

**Decision: client-side logout. No endpoint created. §C is closed.**

### Investigation findings (code-verified)
- **Architecture**: stateless JWT. Access token (`JWT_EXPIRE_MINUTES`) + 7-day
  refresh token (`type: "refresh"`). `POST /auth/refresh` exists and works.
  **No revocation infrastructure of any kind** — no token blacklist, no session
  table, no token-version column. `jti` exists only on email verify/reset tokens.
- **Original mismatch**: `services/auth.ts` exported `logout: async () => await
  apiClient.post('/auth/logout').catch(() => {})` — a dead call to a nonexistent
  endpoint with the error swallowed. **Zero callers** of the function anywhere.
- **Admin auth is fully separate** (own axios client, own `nhaav_admin_*`
  keys); `AdminSidebar` already cleared state before navigating — used as the
  reference pattern.

### Why NOT add POST /auth/logout
With stateless JWT and no revocation infra, the endpoint could revoke nothing:
the access token would stay valid until expiry either way, so the endpoint would
be fake security that makes the audit look cleaner without improving it. If
server-side revocation is ever wanted, it needs a real design (blacklist table
checked by the auth guard, or short access TTL + refresh rotation with
revocation) — tracked separately, not smuggled in here.

### Two additional stale-state bugs found and fixed
1. **`nhaav_refresh` was never cleared.** Written to localStorage at login,
   but neither `AuthContext.logout()` nor the 401 interceptor removed it — a
   shared browser could inherit a live refresh token after "logout".
2. **Sidebar Logout was navigate-only.** `ClientSidebar` and `ProviderSidebar`
   bottom-nav Logout items did `navigate('/login')` **without calling
   `logout()`** — token, refresh token and React context stayed alive while the
   login page was on screen, and `/login` has no redirect-if-authenticated
   guard, so the stale session was fully usable.

### Files changed
| File | Change |
|---|---|
| `nhaav-frontend/src/services/auth.ts` | Dead `POST /auth/logout` call removed; comment documents the client-side-only contract |
| `nhaav-frontend/src/context/AuthContext.tsx` | `logout()` now also clears `nhaav_refresh` |
| `nhaav-frontend/src/components/ClientSidebar.tsx` | Logout item calls `logout()` before navigating |
| `nhaav-frontend/src/components/ProviderSidebar.tsx` | Same |
| `nhaav-backend/tests/test_h9_logout_contract.py` | NEW — 9 contract tests |

### Tests added (9, all passing)
1. Backend has no `/auth/logout` route
2. Auth routes are exactly the known 8-endpoint set (blocks accidental endpoint reintroduction without a revocation design)
3. `POST /auth/logout` → 404/405
4. `POST /auth/refresh` with garbage → clean 401 (real long-session mechanism intact)
5. No logout API-call pattern in `services/auth.ts` (pattern-based, comment-safe)
6. `nhaav_refresh` cleared in `AuthContext.logout()`
7. Token + user + refresh all cleared in logout
8–9. Both sidebars clear auth state before navigating

### Verification
| Check | Result |
|---|---|
| Backend pytest (full suite) | **187 passed, 0 failed** (178 → 187) |
| Frontend `tsc --noEmit` | Pass |
| Frontend production build | Pass |
| Repo grep: any `post(…auth/logout…)` call | None |
| Repo grep: `auth/logout` in backend app | None |
| `h9_reference_check.py` | Clean (only known `vite-env.d.ts` false positive) |

### Remaining H9 items
1. Mock-data surfaces (§D): remaining template pages with fabricated data
   (ServiceDetails fake reviews, ProcurementOpportunities / CompareQuotations
   mock data, ShipOwnerDashboard, AdminUsersPage KYC KPI, Admin/index
   procurement rows) and `aida-public` stock imagery (see §L attribution).
   Resolved: OCRResult (§M), Documents/Verification + Dashboard/Analytics/
   ProviderProfile (§J–§L), Upload removal (§N).
2. Production seeding strategy (seed_demo.py / seed_verification.py)
3. §E minor items (unused exports) — cosmetic, last

(Backend orphan models §B resolved — see §H; `/auth/logout` contract resolved — see §G;
LoginForm demo credentials resolved — see §I; Dashboard resolved — see §J;
AnalyticsDashboard resolved — see §K; ProviderProfile resolved — see §L.)

## H. Orphan-model resolution (Phase 3 — Option 3)

### Decision evidence (gathered before any change)
| Question | Answer | Evidence |
|---|---|---|
| Do migrations create the tables? | Yes — only `3241ce641a7d` (phase 2) | grep over alembic/versions |
| FKs pointing TO them? | **None** — all FKs are outbound (→ users/jobs/services/reviews/service_requests) | migration DDL review |
| Referenced indirectly? | No | repo-wide grep |
| In Alembic metadata discovery? | Were, via `models/__init__.py` imports | import audit |
| Production/dev rows? | **Zero rows** in dev DB + all test DBs | read-only COUNT queries |
| Write path ever existed? | **No** — `git log -S` across the entire history shows no router/service for these models | git history |
| Planned features documented? | No mention in any doc/roadmap | docs grep |
| Delete-files-only schema drift? | Yes — that is why a drop migration was chosen instead | drift analysis |

**Conclusion:** Option 3 (delete model/schema + explicit drop-table migration).
Option 1 was rejected: nothing documents these as planned. Option 2 was rejected:
it leaves permanent schema drift between migrations and the ORM, which is exactly
what H2 eliminated.

### Changes
- Deleted: `app/models/report.py`, `app/models/support_ticket.py`,
  `app/models/favorite_provider.py`, `app/schemas/report.py`,
  `app/schemas/support_ticket.py` (favorite_provider had no schema file).
- `app/models/__init__.py`: orphan imports removed.
- New migration `e7a8b9c0d1e2_drop_orphan_tables_h9.py` (down_revision
  `d8e9f0a5b6c7`, so head is now `e7a8b9c0d1e2`):
  - **Data-preserving guard**: refuses to drop any of the three tables if it
    contains rows — raises with an adoption/re-baseline instruction instead of
    destroying data. Never weakened.
  - Inspector-guarded (tolerates tables already absent — adoption scenario).
  - Drops the six orphan-only PostgreSQL enum types (`reporttype`,
    `reportreason`, `reportstatus`, `ticketcategory`, `ticketpriority`,
    `ticketstatus`), each only if no surviving column uses it.
  - PostgreSQL-gated (`dialect.name == "postgresql"`), so SQLite tests are valid.
  - Downgrade recreates all three tables **byte-compatible with the phase-2
    DDL** and restores the enums — documented reversibility. Downgrading past
    this revision requires pinning `down_revision` back to `d8e9f0a5b6c7`
    deliberately (the chain stops here by design).

### Tests added (`tests/test_h9_orphan_models.py`, 8 tests)
Model/schema files gone · orphans absent from `Base.metadata` ·
`models/__init__.py` clean · fresh base→head drops the tables ·
**guard refuses and preserves the out-of-band row** (transactional: version
stays put, row intact) · guard is re-runnable once the table is emptied ·
second `upgrade head` is a no-op · migration source tracks the six pg enums,
the postgres gate, and inspector guarding · read-only dev-DB sanity check.

Also updated `tests/test_migrations.py`: `HEAD` pin → `e7a8b9c0d1e2`,
`EXPECTED_TABLES` without the orphan tables, fresh-migration assertion that
they are gone, and the downgrade test re-pinned to the true `d8e9f0a5b6c7`
shape (admin tables/reconciled columns/uq constraint present there; orphan
tables recreated by the H9 downgrade; round-trip back to head preserves data
and re-drops).

### Deployment note
`alembic upgrade head` on Railway must now reach `e7a8b9c0d1e2`. If a deployed
database somehow has rows in these tables (none do anywhere we can inspect),
the migration **refuses to run** rather than dropping them — triage instruction
is in the error message.

### Verification
| Check | Result |
|---|---|
| `test_h9_orphan_models.py` | 8/8 pass |
| `test_migrations.py` | 11/11 pass |
| Backend full suite | **197 passed, 0 failed** (187 → 197) |
| Frontend `tsc --noEmit` | Pass |
| Frontend production build | Pass |
| `h9_reference_check.py` | Clean |
| Dev DB orphan rows | 0 (migration applies cleanly) |

## I. LoginForm demo credentials removal (Phase 4a)

### Investigation findings (before any change)
- The "Demo Accounts" panel is in `nhaav-frontend/src/components/LoginForm.tsx`
  (click-to-fill: `provider.demo@nhaavmaritime.com` /
  `client.demo@nhaavmaritime.com`, password `Demo@123`).
- **The accounts are real**: `app/seed_demo.py` seeds both with that password;
  `app/seed_verification.py` seeds additional providers with the same password.
  So the panel advertised *working* credentials, not just placeholder text.
- Zero test dependencies on the panel; zero application flows use it; the only
  doc references were this inventory file. Classification: presentation-only
  surface over seeded accounts → safe to remove the UI.
- `seed_demo.py` / `seed_verification.py` deliberately NOT touched — the
  production-seeding question is a separate H9 item (per instruction).

### Changes
- `nhaav-frontend/src/components/LoginForm.tsx`: Demo Accounts panel removed
  entirely. No replacement credentials or hint text invented.

### Tests added (`tests/test_h9_no_demo_credentials.py`, 3 tests)
- `LoginForm.tsx` contains no `Demo@123`, no seeded demo emails, no
  "Demo Accounts" string.
- Repo-wide frontend-source guard: the banned credentials must not migrate to
  any other `.ts/.tsx/.js/.jsx/.html/.css` file.
- Path-sanity guard so this test cannot become silently vacuous if the
  frontend source moves.

### Verification
| Check | Result |
|---|---|
| Focused H9 tests | 3/3 pass |
| Backend full suite | **200 passed, 0 failed** (197 → 200) |
| Frontend `tsc --noEmit` | Pass |
| Frontend production build | Pass |
| Built bundle (`dist/assets`) grep | Clean — credentials absent from shipped JS |
| `h9_reference_check.py` | Clean |

### Note
The stale pre-cleanup `dist/` bundle had contained the credentials in compiled
JS; the fresh build confirms they are gone from what would actually be deployed.

## J. Dashboard wire-and-rework (Phase 4b)

Approved plan from `H9_DASHBOARD_AUDIT.md` (read-only audit, approved by
product owner). `/dashboard` was **intentionally retained** — it remains
reachable from Navbar logo, Landing CTA, SuccessScreen flows, and the legacy
Sidebar; no routing changes in this pass.

### Elements removed / reworked
| Element | Was | Now |
|---|---|---|
| Recent-documents table | 4 fabricated rows (INV-2026-0891, MV Pacific Nhaav, 99.8%) | Real rows from `documentsService.getDocuments()` → `GET /documents/me`; loading / error+retry / empty states |
| Vessel column | Fabricated names (Document has no vessel field) | Removed |
| Confidence column | Fabricated 92–100% values | Removed (H7 contract) |
| Stat cards | 1,482 parsed / 99.4% accuracy / 380ms latency / 3 exceptions | API-backed counts: My Documents / Pending Review / Verified; all "+x% vs last month" deltas removed |
| Active Parser Engines card | ACTIVE/READY badges incl. non-existent `bol_extractor.py` | Removed entirely |
| Header subtitle | "Real-time telemetry and OCR extraction metrics…" | "Your uploaded documents and their review status." |
| View action | `navigate('/ocr-result')` (fake demo page) | `navigate('/verification')` — verified route contract first; no invented query params (the route takes none) |

API source: existing `GET /documents/me` (backend route verified present on the
live app in tests). No new endpoint created. UI displays only fields the API
returns (`name`, `document_type`, `verification_status`, `created_at`, `id`).

### Files changed
- `nhaav-frontend/src/pages/Dashboard/index.tsx` — full rewrite (honest data flow)
- `nhaav-backend/tests/test_h9_dashboard_contract.py` — NEW, 9 tests

### Tests added
Fabricated values banned (`99.4%`, `380ms`, `bol_extractor`, parser filenames,
vessel names, invoice ids, accuracy/latency/exceptions/telemetry wording,
`vs last month`, confidence/accuracy wording) · no ACTIVE/READY badges ·
consumes `documentsService.getDocuments()` · loading/error/empty states ·
View never routes to `/ocr-result` · no invented `vessel` field ·
`/dashboard` route retained · `/documents/me` exists on the live app ·
source-sanity guard.

### Verification
| Check | Result |
|---|---|
| Focused H9 Dashboard tests | 9/9 |
| Backend full suite | **209 passed, 0 failed** (200 → 209) |
| Frontend `tsc --noEmit` | Pass |
| Frontend production build | Pass |
| `h9_reference_check.py` | Clean |
| Fresh bundle grep | Dashboard strings gone. **Residual hits traced to OTHER pages**: `AnalyticsDashboard/index.tsx` (99.4%, MV Pacific Nhaav, INV-2026-0891 — same fabricated values, a §D surface the original inventory missed) and `OCRResult/index.tsx` (0.998). Both out of scope for this pass; AnalyticsDashboard added to the §D queue. |

### Scope note
`/verification` renders `Documents/Verification/index.tsx`, which itself still
contains the hardcoded VERIFIED checklist — it remains on the §D queue and is
now the target of the Dashboard's View action, which raises its priority.

## K. AnalyticsDashboard wire-minimal rework (per H9_ANALYTICS_AUDIT.md)

Approved by product owner. `/analytics` retained with all 3 inbound links
intact; no new backend endpoint created.

### Reworked
| Element | Was | Now |
|---|---|---|
| Jobs KPI cards | Fabricated `1.2k` / `45` + `+12%`/`-4%` deltas | Real counts from `GET /jobs/` via `jobsService.getUserJobs()`: My Active Jobs / My Completed Jobs (derived from actual `status` values) |
| Provider leaderboard | 3 fake companies w/ fabricated ratings/response times | Real Top Providers from `GET /profiles/providers` (as-is, no invented filtering), ranked by `jobs_completed`, showing real `rating_avg` + `jobs_completed`, linking to the existing `/provider/:id` route |
| Success Rate `99.4%`, Avg Response `2.4h` | H7-class trust claims | Removed |
| Top Services, line chart, donut, revenue bars, port-activity map, filters, Schedule Cargo, fake avatar, `/support` dead link, dead `logout` | No backend source / dead | Removed |

States: loading / error+Retry (independent for jobs and providers) / honest
empty states. UI displays only API-returned fields.

### Files changed
- `nhaav-frontend/src/pages/Dashboard/AnalyticsDashboard/index.tsx` — full rewrite
- `nhaav-backend/tests/test_h9_analytics_contract.py` — NEW, 12 tests

### Verification
| Check | Result |
|---|---|
| Focused H9 Analytics tests | 12/12 |
| Backend full suite | **221 passed, 0 failed** (209 → 221) |
| Frontend `tsc --noEmit` | Pass |
| Frontend production build | Pass |
| `h9_reference_check.py` | Clean |
| Fresh bundle grep | All removed Analytics strings at **0**. Residual hits attributed to OTHER pages (below). |

### New §D findings surfaced by the fresh-bundle grep
1. **`pages/Marketplace/ProviderProfile.tsx`** (`/provider/:id`) — fully static
   fabricated profile: "North Sea Maritime Repairs", "99.2% Success Rate",
   "15 Years", fake team stats; never fetches; ignores its `id` param. Now the
   link target of the real Analytics leaderboard, which raises its priority.
2. **`pages/Admin/AdminUsersPage.tsx`** — fabricated admin KPI "Success Rate
   (KYC) 98.4%" (same H7-class claim, on an admin trust surface).
3. Remaining template pages shipping `aida-public` stock imagery (×7 in bundle).

### Scope note
Route verification before implementation confirmed `/provider/:id` exists and
its consuming page takes `:id` via `useParams` — the leaderboard link contract
is correct even though the target page itself needs the §D rework.

## L. ProviderProfile honest-wire rework (per H9_PROVIDER_PROFILE_AUDIT.md)

Approved scope: honest API-backed profile + real reviews + Analytics
profile-ID fix. No new backend endpoints, no invented metrics, backend
privacy behavior untouched.

### Fetch contract (implemented)
- `/provider/me` → `profilesService.getMyProfile()` (GET /profiles/me)
- `/provider/:id` → `providersService.getProviderById(id)` (GET /profiles/{profile_id}, Profile.id-keyed)
- Reviews → `providersService.getProviderReviews(profile.user_id)` (GET /reviews/provider/{user_id})

### Wired / removed (per the approved table)
- **Wired**: company_name, verification_status + badge_label (honest labels for
  verified/under_review/pending/rejected — no invented tier), availability_status,
  years_experience, jobs_completed, rating_avg, bio, skills, services[] (real
  listing names/categories/status), ports_served, licenses (only what the
  provider listed), offices, contacts.
- **Removed**: success rate, response time, completion time, fake team stats,
  fabricated certifications (ISO/Lloyds/DNV), fabricated reviews (Maersk/
  Hapag), supported-vessels list, "< 120 Minutes", stock imagery (hero/map/
  avatar — zero external images remain), dead PDF/Save/Share/Message buttons,
  "Capt. Erik Sorensen", invented "+10 More"/lead counts/verified-slot claims.
- **Kept**: /create-request action, Edit Profile for /provider/me, route + all
  4 inbound links (Analytics + 3 sidebar entries).

### States (all explicit)
Loading · loaded · **404 → honest "Provider not found" screen** · API error +
Retry · reviews loading/error/empty **independent** of the profile · optional
sections hidden when empty (never placeholder text).

### Analytics link-convention fix (audit §2)
Leaderboard now navigates `/provider/${p.id}` (Profile.id — the detail
endpoint's key); `p.user_id` references removed. Regression-pinned by
`TestAnalyticsLinkConvention`.

### Files changed
- `nhaav-frontend/src/pages/Marketplace/ProviderProfile.tsx` — full rewrite
- `nhaav-frontend/src/pages/Dashboard/AnalyticsDashboard/index.tsx` — one-line link fix
- `nhaav-backend/tests/test_h9_provider_profile_contract.py` — NEW, 12 tests

### Verification
| Check | Result |
|---|---|
| Focused H9 ProviderProfile + Analytics tests | 24/24 |
| Backend full suite | **233 passed, 0 failed** (221 → 233) |
| Frontend `tsc --noEmit` | Pass |
| Frontend production build | Pass |
| `h9_reference_check.py` | Clean |
| Fresh bundle grep | All removed ProviderProfile strings at **0** (per-string attribution). Residual `Maersk` ×6 / `aida-public` ×7 traced to OTHER queued §D pages: Admin/index, ShipOwnerDashboard, Documents/Verification, ServiceDetails (fake reviews), ProcurementOpportunities, CompareQuotations, AdminUsersPage, ProviderVerification, ProviderDashboard — all already on the §D queue. |

### Scope note
No external stock imagery remains on the reworked page; the provider page now
renders API data exclusively. The 404 path is real (the endpoint returns 404
for unknown Profile.id) and is rendered honestly.

## M. OCRResult removal + canonical Documents/Verification + admin honesty (per H9_OCRRESULT_AUDIT.md and H9_FLOW_AUDIT.md)

Approved as one A→D pass (2026-09-25). Key audit verdict: the target flow
(upload → OCR → persist → review) needed **no schema change** — the `documents`
table already persists `ocr_extracted_data`/`extracted_text`/status keyed to
the JWT-derived `user_id`, and both review surfaces (admin
`/admin/verification/*`, user Documents/Verification) already existed. The
pass exposed and cleaned persisted data instead of redesigning anything; no
new `profile_id` column (Profile is 1:1 with User, derived at read time).

### What changed
- **Phase A**: `pages/OCRResult/` deleted (100% fabricated: 0.998 accuracy,
  "OCR Verified" badge, INV-2026-0891, MV Pacific Nhaav, bounding boxes,
  dead Export button); `/ocr-result` route + Sidebar "OCR Inspection" entry +
  nonexistent OCR-support footer card removed. 7 contract tests.
- **Phase B**: Documents/Verification rewritten as the canonical user-side
  review surface — real `DocumentType` upload selector, My Documents list from
  `GET /documents/me` with expandable persisted extraction detail (fields,
  missing fields, completion % with H7 note, admin-set status, authenticated
  blob file view); fake chrome removed (VERIFIED rows, vessel/IMO block, stock
  avatar, cross-reference claim, dead Bulk Import/Save Progress, Encrypted
  Connection badge, fake requirements, 50MB note). `documentsService` gained
  `getDocumentFile()` (user-JWT blob, mirroring the admin convention).
- **Phase C**: `admin_verification.py` honesty fixes — no invented 85.0
  default score (null instead), no risk claim when nothing adverse is known
  (was fabricated "Clean Match"), no fake ISO/DNV certification fallback,
  no invented position defaults. Admin frontend: "OCR Score" relabeled
  "Field Completion (not OCR accuracy)", null-safe risk/score rendering,
  fabricated phone fallback and "Preferred Channel" row removed, second stock
  avatar replaced with icon. 4 contract tests.

### Verification
| Check | Result |
|---|---|
| Focused H9 tests (all 8 files) | 66/66 |
| Backend full suite | **244 passed, 0 failed** (233 → 244) |
| Frontend `tsc --noEmit` | Pass (2 errors found and fixed in-pass) |
| Frontend production build | Pass |
| `h9_reference_check.py` | Clean (only known `vite-env.d.ts` false positive) |
| Fresh bundle grep | All removed OCRResult/admin strings at **0** (per-string attribution). Residuals trace ONLY to already-queued §D surfaces: Upload (Maersk Tianjin, Bulk Import, Save Progress, Encrypted Connection, 50MB, aida-public), ProcurementQuotes (Chief Engineer, ISO 9001, DNV GL), ServiceDetails (DNV GL, Chief Engineer), template pages (aida-public ×7 files). |

### Remaining §D queue (updated in Phase 4e)
1. **ServiceDetails** fake reviews/certifications (ISO 9001, DNV GL, Chief
   Engineer strings live here). — **RESOLVED, see §P**
2. **ProcurementOpportunities / CompareQuotations / SubmitQuotation** mock
   rows and fake certifications (now the only remaining "ISO 9001"/
   "Response Rate"-class sources). — **RESOLVED, see §Q**
3. **ShipOwnerDashboard / Admin index / AdminUsersPage KYC KPI** template
   rows + fake "Success Rate (KYC) 98.4%".
4. **Stock imagery sweep** — `aida-public` external URLs across remaining
   files (Upload's copy removed in Phase 4e).
5. ~~CreateProcurementRequest hardcoded `document_type: "vendor_registration"`
   append~~ — **RESOLVED, see §O**
6. **Production seeding strategy** (seed_demo.py / seed_verification.py,
   Demo@123) — deliberately untouched so far.
7. **§E unused exports** sweep.

---

## N. Upload page removal (Phase 4e)

**Audit:** H9_UPLOAD_AUDIT.md (A–D classification: 4 keep / 8 wire / 10 remove /
4 fabricated). **Approved option:** Option 1 — remove the page and re-point all
inbound links; no drag-drop port to /verification.

### What was done
| Change | Files |
|---|---|
| Deleted page | `pages/Upload/index.tsx` (629 lines) — removed with router import + `/upload` pin |
| Inbound links → `/verification` | Dashboard ×2 CTAs, ClientSidebar ×3 (+ expanded-state), ProviderSidebar (+ expanded-state), legacy Sidebar, ShipOwnerDashboard |
| C-8 applied to canonical page | Verification "Onboarding Phase 02" chip → "Documents & Verification" |
| New contract tests | `tests/test_h9_upload_contract.py` (14) |
| Predecessor pins updated | test_h6_cors.py ×3, test_h9_ocrresult_contract.py ×1 — now guard the removal |

Headline finding was D-1: `document_type: "vendor_registration"` hardcoded on
every upload — real database misclassification, not just UI. Removed
fabrications: fake stepper, LIVE_STATUS "Certificate of Registry VERIFIED" /
"Safety Management PENDING" chips, Tonnage/ISPS REQUIRED cards, Maersk Tianjin
/ IMO 9632117 vessel block, Bulk Import, Save Progress, Encrypted Connection,
MAX 50 MB, IMO cross-reference marketing claim, stock avatar, dead nav links.

### Verification
| Check | Result |
|---|---|
| New contract tests | 14/14 |
| Backend full suite | **258 passed, 0 failed** (244 → 258) |
| Frontend `tsc --noEmit` | Pass |
| Frontend production build | Pass |
| `h9_reference_check.py` | Clean (known `vite-env.d.ts` FP only) |
| Fresh bundle grep | All removed Upload strings at **0**. `vendor_registration` ×3 residual = Dashboard label map + Verification selector (legit) + CreateProcurementRequest hardcoded append (queued, item 5). `aida-public` ×31 = queued imagery sweep. |

---

## O. CreateProcurementRequest document-type fix (Phase 4f)

The D-1 defect class survived the Upload removal in this page's "Process
Documents" handler: `formData.append('document_type', 'vendor_registration')`
for every attached file — real database misclassification on a live write
path. The Phase 4e source ban only matched the double-quoted variant, which is
why the battery stayed green while this shipped (ban now quote-agnostic via
regex, pinned in the new test file).

### What was done
| Change | Files |
|---|---|
| Required DocumentType selector (9 backend types, no preselect; processing blocked until chosen) | `CreateProcurementRequest.tsx` |
| Selected type passed through verbatim; count of successfully uploaded documents shown | same |
| Honesty fixes in same surface | formats line "PDF, CAD, XLSX" → "PDF, DOCX, JPG, PNG, TIFF" (backend whitelist); Request Summary hardcoded "Attachments: 0 Files" → real "Documents Uploaded" count |
| New regression tests | `tests/test_h9_cpr_doctype.py` (7): kyc/tax_invoice/quotation persist verbatim in DB, JWT-derived user_id, quote-agnostic hardcoded-append ban, honest formats line |

### Verification
| Check | Result |
|---|---|
| New contract tests | 7/7 |
| Backend full suite | **265 passed, 0 failed** (258 → 265) |
| Frontend `tsc --noEmit` + production build | Pass |
| `h9_reference_check.py` | Clean (known `vite-env.d.ts` FP only) |
| Bundle grep | Hardcoded append + fake formats line + "0 Files" at **0**; "Attachments" ×3 residual = queued QuotationDetails / CompareQuotations / SubmitQuotation. `vendor_registration` ×1 residual in CPR = legit selector option. |

---

## P. ServiceDetails honest rework (Phase 4g)

**Audit:** H9_SERVICEDETAILS_AUDIT.md. **Approved option:** Option 1 — reduce to
the API-backed page. Worst finding: a rating computed by formula
(`totalProviders * 4.6 + 0.2`, reviews `×12`) — fabricated trust signals wearing
the costume of computation, on top of a ~560-line hardcoded per-category content
map (invented reviews, certification grids, SLAs/warranties, vessel compatibility)
shown identically for every provider in a category.

### What was done
| Change | Files |
|---|---|
| Deleted fabricated content maps + imagery maps; removed formula rating, invented reviews/certs/SLAs/vessel-compat, "Response Rate 98%", "24x7 Support Active", dead Save/share controls, stock avatar + 19 Unsplash images | `pages/Marketplace/ServiceDetails.tsx` (1,127 → ~370 lines) |
| Removed dead route pins + dead `getServiceById` (no callers; no backing endpoint — inventing behavior ruled out per approval) | `router/index.tsx`, `services/marketplace.ts` |
| Honest replacements: platform-voice FAQ, "How Requesting Works", neutral hero panel; `?service=` now prefills the real `ServiceRequestCreate.title` field (existing contract, nothing invented) | `ServiceDetails.tsx` |
| New contract tests (file-scoped bans + positive pins + route contract) | `tests/test_h9_servicedetails_contract.py` (13) |

### Verification
| Check | Result |
|---|---|
| New contract tests | 13/13 |
| Backend full suite | **278 passed, 0 failed** (265 → 278) |
| Frontend `tsc --noEmit` + production build | Pass |
| `h9_reference_check.py` | Clean (known `vite-env.d.ts` FP only) |
| Fresh bundle grep | All removed ServiceDetails strings at **0** (Maersk Atlantic, Vessel Compatibility, Client Feedback, DNV GL, CLASS APPR, Save Service). Residuals attributed: "Response Rate" ×1 = ProviderDashboard (queued), "ISO 9001" ×2 = Procurement trio (queued), Unsplash ×23 = Marketplace/AddService (imagery sweep), aida-public ×30 = imagery sweep. |

---

## Q. Procurement trio honest rework (Phase 4h)

**Audit:** H9_PROCUREMENT_AUDIT.md. **Approved:** per-page wire-or-remove plan,
with the explicit constraint that no quote ranking/"best quote" indicator may be
introduced. Headline: the backend already supported the honest flows —
`GET /quotes/request/{id}` + accept/reject endpoints existed but were never called,
and `QuoteBase` accepted warranty/payment/validity/surcharge/attachments fields that
SubmitQuotation collected and silently dropped.

### What was done
| Page | Removed | Wired |
|---|---|---|
| ProcurementOpportunities | dead OPPS/NAV consts (last "Maersk Tianjin"/"ISO 9001" copies in src), fake KPIs, Global Market Insights, sidebar/footer, ★4.8 Verified client chips | KPIs from real state; My Submitted Quotes → `/my-quotations`; View Full Request → `/request/{id}`; `o.desc`→`o.description` fix; error state |
| CompareQuotations | 4-provider fictional grid, Trust Score A+, IMPA fragment column, PR-4482 chip, fake Award Contract | real quotes via `getQuotesForRequest`, provider names via `getProviderById`, working Accept/Reject, honest states, "no ranking" guidance card |
| SubmitQuotation | fabricated RFP/vessel/client context, Quote Quality Score, persona, CERTS, fake total, 50MB claim | real request context (`getRequestById`); payload now includes warranty_period, payment_terms, validity_date, emergency_charges, travel_charges, quotation_reference, attachments; computed total |

New `tests/test_h9_procurement_contract.py` (11 tests: bans scoped to the trio,
no-ranking regex pin, full QuoteBase payload pin, route pins incl. live accept/reject).

### Verification
| Check | Result |
|---|---|
| New contract tests | 11/11 |
| Backend full suite | **289 passed, 0 failed** (278 → 289) |
| Frontend `tsc --noEmit` + production build | Pass |
| `h9_reference_check.py` | Clean (known `vite-env.d.ts` FP only) |
| Fresh bundle grep | All trio fabrications at **0** (Maersk Tianjin, ISO 9001, DNV, Chief Engineer, Trust Score, RFP #9910-SGP, Quote Quality Score, …). Residuals attributed: IMPA ×1 = ShipOwnerDashboard (queued); aida-public ×18 (was 30 — trio removed 12). |

## R. ShipOwner + Admin honesty rework (Phase 4i)

**Audit:** H9_SHIPOWNER_ADMIN_AUDIT.md (grades: ShipOwner D, Admin/index D, AdminUsers D — no backend, MarketplaceServices C, AdminProcurement D, ProviderVerification B, AdminLogin A + a live sign-out bug).

### What was done
| Surface | Removed | Wired / Fixed |
|---|---|---|
| ShipOwnerDashboard | persona (Captain John / Maersk), 08/14/05 KPIs, QUOTATIONS_DEFAULTS, SPEND_CATS/TOP_PROVIDERS/TIMELINE_DATA, fake IMPA column, `q.price`/`q.eta` (`$undefined`) mapping, always-on Accept/Reject, details-modal defaults | identity from `user?.full_name \|\| user?.name \|\| user?.email`; KPIs from real state; quotes via `getQuotesForRequest` counts; real `amount`/`currency`/`quotation_reference`; status-gated ('submitted') actions; provider names via `getProviderById` try/catch; "How Awarding Works" (no ranking); `'/verification'` tile kept |
| Admin/index | platform KPIs (98.4%, 1,822, 2,481), fake rows/tickets/berths, gauges, dead buttons (Export Report / Quick Actions / Filter by Vessel / Approve), Port Hubs, System Telemetry | 4 real cards from `adminVerificationService.getStats()` with '—' fallback (label "Providers Cleared"); honest launcher to verification / marketplace-services / procurement; "About this dashboard" note |
| AdminUsers | `AdminUsers.tsx` + `AdminUsersPage.tsx` files, `/admin/users` route + import, sidebar "User Management" | sidebar entry → "Procurement Requests" → `/admin/procurement`; contract test pins src-tree-wide name/metric bans |
| AdminSidebar | Infrastructure / System Logs stubs, dead Support item | sign-out bug fixed: handler checked `label === 'Logout'` but item is 'Sign Out' → now calls `adminAuthService.logout()` before navigating to `/admin/login` |
| MarketplaceServices | Math.random ratings/reviews/views/leads, idx-modulo status, featured toggles | KPIs + prev/next from real `{data,total,page,pages}`; table = Service/Category/Verified Providers/Ports Covered; honesty note |
| Admin ProcurementRequests | SAMPLE_REQUESTS, PRQ ids, fake vessels, 842/$12.4M/GLOBAL OPS, dead buttons | `apiClient.get('/requests/')` with port/status params only; server-side KPI totals; real page/pages pagination; '—' for absent optionals |
| ProviderVerification | "Confidence Score:", hardcoded "PDF Document" subtitle | "Field Completion:"; `{doc.name}` under the type label |

New `tests/test_h9_shipowner_admin_contract.py` (35 tests: per-file bans, regex no-ranking pins, route pins incl. live backend routes, AdminUsers tree-wide bans).

### Verification
| Check | Result |
|---|---|
| New contract tests | 35/35 |
| Backend full suite | **324 passed, 0 failed** (289 → 324) |
| Frontend `tsc --noEmit` + production build | Pass |
| `h9_reference_check.py` | Clean (known `vite-env.d.ts` FP only) |
| Fresh bundle grep | Maersk / Captain John / IMPA / QUOTATIONS_DEFAULTS / Math.random-data / 98.4 / 12,480 / Anders Lindgren / 1,822 / 2,481 / PDF Document all **0**. Residual `Math.random` ×1 = AuthLayout particles (cosmetic). aida-public ×16 across 10 files — queued for imagery sweep. |

## S. Imagery sweep (Phase 4j)

**Scope:** the 16 aida-public / googleusercontent stock-URL references across 10 files (the last hotlinked imagery in src).

### What was done
Avatars (7 surfaces) → initials tiles derived from the signed-in `useAuth` user (or the real company name in MyServices, replacing hardcoded "Nhaav Maritime"). Decorative map/world panels (Landing, Notifications, CompanyProfile) → CSS gradients and dot-grid patterns keeping the same layout accents. ProviderDashboard → the biggest win: fabricated reviewers (Capt. Mikhail Sokolov, Elena Rodriguez) and the "OceanTech Marine Services" persona deleted; Latest Reviews now loads real reviews (`profilesService.getMyProfile()` → `getProviderReviews(user_id)`, the same source ProviderProfile has used since 4h) with loading/error/empty states; welcome line uses the real company name and real coverage-listing ports. Register → bundled local asset (`ship-ocean.jpg`).

**Known residual:** `images.unsplash` ×23 (Marketplace category tiles ×19, AddService ×1, coverageListings defaults ×3) — decorative content photos, not fabricated data; optional follow-up, not part of the aida inventory.

`test_h9_shipowner_admin_contract.py` grew to 39 tests (+4 imagery pins).

### Verification
| Check | Result |
|---|---|
| Contract tests | 39/39 |
| Backend full suite | Re-confirmed at **330 passed** in the final regression (§T; the 4 new imagery tests landed after this phase's battery run) |
| `tsc --noEmit` + production build | Pass |
| Fresh bundle | aida-public / googleusercontent / Mikhail / Elena Rodriguez / OceanTech all **0**; `images.unsplash` ×23 = documented decorative residual |

## T. Demo seeding + two-account E2E + final regression (Phases 4k–4l)

### Demo seeding (Captain demo dataset)

Existing seeds audited and kept: `app/seed_demo.py` (demo client/provider accounts + profiles, production-guarded), `app/seed_verification.py` (5 providers covering every admin-queue state: pending ×2, under_review, verified, rejected — with OCR'd documents), `app/seed_admin.py` (deliberately creates NOTHING without `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars — see demo-prep note below).

New `app/seed_demo_e2e.py` (run: `python -m app.seed_demo_e2e`, idempotent, production-guarded like seed_demo): drives the REAL service layer (no direct inserts for flow records) to create visibly-labeled demo data:

- 3 `[DEMO]` requests for the demo client (hull inspection Rotterdam, emergency engine repair Singapore, deck-stores supply Singapore).
- 2 competing `[DEMO]` quotes (DEMO-Q-1001/1002) from verified demo providers on the hull request — the eligibility path required giving each provider a matching active `[DEMO]` service listing (mirrors the real quoting rule).
- The winning quote accepted via `QuoteService.accept_quote` → request `awarded`, Job created, competitor rejected, notifications fanned out.

**Every demo record is marked `[DEMO]` in title/reference; demo user names end in "(Demo)".** DB state verified: 3 demo requests, 2 demo quotes, 1 award + job, admin queue populated across all statuses.

Demo credentials (all `Demo@123`): `client.demo@nhaavmaritime.com`, `provider.demo@nhaavmaritime.com`, `titanium.marine@nhaavmaritime.com`.

### Two-account E2E (`tests/test_h9_e2e_award_loop.py`, 2 tests)

Drives the real HTTP API with independently-authenticated client + two provider accounts on a dedicated SQLite file: create request → public browse → provider quotes (asserting real `amount`/`currency`, and that `price`/`eta` fabrication surfaces stay gone) → open→quoted → non-owner accept 403 → owner accept → awarded + `selected_quotation_id` → competitor bulk-rejected → Job created → `/quotes/my-quotations` + `/jobs` visibility for both providers → notifications fan-out. Second test pins the single-shot award (re-accept 400, quoting a closed request 400).

### Final regression

| Check | Result |
|---|---|
| Backend full suite | **330 passed, 0 failed** (289 baseline + 35 Phase 4i + 4 imagery + 2 E2E) |
| `tsc --noEmit` + production build | Pass |
| `h9_reference_check.py` | Clean (known `vite-env.d.ts` FP only) |
| Fresh bundle grep | aida-public / googleusercontent / Maersk / Captain John / IMPA / QUOTATIONS_DEFAULTS / 98.4 / 12,480 / Anders Lindgren / Mikhail / OceanTech / PDF Document all **0** |

**Demo-prep note (needs user action):** the admin login has no seeded account by design — set `ADMIN_EMAIL`/`ADMIN_PASSWORD` and run `python -m app.seed_admin` before the Captain call if the admin side will be shown.

## U. Security pass — anti bulk-extraction rate limiting (H10)

**Audit:** H10_SECURITY_RATE_LIMIT.md. Captain's question: "what stops one login from scraping all vendors/ports?" Server-side, user-scoped (JWT `sub`), database-backed (`rate_limit_events` table; migration `f9a0b1c2d3e4`) sliding-window counters — no Redis introduced, no public route made authenticated (optional-auth dependency; anonymous callers pass through uncounted).

Protected: vendor/supplier/marketplace searches (`vendor_search` ×5), per-port coverage details (`port_search` ×5), provider detail (`vendor_detail` ×20), page-size caps (`MAX_SEARCH_PAGE_SIZE` 25) on the search routes and public `/requests/`. `download` (×10) audited but deliberately unwired — no bulk/export endpoint exists. 429 JSON `{code, category, message}` + `Retry-After`; fail-open on store errors; env-configurable, nothing hardcoded client-side; frontend shows "Search limit reached. Please try again later." with no fake counters.

New `tests/test_h10_rate_limit.py` (14 tests). Migration-test head pin updated for the new revision (chain bump, not a weakening).

### Verification
| Check | Result |
|---|---|
| Focused tests | 14/14 |
| Backend full suite | **344 passed, 0 failed** (330 → 344) |
| `tsc --noEmit` + production build | Pass |
| Bundle audit | No limit names/values leak to the client |
