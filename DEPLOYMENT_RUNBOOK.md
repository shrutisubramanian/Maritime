# Nhaav / Nhaav — Production Deployment Runbook

**Status:** Final security remediation complete
**F-1:** Resolved
**F-2:** Deployment configuration gate
**F-3:** Production provisioning gate
**Owner:** Deployment / Project Team
**Environment:** Staging → Production

Companion documents: [SECURITY_SIGNOFF_REPORT.md](SECURITY_SIGNOFF_REPORT.md) (why the system is safe — verdict and residual risks), [SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md) (finding → fix → test record), [ACCESS_OWNERSHIP_MODEL.md](ACCESS_OWNERSHIP_MODEL.md) (frozen access rules). The older [DEPLOY_SECURITY_GATE.md](DEPLOY_SECURITY_GATE.md) predates the F-1 fix (head `f9a0b1c2d3e4`, 379 passed); where it disagrees with this runbook, this runbook wins.

---

## 0. Release Freeze

**Objective:** Confirm that the security implementation being deployed is exactly the signed-off revision.

- [ ] F-1 UTR concurrency fix is merged/deployed.
- [ ] No additional application-code changes after F-1.
- [ ] Security sign-off report updated with F-1 resolution.
- [ ] Focused battery: **186/186 passed**.
- [ ] F-1 concurrency tests: **6/6 passed**.
- [ ] TypeScript: **PASS**.
- [ ] Vite build: **PASS**.
- [ ] Alembic upgrade/down/up: **PASS**.
- [ ] Alembic head confirmed: `a0b1c2d3e4f5`.
- [ ] Git/deployment revision recorded.

**Gate:** ☐ PASS / ☐ FAIL

---

## 1. Production Environment Configuration

Before touching production data, verify the deployment environment.

### Required

- [ ] `ENVIRONMENT=production`
- [ ] Production database configured.
- [ ] Production `JWT_SECRET` configured.
- [ ] Production `ADMIN_JWT_SECRET` configured.
- [ ] JWT secrets are distinct.
- [ ] `CORS_ORIGINS` contains only intended production frontend origin(s).
- [ ] No development provisioning override is enabled.
- [ ] No test/demo payment configuration is enabled.
- [ ] Production API documentation remains disabled.
- [ ] Current signed-off application revision is deployed.

### Explicitly verify

```text
ENVIRONMENT != development
ENVIRONMENT != staging
```

and:

```text
SEED_DEMO_ALLOW_PRODUCTION
```

must **not** be enabled.

**Gate:** ☐ PASS / ☐ FAIL

---

## 2. F-2 — Trusted Proxy Verification

**Purpose:** Ensure rate limiting sees the real client IP and that trusting forwarded headers is safe.

Do **not** widen proxy-header trust without confirming the actual topology.
`TRUST_PROXY_HEADERS` exists in the application and defaults to **false**. Only
set it to `true` when the backend is reachable exclusively through a proxy that
overwrites `X-Real-IP`/`X-Forwarded-For`; otherwise rotating those headers would
bypass per-IP limits. Optionally set `TRUSTED_PROXIES` to the proxy IPs/CIDRs.

### 2.1 Verify topology

Document:

```text
Client
  ↓
Railway / trusted reverse proxy
  ↓
Nhaav backend
```

- [ ] Production traffic actually passes through the expected trusted proxy.
- [ ] Proxy forwards the real client IP.
- [ ] Backend receives the expected forwarding header.
- [ ] Application is not directly exposed through an untrusted intermediary.

### 2.2 Configure proxy handling

The rate limiter resolves the source IP through
`app/services/rate_limit_service.py::client_ip`. With
`TRUST_PROXY_HEADERS=false` (the default) it uses the TCP peer only, so forged
forwarded headers cannot rotate buckets. With `TRUST_PROXY_HEADERS=true` it
accepts a validated IP from `X-Real-IP` or the first `X-Forwarded-For` hop; if
`TRUSTED_PROXIES` is set, the direct peer must be in that allowlist first.

Pick exactly one, based on the real topology:

- Trusted proxy confirmed → set `TRUST_PROXY_HEADERS=true` and, where possible,
  `TRUSTED_PROXIES=<proxy IP/CIDR>`.
- Topology **cannot** be confirmed → leave `TRUST_PROXY_HEADERS=false`.
  All clients behind the proxy share one bucket, but no forged header can
  bypass a limit.

- [ ] Correct mode chosen for the actual topology.
- [ ] Deployment restarted/redeployed.
- [ ] Proxy hop / egress address confirmed from the running deployment.

### 2.3 Functional verification

From two distinct client IPs:

