# H9 Audit — ShipOwner Dashboard & Admin Surfaces

**Status:** IMPLEMENTED (§10 fully executed). Verification battery green; see §10 for results.
**Scope:** `ShipOwnerDashboard.tsx`, all 7 files under `pages/Admin/`, plus supporting surfaces (`AdminSidebar`, `AdminProtectedRoute`, router wiring, backend admin endpoints).
**Method:** Full file reads (every target read end-to-end), reachability trace via `router/index.tsx`, real-API trace via `services/*` + backend routers, per-file string attribution via grep.

---

## 0. Reachability (all live — none of this is dead code)

| Route | Component | Guard | Lines |
|---|---|---|---|
| `/ship-owner` | ShipOwnerDashboard | ProtectedRoute + RoleProtectedRoute(client) | 592 |
| `/admin` | AdminPage (`index.tsx`) | AdminProtectedRoute (admin JWT) | 413 |
| `/admin/users` | AdminUsersPage (via `AdminUsers.tsx` shim) | AdminProtectedRoute | 369 |
| `/admin/verification` | ProviderVerification | AdminProtectedRoute | 1192 |
| `/admin/marketplace-services` | MarketplaceServices | AdminProtectedRoute | 342 |
| `/admin/procurement` | ProcurementRequests | AdminProtectedRoute | 319 |
| `/admin/login` | AdminLogin | public | 249 |

All are linked from `AdminSidebar` / `ClientSidebar` / login redirects. This is not dead code — it renders for real users.

**Backend reality check:** `admin_verification` and `admin_auth` routers exist. **There is NO admin users router, no admin requests/procurement router, and no admin marketplace-mutation router.** The only real admin API surfaces today are: admin login, provider-verification queue/detail/actions, and document blob fetch.

---

## 1. ShipOwnerDashboard.tsx — Grade: **D (worst surface in src)**

Real API in use: `requestsService.getUserRequests({client_id})`, `quotesService.getQuotesForRequest/acceptQuote/rejectQuote`. That skeleton is sound. Everything decorative around it is fabricated.

### A — Fabricated data / trust surfaces (must fix)
1. **Persona fabrication** (lines 197–198, 218, 221, 224): "Captain John", "Maersk Line", "Maersk Line Fleet", "Data updated 2m ago". Real `user` object exists in scope (`useAuth`) — header shows a fake identity next to a real one.
2. **Hardcoded KPI cards** (~line 22): `08` active requests, `14` pending quotations, `05` orders in progress, "+2 since last week", "Avg ETA: 4.2 Days". Real counts are computable from state (`procurement.length`, `quotationsList.length`); orders/KPIs have no orders fetch at all.
3. **QUOTATIONS_DEFAULTS** (~line 29): three invented providers (OceanTech Marine, Global Marine Supply, DeepSea Parts) with ratings 4.8/5.0/4.6, jobs "2.1k/840/12k", prices, ETAs. Seeds `quotationsList` initial state — shown whenever fetch fails or before load.
4. **SPEND_CATS / TOP_PROVIDERS / TIMELINE_DATA** (~lines 36–50): entirely fabricated. "SinMar Tech"/"Pacific Marine" with 4.9/4.7 ratings and `verified` badges; spend percentages; timeline events referencing "Request #4505", "Invoice #INV-892".
5. **Real quotes get fake dressing** (fetch mapping ~line 118): `rating: '4.8'` hardcoded; `jobs: 'Verified'` renders as "**Verified** Jobs"; `price: \`$${q.price}\`` — **backend field is `amount`, no `price` field exists → renders "$undefined"**; `eta: q.eta` — **no `eta` field on QuoteResponse → renders empty**. Fallback name `'Verified Provider'` invents a credential for an unknown provider.
6. **Fake IMPA column** (~line 279): header `IMPA Code`, value `r.id.substring(0,6).toUpperCase()` — a UUID fragment presented as an industry code. Last 'IMPA' copy in src.
7. **`quotes: 0` never updated** (~line 114, ~line 342): Quotes column is always 0 even when quotations exist.
8. **Status-blind Accept/Reject** (~lines 150–176, ~lines 390–397): buttons render on every quote regardless of `status` (accepted/rejected quotes remain actionable here — CompareQuotations was fixed for this in 4h; this page was not).
9. **Fabricated-by-default financial modal** (~lines 545–590): `viewingQuote.details?.*` — `details` is never constructed anywhere; modal always shows defaults: Currency "USD", Model "Fixed Fee", "Tax Applied: Yes (7%)"... wait, no — defaults render "None"/"TBD", but the labels "Total Price (Locked)" and "Official Quotation" assert authority over empty data.
10. **Dead controls**: row `edit`/`visibility` buttons with no onClick; "Accept Quotation" button in view modal has **no onClick**; compare-modal "Award Contract" merely closes the modal; "View Full Manifest" and "Export" → `showComingSoon`.

