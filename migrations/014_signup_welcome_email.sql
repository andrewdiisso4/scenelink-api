-- Only newly created accounts are queued by application transactions. No backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS signup_welcome_emails (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 recipient_hash char(64) NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','accepted','unknown','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz,
 completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS signup_welcome_pending_idx ON signup_welcome_emails(created_at,user_id) WHERE status='pending';
INSERT INTO launch_schema_versions(version) VALUES('signup-welcome-2026-11-08') ON CONFLICT DO NOTHING;
COMMIT;
