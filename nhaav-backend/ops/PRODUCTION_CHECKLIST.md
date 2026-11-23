# Nhaav production readiness checklist

Prepared from source inspection on **2026-11-04**. Nothing in this checklist was
executed against production. Values in `<ANGLE_BRACKETS>` are placeholders; no
secret belongs in this file, in Git, in the frontend bundle, or in logs.

Current verified Alembic head: **`c6d7e8f9a0b1`** (single head).

---

## 0. Release gate

- [ ] Release commit/tag identified and checked out; working tree reviewed.
- [ ] Backend image digest and frontend build artifact recorded.
- [ ] Database backup/PITR snapshot taken **after** the last write freeze and its
      restore tested in a scratch project.
- [ ] Upload/brochure volume snapshot or copy recorded separately from PostgreSQL.
- [ ] Change window and rollback owner agreed.
- [ ] No secret is committed: `.env`, `.env.*` backups, `.admin-credentials.txt`,
      SMTP passwords, database URLs and JWT secrets stay in the platform secret
      store only.
- [ ] Evidence table at the end is filled in.

---

## 1. PostgreSQL

**Required shape**

```text
DATABASE_URL=postgresql://<USER>:<PASSWORD>@<DIRECT-HOST>:5432/<DB>?sslmode=require
```

- [ ] `DATABASE_URL` is PostgreSQL, not SQLite. The application does **not**
      reject `sqlite://` in production; this is an operator check.
- [ ] Use the **direct/session** connection (port `5432`) for Alembic. Do not
      run migrations through a transaction pooler (`6543`); session-level
      behavior and advisory/locking assumptions are not guaranteed there.
- [ ] TLS is enforced (`sslmode=require` or stricter; verify the provider's CA
      requirement).
- [ ] Database timezone is UTC; application timestamps are UTC.
- [ ] The runtime role can read/write application tables but does not need
      `SUPERUSER`. Use a separate migration role if the provider supports it.
- [ ] Connection limit is sized for API replicas + migration job; pool settings
      are explicit rather than relying on defaults.
- [ ] PITR/automated backups are enabled, retention meets policy, and a restore
      has been tested.
- [ ] Monitoring covers connections, storage, slow queries, lock waits, and
      replication/HA status if applicable.
- [ ] `alembic current` on the target prints `c6d7e8f9a0b1` before traffic.
- [ ] Read-only inspection has been run and archived; no unexpected duplicate
      live UTRs and no orphan access rows.

**Do not** use the production database for a dry run. Dry-run on a disposable
clone, then apply to staging, then production under the approved window.

---

## 2. Persistent file storage

The application writes to the **local filesystem**. There is no S3/object
storage backend in this codebase.

```text
DOCUMENT_UPLOAD_DIR=/app/uploads
PROFILE_BROCHURE_DIR=/app/profile_brochures
PAYMENT_RECEIPTS_DIR=/app/uploads/payment_receipts
```

- [ ] Persistent volumes are mounted at **`/app/uploads`** and
      **`/app/profile_brochures`**; receipts live under the uploads volume.
- [ ] The container runs as non-root `appuser`; both mounts are writable by that
      uid/gid, including the receipts subdirectory.
- [ ] A restart/redeploy does not lose an uploaded KYC document, brochure, or
      payment receipt.
- [ ] Volume backup/snapshot is scheduled and restorable independently of the DB.
- [ ] Disk capacity and inode alerts exist; upload limits are understood:
      documents 25 MB, brochures 15 MB, receipts 5 MB (defaults).
- [ ] Uploaded files are not served as public static paths; downloads go through
      authenticated authorization checks.
- [ ] OCR system dependencies exist in the runtime: `tesseract-ocr`,
      `poppler-utils`, OpenCV runtime libs. The Docker image supplies them; a
      non-Docker host must install them. **There is no startup preflight for
      these binaries.**
- [ ] Antivirus/content scanning decision is recorded (not implemented in code).

---

## 3. CORS and browser session

```text
CORS_ORIGINS=https://<FRONTEND-HOST>
FRONTEND_URL=https://<FRONTEND-HOST>
```

- [ ] `CORS_ORIGINS` lists the exact HTTPS origin(s), comma-separated or
      JSON-style. No `*`, no trailing path.
- [ ] Production refuses a wildcard and a localhost-only list at startup. An
      explicitly empty list is **not** currently rejected by `Settings` (the
      shared validator in `app/main.py` is not called at startup), so verify the
      value is non-empty and exact before deploying.
- [ ] `allow_credentials=True`, so the frontend and API must share a registrable
      domain for the `SameSite` session cookies to be sent (e.g.
      `app.example.com` + `api.example.com`, not unrelated domains).
- [ ] Preflight from the real origin succeeds; a foreign origin is rejected.
- [ ] Cookies are `Secure` outside development; HTTPS is enforced end to end.
- [ ] CSRF: unsafe methods without `X-CSRF-Token` are rejected with 403.
- [ ] `FRONTEND_URL` points at the public app origin; verification and
      password-reset emails use it.
- [ ] CORS is tested from the **deployed** frontend origin, not localhost.

---

## 4. Frontend API URL and build

```text
VITE_API_URL=https://<API-HOST>
```

- [ ] `VITE_API_URL` is set at **build time**. It is compiled into the bundle and
      the CSP `connect-src`, so changing it after build has no effect.
- [ ] The production build is created with the real API URL; no localhost
      fallback is used.
- [ ] Built assets contain no `localhost:8000` (check JS and `index.html`).
- [ ] CSP `connect-src` includes the API origin; the app renders without CSP
      violations in the browser console.
