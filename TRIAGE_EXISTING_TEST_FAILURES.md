# TRIAGE_EXISTING_TEST_FAILURES.md

**Scope:** Triage of the 82 pre-existing full-suite test problems. **Documentation only** —
no application behavior, marketplace code, payment code, or tests were modified for this document.

## Established baseline (unchanged)

Command: `cd nhaav-backend && .venv/Scripts/python.exe -m pytest tests/ -q --continue-on-collection-errors`

| Passed | Failed | Errors | Total problems |
| --- | --- | --- | --- |
| **218** | **60** | **22** | **82** |

- All 82 were classified **category A: pre-existing, unrelated to the marketplace work**
  (zero caused by it). A verification rerun on 2026-10-06 reproduced the same failing node
  IDs bucket-for-bucket; the counts above remain the established baseline.
- **Marketplace-unrelated proof:** no failing test references `Service`/`SupplyListing`/
  `ModerationService`/marketplace routers; the code exercised (`QuoteService`, `JobService`,
  `ReviewService`, auth/registration, OCR, seeds, migrations) predates the marketplace work;
  every bucket fails identically in isolation; and the marketplace suites themselves are
  fully green (see baseline at the end).

---

## Bucket triage

### 1. H7 OCR/confidence module gaps — 11
- **Root cause:** tests import/exercise OCR-confidence pipeline members that do not exist yet (`app` OCR/confidence module surface incomplete for phase H7).
- **Representative:** `tests/test_h7_confidence.py::TestGoldenGroundTruth::test_bank_rows_are_aligned`, `::TestMetricSemantics::test_completion_rate_and_missing_fields_agree`, `::TestUploadAPIContract::test_upload_response_contains_honest_metrics`, `::TestPipelineBehavior::test_process_document_honest_contract[docx]`
- **Marketplace-unrelated:** confirmed yes (no marketplace imports).
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_h7_confidence.py -q`
- **Timing:** defer (H7 phase feature work).

### 2. Missing `app.seed_demo` / `app.seed_verification` — 10
- **Root cause:** both modules do not exist; the seed-guard contract tests import them and assert production-import refusals.
- **Representative:** `tests/test_seed_demo_guard.py::TestSeedDemoProductionGuard::test_production_import_refused`, `tests/test_seed_verification_guard.py::TestSeedVerificationProductionGuard::test_module_exports_seed_function`
- **Marketplace-unrelated:** confirmed yes.
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_seed_demo_guard.py tests/test_seed_verification_guard.py -q`
- **Timing:** defer (demo-seeding guard is a pre-launch nice-to-have, not a launch blocker).

### 3. `app.models.admin_account` collection errors — 10
- **Root cause:** collection-time `ImportError` — `app.models.admin_account` (and related admin modules) missing; ten whole test files cannot collect, including two security suites.
- **Representative (module-level ERRORs):** `tests/test_admin_auth_separation.py`, `tests/test_admin_seed.py`, `tests/test_admin_verification.py`, `tests/test_docs_gating.py`, `tests/test_email_and_reset.py`, `tests/test_h10_rate_limit.py`, `tests/test_h6_cors.py`, `tests/test_security_critical.py`, `tests/test_security_fixes.py`, `tests/test_storage_h3.py`
- **Marketplace-unrelated:** confirmed yes (admin moderation uses the existing `User.role == admin`; `admin_account` is a separate unstarted spec).
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_admin_auth_separation.py -q`
- **Timing:** **fix before production** (recommended) — an unresolvable import silently removes security/admin test coverage from every run.

### 4. Missing `Profile.skills` — 8
- **Root cause:** tests reference a `Profile.skills` column that is not on the model; per-test ERRORs at setup.
- **Representative:** `tests/test_h4_skills.py::test_h4_skills_round_trip_via_profile_update`, `::test_h4_skill_filter_no_longer_500s`
- **Marketplace-unrelated:** confirmed yes.
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_h4_skills.py -q`
- **Timing:** defer (H4 skills phase).

### 5. Future H9 orphan migration/module — 8
- **Root cause:** tests expect an H9 orphan-model cleanup migration plus removal of orphan model/schema files that were never shipped.
- **Representative:** `tests/test_h9_orphan_models.py::test_upgrade_to_head_drops_orphan_tables`, `::test_models_init_does_not_import_orphans`
- **Marketplace-unrelated:** confirmed yes.
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_h9_orphan_models.py -q`
- **Timing:** defer (H9 cleanup phase).

### 6. Future migration revisions/columns — 8
- **Root cause:** tests expect a future migration head `f9a0b1c2d3e4` and columns (`subscription_id`, `expires_at`, …) that are not in the current chain (current head: `c3d4e5f6a7b8`).
- **Representative:** `tests/test_migrations.py::test_fresh_base_to_head_creates_all_tables`, `::test_head_schema_has_reconciled_columns_and_constraints`, `::test_enums_accept_new_members_via_orm`
- **Marketplace-unrelated:** confirmed yes (the actual chain upgrades/downgrades cleanly).
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_migrations.py -q`
- **Timing:** defer (forward-looking spec contracts for unstarted phases).

