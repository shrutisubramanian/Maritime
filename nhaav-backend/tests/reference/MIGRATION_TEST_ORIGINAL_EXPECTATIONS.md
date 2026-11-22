# Original migration-test expectations (reference)

This file preserves what the migration tests asserted **before** the 2026-11-04
rewrite. The complete original test file is preserved verbatim at:

- `tests/reference/test_migrations_pre_rewrite.py.txt`
- SHA-256: `4f42084ec22b03ea976aa6d01ddc4c31058daba8847e12b76f4fb4a404f1f237`

Nothing below is current schema truth. It is a historical reference only.

## Original constants

```python
OLD_HEAD = "3f3cfac91e8a"
PRE_H9_HEAD = "d8e9f0a5b6c7"   # revision does not exist in this chain
HEAD = "f9a0b1c2d3e4"          # no longer head
```

Actual single head after inspection: **`c6d7e8f9a0b1`**. The immediate parent is
`b5a6c7d8e9f4`.

## Original expected tables

```python
EXPECTED_TABLES = {
    "quotes", "service_categories", "service_requests", "users", "documents",
    "jobs", "notifications", "profiles",
    "reviews", "services", "admin_accounts", "admin_audit_log",
    "rate_limit_events",
    "alembic_version",
}

H9_ORPHAN_TABLES = {"reports", "support_tickets", "favorite_providers"}
```

The original test expected the H9 migration to remove `reports`,
`support_tickets` and `favorite_providers`. **No such H9 revision exists in
`alembic/versions/`**, and all three tables are current ORM models
(`app/models/report.py`, `support_ticket.py`, `favorite_provider.py`) and are
present at head.

The original test also expected `admin_accounts` and `admin_audit_log`. Those
tables are not in the current models or migration chain. They were
create_all-era objects, not current schema.

## Original schema expectations that are no longer true

| Original assertion | Actual current schema |
|---|---|
| `services.subscription_id` exists | Does not exist. Subscription linkage is on `access_packs.subscription_id` and `payments.subscription_id`. |
| `services.expires_at` exists | **Does exist** (paid-placement expiry) and is retained in the rewrite. |
| `services` has `uq_provider_service_port` unique constraint | Does not exist. Current indexes are `ix_services_service_id`, `ix_services_port_id`, `ix_services_status`. |
| `quotes.scope_of_work` exists | Does not exist. Current additional column is `quotes.provider_accepted_at`. |
| `Profile.verification_status = VerificationStatus.under_review` | `under_review` belongs to `QuoteStatus`/`ReportStatus`, not `VerificationStatus`. Profile values are `pending`, `verified`, `rejected`. |
| `admin_accounts` / `admin_audit_log` tables and indexes exist | Not part of current schema. |
| Data migration backfills `services.service_id = ""`, `port_id = ""` | Later migrations add these as nullable with **no default**, so legacy rows remain `NULL`. `is_active=1` becomes `status='approved'`. |

## The seven failing tests and their replacements

| Original failing test | Why it failed | Rewritten test |
|---|---|---|
| `test_fresh_base_to_head_creates_all_tables` | Expected obsolete admin tables; asserted orphan tables absent despite no H9 revision | `test_fresh_base_to_head_creates_exact_current_schema` — exact 32-table set, no obsolete tables, head `c6d7e8f9a0b1` |
| `test_head_schema_has_reconciled_columns_and_constraints` | Expected `services.subscription_id`, admin tables/indexes, old unique constraint | `test_head_schema_has_reconciled_columns_and_constraints` — current service/quote/request/user/access columns, real indexes, partial quote index, and explicit absence checks |
| `test_enums_accept_new_members_via_orm` | Used removed `VerificationStatus.under_review` | `test_enums_accept_current_members_via_orm` — `VerificationStatus.pending`, `DocumentType.quotation`, `DocumentStatus.extracted` |
| `test_data_survives_upgrade_from_old_head` | Selected removed `services.subscription_id` and `quotes.scope_of_work`; expected `""` backfills | `test_data_survives_upgrade_from_old_head` — asserts NULL service keys, `status='approved'`, unchanged request/quote data, one row each |
| `test_upgrade_is_repeatable` | Asserted stale `HEAD` constant | `test_upgrade_is_repeatable` — actual head, second upgrade succeeds, no phantom rows |
| `test_downgrade_to_old_head_removes_changes_and_round_trips` | Downgraded to nonexistent `d8e9f0a5b6c7`; expected orphan-table round trip | `test_downgrade_one_revision_and_back_preserves_data` — downgrades to real parent `b5a6c7d8e9f4`, drops/restores the HEAD partial index, preserves document row |
| `test_adoption_schema_present_is_safe_noop` | Seeded `admin_accounts` and `under_review`; stamped head back to an old revision whose later migrations are not all guarded | `test_unmanaged_legacy_table_and_rows_survive_upgrade` — creates a non-Alembic table at `OLD_HEAD`, upgrades, verifies the table and row are untouched |

## Eighth test replaced (it passed but tested removed architecture)

`test_admin_tables_adoption_guard_preserves_existing_rows` created
`admin_accounts`/`admin_audit_log` out of band and asserted they survived. It
passed only because the migrations never touched those tables; it did not
validate any current application table. It is replaced by the unmanaged-table
preservation test above.

`test_production_startup_does_not_create_schema` was retained unchanged except
for being moved to the end of the file; it still proves startup leaves an empty
SQLite database with no tables.

## Coverage retained

- fresh install base → head
- exact current schema and constraints
- current enum round-trip through the ORM
- upgrade from `3f3cfac91e8a` with representative business rows
- unmanaged legacy table/row preservation
- repeatable `upgrade head`
- one-revision downgrade and re-upgrade with data preservation
- startup does not create schema

PostgreSQL-specific DDL and production data are still **not** exercised by
these tests; that remains the role of the staging checklist.
