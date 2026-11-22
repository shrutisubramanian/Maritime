# H9 — ProviderProfile Audit (READ-ONLY)

> **STATUS: IMPLEMENTED (2026-09-24).** The approved honest-wire plan below has
> been executed — see "Implementation record" in `H9_INVENTORY.md` §L. The page
> now fetches real profile data (me-vs-id), real reviews via user_id, hides
> empty optional sections, and handles loading/404/error states. The Analytics
> leaderboard id-convention bug (§2) is fixed and regression-pinned.
> Fabricated values verified absent from the fresh production bundle.

> Scope: `/provider/:id` (`nhaav-frontend/src/pages/Marketplace/ProviderProfile.tsx`, 322 lines).
> Discovered while validating the AnalyticsDashboard route contract (§K scope note).
> **Nothing modified.** Stop-before-edit per product owner instruction.

## 0. Already-confirmed facts (recorded as instructed)

- `/provider/:id` exists in the router (`router/index.tsx:74`, element `<ProviderProfile />`).
- `ProviderProfile.tsx` currently **ignores `id`** except for one `id === 'me'`
  conditional that swaps the bottom-bar button for "Edit Profile". It performs
  **no fetch of any kind**.
- Contains hardcoded `"North Sea Maritime Repairs"` (hero company name).
- Contains `"99.2% Success Rate"` (H7-class trust claim).
- `"Titanium Verified"` is a fabricated/static badge.
- Discovered during AnalyticsDashboard route-contract validation (fresh-bundle
  grep + route verification), documented in `H9_INVENTORY.md` §K.

## 1. Reachability — BROADER THAN EXPECTED

| Source | Link | Meaning |
|---|---|---|
| AnalyticsDashboard leaderboard (new, §K) | `/provider/${p.user_id ?? p.id}` | 3rd-party profile view |
| `ProviderSidebar.tsx:103` "Company Profile" | `/provider/me` | **Own-profile view** (matches `/provider/:id` with id='me') |
| `ProviderSidebar.tsx:104` "Reviews & Ratings" | `/provider/me` | Own-profile view |
| `ProviderSidebar.tsx:109` "Profile" | `/provider/me` | Own-profile view |

So the page serves **two distinct use cases**: viewing another provider
(Analytics entry) and a provider viewing their own profile (sidebar entry).
Any rework must handle both, including the `id === 'me'` path, which currently
would send the literal string `'me'` to a UUID-typed endpoint (422).

## 2. ⚠️ BUG FOUND IN MY OWN §K WORK — Analytics link convention — FIXED

(Implemented in the same pass, per approval. Regression-pinned by
`tests/test_h9_provider_profile_contract.py::TestAnalyticsLinkConvention`:
Analytics must link `/provider/${p.id}` and must not reference `p.user_id`.)

`GET /profiles/{profile_id}` (verified: `routers/profiles.py:169` →
`ProfileService.get_profile_by_id`) is keyed by **`Profile.id`** (the profile's
own primary key). The Analytics leaderboard links with
`` `p.user_id ?? p.id` `` — **user_id first**. Profile.id and User.id are
different UUIDs, so leaderboard clicks will **404** for real providers.

Fix (one line, Analytics file): navigate to `/provider/${p.id}` (profile id).
The profile page then uses the fetched profile's `user_id` where a user-scoped
endpoint is needed (reviews). To be fixed as part of the ProviderProfile
implementation pass — flagged here for honesty, not silently patched.

## 3. Real data sources (existing endpoints only — no invention)

| Endpoint | Keyed by | Provides |
|---|---|---|
| `GET /profiles/{profile_id}` (auth required; clients blocked from viewing other clients) | **Profile.id** | Full `ProfileResponse` (below) |
| `GET /profiles/me` (`profilesService.getMyProfile()` already exists in `services/profiles.ts`) | JWT user | Same shape — solves the `id === 'me'` path |
| `GET /profiles/providers` (list) | — | Same `ProfileResponse` items, paginated |
| `GET /reviews/provider/{provider_id}` (`routers/reviews.py:35`, takes **user_id**) | **User.id** | Real reviews for the provider |

**`ProfileResponse` contains** (verified in `schemas/profile.py`): `position`,
`company_name`, `bio`, `years_experience`, `ports_served`, `skills`,
`contacts`, `licenses`, `team`, `offices`, `social_links`, `profile_metadata`,
`availability_status`, `id`, `user_id`, `verification_status`,
`badge_label` (system-controlled — the honest replacement for "Titanium
Verified"), `rating_avg`, `jobs_completed`, `services` (real `ServiceResponse`
list via the Profile→Services relationship), `created_at`, `updated_at`.

