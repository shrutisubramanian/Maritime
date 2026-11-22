# Payment Submission & Verification — Implementation Report

**Scope:** Nhaav payment **submission** and admin **verification** for organization subscriptions.
Marketplace architecture, the access-token lifecycle and the subscription plan definitions are untouched.

> **ONLINE PAYMENT PROCESSING: NOT IMPLEMENTED**
>
> There is no Razorpay, Stripe or PayPal integration, no UPI integration, no card
> processing and no payment gateway. Nhaav uses an **external bank transfer**:
> the organization pays into the Nhaav bank account and this system records the
> submission for an admin to verify. Nothing is charged, captured or refunded by
> this software, and no gateway code exists in the repository.

---

## 1. Flow

```
Organization (any role)                       Nhaav admin
────────────────────────                      ─────────────
GET  /payments/instructions   ← configured bank details (never hardcoded)
POST /payments/submit         → PENDING subscription + SUBMITTED payment
                                              GET  /admin/payments/pending
                                              POST /admin/payments/{id}/approve → VERIFIED
                                                   └─ activates subscription + issues pack/passes
                                                      + opens access gate + audit + notification
                                              POST /admin/payments/{id}/reject  → REJECTED (+ reason)
```

Plans (server-side, single source of truth — see the subscription report):

| Plan | Price | Passes | Duration |
|---|---|---|---|
| `MONTHLY` | ₹1,000 (`100000` paise) | 10 | 1 month |
| `ANNUAL` | ₹10,000 (`1000000` paise) | 100 | 1 year |

## 2. Schema

### `payments`
`id` · `organization_id` → `organizations.id` (CASCADE) · `subscription_id` → `subscriptions.id` (SET NULL,
the PENDING order this payment activates) · `plan_id` → `subscription_plans.id` · `submitted_by` → `users.id`
(SET NULL) · **`amount_paise` (Integer, integer paise — never float)** · `currency` · `utr` · `payment_date` ·
`receipt_path` · `receipt_filename` · `receipt_content_type` · `receipt_size_bytes` · `notes` · `status` ·
`submitted_at` · `verified_at` · `verified_by` → `users.id` · `rejection_reason` · `created_at` · `updated_at`
Indexes: `(organization_id, status)`, `utr`, `status`, and the FK columns.

`verified_at` / `verified_by` record the **admin review decision** (on approval that is the verification; on
rejection it is the rejecting decision, explained by `rejection_reason`).

### `payment_audit_logs` (append-only)
`id` · `payment_id` → `payments.id` (CASCADE) · `organization_id` · `actor_id` → `users.id` ·
`actor_role` (`admin` | `organization`) · `action` (`submitted` | `approved` | `rejected` | `cancelled`) ·
`reason` · `detail` · `created_at`.
Mirrors the marketplace's `ModerationAuditLog` convention: **every** admin decision is auditable, and
submissions are recorded too so the chain is complete.

### Payment status lifecycle
`PENDING` (reserved) → `SUBMITTED` → `VERIFIED` | `REJECTED`; `CANCELLED` for abandonment.
**`SUBMITTED` never activates anything** — only `VERIFIED` does.

## 3. Server-side money and plan authority

- The amount is **always derived from the plan** (`plan.price_paise`) and stored as integer paise.
- The submit endpoint accepts an **optional** `amount_paise` *claim* only so a mismatch can be refused:
  claiming ₹1,000 while selecting the ₹10,000 annual plan (or the reverse) returns **400** and records
  nothing. The claim is never stored or trusted.
- Pass counts come from `plan.pass_count`; nothing in the payment layer hardcodes 10 or 100.
- There is **no update or delete surface** for a submitted payment, so neither the amount nor the plan can be
  changed after submission.

## 4. Duplicate protection

- **Same UTR/reference:** a second submission with a reference already live (`PENDING`/`SUBMITTED`/`VERIFIED`,
  case-insensitive) is refused with **409**. A *rejected* reference may be corrected and re-submitted.
- **Approval is idempotent:** approving an already-`VERIFIED` payment returns the existing state and creates
  **no second pack, no duplicate passes, and does not extend the subscription twice** (guarded in the service
  and by the UNIQUE index on `access_packs.subscription_id`).
- **Accidental duplicate active subscription:** approving a second payment for a plan the organization is
  already actively subscribed to returns **409**.
- A UTR is a **claim, not proof** — only an admin decision activates anything (asserted by test).

## 5. Approval is transactional

`approve_payment` performs the whole activation in **one** transaction:

1. verify the payment (status guard: only `SUBMITTED`),
2. activate the subscription (`activate_subscription(..., commit=False)`),
3. create the access pack of `plan.pass_count` passes (existing `AccessPack` / `AccessToken` rows),
4. set `organization.access_control_enabled = True`,
5. write the `payment_audit_logs` entry,
6. create the submitter's notification,
7. single `commit`.

Any failure rolls the whole thing back, so a **partially activated subscription is impossible**. On failure
of submission the written receipt file is removed as well, so no orphaned file is left behind.

