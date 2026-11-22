# Subscription / Plan Layer — Implementation Report

> **Update (account-ownership phase):** ownership has MOVED from the
> organization pool to the **individual account** (migration `d0e1f2a3b4c5`).
> Subscriptions, packs, passes and payments now carry `owner_user_id`; each
> unused pass expires 40 days after ISSUANCE; multiple packs per account are
> allowed; one ACTIVE session per account; no inactivity timeout. Where this
> report says an organization owns or shares a subscription/pack, read
> **account**. Current rules: [ACCESS_OWNERSHIP_MODEL.md](ACCESS_OWNERSHIP_MODEL.md).
> The historical organization-pool description below is retained for phase history.
>
> **Update (later phase):** the payment submission + admin verification layer is
> now implemented — see [PAYMENT_IMPLEMENTATION_REPORT.md](PAYMENT_IMPLEMENTATION_REPORT.md).
> The `PAYMENT IMPLEMENTATION: NOT STARTED` statement below was accurate when this
> report was written: it meant **no payment mechanism existed**, and it remains true
> that **no online payment gateway, UPI integration or card processing exists**.
> What changed is that organizations can now submit an offline bank transfer and an
> admin can verify it, which is what activates a subscription.

**Scope:** the subscription layer on top of the completed access-token foundation.
Marketplace, matching, quotations, listing lifecycles and authentication are frozen and untouched.

**PAYMENT IMPLEMENTATION: NOT STARTED**

No UPI integration, payment gateway, bank-transfer submission, UTR/receipt
verification, payment admin UI or payment endpoints exist. A subscription is
created **PENDING** and only *activation* — which will eventually be triggered by
a verified payment — grants passes and opens the entitlement gate. Until then the
only activation path is explicitly development/test/admin provisioning.

---

## 1. Schema

| Table | Purpose |
|---|---|
| `subscription_plans` | The approved plan catalogue (seeded; the only place 10/100 and the prices exist) |
| `subscriptions` | An organization's subscription: plan + status + clock |
| `access_packs` *(extended)* | Now carries `subscription_id` (nullable, **UNIQUE**) and `status` |
| `access_tokens` *(reused, unchanged)* | The existing passes — no second token system |

### `subscription_plans`
`id` (UUID PK) · `code` (unique: `MONTHLY`/`ANNUAL`) · `name` ·
`price_paise` (**Integer**, integer paise) · `currency` (`INR`) ·
`duration_value` · `duration_unit` (`MONTH`/`YEAR`) · `pass_count` · `active` · `created_at`

### `subscriptions`
`id` (UUID PK) · `organization_id` → `organizations.id` (CASCADE) ·
`plan_id` → `subscription_plans.id` · `status` (`PENDING`/`ACTIVE`/`EXPIRED`/`CANCELLED`) ·
`starts_at` · `expires_at` · `created_at` · `updated_at` · index on `(organization_id, status)`

### `access_packs` additions
`subscription_id` → `subscriptions.id` (SET NULL, **UNIQUE** — multiple NULLs stay legal, so
legacy/dev packs are unaffected) · `status` (`ACTIVE`/`EXPIRED`/`CANCELLED`).
`token_count` **is** `total_passes`; the existing column is reused rather than duplicated.

### Money convention
Money in this layer is **INTEGER PAISE** — never floating point, as required.
Note the deliberate divergence: the frozen marketplace stores quote amounts as
`Float`; that code is untouched and is a separate legacy convention.

### Enum storage
New enums use member names equal to their values, so persisted state is
unambiguous (`'MONTH'`, `'ACTIVE'`, `'EXPIRED'`, `'CANCELLED'`, …).

## 2. Plan definitions

Seeded in one place (`PLAN_DEFINITIONS`, [subscription_service.py](nhaav-backend/app/services/subscription_service.py)) **and** inserted by the migration,
so a migrated database always carries the catalogue. `seed_plans()` reconciles idempotently at runtime.

| code | name | price | currency | duration | passes |
|---|---|---|---|---|---|
| `MONTHLY` | Nhaav Monthly | ₹1,000 (`100000` paise) | INR | 1 MONTH | 10 |
| `ANNUAL` | Nhaav Annual | ₹10,000 (`1000000` paise) | INR | 1 YEAR | 100 |

Plans apply equally to Clients, Suppliers and Service Providers — the plan
belongs to the **owning account** (an individual user), not to an organization,
role or employee.

Nothing in business logic hardcodes 10 or 100: activation reads `plan.pass_count`.

## 3. Subscription lifecycle

```
create_subscription()  ->  PENDING      (no clock, no passes, gate untouched)
        |
        |  activate_subscription()   [dev/test/admin today; verified payment later]
        v
      ACTIVE   starts_at = activation time, expires_at = +duration
               -> issues exactly ONE AccessPack of pass_count, OWNED BY the account
               -> account.access_control_enabled = True
        |
        +-- expires_at reached -->  EXPIRED   (lazy sweep; PASSES UNTOUCHED —
        |                                        unused passes carry forward
        |                                        within their 40-day windows)
        +-- manual/admin      -->  CANCELLED
```

