# Marketplace Parity Report — Service-Provider Listing System

**Scope:** Replace the service-provider **localStorage** listing mock with a real
database/API-backed **Service listing** system that mirrors the supplier catalogue
architecture, back the **Service Marketplace** with real API data, complete the
**supplier public profile** with safe backend data, and prove the whole
service-provider flow with regression tests + HTTP end-to-end coverage.

**Out of scope (deliberately not started):** payment / payment-gated access.
Nothing in this change adds or implies payment.

---

## 1. What changed (summary)

| Area | Before | After |
| --- | --- | --- |
| Provider listings | `services/coverageListings.ts` — localStorage array seeded with fabricated companies (Titan Marine Services…), fake leads/views/ratings | Real `services` DB rows via `/services` API |
| Add Service | Wrote to localStorage; "listing slots" purchased in localStorage | `POST /services/` → draft/pending_review lifecycle |
| My Services | Read localStorage; toggled status client-side | `GET /services/mine`, submit / archive / delete via API |
| Provider dashboard | localStorage counts + fabricated KPIs/opportunities | Real counts (`/services/dashboard`), own services, open service requests, own notifications |
| Service Marketplace | Called `/marketplace/*` routes that **did not exist** (404) | `/marketplace/*` implemented over approved listings + verified providers |
| Service detail | `/marketplace/services/aggregate/*` 404 | Real aggregate detail + per-port availability |
| Supplier public profile | Reused generic company profile; no public supplier view | `GET /profiles/by-user/{user_id}/public` + `SupplierProfile` page |
| Marketplace rating | Fabricated `verified_provider_count * 4.6 + 0.2` | Real verified-provider count |

The supplier/procurement vertical slice was **not rebuilt**. The only supplier-side
touch was the new read-only public profile endpoint, which does not modify supplier
listing behaviour.

---

## 2. Backend

### 2.1 Service listing lifecycle (parity with supply listings)

- [service.py](nhaav-backend/app/models/service.py): added `ServiceListingStatus`
  (`draft | pending_review | approved | rejected | archived`) and a `status` column.
  The legacy `is_active` boolean is retained and **derived** (`is_active ==
  (status == approved)`), so the deterministic matcher — which filters on
  `Service.is_active` — keeps working unchanged.
- [schemas/service.py](nhaav-backend/app/schemas/service.py): matching keys
  (`service_id`, `port_id`), lifecycle `status`, and `ServiceCreate` (with
  `submit_now`), `ServiceUpdate` (no status/is_active → no self-approval),
  `ServiceModerate`, `ServicePaginatedResponse`.
- [service_listing_service.py](nhaav-backend/app/services/service_listing_service.py):
  mirrors `SupplyListingService` — provider-only guard, cross-provider 403,
  **duplicate `provider + service_id + port_id` → 409**, submit / archive /
  moderate, approved-only public search, owner/admin visibility, real dashboard counts.
- [services.py](nhaav-backend/app/routers/services.py): `/services` router
  (`/mine`, `/dashboard`, `POST /`, `GET /`, `GET /{id}`, `PATCH`, `/submit`,
  `/archive`, `DELETE`, `/{id}/moderate` admin-only).
- Mounted in [main.py](nhaav-backend/app/main.py).

### 2.2 Service Marketplace (real aggregate API)

[marketplace.py](nhaav-backend/app/routers/marketplace.py) implements the
endpoints the frontend already called but that never existed:

- `GET /marketplace/category-groups`
- `GET /marketplace/services` (category_group / port / search / pagination)
- `GET /marketplace/services/aggregate/{service_name}`
- `GET /marketplace/services/aggregate/{service_name}/availability?port=`
- `GET /marketplace/categories`

Everything is derived from **approved `Service` rows joined to verified provider
profiles** — no seeded or fabricated providers. This also fixes the admin
`MarketplaceServices` page, which calls `GET /marketplace/services`.

