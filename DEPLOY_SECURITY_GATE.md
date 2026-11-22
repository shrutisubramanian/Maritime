# Deployment Security Gate — Nhaav / Nhaav

> **PARTIALLY SUPERSEDED.** This gate predates the F-1 fix and the current code.
> Two claims below no longer hold: (a) there is **no `TRUST_PROXY_HEADERS`
> setting** in the application — proxy trust is a uvicorn / `FORWARDED_ALLOW_IPS`
> deployment concern (see [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) §2);
> (b) the Alembic head is now `a0b1c2d3e4f5`, not `f9a0b1c2d3e4`. Treat
> [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) as the authoritative checklist.

**Date:** 2026-10-03
**Scope:** Read-only verification of production deployment settings. No application behavior was changed.
**Companion reports:** [SECURITY_AUDIT.md](SECURITY_AUDIT.md), [SECURITY_FIX_PASS.md](SECURITY_FIX_PASS.md)

This gate closes the security-fix phase. It verifies everything that *can* be verified from the repository, and produces an explicit manual checklist for the variables that live only in the Railway dashboard (which the repo cannot read).

---

## 1. Checklist — verified from the repository

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Proxy-header trust configured at the uvicorn/deployment layer | ⚠️ **Superseded** | There is **no `TRUST_PROXY_HEADERS` app setting**. The limiter uses `request.client.host`, and uvicorn resolves it via `FORWARDED_ALLOW_IPS`. Configure at deployment level — see [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) §2. |
| 2 | Production DEBUG / development settings disabled | ✅ **Verified** | No `--reload`, no `debug=True`, no `DEBUG` setting anywhere in `app/`. Startup is `alembic upgrade head && uvicorn` (Dockerfile CMD). `ENVIRONMENT=production` triggers fail-fast guards in `config.py`. |
| 3 | CORS contains only intended production origins | ⚠️ **Code-guarded; dashboard check required** | `config.py` forbids `CORS_ORIGINS="*"` in production (raises at startup) and requires explicit origins; `app/main.py` builds allow-list from it. Exact prod origin list must be confirmed in the dashboard — see §3, item 3. |
| 4 | JWT secrets only as environment variables | ✅ **Verified** | `JWT_SECRET` required — `config.py` raises `ValueError` if unset. `ADMIN_JWT_SECRET` defaults to `JWT_SECRET` when unset (distinct values recommended, see §3 item 4). No secret literal appears in any tracked file. |
| 5 | No admin credentials / secrets in repository | ✅ **Verified** | `git ls-files` shows no `.env` or `*.db` tracked; `.gitignore` covers `.env` and `*.db`. `seed_admin.py` is strictly env-only (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) and **refuses to run in production without them**. No hardcoded secret patterns in tracked Python. |
| 6 | Database URL uses production database | ⚠️ **Code-ready; dashboard check required** | `DATABASE_URL` is required (startup fails without it) — the app cannot silently fall back to SQLite. The actual value in the Railway environment must point at the prod Postgres — see §3, item 2. |
| 7 | HTTPS enforced | ✅ **Verified (deployment-model standard)** | No TLS in the container; Railway's edge terminates HTTPS for `*.up.railway.app` and custom domains. Container itself (`python:3.13-slim`, non-root `appuser`) serves plain HTTP to the private network only. This is the standard Railway model. |
| 8 | No test/dev accounts or seed credentials in production | ✅ **Verified (post-gate fix applied)** | All three seed scripts — `seed_demo.py`, `seed_demo_e2e.py` and `seed_verification.py` — now refuse to run when `ENVIRONMENT=production` (raise `RuntimeError` unless `SEED_DEMO_ALLOW_PRODUCTION=1`). Pinned by `tests/test_seed_verification_guard.py`. Demo password `Demo@123` exists only in the three seed scripts, none of which can run against prod. |
| 9 | Production migration at expected Alembic head | ✅ **Verified (code side)** | Single head: `f9a0b1c2d3e4` (`add_rate_limit_events`), chain: `3241ce641a7d → 38ddbd5d268f → 3f3cfac91e8a → d3f4a5b6c7d8 → e4f5a6b7c8d9 → b5a6c7d8e9f4 → c7d8e9f4a5b6 → d8e9f0a5b6c7 → e7a8b9c0d1e2 → f9a0b1c2d3e4`. Docker CMD runs `alembic upgrade head` on every deploy, so prod lands at `f9a0b1c2d3e4` automatically. |
| 10 | Rate limits use production values, no test overrides | ✅ **Verified** | All defaults in `config.py` are the production values (§4). Test overrides are confined to `tests/` (monkeypatch/env-scoped); no `TestClient`, `monkeypatch`, or test fixture leaks into `app/` code (only a docstring mention). |