- [ ] Requests from client A resolve to client A's peer identity.
- [ ] Requests from client B resolve separately.
- [ ] Forged `X-Forwarded-For` does **not** allow arbitrary bucket rotation.
- [ ] Rate-limit behavior remains correct.
- [ ] `429` includes the expected `Retry-After`.

**F-2 Gate:** ☐ PASS / ☐ FAIL

**Evidence:**
`________________________________________`

---

## 3. F-3 — Production Account Provisioning

This is the most important commercial cutover gate.

Every real commercially gated account must be inside the new account-level access-control model.

### 3.1 Account inventory

Obtain the production list of:

- [ ] Clients
- [ ] Suppliers
- [ ] Service Providers
- [ ] Administrators

Record the total:

```text
Clients:           ______
Suppliers:         ______
Service Providers: ______
Admins:            ______
```

### 3.2 Commercial accounts

For **every Client/Supplier/Service Provider**:

- [ ] `access_control_enabled = TRUE`
- [ ] Correct account identity exists.
- [ ] Subscription/plan state is correct.
- [ ] Entitlement ownership is account-level.
- [ ] No account unintentionally relies on legacy ungated behavior.

### 3.3 Entitlement verification

For accounts that should already have access:

- [ ] Appropriate subscription exists.
- [ ] Appropriate access pack exists.
- [ ] `owner_user_id` points to the correct account.
- [ ] Legacy `NULL owner_user_id` packs are not accidentally granting access.
- [ ] No pack is accidentally assigned to another account.

### 3.4 Legacy NULL-owner check

Run an explicit audit:

```text
NULL-owner packs:               ________
NULL-owner active entitlements: ________
```

Expected:

> Legacy NULL-owner packs remain inert and do not grant access.

**F-3 Gate:** ☐ PASS / ☐ FAIL

**Evidence:**
`________________________________________`

---

## 4. Database Migration Gate

Before production traffic:

- [ ] Database backup/snapshot completed.
- [ ] Current Alembic revision recorded.
- [ ] Migration `a0b1c2d3e4f5` applied.
- [ ] `ux_payments_live_utr` exists.
- [ ] Partial predicate confirmed:

```sql
status IN ('PENDING', 'SUBMITTED', 'VERIFIED')
```

- [ ] No unexpected duplicate live UTRs exist.
- [ ] Migration completed without errors.

**Gate:** ☐ PASS / ☐ FAIL

---

## 5. Staging End-to-End Access Test

Run this **before production cutover** using staging accounts.

### 5.1 New account with no entitlement

- [ ] Login succeeds as identity/authentication where appropriate.
- [ ] Account cannot access gated functionality without entitlement.
- [ ] User is directed to subscription/payment flow.
- [ ] No access pass is fabricated.

**Result:** ☐ PASS / ☐ FAIL

### 5.2 Payment submission

Submit:

```text
Plan:              __________
Amount:            __________
UTR:               __________
Payment date:      __________
Receipt:           __________
```

Verify:

- [ ] Payment created.
- [ ] Correct account owns payment.
- [ ] Receipt is associated correctly.
- [ ] Payment appears in account payment history.
- [ ] Admin can review it.

**Result:** ☐ PASS / ☐ FAIL

---

## 6. F-1 UTR Regression

### Sequential duplicate

Submit the same UTR twice.

Expected:

```text
First submission → accepted
Second submission → 409
```

- [ ] PASS

### Concurrent duplicate

Two simultaneous submissions using identical UTR.

Expected:

```text
Request A → accepted
Request B → safe 409
Live rows → exactly 1
```

- [ ] PASS

### Rejected/cancelled reuse

- [ ] UTR from a REJECTED/CANCELLED payment can follow the intended correction/resubmission flow.
- [ ] No unintended uniqueness block.

**Gate:** ☐ PASS / ☐ FAIL

---

## 7. Payment Verification → Access Pack

Admin verifies the staging payment.

Verify:

- [ ] Payment becomes verified.
- [ ] Correct account receives the entitlement.
- [ ] Correct number of passes becomes available.
- [ ] No other account receives the passes.
- [ ] Payment history remains correct.

**Result:** ☐ PASS / ☐ FAIL

---

## 8. Six-Hour Session Test

Login using an account with an available pass.

Verify:

- [ ] Exactly one pass becomes active.
- [ ] `activated_at` is recorded.
- [ ] Six-hour expiry is recorded.
- [ ] Frontend countdown appears.
- [ ] Backend remains authoritative.
- [ ] Repeated login does **not** allocate a second active pass.
- [ ] Repeated login does **not** reset the six-hour timer.

**Result:** ☐ PASS / ☐ FAIL

---

## 9. Logout Consumption Test