- Creating a subscription grants **nothing** — no activation merely because a row exists.
- Activation is **idempotent**: the same activation processed twice returns the
  existing pack and creates no duplicate passes. Guarded twice — a service-level
  lookup plus the UNIQUE index on `access_packs.subscription_id`.
- Duration math is calendar-correct, implemented without extra dependencies:
  1 MONTH from Jan 15 → Feb 15; Jan 31 → Feb 28/29 (clamped); 1 YEAR from Feb 29 → Feb 28.
- A NEW purchase while a subscription is live ADDS a second pack (second
  subscription) — it never overwrites, extends or cancels the existing one.

## 4. Access-pack relationship

- One subscription owns **exactly one** pack; one pack owns `pass_count` passes
  (`access_tokens`, the existing rows). Packs and passes are owned by the
  **account** (`owner_user_id`), never shared with the account's colleagues.
- **Multiple packs per account are supported**: each purchase creates its own
  independently-tracked pack whose passes carry their own 40-day windows.
- `pack.organization_id` is optional metadata only. Every pass carries
  `owner_user_id`, `organization_id` (metadata) and `pack_id`.
- Only passes in **usable** packs can be allocated: passes owned by the calling
  account that are still inside their own 40-day unused window, in packs of an
  ACTIVE, unexpired subscription (or legacy/dev packs provisioned directly).
  Passes in an expired subscription's pack are unreachable for NEW sessions but
  keep carrying forward within their windows for when the account renews.

## 5. Gating and expiration behavior

**Subscription expiry ≠ pass consumption.** The subscription decides whether the
organization may start a session; the passes decide individual 6-hour sessions.

- Subscription-gated organization (has at least one subscription row) with no
  live subscription → **new logins are refused** with a clear, status-specific
  message:
  - PENDING → “subscription is pending activation”
  - EXPIRED → “subscription has expired … renew”
  - CANCELLED → “has been cancelled”
  HTTP 403; no pass is consumed by the blocked attempt.
- **An already-active 6-hour session is NOT invalidated** when the subscription
  clock crosses expiry — it runs to its own expiry, exactly as before. Verified by test.
- **Expired passes are never spendable**, which is what removes any need to
  invent carry-forward behavior.
- Organizations with **no** subscription row (legacy/dev provisioning) are
  completely unaffected: gate off → legacy login; gate on → passes work as before.
- Admin bypass is unchanged; `AccessTokenService.enforce_access_token`,
  the CAS allocation loop and the 6-hour rule are untouched in substance.

## 6. API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /subscription/status` | identity-only | caller's OWN organization: plan, subscription state, starts/expires, pass balance, active pass + expiry |
| `GET /subscription/plans` | identity-only | the approved catalogue (for display: ₹1,000/month, ₹10,000/year) |
| `POST /subscription/dev-provision` | **dev/test/admin only (404 in production)** | create org + subscription + activate, optionally assigning members by exact email |

`GET /subscription/status` returns e.g.:

```json
{
  "access_control_enabled": true,
  "organization": "ABC Marine",
  "plan": { "code": "MONTHLY", "name": "Nhaav Monthly", "price_paise": 100000,
            "currency": "INR", "duration_value": 1, "duration_unit": "MONTH", "pass_count": 10 },
  "subscription": { "status": "ACTIVE", "starts_at": "...", "expires_at": "..." },
  "passes": { "total": 10, "used": 3, "remaining": 7 },
  "active_pass": { "expires_at": "...", "remaining_seconds": 15773, "held_by_me": true }
}
```

Organization isolation is enforced in the service: the payload is always built
from the caller's own `Profile.organization_id`. No endpoint accepts an
organization id, so no organization can read another's subscription.

## 7. Frontend

[NhaavAccessCard.tsx](nhaav-frontend/src/components/NhaavAccessCard.tsx) — the shared, display-only Nhaav Access
card mounted on all three role dashboards (it superseded the earlier
`SubscriptionSection.tsx`). Uses the existing design tokens (CSS variables from
`src/constants/colors.ts` / `index.css`; no raw colours added):

- Organization + **plan**: “₹1,000/month” or “₹10,000/year” (with plan name and pass count)
- **Subscription status** chip: Active / Pending activation / Expired / Cancelled
- **Passes**: “7 / 10 remaining” with a usage bar (+ “3 used”)
- **Current session**: live “04:23:11 remaining” countdown driven by the server expiry
- Blocked states (pending/expired/cancelled, exhausted passes) show a plain notice
- Renders **nothing** when `access_control_enabled` is false → legacy dashboards unchanged
- **No payment screens and no purchase buttons** — payment is not implemented

