# Staging PostgreSQL migration checklist — Nhaav

Scope: apply the backend schema to a **staging** PostgreSQL/Supabase project and
verify it before any production decision. This document does not authorize
running anything against production. Production schema changes need their own
approval, backup proof and maintenance window.

Current Alembic head in this repository: `c6d7e8f9a0b1` (`One live quote per
provider per request`). The local SQLite database is at that head.

---

## 0. Preconditions (all must be true)

- [ ] A **staging** Supabase project exists and is not shared with production.
- [ ] `STAGING_DATABASE_URL` uses the **direct/session** connection (port 5432),
      not the transaction pooler (port 6543). Alembic needs a session-level
      connection; `?sslmode=require` is expected.
- [ ] The staging database is either empty or a **restored copy** of production
      taken after the last known-good backup. Never point this at production.
- [ ] A fresh backup/snapshot exists and its restore has been tested once.
- [ ] `python -m alembic heads` on the release commit prints exactly one head:
      `c6d7e8f9a0b1`.
- [ ] The application image/commit to be tested is identified (SHA + build tag).

## 1. Record the starting state (read-only)

Run `ops/supabase_read_only_inspection.sql` first and save the output. At
minimum record:

- [ ] `alembic_version` (may be absent on an empty staging database). On an
      empty project run only sections 1-3 of the inspection script; sections
      4+ require the application tables.
- [ ] Exact counts for `users`, `payments`, `subscriptions`, `access_packs`,
      `access_tokens`, `documents` (after migration, not on an empty project).
- [ ] Whether `access_tokens.unused_expires_at` and the partial unique indexes
      exist.
- [ ] Enum labels and bucket list.

## 2. Backup

- [ ] Take a Supabase snapshot / `pg_dump` immediately before migrating and
      record its identifier and timestamp.
- [ ] Confirm the dump is non-zero and restorable in a scratch project.
- [ ] Confirm uploaded files are backed up separately: `uploads/`,
      `profile_brochures/` (these live on the app's persistent volume, not in
      PostgreSQL).

## 3. Dry run on a disposable clone (never on staging)

`alembic upgrade head --sql` is **not** a reliable dry run for this chain: some
migrations use `batch_alter_table`, which needs live reflection, and
`c6d7e8f9a0b1` executes a duplicate-check query on the live bind. Offline SQL can
fail or omit that check. Use a disposable database clone instead.

```powershell
# From nhaav-backend/. Use a CLONE URL, not the staging URL.
$env:DATABASE_URL = "postgresql://USER:PASSWORD@CLONE-HOST:5432/DBNAME?sslmode=require"
python -m alembic current
python -m alembic history --verbose | Select-Object -First 40
python -m alembic upgrade head
python -m alembic current          # must print c6d7e8f9a0b1
```

- [ ] The clone starts from the same snapshot/state as staging.
- [ ] Review migration code for `DROP DATABASE`, `TRUNCATE` or an unguarded
      `DROP TABLE`; no migration should contain them.
- [ ] Confirm no migration seeds demo/business records.
- [ ] Apply and verify on the clone first; repeat the read-only inspection there.
- [ ] Do **not** point this step at staging or production.

## 4. Apply on staging

Only after the clone run is clean and the backup is verified.

```powershell
$env:DATABASE_URL = $env:STAGING_DATABASE_URL
python -m alembic current          # record before
python -m alembic upgrade head     # reviewed, single step
python -m alembic current          # must print c6d7e8f9a0b1 (head)
```

- [ ] Exit code 0 for every command.
- [ ] Re-run `ops/supabase_read_only_inspection.sql`; compare counts and schema
      with step 1.
- [ ] `users`, `payments`, `documents`, `access_tokens` counts unchanged unless
      this release intentionally writes data.
- [ ] No duplicate live UTRs; no orphan `access_tokens`/`access_packs`.
- [ ] Pass-expiry buckets show the intended 6-month / 12-month windows for new
      packs; historical packs keep their original stamped expiry.

## 5. Application smoke test on staging

- [ ] Boot the backend with `RUN_MIGRATIONS_ON_START=false` and production-like
      variables **except** the staging database and staging frontend origin.
- [ ] `GET /health` returns `{"status":"ok"}` with no internal detail.
- [ ] `GET /health/ready` returns 200; stop the DB (or use a bad URL in a
      throwaway instance) and confirm 503 `Database unavailable`.
- [ ] Sign in with cookies, refresh, sign out; confirm CSRF rejection without
      `X-CSRF-Token`.
- [ ] Upload a KYC document; confirm owner can download, another account gets
      403, `/uploads/...` is 404, delete removes the row and the file.
- [ ] Submit a bank-transfer receipt; admin verifies; confirm 10 passes are
      stamped ~6 calendar months out and 100 passes ~12 months out.
- [ ] CORS: request from the staging frontend origin succeeds; request from a
      foreign origin is rejected.
- [ ] Frontend built with `VITE_API_URL=https://staging-api.example` contains no
      `localhost:8000`.

## 6. Rollback plan

Preferred: restore the snapshot taken in step 2 (fast, guarantees data + schema
consistency).

Only if the release added no data and the downgrade path is verified:

```powershell
python -m alembic downgrade -1
python -m alembic current
```

- [ ] A downgrade is **never** run on production data without a verified backup
      and explicit approval.
- [ ] Record the exact revision downgraded to.

## 7. Production decision gate

Do not proceed to production unless all of these are recorded:

- [ ] Staging migration exit 0 and schema matches head.
- [ ] No unexpected row-count change.
- [ ] Backup + restore test evidence.
- [ ] Full auth + payment + upload smoke test evidence on the staging origin.
- [ ] Persistent volume mounted at `/app/uploads` and `/app/profile_brochures`,
      surviving a restart.
- [ ] `TRUST_PROXY_HEADERS` decided from the actual proxy topology (see report).
- [ ] `ops/supabase_read_only_inspection.sql` output archived for the
      production pre-check.
