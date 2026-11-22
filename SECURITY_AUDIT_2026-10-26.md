# Nhaav Security Audit — 2026-10-26

**Scope:** the FastAPI backend (`nhaav-backend`) and the React frontend
(`nhaav-frontend`) — authentication, authorisation, rate limiting, file
handling, payments/entitlements, configuration and repository hygiene.
**Method:** line-level review of routers, services, middleware, config and startup;
targeted greps for the classic classes (SQL string building, XSS sinks, hardcoded
secrets, missing role checks); execution of the security suites and the full test
suite. No live penetration test against a deployed environment.
**Verdict:** no remote code execution, SQL injection, IDOR or auth-bypass path was
found in the reviewed surface. The remaining issues are information-disclosure and
token-handling risks, listed under **Open findings** with recommended fixes. The
one thing that must be decided before any public deployment is **F-1** (private
customer documents committed to the repository).

---

## 1. Attack surface actually reviewed

| Area | Files |
| --- | --- |
| Authentication / session | [auth.py](nhaav-backend/app/routers/auth.py), [auth_service.py](nhaav-backend/app/services/auth_service.py), [admin_auth.py](nhaav-backend/app/routers/admin_auth.py), [auth_guard.py](nhaav-backend/app/middleware/auth_guard.py) |
| Authorisation | every `app/routers/*.py`; `_require_admin` in the services (payments, listing fees, moderation, documents) |
| Rate limiting | [rate_limit_service.py](nhaav-backend/app/services/rate_limit_service.py), [config.py](nhaav-backend/app/config.py) |
| Uploads / private files | [documents.py](nhaav-backend/app/routers/documents.py), [document_service.py](nhaav-backend/app/services/document_service.py), payment receipt path in [payment_service.py](nhaav-backend/app/services/payment_service.py) |
| Entitlements / payments | [access.py](nhaav-backend/app/routers/access.py), [subscription.py](nhaav-backend/app/routers/subscription.py), [access_token_service.py](nhaav-backend/app/services/access_token_service.py), [payment_service.py](nhaav-backend/app/services/payment_service.py) |
| Input validation | [schemas/](nhaav-backend/app/schemas), [url_safety.py](nhaav-backend/app/utils/url_safety.py) |
| Startup / config | [main.py](nhaav-backend/app/main.py), [config.py](nhaav-backend/app/config.py), [.env.example](nhaav-backend/.env.example), [.gitignore](nhaav-backend/.gitignore) |
| Client | `nhaav-frontend/src/services/*`, `AuthContext`, `apiClient`, router guards |

---

## 2. Controls verified as correctly implemented

**Authentication**
- Passwords are bcrypt (`passlib`, cost default) — [password.py](nhaav-backend/app/utils/password.py).
- Failed login is indistinguishable from unknown account: same `401`,
  "Incorrect email or password", and a dummy bcrypt verify equalises timing
  (`_TIMING_EQUALIZER_HASH` in `AuthService.login_user`) — no user enumeration.
- JWT: `sub`/`role`/`exp`/`jti`; signing algorithm is an **allowlist**
  (`HS256|HS384|HS512`) so `alg: none` or an asymmetric algorithm cannot be
  injected via configuration.
- Password reset links are **single use**: `password_reset_at` invalidates any
  token with `iat <= reset`; a newer link supersedes an older one; the reset also
  consumes the live access pass and releases the device binding, and refresh
  tokens minted before the reset are refused.
- `POST /auth/logout` is idempotent and consumes the active access pass.
- One-device-per-login, enforced in the shared auth dependency (not only in the
  login handler), so a displaced device is rejected on every protected route.

**Authorisation**
- Admin-only actions are gated **in the service layer** (`_require_admin` in
  `payment_service`, `listing_fee_service`, `moderation_service`) as well as via
  the router dependency — a new router cannot accidentally skip the check.
