# Nhaav — Supplier + Marketplace + Procurement Flow Audit

**Mode:** READ-ONLY. No source file was modified during this audit.
**Date:** 2026-10-05
**Scope:** `nhaav-backend/` (FastAPI + SQLAlchemy) and `nhaav-frontend/` (React + Vite).
**Method:** Direct trace of models → schemas → services → routers → main.py, and frontend routes → pages → `src/services/*` → `apiClient` → `API_BASE_URL`. Every claim below cites the file and line evidence.

> **Headline:** The supplier ecosystem does **not exist yet in code**. There is a `supplier` role value, a supplier *search* endpoint, and a `procurement` notification enum — but no supply/listing model, no supplier dashboard/profile/listing pages, no Supplies Marketplace, no matching engine, and no procurement→supplier notification path. The service-provider "listing" system that the supplier side is supposed to mirror is itself a **localStorage mock**, not backend-driven.

---

## 0. Evidence snapshot (what actually exists)

| Layer | Supplier-related artifact | Status |
|---|---|---|
| `app/models/user.py` | `UserRole.supplier` | EXISTS (enum value only) |
| `app/models/service.py` | `Service` (provider service listings) | EXISTS — but not used by the frontend listing UI |
| `app/models/*` | any Supply / Product / Listing model | **MISSING** |
| `app/schemas/request.py` | `request_type` on `ServiceRequestCreate` | **MISSING** |
| `app/routers/profiles.py` | `GET /profiles/suppliers` | EXISTS |
| `app/routers/client_procurement.py` | `GET /client/requests` etc. | EXISTS (no type filter) |
| `app/services/request_service.py` | provider/supplier matching on create | **MISSING** (notifies the client only) |
| `app/services/matching_service.py` | `MatchingService` | **MISSING** (imported by a broken test) |
| `app/models/notification.py` | `NotificationType.procurement` | EXISTS (enum value, never emitted) |
| frontend `router/index.tsx` | supplier-only routes | **MISSING** (supplier reuses provider routes) |
| frontend `pages/**` | Supplier dashboard / Add Listing / Supplies Marketplace | **MISSING** |
| frontend `pages/Marketplace/Marketplace.tsx` | `STORES_CATEGORIES` ("stores" tab) | EXISTS — hardcoded, not backed by any API |
| `app/routers/*` | `/marketplace/*` router | **MISSING** |
| `app/routers/*` | `/admin/*` router | **MISSING** |

---

## 1. Architecture overview

The backend is a **single shared `ServiceRequest` model** (`app/models/request.py`) with no request-type discriminator. `main.py` mounts exactly ten routers; there is no marketplace router and no admin router.

```
main.py routers mounted:
  auth, jobs, profiles, quotes, requests, documents,
  reviews, service_categories, notifications, client_procurement
```

The frontend is much larger than the backend it talks to. Numerous pages call endpoints that do not exist on the backend (`/marketplace/*`, `/admin/*`). There is **one** request pipeline (`POST /requests/` → `ServiceRequest` → `Quote`), and both "service" and "procurement" creation UIs hit that single pipeline.

**No database relationship exists between a user and any supply/product/listing.** The `Service` model (`app/models/service.py`) is the only "listing" table, and — critically — the frontend does not read or write it (see §7, §11).

---

## 2. Current supplier flow (traced)

```
Register (frontend cannot select supplier)   ──►  POST /auth/register { role }
   Register.tsx:36  isClient = role !== 'provider'   (supplier unreachable from UI)
   Role chooser offers only client | provider        (chooserole.tsx:214,216)
        │
        ▼
Login ──► JWT ──► RoleProtectedRoute allows ['provider','supplier'] into provider routes
        │
        ▼
Supplier lands on ProviderDashboard / My Services / Add Service / Procurement Opportunities
   (there is no supplier dashboard page, no supplier sidebar, no "Add Listing" for supplies)
        │
        ▼
"Add Service" writes to localStorage (coverageListings.ts) — never to /services
        │
        ▼
"Procurement Opportunities" = GET /requests/?status=open  → returns ALL requests,
   including service requests; no supplier matching at all
        │
        ▼
"Submit Quotation" = POST /quotes/ (get_current_provider) → 403 for role=supplier
```

**VERDICT: the supplier flow is broken end-to-end.** A supplier cannot register via UI, has no listing system, is not matched, is not notified, and is *blocked by role guard* from the only quotation endpoint.

---

