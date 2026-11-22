# Nhaav Security Sign-Off Audit — FINAL

**Date:** 2026-10-08 · **Type:** read-only production-readiness audit (no code modified)
**Scope:** access, subscription, payment, authentication, marketplace, account-ownership
architecture. Evidence gathered from the actual code, migrations, tests, and live
probes — not from prior reports.

---

## 1. Executive verdict

## ✅ PASS WITH RESIDUAL RISKS

No critical or high findings. The remediated controls (H-1, M-1, M-2, M-3, M-4)
were independently re-verified against the live code and adversarial probes. All
locked business rules are implemented exactly and server-authoritatively. The
residual risks (Section 6) are low severity and deployment-oriented; none blocks
sign-off.

---

## 2. Findings summary

| # | Severity | Finding | Status |
|---|---|---|---|
| F-1 | LOW | UTR duplicate check is service-level only (no unique index) — narrow concurrent-submit race | **RESOLVED** (migration `a0b1c2d3e4f5` + safe-409 conversion + concurrency regression test; see Remediation record) |
| F-2 | LOW | Rate limiter keys on peer address; behind a reverse proxy without real peer forwarding, all clients share one bucket | Residual, deployment note |
| F-3 | LOW (by design) | Never-provisioned "legacy ungated" accounts rely on JWT alone for non-entitlement routes | Residual, documented incremental-gate design (deployment gate per Captain) |
| F-4 | INFO | Access-JWT default TTL is 24h when `JWT_EXPIRE_MINUTES` is unset (local `.env` sets 60) | Accepted, operator config |
| F-5 | INFO | Dev-provision endpoints are unauthenticated in explicit `development` only | Accepted, documented workflow |
| — | — | No Critical/High/Medium findings | — |

---

## 3. Findings detail

### F-1 — UTR duplicate race (LOW) — **RESOLVED 2026-10-08**

