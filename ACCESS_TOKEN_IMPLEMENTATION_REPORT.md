# Access-Token Entitlement System — Implementation Report

> **Update (account-ownership phase):** the ownership model has CHANGED since
> this report was written (migration `d0e1f2a3b4c5`). Passes are now owned by
> the **individual account** (`owner_user_id`), not by the organization —
> there is no shared company pool. Each unused pass carries its own 40-day
> window (`unused_expires_at = issued_at + 40 days`); one ACTIVE session per
> account; different accounts run sessions simultaneously; no inactivity
> timeout. Organization links are optional metadata only. Current rules:
> [ACCESS_OWNERSHIP_MODEL.md](ACCESS_OWNERSHIP_MODEL.md). The company-pool
> description below is retained for phase history.
>
> **Update (later phases):** the subscription/plan layer is documented in
> [SUBSCRIPTION_IMPLEMENTATION_REPORT.md](SUBSCRIPTION_IMPLEMENTATION_REPORT.md) and the
> offline bank-transfer payment layer in [PAYMENT_IMPLEMENTATION_REPORT.md](PAYMENT_IMPLEMENTATION_REPORT.md).
> The `PAYMENT IMPLEMENTATION: NOT STARTED` statement below was accurate at the time and
> still holds for **online payment processing (gateway / UPI / cards)**.

**Scope:** Company-level access-token foundation ONLY.
**Status:** Backend complete + verified; minimal frontend widget complete.

**PAYMENT IMPLEMENTATION: NOT STARTED**

No UPI integration, payment gateway, bank-transfer submission, UTR/receipt
verification, or payment admin UI exists in this work, and none is planned by
this report. The only provisioning paths are the dev/test-only ones described
below. The real payment → verified → access-pack flow belongs to the future
payment phase.

---

## 1. What was built

A company-level **entitlement gate** that sits *on top of* — never replaces —
the existing stateless-JWT authentication:

```
employee email + password
        ↓
JWT identity (unchanged architecture)
        ↓
organization (stable FK membership)
        ↓
one AVAILABLE access token → ACTIVE 6-hour session
        ↓
protected Nhaav functionality
```

- **One token = one login session.** 6 hours measured *from login time*.
  (Historical note: expiry was per-token from issue; today the 6-hour clock
  starts at allocation and there is NO inactivity timeout.)
- **Logout consumes the token forever** (never reused). Expiry consumes it too.
- *(SUPERSEDED — account ownership)* **Tokens belong to the individual
  ACCOUNT** (`owner_user_id`), not to an organization; accounts never share
  passes. The organization-pool statement below described the original phase.
- **Allocation is atomic (CAS)**: `UPDATE access_tokens SET status='ACTIVE'
  WHERE id=? AND status='AVAILABLE'` guarded by `rowcount == 1` + retry.
  No in-memory lock. Two concurrent logins can never bind the same row.
- **Expiry is lazy, not worker-based**: every protected request, login, logout,
  and status call runs `_consume_expired()` (`ACTIVE AND expires_at <= now →
  CONSUMED`). An expired session fails protected requests immediately.

### Components

| Piece | Where |
|---|---|
| Models: `Organization`, `AccessPack`, `AccessToken`, `AccessTokenStatus` | [app/models/access_token.py](nhaav-backend/app/models/access_token.py) |
| Lifecycle service (allocate / consume / enforce / status) | [app/services/access_token_service.py](nhaav-backend/app/services/access_token_service.py) |
| Login integration (allocate after credential check) | [app/services/auth_service.py](nhaav-backend/app/services/auth_service.py) |
| `POST /auth/logout` (idempotent, identity-only dep) | [app/routers/auth.py](nhaav-backend/app/routers/auth.py) |
| `GET /access/status` + dev-only provisioning | [app/routers/access.py](nhaav-backend/app/routers/access.py) |
| Gate in `get_current_user`; JWT-only `get_current_user_identity` | [app/middleware/auth_guard.py](nhaav-backend/app/middleware/auth_guard.py) |
| Membership FK on profiles | [app/models/profile.py](nhaav-backend/app/models/profile.py) |
| Frontend: `access.ts` service, logout API call, dashboard card | [nhaav-frontend/src/services/access.ts](nhaav-frontend/src/services/access.ts), [auth.ts](nhaav-frontend/src/services/auth.ts), [AuthContext.tsx](nhaav-frontend/src/context/AuthContext.tsx), [ShipDashboard.tsx](nhaav-frontend/src/pages/Dashboard/ShipDashboard/ShipDashboard.tsx) |

