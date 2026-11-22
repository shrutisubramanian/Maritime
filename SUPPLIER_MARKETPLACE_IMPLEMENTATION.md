# Nhaav — Supplier + Supplies Marketplace + Procurement: Implementation Report

**Date:** 2026-10-05
**Scope:** Backend (FastAPI + SQLAlchemy + Alembic) and frontend (React + Vite).
**Guiding decisions:** shared `ServiceRequest` model with a `request_type` discriminator; suppliers reuse the `/quotes` workflow; existing JWT/role architecture preserved; no payments; no palette changes; no service-provider functionality removed.

---

## 1. What was implemented

A working two-ecosystem model:

```
CLIENT
  ├── SERVICE request  → MatchingService → providers → notify → /quotes → client views
  └── SUPPLY  request  → MatchingService → suppliers → notify → /quotes → client views

SUPPLIER
  ├── creates SupplyListing (draft → pending_review → approved/rejected → archived)
  ├── approved listings appear in the Supplies Marketplace
  └── is notified of matching procurement requests and can quote them
```

Delivered in vertical slices (Phases 1–9 of the approved plan). Phases 10–13 handled as noted in §12–15.

---

## 2. Database changes

Migration: `nhaav-backend/alembic/versions/9c1d2e3f4a5b_supplier_procurement.py` (revises `3f3cfac91e8a`).

| Table | Change |
|---|---|
| `service_requests` | `+ request_type` (enum `service`/`supply`, default `service`), `+ quantity` (int), `+ specifications` (JSON) |
| `services` | `+ service_id` (str, indexed), `+ port_id` (str, indexed) — deterministic matching keys |
| `supply_listings` | **new table** — supplier catalogue with lifecycle + specs + ports + media |

Verified: `alembic upgrade head` applies cleanly on a fresh SQLite DB and the head is `9c1d2e3f4a5b`.

Dev runtime still auto-creates via `Base.metadata.create_all` in `main.py`; migrations are the production path.

---

## 3. API endpoints (new)