### B — Misleading-but-harmless
- "SINGAPORE (SGSIN)" hardcoded port chip in header; "Top in Singapore" section title with non-Singapore fabricated providers; welcome title hardcodes persona name instead of `user.name`.

### C — Legitimate (keep)
- Theme tokens, layout, ClientSidebar reuse, real requests table (name/port/status from API), accept/reject wiring itself, empty-state string for the table, FAB → `/create-request`, quick-action tiles (Marketplace / Upload Docs → `/verification` / Find Provider → `/create-request`).

### D — Notes
- Sequential quote fetching (up to 5 awaits in a loop) — acceptable at current scale; parallelize opportunistically during the rewrite.
- `PROF_IMG` = 1 aida-public URL.

**Proposed fix (Option 1 — wire-or-remove, mirrors 4h):** derive KPIs from real state; delete QUOTATIONS_DEFAULTS/SPEND_CATS/TOP_PROVIDERS/TIMELINE_DATA and their panels (or re-derive timeline from real quotes); persona → `user.name`/company or plain "Welcome back" + drop fleet/data-updated chips; quote cards → `amount`, `currency`, `validity_date`, `status`-gated accept/reject, provider name via `getProviderById` try/catch (omit if unavailable — never "Verified Provider"); drop IMPA column (keep Request/Category/Status/Quotes); compute Quotes column from fetched quotes; remove dead buttons; honest loading/error/empty states; remove PROF_IMG.

---

## 2. Admin/index.tsx (`AdminPage`) — Grade: **D**

Zero API calls. The entire "Administrative Terminal" is a static mockup.

### A
1. **Fake KPIs**: "Total Users 12,480 (+12% MoM)", "Active Requests 156", "Pending Verification 14", "Platform Health 99.98% Operational".
2. **REQUESTS** (~line 63): three fabricated procurement rows — "Ever Vanguard / Evergreen Marine / $142,500.00", "Maersk Altair / Maersk Line / $89,200.00", "CMA CGM Pegasus / $215,000.00" with berth/value/status.
3. **PROVIDERS** (~line 47): "Nordic Logistics", "Pacific Port Auth", "Suez Canal Group" with **Approve buttons that have no onClick** — an approval action that does nothing on a name that doesn't exist.
4. **TICKETS** (~line 52): "API Connection Timeout", "Billing Dispute: INV-928", "22 Active" badge.
5. **PORTS**: "Singapore Hub 42% Demand" etc.
6. **BARS chart**: "Revenue & User Growth — Combined performance over the last 30 days" with "Live" chip — fabricated series.
7. **Telemetry gauges**: CPU 82% / Latency 24ms / Storage 94% — invented system metrics.
8. **Dead controls**: Export Report, Quick Actions + all 4 QUICK_ACTIONS tiles, header nav (Marketplace/Vessels/Tracking), "Filter by Vessel", row actions.
9. **PROF** stock avatar (aida-public ×1) wired to `/company-profile` — an admin clicking through to a client-side profile page.

### B
- Footer "Operational Terminal v2.4.0" (version implies a real release lineage); "Monitor ... in real-time" subtitle; "Search marketplace operations..." placeholder on a search box that filters nothing.

### C
- Gauge SVG component itself, theme consts, layout.

**Proposed fix (Option 1 — strip to honest minimum):** remove all fabricated panels (KPI numbers, REQUESTS, PROVIDERS, TICKETS, PORTS, BARS, gauges); keep layout/sidebar; either (a) reduce to a launcher page linking to the three real surfaces (verification + the two reworked pages) with zero numbers, or (b) wire KPIs that the backend can actually answer today (verification stats via `adminVerificationService.getStats()` — real endpoint, real numbers) and leave everything else out. No dead buttons.

---

## 3. AdminUsersPage.tsx (via `AdminUsers.tsx` shim) — Grade: **D**

**Zero API calls. No backend router exists** (`grep` over `app/routers` confirms no admin user-management endpoints). Every interaction is theater.