- [ ] The frontend is served over HTTPS and its origin exactly matches
      `CORS_ORIGINS`.
- [ ] If the API or app moves domains, rebuild the frontend and update CORS,
      `FRONTEND_URL`, and cookie-domain assumptions together.

---

## 5. SMTP and transactional email

```text
EMAIL_BACKEND=smtp
EMAIL_HOST=<SMTP-HOST>
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=<SMTP-USER>
EMAIL_HOST_PASSWORD=<SMTP-APP-PASSWORD>   # secret store only
EMAIL_FROM=<VERIFIED-SENDER>
SUPPORT_EMAIL=<SUPPORT-INBOX>
```

- [ ] `EMAIL_BACKEND=smtp`; `console` is refused in production.
- [ ] `EMAIL_HOST`, `EMAIL_FROM`, `EMAIL_HOST_USER` and `EMAIL_HOST_PASSWORD`
      are all present (a missing credential now blocks boot, not the first
      registration); the sender is verified with the provider and matches the
      authenticated account/domain.
- [ ] TLS mode and port are correct for the provider (587 STARTTLS or 465 SSL as
      supported).
- [ ] SPF, DKIM and DMARC are configured for the sending domain; test messages
      are not classified as spam.
- [ ] A real verification email and password-reset email were delivered to an
      external mailbox, and the links use the production `FRONTEND_URL`.
- [ ] Bounce/complaint handling and a monitored `SUPPORT_EMAIL` inbox exist.
- [ ] SMTP credentials are rotated without rebuilding the image and are absent
      from logs and error responses.

---

## 6. Trusted proxy headers and source-IP limits

Current default: **`TRUST_PROXY_HEADERS=true`**. `client_ip()` trusts
`X-Real-IP`, then the first `X-Forwarded-For` hop, without checking the socket
peer or validating the value as an IP.

- [ ] The actual edge/proxy topology is documented: which component terminates
      TLS, and whether it **overwrites** `X-Real-IP` / appends to
      `X-Forwarded-For`.
- [ ] If the API is directly reachable, set `TRUST_PROXY_HEADERS=false`.
- [ ] If behind a trusted proxy, keep `true` **only after** proving the edge
      strips client-supplied values. A spoofed request from outside must not be
      able to choose its source IP.
- [ ] Rate-limit behavior is tested for login, registration, password reset, and
      upload endpoints from two distinct client IPs.
- [ ] A wrong choice is treated as a launch blocker: `true` on a direct API
      permits header rotation; `false` behind a non-header-setting proxy can
      bucket all users under one IP and cause lockouts.
- [ ] The decision is recorded in the evidence table with the person who
      verified it.

---

## 7. Migrations, startup and health

```text
ENVIRONMENT=production
RUN_MIGRATIONS_ON_START=false
JWT_SECRET=<32+ RANDOM CHARACTERS>          # secret store only
```

- [ ] Migrations are applied as a reviewed release step, not silently by every
      replica. If `RUN_MIGRATIONS_ON_START=true` is used, only one instance may
      run it and the startup race must be understood.
- [ ] Startup does not create schema (`create_all` removed); a missed migration
      surfaces as a readiness failure, not silent DDL.
- [ ] `ENVIRONMENT=production` (missing defaults to production, but set it
      explicitly).
- [ ] `JWT_SECRET` is at least 32 random characters. A short secret only logs a
      warning and still boots; do not accept that warning.
- [ ] `GET /health` returns `{"status":"ok"}` and is used only for liveness.
- [ ] `GET /health/ready` returns 200 after a successful `SELECT 1`; it returns
      503 when the DB is unavailable. Route traffic on readiness, not liveness.
- [ ] Logs are collected and do not contain secrets, tokens, full URLs with
      credentials, or document contents.
- [ ] Security headers and rate limiting are present on the deployed origin.

---

## 8. Deployment order

1. Freeze writes or choose a low-write window; take DB and volume backups.
2. Run read-only inspection on the target; archive the output.
3. Apply migrations on a disposable clone, then staging; verify head and counts.
4. Build the frontend with the production `VITE_API_URL`; verify no localhost.
5. Deploy the backend with migrations disabled; run the migration job separately
   if not already applied.
6. Wait for `/health/ready` = 200; then shift traffic.
7. Deploy/serve the frontend; verify CORS, login, verification email, upload,
   payment receipt, and admin verification from the real origin.
8. Monitor errors, DB connections, disk usage, and email delivery.

## 9. Rollback

- Keep the previous image/build available.
- Application rollback is safe only if the schema remains backward-compatible;
  this release's migration is additive except for the quote index.
- Prefer restoring the pre-deployment DB/volume snapshot over a production
  downgrade. Never run `alembic downgrade` on production data without explicit
  approval and a verified backup.
- If email, CORS, or proxy settings are wrong, fix configuration and redeploy;
  do not disable the production guards.

---

## 10. Evidence to record

| Item | Value / evidence | Verified by | Date |
|---|---|---|---|
| Release commit + image digest | | | |
| DB backup id + restore test | | | |
| Volume backup id + restore test | | | |
| `alembic current` before/after | | | |
| Row counts before/after | | | |
| CORS allowed/denied origins | | | |
| Frontend bundle has no localhost | | | |
| SMTP delivery + SPF/DKIM/DMARC | | | |
| `/health/ready` 200 / 503 test | | | |
| `TRUST_PROXY_HEADERS` decision + spoof test | | | |
| Volume mount survives restart | | | |
| Rollback owner + window | | | |
