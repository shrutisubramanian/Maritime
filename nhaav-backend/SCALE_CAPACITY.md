# Can Nhaav handle lots of profiles and lots of people?

Measured, not guessed. Two tools in this folder produce every number below:

| tool | what it measures |
| --- | --- |
| `scale_probe.py` | cost of one request in-process: SQL statements, commits, ms; how the admin queue behaves as the account table grows |
| `scale_live.py` | the real stack under concurrency: starts uvicorn against a throwaway DB copy and hammers it |

```
cd nhaav-backend
.venv/Scripts/python.exe scale_probe.py --accounts 5000
.venv/Scripts/python.exe scale_live.py --accounts 500 --registers 30
```

Both build their own temporary database. Neither touches `nhaav.db`, uploads,
or any running server.

## Short answer

**Yes for thousands of accounts on one instance; no for tens of thousands, and
not yet safe for real KYC documents in production.** The request path is fast and
now scales with page size rather than table size. Three things still stop this
from being a "many people" system: uploads live on the container's local disk,
OCR runs inside the web process, and the per-IP signup budget is 100/hour.

## Measured throughput

One uvicorn process on a Windows laptop, SQLite, 500 profiles in the table:

| endpoint | threads | req/s | p50 | p95 | errors |
| --- | --- | --- | --- | --- | --- |
| `GET /auth/me` | 1 | 276 | 3 ms | 7 ms | 0 |
| `GET /auth/me` | 16 | 280 | 54 ms | 70 ms | 0 |
| `GET /auth/me` | 32 | 227 | 101 ms | 304 ms | 0 |
| `GET /marketplace/category-groups` | 1 | 129 | 7 ms | 15 ms | 0 |
| `GET /marketplace/category-groups` | 16 | 103 | 157 ms | 205 ms | 0 |
| `GET /marketplace/category-groups` | 32 | 114 | 275 ms | 319 ms | 0 |
| `POST /auth/register` | 1 | 3.9 | 255 ms | 275 ms | 0 |
| `POST /auth/register` | 8 | 15.0 | 457 ms | 700 ms | 0 |
| `POST /auth/register` | 16 | 16.0 | 665 ms | 1597 ms | 0 |

Reads saturate around 110–280 req/s on one process: past ~8 threads the box is
CPU-bound and latency grows instead of throughput. Registration is bounded by
bcrypt (~255 ms of CPU each); it parallelises across cores (3.9/s → 16/s), so its
ceiling is core count, not the web framework.

No errors at any concurrency level, including 32 threads against SQLite.

Rough production arithmetic: a 4 vCPU instance running 4 workers is on the order
of **400–1,000 read req/s** and **~60 registrations/s** once Postgres replaces
SQLite. A few thousand daily-active users is comfortable; 50k daily actives on
one instance is not.

## What was wrong, and what changed

### 1. The admin verification queue grew with the number of accounts (fixed)

`GET /admin/verification/providers` loaded **every** profile, then ran one query
per profile for its documents, then paginated in Python.

| table size | before | after |
| --- | --- | --- |
| 203 accounts | 150.6 ms, **450 SQL** | 18.4 ms, 3 SQL |
| 5,003 accounts | (hours, not run) | **12.5 ms, 3 SQL** |

Fixed in `app/routers/admin_verification.py`: documents are batch-loaded for the
whole page in one query, `user` is eager-loaded, `status` and `search` filter in
SQL, and the page is cut with `OFFSET/LIMIT` instead of after serialisation. The
two filters that cannot run in SQL yet (country from JSON metadata, score
averaged from documents) keep the old O(N) path, so the default queue view is
flat while those rare filters stay correct.

`GET /admin/verification/stats` now counts with `GROUP BY` instead of loading
every profile.

### 2. Public provider search did one query per row (fixed)

`GET /profiles/providers` was already paged in SQL, but serialising it lazy-loaded
two relations per row: 25 statements for a page of 20, and the number moved with
page size. Now `joinedload(user)` + `selectinload(services)`:

| table size | before | after |
| --- | --- | --- |
| 13 accounts | 15 SQL | 6 SQL |
| 203 accounts | 25 SQL | **6 SQL** |
| 5,003 accounts | — | **6 SQL, 17 ms** |

### 3. The rate-limit table only ever grew (fixed)

