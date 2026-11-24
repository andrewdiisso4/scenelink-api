-- Older migration 004 required an email hash on deletion receipts; migration
-- 003 used a nullable column. Normalize both histories before writing only the
-- account ID and deletion time. Existing receipts and their values are retained.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE user_deletions ALTER COLUMN email_hash DROP NOT NULL;
INSERT INTO launch_schema_versions(version) VALUES('account-deletion-receipts-2026-11-24') ON CONFLICT DO NOTHING;
COMMIT;
