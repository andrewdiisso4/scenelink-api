-- Complete clean-install discovery fields and isolate operator sessions.
-- Additive; does not approve claims or rewrite existing venue data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS vibe_tags JSONB DEFAULT '[]';
CREATE TABLE IF NOT EXISTS business_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  venue_name VARCHAR(255) NOT NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  tier VARCHAR(32) DEFAULT 'starter', phone VARCHAR(64), website VARCHAR(255),
  status VARCHAR(32) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);
ALTER TABLE business_users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE business_users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128);
ALTER TABLE business_users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS business_auth_revocations (
  token_hash CHAR(64) PRIMARY KEY,
  business_user_id UUID NOT NULL REFERENCES business_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS business_auth_revocations_expiry_idx ON business_auth_revocations(expires_at);
INSERT INTO launch_schema_versions(version) VALUES ('account-compatibility-2026-09-15') ON CONFLICT DO NOTHING;
COMMIT;