`RateLimitService._prune` existed but was never called, so `rate_limit_events`
gained one row per counted request, forever — roughly one row per search, login
and registration for the life of the product. It is now pruned per bucket before
each insert, using the existing `(identity_hash, category, created_at)` index.

### 4. Uploads were read fully into RAM before the size check (fixed)

`/documents/upload` did `content = await file.read()` and only then compared to
the 25 MB cap. The cap therefore never bounded memory: 20 concurrent onboarding
uploads held ~500 MB, and a hostile 2 GB body was buffered in full before being
rejected. It now streams to disk in 1 MB chunks, stops at the cap, and deletes
the partial file. Pinned by `tests/test_document_upload_limits.py`.

## What still blocks "lots of people"

### Blocker — uploaded documents live on the container's local disk

`DocumentService` writes to `settings.DOCUMENT_UPLOAD_DIR` (`uploads/`). There is
**no storage backend in the code**: `grep STORAGE_BACKEND app/` returns nothing,
even though `Dockerfile` lists `STORAGE_BACKEND=s3, S3_BUCKET, S3_ENDPOINT_URL,
S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY` as required runtime configuration.

Consequences:

* On Railway (or any container host) the filesystem is **ephemeral**. Every
  deploy or restart silently deletes every KYC document and payment receipt,
  while the rows in `documents` / payment tables keep pointing at them.
* A second instance cannot see the first one's files, so the API cannot scale
  horizontally.
* Disk fills with the instance: at 1–8 MB per profile (2–4 documents), 10k
  profiles is 10–80 GB.

This is the one thing to fix before onboarding real users, and it is a
correctness bug before it is a scaling one. `tests/test_security_critical.py`
already contains two failing tests that describe the intended S3 key layout
(`storage_key` must start with `documents/`) — the tests were written, the
subsystem was not.

### Blocker — OCR runs inside the web process

`upload_document` schedules `_process_document_background` via FastAPI
`BackgroundTasks`; that calls `pytesseract` (`ocr_service.py`) and `pdf2image`. A
scanned page costs roughly 0.5–3 s of pure CPU and runs in the same process and
thread pool that serves requests.

Onboarding is bursty by nature — a company sends ten people at once. Ten uploads
turn into ten OCR jobs competing with every other request, and nothing bounds the
queue: the tasks are lost on restart and there is no retry. The fix is a real job
queue (Celery/RQ/arq + Redis, or a hosted queue) with a worker process; the
`BackgroundTasks` call site is the only place that changes.

### Constraint — 100 signups per hour per IP

`REGISTER_LIMIT=25` per `RATE_LIMIT_WINDOW_MINUTES=15`, keyed by **client IP**.
That is the right default against bulk account creation, and the wrong shape for
a launch: a university, a shipping office, or anyone behind one NAT gets 100
signups/hour total, and the 25th person from that office is told "too many
registration attempts". Either key registration by email like
`password_reset` does (per-account, no shared ceiling), or raise the IP ceiling
and add a challenge. This is a product decision, so it was left alone.

### Note — one process, and SQLite in dev

`Dockerfile` runs `uvicorn ... --workers` unset, i.e. one worker. Rate limits,
sessions and access passes are all database-backed (no in-process state), so
`--workers 4` is safe — the limiter was explicitly designed to be multi-instance
safe. Dev `.env` uses `DATABASE_URL=sqlite:///nhaav.db`; production requires
Postgres (`pool_size=20`, `max_overflow=10`), which is the right call: SQLite
serialises writers and every request that counts a rate limit performs a write.

## Storage and cost per profile

Per profile: one `users` row + one `profiles` row (~1–2 KB together) + 2–4
documents at 0.3–2 MB each. So **~1–8 MB of object storage per profile** and a
database that stays small enough that 100k profiles is a rounding error next to
the documents.

## Recommended order

1. **Object storage for uploads** (S3-compatible: R2/S3/Spaces) — unblocks
   production, horizontal scale and the two failing storage tests.
2. **Move OCR out of the request path** into a worker with retries.
3. **Postgres in every environment you demo from**, so SQLite write contention
   never shows up as "the app is slow".
4. **Re-shape the registration limit** (per-email, or IP + challenge).
5. **Run `scale_live.py` against staging** before any launch, at the concurrency
   you expect; the numbers above are one laptop, not your hosting.