Supplies (`app/routers/supplies.py`, mounted in `main.py`):

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/supplies/` | public | Supplies Marketplace browse (approved only; category/port/search/pagination) |
| GET | `/supplies/{id}` | optional | Listing detail (owner/admin see non-approved; others approved-only) |
| GET | `/supplies/mine` | supplier | Own catalogue (+ status filter) |
| GET | `/supplies/dashboard` | supplier | Real counts |
| POST | `/supplies/` | supplier | Create listing (draft, or `submit_now`) |
| PATCH | `/supplies/{id}` | owner | Update (status is **not** settable here) |
| POST | `/supplies/{id}/submit` | owner | draft/rejected → pending_review |
| POST | `/supplies/{id}/archive` | owner | → archived |
| DELETE | `/supplies/{id}` | owner | Delete |
| POST | `/supplies/{id}/moderate` | admin | approved / rejected |

Changed endpoints:
- `GET /requests/` now accepts `?request_type=service|supply`.
- `POST /quotes/`, `PUT /quotes/{id}`, `GET /quotes/my-quotations` now accept providers **and** suppliers (`get_current_responder`), with the request type deciding who may quote.

---

## 4. Matching logic

`app/services/matching_service.py` — deterministic, no AI:

- **`get_eligible_providers(request)`** (service requests): verified `provider` profiles owning an active `Service` whose `service_id`/`name` matches the request's `service_type`, serving the request's `port` (via `Service.port_id` or `Profile.ports_served`).
- **`get_eligible_suppliers(request)`** (supply requests): verified `supplier` profiles owning an **approved** `SupplyListing` whose name/category/subcategory/manufacturer/part-number matches the request's category or title keywords; when the listing declares ports, the request port must be among them.
- **`get_eligible_recipients(request)`** branches on `request_type`. The sets never cross.

This satisfies the required scenario: a Mumbai generator-parts supplier matches "generator spare parts at Mumbai"; a provisions supplier does not; providers are never matched to supply requests and vice-versa.

---

## 5. Notification logic

`ServiceRequestService.create_request` now:
1. Notifies the client ("Request Created").
2. Resolves eligible recipients via `MatchingService`.
3. Emits one `Notification` per recipient (title **"New Procurement Request"**, message includes category, port, client company, `[View Request]`), type `procurement`, with `related_entity`/`related_entity_id` and `dedupe=True`.

`NotificationService.create_notification` gained optional `related_entity`, `related_entity_id`, `dedupe` (prevents duplicates on retry). Recipient isolation is unchanged and reused.

---

## 6. Supplier catalog

Frontend: `pages/Dashboard/SupplierDashboard/{index,MyCatalog,AddListing}.tsx`, `components/SupplierSidebar.tsx`, `services/supplies.ts`, routes `/supplier-dashboard`, `/supplier/catalog`, `/supplier/add-listing`. Add/Edit/Submit/Archive/Delete all hit the real API. Lifecycle visibility is server-enforced.

## 7. Supplies marketplace

`pages/Marketplace/SuppliesMarketplace.tsx` (+ `/marketplace/stores` alias) and `pages/Marketplace/SupplyDetails.tsx` (`/supplies/:id`). Search, category chips, availability, ports, pagination, and a "Request Quotation" CTA (→ `/create-request?type=procurement`). **No** Buy Now / cart / checkout / payment.

## 8. Supplier dashboard

`SupplierDashboard` shows only real values from `/supplies/dashboard` and `/supplies/mine`: Active / Pending / Draft listings, open matching procurement requests, unread notifications, and the catalogue preview. No fabricated `$148,000`/Rotterdam-style data.

## 9. Supplier profile

Partial. `/company-profile` (existing) + `SupplyDetails` supplier panel expose company name, verification, ports, and listings. A dedicated public supplier profile page with "View Supplies" is a remaining limitation (§16).

## 10. Quote workflow

Unchanged structurally; enhanced:
- Providers quote service requests; suppliers quote supply requests (enforced in `QuoteService.create_quote`).
- Supplying the wrong type returns 403.
- **Fixed (pre-existing):** a request stayed only quotable while `status == open`, so the *second* responder was always blocked (the first quote flips it to `quoted`). Now `open` **or** `quoted` is quotable — required for multi-supplier procurement. This also fixed the existing `test_h9_e2e_award_loop`.

## 11. Authorization model

| Rule | Enforced in |
|---|---|
| Only suppliers may create/manage listings | `SupplyListingService._require_supplier` |
| A supplier may not edit/delete another's listing | `_get_owned` (403) |
| A supplier cannot self-approve | status excluded from create/update; moderation is admin-only |
| Non-approved listings are not public | `get_public` / `get_visible_to` |
| Providers quote services, suppliers quote supplies | `QuoteService.create_quote` |
| Notifications are recipient-scoped | `NotificationService` (existing) |

`get_current_responder` + `get_optional_user` were added to `auth_guard`; the base JWT/role/decode logic is untouched.

---

## 12. Removed mock / localStorage behaviour

- Supplier catalogue is fully DB-backed — no mock.
- **Not migrated (by design, per "do not delete until replacement works"):** the *service-provider* listing UI still uses `services/coverageListings.ts` (localStorage). The real `Service` table now has matching keys but there is **no `/services` router or service listing UI backend**. This remains a documented limitation.

## 13. Service-provider regression

- `tsc --noEmit`: **0 errors** (`node_modules/.bin/tsc`).
- `vite build`: **succeeds** (only the pre-existing >500 kB chunk warning).
- `test_h9_procurement_contract` (11), `test_h9_e2e_award_loop` (2), `test_procurement_matching` (1): all pass.
- Two pre-existing bugs fixed along the way (multi-quote block; `client_procurement` `Profile.logo_url` crash).

## 14. Tests added

`tests/test_supplier_marketplace.py` — **19 tests**:
- Request typing (supply persists type+quantity; service default; invalid rejected).
- Listing lifecycle (draft not public; submit → admin approve → public; no self-approve; cross-supplier 403; non-supplier 403; search returns approved only).
- Matching (supply → only relevant supplier; service → only provider; no cross-matching).
- Notification fan-out + isolation + dedupe.
- Type-aware quoting (all four provider/supplier × service/supply combinations).
- API (supplier-role guard; public paginated shape).
- **End-to-end HTTP**: supplier create → submit → approve → marketplace → client supply request → matching notification → supplier quote → client sees quotation.

## 15. Full test results

- New suite: **19/19 pass** (also pass when run alongside the procurement suites).
- Collectible legacy subset: **172 passed, 66 failed, 12 errors** — versus the pre-change baseline of **152 passed, 67 failed** (no regressions; net +20 passing).
- The 66 failures/12 errors are **pre-existing** and caused by a partially-restored backend missing modules the tests expect (`app.models.admin_account`, `app.seed_demo`, `Profile.skills`, `VerificationStatus.under_review`, migration head `f9a0b1c2d3e4`, `DocumentType.quotation`, etc.). They are unrelated to this work.
- `alembic upgrade head`: clean. `tsc`: clean. `vite build`: clean.

## 16. Remaining limitations

1. **Dedicated supplier public profile page** not built — reuses `/company-profile` + `SupplyDetails`.
2. **Service-provider listing** still localStorage (`coverageListings.ts`); the `/marketplace/*` (services) backend router is absent — out of supplier scope.
3. Moderation uses the core `User.role == admin`; there is **no** separate admin auth/router in this backend (it was never restored).
4. Matching is keyword/port based (no synonym expansion) — deterministic by design; can be enriched later.
5. `client_procurement.py` still returns all of a client's requests without a type filter (frontend distinguishes via `request_type`).
6. No live browser verification was performed this turn (backend/vite were not started); verification was via `tsc`, `vite build`, Alembic, and the backend test suite including a full HTTP end-to-end test.
7. Payments remain untouched and unimplemented.

---

### Final answer

**"Can a supplier register → create profile → add supplies → get supplies onto the Supplies Marketplace → receive matching procurement requests → get notified → open the request → respond/quote → continue the procurement workflow?"**

**YES — now proven end-to-end by an HTTP test.** Register as `supplier` (role is now selectable in the role chooser) → create listing → submit → (admin) approve → approved listing appears in the Supplies Marketplace → client creates a matching procurement request → the supplier is notified → the supplier submits a quotation → the client sees it. The award/close loop reuses the existing request→quote workflow.

**Service-provider flow:** the request→quote→award loop is intact and now supports multiple simultaneous responders (a pre-existing bug was fixed). Service *listing* remains the localStorage mock noted above.