**Verdict: the page CAN be honestly wired with zero new endpoints.** The
backend profile model is rich enough for a genuine provider page.

## 4. Fabricated-value inventory (every static claim on the page)

| # | Fabricated element | Honest replacement available? |
|---|---|---|
| 1 | Hero: "North Sea Maritime Repairs" | ✅ `company_name` |
| 2 | "Titanium Verified" badge | ✅ `verification_status` + `badge_label` (system-controlled) |
| 3 | "Available for Dispatch" | ✅ `availability_status` |
| 4 | STATS: "15 Years" | ✅ `years_experience` |
| 5 | STATS: "99.2% Success Rate" | ❌ **remove** (H7 class; no success metric) |
| 6 | STATS: "450+ Jobs Fulfilled" | ✅ `jobs_completed` |
| 7 | STATS: "Avg. Quote Response 1.8 Hours" | ❌ remove (no response-time data) |
| 8 | STATS: "Avg. Completion 5 Days" | ❌ remove (no completion-time data) |
| 9 | TEAM_STATS: 150+/40/12/24-7 | ❌ remove (no aggregate team data; `team` list exists but not counts like "150+ engineers") |
| 10 | Company Overview marketing paragraph | ✅ `bio` (real text) |
| 11 | EXPERTISE cards (Heavy Welding/Electrical/Engine) | ✅ `skills` chips (honest list, no invented descriptions) |
| 12 | Services Provided chips ×7 | ✅ `services[]` real listing names |
| 13 | Ports Attended ×6 / Ports Covered ×13 "+10 More" | ✅ `ports_served` (real list, no invented "+10 More") |
| 14 | Service Coverage: 3 fake slots w/ leads 38/29/42, "✓ Verified Unit Slot" | ✅ `services[]` (real listings; drop fake leads/verified-slot claims) |
| 15 | Certifications: ISO/Lloyds/DNV GL | ⚠️ `licenses` exists — render only what the provider actually listed |
| 16 | REVIEWS: Maersk Line / Hapag-Lloyd + 4.9 stars | ✅ `GET /reviews/provider/{user_id}` + `rating_avg` |
| 17 | Supported Vessels ×6 | ❌ remove (no vessel-type data) |
| 18 | Sidebar: "Bergen, Norway" hub, multilingual, 24/7 | ⚠️ `offices` real list; the rest remove |
| 19 | Sidebar: "< 120 Minutes" response | ❌ remove |
| 20 | MAP/HERO/PROF stock images | ❌ remove (`aida-public` imagery) |
| 21 | Bottom bar: PDF/Save/Share dead buttons, "Message Provider" (no messaging system), "Capt. Erik Sorensen" contact | ⚠️ `contacts` real list; messaging button remove |
| 22 | "Request Quote"/"Request Service" → `/create-request` | ✅ real route — keep |

## 5. Dependencies & tests
- No backend/frontend tests reference the page or its values.
- Fabricated names appear nowhere else (repo grep).
- Its two consumers are listed in §1; both must keep working.

## 6. Proposed plan (NOT implemented — awaiting approval)

**Recommendation: HONEST WIRE (full rework), same pattern as Dashboard/Analytics.**

1. Fetch: `id === 'me'` → `getMyProfile()`; otherwise `getProviderById(id)`
   (existing `providersService` method, hits the profile-keyed endpoint).
2. Wire every ✅ item in §4; remove every ❌ item; render ⚠️ items only from
   real data (licenses/offices/contacts — hide sections when empty).
3. Reviews section: real fetch via `GET /reviews/provider/{profile.user_id}`,
   real `rating_avg`; honest empty state when no reviews.
4. Loading / error / not-found states (404 from the endpoint is a real
   possibility — render an honest "provider not found").
5. Keep: layout/design system, `/create-request` actions, Edit Profile for
   `me`, route + all 4 inbound links.
6. Bundle with the one-line Analytics link fix (§2) and regression tests:
   banned strings (North Sea Maritime Repairs, 99.2%, Titanium Verified,
   Maersk Tianjin, Capt. Erik Sorensen, < 120 Minutes, aida-public, +10 More…),
   service-wiring pins (getProviderById + getMyProfile + reviews endpoint),
   state pins, route retention, and a pin that the Analytics leaderboard links
   by profile id.
7. No new backend endpoint. No invented filters, params, or metrics.

## 7. Open product decisions
1. Approve honest-wire vs reduce-vs-remove (recommendation: honest wire — the
   data genuinely exists; removal would strand the sidebar's own-profile links).
2. Third-party profile viewing currently requires auth and blocks client→client
   (backend privacy guard) — keep as-is; no frontend change needed.
