# Security Fix Pass — Implementation Report

**Companion to:** [SECURITY_AUDIT.md](SECURITY_AUDIT.md) (the read-only audit)
**Scope approved by the Captain + external reviewer:** HIGH-1, MEDIUM-1, MEDIUM-4, attachment-URL hardening.
**Explicitly NOT touched:** UI, payment, marketplace product behavior, public `/requests` access policy (MEDIUM-2), `/requests` field exposure (MEDIUM-3), JWT architecture, database schema.

**Verification:** backend suite **363 passed** (344 existing + 19 new), `tsc --noEmit` clean, `npm run build` clean, H9 reference check unchanged (only the known `vite-env.d.ts` false positive). No migration added — the auth limiter reuses the existing `rate_limit_events` table.

---

## 1. HIGH-1 — Quote IDOR closed ✅

**Was:** `GET /quotes/{quote_id}` returned any quote by UUID to any authenticated user — no ownership check (all sibling quote endpoints verify).

**Fix (router-level, mirroring the existing sibling policy in `GET /client/quotations/{quote_id}`):**
- [quotes.py:71-97](nhaav-backend/app/routers/quotes.py#L71-L97) — after fetching, the quote is readable **only** by:
  - the provider who submitted it (`quote.provider_id == current_user.id`), or
  - the client who owns the parent service request;
  - everyone else gets `403 {"detail": "Not authorized to view this quote"}` — the exact same message/status the sibling endpoint already used, so frontend error handling needs no changes.
- Nonexistent quote still returns `404` (unchanged). The service-layer `get_quote_by_id` stays a raw fetcher because `update_quote` / `accept_quote` / `reject_quote` and the client-procurement router each layer their own (pre-existing, tested) authorization on top — adding identity checks inside it would have churned four callers for zero security gain.

**Regression tests ([test_security_fixes.py](nhaav-backend/tests/test_security_fixes.py), `TestQuoteAccessControl`):** owner-client 200, submitting-provider 200, unrelated client 403, unrelated provider 403, nonexistent 404, sibling-parity 403/200, and the full award loop still works (owner accepts → 200).

## 2. MEDIUM-1 — Authentication debug logging removed ✅

**Was:** `print("PAYLOAD:", ...)`, `print("USER ID:", ...)`, `print("AUTH ERROR:", e)`, `print("DB USER:", ...)` in `get_current_user` dumped every user's JWT claims (email, role) and full user objects to stdout on every request; 3 prints in the OCR service leaked error/parse details.

**Fix:**
- [auth_guard.py:56](nhaav-backend/app/middleware/auth_guard.py#L56) — the only retained event is a structured, non-sensitive warning on token rejection: `logger.warning("auth_token_rejected reason=%s", type(e).__name__)` (reason class only — never the token, claims, or exception payload). All payload/user dumps deleted, not conditionally hidden. New logger `nhaav.auth` (consistent with `nhaav.email` / `nhaav.rate_limit`).
- [ocr_service.py:25](nhaav-backend/app/services/ocr_service.py#L25) — prints replaced with structured logs on logger `nhaav.ocr`: skip reason, HTTP status code only, and exception **type name only** (the message could embed OCR/document text).

**Verification:** `grep print(` across `auth_guard.py`, `ocr_service.py`, `rate_limit_service.py`, `auth.py`, `admin_auth.py`, `quotes.py` → zero hits.

## 3. MEDIUM-4 — Authentication endpoint rate limiting ✅

**Was:** zero throttling on `/auth/login`, `/admin/auth/login`, `/auth/forgot-password`, `/auth/resend-verification` → credential stuffing, brute force, mail-bombing.

**Mechanism:** reuses the H10 database-backed sliding-window store (`rate_limit_events`, PostgreSQL-safe, multi-instance safe) with the same **fail-open** contract (a limiter must never take login down) and proportional lazy pruning. Subject keys are **IP addresses or account emails**, mapped to deterministic `uuid5` digests ([rate_limit_service.py:207](nhaav-backend/app/services/rate_limit_service.py#L207)) so raw emails/IPs are never persisted and **no schema change was needed**. Client IP resolution takes the first `X-Forwarded-For` hop (Railway proxy) with socket-peer fallback ([rate_limit_service.py:220](nhaav-backend/app/services/rate_limit_service.py#L220)).

**Wiring:**
| Endpoint | Counters (default, all env-tunable) | Where |
|---|---|---|
| `POST /auth/login` | all attempts per IP: **30/15min**; failed attempts per email: **5/15min** | [auth.py:61-70](nhaav-backend/app/routers/auth.py#L61-L70) |
| `POST /admin/auth/login` | attempts per IP: **20/15min**; failures per admin email: **5/15min** | [admin_auth.py:52-66](nhaav-backend/app/routers/admin_auth.py#L52-L66) |
| `POST /auth/forgot-password` | per account email: **3/15min**; per IP: **10/15min** | [auth.py:106-111](nhaav-backend/app/routers/auth.py#L106-L111) |
| `POST /auth/resend-verification` | per account email: **3/15min**; per IP: **10/15min** | [auth.py:156-161](nhaav-backend/app/routers/auth.py#L156-L161) |

Design points (per the reviewer's instruction to not blindly reuse the 5-search rule):
- Successful logins are **never** blocked by the failed-attempt counter (a legitimate owner with a remembered password is unaffected); failed counters only engage on the 401 path.
- 429 responses keep the H10 shape: `{"detail": {"code": "rate_limit_exceeded", "category": ..., "message": ...}}` + `Retry-After` header; categories get human messages.
- Window/limits via `AUTH_RATE_LIMIT_WINDOW_MINUTES` (15) and the eight `AUTH_*` vars in [config.py:118-140](nhaav-backend/app/config.py#L118-L140).
- Deliberately **not** limited in this pass: `/auth/register` (not in the approved scope; unique-email + verification-email flow already constrains it — noted as a candidate for a per-email cooldown later), and reset/verify token endpoints (single-use tokens, no email side effects).
- Pre-flight test-budget analysis confirmed the 344 existing tests stay green (max observed: 25 logins/file vs 30 cap; 8 admin logins vs 20; ≤2 failed logins; ≤2 forgot/resend per email).

**Regression tests (`TestAuthRateLimits`, 11 tests):** per-email failed-login cap with exact 429 category + `Retry-After`; successful login unaffected after failures; per-IP login cap reaching exactly the configured limit; admin per-email + per-IP caps; forgot/resend per-email and per-IP mail-bombing caps; counter-reset helper; XFF first-hop resolution; fail-open on store errors (`TestAuthLimiterInternals`).

## 4. Attachment URL scheme hardening (LOW) ✅

**Was:** user-supplied attachment strings rendered as `<a href target="_blank">` in two components; a `javascript:` value would execute script on click.

**Fix (defense in depth):**
- Backend schemas: [url_validation.py](nhaav-backend/app/utils/url_validation.py) rejects any value carrying a non-http(s) scheme, with whitespace/control-character stripping first (`"jav\tascript:"` is caught). Wired into `QuoteBase` ([quote.py:33](nhaav-backend/app/schemas/quote.py#L33)), `QuoteUpdate` ([quote.py:74](nhaav-backend/app/schemas/quote.py#L74)) and `ServiceRequestBase` ([request.py:30](nhaav-backend/app/schemas/request.py#L30)) → dangerous values now fail with 422 at submission. Plain file names, `/uploads/...` paths and https URLs pass unchanged.
- Frontend: [safeHref.ts](nhaav-frontend/src/utils/safeHref.ts) returns `null` for dangerous schemes; both renderers (JobDetails, QuotationDetails) then render the attachment as inert text with "Link disabled" instead of a link ([JobDetails.tsx:310](nhaav-frontend/src/pages/Dashboard/JobTracking/JobDetails.tsx#L310), [QuotationDetails.tsx:272](nhaav-frontend/src/pages/Dashboard/ProviderDashboard/QuotationDetails.tsx#L272)) — old data already stored with bad values is still safe to display.

**Regression tests (`TestAttachmentSchemeValidation`, 4 tests):** `javascript:` rejected on quotes and requests, tab-obfuscated scheme and `data:` rejected, safe values accepted and round-tripped.

---

## Round-2 verification (external reviewer checklist)

The reviewer's six verification points were each re-checked against the code; two real hardening gaps were found and closed, and every point is now pinned by tests.

**1. XFF spoofing — gap confirmed and fixed.** The original `client_ip()` took the *first* XFF hop, which is attacker-controllable whenever the proxy *appends* rather than strips client XFF (community reports contradict Railway's official "we strip" statement, so this could not be assumed safe). Fix:
- New `TRUST_PROXY_HEADERS` setting ([config.py:141-150](nhaav-backend/app/config.py#L141-L150)): forwarded-client headers are honored **only** when the deployment is behind a proxy that overwrites them; for directly-exposed deployments setting it `false` makes the limiter ignore XFF/X-Real-IP entirely and use the TCP peer address, so header rotation buys an attacker nothing.
- In trusted mode, `X-Real-IP` is preferred (Railway's edge sets it from the actual connection per Railway staff; nginx equivalents: `proxy_set_header X-Real-IP $remote_addr;`) with XFF first-hop as fallback ([rate_limit_service.py:230-263](nhaav-backend/app/services/rate_limit_service.py#L230-L263)).
- Deployment checklist: Railway → defaults are correct; self-managed nginx → set the two `proxy_set_header` lines and keep the default; bare VPS/no proxy → `TRUST_PROXY_HEADERS=false`.
- Tests: X-Real-IP precedence pinned; untrusted mode ignores both headers and falls back to the peer address.

**2. UUID5 keys — verified safe.** Derivation is `uuid5(uuid.NAMESPACE_URL, "nhaav-auth-limit:" + normalized_key)` ([rate_limit_service.py:207-217](nhaav-backend/app/services/rate_limit_service.py#L207-L217)): deterministic (pinned by test), namespaced away from v4 user IDs (collision probability ~2⁻¹²² per pair — negligible against a users table of dozens of rows), one-way (uuid5 is a truncated SHA-1 digest — the raw email/IP is not recoverable from the stored key), and raw keys are never persisted or logged (log lines emit the UUID only).

**3. Failed-login counting — verified.** Successful logins never touch the per-email failed counter (it is engaged only on the 401 path); the per-IP counter counts **all** attempts regardless of outcome, so rotating email addresses still exhausts `auth_login_ip` — pinned by `test_login_per_ip_limit`, which drives 30+ *different* addresses from one IP and gets 429.

**4. Forgot/resend enumeration — verified and pinned.** Both endpoints increment their counters **before** the account-existence branch ([auth.py:106-111](nhaav-backend/app/routers/auth.py#L106-L111), [auth.py:156-161](nhaav-backend/app/routers/auth.py#L156-L161)), and the generic response is returned identically for existing and nonexistent addresses. New test pins byte-identical JSON for a real vs a ghost email under the cap.

**5. Quote authorization — every caller enumerated and pinned.** `get_quote_by_id` has exactly five call sites (grep-verified): `update_quote` (owner + status check), `accept_quote` (request-owner, row-locked), `reject_quote` (request-owner), `GET /client/quotations/{id}` (owner check), and the fixed `GET /quotes/{id}`. Round-2 tests add non-owner pins for `PUT /quotes/{id}` (403) and `PUT /quotes/{id}/reject` (403), so all five layers are now test-enforced.

**6. Attachment normalization — hardened beyond round 1.** The validator and `safeAttachmentHref` now additionally reject uppercase schemes (`JAVASCRIPT:`), protocol-relative URLs (`//evil.example.com` — no scheme but navigates to a foreign origin), and percent-escaped forms (`javascript%3Aalert(1)`, `%6a%61vascript:…`) by judging the percent-**decoded** value too ([url_validation.py](nhaav-backend/app/utils/url_validation.py), [safeHref.ts](nhaav-frontend/src/utils/safeHref.ts)). Four new 422 pins cover these; whitespace/control-character and `data:` rejections were already pinned.

## Deliberately deferred (unchanged, awaiting product decision)

- **MEDIUM-2** — anonymous callers uncounted on rate-limited public routes; unthrottled public `/requests` browse. Needs the "should unauthenticated visitors enumerate the RFQ database?" decision first (auth-gating vs IP-throttling).
- **MEDIUM-3** — public `/requests` response fields (`client_id`, `budget`, `selected_quotation_id`, `attachments`). Per-field classification needed before trimming.
- Remaining Lows/Info from the audit: 24h admin token TTL, dead legacy `get_current_admin` in auth_guard, EOL `python-jose` swap, password-reset vs live-JWT invalidation, unused refresh token in localStorage.

## Suggested follow-up checks for the reviewer

1. Confirm the default limit values above are acceptable for production traffic (all env-tunable without code changes).
2. Decide MEDIUM-2/3 so the next pass can close them.
3. The 19 new tests in [test_security_fixes.py](nhaav-backend/tests/test_security_fixes.py) pin every behavior change — full battery result: **363 passed, 0 failed**.