Supporting client: [subscription.ts](nhaav-frontend/src/services/subscription.ts) (types, `subscriptionService.getStatus/getPlans`,
integer-paise formatters — `formatPaise`, `formatPlanPrice`). Session formatting
is reused from the existing access service.

## 8. Migration

- [f6a7b8c9d0e1_subscription_plans.py](nhaav-backend/alembic/versions/f6a7b8c9d0e1_subscription_plans.py) (revises `e5f6a7b8c9d0`):
  creates `subscription_plans` + `subscriptions`, adds `access_packs.subscription_id`
  (UNIQUE) and `access_packs.status`, and seeds both plans.
- Verified: `upgrade head` → `downgrade e5f6a7b8c9d0` → `upgrade head` all clean;
  **single head `f6a7b8c9d0e1`**; post-migration the catalogue reads
  `MONTHLY 100000/10/MONTH/INR` and `ANNUAL 1000000/100/YEAR/INR`, and the unique
  index on `access_packs.subscription_id` is present.
- Batch mode is used for the `access_packs` alteration so the migration works on
  SQLite and PostgreSQL alike.

## 9. Tests

[tests/test_subscriptions.py](nhaav-backend/tests/test_subscriptions.py) — **27 passed**, covering all 12 required scenarios:

| # | Requirement | Test |
|---|---|---|
| 1 | Monthly plan has 10 passes | `test_monthly_plan_has_ten_passes` |
| 2 | Annual plan has 100 passes | `test_annual_plan_has_hundred_passes` |
| 3 | Plan prices correct | `test_plan_prices_are_correct_integer_paise` |
| 4 | Plan belongs to organization subscription | `test_plan_belongs_to_organization_subscription` |
| 5 | Pack created exactly once on activation | `test_activation_creates_access_pack_exactly_once` |
| 6 | Multiple employees share the pack | `test_multiple_employees_share_the_subscription_pack` |
| 7 | Cross-organization isolation | `test_different_organizations_cannot_access_each_others_subscription`, `test_status_endpoint_reports_plan_subscription_and_active_pass` |
| 8 | Expired subscription cannot allocate a pass | `test_expired_subscription_cannot_allocate_new_pass` |
| 9 | Active 6-hour session behavior unchanged | `test_active_six_hour_session_survives_subscription_expiry` |
| 10 | Unprovisioned org stays legacy-compatible | `test_unprovisioned_organization_remains_legacy`, `test_legacy_dev_pack_without_subscription_still_allocates`, `test_user_without_organization_sees_no_subscription` |
| 11 | Admin/dev provisioning activates the correct plan | `test_dev_endpoint_activates_the_correct_plan`, `test_end_to_end_provision_then_member_login_consumes_a_pass` |
| 12 | No floating-point money | `test_no_floating_point_money_in_subscription_layer` (schema column is `Integer`; every catalogue price is `int`) |

Extras: seed idempotency, plan catalogue API shape, unknown plan rejected,
pending/cancelled subscription messages, calendar duration math (month clamping,
year leap-day clamping), and the UNDECIDED carry-forward rule
(`test_unused_passes_do_not_carry_forward_into_new_subscription`).

### Regression
- Access-token suite: **19/19** (unchanged).
- Subscription + access combined: **45 passed**.
- Marketplace baseline: **66/66** (`test_supplier_marketplace`,
  `test_service_provider_marketplace`, `test_procurement_matching`,
  `test_marketplace_security`) — frozen architecture intact.
- Auth regression subset: 8 failed / 8 passed — **exactly** the documented
  pre-existing triage buckets (#12 ×1, #8 ×7), nothing new.
- Frontend: `tsc --noEmit` clean; `vite build` succeeds (pre-existing chunk-size warning only).

## 10. Known business decisions still required

1. **Carry-forward of unused passes between subscriptions — UNDECIDED.**
   Requires business confirmation. Current behavior implements **no**
   carry-forward: unused passes stay in their expired pack and are unusable.
   (They are not deleted, so a future decision can be applied without data loss.)
2. **In-flight session exactly at expiry** — today an active 6-hour session is
   allowed to finish even if the subscription expires mid-session (as directed).
   Confirm this is the intended commercial behavior.
3. **Seat/employee limits** — the plan grants a pass pool with no per-employee
   cap; confirm whether plans should limit the number of employees sharing a pool.
4. **Renewal semantics** — each activation starts its own clock from activation
   time; confirm whether early renewal should instead stack onto the current expiry.
5. **Multiple concurrent subscriptions** — technically allowed; the effective one
   is the newest ACTIVE (else the newest overall). Confirm whether an organization
   may hold two plans at once.
6. **Tax/invoicing, refunds and proration** for ₹1,000 / ₹10,000 (payments phase).
7. **Membership assignment workflow** — provisioning assigns members by exact
   email today; the production admin/payment onboarding flow still needs to be
   built (the documented backfill requirement from the access-token phase).

---

**PAYMENT IMPLEMENTATION: NOT STARTED**
