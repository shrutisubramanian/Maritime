-- Nhaav — READ-ONLY Supabase/PostgreSQL inspection.
--
-- Run this in the Supabase SQL editor (or `psql`) against the TARGET project.
-- It opens a read-only transaction, so every statement below can only SELECT.
-- Nothing is created, altered, inserted, updated or deleted. No user rows,
-- emails, UTRs, document paths or other record-level data are returned: only
-- counts, column definitions, indexes and enum labels.
--
-- Requires the `postgres` role (or a role that can read pg_catalog and
-- information_schema). Sections 4-11 require the application tables to exist;
-- on an EMPTY staging project run only sections 1-3, then migrate, then run the
-- full file. Storage is inspected separately by supabase_storage_inspection.sql
-- so a storage permission error cannot abort the schema inspection.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

-- 1. Connection identity (which project/role is being inspected).
SELECT
    current_database() AS database,
    current_user       AS role,
    version()          AS server_version;

-- 2. Is Alembic installed? This is safe on an empty database.
SELECT to_regclass('public.alembic_version') IS NOT NULL AS has_alembic_version;

-- Only when has_alembic_version is true, run this as a SEPARATE query:
--   SELECT version_num AS alembic_version FROM public.alembic_version;
-- Expected head for this codebase: c6d7e8f9a0b1. It is intentionally not run
-- here because referencing a missing table would abort the whole read-only
-- transaction on an empty project.

-- 3. Application tables present (public schema), with planner row estimates
--    and on-disk size. reltuples is an ESTIMATE; exact counts are below.
SELECT
    c.relname                              AS table_name,
    GREATEST(c.reltuples, 0)::bigint       AS estimated_rows,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- 4. Exact row counts for the tables that decide launch readiness. Counts only
--    — never SELECT * from these tables in an inspection.
SELECT 'users' AS table_name, count(*) AS row_count FROM public.users
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'payments', count(*) FROM public.payments
UNION ALL SELECT 'subscriptions', count(*) FROM public.subscriptions
UNION ALL SELECT 'access_packs', count(*) FROM public.access_packs
UNION ALL SELECT 'access_tokens', count(*) FROM public.access_tokens
UNION ALL SELECT 'documents', count(*) FROM public.documents
UNION ALL SELECT 'listing_fees', count(*) FROM public.listing_fees
UNION ALL SELECT 'profile_visibilities', count(*) FROM public.profile_visibilities
UNION ALL SELECT 'support_tickets', count(*) FROM public.support_tickets
UNION ALL SELECT 'refresh_sessions', count(*) FROM public.refresh_sessions
UNION ALL SELECT 'rate_limit_events', count(*) FROM public.rate_limit_events
ORDER BY table_name;

-- 5. Columns this release depends on. `alembic_version = c6d7e8f9a0b1` should
--    have every one of these.
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
        (table_name = 'access_tokens'
         AND column_name IN ('available_at', 'unused_expires_at', 'status',
                             'owner_user_id', 'current_user_id', 'pack_id'))
     OR (table_name = 'access_packs'
         AND column_name IN ('owner_user_id', 'subscription_id', 'token_count', 'status'))
     OR (table_name = 'subscriptions'
         AND column_name IN ('plan_id', 'status', 'starts_at', 'expires_at'))
     OR (table_name = 'subscription_plans'
         AND column_name IN ('code', 'price_paise', 'duration_value', 'duration_unit', 'pass_count'))
     OR (table_name = 'payments'
         AND column_name IN ('plan_id', 'subscription_id', 'owner_user_id',
                             'amount_paise', 'utr', 'status'))
     OR (table_name = 'users'
         AND column_name IN ('access_control_enabled', 'active_device_id'))
  )
ORDER BY table_name, column_name;

-- 6. Indexes and constraints, especially the partial unique indexes that keep
--    one ACTIVE pass per owner and one live payment per UTR.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
        'access_tokens', 'access_packs', 'subscriptions', 'payments',
        'listing_fees', 'profile_visibilities', 'quotes'
  )
ORDER BY tablename, indexname;

-- 7. Enum labels. A missing label here makes the ORM fail at write time.
SELECT t.typname AS enum_type, e.enumlabel AS label
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;

-- 8. Live-UTR duplicate CHECK (aggregate only; no UTR values returned).
--    Any non-zero count means the partial unique index is missing or bypassed.
SELECT 'payments' AS table_name, count(*) AS duplicate_utr_groups
FROM (
    SELECT utr
    FROM public.payments
    GROUP BY utr
    HAVING count(*) > 1
) duplicates
UNION ALL
SELECT 'listing_fees', count(*)
FROM (
    SELECT utr FROM public.listing_fees GROUP BY utr HAVING count(*) > 1
) duplicates
UNION ALL
SELECT 'profile_visibilities', count(*)
FROM (
    SELECT utr FROM public.profile_visibilities GROUP BY utr HAVING count(*) > 1
) duplicates;

-- 9. Referential orphans (counts only). With FKs enforced these must be 0.
SELECT 'access_tokens.owner_user_id' AS relation, count(*) AS orphan_rows
FROM public.access_tokens t
LEFT JOIN public.users u ON u.id = t.owner_user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'access_packs.owner_user_id', count(*)
FROM public.access_packs p
LEFT JOIN public.users u ON u.id = p.owner_user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'subscriptions.plan_id', count(*)
FROM public.subscriptions s
LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
WHERE p.id IS NULL;

-- 10. Pass-expiry distribution (counts only), to confirm the 6/12-month policy
--     is what production actually stamped and what legacy rows still carry.
SELECT
    status,
    CASE
        WHEN unused_expires_at IS NULL THEN 'no_expiry_stamped'
        WHEN unused_expires_at <= now() THEN 'already_expired'
        WHEN unused_expires_at <= now() + interval '1 month' THEN 'expires_30d'
        WHEN unused_expires_at <= now() + interval '6 months' THEN 'expires_6m'
        WHEN unused_expires_at <= now() + interval '12 months' THEN 'expires_12m'
        ELSE 'beyond_12m'
    END AS expiry_bucket,
    count(*) AS passes
FROM public.access_tokens
GROUP BY status, expiry_bucket
ORDER BY status, expiry_bucket;

-- 11. RLS status per public table. Supabase's anon/authenticated keys must not
--     reach these tables directly; the API is the only intended entry point.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

ROLLBACK;

-- If your tool refuses `BEGIN TRANSACTION READ ONLY`, run the same SELECTs
-- individually in a read-only replica or with:
--   psql "postgresql://.../postgres?options=-c%20default_transaction_read_only%3Don"
