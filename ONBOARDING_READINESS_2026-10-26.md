# Onboarding Readiness — 2026-10-26

**Goal:** remove all demo/test data, close the gaps that would bite during real
sign-ups, and prove the onboarding path works end to end.

---

## 1. What was removed

| Item | Before | After |
| --- | --- | --- |
| Demo accounts (`*.demo@nhaavmaritime.com`, `pending.provider@…`) | 5 | 0 |
| Throw-away test accounts (`manual…@example.com`, `test_auth@example.com`) | 2 | 0 |
| Demo services / supply listings | 11 / 7 | 0 / 0 |
| Procurement requests / quotes / jobs / reviews | 6 / 5 / 4 / 2 | 0 |
| Subscriptions / access packs / access tokens | 6 / 1 / 10 | 0 |
| Notifications / support tickets / listing-fee submissions | 16 / 1 / 2 | 0 |
| Profiles | 10 | 1 (admin) |
| Uploaded documents + payment receipts | 647 files (9.9 MB) | 0 |
| Loose test databases (`test_*.db`, their WAL/journal files) | 40+ files | 0 |
| Old database backups with demo rows + password hashes | 2 | 0 |

**Kept on purpose:**
- `shrutishiva07@gmail.com` — the admin account.
- `m7perumal@gmail.com` — a real-looking Gmail account that was left over
  (unverified client). It is **not** demo data, so it was not deleted. Say the word
  and it goes.
- `subscription_plans` (2 rows, created by migration) and `service_categories`
  (19 rows, reference catalog) — configuration, not demo content.
- A full backup taken immediately before the cleanup:
  `nhaav.db.bak-pre-onboarding-cleanup-20261026-205156`. It still contains the
  demo rows; delete it once you are happy with the clean database.

---

## 2. Two real problems found while cleaning

**The demo-video seeder had reset your admin password.**
`seed_demo_video.py` ran `admin.password_hash = hash_password(PASSWORD)` on
`shrutishiva07@gmail.com` on every execution, with `PASSWORD = "Demo@123"`
documented at the top of the file. The admin account was therefore protected by a
password that is printed in the repository.
*Fixed:* the script no longer touches an existing admin account, and it now
refuses to run unless `ENVIRONMENT=development` (verified: exits 1 in production).
*Remediated:* the admin password was rotated to a new 24-character random
password, written to `.admin-credentials.txt` (git-ignored). The old demo
password now returns 401.

**The JWT signing secret was 20 characters.**
Too short to survive an offline attack on a captured token. Rotated to 64 hex
characters in `.env`. Every previously issued token is now invalid — the admin
signs in once more with the new password.

---

## 3. Verification run

**End-to-end onboarding, on a database built from migrations only**
(`alembic upgrade head` → 25 tables, 2 plans), 14/14 checks:

```
PASS  register new client -> 201
PASS  profile provisioned on signup
PASS  company captured on the profile
PASS  login before verification -> 200
PASS  /auth/me returns the account
PASS  /profiles/me works on first login
PASS  email verification token accepted
PASS  client blocked from admin queue -> 403
PASS  admin login -> 200
PASS  new account appears in admin review queue
PASS  admin approves the account
PASS  profile now verified
PASS  wrong password rejected -> 401
PASS  cannot self-register as admin -> 422
```

**Existing onboarding/auth suites:** 22/22 pass
(`test_onboarding_gate.py`, `test_admin_seed.py`,
`test_admin_auth_separation.py`, `test_auth_flow.py`).

**Admin session on the real database:** login with the new password `200`, with
`Demo@123` `401`, `/admin/auth/me` returns the right account.

**Email delivery:** `EMAIL_BACKEND=smtp`, `smtp.gmail.com:587`, STARTTLS and
authentication succeeded against the configured Gmail account (connection test
only — no message was sent). Verification and reset mails will go out.

---

## 4. Still to set before real users arrive

These are configuration decisions, not code changes:

1. **`ENVIRONMENT=production`** on the server. Everything is currently
   `development`, which enables the dev-provisioning endpoints and the interactive
   docs. Production fails closed, hides `/docs`, and refuses to boot without SMTP.
2. **`FRONTEND_URL`** must be the real domain — it is `http://localhost:3000`
   today, and verification/reset links are built from it.
3. **`CORS_ORIGINS`** must list the real frontend origin.
4. **Payment bank details** (`PAYMENT_BANK_*`) are empty, so the payment screen
   reports "not configured". Fill them in before selling subscriptions.
5. **`TRUST_PROXY_HEADERS`** — keep `true` behind a proxy, set `false` if the API
   is exposed directly.
6. Run `python -m app.seed_services` on a fresh deployment (service categories are
   reference data, not part of the migration), and
   `python -m app.seed_admin` with `ADMIN_EMAIL`/`ADMIN_PASSWORD` to create the
   first admin.
7. Delete `.admin-credentials.txt` after storing the admin password, and delete
   the pre-cleanup database backup.

Running `seed_demo_video.py` locally (with `ENVIRONMENT=development`) will put the
demo marketplace back on this database — that is what it is for, but do not run
it against the database real users will sign up in.

---

## 5. Second pass — hardening (same day)

**Data:** `m7perumal@gmail.com` (the leftover unverified client) was deleted, so
the database now holds exactly one account — the admin. The pre-cleanup backup
was kept. Live `refresh_sessions` / `rate_limit_events` test rows were cleared.

**Sessions.** The browser no longer stores any token in JavaScript. Login and
refresh set httpOnly cookies (`nhaav_access`, `nhaav_refresh`) plus a
readable CSRF cookie (`nhaav_csrf`); a middleware refuses a
cookie-authenticated state-changing request whose `X-CSRF-Token` header does not
match, and Bearer auth still works for API clients and tests. Refresh tokens are
single-use rows in the new `refresh_sessions` table (migration
`e9f0a1b2c3d4`): rotation spends them, replay revokes every session the account
holds, and logout / password reset revoke all. The admin console uses the same
httpOnly cookie; authorisation is still decided by the account's role.

**Also fixed in the pass:** per-network budgets on `/auth/refresh`,
`/auth/verify-email` and `/auth/reset-password`; a support-ticket reply address
is only trusted when it belongs to the signed-in verified account (otherwise the
notification is marked `[UNVERIFIED SENDER]`); a production Content-Security-
Policy is injected at build time (`script-src 'self'`, no inline scripts — the
theme boot moved to `/theme-init.js`); and
[.github/workflows/security-audit.yml](.github/workflows/security-audit.yml) runs
`pip-audit` + `npm audit` on every push and weekly.

**Re-verified:** onboarding end-to-end on a fresh migrated database **15/15**
(register → cookie session → CSRF guard → verify → admin approve), frontend
`tsc --noEmit` and `npm run build` clean with the CSP present in `dist/index.html`,
and the full backend suite **574 passed / 68 failed / 7 errors** with **zero new
failures** against the previous baseline (one baseline failure now passes; the
rest remain the documented H4/H5/H7/H8/H9, migration and concurrency buckets).
