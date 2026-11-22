# Nhaav Security Audit — Account-Ownership Refactor

**Date:** 2026-10-07 · **Remediation pass:** 2026-10-08 · **Scope:** the
access/subscription/payment ownership surface changed by migration
`d0e1f2a3b4c5`, plus the auth surfaces it touches.
**Method:** line-level code review of services, routers, middleware, config and
startup; freeze-compliance grep; no runtime penetration testing.
**Result (per Captain's wording):** the audit identified **no
ownership-model-specific vulnerability** in the new account-level entitlement
controls, but several pre-existing application security findings were logged.
**All four priority findings (H-1, M-1, M-2, M-4) are now REMEDIATED and
regression-verified, and M-3 (rate limiting) is RESTORED.** See the
`Remediation record` section below for finding → fix → test → result →
remaining risk.

---

## Findings

### HIGH

**H-1 — Self-registration as admin.**
`POST /auth/register` accepts a client-controlled `role` field
(`role: UserRole = Field(default=UserRole.client)`,
[app/schemas/auth.py:18](nhaav-backend/app/schemas/auth.py#L18)) and
`AuthService.register_user` honors it. Anyone can create an admin account and
reach the full admin surface (payment verification, moderation).
*Recommendation:* hard-set `role=client` server-side in `register_user` (or
drop `role` from `RegisterRequest`); create admins only via a seeded/offline
provisioning path. *Pre-existing (flagged in the earlier admin-panel audit);
not fixed here — behavior change requires your sign-off.*

### MEDIUM

**M-1 — Dev-provision endpoints are unauthenticated outside production.**
`POST /access/dev-provision-pack` and
`POST /subscription/dev-provision-subscription` guard only on
`settings.ENVIRONMENT == "production"` (404), so in any dev/staging deployment
an unauthenticated caller can mint packs/subscriptions — with **unbounded
`token_count`**. *Recommendation:* fail-closed allowlist (enable only for
explicit `development`/`testing` values), require an admin JWT even in dev,
cap `token_count`.

**M-2 — `ENVIRONMENT` defaults to `"development"`.**
[app/config.py](nhaav-backend/app/config.py) falls back to development when
the variable is unset — a production deploy that forgets the env var silently
enables every dev-only path (see M-1). *Recommendation:* no permissive
default; refuse to boot without an explicit value, or invert the dev-endpoint
guard to an allowlist.

**M-3 — No rate limiting.** The H10 rate-limit module/table were removed
(their tests now fail on import). Login, registration and payment-submission
are brute-force/spam-able. *Recommendation:* restore per-IP and per-account
limits on `/auth/login`, `/auth/register`, `/auth/forgot-password` and
`/payments/submit`.

**M-4 — `Base.metadata.create_all(bind=engine)` at startup**
([app/main.py:27](nhaav-backend/app/main.py#L27)) bypasses Alembic: schema
can drift from migrations and missed migrations are masked. (This is also what
`test_migrations.py::test_production_startup_does_not_create_schema` flags.)
*Recommendation:* remove the call; make migrations the only schema path.

### LOW

**L-1 — Access JWT outlives the session.** Default `JWT_EXPIRE_MINUTES=1440`
(24h) vs the 6-hour session. The session gate stops the stale identity from
reaching protected routes, but the JWT itself remains valid after logout.
*Recommendation:* shorter access-token TTL + refresh flow (exists).

**L-2 — CORS origins hardcoded** to `localhost:5173`/`localhost:3000`
([app/main.py:29](nhaav-backend/app/main.py#L29)). Fine for development;
must be env-configured before any real deployment.

**L-3 — HS256 symmetric JWT default.** Acceptable; document key handling and
rotation. (`JWT_SECRET` is required from the environment — no hardcoded
fallback. Good.)

**L-4 — Wildcard import** `from app.models import *` in `main.py`. Hygiene
only.

---

## Verified secure (this refactor's surface)

- **Cross-account IDOR:** payments list/get are owner-scoped —
  `user.role != admin and payment.owner_user_id != user.id → 404`
  ([payment_service.py:355](nhaav-backend/app/services/payment_service.py#L355));
  access/subscription status allocate and read exclusively through
  `owner_user_id == <caller>` filters in both services.
- **One-active-pass-per-account races:** CAS UPDATE guarded by `rowcount == 1`
  with retry, backed by two partial unique indexes (`..._active_per_owner`,
  `..._active_per_user`). Two concurrent logins can never share a pass; two
  accounts never collide. Covered by concurrency tests.
- **Per-pass 40-day expiry:** lazy sweep owner-scoped, touches only AVAILABLE
  rows inside their own `unused_expires_at` window; used passes follow the
  separate 6-hour lifecycle. Renewal-only login issues nothing.
- **Payment integrity:** plan price/amount validated server-side (client-
  claimed amount never stored or trusted), duplicate UTR → 409, plan changes
  only via admin approval with `plan_change: X -> Y` audit detail.
- **Admin separation:** every admin payment operation re-checks the role
  inside `PaymentService._require_admin`, in addition to the router-level
  gated dependency.
- **Receipt handling:** server-generated UUID filenames (no path traversal —
  client filename is display-only), extension + content-type allowlist, 5 MB
  cap, stored outside any static mount, downloadable only by owner/admin.
- **Renewal reachability by design:** `/payments/*` uses identity-only auth
  deliberately so an exhausted/blocked account can still pay; it grants
  nothing without admin approval.
- **Freeze compliance:** no gateway/UPI/card code anywhere (grep clean); bank
  details come from environment only; `JWT_SECRET`/`DATABASE_URL` required
  from env; passwords hashed with bcrypt (passlib); ORM-only queries on the
  audited paths.

## Scope notes

- Marketplace routers (frozen, untouched by this refactor) were not
  line-audited here; nothing in this refactor touches them.
- `admin_auth` / `admin_moderation` routers predate this refactor; the
  vendor-verification route gap noted in the earlier admin-panel audit is
  unchanged and remains open.
- The account-ownership refactor's requirement checklist (cross-account
  packs/subscriptions/payments, multi-pack allocation order, 40-day expiry,
  login races, logout/re-login, 6-hour expiry, expired passes, additional
  purchases, admin plan changes) is enforced in code and covered by the 106
  passing tests in the three ownership suites.

---

## Remediation record (2026-10-08)

Every finding: root cause → fix → regression test → verification result →
remaining risk.

### H-1 — Self-registration as admin — REMEDIATED

- **Root cause:** `RegisterRequest.role` accepted any `UserRole` value,
  including `admin`, and `AuthService.register_user` persisted it verbatim.
- **Fix:** module-level `_PUBLIC_REGISTRATION_ROLES` allowlist
  (client/supplier/provider only) enforced by a pydantic `field_validator` in
  [app/schemas/auth.py](nhaav-backend/app/schemas/auth.py) — a
  client-supplied `admin` role is rejected with 422. Defense in depth:
  `register_user` clamps any privileged role to `client` and never trusts the
  request value. No public admin-registration endpoint exists; legitimate
  admins are bootstrapped by direct row creation (unchanged).
- **Regression tests:** `TestH1RegistrationRole` in
  [tests/test_security_remediation.py](nhaav-backend/tests/test_security_remediation.py)
  — admin rejected & no account created; supplier/provider register via the
  normal flow; default and explicit client work; omitted role defaults to
  client; existing admin login works; no unauthenticated escalation path.
- **Verification:** 7/7 pass. Pre-existing suites
  (`test_admin_seed`, `test_admin_auth_separation`) also assert rejection and
  are consistent with the fix.
- **Remaining risk:** none identified for this vector.

### M-1 — Unauthenticated dev provisioning — REMEDIATED

- **Root cause:** dev-provision endpoints checked only
  `ENVIRONMENT == "production"` → open in every other environment;
  `token_count` unbounded.
- **Fix:** fail-closed allowlist (`settings.is_development` — only explicit
  `development` enables them), staging requires a valid ADMIN JWT
  (`_require_admin_for_provisioning`), `token_count` bounded 1..100 via Query
  validation (zero/negative/over-cap → 422).
- **Regression tests:** `TestM1DevProvisioning` — 0/−3/101 rejected with 422;
  cap value accepted in development; subscription-provision plan sizes sane.
- **Verification:** 4/4 pass (plus environment tests below).
- **Remaining risk:** in pure local development the endpoints remain
  unauthenticated by design (documented workflow); production and staging are
  closed or admin-gated.

### M-2 — ENVIRONMENT defaults open — REMEDIATED

- **Root cause:** missing `ENVIRONMENT` silently became `"development"`,
  enabling dev-only provisioning.
- **Fix:** [app/config.py](nhaav-backend/app/config.py) treats a missing
  variable as `production` (fail closed), accepts only
  `development|staging|production`, and REFUSES TO BOOT on any other value.
  Dev endpoints now key off the `is_development` allowlist flag, never off
  "not production".
- **Regression tests:** `TestM2EnvironmentFailClosed` — missing →
  production/no dev endpoints; invalid → `ValueError`; staging → neither dev
  nor production.
- **Verification:** 3/3 pass.
- **Remaining risk:** none identified; deployments simply set the variable.

### M-3 — Rate limiting absent — RESTORED

- **Root cause:** the H10 module pair (`rate_limit_event` model,
  `rate_limit_service`) and its migration had been deleted.
- **Fix:** database-backed limiter rebuilt in
  [app/models/rate_limit_event.py](nhaav-backend/app/models/rate_limit_event.py)
  + [app/services/rate_limit_service.py](nhaav-backend/app/services/rate_limit_service.py)
  with migration `f9a0b1c2d3e4` (new head). Identity keys are sha256 hashes —
  no raw emails/IPs stored. User-scoped categories restored to the H10
  contract (vendor_search / port_search / vendor_detail / download, optional-
  auth so anonymous browsing stays public); NEW identity-keyed categories:
  login (FAILED attempts only, per-IP and per-email — success never counts,
  so shared-NAT users and the test battery cannot self-lockout), register,
  admin login (tighter budget), password reset, verification resend (per
  email), payment submit (per user). 429 + Retry-After +
  `{detail:{code,category,message}}`; search page sizes capped at
  `MAX_SEARCH_PAGE_SIZE`; frontend renders object-detail errors gracefully
  with retry guidance ([useLoginForm.ts](nhaav-frontend/src/hooks/useLoginForm.ts)).
- **Regression tests:** `TestM3RateLimiting` (9 tests: threshold + 429 shape,
  no cross-user leakage, window expiry, payload safety, hash-only storage,
  per-IP+email brute force, success-not-counted, admin budget, payment
  submit) PLUS the restored H10 suite (14 tests).
- **Verification:** all pass; the H10 file went from uncollectable to green
  (one stale route reference retargeted to the live admin moderation queue —
  intent preserved).
- **Remaining risk:** counters are DB-backed (multi-instance safe); a
  determined distributed attacker rotates IPs, mitigated by the per-email
  buckets. No CAPTCHA/lockout — out of scope.

### M-4 — Runtime schema creation — REMEDIATED

- **Root cause:** `Base.metadata.create_all(bind=engine)` at import of
  `app.main` bypassed Alembic and masked missed migrations.
- **Fix:** removed from [app/main.py](nhaav-backend/app/main.py); Alembic is
  the single schema authority (test suites keep creating their own schemas).
- **Regression tests:** `TestM4NoStartupCreateAll` — a fresh empty DB stays
  empty after app import; app boots against an `alembic upgrade head`
  database.
- **Verification:** 2/2 pass; also flipped the previously failing
  `test_migrations.py::test_production_startup_does_not_create_schema` to
  green. Alembic upgrade → downgrade −1 → upgrade verified clean on a scratch
  DB; head = `f9a0b1c2d3e4`.
- **Remaining risk:** none; a fresh deployment must run migrations (it always
  should have).

### LOW findings — PARTIALLY ADDRESSED

- **L-2 CORS:** now environment-configurable (`CORS_ORIGINS`, localhost-only
  default). Deployment must set real origins. ✅
- **L-1 JWT TTL:** `JWT_EXPIRE_MINUTES` remains operator-configured (local
  `.env` uses 60 min); refresh tokens are separate (7d). Left as-is — the
  6-hour session gate already bounds access. ⏳ accepted.
- **L-3 HS256 / L-4 wildcard import:** HS256 is explicit config; the models
  wildcard import was documented as deliberate (metadata registration).
  ⏳ accepted.

### Full-suite regression classification (post-remediation)

Battery run (single process): **370 passed / 62 failed / 12 errors**, plus 9
still-uncollectable modules.

- **A (pre-existing, unrelated):** all of them — `test_auth_flow` (JWT byte-
  timing), `test_concurrency`, `test_h4/h5/h7/h8`, `test_h9_*`,
  `test_migrations` (6; stale pinned expectations), `test_seed_*`; errors in
  `test_h4` fixtures, `test_h9_admin_honesty`, `test_service_listings`
  (deleted `email_service` import); 9 modules referencing deleted code
  (admin_account, admin_verification, seed_admin, email_service,
  rate-limit-era leftovers now restored).
- **B (caused by remediation):** none remaining. Three transient B-issues
  were caught and fixed during remediation: module-level
  `reset_user`/`limit_for_category` aliases (H10 contract), failed-only login
  counting (test-battery self-lockout), and the `user_id` construction/query
  alias on the model.
- **C (uncertain):** none.
- **Net improvements:** +44 passing tests (27+1 remediation, 14 restored H10,
  2 `test_migrations` flips); 9→~0 collection errors attributable to the rate
  limiter; H-1/M-1/M-2/M-3/M-4 all green.

**Status: H-1, M-1, M-2, M-4 remediated and verified; M-3 restored and
verified. The audit is NOT signed off as "clean" — the remaining A-class
pre-existing failures are documented above and untouched by this pass.**