## 3. Current service-provider flow (traced)

```
GET /profiles/providers        → real (ProfileService.search_providers)
GET /marketplace/*             → 404 (no router)  ← Marketplace page is dead/mocked
Add Service / My Services      → localStorage only (coverageListings.ts)
GET /requests/?status=open     → real (public)
POST /quotes/                  → real (get_current_provider)
GET /quotes/my-quotations      → real
GET /quotes/request/{id}       → real (client-only)
PUT /quotes/{id}/accept|reject → real (client-only)
```

The **request → quote → award** loop for services is real. The **service listing (marketplace presence)** is fake (localStorage), and the service marketplace browser (`/marketplace`) has no backend.

---

## 4. Client request flow (traced)

`CreateProcurementRequest.tsx` collects a toggle `reqType ∈ {procurement, service}` and calls:

```ts
requestsService.createRequest({
  title, description, port,
  service_type: category,
  urgency, request_type: reqType === 'procurement' ? 'supply' : 'service',
  quantity,
});
```

`POST /requests/` (`app/routers/requests.py`) → `ServiceRequestService.create_request` builds `ServiceRequest(client_id=..., **request_data.model_dump())`. `request_data` is a `ServiceRequestCreate`, which **has no `request_type` and no `quantity` field** — Pydantic drops them. The request is created with `service_type=<category>` only.

`create_request` then emits **exactly one notification, to the client itself**:

```python
NotificationService.create_notification(
    db=db, user_id=user_id,
    title="Request Created",
    message=f"Your service request '{db_request.title}' is now live on the marketplace.",
    notification_type=NotificationType.request,
)
```

**No eligible provider or supplier is ever identified or notified.** The promise shown in the UI ("Only verified members matching your selected request type will be able to discover this request") is not implemented.

`client_procurement.py` (`GET /client/requests`) simply returns `ServiceRequestService.get_all_requests(client_id=current_client.id)` — all the client's requests, with **no distinction** between service and procurement.

---

## 5. Supplies Marketplace flow (traced)

`Marketplace.tsx` has a "stores" mode driven by a page-local constant:

```ts
const STORES_CATEGORIES = [
  { name: 'Deck Stores', ... }, { name: 'Engine Stores', ... }, ...
];
```

Clicking a store navigates to `/marketplace/service/:name?from=stores`, i.e. it reuses the **service** detail pipeline. The Supplies Marketplace is a hardcoded category grid with no supplier, product, price, or availability data behind it. **There is no Supplies Marketplace.**

---

## 6. Procurement request flow (traced)

Identical to the service request flow (§4) because it *is* the same endpoint and model. The only "procurement" artifacts are:

- `NotificationType.procurement` (enum value, never emitted anywhere — grep of `app/` shows no producer).
- `client_procurement.py` router (branding only; returns all requests).
- `schemas/request.py` docstrings that call the field "procurement request".

A procurement request is **indistinguishable** from a service request after persistence.

---

## 7. Notification flow (traced)

`NotificationService` supports create / list (`/notifications/me`) / mark-read / mark-all / archive / delete, all correctly scoped to `current_user.id` (no leakage — see §13). **But the producer side is only:**

| Producer | Recipient | Notes |
|---|---|---|
| `request_service.create_request` | the **client** | "Request Created" |
| `profile_service.verify_profile` | the profile owner | "Profile Verified" |
| `quote_service` (accept/reject) | provider | see `app/services/quote_service.py` |
| `job_service`, `review_service` | participants | job/review lifecycle |

There is **no producer that fans a request out to eligible providers or suppliers**. Both matching paths required by the spec are absent.

---

## 8. Matching logic (traced)

**There is no matching implementation.**

- `app/services/matching_service.py` does **not exist** (verified: `ls` fails).
- `tests/test_procurement_matching.py` imports `from app.services.matching_service import MatchingService` and calls `MatchingService.get_eligible_providers(db, created_request)`, and constructs `Service(provider_id=..., service_id="Hydraulic Repairs", port_id="Mumbai Port", ...)`. Neither `service_id`/`port_id` exist on `Service` (`app/models/service.py`) nor does `MatchingService`. **This test cannot even be collected today (ImportError).** It is a specification stub, not a passing test.
- `ServiceRequestCreate` is constructed in that test with `request_type="service"` — a field the schema does not define.

So matching must be **built**, deterministically, on existing fields (`Service.name/category`, `Profile.ports_served`, `Profile.skills`, verification status).

---

