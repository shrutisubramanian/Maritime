# H9 Phase 4g — ServiceDetails Page Audit

**STATUS: AUDITED AND IMPLEMENTED (Option 1 — reduce to the API-backed page).
Route decision executed: dead `/service/:listingId` and `/service/:providerId/:skill`
pins removed (no in-app callers; backend has no `GET /marketplace/services/{id}` to
support them — inventing behavior was ruled out). Dead `getServiceById` service
method removed. The `?service=` param ServiceDetails sends to CreateProcurementRequest
is now genuinely consumed — it prefills the real `ServiceRequestCreate.title` field.

Implementation record: deleted `CATEGORY_CONTENT`, `DEFAULT_CONTENT`,
`CATEGORY_IMAGES`, `STORE_IMAGES` (~560 fabricated lines); killed the formula rating
(`providers*4.6+0.2`, `providers*12`); removed invented reviews, certification grids,
SLA/warranty specs, vessel compatibility, "Response Rate 98%", "24x7 Support
Active", dead Save/share controls, stock avatar and 19 Unsplash images. Kept and
polished: provider counts, port coverage cards, per-port provider rows (real
names/years/jobs/ratings), description with honest empty state, Request-Quote flow,
platform-voice FAQ and "How Requesting Works". New
`tests/test_h9_servicedetails_contract.py` (13 tests). Battery: 278/278 pytest;
tsc + build clean; reference check clean; bundle grep 0 for every removed string
(residuals attributed to queued pages: ProviderDashboard "Response Rate",
Procurement trio "ISO 9001", Unsplash ×23 in Marketplace/AddService).
Target: `nhaav-frontend/src/pages/Marketplace/ServiceDetails.tsx` (1,127 lines, read in full).
Method: full source read; route/inbound-link trace; real API contract read
(`services/marketplace.ts` → `/marketplace/services/aggregate/...`); cross-source grep
for every shared fabrication string.

---

## 1. Reachability & inbound links

Route pins (`router/index.tsx`):
- `/marketplace/service/:category` — **live** (aggregated view, uses the real API).
- `/service/:listingId` and `/service/:providerId/:skill` — pinned but **no in-app
  navigation targets exist** (grep found zero `navigate('/service/…')` calls).
  Reachable only by typing a URL; both ignore their params and render the category-
  fallback path.
- Common `ProtectedRoute` block; all roles.

Inbound links:
- `Marketplace.tsx:138` → `/marketplace/service/${service_name}?from=services`
- `Marketplace.tsx:1179` → `/marketplace/service/${cat.name}?from=stores`

Note: ServiceDetails' three CTAs navigate to
`/create-request?service=${serviceName}&type=…`, but CreateProcurementRequest reads
**only `type`** — the `service` param is silently dropped (pre-filling is dead).

## 2. Real data available from the API

`GET /marketplace/services/aggregate/{name}` → `service_name`, `description`,
`category`, `subcategory`, `verified_provider_count`, `ports_covered`,
`port_coverage[{port_name, provider_count}]`, `exists`.
`GET .../aggregate/{name}/availability?port=` → per-port `providers[]`
(`company_name`, `rating_avg`, `jobs_completed`, `years_experience`, `badge_label`),
`available`.

**What the page renders truthfully today (A):** title, category/group meta, verified
provider count, available-port chips, port coverage cards (green/amber/red from real
`provider_count`), per-port provider rows (real company names, years, jobs,
`rating_avg`; "Verified" badge only when `badge_label !== 'Unverified'`), PROVIDERS/
PORTS counts, Request-Quote CTAs, loading state, honest "No Port Coverage Data" empty
state, and `detail.description` preferred over the fabricated default.

## 3. Fabrications (all rendered from the hardcoded `CATEGORY_CONTENT` map —
~560 lines × 12 categories + `DEFAULT_CONTENT` — shown identically for every provider
in a category, attributing one fictional company's claims to all of them)

### D — unsupported claims presented as trust signals
- **D-1 Rating formula**: `Math.min(totalProviders * 4.6 + 0.2, 5.0)` displayed as the
  service rating, plus `(totalProviders * 12) Reviews`. **Algorithmically fabricated
  from a count** — worse than a hardcoded fake because it looks computed.
- **D-2 "Response Rate 98%"** — no source.
- **D-3 Certifications grid** — static per category (ISO 9001, DNV GL, ISO 14001,
  ISO 17020, ISO 28000, SOLAS, IMO, ISPS, CLASS APPR., IMCA, OEM CERT., IMPA, ICS
  MEMBER, NACE, EPA, SGS, BIMCO, FALCA, ASNT, PCN…). Provider-independent; no
  verification backs any of it.
- **D-4 Vessel Compatibility** — "SUPPORTED" / "INQUIRY ONLY" statuses per category;
  no capability data exists.
- **D-5 Specifications grid** — RESPONSE SLA ("4 Hours"), WARRANTY ("6 Months",
  "12 Months"), COUNTRIES SERVED ("40+ Global"), MIN. ORDER, EST. LEAD TIME, METHOD —
  all invented per category.
