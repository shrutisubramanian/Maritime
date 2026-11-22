# Nhaav Access — User-Facing Subscription / Access Experience

> **Update (account-ownership phase):** the UI has moved to ACCOUNT-scoped
> copy and data (migration `d0e1f2a3b4c5`). There is no "teammate" or shared
> organization pool anymore: passes belong to the signed-in account, each pack
> lists its own remaining/total with per-pack 40-day windows, the exhaustion
> message is "No Nhaav access passes are available for your **account**",
> and the logout modal says the next sign-in uses "your **account's**
> balance". Current rules: [ACCESS_OWNERSHIP_MODEL.md](ACCESS_OWNERSHIP_MODEL.md).
> The organization-pool wording below is retained for phase history.

Scope: the **final user-facing layer** on top of the already-built access-token,
subscription and offline-payment backends. Client, Supplier and Service Provider
all get one consistent Nhaav Access experience.

The marketplace (service + supplies + matching + quotations) was **not** touched.
No payment gateway, UPI or card flow was added — payment is still the external
bank-transfer submission + admin verification flow from the payment phase.

---

## 1. The Nhaav Access card

[NhaavAccessCard.tsx](nhaav-frontend/src/components/NhaavAccessCard.tsx) — one shared
component, mounted on all three role dashboards:

- Client: [ShipDashboard.tsx](nhaav-frontend/src/pages/Dashboard/ShipDashboard/ShipDashboard.tsx)
- Supplier: [SupplierDashboard/index.tsx](nhaav-frontend/src/pages/Dashboard/SupplierDashboard/index.tsx)
- Provider: [ProviderDashboard/index.tsx](nhaav-frontend/src/pages/Dashboard/ProviderDashboard/index.tsx)

It replaces the earlier `SubscriptionSection.tsx` (deleted — single source of the card).

```
Nhaav Access                                     [Active]
────────────────────────────────────────────────────────────
Plan                Passes              Current session      Expires
₹1,000/month        7 / 10 remaining    03:42:18 remaining   Today, 8:15 PM
                    ▓▓▓▓▓▓▓░░░                              [ View Subscription ]
```

- **Plan** — `₹1,000/month` or `₹10,000/year` (price + billing period + pass count).
- **Passes** — `7 / 10 remaining` (or `63 / 100`) with a usage bar and `used` count.
- **Current session** — live `H:MM:SS remaining` for the caller; *(historical:
  the old build showed `In use by a teammate` when a colleague held the
  organization's pass — removed; with account ownership the caller always sees
  their own account's session)*.
- **Expires** — the session end ("Today, 8:15 PM") or the plan expiry when no
  session is running.
- **View Subscription** → `/payments` (labelled **Purchase access pack** when the
  organization is exhausted or blocked).

Exhausted state:

> **No access passes remaining.**
> Purchase another access pack to continue using Nhaav.

Blocked states (subscription pending / expired / cancelled) show a
status-specific notice. The card renders **nothing** when
`access_control_enabled` is false, so ungated/legacy dashboards are unchanged.

Colors: `var(--color-*)` design tokens only (see `src/constants/colors.ts` /
`index.css`) — correct in both light and dark themes.

Server timestamps: naive UTC datetimes are parsed as UTC
(`parseServerDate` in [access.ts](nhaav-frontend/src/services/access.ts)) so the
displayed expiry is not shifted by the viewer's timezone.

---

## 2. Login — valid credentials, empty organization pool

Backend: `AccessTokenService.allocate_for_login` raises **403** before any JWT is
created, so no session that can reach protected functionality is ever issued.

Message (unchanged shape, aligned wording):

> **No Nhaav access passes are available for your account.**

The login form shows this verbatim (the detail already surfaces through
[useLoginForm.ts](nhaav-frontend/src/hooks/useLoginForm.ts)).

---

## 3. Logout — the pass is consumed

Logout confirmation in all three role sidebars reuses
[ConfirmationModal.tsx](nhaav-frontend/src/components/ConfirmationModal.tsx):

> **Log out of Nhaav?**
> Your current access pass will be consumed when you log out. Signing back in
> will use another pass from your account's balance.

It only appears for an actual Logout click — never on ordinary navigation.
`AuthContext.logout()` still fires `POST /auth/logout` before clearing
`nhaav_token` / `nhaav_user` / `nhaav_refresh`.

---

## 4. Session expiry — server-authoritative

**The backend owns expiry, the active pass, consumed passes and organization
entitlement.** Frontend timers are informational only: a manipulated local clock
can make the UI react *early*, never keep or extend a session.

- [InactivityProvider.tsx](nhaav-frontend/src/components/InactivityProvider.tsx)
  was realigned with the 6-hour backend session. The old fixed 20-minute idle
  auto-logout (which contradicted the backend and would burn an organization
  pass) is **gone**; it now mirrors the server's remaining time, shows an
  informational warning in the final 5 minutes, and never extends a session.
  Its modal now uses theme tokens instead of hardcoded colors.
- [apiClient.ts](nhaav-frontend/src/services/apiClient.ts) — a **401 while a
  Nhaav token was present** clears the local token and raises
  `nhaav:session-expired`. A 401 with no token (bad credentials) is not an
  expiry.
- [SessionExpiryHandler.tsx](nhaav-frontend/src/components/SessionExpiryHandler.tsx)
  (mounted via `ProtectedRoute`) reacts once: it clears auth state, redirects to
  `/login` and leaves an explanation for the login screen.
- Before treating a session as over, the UI re-asks the server
  (`GET /subscription/status`). Only a server-confirmed absence of the caller's
  pass triggers the return to login.
- [LoginForm.tsx](nhaav-frontend/src/components/LoginForm.tsx) shows that
  explanation in a themed notice banner.

Because protected routes are already access-enforced server-side, **no
paid-protected action is reachable without a live session**.

---

## 5. Subscription page (`/payments`)

[Payments.tsx](nhaav-frontend/src/pages/Payments/Payments.tsx):

- **Your subscription** summary — current plan, price, billing period, status,
  start date, expiry date, total passes, used, remaining.
- **Plan selection** — Monthly ₹1,000 / 10 passes and Annual ₹10,000 / 100 passes,
  with an annual saving badge computed as `monthly × 12 − annual` (integer paise;
  shown only when positive).
- **No plan is pre-selected** — the previous auto-select of the first plan was
  removed; the submit controls stay disabled until the organization explicitly
  confirms a plan.
- **Payment history** — date submitted, plan, amount, status, UTR/reference and
  the rejection reason where applicable.
- **Receipts stay private** — fetched with the caller's token as a blob, never
  linked by bare URL; the backend enforces cross-organization isolation.

---

## 6. Verification

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `vite build` (production) | succeeds (only the pre-existing chunk-size warning) |
| `tests/test_access_tokens.py` + `test_subscriptions.py` + `test_payments.py` | **77 / 77 passed** |

The requested scenarios are covered by those suites: monthly user, annual user,
exhausted passes, active session, expired session, rejected payment, active
subscription, and multiple employees sharing one organization pool.

### Carried business decision (unchanged, flagged)

An organization whose subscription has **expired** is refused new sessions, so
after its JWT also lapses it cannot reach `/payments` to renew (JWT window is
24h). Recorded in
[PAYMENT_IMPLEMENTATION_REPORT.md](PAYMENT_IMPLEMENTATION_REPORT.md); not changed
unilaterally here.