## 9. Supplier dashboard audit

**No supplier dashboard exists.** `RoleProtectedRoute` sends `role='supplier'` to `/provider-dashboard` (`ProviderDashboard/index.tsx`), which is the *provider* dashboard. It contains **fabricated data**:

- Hardcoded KPI: `{icon:'payments', label:'Monthly Revenue', val:'$148,000', sub:'+18% vs last month'}` (line ~44).
- Hardcoded incoming-requests table: "Propeller Polishing", "Fleet: Neptune Logistics", "Rotterdam", "$8,500 - $10,000".
- Hardcoded ratings/reviews: "Class Certificate ABS #88219", `★{r.rating}`.
- "Add Listing" button (line ~277) routes into the **service** Add-Service flow, not a supply listing.

The required dashboard cards (Company verification, Profile completion, Active/Pending/Draft listings, New procurement requests, Matching opportunities, Pending enquiries, Submitted quotations, Recent activity, Notifications) are **not present and not backed by any API**.

---

## 10. Supplier profile audit

No supplier profile page exists. `/provider/:id` → `Marketplace/ProviderProfile.tsx` is the provider profile. `profilesService.getMyProfile()` → `/profiles/me` returns `ProfileResponse`; a supplier would get their profile, but there is no supplier-aware rendering, no "View Supplies / Browse Catalog" section, and no listing join. The `Profile` model has `company_name`, `bio`, `skills`, `ports_served`, `logo_url`, `verification_status`, `badge_label`, `rating`, `completed_jobs` — a reasonable public base, but nothing supply-specific.

---

## 11. Catalog / listing audit

- **No `Supply`/`Product`/`Listing` model, schema, service, or router.**
- The only listing table is `Service`. **The frontend never reads/writes it.** Provider "listings" live in `services/coverageListings.ts` under `localStorage['nhaav_service_coverage_listings']`, seeded with **fabricated providers** ("Titan Marine Services", "Ocean Marine Solutions"), fake `leadsCount`/`viewsCount`/`rating`/`reviewsCount`, and unsplash stock images. `AddService.tsx` calls `addCoverageListing(...)` (localStorage) plus `profilesService.updateMyProfile(...)`.
- Listing lifecycle (Draft → Pending Review → Approved/Active → Rejected → Archived) **does not exist** in code. `coverageListings` has an informal `'Active' | 'Pending Verification' | 'Expired' | 'Draft'` union with no server enforcement.
- There is no admin moderation endpoint or router.

---

## 12. Authorization audit

| Check | Result | Evidence |
|---|---|---|
| Supplier can only manage own listings | N/A — no listings exist | — |
| Supplier cannot modify another supplier's listing | N/A | — |
| Supplier cannot see others' private docs | OK | `documents.py` scopes to `current_user` |
| Supplier cannot access another supplier's dashboard | N/A | no dashboard |
| Supplier cannot self-approve a listing | N/A | no moderation | 
| Service providers cannot access supplier-only ops | N/A | no supplier-only ops |
| **Suppliers can submit quotations** | **FAIL (403)** | `get_current_provider` requires `role == provider`; frontend routes allow suppliers in |
| Clients cannot access other clients' requests | OK | `client_procurement` checks `client_id`; `update/delete` check ownership |
| Notifications belong only to recipient | OK | every `NotificationService` read/write filters `user_id == current_user.id` |
| Request ID abuse | Mostly OK | `GET /requests/{id}` and `GET /requests/` are intentionally public; `PUT/DELETE` enforce ownership |

**Most important security-adjacent bug:** the supplier role is admitted by the frontend into provider-only routes (`RoleProtectedRoute.tsx:32`, `router/index.tsx:93`) while the backend quote endpoints hard-require `role == provider`. Suppliers therefore see quote UI they can never use.

---

## 13. API / database consistency

Frontend endpoints with **no backend implementation**:

| Frontend call | Backend | Impact |
|---|---|---|
| `GET /marketplace/categories` | missing | Marketplace page dead |
| `GET /marketplace/category-groups` | missing | Market service sidebar dead |
| `GET /marketplace/services` | missing | service grid dead |
| `GET /marketplace/services/aggregate/{name}` | missing | ServiceDetails dead |
| `POST /admin/auth/login`, `GET /admin/auth/me` | missing | admin login dead |
| `GET /admin/verification/*`, `POST .../action` | missing | admin verification dead |