### 2.3 Supplier / provider public profile (no KYC, no PII)

- [schemas/profile.py](nhaav-backend/app/schemas/profile.py): `PublicProfileResponse`
  (and `PublicServiceItem`, `PublicListingSummary`).
- [profiles.py](nhaav-backend/app/routers/profiles.py): `GET /profiles/{profile_id}/public`
  and `GET /profiles/by-user/{user_id}/public` — public, unauthenticated.

Returned fields are restricted to: id, user_id, role, company_name, position, bio,
years_experience, ports_served, availability_status, verification_status,
badge_label, rating_avg, jobs_completed, **approved** services (providers), and
**approved** listing summaries (suppliers). `contacts`, `team`, `licenses`,
`offices`, `social_links`, `profile_metadata`, uploaded KYC documents and
verification audit details are **never** included.

### 2.4 Migration

[a1b2c3d4e5f6_service_listing_lifecycle.py](nhaav-backend/alembic/versions/a1b2c3d4e5f6_service_listing_lifecycle.py)
revises `9c1d2e3f4a5b`: adds `services.status` + index and backfills
`status = 'approved'` where `is_active = 1`. Upgrade and downgrade both verified.

---

## 3. Frontend

- **New** [servicesApi.ts](nhaav-frontend/src/services/servicesApi.ts) — the DB-backed
  Service listing client (list / detail / mine / dashboard / create / update /
  submit / archive / delete).
- **Deleted** `services/coverageListings.ts` (all localStorage + fabricated seeds removed).
- [AddService.tsx](nhaav-frontend/src/pages/Dashboard/ProviderDashboard/AddService.tsx)
  — real create/edit form (category + specific service + port + pricing + description
  + certifications), backend 409 surfaced to the user.
- [MyServices.tsx](nhaav-frontend/src/pages/Dashboard/ProviderDashboard/MyServices.tsx)
  — real listings with lifecycle actions and status filters.
- [ProviderDashboard/index.tsx](nhaav-frontend/src/pages/Dashboard/ProviderDashboard/index.tsx)
  — real counts, own services, open service requests, and notifications; fabricated
  revenue/KPIs/opportunities removed; paid "slot" purchase now routes to the shared
  "coming soon" placeholder (payment not implemented).
- [Marketplace.tsx](nhaav-frontend/src/pages/Marketplace/Marketplace.tsx) — fabricated
  rating replaced with the real verified-provider count.
- [SupplyDetails.tsx](nhaav-frontend/src/pages/Marketplace/SupplyDetails.tsx) — real
  supplier name / verification / rating + link to the supplier profile.
- [SupplierProfile.tsx](nhaav-frontend/src/pages/Marketplace/SupplierProfile.tsx) —
  new public page at `/supplier/:id`.
- [ProviderProfile.tsx](nhaav-frontend/src/pages/Marketplace/ProviderProfile.tsx) —
  non-owner views now use the safe public endpoint (approved services only).
- [constants/services.ts](nhaav-frontend/src/constants/services.ts) — shared service
  catalogue used by both the provider listing form and the client request form.

### Service request → matching → notification → quotation

[CreateProcurementRequest.tsx](nhaav-frontend/src/pages/Procurement/ProcurementRequests/CreateProcurementRequest.tsx)
now lets a client pick the **specific service** (not just a broad category) for service
requests, so `service_type` exactly matches a provider's `service_id` and the existing
deterministic matcher resolves recipients. Port values use `INDIAN_PORTS[].value`,
consistent with what the provider listing stores as `port_id`.

---

## 4. Tests

**New:** [test_service_provider_marketplace.py](nhaav-backend/tests/test_service_provider_marketplace.py)
— **14 tests, all passing**, covering:

