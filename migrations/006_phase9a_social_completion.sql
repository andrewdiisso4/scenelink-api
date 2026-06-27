-- ============================================================================
-- Phase 9A — Social completion migration (idempotent)
-- Adds: push_subscriptions (web push), realtime cursor helpers, media columns,
--       people-suggestion support, venue activity indexes, plan conversation link.
-- All statements are IF NOT EXISTS / additive — safe to re-run on every boot.
-- ============================================================================

-- ---- Posts: ensure media columns exist for photo support (capability-gated) ----
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_width  INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_height INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumb_url    TEXT;

-- ---- Users: ensure avatar + privacy columns exist ----
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_private       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_messages   TEXT    NOT NULL DEFAULT 'everyone'; -- everyone|friends|none

-- ---- Web push subscriptions (only used if VAPID keys configured) ----
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- ---- Plan <-> conversation link (plan chat) ----
ALTER TABLE plans ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

-- ---- Activity feed performance: composite indexes ----
CREATE INDEX IF NOT EXISTS idx_checkins_venue_created ON checkins(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_user_created  ON checkins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_created2    ON posts(user_id, created_at DESC);

-- ---- Notifications: ensure data column for routing payloads ----
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB;

-- ---- People suggestions support: trigram index on display_name already exists.
--      Add an index to speed up "friends-of-friends" suggestion queries. ----
CREATE INDEX IF NOT EXISTS idx_friendships_accepted_pair
  ON friendships(user_a_id, user_b_id) WHERE status = 'accepted';

-- ---- Media assets table (optional, used when object storage configured) ----
CREATE TABLE IF NOT EXISTS media_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  thumb_url   TEXT,
  mime_type   TEXT,
  width       INTEGER,
  height      INTEGER,
  bytes       INTEGER,
  kind        TEXT NOT NULL DEFAULT 'post', -- post|avatar|message|checkin
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_owner ON media_assets(owner_id, created_at DESC);