Existing-but-underused: `Service` model and `/services` router (referenced by an index but **the file `app/routers/services.py` does not exist**; `main.py` does not mount it). `client_procurement.py` duplicates request-list logic already available via `GET /requests/?client_id=`.

No duplicate *backend* endpoints were found for the same resource except the client-requests overlap noted above.

---

## 14. Missing functionality

- `UserRole.supplier` is not reachable from the register/role UI.
- No supply/listing model, schema, service, router.
- No supplier dashboard, sidebar, profile, or "Add Listing".
- No Supplies Marketplace / listing grid / product detail.
- No `request_type` discriminator on `ServiceRequest` or its schemas.
- No `MatchingService` (file absent; test references it).
- No procurement→supplier (or request→provider) notification fan-out.
- No listing lifecycle / moderation.
- No `/marketplace/*` router; no `/admin/*` router.

---

## 15. Broken functionality

- `tests/test_procurement_matching.py` fails at import (`matching_service` missing) and against a `Service` schema that lacks `service_id`/`port_id`.
- Supplier cannot submit a quotation (`403`) despite UI access.
- `request_type` / `quantity` are silently dropped on request creation.
- Marketplace and Admin pages call nonexistent endpoints.
- Provider listing UI is localStorage-only (fake, unsynced, per-browser).

---

## 16. Dead / unused functionality

- `Service` model + `schemas/service.py` + `services/…` (no router mounted, no frontend use).
- `NotificationType.procurement`, `NotificationType.support` — enum values with no producer.
- `app/services/test_ocr.py` (test code inside the services package).
- `RequestStatus.quoted/assigned/awarded/completed` — partially exercised.

---

## 17. Mock data found

| File | Mock | Severity |
|---|---|---|
| `src/services/coverageListings.ts` | 3 fabricated listings: fake providers, fake leads/views/ratings, unsplash images, seeded as default | **High** |
| `pages/Dashboard/ProviderDashboard/index.tsx` | KPI `$148,000`, fabricated request table, fabricated reviews, `ABS #88219` | **High** |
| `pages/Marketplace/Marketplace.tsx` | `STORES_CATEGORIES` hardcoded, presented as Supplies Marketplace | **High** |
| `pages/Procurement/…/ProcurementOpportunities.tsx` | (clean — real `getUserRequests`/`getMyQuotations`; H9 contract test enforces this) | OK |
| `pages/Dashboard/ShipOwnerDashboard/*` | (clean per its header comment; real quotes only) | OK |

---

## 18. Security findings

| # | Severity | Finding |
|---|---|---|
| S1 | **High** | Role/authorization mismatch: supplier admitted to provider routes but blocked (`403`) by `get_current_provider`. Functional DoS + misleading UI. |
| S2 | **Medium** | `request_type` accepted by frontend and shown to users but never validated/persisted server-side → a "supply" request is silently a service request; eligibility claims in the UI are false. |
| S3 | **Medium** | Public `GET /requests/` returns every request including procurement requests to unauthenticated callers; procurement requests may contain supply specs intended for suppliers only. |
| S4 | **Medium** | Listing storage is client-side (`localStorage`); a supplier can mark a listing "Active" and fabricate ratings/leads with no server check. |
| S5 | **Low** | `auth_guard.get_current_user` prints `PAYLOAD`, `USER ID`, `DB USER` and `AUTH ERROR` to stdout (log leakage of token payload/user id). |
| S6 | Info | `NotificationService.create_notification` does not `commit`; correctness relies on callers committing. Fine today, fragile. |

---

## 19. Recommended implementation order

1. **Data model**: add `request_type` enum (`service`/`supply`) + procurement fields to `ServiceRequest` and schemas; migrate. Extend `ServiceRequestCreate` to accept/validate `request_type`, `quantity`, `specifications`.
2. **Listing model**: add `SupplyListing` (supplier_id, product name, category, subcategory, specs JSON, availability, ports, MOQ, lead time, media, status enum Draft/Pending/Approved/Rejected/Archived) + schemas + router (`/supplies`), mirroring the intended `Service` listing contract. Wire the existing frontend listing UI to real APIs (retire `coverageListings.ts`).
3. **Matching service**: implement `MatchingService.get_eligible_providers` / `get_eligible_suppliers` deterministically on category/service name + port + active/verified status (exactly the contract already written in `tests/test_procurement_matching.py`).
4. **Notification fan-out**: on request creation, branch on `request_type`, resolve eligible users, emit one `Notification` per recipient (dedupe by `(user_id, related_entity_id)`), keep the client notification.
5. **Supplier UI**: role option in chooser/register; supplier dashboard (real APIs only); supplier profile with "View Supplies"; supplier sidebar.
6. **Supplies Marketplace**: real `/marketplace/supplies` endpoints + grid/detail pages; approved-only visibility.
7. **Moderation**: admin listing review endpoints (do not resurrect a stubbed admin router without a plan).
8. **Authorization**: extend quote endpoints to allow `supplier` for supply requests **or** introduce parallel supplier response endpoints; keep JWT/role architecture otherwise.
9. **Remove mock data**: delete fabricated KPIs/reviews in `ProviderDashboard`, back every card with a real API or hide it.
10. **Tests**: un-break `test_procurement_matching.py`, add listing lifecycle + authorization + notification-isolation tests.

