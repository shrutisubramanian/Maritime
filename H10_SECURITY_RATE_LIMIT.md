# H10 Security Pass — Anti Bulk-Extraction Rate Limiting

**Status:** IMPLEMENTED + TESTED (14 focused tests; full suite 344 passing).
**Threat:** Captain — *"What prevents someone from logging in once and searching all vendors and ports and then downloading all that data from us?"*
**Approach:** server-side, user-scoped, database-backed sliding-window counters. No application redesign; no data-model changes to vendors/ports.

---

## 1. What is protected (audited endpoints)

Limits were assigned from the actual route inventory, not guesses:

| Category (counter) | Endpoints | Rationale |
|---|---|---|
| `vendor_search` (5/window) | `GET /profiles/providers`, `GET /profiles/suppliers`, `GET /marketplace/services` | The three vendor/provider discovery surfaces. One HTTP request = one counted search, regardless of filters or page. |
| `port_search` (5/window) | `GET /marketplace/services/aggregate/{name}`, `GET /marketplace/services/aggregate/{name}/availability` | These return per-port provider coverage (which providers serve a port/service) — the port-level extraction path. Independent counter, so vendor and port budgets never cross-contaminate. |
| `vendor_detail` (20/window) | `GET /profiles/{profile_id}` | Per-vendor deep view; higher limit so normal comparison flows survive. |
| `download` (10/window, **not wired**) | — | Audit result: every document/file endpoint is single-record and owner-scoped (`GET /documents/{id}/file` serves only the caller's own document) or admin-JWT-gated with audit logging. No bulk/export endpoint exists. Nothing is wired; the category stays configured and ready (see `app/middleware/rate_limit.py` note and §5). |
| Pagination caps | `limit` on all three vendor-search routes + `GET /requests/` capped at `MAX_SEARCH_PAGE_SIZE` (25) | Blocks page-walking with oversized pages (422 before any data leaves). Legitimate small-page pagination untouched. |

Not touched (per brief): procurement request→quote→award flow, OCR/document verification pipeline, admin verification queue (admin JWT identity, separate auth), user's own `/profiles/me`, notifications, jobs.

## 2. How it works

- **Identity:** the JWT `sub` in the `Authorization` header, resolved server-side (`app/middleware/rate_limit.py::_resolve_user`). Client-supplied ids, query params, and localStorage are never trusted.
- **Public stays public (spec §E):** the dependency uses *optional* auth. Authenticated callers are counted and enforced; anonymous callers pass through uncounted exactly as before (pinned by `test_unauthenticated_browsing_contract_unchanged`). The threat model's abuser is the *authenticated* scraper — covered.
- **Sliding window:** over limit when rows for `(user_id, category)` within the last `RATE_LIMIT_WINDOW_MINUTES` ≥ category limit. Each counted request inserts one row **before** the handler runs; the 429 short-circuits the response.
- **429 response:** `{"detail": {"code": "rate_limit_exceeded", "category": "...", "message": "Vendor search limit reached. Please try again later."}}` + `Retry-After` (seconds until the oldest counted event exits the window).
- **Fail-open:** if the counter store errors, the request proceeds and the error is logged (availability over strictness — the limiter must not become the outage).
- **Storage:** PostgreSQL/SQLite table `rate_limit_events` (one row per counted request; indexed `user_id, category`). Survives restarts, correct across multiple backend instances. No Redis was introduced (none exists in the stack).
- **Cleanup:** lazy, proportional pruning of expired rows per user/category.

## 3. Configuration (env-backed, safe defaults)

| Variable | Default | Meaning |
|---|---|---|
| `VENDOR_SEARCH_LIMIT` | 5 | vendor/supplier/marketplace search requests per user per window |
| `PORT_SEARCH_LIMIT` | 5 | port-coverage detail requests per user per window |
| `VENDOR_DETAIL_LIMIT` | 20 | individual provider profile views per user per window |
| `DATA_DOWNLOAD_LIMIT` | 10 | reserved for any future bulk/export endpoint |
| `RATE_LIMIT_WINDOW_MINUTES` | 60 | sliding window size |
| `MAX_SEARCH_PAGE_SIZE` | 25 | maximum `limit` accepted on search/browse routes |

Production: set these in the Railway/environment config — nothing is hardcoded in code. Admin/UI note: raising a class of users later (e.g. "verified vendors get 20 searches") is a small settings/role check inside `limit_for_category`, not a rewrite.

## 4. Observability

`nhaav.rate_limit` logger emits `rate_limit_exceeded user_id=… category=… count=… limit=…` warnings and `rate_limit_store_error` on storage failures. Never logged: passwords, JWTs, document contents, personal data.

## 5. Honest audit notes (protection NOT claimed)

- `GET /requests/` (public procurement browse) is **not** request-count-limited — it exposes open RFQs, not the vendor directory; page size is capped (25) and the brief's focus was vendor/port extraction. Can be added in one line if desired: `dependencies=[Depends(rate_limit("vendor_search"))]` or a new category.
- Document downloads are not limited: single-record, owner-scoped only (see §1 `download` row).
- Admin endpoints are not rate-limited by user categories (separate admin identity; limiting legit admins would break the verification workflow).
- Category-groups and category-listing helpers on `/marketplace` are navigation aids without per-provider data; not counted.

## 6. Tests (`tests/test_h10_rate_limit.py`, 14)

1–2. search up to configured limit → next search 429 (both `/profiles/providers` and `/marketplace/services`)
3. marketplace + profile searches share one `vendor_search` budget
4. counter is user-scoped; User A exhausted ≠ User B blocked
5. port coverage has its own counter; vendor exhaustion doesn't block it
6. window expiry restores access (sliding-window semantics)
7. vendor detail budget (20) independent of search
8. page size above `MAX_SEARCH_PAGE_SIZE` → 422 on authenticated route
9. legitimate small-page pagination still works (shape `{data,total,page,pages}`)
10. public `/requests/` cap + unchanged public contract
11. anonymous browsing unchanged (200, not counted)
12. admin queue unreachable-by-user-JWT and never 429 from user counters
13. `download` category configured; owner-scoped document file contract untouched (404 not 429)
14. 429 body shape (stable `code`, per-category message) + `Retry-After` bounds

Existing migration tests were updated for the new head revision (`f9a0b1c2d3e4`) and expected `rate_limit_events` table — a revision bump, not a weakening; all pre-existing security tests remain green.

## 7. Verification battery

| Check | Result |
|---|---|
| Focused rate-limit tests | 14/14 |
| Full backend suite | **344 passed, 0 failed** (330 → 344) |
| Frontend `tsc --noEmit` | Pass |
| Production build | Pass |
| Reference checker | Clean (known `vite-env.d.ts` FP only) |
| Bundle audit | No limit names/values in client JS (nothing hardcoded frontend-side; enforcement is server-only) |

## 8. Frontend 429 handling

- `searchErrorMessage()` helper ([marketplace.ts](nhaav-frontend/src/services/marketplace.ts)) maps HTTP 429 → "Search limit reached. Please try again later."
- Marketplace grid shows a dismissible-on-next-search notice banner; ServiceDetails shows the notice for detail and port-availability fetches; ProviderProfile surfaces it in its existing error state.
- No fake countdown timers; no internal implementation details exposed; server message remains authoritative.