- lifecycle: create→draft (not public), submit→pending, no self-approval, admin approve→public
- duplicate `service + port` → 409; same service / different port allowed
- cross-provider edit → 403; non-provider create → 403
- approved-only public search
- deterministic service matching (right provider in, wrong-port provider and all suppliers out)
- draft listings are not matchable
- notification fan-out to the matched provider only (suppliers isolated)
- API role guard (`/services/mine` → 403 for clients) and paginated shape
- public profile excludes PII and unapproved services
- **full HTTP end-to-end flow**: provider create → submit → admin approve →
  marketplace + aggregate + availability → client service request → provider
  notification → provider quote → client sees the quotation.

Supplier + service + procurement suites together: **34 passed.**
See §6 for the full-suite numbers and the pre-existing failures.

---

## 5. Verification runs

| Check | Command | Result |
| --- | --- | --- |
| New service suite | `pytest tests/test_service_provider_marketplace.py` | 14 passed |
| Supplier + service + procurement | `pytest tests/test_supplier_marketplace.py tests/test_service_provider_marketplace.py tests/test_procurement_matching.py` | 34 passed |
| TypeScript | `node_modules/.bin/tsc --noEmit` | 0 errors |
| Production build | `node_modules/.bin/vite build` | success (pre-existing >500 kB chunk warning only) |
| Migration up | `DATABASE_URL=…python -m alembic upgrade head` | clean to `a1b2c3d4e5f6` |
| Migration down | `…alembic downgrade base` | clean |

---

## 6. Full-suite baseline & known pre-existing failures

Full run (`pytest tests/ -q --continue-on-collection-errors`): **192 passed, 60 failed, 22 errors.**

The failures/errors are **pre-existing gaps in this partially-restored backend**,
not regressions from this work. They reference modules/features this checkout does
not contain: `app.services.email_service`, `app.models.admin_account`, `app.seed_demo`,
`app.seed_verification`, `Profile.skills`, `VerificationStatus.under_review`,
`DocumentType.quotation`, and a migration head `f9a0b1c2d3e4` that doesn't exist here
(so `test_migrations` expects tables `admin_accounts` / `admin_audit_log` /
`rate_limit_events` and service columns `subscription_id` / `expires_at`).
Compared with the pre-change state (172 passed / 66 failed / 12 collection-blocked
errors), this work **added 20 passing tests and fixed 6 previously-failing ones** — the
`/marketplace/*` endpoints and the service-listings contract that earlier tests expected.

`tests/test_service_listings.py` remains blocked at import by the missing
`app.services.email_service` module (it depends on the email-verification flow),
independent of the listing system.

---

## 7. Remaining limitations / follow-ups

1. **No admin moderation UI.** Service moderation is implemented server-side
   (`/{id}/moderate`, admin-only) and covered by tests, but there is no dedicated
   admin screen to approve/reject service listings yet. The admin
   `MarketplaceServices` page shows real aggregate data but no moderation actions.
2. **Approval is required for public visibility.** New listings are draft/pending
   until an admin approves them, matching the supplier lifecycle. Without admin
   approval, nothing appears in the marketplace.
3. **Decorative dashboard content.** Some non-listing dashboard widgets that were
   previously mock have been repointed to real data (services, requests,
   notifications); any remaining purely decorative analytics chrome should be
   revisited in the UI-polish pass.
4. **Matching is keyword/port-based**, not synonym-aware, unchanged from the supplier
   side.
5. **Payment not implemented** — the listing "slot/subscription" concept is retired;
   the purchase affordance routes to the shared "coming soon" placeholder.

---

## 8. Security notes

- Ownership enforced in the service layer (`provider_id` must equal the caller's user id).
- Lifecycle is server-controlled: `status`/`is_active` cannot be set through create/update.
- Public endpoints expose only approved listings and safe profile fields — no KYC/PII.
- Cross-ecosystem matching still cannot cross (service request ⇄ providers, supply request ⇄ suppliers).
- The public profile endpoints are additive and read-only; no existing authorization was relaxed.