While a pass is active:

- [ ] Logout.
- [ ] Active pass is consumed.
- [ ] Pass is not reusable.
- [ ] Next login uses the next available pass.
- [ ] No second active pass exists.

**Result:** ☐ PASS / ☐ FAIL

---

## 10. 40-Day Unused Pass Test

Verify the entitlement lifecycle.

Expected:

```text
Pack issued
    ↓
Pass available
    ↓
40-day unused window
    ↓
Unused pass expires
```

- [ ] `unused_expires_at` is based on issuance/availability.
- [ ] Unused pass does not remain available after expiry.
- [ ] A different pack's pass retains its own independent window.
- [ ] Multiple packs can coexist.
- [ ] Purchasing another pack does not modify the first pack.

**Result:** ☐ PASS / ☐ FAIL

---

## 11. Role Parity Test

Repeat the core entitlement flow for:

- [ ] Client — PASS
- [ ] Supplier — PASS
- [ ] Service Provider — PASS

Expected:

> All three use the same account-level access model.

**Gate:** ☐ PASS / ☐ FAIL

---

## 12. Marketplace Access Test

### Logged out

Verify only permitted basic marketplace information is exposed.

- [ ] No private contact/KYC information exposed.
- [ ] Pagination works.
- [ ] Access restrictions work.

### Entitled account

- [ ] Full permitted supplier/service-provider information available.
- [ ] Contact details available where intended.
- [ ] No cross-account entitlement leakage.
- [ ] No bulk/private KYC exposure.

**Gate:** ☐ PASS / ☐ FAIL

---

## 13. Admin Verification Test

Verify that admin operations remain isolated.

- [ ] Admin login works.
- [ ] Admin session is separate from normal user JWT.
- [ ] Payment verification works.
- [ ] Subscription/access changes require appropriate admin authority.
- [ ] Audit logging works where applicable.
- [ ] Normal users cannot invoke admin operations.

**Gate:** ☐ PASS / ☐ FAIL

---

## 14. Production Cutover

Only proceed if all previous gates are PASS.

### Final pre-cutover checklist

- [ ] F-1 PASS
- [ ] F-2 PASS
- [ ] F-3 PASS
- [ ] Database migration PASS
- [ ] Staging E2E PASS
- [ ] Production backup PASS
- [ ] Production environment variables verified
- [ ] Production admin account verified
- [ ] Production user provisioning verified
- [ ] Current signed-off revision deployed

**CUTOVER AUTHORIZATION:**

```text
Approved by: __________________________

Date: _________________________________

Revision: _____________________________

Production DB revision: ______________

Signature/approval: ___________________
```

---

## 15. Post-Deployment Smoke Test

Immediately after deployment:

- [ ] Health endpoint responds.
- [ ] User login works.
- [ ] Admin login works.
- [ ] Subscription page loads.
- [ ] Payment submission works.
- [ ] Marketplace loads.
- [ ] Gated access works.
- [ ] Logout consumes the active pass.
- [ ] No unexpected `401/403/429/5xx`.
- [ ] Application logs contain no new authentication/payment errors.

**Post-deployment result:** ☐ PASS / ☐ ROLLBACK

---

## 16. Rollback Trigger

Rollback/escalate if any of the following occur:

- Payment submission fails unexpectedly.
- Duplicate live UTRs can be created.
- Cross-account payment/access data becomes visible.
- An account receives another account's entitlement.
- Active pass can be duplicated or reset.
- Gated production account bypasses entitlement.
- Admin authorization fails.
- Database migration is inconsistent.
- Unexpected production `5xx` errors appear in the payment/access path.

Do **not** roll back merely because the legacy full test suite still contains its documented A-class test debt unless that debt manifests as a production runtime issue.

---

## Final Release Record

Mirror this into the tail of [SECURITY_SIGNOFF_REPORT.md](SECURITY_SIGNOFF_REPORT.md) when the gates are signed:

```text
DEPLOYMENT GATE STATUS
======================

F-1 UTR concurrency:          PASS
F-2 Trusted proxy:            PASS / PENDING
F-3 Account provisioning:      PASS / PENDING
Database migration:            PASS / PENDING
Staging E2E:                   PASS / PENDING
Production smoke test:         PASS / PENDING

Security remediation:          COMPLETE
Application-code freeze:       ACTIVE

Final deployment decision:
PASS / HOLD / ROLLBACK

Approved by:                   __________
Date:                          __________
Revision:                      __________
```

Once **F-1 = PASS, F-2 = PASS, F-3 = PASS, and staging E2E = PASS**, the security/access/payment work is **closed**, and the project moves from engineering remediation to controlled production deployment.