- **Exploit scenario:** two concurrent `POST /payments/submit` calls with the
  same UTR both pass the service-level duplicate lookup
  ([payment_service.py:246](nhaav-backend/app/services/payment_service.py#L246))
  before either commits; both rows enter PENDING. If an admin then approves
  both, two packs are issued for one bank reference.
- **Affected code:** `PaymentService.submit_payment`; `payments.utr` had a
  non-unique index (`ix_payments_utr`).
- **Fix (applied after sign-off, per Captain's directive):**
  1. Unique partial index `ux_payments_live_utr` on `payments(utr)` WHERE
     `status IN ('PENDING','SUBMITTED','VERIFIED')` — model
     ([payment.py](nhaav-backend/app/models/payment.py)) + migration
     [a0b1c2d3e4f5_unique_live_utr.py](nhaav-backend/alembic/versions/a0b1c2d3e4f5_unique_live_utr.py)
     (new head; includes a defensive legacy-dedup step that CANCELs older
     duplicate LIVE rows so the index can always be created).
  2. `submit_payment` catches `IntegrityError` from the index and converts it
     into the SAME safe 409 the sequential check returns — no IntegrityError
     ever leaks; the orphaned-receipt cleanup is preserved.
  3. REJECTED/CANCELLED rows fall outside the predicate, so the existing
     correction flow (rejected reference re-submission) is preserved.
- **Regression tests:**
  [test_f1_utr_race.py](nhaav-backend/tests/test_f1_utr_race.py) — 6/6 pass:
  concurrent same-UTR submissions → exactly one payment + one safe 409;
  sequential duplicate still 409; rejected-UTR resubmission works;
  cancelled-UTR resubmission works; different UTRs independent; index in
  metadata.
- **Verification:** payments 40/40, security 28/28, H10 14/14, access 34/34,
  marketplace security 32/32 — combined battery **186/186** (with suite order
  subscriptions-before-payments; see classification note below).
- **Remaining risk:** none for this vector.

### Post-fix regression classification note (B/C check)

One failure appeared in one suite ordering
(`test_subscriptions.py::TestMultiplePacks::test_second_purchase_adds_a_pack_without_touching_the_first`,
DetachedInstanceError) and was investigated per protocol:

- **Root cause (pre-existing latent test bug):** the test rebinds its `db`
  variable to a new session without closing the first; the first session's
  objects (`first_sub`) become detached when garbage collection expires them,
  and reading `first_sub.id` then raises. GC timing — and therefore the
  failure — depends on execution order/time. Nothing in the F-1 change
  (payment insert path) is involved; the test never submits a payment.
- **Classification: A (pre-existing latent flake).** B = 0, C = 0 stand.
- The original sign-off ordering, and any ordering with subscriptions before
  payments, passes 186/186. Optional one-line hygiene fix (close the first
  session in the test) available on request.

### F-2 — Proxy-awareness of rate limiting (LOW)

- **Exploit scenario:** none for bypass — forged `X-Forwarded-For` /
  `X-Real-IP` are **ignored** (verified by live probe), so headers cannot
  rotate buckets. The inverse risk: if Nhaav is deployed behind a reverse
  proxy that does not preserve real peer addresses, every client shares the
  proxy's socket address and one abusive actor could exhaust the shared
  failure-budget for everyone.
- **Current protection:** limiter uses `request.client.host` only (no
  header trust anywhere in `app/` — grep-verified); per-email and per-user
  buckets still isolate per-account abuse even under a shared IP.
- **Recommendation:** when deploying behind a proxy, either run the app so the
  proxy address is the real client (uvicorn `--proxy-headers` with a trusted
  PROXY protocol) or add an explicit, allowlisted trusted-proxy hop.

### F-3 — Legacy ungated accounts (LOW, by design)

- **Exploit scenario:** an account that was never provisioned
  (`access_control_enabled=False`) can reach non-entitlement routes (e.g.
  `/auth/me`, marketplace reads) with a bare JWT, with no 6-hour/pass
  lifecycle.
- **Current protection:** this is the documented incremental-gate contract —
  the gate is a no-op only for never-provisioned accounts; **any** account with
  a pack/subscription is fully pass-gated (live-probe verified: replayed JWT
  after logout → 401/403 on a gated account). Registration can no longer grant
  any privileged role (H-1), so ungated accounts carry no admin power.
- **Recommendation:** none required; revisit if the Captain wants all accounts
  gated at a future cutover.

### F-4 / F-5 — Accepted configuration items

JWT TTL and dev-provision scope are documented operator decisions (see
SECURITY_AUDIT_REPORT.md remediation record). Neither grants entitlement or
admin power.

---

## 4. Explicit confirmations (evidence-mapped)

### 4.1 Account ownership / IDOR — CONFIRMED

- Every allocation/status/expiry query filters
  `owner_user_id == <calling account>` (verified across both services, 15+
  filter sites); payment list/get enforce
  `role != admin and owner_user_id != user.id → 404`
  ([payment_service.py:355](nhaav-backend/app/services/payment_service.py#L355)).
- Tests: `test_two_accounts_do_not_share_passes`,
  `test_account_cannot_consume_another_accounts_pass`,
  `test_account_status_never_counts_another_accounts_passes`,
  cross-account receipt 404, cross-account payment-record 404 — all passing.
- Receipt download: `authorize_receipt` (owner-or-admin only), UUID server-side
  filenames (traversal impossible), outside static mounts.
- Ownership transfer: **no endpoint mutates `user.role`** (grep-verified — the
  only write is registration's clamped `safe_role`); org/company data is
  metadata-only (nullable FKs, never read by any entitlement query).
- NULL-owner legacy packs: unreachable by construction (no query matches NULL
  owner); assignment exists solely via the operator hook.

### 4.2 Pass lifecycle — CONFIRMED (server-authoritative)

- Plan catalogue: `100_000` paise (₹1,000) / 10 passes; `1_000_000` (₹10,000) /
  100 passes ([subscription_service.py:70-88](nhaav-backend/app/services/subscription_service.py#L70)).
- `PASS_UNUSED_VALIDITY_DAYS = 40`, `SESSION_DURATION_HOURS = 6`;
  `unused_expires_at = issued_at + 40d` stamped at issuance; per-pass sweep
  touches only AVAILABLE rows past their own window; expired passes cannot be
  allocated (allocation WHERE clause requires in-window); exhausted gated
  account → 403 with the fixed message; non-live subscription → renewal-only
  login that issues nothing.
- Frontend: display-only (paise→₹ formatters, no decision inputs), no timer
  extension, no fake values (grep-verified).

### 4.3 One active session per account — CONFIRMED

- **DB layer:** dual partial unique indexes
  `uq_access_tokens_active_per_owner` (owner_user_id) +
  `uq_access_tokens_active_per_user` (current_user_id), both
  `WHERE status='ACTIVE'` — a second concurrent ACTIVE commit fails at the DB
  even if service logic regressed.
- **Service layer:** CAS UPDATE guarded by `rowcount == 1` with retry;
  reuse-first login returns the SAME session (no timer reset, no second pass).
- Tests: two concurrency suites (`test_concurrent_same_account_logins_allocate_one_pass`,
  `test_concurrent_logins_against_one_pack_never_double_allocate`) pass.
- Live probe: 2 logins + 1 logout over a 5-pack consumed exactly 2 passes
  (logout consumed the first; second login took a new one — no reset, no reuse).

### 4.4 Subscriptions / multiple packs — CONFIRMED

- Second purchase ADDS a pack (409 guard removed by design); activation is
  idempotent (service lookup + UNIQUE `access_packs.subscription_id`);
  independent per-pack expiry tested.
- Client cannot forge amount (server-side plan price; claimed amount
  validated, never stored), pass count (`plan.pass_count`), status, or expiry
  (all server-derived).

### 4.5 Plan change / admin approval — CONFIRMED

- Activation only inside `PaymentService.approve_payment` →
  `_require_admin` (service-level, re-checked on every call); plan_change
  flagged in the admin queue with `plan_change: X -> Y` audit detail; approval
  is idempotent (VERIFIED short-circuit) and transactional (single-transaction
  activation — partial states impossible). No proration/refund/conversion
  anywhere (grep-verified).

### 4.6 Payment security — CONFIRMED

- Freeze: zero gateway/UPI/card code (grep clean); bank details env-only.
- Receipts: UUID filenames, extension+content-type allowlist, 5 MB cap,
  private dir, owner/admin-only download.
- Payment records account-scoped; UTR sequential-duplicate → 409 (race noted
  as F-1); rejection requires a reason.

### 4.7 Authentication — CONFIRMED

- H-1 re-verified in code: schema allowlist + service clamp; `role=admin` → 422.
- bcrypt (passlib); JWT HS256 with required-from-env secret; invalid/expired
  JWTs rejected in `get_optional_user`/identity deps.
- Pass ≠ JWT: the session gate (`enforce_access_token`) runs inside
  `get_current_user` on every protected route; live probe confirmed a replayed
  JWT after logout is refused for gated accounts (401/403) while renewal paths
  (`/payments/*`, identity-only) grant nothing without admin approval.

### 4.8 Environment / deployment — CONFIRMED

- Missing ENVIRONMENT → production (fail closed); invalid → boot refusal;
  staging dev-provision requires admin JWT; production → 404. Secrets required
  from env; no dev defaults in production. `create_all` removed — live probe
  showed a fresh DB stays empty after app import; Alembic up/down/up clean
  (head `f9a0b1c2d3e4`).

### 4.9 Rate limiting — CONFIRMED

- Live probes: forged `X-Forwarded-For`/`X-Real-IP` do NOT rotate buckets;
  failure bucket exhausts → 429 + Retry-After (898s observed); successful
  logins never counted (shared-NAT safe); per-email buckets isolate
  mailboxes. All identity keys stored as sha256 hashes (verified in DB).
- Login (failed-only, IP+email), admin login (tighter), register, forgot,
  resend, payment submit, marketplace search categories — all wired and tested
  (H10 suite restored: 14/14).

### 4.10 Marketplace authorization — CONFIRMED (no regression)

- `test_marketplace_security.py` (32 tests) passes: cross-provider/supplier
  ownership, quotation isolation, unapproved-state visibility, moderation
  admin-only (`ModerationService._require_admin` re-checked per call),
  self-approval blocked, payload status-forging blocked, lifecycle enforced.
- The entitlement refactor added read-path rate limiting only; no marketplace
  behavior changed.

### 4.11 Admin security — CONFIRMED

- Router-level gated deps + service-level role re-checks (payments,
  moderation); normal users cannot reach admin surfaces (403);
  moderation/payment actions produce audit-log rows no normal endpoint can
  alter (no write path exposed).

### 4.12 Frontend — CONFIRMED (secondary layer)

- No hardcoded authoritative prices (display formatters only), no gateway, no
  client timers that extend sessions, 401/403 handled by the apiClient
  interceptor, 429 rendered with retry guidance; expired sessions cleared.

### 4.13 Database / race conditions — CONFIRMED

- Dual partial unique indexes (one-active-pass), UNIQUE
  `access_packs.subscription_id` (duplicate activation), CAS rowcount guards,
  transactional approval, FK-integrity on owner columns. Residual: F-1 UTR
  index. Orphaned entitlements: pack/pass/payment rows are owner-anchored;
  rejected payments leave no entitlement.

### 4.14 Business-rule freeze — CONFIRMED

₹1,000/10 · ₹10,000/100 · 40-day per-pass · 6-hour sessions · one active pass
per account · multiple packs · admin-approved plan changes · no inactivity
timeout · bank transfer only · no UPI/gateway · all three roles on the same
paid model · marketplace untouched. Every constant inspected in source this
pass.

---

## 5. Test verification (this audit's runs)

| Check | Result |
|---|---|
| Remediation suite (28) + H10 restored (14) + access (34) + subscriptions (32) + payments (40) + marketplace security (32) | **180 passed** |
| Full suite (post-remediation; code unchanged since) | 370 passed / 62 failed / 12 errors — **all A-class** (pre-existing buckets documented in SECURITY_AUDIT_REPORT.md); 9 uncollectable legacy modules (deleted-code imports) |
| Failure classification | A = all remaining; **B = none; C = none** |
| Alembic upgrade → downgrade −1 → upgrade | Clean; head = `f9a0b1c2d3e4` |
| `tsc --noEmit` | Exit 0 |
| `vite build` | ✓ (pre-existing chunk-size warning only) |
| Live adversarial probes (read-only) | 5/5 PASS: forged-header bucket rotation blocked; 429+Retry-After; success-not-counted; gated JWT replay rejected post-logout; pass-consumption accounting exact (2/5) |

---

## 6. Remaining residual risks

1. ~~**F-1 UTR race**~~ **RESOLVED** — unique partial index `ux_payments_live_utr`
   (migration `a0b1c2d3e4f5`, new head) + safe-409 conversion + concurrency
   regression test (6/6). Battery 186/186.
2. **F-2 proxy deployment** (LOW): rate-limit buckets need real peer addresses
   at deployment time; per-email/per-user buckets bound the blast radius.
   Deployment-gate item: configure uvicorn `FORWARDED_ALLOW_IPS` for the
   trusted proxy hop — there is **no** `TRUST_PROXY_HEADERS` app setting.
3. **F-3 legacy ungated accounts** (LOW, by design): non-entitlement routes
   accept bare JWTs for never-provisioned accounts. **Deployment gate per
   Captain:** every real Client/Supplier/Provider account must be provisioned
   into the access-control model before production.
4. **A-class test debt** (not a runtime risk): 62 failures / 12 errors / 9
   uncollectable modules all reference pre-existing unrelated issues (stale
   pins, deleted modules) — documented, zero touched by the ownership,
   security, or F-1 work. Includes one pre-existing latent order-flake in
   `test_subscriptions.py::TestMultiplePacks` (leaked session; see F-1 note).
5. **Accepted config items:** JWT TTL, HS256, dev-provision scope in explicit
   development (F-4/F-5).

## 7. Sign-off statement (updated after F-1 fix)

The Nhaav access/subscription/payment/ownership architecture, the security
remediation pass, and the marketplace are verified consistent with the frozen
business rules and the remediated security posture. **F-1 is resolved at the
database level and regression-verified.** Remaining pre-deployment items are
deployment gates, not code: F-2 proxy configuration and the F-3 account-
provisioning cutover.

---

## 8. Deployment gate status

The operational checklist is [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).
Fill in and sign the block below at cutover time.

```text
DEPLOYMENT GATE STATUS
======================

F-1 UTR concurrency:          PASS
F-2 Trusted proxy:            PENDING
F-3 Account provisioning:     PENDING
Database migration:           PENDING
Staging E2E:                  PENDING
Production smoke test:        PENDING

Security remediation:         COMPLETE
Application-code freeze:      ACTIVE

Final deployment decision:
HOLD / PASS / ROLLBACK

Approved by:                  __________
Date:                         __________
Revision:                     __________
```

Once **F-1 = PASS, F-2 = PASS, F-3 = PASS, and staging E2E = PASS**, the
security/access/payment work is **closed** and the project proceeds to
controlled production deployment.