---

## 2. Organization-identity decision (per directive)

**The problem this fixes:** pool membership was resolved by matching
`Profile.company_name` to `Organization.name` — a display string. Two
employees with `company_name = "ABC Marine"` and `"ABC Marine Pvt. Ltd."`
would have landed in two different pools, and editing `company_name` could
have silently moved a user into a foreign pool.

**The decision:** membership is now a **stable foreign key**.

1. **Stable PK** — `organizations.id` (UUID) is the sole identity. `name` is
   unique only to avoid two orgs sharing a label; it is display data. Renaming
   an organization changes nothing about tokens, packs, or membership.
2. **Membership linkage** — new column `profiles.organization_id` (UUID, NULL,
   FK → `organizations.id`, `ON DELETE SET NULL`, indexed). A user belongs to
   the organization their profile points at. Same company ⇒ same FK ⇒ one pool.
3. **Packs/tokens reference `organization_id`** — they were already FK-linked;
   tests now assert the linkage explicitly.
4. **No fuzzy/string merge** — there is deliberately no "same name ⇒ same org"
   backfill anywhere. `company_name` is never compared to any org field.
5. **company_name edits cannot move pools** — `_resolve_organization` reads
   only `profile.organization_id`; the display string is irrelevant to the
   gate (tested).
6. **Explicit assignment only** — `assign_profile_to_organization(db, profile,
   organization)` is the single membership entry point (dev provisioning /
   future admin-payment onboarding).

### Migration / backfill strategy (documented, deliberately NOT guessed)

Adding the column is safe and complete as a migration: existing rows keep
`organization_id = NULL`. Per directive, a **deterministic backfill of
production data is NOT possible** from `company_name` alone — string variants
of one real company would create duplicate orgs, exactly the failure mode
being avoided. **Documented requirement for the payment phase:** membership
assignment must be an explicit admin/payment-onboarding step (an exact,
human-confirmed mapping), not string matching. Dev/test data is provisioned
explicitly (test helper + dev endpoint by exact account email). Until then,
every existing profile resolves to no organization ⇒ ungated, which preserves
current login behavior for all existing users.

### Preserved behaviors (incremental gate)

- `Organization.access_control_enabled` defaults **False**; provisioning a
  pack flips it True. Ungated orgs keep fully legacy login (`access_session`
  is `null`, protected routes work) — existing tests/roles unaffected.
- **Admins bypass entirely** (`_resolve_organization` returns `None` for the
  admin role): no consumption, no enforcement, no status.
- JWT remains the identity mechanism; `/auth/refresh` untouched; no auth
  redesign.

---

## 3. Token lifecycle

- **AVAILABLE → ACTIVE** at login: `activated_at = now`, `expires_at =
  activated_at + 6h`, `current_user_id` bound. Credential failures never
  reach allocation (allocation runs after password verification).
- **ACTIVE → CONSUMED** on explicit logout (`POST /auth/logout`, idempotent,
  `consumed_at` recorded) or lazily when `now >= expires_at` on any login /
  protected request / status call.
- **Empty pool** → login returns **403** with:
  `"No Nhaav access passes are available for your organization."`
  No session data is returned (no JWT, no `access_session`). The frontend shows
  this message verbatim on the login screen and does not enter the platform.
- **Expired session on protected route** → **401**
  `"Nhaav access session expired or logged out. Please log in again."`
- **Expired/ended sessions** can still call `/auth/logout` and
  `/access/status` (identity-only dependency), so the dashboard always shows
  the real balance.

---

## 4. Organization sharing & isolation