---

## 2. Findings

### Finding A (MEDIUM) — `seed_verification.py` lacks a production guard — **RESOLVED 2026-10-03**

> **Fix applied:** the guard now exists (import-time, identical pattern to `seed_demo.py`/`seed_demo_e2e.py`, same `SEED_DEMO_ALLOW_PRODUCTION=1` escape hatch). Regression-pinned by `tests/test_seed_verification_guard.py` — 6 tests covering production refusal, refusal creates no demo accounts (canary-provider check on a scratch DB), dev import allowed, dev seeding behavior unchanged (seed still creates its five providers), explicit override, and the function-remains-callable contract. Text below is the original finding, kept for the record.

**File:** [nhaav-backend/app/seed_verification.py](nhaav-backend/app/seed_verification.py) (`__main__` block at the end of the file)

Unlike its siblings, this script has **no** `ENVIRONMENT=production` check:

- `seed_demo.py` (lines ~26–33): raises `RuntimeError` on import in production unless `SEED_DEMO_ALLOW_PRODUCTION=1`.
- `seed_demo_e2e.py`: same guard.
- `seed_admin.py`: refuses in production without `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars.
- **`seed_verification.py`: nothing.** Its `__main__` would create 5 demo provider accounts with the public, committed-password `Demo@123` against **whatever `DATABASE_URL` points at** — including production.

**Impact:** A single accidental `python -m app.seed_verification` in a prod-configured shell injects five known-password accounts into production. This is exactly the failure mode the other seed scripts guard against.

**Recommended fix (small, no behavior change to the app itself):** add the same import-time guard used by `seed_demo.py`:

```python
_ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()
_ALLOW_OVERRIDE = os.getenv("SEED_DEMO_ALLOW_PRODUCTION", "0").strip().lower() in ("1", "true", "yes")

if _ENVIRONMENT == "production" and not _ALLOW_OVERRIDE:
    raise RuntimeError(
        "Refusing to seed verification data: ENVIRONMENT=production. "
        "seed_verification.py creates demo provider accounts with a public "
        "password. Set SEED_DEMO_ALLOW_PRODUCTION=1 only for an explicit, "
        "deliberate exception."
    )
```

**Interim mitigation (until fixed):** never run seed scripts against a shell whose `DATABASE_URL` points at production; prefer running them only in local dev with an explicit SQLite/`nhaav.db` path.

### Finding B (LOW / cosmetic) — `/docs` and `/redoc` are served in production — **RESOLVED 2026-10-03**

> **Fix applied:** `main.py` now derives the documentation surface from `openapi_surface(environment)`: production disables `/docs`, `/redoc` **and** `/openapi.json` together (closing the whole surface, not just the Swagger page); development/test keep all three. Regression-pinned by `tests/test_docs_gating.py` — 6 tests including live checks that all three paths return 404 on a production-configured app and 200 in test. Text below is the original finding, kept for the record.

**File:** [nhaav-backend/app/main.py:50](nhaav-backend/app/main.py#L50) — `app = FastAPI(title="Nhaav Maritime API")` with no `docs_url`/`redoc_url`/`openapi_url` gating.

Swagger UI (`/docs`), ReDoc (`/redoc`), and the OpenAPI schema (`/openapi.json`) are publicly reachable in production. This is an information-disclosure nicety, not an exploit: it documents endpoint shapes that are already public-facing. Note the auth endpoints are rate-limited and the API requires JWTs, so the schema reveals little an attacker couldn't probe anyway.

**Recommended fix (when convenient):** pass `docs_url=None, redoc_url=None, openapi_url=None` when `ENVIRONMENT == "production"`, or gate on a `ENABLE_API_DOCS` env var so docs stay available in dev.

---

## 3. Manual checklist — Railway dashboard (must be verified by a human)

The repository **cannot** read deployed environment variables. Verify each of these in the Railway service → Variables tab before declaring the gate passed:

| # | Variable | Required value | Notes |
|---|----------|----------------|-------|
| 1 | **Proxy-header trust** | Configure uvicorn `FORWARDED_ALLOW_IPS` to the trusted proxy hop(s), or leave the default | **There is no `TRUST_PROXY_HEADERS` variable — do not add one.** The rate limiter reads `request.client.host`; uvicorn honours forwarded headers only from addresses in `FORWARDED_ALLOW_IPS` (default `127.0.0.1`). Behind Railway's edge the proxy is not loopback, so the default makes every client share one bucket; widen trust only after confirming the proxy hop. Details: [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) §2. |
| 2 | `ENVIRONMENT` | `production` | Activates all fail-fast guards (CORS `*` ban, SMTP required, s3 required, Gemini key required). |
| 3 | `CORS_ORIGINS` | Exact production frontend origin(s), comma-separated | Must list only the real prod frontend URL(s). No `*`, no localhost, no staging unless intended. |
| 4 | `JWT_SECRET`, `ADMIN_JWT_SECRET` | Both set; **distinct random values recommended** | Admin defaults to `JWT_SECRET` when absent — acceptable but distinct secrets are stronger. Never commit either. |
| 5 | `DATABASE_URL` | Prod Postgres connection string | Confirm it is the production database, not a dev/staging instance. The app fails fast if unset, but cannot tell prod from dev. |
| 6 | `STORAGE_BACKEND` | `s3` + `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, endpoint/region as applicable | Required in production by config guard; local storage is forbidden. |
| 7 | `EMAIL_BACKEND` | `smtp` + `EMAIL_HOST`, `EMAIL_FROM` (+ credentials) | `console` is refused in production by config guard. |
| 8 | `GEMINI_API_KEY` | Set | Required in production by config guard (OCR). |
| 9 | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Set only if/when running `seed_admin` | Prefer setting them just for the seeding run, then removing. No admin credential may live in the repo. |
| 10 | No `AUTH_*` / `*_LIMIT` overrides | Absent | If any `AUTH_LOGIN_*`, `AUTH_ADMIN_*`, `AUTH_FORGOT_*`, `AUTH_RESEND_*`, `VENDOR_*`, `PORT_*`, `DATA_DOWNLOAD_*`, `RATE_LIMIT_WINDOW_MINUTES`, `AUTH_RATE_LIMIT_WINDOW_MINUTES`, or `MAX_SEARCH_PAGE_SIZE` variables are set in the dashboard, confirm each is intentional (§4 lists the defaults). Absent = defaults = correct. |
| 11 | Seed scripts | Never executed against prod | Applies to all three: `seed_demo.py`, `seed_demo_e2e.py`, `seed_verification.py` (all three now carry the same guard — Finding A resolved). |
| 12 | `SEED_DEMO_ALLOW_PRODUCTION` | Absent (unset) | If present, the demo-seed prod guard is disabled. |

