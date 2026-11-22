# H9 — AnalyticsDashboard Audit (READ-ONLY)

> **STATUS: IMPLEMENTED (2026-09-24).** The approved wire-minimal plan below has
> been executed — see "Implementation record" in `H9_INVENTORY.md` §K. The page
> now consumes `GET /jobs/` + `GET /profiles/providers` (as-is, no invented
> verified-only rule); every fabricated claim removed; regression-pinned by
> `tests/test_h9_analytics_contract.py` (12 tests). `/analytics` retained with
> all inbound links intact. Decision §6.1 resolved: wire-minimal; §6.2 resolved:
> leaderboard uses the endpoint population as-is.

> Scope: `/analytics` (`nhaav-frontend/src/pages/Dashboard/AnalyticsDashboard/index.tsx`, 352 lines).
> Discovered during the Phase 4b fresh-bundle grep verification. Nothing modified.
> Treated as a separate audit target, not folded into the resolved Dashboard work.

## 1. Reachability & role exposure

| Question | Answer | Evidence |
|---|---|---|
| Routed? | Yes — `{ path: '/analytics', element: <AnalyticsDashboard /> }` under `ProtectedRoute` | `router/index.tsx:80` |
| Who can reach it? | **Any authenticated user** — no role restriction | router placement |
| Inbound links | Notifications sidebar nav, ProcurementOpportunities sidebar (×2: nav + top tab) | grep: 3 link sites in 2 files |
| Own chrome? | Ships its own top nav + sidebar + profile image + "Schedule Cargo" button — a self-contained template, not using any shared layout | full read |
| Tests pinning values? | None | backend tests grep |
| Fabricated names elsewhere? | Provider names (`Rotterdam Marine Services` etc.) appear **only** here. (`MV Pacific Nhaav` / `INV-2026-0891` belong to OCRResult, not this page — the Phase 4b bundle grep conflated the two because Vite emits one shared chunk.) | per-file grep |

## 2. Data architecture

**Zero API calls.** No service imports, no fetch, no useEffect. Every value is a
module-level constant. It also imports `useAuth` only to destructure `logout`,
which is never used (dead code), and links to `/support`, which **does not
exist** in the router (dead link).

## 3. Element classification (A=real-API-backed, B=wireable now, C=needs new endpoint, D=remove, E=legitimate static)

| Element | Hardcoded value | Class | Basis |
|---|---|---|---|
| KPI: Total Jobs Completed | `1.2k` `+12%` | **B (count) + D (delta)** | `GET /jobs/` returns the user's jobs with `status` filter → completed count derivable. `+12%` has no time-series source → remove |
| KPI: Active Requests | `45` `-4%` | **B (count) + D (delta)** | `GET /jobs/` with `status=active` → active count. Delta fabricated |
| KPI: **Success Rate** | `99.4%` "Stable" | **D — remove** | Same H7 violation class as Dashboard's accuracy card: no success metric exists anywhere |
| KPI: Avg Response Time | `2.4h` `-0.4h` | **D — remove** | No response-time data exists in any model/endpoint |
| Top Performing Services | Engine Repair `422 Jobs` / 85% … | **D — remove** | No per-service job-count endpoint exists; per instruction, no endpoint invented for a card |
| Provider Performance | 3 fake companies w/ ratings | **B — wire** | `GET /profiles/providers` (marketplace search) returns real `company_name`, `rating_avg`, `jobs_completed`. A real "Top Providers" card is derivable (response-time column dropped) |
| Jobs Over Time line chart | SVG path + Jan–Jun | **D — remove** | No time-series data exists; chart cannot be honestly populated |
| Service Categories donut | "4 Main Sectors", fixed proportions | **D — remove** | No category-aggregate endpoint; categories exist but with no counts source |
| Revenue vs Services bars | 4 weeks of fake revenue | **D — remove** | **No revenue concept exists in the backend at all** (quotes have amounts; no payments/ledger) |
| Live Port Activity map | "14 Active Hubs", `4.2k/8.9k Daily Vol`, external world-map image | **D — remove** | No port-activity/hub data; "Live … Monitored" is a fabricated real-time claim |
| Filter dropdowns (Date/Port/Service) | 3 selects | **D — remove or disable** | Pure decoration; they filter nothing |
| "Schedule Cargo" button | — | **D — remove or rewire** | No onClick; dead control |
| Sidebar `Settings` → `/settings` | route exists | **E** | Fine |
| Sidebar `Support` → `/support` | **no route** | **D** | Dead link |
| Profile avatar (`PROF` external URL) | static googleusercontent image | **D** | Shows a fake user's avatar for whoever is logged in |
| Notifications bell | navigates `/notifications` | **E** | Real route |
| Nav labels/icons, "Nhaav Maritime Analytics" heading | — | **E (labels) / D (wording if kept)** | Heading itself is legitimate if the page keeps honest content |

## 4. Honest data source map (existing endpoints only — verified)

| Endpoint | Provides | Can back |
|---|---|---|
| `GET /jobs/` (+`status` filter, user-scoped Client-or-Provider) | `status`, `current_stage`, `completion_percentage` | "My Active Jobs", "My Completed Jobs" KPI cards |
| `GET /profiles/providers` (paginated: `data`+`total`) | `company_name`, `rating_avg`, `jobs_completed` | Real "Top Providers" leaderboard |
| `GET /requests/` (paginated browse) | requests with status | Possibly a browse count — scoping must be verified before any use |
| — | — | **NOT EXISTS**: revenue, response times, success rate, time series, port/hub activity, per-service aggregates |

## 5. Proposed plan (NO code changed — awaiting approval)

**Recommendation: WIRE-MINIMAL.** Rework the page into an honest
"Marketplace Insights" page rather than delete it:

1. **Wire** the two jobs KPI cards to `GET /jobs/` (active / completed counts,
   loading+error+empty states — same pattern as the reworked Dashboard).
2. **Wire** a real Top Providers card to `GET /profiles/providers`
   (company, rating, completed jobs — sorted client-side by `jobs_completed`),
   linking each row to the existing `/provider/:id` profile route.
3. **Remove**: Success Rate, Avg Response Time, Top Services, line chart,
   donut, revenue bars, port-activity map, filter dropdowns, "Schedule Cargo",
   fake avatar, `/support` dead link, dead `logout` destructure, all deltas.
4. Reword heading/subtitle to match the honest content.

**Alternative: remove the page** and point the 3 inbound "Analytics" links
(Notifications + ProcurementOpportunities sidebars) at role dashboards.
Rejected for now: same reasoning the product owner applied to `/dashboard`
(link surface intact, smaller reversible change). The wire-minimal result also
leaves the page with genuinely useful marketplace content rather than a stub.

**Not done in either option:** no new analytics endpoint. If the product later
wants real analytics (time series, revenue, port activity), that is a feature
request requiring backend design — not a cleanup that can be mocked into place.

## 6. Open product decisions — RESOLVED
1. **Wire-minimal approved** (implemented; not removed).
2. **Leaderboard uses `GET /profiles/providers` as-is** — no invented
   verified-only filter (per product owner).
3. Top-services content remains un-built — no honest aggregate source exists;
   deferred to a future backend feature.