- Employees of one organization draw from the same 10-token pool.
- Every query (allocation, logout, status, enforcement) filters on
  `organization_id` resolved from the caller's own profile — **users can never
  see or consume another org's tokens** (tested: draining org A leaves org B
  fully intact).
- `GET /access/status` returns only the caller's organization counts and,
  when held, their own session (with `remaining_seconds`).

## 5. Migration

- [d4e5f6a7b8c9](nhaav-backend/alembic/versions/d4e5f6a7b8c9_access_token_entitlements.py) —
  `organizations`, `access_packs`, `access_tokens` + indexes (incl. composite
  `ix_access_tokens_org_status` for the CAS hot path).
- [e5f6a7b8c9d0](nhaav-backend/alembic/versions/e5f6a7b8c9d0_profile_organization_membership.py) —
  `profiles.organization_id` (batch mode for SQLite `ALTER` support).
- Verified: `upgrade head` → `downgrade d4e5f6a7b8c9` → `upgrade head` clean;
  **single head** `e5f6a7b8c9d0`; column + FK confirmed present post-migration.

## 6. Tests

[tests/test_access_tokens.py](nhaav-backend/tests/test_access_tokens.py) —
**19 passed** (~72s):

- Provisioning: org receives exactly 10; provisioning flips the gate on.
- Shared pool: 3 employees → 3 active / 7 available from one pool of 10.
- Login consumes exactly one; `access_session` in the login response.
- 6h timer starts at login (`expires - activated = 6h ± 1s`).
- Invalid credentials ×3 consume nothing.
- Logout consumes (`session_ended: true`), second/third logout are no-ops
  (idempotent), consumed token never reused (next login binds a *different*
  token).
- Expiry: backdated `expires_at` → protected 401, expired ACTIVE consumed,
  9 AVAILABLE untouched; expired session cannot access protected resources.
- Empty pool: 10 logins succeed, 11th → 403 with the clear message and no
  session payload.
- Org isolation: A drained → B untouched, no borrowed tokens.
- Remaining count via `/access/status` (9/1/0, `remaining_seconds` sane).
- Concurrency: 5 threads barrier-race the pool; invariants hold — one ACTIVE
  row per success, **distinct** `current_user_id`s, pool still 10, holders are
  members. CAS proven at the DB level, no in-memory lock.
- Gate-off legacy: unprovisioned org → login 200, `access_session: null`,
  protected routes work.
- Admin bypass: admin login consumes nothing even in a gated org.
- **Organization identity (new, per directive):** same-FK users with different
  display names share ONE pool; org rename keeps identity + pool intact;
  editing `company_name` to another org's exact name cannot move membership
  (tokens still come from the FK org); packs/tokens linked by
  `organization_id` and links survive a rename.

Regression: **marketplace baseline 66/66** (`test_supplier_marketplace`,
`test_service_provider_marketplace`, `test_procurement_matching`,
`test_marketplace_security`). Auth-regression subset showed only the 8
documented pre-existing failures (triage buckets #12 ×1, #8 ×7 — node IDs
match `TRIAGE_EXISTING_TEST_FAILURES.md`). Frontend: `tsc --noEmit` clean,
`vite build` succeeds (pre-existing chunk-size warning only).

## 7. Known limitations

- **Membership provisioning is manual/dev-only for now.** The dev endpoint
  (`POST /access/dev-provision-pack`, 404 in production) and the test helper
  are the only provisioning paths; production onboarding needs the payment
  phase's explicit admin assignment (see backfill requirement above).
- `remaining_seconds` is computed server-side at read time; the dashboard
  card does not tick every second (static snapshot per page load).
- `_consume_expired` swallows nothing: expiry runs inline on the request path
  (a dedicated background sweeper remains possible but unnecessary).
- The frontend card is display-only; it does not block UI actions when the
  pool is empty (the backend is the enforcement point — the 403/401 messages
  surface through the existing login-error path).
- Deprecation warnings from `datetime.utcnow()` in this service are aligned
  with the codebase's existing style (pre-existing pattern repo-wide).

---

**PAYMENT IMPLEMENTATION: NOT STARTED**