### A
1. **INITIAL_USERS**: three invented users with realistic personal data — "Anders Lindgren / anders.l@nordicship.no / Nordic Marine Logistics / SHIP OWNER", "Chen Wei", "Marcus Thorne (ADMIN, Suspended)".
2. **STATS**: "Active Fleet Personnel 1,822", "Pending Verification 43", "Security Flagged 12", **"Success Rate (KYC) 98.4%"** — the exact KPI the user flagged.
3. **"Managing 2,481 maritime entity profiles"** + "Viewing users 1–10 of 2,481" + fake pagination to page 248.
4. **Action menu theater**: Suspend / Deactivate / Reset Password / Delete User — dropdown renders, **no item has an onClick**. Same for bulk "Change Status", "Export CSV", "Provision User".
5. **Filters bar** (Role/Status/Geography/Verification/Date): none wired to anything; only the two search boxes filter the 3 fake rows locally.
6. **USER_IMGS ×3 + PROF_IMG ×1** — 4 aida-public URLs (largest single concentration left in src).

### B
- Header persona "Systems Oversight"; checkbox/select styling (fine) — nothing else.

### C
- Table component structure, role/status badge styling — reusable if a real endpoint ever lands.

**Proposed fix:** **Option 1 (remove surface)** — delete route `/admin/users` + AdminSidebar item + the two files. No backend exists to wire to; per protocol we never invent endpoints. *(Alternative: keep page but as an honest empty state — rejected as pointless without backing.)* Keep `ProviderVerification` as the canonical admin user-facing surface (it already audits the actual provider users).

---

## 4. MarketplaceServices.tsx — Grade: **C (real data, fabricated dressing)**

Real API: `GET /marketplace/services` with page/limit/search/category_group — the fetch, table, search, and pagination of *service rows* are genuine.

### A
1. **Hardcoded KPIs**: `totalServices = 2841`, `pendingReviews = 42`, `featuredServices = 112`, `monthlyLeads = '18.5k'` — and "2841" leaks into "Showing 1–N of 2,841" while the real total comes back from the API but is discarded.
2. **`Math.random()` fabrication** (~line 232): rating `(4.5 + Math.random()*0.5)`, reviewCount, views, leads **recomputed on every render** — numbers visibly reshuffle when you select a checkbox. This is the single worst data-integrity pattern in the Admin area.
3. **Status fabrication**: `getStatusForService(idx)` — `idx % 5 === 2 → Pending`, `idx % 7 === 3 → Disabled`. Status derived from row position.
4. **Featured toggle theater**: `defaultChecked={idx < 2}`, no onChange, no backend.
5. **Dead controls**: Advanced Filters, New Service Entry, pagination buttons beyond real `page` state ("284"), AU "Admin User / Infrastructure Lead" avatar persona.

### B
- Hardcoded "Items per page: 10".

### C
- Real fetch with loading/error/empty states (empty row exists), real search/category wiring, real pagination state.

**Proposed fix (Option 1):** use the API's real `total` for the count KPI and "Showing X of Y"; drop pending/featured/leads KPI cards (no endpoints); delete rating/reviews/views/leads columns and the Math.random block; drop status + featured columns (no backend semantics); keep table to Service/Category (+ ports/verified-provider counts which ARE in the response: `verified_provider_count`, `ports_covered`, `ports`); honest pagination from real `pages`.

---

## 5. ProcurementRequests.tsx (`/admin/procurement`) — Grade: **D**

**Zero API calls** (`apiClient` imported, never used). 100% static.

### A
1. **SAMPLE_REQUESTS**: 5 fabricated rows — "PRQ-8821 Main Engine Overhaul / Blue Titan / $150,000–$180,000 / 12 QUOTES / URGENT", fuel bunkering, hull cleaning, etc. with invented clients, refs, deadlines ("2d 14h left").
2. **Fake KPIs**: "Total Open Requests 842", "Avg Quotations 4.2", "Urgent 24", "Total Value $12.4M".
3. **Fake pagination** ("of 842 requests", page 85).
4. **Filters + priority toggle** operate only on the 5 fake rows.
5. **Dead controls**: row view/edit/close buttons, Export Report, New Manual Entry.

### B
- "GLOBAL OPS" header persona.

### C
- Row layout, priority/status color maps (reusable).

**Proposed fix:** **Option 1 (wire) is genuinely available here**: public `GET /requests/` supports `page/limit/port/status/service_type/urgency` and returns `{data, total, page, pages}`. Rewire the table to it (title, port, status, urgency, created date; no budget/vessel/client columns unless the response has them — do not invent), KPIs from the real response, real pagination. If we prefer scope discipline, alternatively remove the route — but unlike AdminUsers, a real endpoint exists, so wiring is protocol-compliant.

---

## 6. ProviderVerification.tsx — Grade: **B (already honest; two label nits)**

Fully API-backed via `adminVerificationService` (stats, queue, detail, approve/reject/under-review with reason modal, JWT blob document fetch). H7-compliant: "Field Completion (not OCR accuracy)", risk indicator empty when nothing adverse known, honest empty/loading states.