- **D-6 "Verified Maritime Service" badge** — shown whenever `totalProviders > 0`;
  conflates provider count with verified status.

### C — fabricated content / dead UI
- **C-1 "Client Feedback" reviews** — invented companies, roles, quotes, dates
  ("Maersk Atlantic", "saved us $2M", "Fuel efficiency improved by 8%").
- **C-2 FAQs written in a provider's voice** ("we exclusively use OEM parts", "our
  teams are available 24/7") — the platform is not the provider.
- **C-3 "24x7 Support Active" chip; CTA trust chips "Secure Payments" / "24/7 Global
  Support" / "Verified Logistics"** — no payments integration exists.
- **C-4 "Commercial Terms"** — "This is a Quote-based Service…" plus Min. Order /
  Response SLA rows re-using D-5 specs.
- **C-5 Dead controls**: Save Service, share, top-nav Fleet/Logistics/Analytics,
  header search, help/apps buttons.
- **C-6 Imagery**: `PROF_IMG` aida-public avatar; 19 Unsplash hero/category/store
  images (`CATEGORY_IMAGES`, `STORE_IMAGES`, `DEFAULT_SERVICE_IMAGE`) — part of the
  imagery sweep (Unsplash appears in only 3 files: ServiceDetails, Marketplace,
  AddService).
- **C-7 `DEFAULT_CONTENT` fallback** — entire fabricated block for unknown categories.
- **C-8 `description` fallback** — `content.defaultDescription` used when API
  description is empty (fabricated first-person provider copy).

## 4. Cross-source string attribution (bundle-grep guide)

| String | ServiceDetails | Also appears in (all queued) |
|---|---|---|
| `ISO 9001` | yes | ProcurementOpportunities, CompareQuotations, SubmitQuotation |
| `DNV GL` | yes (certs + SAFETY STANDARDS) | — |
| `Chief Engineer` | yes (invented reviewer role) | SubmitQuotation |
| `ISO 14001` | yes | CompareQuotations |
| `98%` | yes ("Response Rate") | Admin/index, ProviderDashboard/index (different contexts) |
| aida-public | yes (avatar) | ×17 files (queued sweep) |
| Unsplash | yes (19 URLs) | Marketplace, AddService |

Bans must be **scoped to this file** so queued siblings don't trip (per the
Verification docstring precedent).

## 5. Classification summary

- **A (real, keep):** hero identity/meta, provider count, port chips + coverage
  cards, per-port provider rows, PROVIDERS/PORTS counts, Request-Quote CTAs,
  loading/empty states, API description preference.
- **B (wire candidates):** rating → show '—' unless a real aggregate exists (do NOT
  derive; a backend aggregate may be proposed but none exists today); reviews → real
  provider reviews only if a backend source exists (verify `/providers/{id}` during
  implementation — ProviderProfile §L already uses real profile data; remove section
  if none); certifications → per-provider `licenses` pattern (`prof.licenses or []`)
  only if data reaches this surface; everything else has **no** backend source.
- **C/D (remove):** the entire `CATEGORY_CONTENT` + `DEFAULT_CONTENT` maps,
  D-1…D-6, C-1…C-7; fix C-8 to an honest platform-neutral fallback line.

## 6. Options

### Option 1 — Reduce to the API-backed page (RECOMMENDED)
Delete `CATEGORY_CONTENT`, `DEFAULT_CONTENT`, `CATEGORY_IMAGES`, `STORE_IMAGES`
(hero → neutral icon panel; avatar handled by the imagery sweep), and all D/C blocks.
Keep and polish the A list. Unknown description → one honest platform sentence.
Result: a genuinely honest marketplace detail page showing what the backend actually
knows, with "Request Quote" as the real conversion path.

### Option 2 — Keep curated category copy, relabeled
Retain descriptions/FAQs as clearly-labeled *platform guidance* (not provider
claims), remove all D trust signals (ratings, certs, SLAs, vessel compat, invented
reviews). Cons: still ships category-level claims the backend cannot honor; drift
risk.

## 7. Proposed contract tests (for the approved option)

- Route pins: `/marketplace/service/:category` present; the two dead `/service/...`
  routes per decision.
- File-scoped source bans: `CATEGORY_CONTENT`, `DEFAULT_CONTENT`, `4.6 + 0.2`,
  `Response Rate`, `ISO 9001`, `DNV GL`, `ISO 14001`, `CLASS APPR.`,
  `Vessel Compatibility`, `Client Feedback`, `Maersk Atlantic`, `IMCA`, `Save Service`,
  `images.unsplash.com`, `aida-public`, fabricated spec labels
  (`RESPONSE SLA`, `COUNTRIES SERVED`, `WARRANTY`).
- Positive pins: `getServiceDetail` + `getPortAvailability` still consumed;
  verified-provider count + port coverage rendering retained; honest empty states.

---

**STOP — no source files modified.** Awaiting approval: Option 1 (reduce to
API-backed) or Option 2 (relabeled guidance), then implementation → contract tests →
full battery → inventory update.
