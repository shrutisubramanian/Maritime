# Marketplace Completion + Security Verification Report

**Phase:** Marketplace completion and security verification (pre-payment), plus the
final owner-notification polish — **marketplace architecture now FROZEN** (see §13).
**Payment:** **not started.** No UPI, bank transfer, UTR verification, or payment gating was added or modified.

This report follows [MARKETPLACE_PARITY_REPORT.md](MARKETPLACE_PARITY_REPORT.md) and covers:
admin moderation, a focused security audit of the new marketplace surfaces, full-suite
failure classification, mock-data verification, and migration status.

---

## 1. Service marketplace flow

Provider → DB-backed listing → moderation → Service Marketplace → request → match →
notification → quote, all on real APIs:

1. Provider creates a **Service listing** (`POST /services/`) — `draft`, or `pending_review` with `submit_now`.
2. Listing is **not public** and **not matchable** until approved.
3. Admin approves it (see §6).
4. It appears in `GET /services/` and `GET /marketplace/services`, with real aggregate
   detail (`/marketplace/services/aggregate/{name}`) and per-port availability.
5. Client creates a service request → deterministic matching resolves verified providers
   → notification → providers quote → client views quotations.

Frontend: [AddService](nhaav-frontend/src/pages/Dashboard/ProviderDashboard/AddService.tsx),
[MyServices](nhaav-frontend/src/pages/Dashboard/ProviderDashboard/MyServices.tsx),
[ProviderDashboard](nhaav-frontend/src/pages/Dashboard/ProviderDashboard/index.tsx),
[Marketplace](nhaav-frontend/src/pages/Marketplace/Marketplace.tsx),
[ServiceDetails](nhaav-frontend/src/pages/Marketplace/ServiceDetails.tsx).

## 2. Supplies marketplace flow

Supplier → **Supply listing** (`/supplies`) → moderation → Supplies Marketplace →
procurement request → supplier matching → notification → supplier quote → client view.
Unchanged from the supplier phase, except that the same admin moderation surface now
handles supply listings too, and rejection reasons are stored.

## 3. Matching flow

Deterministic, unchanged and now under regression test:
- Service request → `Profile` with role `provider`, `verification_status = verified`, and an
  **active** (approved) `Service` matching `service_type` at the requested port.
- Supply request → `Profile` with role `supplier`, verified, owning an **approved**
  `SupplyListing` matching category/title keywords at the requested port.
- The two sets never cross (proved in [test_marketplace_security.py](nhaav-backend/tests/test_marketplace_security.py) `TestCrossEcosystemIsolation`).

## 4. Notification flow

- Request creation notifies the client and fans out to matched recipients with
  `related_entity`/`dedupe` → **no duplicates** on repeated fan-out (proved).
- Recipient isolation preserved: suppliers never receive service-request notifications and
  vice versa.
- **Listing moderation notifications (final polish):** every admin approve/reject now
  creates an in-app notification for the listing owner — "Your service/supply listing has
  been approved" or "…was rejected" with `Reason: <text>` in the message. The notification
  carries `related_entity = service_listing | supply_listing` + `related_entity_id`, and the
  frontend Notifications page renders a **View listing** link to the owner's manager (or the
  public detail page for approved supplies). Deliberately `dedupe=False`: each moderation
  event is a distinct user-facing event (a resubmitted listing rejected again must deliver
  the new reason); duplicate fan-out from retries is impossible because the lifecycle guard
  409s any second moderation of a non-pending listing.

## 5. Quote flow

- Providers quote **service** requests; suppliers quote **supply** requests — type-aware
  authorization in the service layer (403 otherwise), proved in tests.
- Client-only visibility of their own request's quotations (cross-client access → 403).
- Quotable while `open` OR `quoted` (so competing providers can quote), unchanged.

## 6. Admin moderation flow (new)