### A (minor)
1. **"Confidence Score: {doc.verification_score}%"** on document cards (~line 845) — if this score is field-completion, the label reintroduces the H7 confusion at document level. Verify backend semantics; relabel to match (e.g. "Field Completion") or drop the line.
2. **"PDF Document"** hardcoded on every doc card regardless of actual type.

### B
- None significant.

### C
- Everything else — this is the model the other Admin pages should look like.

---

## 7. Supporting surfaces

- **AdminLogin.tsx — Grade A (clean).** Real `adminAuthService.login`, honest error display. No changes.
- **AdminSidebar.tsx — one real functional bug:** footer item is labeled `Sign Out` but the click handler checks `item.label === 'Logout'` → **`adminAuthService.logout()` is never called**; clicking Sign Out navigates to `/admin/login` while the admin JWT stays in storage (AdminProtectedRoute would still treat the session as live). Fix: match the actual label (or check path). Also: "Infrastructure" and "System Logs" both point to `/admin` (duplicate nav entries — fold into the Option-1 rework of Admin/index).
- **AdminProtectedRoute.tsx — clean** (checks separate `nhaav_admin_token`).

---

## 8. Residual stock-imagery attribution (aida-public = 22, updated from 18)

| File | Count | Disposition |
|---|---|---|
| Admin/AdminUsersPage.tsx | 4 | removed with the page (§3) |
| Dashboard/ProviderDashboard/index.tsx | 3 | imagery sweep |
| Landing/index.tsx | 3 | imagery sweep |
| Notifications/index.tsx | 2 | imagery sweep |
| Profile/CompanyProfile.tsx | 2 | imagery sweep |
| Admin/index.tsx | 1 | §2 |
| ProviderDashboard/MyServices.tsx | 1 | imagery sweep |
| ShipDashboard/ShipDashboard.tsx | 1 | imagery sweep |
| ShipOwnerDashboard.tsx | 1 | §1 |
| Marketplace/Marketplace.tsx | 1 | imagery sweep |
| Procurement/.../CreateProcurementRequest.tsx | 1 | imagery sweep |
| Register/Register.tsx | 1 | imagery sweep |
| Financials/Financials.tsx | 1 | imagery sweep |

(The count rose 18 → 22 because earlier attribution was by URL-prefix lines, not per-file grep counts; no regression — same files.)

## 9. Other residual string attribution (cross-check)

- `Maersk` ×3: ShipOwnerDashboard ×2 (persona/fleet chip — §1), Admin/index ×1 (fake row — §2). Zero copies remain elsewhere after this pass.
- `Captain John` ×2: ShipOwnerDashboard only.
- `IMPA Code` ×1: ShipOwnerDashboard dead header (the queued item) — removed by §1.
- Persona strings in ProviderDashboard/index.tsx ("OceanTech Marine Services" welcome, "Capt. Mikhail Sokolov" review) are **outside this audit's scope** — logged for the imagery/cleanup sweep as they belong to the provider dashboard, not ShipOwner/Admin.

---

## 10. Recommended execution order (pending approval)

1. **ShipOwnerDashboard rework** (§1) — biggest trust surface, client-facing.
2. **Admin/index strip** (§2) — remove all fabricated panels; wire verification stats only.
3. **Remove AdminUsers** (§3) — route + sidebar + files; add contract test pinning the removal.
4. **MarketplaceServices honesty pass** (§4) — real totals, delete random() columns.
5. **ProcurementRequests wiring** (§5) — to real `GET /requests/` (or remove, if you prefer).
6. **ProviderVerification nits** (§6) + **AdminSidebar sign-out bug** (§7).
7. Contract tests: `test_h9_shipowner_admin_contract.py` — file-scoped bans (fabricated names, `Math.random`, `98.4`, `12,480`, `99.98`, `2,481`, `1,822`, `2841`), route pins (`/admin/users` absent, others present), live-route checks, payload/field pins for the ShipOwner mapping (`amount`, status-gated actions).
8. Full battery + fresh-bundle grep; update H9_INVENTORY (§R).

---

## 11. Execution record (Phase 4i — complete)

All eight §10 steps executed. Highlights:

