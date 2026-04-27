-- Migration 003: App Store Compliance + Push Notifications
-- Adds: content_reports, push_tokens, user_deletions (audit log)

BEGIN;

-- ─── Content Reports (UGC moderation) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','review','user','comment','message')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'spam','harassment','hate_speech','violence','sexual_content',
    'misinformation','illegal','impersonation','self_harm','other'
  )),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','actioned','dismissed')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  action_taken TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_target ON content_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON content_reports(reporter_id, created_at DESC);
-- Prevent a single user from spamming reports against the same target
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique ON content_reports(reporter_id, target_type, target_id)
  WHERE status IN ('open','reviewing');

-- ─── Push Notification Tokens ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  device_id TEXT,
  app_version TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_unique ON push_tokens(token, platform);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id, active);

-- ─── User Deletions Audit Log (required for App Store compliance) ────────
CREATE TABLE IF NOT EXISTS user_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email_hash TEXT,
  deletion_reason TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_deletions_date ON user_deletions(deleted_at DESC);

-- ─── Admin flag column on users (for shadowban / suspend) ───────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

COMMIT;