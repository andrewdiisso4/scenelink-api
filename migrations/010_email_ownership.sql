-- Proposed release policy: existing password accounts remain unverified.
-- No account is deleted or silently granted ownership evidence.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_email text;
CREATE TABLE IF NOT EXISTS email_verification_tokens (
 token_hash char(64) PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 email text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS email_verification_user_time_idx ON email_verification_tokens(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS email_verification_expiry_idx ON email_verification_tokens(expires_at);
INSERT INTO launch_schema_versions(version) VALUES('email-ownership-2026-10-27') ON CONFLICT DO NOTHING;
COMMIT;