- **ShipOwnerDashboard** rewritten (524 lines): identity from the real `user` object (`full_name || name || email`), KPIs derived from live state, quote cards mapped to actual `QuoteResponse` fields (`amount`/`currency`/`quotation_reference` — the `$undefined` price/eta bug is structurally gone), per-request quote counts, status-gated Accept/Reject, no ranking. `'/verification'` quick tile kept (predecessor-pin requirement).
- **Admin/index**: only real `adminVerificationService.getStats()` cards (pending/under-review/cleared/rejected, em-dash fallback) + honest launcher links; every fabricated KPI/row/ticket/panel removed. Stat label is "Providers Cleared" so no dead-control string is reintroduced.
- **AdminUsers removed** (files, route, sidebar entry); sidebar sign-out bug fixed (`'Sign Out'` label check; JWT cleared via `adminAuthService.logout()`); Infrastructure/System Logs stubs and dead Support item dropped.
- **MarketplaceServices**: real `{data,total,page,pages}` pagination and verified-provider/ports aggregates; random ratings/views/leads/statuses gone.
- **Admin ProcurementRequests**: wired to public `GET /requests/` with only endpoint-supported filters (port/status); server-side KPIs and pagination; all sample data removed.
- **ProviderVerification**: "Field Completion" wording; document subtitle shows the real `{doc.name}`.
- **Contract tests:** `tests/test_h9_shipowner_admin_contract.py` — 35 tests, all passing. Two authoring fixes during bring-up: router pins corrected to match the file's single-quote style, and the Admin/index stat label reworded rather than relaxing the dead-button ban.

### Verification
| Check | Result |
|---|---|
| New contract tests | 35/35 |
| Backend full suite | **324 passed, 0 failed** (289 → 324) |
| `tsc --noEmit` + production build | Pass |
| `h9_reference_check.py` | Clean (known `vite-env.d.ts` FP only) |
| Fresh bundle grep | All audited fabrications at **0** (Maersk, Captain John, IMPA, QUOTATIONS_DEFAULTS, Math.random data, 98.4, 12,480, Anders Lindgren, 1,822, 2,481, PDF Document). Remaining `Math.random` ×1 = AuthLayout decorative particles (cosmetic, not data). aida-public ×16 across 10 files — unchanged, queued for imagery sweep. |

**Next queue (per finish order):** ~~imagery sweep → demo seeding → two-account E2E award loop → final regression/bundle audit~~ — all completed; see §12 above and §T in H9_INVENTORY.md (final suite: **330 passed**). Payment stage remains, deliberately last.

---

## 12. Imagery sweep (Phase 4j — complete)

All 16 `aida-public` references (10 files) removed. Wire-or-remove per surface:

| Surface | Was | Now |
|---|---|---|
| ProviderDashboard/index | stock avatar (unused const), 2 stock reviewer photos + invented reviewers (Capt. Mikhail Sokolov, Elena Rodriguez), "OceanTech Marine Services" persona, "18 global ports" | consts deleted; Latest Reviews wired to real `GET /reviews/provider/{user_id}` via `profilesService.getMyProfile()` (loading/error/empty states, rating badge + date + comment, no author-name fabrication — mirrors ProviderProfile 4h); welcome uses `user.company \|\| full_name \|\| name \|\| email`; ports line from real coverage listings |
| MyServices | stock avatar + hardcoded "Nhaav Maritime" | initials tile; name from `useAuth` (codebase convention) |
| ShipDashboard, Financials | stock header avatar | initials tile from signed-in user (kept `/company-profile` click) |
| Marketplace | stock header avatar | initials tile from signed-in user |
| Notifications | stock avatar; stock map behind "Network Pulse" panel | initials tile; CSS gradient panel |
| CreateProcurementRequest | stock avatar | initials tile from signed-in user |
| Landing | stock world map + 2 stock user photos in social-proof stack | CSS dot-grid world panel (keeps ping markers + gradient); initials chips (SM/AO) — purely illustrative marks, no persona claims |
| Register | hotlinked ship photo | bundled local asset `src/assets/images/ship-ocean.jpg` |
| CompanyProfile | stock avatar (unused) + stock map behind "Preferred Service Locations" | both consts deleted; CSS gradient panel |

**Known residual (out of aida inventory, logged):** `images.unsplash` ×23 — Marketplace category-tile art ×19, AddService default ×1, coverageListings defaults ×3. Decorative content images, not fabricated data; queued as optional follow-up.

New contract tests in `test_h9_shipowner_admin_contract.py` (39 total, +4): src-tree-wide aida/googleusercontent ban across the ten swept files, ProviderDashboard real-reviews pins + fabricated-name bans, Register bundled-asset pin, avatar identity convention pins.

### Verification (Phase 4j)
| Check | Result |
|---|---|
| Contract tests | 39/39 |
| Backend full suite | **324 passed, 0 failed** |
| `tsc --noEmit` + production build | Pass |
| `aida-public` / `googleusercontent` in src and fresh bundle | **0 / 0** |