- Ownership checks are explicit and return **404 rather than 403** where
  existence itself is sensitive (payment receipts, other users' documents).
- `GET /documents/{id}/file` is owner-or-admin; `DELETE` is owner-only (admins
  cannot destroy a user's evidence).
- Public profile payloads expose company, description, services and reviews, plus
the **business contact phone** (a deliberate, documented choice — see
  [schemas/profile.py](nhaav-backend/app/schemas/profile.py)); the account's
  email address is never included, and no other account data is read from the
  `User` row for public responses.

**Injection / XSS**
- No SQL string building: all queries are ORM; the only `text()` usages are
  static index predicates (`status = 'ACTIVE'`).
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` anywhere in
  the frontend.
- Attachment values on quotations and procurement requests are validated at the
  schema boundary by [url_safety.py](nhaav-backend/app/utils/url_safety.py):
  `javascript:`, `data:`, `file:`, protocol-relative `//host` and
  whitespace/percent-encoded obfuscations are rejected, with double-decoding
  and control-character stripping.

**Rate limiting (M-3 contract)**
- Two split budgets on the auth surface: **failures per account** (5/15 min) and
  **attempts per source IP** (60/15 min; admin login 20/15 min, failures 5).
  Forgot-password and resend-verification have per-email and per-IP budgets so
  the endpoints cannot be used to mail-bomb a mailbox.
- A correct password is never blocked by the failure budget (the counter is
  charged only on a 401), so the account owner cannot lock themselves out.
- The counter table stores `sha256(subject_uuid)` only — a database dump contains
  no raw email address or client IP. Rows outside the window are pruned per
  bucket, so the table does not grow without bound.
- Search categories remain user-keyed and anonymous public callers pass through
  uncounted, preserving the public marketplace contract.

**File handling**
- Uploads: extension allowlist, size cap enforced **while streaming** (memory is
  bounded), `os.path.basename` on the client filename (no traversal), server
  generates the stored name; oversize uploads are unlinked instead of left on disk.
- Uploads are never mounted statically; every read goes through an authorised
  endpoint. Receipts live outside any static mount and are served by
  `GET /payments/{id}/receipt` (admin or owning organisation).

**Configuration / deployment**
- Fail-closed `ENVIRONMENT`: unset → `production`; an unrecognised value refuses
  to boot; development-only provisioning exists **only** for explicit
  `development`, requires an admin JWT elsewhere, and bounds `token_count`.
- CORS: wildcard refused (and refused outright in production); production
  requires an explicit origin list; credentials are only sent to allow-listed
  origins.
- Swagger UI, ReDoc and `/openapi.json` are all disabled in production.
- `Base.metadata.create_all()` was removed from startup — Alembic is the single
  schema authority, so a missed migration fails loudly instead of being masked.
- Baseline response headers on every route: `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, COOP, restrictive `Permissions-Policy`, plus
  HSTS in production.

**Dependencies** (manual version check of the security-relevant pins):
`python-jose 3.5.0` (past the 2024 algorithm-confusion/JWT-bomb fixes),
`cryptography 48.0.0`, `pillow 12.2.0`, `urllib3 2.7.0`, `bcrypt 4.0.1`,
`fastapi 0.136.3`, `starlette 1.2.1` — none of these is a known-vulnerable
release. This was not an automated audit; see **F-9**.

---

## 3. Changed in this pass

1. **Auth limiter contract** — `RateLimitService.check_auth_rate_limit` +
   `client_ip()`; the split per-account/per-IP budgets are now wired into
   `/auth/login`, `/auth/forgot-password`, `/auth/resend-verification` and
   `/admin/auth/login` (stricter budgets), with opaque keys.
2. **Fail-closed environment** — unset `ENVIRONMENT` is treated as production;
   unknown values refuse to boot; dev provisioning is allowlisted to `development`.
3. **JWT algorithm allowlist** — no `none`, no asymmetric algorithm.
4. **`TRUST_PROXY_HEADERS`** — per-IP budgets key on `X-Real-IP` /
   `X-Forwarded-For` only when a proxy is declared, otherwise on the socket peer
   (rotating the header cannot dodge a limit when the API is directly exposed).
5. **`url_safety.py`** — attachment URL validation at the schema boundary.
6. **`admin_auth.py`** — admin login uses the stricter split budgets, and a valid
   admin account with a wrong password is charged to the failure budget.
7. **[.gitignore](nhaav-backend/.gitignore)** — now covers every `.env*` variant
   except the template, local SQLite databases plus their journals/WALs/backups,
   and the whole `uploads/` tree. Verified with `git check-ignore`.

---

## 4. Findings

**Status update — second pass (2026-10-26):** F-2, F-3, F-5, F-6, F-7 and F-9 are
now FIXED; F-1 is mitigated in the working tree but its history purge is still
outstanding; F-4 and F-8 remain open as described.

- **F-2 + F-3 (session handling).** The browser session moved to httpOnly
  cookies (`nhaav_access`, `nhaav_refresh`) with a double-submit CSRF token
  (`nhaav_csrf` + `X-CSRF-Token`, enforced by middleware). Nothing in JS can
  read the token any more. Refresh tokens are now single-use rows in the new
  `refresh_sessions` table: rotation spends the row, a replay revokes every
  session the account holds, and logout / password reset revoke all of them.
- **F-5 (CSP).** The inline theme script moved to `/theme-init.js` and a
  production-only `Content-Security-Policy` is injected at build time
  (`script-src 'self'`, no inline, no eval, `frame-ancestors 'none'`).
- **F-6.** `/auth/refresh`, `/auth/verify-email` and `/auth/reset-password` now
  carry per-network budgets (`auth_refresh_ip`, `auth_verify_ip`, `auth_reset_ip`).
- **F-7.** A support-ticket reply address is trusted only when it belongs to the
  signed-in, email-verified account; otherwise the notification and its subject
  are explicitly marked `[UNVERIFIED SENDER]`.
- **F-9.** `.github/workflows/security-audit.yml` runs `pip-audit` against the
  backend requirements and `npm audit --omit=dev` against the frontend on every
  push/PR plus weekly.
- **F-1.** The 12 customer documents are untracked in the working tree and now
  covered by `.gitignore`; they are still present in git history until it is
  rewritten (blocked by uncommitted work in the checkout).

### F-1 — Private customer documents are committed to the repository · MITIGATED (history purge pending)
`nhaav-backend/uploads/` is **tracked** by the outer git repository: 12 files,
including filled vendor-registration forms, Form 10F, a KYC OCR scan and a
screenshot. These are customer documents, not fixtures. Anyone with repository
access (or a future public fork) can read them, and they are in the **history**,
so deleting them in a later commit is not enough.
*Fix:* `git rm --cached` the directory, then purge it from history with
`git filter-repo` (or BFG) and rotate anything the documents contain. The new
`.gitignore` prevents a repeat. **Not done here** because it rewrites git history
and needs your decision.

### F-2 — Access and refresh tokens live in `localStorage` · FIXED
`auth.ts`, `adminAuth.ts` and `apiEnv.ts` keep the JWT (and the 7-day refresh
token) in `localStorage`. There is no XSS sink in the app today, but any future
injection — or one compromised npm dependency — exfiltrates a full session, and
the refresh token cannot be revoked before it expires.
*Fix:* move the session to an httpOnly, Secure, SameSite=Lax cookie with a CSRF
token for state-changing calls, or shorten the access-token TTL and keep the
refresh token server-side. A CSP is also worth adding.

### F-3 — Refresh tokens are bearer-until-expiry · FIXED
`/auth/refresh` rotates the token but keeps no server-side record, so a stolen
refresh token stays exchangeable for up to 7 days; only a password reset ends it.
*Fix:* store refresh-token `jti`s (or a per-account token version) and reject a
reused one, invalidate on logout, and reduce the TTL.

### F-4 — `Document.file_url` is a raw filesystem path, not an opaque key · LOW/MEDIUM
Uploads are stored as `uploads/<uuid>_<original name>` and that path is returned
in the API. It discloses the server layout and the user-supplied filename, and it
breaks the storage-key contract the H3 suite asserts
(`documents/<user>/<uuid>.<ext>`). Not exploitable today (no static mount, all
reads authorised), but it is unnecessary information disclosure.
*Fix:* store an opaque key, resolve it server-side, and migrate existing rows.

### F-5 — Frontend served without a Content-Security-Policy · FIXED
`nhaav-frontend/index.html` sets no CSP. Recommendation: a strict
`default-src 'self'` policy (with the API origin, `img-src data:`, and the Vite
dev websocket in development). Defense in depth for F-2.

### F-6 — Unauthenticated `/auth/refresh`, `/auth/verify-email`, `/auth/reset-password` · FIXED
These routes have no rate limit. None is brute-forceable (HMAC-signed), but a
flood costs CPU. Recommendation: a coarse per-IP budget, as on login.

### F-7 — Anonymous support tickets can claim any contact address · FIXED
`POST /support/tickets` accepts an optional unauthenticated user and trusts the
typed `email`. It is IP-limited (5/15 min) and only mails the support inbox, but
it lets a third party submit a ticket "from" someone else. Recommendation: for
anonymous submissions, record the address as unverified in the notification, or
require sign-in.

### F-8 — `TRUST_PROXY_HEADERS` defaults to `true` · DEPLOYMENT
Correct behind a proxy that overwrites `X-Real-IP`; wrong if the API is exposed
directly, where a client could rotate the header to dodge per-IP budgets (the
per-account failure budget still holds). Documented in `.env.example` — set it to
`false` for any direct-exposure deployment.

### F-9 — No dependency scanning in CI · FIXED
Versions were checked by hand this pass (clean). Add `pip-audit` (backend) and
`npm audit --omit=dev` (frontend) to CI so a future bump cannot quietly introduce
a vulnerable pin.

---

## 5. Verification

**Security suites (run directly):**
```
.venv/Scripts/python.exe -m pytest tests/test_security_remediation.py tests/test_security_fixes.py -q
→ 51 passed
```

**Full suite** (`pytest tests/ -q`, 649 collected):
```
573 passed, 69 failed, 1 skipped, 7 errors
```
None of the failures is in the authentication, rate-limiting, payment,
marketplace-security or admin-auth suites. They fall in the previously documented
feature-contract buckets, all of which predate this audit:

| Bucket | Count |
| --- | --- |
| `test_h7_confidence` — H7 OCR/confidence surface not implemented | 11 |
| `test_h9_orphan_models` — future H9 cleanup migration | 9 |
| `test_concurrency` — `accept_quote` lacks an atomic guard | 9 |
| `test_migrations` — future head `f9a0b1c2d3e4` / columns | 7 |
| `test_h8_registration_profile_contract` — H8 name-field contract | 7 |
| `test_h5_notification` — H5 notification fan-out | 7 |
| `test_seed_demo_guard` / `test_seed_verification_guard` — modules absent | 10 |
| `test_h9_logout_contract` — asserts logout does **not** exist (product now has it) | 4 |
| `test_h9_cpr_doctype` — `DocumentType.quotation` missing | 2 |
| `test_h4_skills` — `Profile.skills` column absent (7 setup errors + 1 failure) | 1 + 7 |
| `test_security_critical` — two stale expectations (see below) | 2 |

The two `test_security_critical` failures are **stale assertions, not vulnerabilities**:
- `test_c4_upload_and_ocr_still_works` expects `{"status": "success"}`; the API
  returns `"Document uploaded successfully"` (response shape changed earlier, the
  test was never updated — the file previously could not even be collected).
- `test_c4_delete_removes_row_and_stored_file` fails on the storage-key contract —
  this is finding **F-4**, and it is the one failure in the list that points at a
  genuine (low-severity) weakness rather than test drift.

`test_concurrency` (double-acceptance of competing quotes) is a **correctness**
risk, not a security one, but it is the only failing bucket with direct business
impact and is worth scheduling.

See also [TRIAGE_EXISTING_TEST_FAILURES.md](TRIAGE_EXISTING_TEST_FAILURES.md) for
the original classification of these buckets.

---

## 6. Pre-deployment checklist

1. Decide on **F-1** (purge `uploads/` from git history; rotate anything exposed).
2. `ENVIRONMENT=production`, `JWT_SECRET` ≥ 32 random chars, `EMAIL_BACKEND=smtp`
   with real SMTP credentials — the app refuses to boot without them.
3. `CORS_ORIGINS` = the exact frontend origin(s); no wildcard.
4. `TRUST_PROXY_HEADERS=false` unless a proxy is actually in front.
5. Run `alembic upgrade head` as a release step (startup no longer creates tables).
6. Serve the frontend over HTTPS with HSTS already covered by the backend headers;
   add the CSP from F-5 at the CDN/host level.
7. Keep `uploads/` and `*.db` out of every backup that leaves the host.