- **Backend**
  - [admin_moderation.py](nhaav-backend/app/routers/admin_moderation.py): `GET /admin/moderation/queue?kind=service|supply[&status=]`
    and `POST /admin/moderation/{kind}/{listing_id}` `{status, reason}`.
  - [moderation_service.py](nhaav-backend/app/services/moderation_service.py): admin-only,
    one surface for both ecosystems, **lifecycle guard** (only `pending_review` can be
    moderated → 409 otherwise), stores `rejection_reason`, writes an
    append-only [ModerationAuditLog](nhaav-backend/app/models/moderation_audit.py) row
    (entity, entity_id, admin_id, action, reason), **and notifies the listing owner in-app**
    (`NotificationType.moderation`), all in the same commit.
  - Legacy `POST /services/{id}/moderate` and `POST /supplies/{id}/moderate` now **delegate
    to `ModerationService.act()`**, so the audit log + owner notification are written
    regardless of which endpoint an admin uses.
  - [admin_auth.py](nhaav-backend/app/routers/admin_auth.py): `POST /admin/auth/login` and
    `GET /admin/auth/me`, fulfilling the admin contract the frontend already expected.
    It authenticates an existing `User` with role `admin` via the existing `AuthService`
    (no second credential store, no change to user auth). Non-admins get the same 401 as a
    bad password, so admin accounts are not enumerable.
- **Frontend**
  - [adminModeration.ts](nhaav-frontend/src/services/adminModeration.ts) uses the separate
    admin session (`adminClient` + admin token).
  - [ListingModeration.tsx](nhaav-frontend/src/pages/Admin/ListingModeration.tsx): tabs for
    Service/Supply, pending queue with owner info, approve, reject-with-reason, loading/error/
    success states, refresh. Real API only — no mock data.
  - Route `/admin/moderation` in [router/index.tsx](nhaav-frontend/src/router/index.tsx)
    and a sidebar entry in [AdminSidebar.tsx](nhaav-frontend/src/components/AdminSidebar.tsx).

## 7. Public profile flow

- `GET /profiles/{profile_id}/public` and `GET /profiles/by-user/{user_id}/public` return only
  safe fields: company name, bio, position, experience, ports served, availability,
  verification status/badge, rating, jobs completed, **approved** services (providers) and
  **approved** listing summaries (suppliers).
- Never returned: `contacts`, `team`, `licenses`, `offices`, `social_links`,
  `profile_metadata`, uploaded KYC documents, verification audit data (asserted in tests).
- Archiving a listing removes it from the public profile immediately (asserted).
- Frontend: [SupplierProfile.tsx](nhaav-frontend/src/pages/Marketplace/SupplierProfile.tsx)
  (`/supplier/:id`), [ProviderProfile.tsx](nhaav-frontend/src/pages/Marketplace/ProviderProfile.tsx),
  [SupplyDetails.tsx](nhaav-frontend/src/pages/Marketplace/SupplyDetails.tsx).

## 8. Security findings

26 focused security tests were written and **all pass** ([test_marketplace_security.py](nhaav-backend/tests/test_marketplace_security.py)):

| Area | Result |
| --- | --- |
| IDOR — cross-provider edit/archive/delete of service listings | 403 ✅ |
| IDOR — cross-supplier edit/delete of supply listings | 403 ✅ |
| IDOR — unapproved service detail for non-owner/anonymous | 404 ✅ |
| IDOR — cross-client quotation access | 403 ✅ |
| Role escalation — supplier creates service listing | 403 ✅ |
| Role escalation — provider creates supply listing | 403 ✅ |
| Role escalation — non-admin reaches moderation queue | 403 ✅ |
| Role escalation — provider self-approves via `/moderate` | 403 ✅ |
| Lifecycle bypass — forced `status`/`is_active` on create | ignored → draft ✅ |
| Lifecycle bypass — forced status on update | ignored ✅ |
| Lifecycle bypass — draft/pending/rejected/archived in public search | absent ✅ |
| Lifecycle guard — moderating a non-pending listing | 409 ✅ |
| Cross-ecosystem — matching never crosses | ✅ |
| Cross-ecosystem — wrong role quoting | 403 ✅ |
| Notification abuse — repeated fan-out | deduped to 1 ✅ |
| Public exposure — PII/KYC never returned | ✅ |
| Public exposure — archived listing drops out | ✅ |
| Input validation — bad kind / status / non-UUID id / bad action status | 400/422 ✅ |
| Input validation — marketplace `limit` bounded | 422 ✅ |
| Moderation — admin login works; non-admin → 401 | ✅ |
| Moderation — approve/reject write an audit row (admin_id, action, reason) | ✅ |

