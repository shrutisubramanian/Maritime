# Account onboarding & the marketplace gate

A verified-email account is **not** an entitled account. The marketplace stays
locked until **both** of these hold:

1. an admin has **approved** the account's profile (`profiles.verification_status
   == verified`), and
2. the account holds an **ACTIVE, unexpired subscription**.

While locked, the account can reach its **profile**, its **verification
documents** and the **payment/subscription** flow — nothing else. The rule is
enforced on both sides, so a direct API call is refused exactly like a click in
the UI.

## The flow, end to end

| # | User action | Backend effect | `next_step` |
|---|-------------|----------------|-------------|
| 0 | Register | account **+ a pending profile row** (company/designation from the form) | `verify_email` |
| 1 | Click **Continue** in the verification email | `users.is_verified = true`; the SPA reloads into `/profile` | `complete_profile` |
| 2 | Fill in details, upload identity/company documents | `documents` rows (status `pending`) | `awaiting_review` |
| 3 | Admin reviews and approves | `profiles.verification_status = verified` | `pay_subscription` |
| 4 | Pay the subscription (bank transfer + admin verification of the receipt) | `subscriptions` row `ACTIVE`; the pack and its 6-hour passes are issued | `done` |

Approval also stamps the account's **badge** (`profiles.badge_label`, e.g.
`VERIFIED`), which the profile page shows next to the name. Once the
subscription is active, each login consumes one pass and lasts **6 hours**, and
the account is locked to **one device** at a time — see
[SINGLE_DEVICE_LOGIN.md](SINGLE_DEVICE_LOGIN.md).

The email contains **no bare token** — only a link, rendered as a **Continue**
button. Verification happens by clicking it.

## Where the rule lives

| Piece | Location |
|-------|----------|
| Single source of truth | `app/services/onboarding_service.py` (`OnboardingService.status`) |
| API enforcement (403 `onboarding_incomplete`) | `require_marketplace_access` on every route in `app/routers/marketplace.py` |
| Account-visible state | `GET /access/onboarding` (identity-only, so a locked account can still read it) |
| Frontend guard | `nhaav-frontend/src/router/OnboardingGate.tsx` (redirects to `locked_home`, `/profile`) |
| Profile-page step UI | `nhaav-frontend/src/pages/Profile/index.tsx` |

The gate **fails open** on the frontend (a transient status-call failure never
traps a user) and **fails closed** on the backend (the real rule is the 403).
Admins are exempt: they run the review queue and need no subscription.

## Every role is reviewable

Registration provisions a profile for **every** non-admin account and the admin
review queue (`GET /admin/verification/providers`) covers **all** non-admin
roles — clients included. This is deliberate: the gate needs an approved
profile, and a client whose documents nobody could review would be locked out
permanently.

Accounts created before profile provisioning existed need a one-time backfill:

```bash
cd nhaav-backend
.venv/Scripts/python.exe -m app.backfill_profiles --dry-run   # report
.venv/Scripts/python.exe -m app.backfill_profiles            # apply
```

Idempotent; it only adds missing rows and never touches existing profile data.

## Verifying it

```bash
cd nhaav-backend
# The full gate, one account: register -> verify -> upload -> admin approve ->
# pay -> unlocked, plus the 403s at each locked step.
.venv/Scripts/python.exe -m pytest tests/test_onboarding_gate.py -q

# Backfill
.venv/Scripts/python.exe -m pytest tests/test_backfill_profiles.py -q
```

`tests/test_onboarding_gate.py` asserts that approval **alone** does not unlock
the marketplace and that a subscription **without** approval does not either.