## 6. Rejection

- Reason is **mandatory** (schema-enforced, ≥3 chars) and is stored and shown to the organization.
- Payment becomes `REJECTED`; the linked never-activated subscription becomes `CANCELLED`.
- **No access pack and no passes are created**; the organization remains unable to use paid access.
- Audit entry + notification with the reason are written.

## 7. Receipt upload (private)

Reuses the project's upload convention (`uploads/` storage + a DB reference) and adds the validation the
existing document upload lacks:

- **Extension** allow-list (default `pdf,jpg,jpeg,png`, configurable).
- **Declared content type** allow-list (default `application/pdf,image/jpeg,image/png`).
- **Size** limit (default 5 MB, configurable).
- **Path safety:** the client filename is never used on disk. Files are stored under a server-generated
  UUID name inside a fixed receipts directory; the supplied name is sanitised to a display label only.
  `../../../../evil.pdf` is stored safely (asserted by test).
- **Privacy:** receipts live outside any static mount (nothing is mounted statically), so the only way to read
  one is `GET /payments/{id}/receipt`, which authorizes the **admin** or a **member of the paying
  organization**; anyone else gets **404** so cross-organization existence is not leaked. Anonymous callers
  get **401**. The raw path is not routable (asserted by test).
- The frontend fetches receipts **with the caller's token as a blob** rather than linking a bare URL, so the
  token never lands in browser history or logs.

## 8. Bank details configuration

Bank details are **not hardcoded** anywhere — not in the backend and not in the frontend. They come from
backend configuration (environment), consistent with this project's `Settings` convention:

```
PAYMENT_BANK_ACCOUNT_HOLDER, PAYMENT_BANK_NAME, PAYMENT_BANK_ACCOUNT_NUMBER,
PAYMENT_BANK_IFSC, PAYMENT_BANK_BRANCH, PAYMENT_BANK_ACCOUNT_TYPE,
PAYMENT_INSTRUCTIONS, PAYMENT_CURRENCY
PAYMENT_RECEIPTS_DIR, PAYMENT_RECEIPT_MAX_BYTES,
PAYMENT_RECEIPT_ALLOWED_EXTENSIONS, PAYMENT_RECEIPT_ALLOWED_CONTENT_TYPES
```

All are **empty by default**: `GET /payments/instructions` reports `configured: false` and the UI explicitly
refuses to present an unconfigured account as payable. The repository contains no account numbers.

## 9. API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /payments/instructions` | authenticated (identity-only) | configured bank details |
| `POST /payments/submit` | authenticated (identity-only) | multipart: `plan_code`, `utr`, `payment_date`, `receipt`, `notes?`, `amount_paise?` |
| `GET /payments/my` | authenticated (identity-only) | the caller's OWN organization's payments (status + rejection reason) |
| `GET /payments/{id}/receipt` | admin or owning organization | private receipt download |
| `GET /admin/payments/pending` | **admin only** | review queue (org, plan, amount, UTR, payment date, receipt, submitted by/at) |
| `POST /admin/payments/{id}/approve` | **admin only** | verify → activate (transactional, idempotent) |
| `POST /admin/payments/{id}/reject` | **admin only** | reject with mandatory reason |

The organization-side endpoints deliberately use the **identity-only** dependency: an organization whose
subscription has expired (or whose passes are exhausted) has no valid access session, and it is exactly that
organization which must be able to submit a renewal payment. Data access stays organization-scoped in the
service, so no session gate is needed to pay — or to be refused.

## 10. Security properties (all under test)

- A **client, supplier or service provider cannot approve or reject** a payment (403 `Admin access required`),
  nor read the review queue.
- Unauthenticated callers are refused (401) on all payment and admin endpoints.
- **One organization cannot see another's payments**: `/payments/my` is org-scoped and a cross-organization
  receipt request returns 404.
- **Receipts are not public** (401 anonymous / 404 foreign / 200 owner+admin) and are not statically served.
- **The amount cannot be changed** after submission and is always server-derived; a mismatched claim is
  refused.
- **Plan price and pass count are always server-side**; an unknown plan code is refused (404).
- **Status cannot be forged:** extra `status` / `subscription_status` fields on submission are ignored and the
  payment stays `SUBMITTED` with the subscription `PENDING`.
- **A UTR alone proves nothing:** submission never activates, and the duplicate/approval guards stand.
- Every admin decision writes an **audit** row.

## 11. Frontend

- **[Payments](nhaav-frontend/src/pages/Payments/Payments.tsx)** (`/payments`, all three roles): plan cards
  with price/duration/pass count, Nhaav bank details from the API, a submission form (UTR, payment date,
  receipt, notes) and payment history with status chips, rejection reasons and a token-protected receipt
  viewer. If the account is unconfigured it says so instead of showing invented details.
- **[PendingPayments](nhaav-frontend/src/pages/Admin/PendingPayments.tsx)** (`/admin/payments`): the review
  queue with organization, plan, amount, UTR, payment date, receipt link, submitter and submitted-at, plus
  **Approve** and **Reject (reason required)** actions and inline result feedback.