**No unresolved security issues were found on the new surfaces.** No fixes were required to
existing authorization (the only auth addition is the missing admin login contract, which
does not relax anything). Residual product gaps are listed in §12.

## 9. Tests

- **New:** `test_marketplace_security.py` — **32 passed** (26 security + 6 owner-notification:
  service approve/reject, supply approve/reject, owner-only fan-out, resubmit→re-reject
  notifies again with the new reason, legacy endpoint parity).
- **Marketplace suites combined** (`test_supplier_marketplace`, `test_service_provider_marketplace`,
  `test_procurement_matching`, `test_marketplace_security`) — **66 passed**.
- **Frontend** — `tsc --noEmit` → 0 errors; `vite build` → success (pre-existing >500 kB chunk warning only).

## 10. Full-suite failure classification

Command: `pytest tests/ -q --continue-on-collection-errors` → **218 passed, 60 failed, 22 errors (82 problems)**.

Every one of the 82 was classified. **All are category A (pre-existing and unrelated
to this work). Zero category B (caused by this implementation). Zero category C
(possibly affected, needs investigation).**

| Count | Bucket (all category A) |
| --- | --- |
| 11 | H7 OCR/confidence module gaps |
| 10 | missing `app.seed_demo` / `app.seed_verification` |
| 10 | collection errors: missing `app.models.admin_account` / admin modules |
| 8 | missing `Profile.skills` |
| 8 | expects future H9 orphan migration/module |
| 8 | expects future migration revisions/columns (`f9a0b1c2d3e4`, `subscription_id`, `expires_at`, …) |
| 7 | H5 notification tests (fail in isolation too; do not touch `Service`/marketplace code) |
| 7 | H8 registration name-field contract gap |
| 4 | missing admin verification/`admin_account` |
| 3 | pre-existing concurrency/409 behaviour (in `quote_service.accept_quote`) |
| 2 | missing `DocumentType.quotation` |
| 1 | missing `app.services.email_service` (`test_auth_flow`) |
| 1 | missing `/admin/verification/stats` route |
| 1 | H9 upload/OCR contract gap |
| 1 | `test_service_listings.py` blocked at import by missing `email_service` (listing-adjacent; its uniqueness semantics are fully covered by the new suites) |

**Proof this work is not the cause:** (a) no failing test name references the new
marketplace files/modules; (b) the root causes are missing symbols/modules/revisions that
predate this work (`admin_account`, `email_service`, `seed_demo`, `Profile.skills`,
`VerificationStatus.under_review`, `DocumentType.quotation`, `f9a0b1c2d3e4`); (c) for the
H5 notification and concurrency failures, the code they exercise (`QuoteService`,
`JobService`, `ReviewService`) does not touch the `Service`/marketplace code changed here,
and they fail identically in isolation. Additionally, this work **fixed** previously-failing
contract tests (`test_h9_provider_profile_contract`, `test_h9_servicedetails_contract`,
`test_h9_dashboard_contract`, `test_h9_procurement_contract` now pass with the new endpoints).

## 11. Migration status

