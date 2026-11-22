# SMTP Smoke Test — Delivery Verification Runbook

> **Status: TRANSPORT VERIFIED (sent and received).** On 2026-10-10 two real
> messages were delivered from the local backend to `shrutishiva07@gmail.com`
> over Gmail SMTP (STARTTLS on 587 + App Password): a plain delivery test and
> the composed verification email via the production `AuthService` path. Both
> were confirmed received in the inbox.
>
> Still unit-tested against a mocked `smtplib` (`tests/test_smtp_delivery.py`,
> 18 tests), the mailbox flows against a recording backend
> (`tests/test_email_and_reset.py`, 23 tests), and the support-ticket routing
> (`tests/test_support_ticket_email.py`, 3 tests). The full 12-check browser
> E2E in section 4 (clicking the link, single-use reset reuse, enumeration
> behaviour, CORS) has NOT been executed yet.

## 1. Prerequisites — choose an SMTP provider

Gmail (simplest, no DNS work) or any transactional provider.

### Gmail — what it needs

1. **2-Step Verification must be ON** for the Google account. App Passwords are
   not available without it: <https://myaccount.google.com/security>
2. Create an **App Password** at <https://myaccount.google.com/apppasswords>.
   - Google shows it as four groups of four characters, e.g. `abcd efgh ijkl mnop`.
   - **Paste it without the spaces.** Gmail's SMTP rejects the spaced form.
   - This is a `SMTP_PASSWORD` value, not the account password. A normal account
     password will fail authentication.
3. Use the **Gmail address itself** as `SMTP_USERNAME` and as `SMTP_FROM_EMAIL`.
   Gmail rewrites or rejects a From address that is not the authenticated
   account (or a verified alias), so a `no-reply@yourdomain.com` sender will not
   work until that domain is verified as an alias in Gmail.
4. Gmail's free sending limit is roughly 500 recipients/day. Fine for
   verification and password-reset mail; not a bulk relay.

### Other providers

| Provider | Host | Port | Username | Password |
|---|---|---|---|---|
| Resend | `smtp.resend.com` | 587 | `resend` | API key |
| SendGrid | `smtp.sendgrid.net` | 587 | `apikey` | API key |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | 587 | SES SMTP user | SES SMTP password |

With these, `SMTP_FROM_EMAIL` must be on a domain you have verified with the
provider.

## 2. Configure the environment

Both spellings work; `SMTP_*` is shown here and the `EMAIL_*` names remain
supported. If **both** are set the `EMAIL_*` name wins, including when it is
empty — so don't leave a stale `EMAIL_HOST=` behind when switching to `SMTP_*`.

### Locally

```bash
cp .env.example .env      # then edit .env
```

```dotenv
ENVIRONMENT=development
EMAIL_BACKEND=smtp          # development defaults to `console`; set this to send for real
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=nhaavnotifications@gmail.com
SMTP_PASSWORD=theapppasswordwithoutspaces
SMTP_FROM_EMAIL=nhaavnotifications@gmail.com
SMTP_FROM_NAME=Nhaav
SMTP_USE_TLS=true
FRONTEND_URL=http://localhost:5173
```

`EMAIL_BACKEND=console` (the development default) logs a one-line summary and
sends nothing, which is what keeps the test suite and local work from emailing
anyone. Switch it to `smtp` only when you intend to deliver.

### On Railway (backend service → Variables)

```
ENVIRONMENT=production
EMAIL_BACKEND=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=nhaavnotifications@gmail.com
SMTP_PASSWORD=<App Password — SECRET>
SMTP_FROM_EMAIL=nhaavnotifications@gmail.com
SMTP_FROM_NAME=Nhaav
SMTP_USE_TLS=true
SUPPORT_EMAIL=nhaavnotifications@gmail.com
FRONTEND_URL=https://<your-vercel-app>.vercel.app
CORS_ORIGINS=https://<your-vercel-app>.vercel.app
```

`ENVIRONMENT=production` makes email delivery a **boot requirement**: with
`EMAIL_BACKEND=console`, or with `smtp` and no host/sender, the app refuses to
start and names the offending variable. That refusal is the intended behaviour —
it stops a deployment from accepting registrations whose verification links go
nowhere. Put `SMTP_PASSWORD` in Railway's secret store, never in a committed file.

Also confirm the other production-required variables are present:
`DATABASE_URL`, `JWT_SECRET`, `ADMIN_JWT_SECRET`, `GEMINI_API_KEY`,
`STORAGE_BACKEND=s3`, `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`.

## 3. Deploy

- Railway build: Dockerfile at `nhaav-backend/Dockerfile`
  (includes `tesseract-ocr` + `poppler-utils` + `alembic upgrade head` startup).
- Check the deploy log: startup must be clean, with no
  `ValueError: ... requires ... when ENVIRONMENT=production`.
- Railway must allow outbound TCP 587. If it is blocked, delivery fails with an
  `EmailDeliveryError` and the app keeps running.

### Before relying on it: send one real email

Do not trust the deploy because it booted. Registration on a fresh account is
the smallest end-to-end proof — see step 1 of section 4.

## 4. End-to-end smoke test (5 minutes, a browser + an inbox)

| # | Step | Expected |
|---|------|----------|
| 1 | From the frontend, register a new account with **a real inbox you control** | Redirects to "One more step: verify your email" |
| 2 | Check the inbox | Verification email arrives, links to `<frontend>/login?verify_token=…` |
| 3 | Check server logs | **No token anywhere in stdout**; the console backend logs recipient + subject only |
| 4 | Click the email link | Redirects through `/login` → `/verify-email` → "Email verified" |
| 5 | Sign in | Login succeeds, `/auth/me` shows `is_verified: true` |
| 6 | Log out, click "Forgot password?", enter the email | "Check your email" confirmation |
| 7 | Check the inbox | Reset email arrives, expires in 1 h |
| 8 | Click reset link, set a new password | "Password updated" → sign in with the new password works |
| 9 | Open the reset link a **second** time and reuse the token | Clean 400 — a reset link is single use |
| 10 | Click "Forgot password?" with a nonsense address | Same UI confirmation as a real address (no enumeration leak) |
| 11 | Browser console during all of the above | No CORS errors; preflight OPTIONS to `/auth/*` returns 2xx |
| 12 | Raise a support ticket from the popup | Ticket stored; notification reaches `SUPPORT_EMAIL` |

## 5. If something fails

- **`EmailDeliveryError: SMTP authentication was rejected`** → the App Password
  is wrong, still contains spaces, 2-Step Verification is off, or
  `SMTP_USERNAME` is not the full Gmail address.
- **No email arrives, no error** → check the Spam folder and the Gmail "Sent"
  label; confirm `EMAIL_BACKEND=smtp` locally (development defaults to
  `console`, which sends nothing).
- **Registration returns 503** → the verification email could not be sent. The
  account **was** created and is unverified; use "Resend verification" once
  delivery is fixed. The server log names the cause.
- **App refuses to start** → the log names the missing variable; add it.
- **Link opens the app but shows "invalid or expired"** → `JWT_SECRET` must be
  stable across restarts (tokens are signed with it), and `FRONTEND_URL` must
  match the deployed frontend origin exactly.
- **Gmail rejects the sender** → `SMTP_FROM_EMAIL` must be the authenticated
  Gmail account or a verified alias.

## 6. Only after all 12 checks pass

Mark the email/verification stack **production-verified** and record the date
and the person who executed it here:

> Executed by: ______________  Date: ______________  Result: ______________
