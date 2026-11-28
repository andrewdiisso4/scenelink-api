-- Existing records are preserved. A legacy status of 'active' is not proof of confirmed opt-in.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  source VARCHAR(100) DEFAULT 'footer',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(32) DEFAULT 'active',
  subscribed_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS opt_in_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS opt_in_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opt_in_confirmed_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_opt_in_hash_idx
  ON newsletter_subscribers(opt_in_hash) WHERE opt_in_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_newsletter_email_lower ON newsletter_subscribers(LOWER(email));
-- Native app launch notifications are a separate opt-in, not the newsletter.
CREATE TABLE IF NOT EXISTS app_launch_waitlist (
  email VARCHAR(254) PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android','other')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_launch_waitlist(email,platform,requested_at)
SELECT DISTINCT ON (LOWER(email)) LOWER(email),
  CASE WHEN source='app_waitlist_ios' THEN 'ios' WHEN source='app_waitlist_android' THEN 'android' ELSE 'other' END,
  COALESCE(subscribed_at,NOW())
FROM newsletter_subscribers
WHERE source IN ('app_waitlist_ios','app_waitlist_android','app_waitlist_web','app-waitlist','ios-app-waitlist')
  AND status='active' AND LENGTH(email)<=254
  AND NOT EXISTS (SELECT 1 FROM launch_schema_versions WHERE version='newsletter-opt-in-2026-11-27')
ORDER BY LOWER(email),subscribed_at DESC NULLS LAST,id
ON CONFLICT (email) DO NOTHING;
INSERT INTO launch_schema_versions(version) VALUES('newsletter-opt-in-2026-11-27') ON CONFLICT DO NOTHING;
COMMIT;