- **Single head:** `c3d4e5f6a7b8` (`alembic heads` → one line, no multiple heads).
- Chain: `3241ce641a7d → 38ddbd5d268f → 3f3cfac91e8a → 9c1d2e3f4a5b → a1b2c3d4e5f6 → b2c3d4e5f6a7 → c3d4e5f6a7b8`.
- Verified on a clean SQLite DB: `upgrade head` ✅, `downgrade base` ✅, `downgrade -1` then
  `upgrade head` ✅ (repeatable), no broken dependency.
- New revisions in this phase: [a1b2c3d4e5f6](nhaav-backend/alembic/versions/a1b2c3d4e5f6_service_listing_lifecycle.py)
  (`services.status` + index + backfill), [b2c3d4e5f6a7](nhaav-backend/alembic/versions/b2c3d4e5f6a7_moderation_audit.py)
  (`services.rejection_reason`, `supply_listings.rejection_reason`, `moderation_audit_logs`), and
  [c3d4e5f6a7b8](nhaav-backend/alembic/versions/c3d4e5f6a7b8_notification_type_moderation.py)
  (notifications.type enum gains `moderation`; batch alter keeps SQLite data intact, downgrade
  refuses while moderation rows exist).

## 12. Mock-data verification (Phase 4)

- **No** marketplace-related `localStorage` remains. The only `localStorage` usage in the
  app is legitimate, unrelated browser persistence: auth tokens (`nhaav_token`,
  `nhaav_admin_token`, `nhaav_admin_user`, `nhaav_refresh`), theme
  (`nhaav_theme`), and sidebar state (`nhaav_sidebar_open`).
- **No** mock/fabricated KPIs remain in the provider dashboard or supplier dashboard — both
  read real APIs (`/services/dashboard`, `/supplies/dashboard`, `/requests/`, `/notifications/me`).
- Out-of-scope residual mock content (not provider/supplier/marketplace listings): the
  ship-owner and financials dashboards still show a hard-coded "Monthly Revenue $72,440.00"
  card ([ShipDashboard.tsx](nhaav-frontend/src/pages/Dashboard/ShipDashboard/ShipDashboard.tsx),
  [Financials.tsx](nhaav-frontend/src/pages/Financials/Financials.tsx)). Flagged for the UI-polish pass.

## 13. Verdict + final marketplace sign-off

The Nhaav marketplace is **functionally complete and security-verified** for the
service + supply two-sided flow: DB-backed listings, provider/supplier ownership,
lifecycle + admin moderation with audit **and owner notification**, marketplace discovery,
matching, notifications, type-aware quoting, and safe public profiles. **Payment remains
unimplemented and untouched.**

**SIGN-OFF — marketplace architecture FROZEN (2026-10-05).**

| Check | Result |
| --- | --- |
| Marketplace regression (4 suites, incl. 6 owner-notification tests) | **66 passed** ✅ |
| Marketplace security suite | **32/32 passed** ✅ |
| Frontend `tsc --noEmit` / `vite build` | **0 errors / success** ✅ |
| Alembic single head + up/down/re-up | **clean** ✅ |
| Marketplace localStorage mocks | **none** ✅ |

Frozen surface: `Service`/`SupplyListing` lifecycle (draft → pending_review →
approved/rejected → archived, `is_active` derived), unified `ModerationService.act()` with
audit + owner notifications, `/admin/moderation/*`, `/admin/auth/*`, public listing/profile
endpoints (approved-only, no PII), matching, type-aware quoting. Future work must extend —
not reshape — these contracts. Next phase: **payment** (per the agreed spec; no UPI, no
gateway, no online card processing).

## 14. Remaining limitations

1. The ship-owner / financials dashboards still contain decorative mock figures (§12).
2. Moderation queue is not paginated (fine at current volumes); could be added later.
3. Matching remains keyword/port based (no synonym expansion).
4. Rejection notices are in-app only (no email) — by design for now; the in-app channel
   delivers the reason, links to the listing, and is fully covered by tests.
5. The admin area depends on the newly added `/admin/auth/*` endpoints; real deployments
   must seed/promote an `admin`-role user.
6. Payment-gated procurement/service access is intentionally not implemented.
