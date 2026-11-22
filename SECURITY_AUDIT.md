# Nhaav (Nhaav) — Comprehensive Security Audit Report

**Date:** 2026-10-01 · **Mode:** READ-ONLY (no code changed; test runs only)
**Scope:** full stack — `nhaav-backend` (FastAPI/SQLAlchemy/PostgreSQL-or-SQLite), `nhaav-frontend` (React+Vite+TS), deployment config.
**Method:** 6 subsystem audits (backend security / access control / file & document / abuse controls / frontend / deployment) against the 22-area checklist. Every router, service, middleware, schema, and config file was read in full.
**Status baseline:** 344 tests passing before audit; audit ran `test_h10_rate_limit.py` + `test_admin_auth_separation.py` + `test_security_critical.py` + `test_migrations.py` → **51 passed**.

---

## 1. Findings (confirmed)

### HIGH-1 — IDOR: any authenticated user can read any quote by UUID

- **Severity:** HIGH (cross-tenant confidential commercial data disclosure)
- **Location:** [quotes.py:70](nhaav-backend/app/routers/quotes.py#L70) `GET /quotes/{quote_id}` → `QuoteService.get_quote_by_id` at [quote_service.py:132](nhaav-backend/app/services/quote_service.py#L132)
- **Function:** `get_quote` / `QuoteService.get_quote_by_id`
- **Why vulnerable:** The service fetches `Quote.id` and returns it with **no ownership check** — unlike every sibling path (`get_quotes_for_request` checks `client_id`, `update_quote` checks `provider_id`, `accept_quote`/`reject_quote` check request ownership, and `GET /client/quotations/{quote_id}` at [client_procurement.py:90](nhaav-backend/app/routers/client_procurement.py#L90) does verify). Any authenticated user of any role can iterate quote UUIDs and read the full payload: `amount`, `currency`, `payment_terms`, `message`, `scope_of_work`, `travel_charges`, `attachments`, `provider_id`, `request_id`.
- **Attack scenario:** A registered provider (or any user with a valid JWT) scripts `GET /quotes/{uuid}` over candidate UUIDs and harvests competitors' pricing and negotiation messages for requests they never saw — direct commercial espionage between vendors.
- **Recommended fix:** In `get_quote_by_id` (or the router with a `current_user` parameter), allow only: the quote's `provider_id`, the owning client (`ServiceRequest.client_id`), or an admin identity. Prefer 403 (or 404 to avoid existence oracle) for non-owners.
- **Regression test exists:** NO — add one (see §9).

### MEDIUM-1 — Debug `print()` statements leak JWT payloads and user PII to server stdout

- **Severity:** MEDIUM (PII/token data in aggregated logs)
- **Location:** [auth_guard.py:40](nhaav-backend/app/middleware/auth_guard.py#L40), [:44](nhaav-backend/app/middleware/auth_guard.py#L44), [:52](nhaav-backend/app/middleware/auth_guard.py#L52), [:57](nhaav-backend/app/middleware/auth_guard.py#L57)
- **Function:** `get_current_user`
- **Why vulnerable:** `print("PAYLOAD:", payload)` dumps every request's JWT claims (`sub`, `email`, `role`) and `print("DB USER:", user)` prints the full `User.__repr__` (email, role) on **every authenticated request**. On Railway/Hostinger these go to persistent log aggregation. It is also an unconditional hot-path cost. (The email service was deliberately hardened against exactly this class of issue — these prints predate it.)
- **Attack scenario:** Anyone with read access to platform logs (ops staff, a leaked log-ingestion key, support tooling) harvests user emails/roles at scale; log volume is also inflated by design.
- **Recommended fix:** Delete the four prints (the `except` at line 50–53 already converts to a clean 401; if error detail is wanted, use `logger.debug`). Also remove the three prints in [ocr_service.py:38](nhaav-backend/app/services/ocr_service.py#L38), [:99](nhaav-backend/app/services/ocr_service.py#L99), [:102](nhaav-backend/app/services/ocr_service.py#L102) → `logger` (LOW-3, same fix).
- **Regression test exists:** NO — add a contract test (§9).

### MEDIUM-2 — Anonymous callers bypass all rate limits (documented H10 trade-off)

- **Severity:** MEDIUM (bulk scraping of public marketplace data by keyless clients)
- **Location:** [rate_limit.py:57-59](nhaav-backend/app/middleware/rate_limit.py#L57-L59) (`if user is None: return`); all wired endpoints (`/profiles/providers`, `/profiles/suppliers`, `/marketplace/services`, `/marketplace/services/aggregate/{name}` + `/availability`) plus fully-public unthrottled `/requests` and `/requests/{id}`.
- **Why vulnerable:** H10 counts and 429s only *authenticated* users (optional-auth by design, test-pinned). Anonymous scrapers are uncounted and keyless — no IP-based ceiling exists anywhere in the stack.
- **Attack scenario:** A bot with no account paginates `GET /requests?limit=25&page=N` and the marketplace endpoints at full speed, extracting the entire public dataset (this is the residual gap the H10 spec accepted; `GET /requests/` additionally has no page-count limit — the documented gap from H10 §5).
- **Recommended fix (decision needed):** Add a per-IP limiter (e.g. SlowAPI / middleware keyed on `request.client.host` + proxy `X-Forwarded-For` handling) on the public browse endpoints, OR formally accept the risk in the threat model. Either way, keep the authenticated per-user limits untouched.
- **Regression test exists:** PARTIAL — H10 tests pin current behavior; no anonymous-abuse test (deliberate).

### MEDIUM-3 — Public `/requests` responses expose `client_id`, `budget`, `selected_quotation_id`, `attachments`

- **Severity:** MEDIUM (data over-exposure on an unauthenticated endpoint; enables follow-on enumeration)
- **Location:** [requests.py:44](nhaav-backend/app/routers/requests.py#L44) `GET /requests` + [requests.py:75](nhaav-backend/app/routers/requests.py#L75) `GET /requests/{request_id}`; schema [request.py:60-72](nhaav-backend/app/schemas/request.py#L60-L72) `ServiceRequestResponse`
- **Why vulnerable:** Both endpoints are fully public ("so providers can browse"), but the response model returns the internal `client_id` UUID, the buyer's `budget`, the awarded `selected_quotation_id`, and `attachments` for every request. A `client_id` filter query param even lets callers group all requests by buyer.
- **Attack scenario:** A competitor scrapes `/requests`, extracts `client_id` UUIDs, and correlates a buyer's full procurement history; knowing `selected_quotation_id` feeds HIGH-1 (quote UUID guessing becomes targeted).
- **Recommended fix:** Introduce a trimmed public response (drop `client_id`, `selected_quotation_id`, `budget`, `attachments` for anonymous callers; keep the full shape on the owner-scoped `/client/requests/*` endpoints). **Needs product verification** — check whether the public request-detail UI displays budget/attachments before trimming.
- **Regression test exists:** NO.

### MEDIUM-4 — No brute-force / abuse control on authentication endpoints

- **Severity:** MEDIUM
- **Location:** [auth.py:44](nhaav-backend/app/routers/auth.py#L44) `POST /auth/login`, [admin_auth.py:39](nhaav-backend/app/routers/admin_auth.py#L39) `POST /admin/auth/login`, [auth.py:79](nhaav-backend/app/routers/auth.py#L79) `POST /auth/forgot-password`, [auth.py:122](nhaav-backend/app/routers/auth.py#L122) `POST /auth/resend-verification`, [auth.py:24](nhaav-backend/app/routers/auth.py#L24) `POST /auth/register`
- **Why vulnerable:** Unlimited unauthenticated attempts. bcrypt cost (~4.0.1 default) caps per-attempt CPU but not distributed guessing. `forgot-password` and `resend-verification` are enumeration-safe (good) but unthrottled, so they double as mail-bombing primitives against any address.
- **Attack scenario:** Credential stuffing against `/auth/login`; targeted harassment by looping `/auth/forgot-password` on a victim's inbox; admin login spray at `/admin/auth/login`.
- **Recommended fix:** Per-IP + per-account throttling with exponential backoff on login (both apps) and caps on forgot/resend (per IP and per email). Admin login deserves the strictest ceiling.
- **Regression test exists:** NO.

### LOW-1 — Admin JWT lives 24 h despite "short-lived" intent

- **Severity:** LOW (secrets are separate, so blast radius is contained)
- **Location:** [admin_auth.py:57](nhaav-backend/app/routers/admin_auth.py#L57) — `expire = utcnow + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)` (default 1440)
- **Why vulnerable:** The endpoint docstring promises a "short-lived admin JWT" but reuses the user token TTL (24 h). A stolen admin token is valid for a day. `get_current_admin` does re-check `is_active`, which limits persistence.
- **Recommended fix:** Dedicated `ADMIN_JWT_EXPIRE_MINUTES` (30–60), defaulting independently of the user setting.
- **Regression test exists:** NO.

### LOW-2 — Dead legacy `get_current_admin` in `auth_guard.py`

- **Severity:** LOW (defense-in-depth hygiene)
- **Location:** [auth_guard.py:100](nhaav-backend/app/middleware/auth_guard.py#L100) — checks `UserRole.admin` on the *users* table
- **Why vulnerable:** Shadowed dead code — no router imports it (verified by search); real admin endpoints use `app/middleware/admin_auth.py::get_current_admin` on the separate `admin_accounts` table. Role `admin` is unreachable via public registration (`ALLOWED_REGISTRATION_ROLES`), so no live exploit path — but the duplicate invites accidental future reuse of the weak path.
- **Recommended fix:** Delete the function from `auth_guard.py`.
- **Regression test exists:** YES (indirectly — `test_admin_auth_separation.py` pins the real path).

### LOW-3 — Residual `print()`s in OCR service

- **Severity:** LOW · **Location:** [ocr_service.py:38](nhaav-backend/app/services/ocr_service.py#L38), [:99](nhaav-backend/app/services/ocr_service.py#L99), [:102](nhaav-backend/app/services/ocr_service.py#L102)
- **Why vulnerable:** Unstructured stdout logging in a production code path; no secrets/tokens are printed (API key is deliberately excluded, and the HTTP-error branch prints only the status code — good), but it bypasses the structured logger used everywhere else.
- **Recommended fix:** Replace with `logger` calls. **Regression test exists:** NO (cover via the same contract test as MEDIUM-1).

### LOW-4 — Quote/request `attachments` are unsanitized URLs rendered as clickable links

- **Severity:** LOW (setters are semi-trusted: the request owner and quoting providers)
- **Location:** Schema inputs [request.py:23](nhaav-backend/app/schemas/request.py#L23), [quote.py:21](nhaav-backend/app/schemas/quote.py#L21); renderers [JobDetails.tsx:307](nhaav-frontend/src/pages/Dashboard/JobTracking/JobDetails.tsx#L307), [QuotationDetails.tsx:270](nhaav-frontend/src/pages/Dashboard/ProviderDashboard/QuotationDetails.tsx#L270) (`href={att} target="_blank"`)
- **Why vulnerable:** Attachment strings are never scheme-validated. A `javascript:` or `data:text/html` URL planted by a quoting provider executes when the client clicks the attachment link. No dangerous sinks exist anywhere else in the frontend (verified: zero `dangerouslySetInnerHTML`/`innerHTML`/`eval`).
- **Recommended fix:** Validate `http(s):` scheme in the Pydantic schemas (reject others with 422) and guard the two renderers.
- **Regression test exists:** NO.

### LOW-5 — `python-jose` is end-of-life

- **Severity:** LOW
- **Location:** [requirements.txt:9](nhaav-backend/requirements.txt#L9) (`python-jose[cryptography]>=3.3.0`; venv has 3.5.0)
- **Why vulnerable:** python-jose has had no security maintenance since 2024. Current usage is safe (HS256, algorithm explicitly pinned at every `jwt.decode`, no `aud` confusion, asymmetric algorithms unused), so this is future-risk, not an active hole.
- **Recommended fix:** Plan migration to `pyjwt` (drop-in for the operations used); until then, pin `python-jose==3.5.0` exactly to prevent dependency drift. Also add automated vulnerability scanning (pip-audit / npm audit in CI) — none exists today.
- **Regression test exists:** NO (migration + existing 344 tests would cover).

### LOW-6 — Password reset does not invalidate existing JWTs

- **Severity:** LOW
- **Location:** [auth_service.py:196-215](nhaav-backend/app/services/auth_service.py#L196-L215) `reset_password` (sets `password_reset_at`, but access tokens are stateless with 24 h TTL; refresh 7 days)
- **Why vulnerable:** After a takeover victim regains the account via reset, the attacker's already-issued access/refresh tokens keep working until natural expiry. There is no revocation list by design (documented in the frontend logout note).
- **Recommended fix:** Embed `password_reset_at` (or a token-version integer) in JWTs and reject tokens whose `iat` predates the last reset in `get_current_user`/refresh.
- **Regression test exists:** NO.

### INFO — Refresh tokens issued but never used by the SPA

- **Location:** [auth.ts:33](nhaav-frontend/src/services/auth.ts#L33) stores `nhaav_refresh`; no code consumes it (`/auth/refresh` has no frontend caller — verified). Backend still honors `POST /auth/refresh` with a 7-day token ([auth_service.py:118](nhaav-backend/app/services/auth_service.py#L118)).
- **Impact:** Dead credential material in localStorage; the 7-day refresh JWT extends the LOW-6 window if extracted (XSS would expose it). Either implement silent refresh with rotation+reuse-detection or stop issuing it to the browser.

---

## 2. Totals by severity

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| High | 1 | HIGH-1 (quote read IDOR) |
| Medium | 4 | MEDIUM-1 (debug prints), MEDIUM-2 (anonymous scraping), MEDIUM-3 (public response leakage), MEDIUM-4 (no login throttling) |
| Low | 6 | LOW-1..6 |
| Info | 1 | refresh tokens unused |

## 3. Confirmed vs needs-verification

**Confirmed (code-verified, ready to fix):** HIGH-1; MEDIUM-1; MEDIUM-4; LOW-1; LOW-2; LOW-3; LOW-5; LOW-6; INFO.
**Needs verification/decision before fixing:** MEDIUM-2 (accept vs IP-limit — product/threat-model call), MEDIUM-3 (check whether public UI displays budget/attachments before trimming), LOW-4 (confirm attachment UI usage; setters are semi-trusted), LOW-5 (pin-vs-migrate timing).

## 4. Already-protected areas (verified, with test backing)

- **Admin separation:** separate `admin_accounts` table + `ADMIN_JWT_SECRET` + `type="admin"` claim; user tokens get 403 (not 401) on admin routes even if secrets are identical; active-flag checked; every admin action audit-logged to `admin_audit_log` ([admin_auth.py](nhaav-backend/app/middleware/admin_auth.py), [admin_verification.py](nhaav-backend/app/routers/admin_verification.py)). Tests: `test_admin_auth_separation.py`, `test_security_critical.py` (C2 set).
- **Role gating:** `get_current_provider/client` deps on quote submission, request creation; service layer re-verifies role + verification status (`create_quote` requires verified provider with a matching active listing).
- **Ownership/IDOR — protected:** document file GET/DELETE (owner-scoped, tested), document verify/reject & profile verify (admin-only, tested), requests update/delete + status state machine, jobs (client-or-provider only, tested via e2e), notifications (user-scoped at service layer), services listings (owner-scoped), `/client/requests/{id}` + quotations + comparison (ownership-checked), `GET /quotes/request/{id}` (owner-checked), reviews (only completed job's client, one per job).
- **Registration hardening:** `ALLOWED_REGISTRATION_ROLES` blocks admin/supplier self-registration (schema + service double-check); enumeration-safe forgot/resend responses.
- **Documents/files (Audit 3):** server-generated storage keys (original filename never used as path), extension whitelist + magic-byte sniffing, 25 MB cap, key-safety check rejecting traversal/absolute paths, atomic writes, orphan cleanup, private-only serving (owner route + admin route, never static), `Content-Disposition` filename sanitized to alphanumerics. Tests: `test_storage_h3.py`, `test_h9_upload_contract.py`.
- **SQL injection:** SQLAlchemy ORM parameterized everywhere; no raw SQL found. `ilike` filters use parameter binding.
- **XSS:** zero dangerous DOM sinks in `nhaav-frontend/src`; React escaping intact; redirect params `encodeURIComponent`-ed ([Login/index.tsx:21-23](nhaav-frontend/src/pages/Login/index.tsx#L21-L23)).
- **CSRF:** pure Bearer-token API (no cookie auth, no form posts) — CORS misconfig is the only relevant vector, and it is locked (exact-origin allowlist, `*` + missing production config fail-fast at startup, `allow_credentials=True` guarded).
- **CORS:** [main.py:39-63](nhaav-backend/app/main.py#L39-L63) — dev-only fallback origins; refuses `*`; refuses to boot in production without explicit `CORS_ORIGINS`.
- **Secrets/config (Audit 6):** all secrets env-only; `.env` and `*.db` git-ignored and untracked; production fail-fasts on missing SMTP/S3/Gemini/CORS config; email backend never logs tokens (sanitized single-line dev log, log-injection guard); Gemini HTTP-error logging prints status code only (key never in logs).
- **H10 rate limiting (Audit 4):** DB-backed sliding-window per user; identity always from the verified JWT (never client input); fail-open logged; 429 with stable JSON code + `Retry-After`; **no limit names/values leak into client JS** (H9 reference check clean).
- **Frontend token handling (Audit 5):** user and admin tokens in separate localStorage keys + separate axios instances; 401 interceptor clears storage; no tokens in URLs; API base URL single-sourced.
- **Deployment:** Dockerfile non-root, no baked secrets, OCR runtime preflight fails fast in production, schema only via Alembic.

## 5. Remaining gaps (accepted/known)

1. Anonymous (keyless) scraping ceiling — MEDIUM-2, needs a decision.
2. `GET /requests/` public browse has page-size cap but no count cap for anonymous walkers (H10 documented gap).
3. No JWT revocation/session table (stateless design) — mitigated partially by LOW-6 fix; revisit if "log out everywhere" becomes a requirement.
4. No automated dependency-vulnerability scanning in CI (backend or frontend).
5. No security headers/CSP configured for the frontend host (Vercel) — recommend adding CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS at the host level.
6. `DATA_DOWNLOAD_LIMIT` category remains unwired by design (no bulk download endpoint exists) — re-wire the day an export endpoint is added (documented in [rate_limit.py:65-70](nhaav-backend/app/middleware/rate_limit.py#L65-L70)).

## 6. H10 regression verification (explicit check requested)

**No regressions found.** Evidence:
- Ran `test_h10_rate_limit.py` (14), `test_admin_auth_separation.py`, `test_security_critical.py`, `test_migrations.py` → **51 passed** on current HEAD.
- **Authorization:** the limiter resolves identity *after* JWT verification and only *adds* a check — it cannot grant access; public routes keep their no-auth contract (optional auth returns silently for anonymous/invalid tokens — pinned by tests; the earlier 401 regression on public routes was caught and fixed during H10 development and is covered by the current suite).
- **Availability:** fail-open on counter-store errors; limits apply only to authenticated users on 7 search/detail routes; document file routes, admin queue, OCR, and the procurement flow were deliberately left unlimited (single-record/owner-scoped or privileged paths) — re-confirmed correct in this audit.
- **Public routes:** all previously-public endpoints (`/requests`, `/marketplace/*`, `/profiles/providers`, `/profiles/{id}` via optional auth, `/reviews/provider/{id}`) remain publicly reachable with identical contracts.

## 7. Recommended remediation order (post-review)

1. **HIGH-1** quote ownership check (+ IDOR regression tests). Smallest diff, highest risk removed.
2. **MEDIUM-1 + LOW-3** delete all debug prints (+ print-ban contract test).
3. **MEDIUM-3** trim public `/requests` responses (after product confirms budget/attachment display).
4. **MEDIUM-4** login/forgot/resend throttling (per-IP + per-account; strictest for admin).
5. **LOW-1** admin token TTL; **LOW-2** delete dead `get_current_admin`; **LOW-4** attachment scheme validation; **LOW-5** pin jose / plan pyjwt; **LOW-6** token invalidation on reset.
6. Full regression battery (344+ tests) after fixes — then proceed to UI colors → UI regression → payment-gated bank-transfer stage → payment security audit, per the agreed sequence.

## 8. Suggested regression tests to add

1. `test_quotes_idor.py` — provider B `GET /quotes/{A's quote}` → 403 (or 404); unrelated client → 403; owner client/provider → 200. Cover the legacy `PUT /quotes/{id}` route and the `/client/quotations/{id}` route for parity.
2. `test_auth_guard_no_stdout.py` — contract test asserting no `print(` exists under `app/middleware/` and `app/services/ocr_service.py` (same grep-style pattern as the H9 imagery bans).
3. `test_public_requests_shape.py` — anonymous `GET /requests/{id}` response must not contain `client_id` / `selected_quotation_id` / `budget`.
4. `test_login_throttle.py` — N+1 failed logins → 429 (after MEDIUM-4 fix).
5. `test_admin_token_ttl.py` — decode admin JWT `exp − iat` ≤ configured admin TTL.
6. `test_attachment_scheme.py` — `POST /quotes/` with `attachments: ["javascript:alert(1)"]` → 422.

---

*Audit performed by Buffy (Codebuff) inside the workspace; findings intentionally not fixed pending external reviewer validation, per the agreed "audit first" rule.*