- Navigation: “Billing & Access” added to the client/provider/supplier sidebars; “Pending Payments” added to
  the admin sidebar.
- Design tokens only (CSS variables from `src/constants/colors.ts` / `index.css`) — no raw colours, no bank
  details, and no gateway/UPI/card UI anywhere.

## 12. Migrations

- [a7b8c9d0e1f2](nhaav-backend/alembic/versions/a7b8c9d0e1f2_payment_submissions.py) (revises `f6a7b8c9d0e1`):
  creates `payments` + `payment_audit_logs` with indexes.
- [b8c9d0e1f2a3](nhaav-backend/alembic/versions/b8c9d0e1f2a3_notification_type_payment.py) (revises `a7b8c9d0e1f2`):
  adds the `payment` member to the notifications type, following the existing `moderation`-member precedent,
  with a downgrade that refuses while payment notifications exist.
- Verified: `upgrade head` → `downgrade f6a7b8c9d0e1` → `upgrade head` clean; **single head
  `b8c9d0e1f2a3`**; both tables and the enum member present after migrating.

## 13. Tests

[tests/test_payments.py](nhaav-backend/tests/test_payments.py) — **31 passed**:

| Requirement | Coverage |
|---|---|
| MONTHLY E2E: ₹1,000 → submit → admin sees it → approve → ACTIVE, 10 passes, org gated | `test_monthly_end_to_end_activates_and_issues_ten_passes` (also asserts audit rows, the activation notification, and that the member can then log in and sees 9/10 remaining) |
| ANNUAL E2E: ₹10,000 → submit → approve → 100 passes, ~1 year | `test_annual_end_to_end_issues_hundred_passes` |
| REJECTION: reason visible, no passes | `test_rejected_payment_creates_no_passes_and_shows_reason`, `test_rejection_requires_a_reason`, `test_verified_payment_cannot_be_rejected` |
| DUPLICATE: approving twice → one subscription/pack | `test_approving_twice_creates_only_one_pack_and_extends_once` |
| DUPLICATE UTR / duplicate active subscription | `test_same_utr_cannot_be_submitted_twice`, `test_second_payment_for_already_active_plan_is_refused` |
| WRONG AMOUNT denied | `test_mismatched_claimed_amount_is_refused`, `test_matching_claim_is_accepted_and_amount_is_server_derived` |
| CROSS-ORG isolation | `test_organization_cannot_see_another_organizations_payment`, `test_organizationless_user_cannot_submit` |
| RECEIPT security | `test_receipt_requires_authentication`, `test_receipt_is_never_publicly_served`, `test_receipt_content_is_returned_only_to_authorized_callers`, plus the four upload-validation tests and path-traversal test |
| Role denials / forging / UTR-is-not-proof | `TestAdminOnlyDecisions` (`test_non_admins_cannot_approve_or_reject`, `test_non_admins_cannot_list_pending_payments`, `test_unauthenticated_callers_are_refused`, `test_unknown_payment_is_404_for_admin`), `test_user_cannot_forge_status_or_subscription_state`, `test_utr_alone_never_activates_anything`, `test_amount_cannot_be_changed_after_submission` |
| No hardcoded bank details | `TestBankInstructions` (defaults unconfigured; values exposed only from configuration) |

### Regression
- Access-token + subscription + payment suites: **77/77 passed**.
- Marketplace baseline: **66/66** — frozen architecture intact.
- Auth regression subset: 8 failed / 8 passed — exactly the documented pre-existing triage buckets, nothing new.
- Frontend: `tsc --noEmit` clean; `vite build` succeeds (pre-existing chunk-size warning only).

## 14. Known decisions still required

1. **Renewal for a fully logged-out expired organization — BLOCKER for renewals.** Login is refused when a
   subscription has expired (as specified in the subscription phase), so once the organization's JWT also
   expires it can no longer reach `/payments` to renew. Today the window is the JWT lifetime
   (`JWT_EXPIRE_MINUTES`, default 24 h). Options: let a gated-but-unsubscribed organization log in **without**
   any access pass (gate moves to session level), or issue a signed renewal link. This changes previously
   specified login behavior, so it needs an explicit decision.
2. **Unused passes at expiry** — still UNDECIDED (carried over from the subscription phase).
3. **Verification evidence requirements** — is a receipt + UTR sufficient, or must the admin confirm against
   the bank statement before approving? (Current UI warns that confirmation is the admin's responsibility.)
4. **Refunds / partial payments / pro-rating** and **GST invoice generation** — not implemented.
5. **Notification targets** — the submitter is notified today; should every organization member (or an
   organization owner role) be notified too?
6. **Multiple pending submissions per organization** — currently allowed (each creates its own PENDING
   subscription); confirm whether the UI should block a second submission while one is awaiting review.

---

**ONLINE PAYMENT PROCESSING (gateway / UPI / cards): NOT IMPLEMENTED.**
Payment collection is an **offline bank transfer** recorded here for admin verification.