### 7. H5 notification gaps — 7
- **Root cause:** job/quote/review notification fan-out gaps (phase H5); fail in isolation too.
- **Representative:** `tests/test_h5_notification.py::TestCreateQuoteNotification::test_client_notified`, `::TestCancelJobNotification::test_client_notified`, `::TestCompleteJobNotification::test_provider_notified`, `::TestCreateReviewNotification::test_provider_notified`
- **Marketplace-unrelated:** confirmed yes (does not touch `Service`/marketplace code).
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_h5_notification.py -q`
- **Timing:** defer (H5 phase), though quote/job notifications are user-visible once those flows go live.

### 8. H8 registration name-field contract — 7
- **Root cause:** registration does not fulfil the H8 name-field contract (full-name canonicalization / conflicting-field handling).
- **Representative:** `tests/test_h8_registration_profile_contract.py::test_1_register_with_full_name_only`, `::test_4_register_with_conflicting_name_fields_fails`, `::test_7_auth_me_response_contains_canonical_user_name`
- **Marketplace-unrelated:** confirmed yes.
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_h8_registration_profile_contract.py -q`
- **Timing:** **fix before production** (user-facing registration path).

### 9. Admin verification / admin honesty contract — 4
- **Root cause:** per-test ERRORs from importing the missing `admin_account`/admin-verification modules (same root as bucket 3, manifesting inside a collected file).
- **Representative:** `tests/test_h9_admin_honesty_contract.py::TestNoInventedScores::test_provider_without_documents_gets_null_score_not_85`
- **Marketplace-unrelated:** confirmed yes.
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_h9_admin_honesty_contract.py -q`
- **Timing:** defer; resolves together with bucket 3.

### 10. Concurrency in `quote_service.accept_quote` — 3
- **Root cause:** `accept_quote` lacks an atomic guard — two competing quotes can be accepted, and awarded requests can be cancelled/manually awarded via races (no 409 on the losing path).
- **Representative:** `tests/test_concurrency.py::test_simultaneous_acceptance_of_two_competing_quotes`, `::test_owner_cannot_award_request_manually`, `::test_cannot_cancel_awarded_request_via_put`
- **Marketplace-unrelated:** confirmed yes (request/quote lifecycle, not listings).
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_concurrency.py -q`
- **Timing:** **fix before production** (double-acceptance is a correctness/trust risk in the core procurement flow).

### 11. Missing `DocumentType.quotation` — 2
- **Root cause:** `DocumentType` enum lacks the `quotation` member the document-type contract expects.
- **Representative:** `tests/test_h9_cpr_doctype.py::TestSelectedTypePersists::test_tax_invoice_and_quotation_types_persist`, `::test_kyc_document_is_not_reclassified`
- **Marketplace-unrelated:** confirmed yes.
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_h9_cpr_doctype.py -q`
- **Timing:** small fix; **fix before production** recommended (selected document type silently does not persist).

### 12. Missing `app.services.email_service` — 1
- **Root cause:** module absent; the full auth-flow test cannot complete (email dispatch step).
- **Representative:** `tests/test_auth_flow.py::test_full_auth_flow`
- **Marketplace-unrelated:** confirmed yes.
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_auth_flow.py::test_full_auth_flow -q`
- **Timing:** **fix before production** (auth/verification emails are a launch requirement).

### 13. Missing `/admin/verification/stats` route — 1
- **Root cause:** route not implemented; the admin route-contract test asserts it exists.
- **Representative:** `tests/test_h9_shipowner_admin_contract.py::TestRouteContract::test_live_backend_routes_exist`
- **Marketplace-unrelated:** confirmed yes.
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_h9_shipowner_admin_contract.py -q`
- **Timing:** defer (admin phase).

### 14. H9 upload/OCR contract gap — 1
- **Root cause:** upload surface does not yet satisfy the H9 upload/OCR contract.
- **Representative:** `tests/test_h9_upload_contract.py::TestCanonicalSurfaceIntact::test_real_api_upload_contract_unchanged`
- **Marketplace-unrelated:** confirmed yes.
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_h9_upload_contract.py -q`
- **Timing:** defer (H9 phase).

### 15. `test_service_listings` blocked at import — 1
- **Root cause:** the file imports the missing `email_service` and errors at collection; its listing-uniqueness semantics are already fully covered by the marketplace suites.
- **Representative:** `tests/test_service_listings.py::test_service_listing_uniqueness` (collection ERROR)
- **Marketplace-unrelated:** confirmed yes (coverage exists elsewhere).
- **Repro:** `.venv/Scripts/python.exe -m pytest tests/test_service_listings.py -q`
- **Timing:** defer — unblocks automatically when bucket 12 (`email_service`) lands.

---

## Production-readiness rollup

| Verdict | Buckets |
| --- | --- |
| **Fix before production** | #3 admin_account (blocks security-test collection), #8 H8 registration, #10 accept_quote concurrency, #11 DocumentType.quotation, #12 email_service |
| **Defer** | #1 H7 OCR/confidence, #2 seed modules, #4 Profile.skills, #5 H9 orphan cleanup, #6 future migrations, #7 H5 notifications, #9 admin verification, #13 /admin/verification/stats, #14 H9 upload, #15 test_service_listings (auto-resolves with #12) |

---

## MARKETPLACE BASELINE

- Security: 32/32
- Marketplace regression: 66/66
- Frontend typecheck: PASS
- Frontend build: PASS
- Alembic: PASS
- Marketplace architecture: FROZEN

## PAYMENT BASELINE

- Payment implementation: NOT STARTED