**One-time production setup still pending:** run `python -m app.seed_admin` once with `ADMIN_EMAIL`/`ADMIN_PASSWORD` in the prod environment to create the real admin account. Until then there is no admin login in prod (which is safe, but worth knowing).

**Pending from the owner — password-reset sender address:** reset codes are mailed from whatever `EMAIL_FROM` / SMTP account is configured (currently a personal Gmail). The owner is supplying a dedicated sender mailbox; when it arrives, set `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` and `EMAIL_FROM` to that account and send yourself one reset code to confirm delivery. The code flow itself is complete and does not depend on this.

---

## 4. Production rate-limit values (config defaults)

These are the values in effect in production (no dashboard overrides expected — checklist item 10):

**Search / anti-extraction (60-minute sliding window):**
| Category | Default |
|----------|---------|
| `VENDOR_SEARCH_LIMIT` | 5 per user |
| `PORT_SEARCH_LIMIT` | 5 per user |
| `VENDOR_DETAIL_LIMIT` | 20 per user |
| `DATA_DOWNLOAD_LIMIT` | 10 per user |
| `MAX_SEARCH_PAGE_SIZE` | 25 |

**Auth endpoints (15-minute sliding window, per-IP + per-email):**
| Category | Default |
|----------|---------|
| Login failures per email | 5 |
| Login attempts per IP | 30 |
| Admin login attempts per IP | 20 |
| Admin login failures per email | 5 |
| Forgot-password per email | 3 |
| Forgot-password per IP | 10 |
| Verification resend per email | 3 |
| Verification resend per IP | 10 |

Counters live in the `rate_limit_events` table (migration `f9a0b1c2d3e4`), database-backed and multi-instance safe.

---

## 5. Verdict

- **Repository side: PASS.** Both findings raised at gate time (A: seed guard gap; B: API docs exposure) are fixed and regression-pinned. Full backend suite: **379 passed** (367 prior + 12 new gate tests); frontend untouched.
- **Deployment side: PENDING** on the manual Railway-dashboard checklist in §3, as corrected: proxy trust is a **uvicorn/deployment setting (`FORWARDED_ALLOW_IPS`)**, because the application exposes no `TRUST_PROXY_HEADERS` switch.
- **After both sides pass, the security-fix phase is complete**, and the project proceeds to the UI-colors phase, then UI regression, then the payment-gated bank-transfer workflow.

*Items deliberately deferred as product decisions (not gate blockers): MEDIUM-2 and MEDIUM-3 from SECURITY_AUDIT.md.*