---

## Classification of findings

### A. Already working
- Auth/JWT/roles architecture; registration accepts `role` (incl. `supplier`).
- `GET /profiles/providers`, `GET /profiles/suppliers`, `GET /profiles/{id}`, `PUT /profiles/me`.
- Request CRUD + ownership enforcement; quote submit/update/accept/reject + ownership.
- Notification read/mark/archive/delete with recipient isolation.
- Documents + reviews routers.

### B. Partially working
- `client_procurement.py` (works but no request-type separation).
- `Service` model (exists, unmounted, unused).
- Public request browsing (`/requests/`) exists but cannot filter by request type.

### C. Missing
- Supply/Listing model, schema, service, router.
- Supplier dashboard, sidebar, profile, "Add Listing", catalog.
- Supplies Marketplace (real).
- `request_type` discriminator + procurement fields.
- `MatchingService`.
- Request→provider and request→supplier notification fan-out.
- Listing lifecycle/moderation endpoints.
- `/marketplace/*` and `/admin/*` routers.

### D. Broken
- Supplier login → provider dashboard → 403 on every quote action.
- `test_procurement_matching.py` (ImportError).
- `request_type`/`quantity` dropped on create.
- Marketplace & Admin pages (404s).
- Provider listing UI persistence (localStorage).

### E. Security issues
- S1 (High) role guard vs UI mismatch — supplier locked out of quotations.
- S2, S3, S4 (Medium), S5 (Low), S6 (Info).

### F. Product decision required
1. Do procurement requests share `ServiceRequest` (add `request_type`) or get a separate table? (Recommend: shared + discriminator, matching the stated preference.)
2. Should `supplier` submit quotes through the existing `/quotes` endpoints (relax `get_current_provider`) or get dedicated `/supplier/quotes` endpoints?
3. Is admin moderation in scope for listings now, or is auto-approved-on-submit acceptable initially?
4. Can the service-provider listing UI be migrated off `coverageListings.ts` to a real `Service` API as part of this work, or is that a separate task?

---

## Final questions — answered from code

**"Can a supplier register → create profile → add supplies → get supplies onto the Supplies Marketplace → receive matching procurement requests → get notified → open the request → respond/quote → continue the procurement workflow?"**

**NO.** Registration UI cannot select `supplier`; there is no supply listing, no Supplies Marketplace, no matching, no supplier notification; and `POST /quotes/` returns 403 for `role=supplier`. Only the profile endpoint (`/profiles/me`) works for a supplier.

**"Can a service provider register → list services → appear in the Service Marketplace → receive matching service requests → get notified → respond/quote?"**

**PARTIALLY, and the listing/matching half is NO.** Registration + profile + request-browsing + quotation + award loop are real. But "list services → appear in the Service Marketplace" is a localStorage mock, `/marketplace/*` has no backend, and providers are **not notified** of matching requests (creation notifies the client only; no matching exists).

---

## Approved decisions (recorded 2026-10-05)

These resolve the section F product decisions and pin the implementation approach:

1. **Request model:** use the shared `ServiceRequest` model with a `request_type` discriminator (`service` | `supply`) plus procurement fields — do **not** create a separate table.
2. **Supplier quoting:** reuse the existing `/quotes` endpoints and relax `get_current_provider` to admit `supplier` for supply requests — do **not** add parallel supplier response endpoints.
3. **Implementation:** hold until the user reviews this report; no code changes yet.

---

## What I did NOT do
No files were modified. No backend, migrations, or tests were executed to mutate state. No palette, auth/JWT, payment, or service-provider code was touched. This document is the deliverable; implementation awaits your review.
