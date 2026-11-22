# Nhaav Access Ownership Model — Current State (Authoritative)

> This document is the **single source of truth** for how Nhaav access passes
> are owned and consumed, as of the account-ownership refactor
> (migration `d0e1f2a3b4c5`). Earlier reports
> ([SUBSCRIPTION_IMPLEMENTATION_REPORT.md](SUBSCRIPTION_IMPLEMENTATION_REPORT.md),
> [ACCESS_TOKEN_IMPLEMENTATION_REPORT.md](ACCESS_TOKEN_IMPLEMENTATION_REPORT.md),
> [ACCESS_EXPERIENCE_REPORT.md](ACCESS_EXPERIENCE_REPORT.md)) describe the
> historical organization-pool phases; where they disagree with this document,
> **this document wins**.

---

## 1. Locked business decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Ownership is per ACCOUNT**, not per organization. Clients, Suppliers and Service Providers all use the identical paid-access model. | **LOCKED** |
| D2 | **40-day unused clock = issuance + 40 days.** Each pass carries `unused_expires_at = issued_at + 40 days`, stamped once at pack activation (`PASS_UNUSED_VALIDITY_DAYS = 40`, [access_token_service.py:64,143](nhaav-backend/app/services/access_token_service.py#L64)). | **LOCKED** |
| D3 | **Used passes are consumed by the 6-hour session** (`SESSION_DURATION_HOURS = 6`, measured from login; logout consumes the pass permanently). No inactivity timeout exists — 6 hours from login is the only duration. | **LOCKED** |
| D4 | **Multiple packs per account.** A second purchase ADDS a pack; it never overwrites, extends or cancels an existing pack. Packs and their passes are tracked independently with their own 40-day windows. | **LOCKED** |
| D5 | **One ACTIVE session per account**, enforced by CAS allocation plus two partial unique indexes (`uq_access_tokens_active_per_owner`, `uq_access_tokens_active_per_user`, WHERE `status='ACTIVE'`). Different accounts (even in one company) run sessions simultaneously without interference. | **LOCKED** |
| D6 | **Plans:** Monthly ₹1,000 / 10 passes (`100000` paise), Annual ₹10,000 / 100 passes (`1000000` paise). Integer paise only. | **LOCKED** |
| D7 | **Plan changes require admin approval.** A purchase whose plan differs from the account's live subscription is flagged `plan_change` in the admin queue; approval is the ONLY switch mechanism. No proration, no refund, no conversion is invented. | **LOCKED** |
| D8 | **Payments are bank-transfer only.** No gateway/UPI/cards, ever. Activation happens exclusively through admin verification of a submitted transfer. | **LOCKED (frozen)** |

## 2. Legacy NULL-owner packs — decided treatment

**Decision: legacy packs with `owner_user_id IS NULL` remain INERT — no auto-assignment, no auto-expiry, no deletion.**

Rationale and mechanics:

1. **They can never grant access.** Every allocation, status and expiry query
   filters `owner_user_id == <calling account>` — a NULL-owner row matches no
   account, so it is unreachable by design.
2. **Paid value was already preserved at the pass level.** The migration
   backfilled every ACTIVE pass's `owner_user_id` from its `current_user_id`
   (the account that was actually holding/using it), and stamped the 40-day
   window from `created_at`. What users were actively using keeps working.
3. **Assignment stays an explicit, human-confirmed operator action** via
   `AccessTokenService.assign_pack_owner(db, owner, pack)` — the same doctrine
   the org-identity phase established ("no fuzzy backfill; explicit assignment
   only"). Which account inherits an unassigned pack is a business judgment per
   pack, not something code should guess.
4. **Fully reversible.** An operator can assign any legacy pack at any time;
   nothing decays or destroys it in the meantime.

Until an operator assigns them, NULL-owner packs are dead bookkeeping rows that
hurt nothing.

## 3. Carry-forward and expiry, precisely

- Unused passes carry forward **within their own 40-day window** — including
  across a subscription lapse. Subscription expiry does NOT touch passes;
  `expire_due_subscriptions` only flips the subscription row.
- A pass crosses 40 days unused → `EXPIRED` (lazy sweep, owner-scoped, per
  pass — never per pack). Permanent; it can never be allocated again.
- Buying a new pack while old passes exist creates a **second** independent
  set of 40-day windows. Allocation picks the oldest unexpired AVAILABLE pass
  (`ORDER BY created_at`), so old passes are spent before new ones.

## 4. Login outcomes (gated accounts)

| Situation | Result |
|---|---|
| Unused pass inside its 40-day window | New 6h session (or **reuses** the live one — `reused: true`) |
| Live session already running | Same session returned; no second pass touched |
| Passes exhausted, subscription ACTIVE | **403** "No Nhaav access passes are available for your account." |
| Latest subscription PENDING/EXPIRED/CANCELLED | **Renewal-only login**: authenticates, no pass issued, `access_blocked` explains; payment endpoints reachable |
| Admin | Gate never applies |

## 5. Organization = optional metadata

`organization_id` remains on users' profiles and (nullable) on the four access
tables purely as business metadata. It never grants, gates, shares or scopes
any entitlement. Marketplace organization relationships are untouched.
