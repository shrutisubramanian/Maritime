-- Nhaav — READ-ONLY Supabase Storage inspection (separate from schema checks).
--
-- Use only if the role can read the `storage` schema. This script opens a
-- read-only transaction and returns aggregate/metadata rows only: no object
-- names, owner ids, paths or signed URLs. If it fails with a permission error,
-- schema inspection is unaffected because it is a separate transaction.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

-- Bucket metadata only.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;

-- Object count per bucket. No object names or paths are returned.
SELECT bucket_id, count(*) AS objects
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;

ROLLBACK;
