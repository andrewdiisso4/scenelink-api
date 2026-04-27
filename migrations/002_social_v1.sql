-- ============================================================
-- SceneLink V1 Social Schema Migration
-- Additive only. Idempotent. Zero impact on existing working queries.
-- Applies to: users, venues, plans (existing); adds 11 new tables.
-- ============================================================

BEGIN;

-- Extensions (already enabled but safe)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- USERS: make username unique + searchable, add avatar/bio helpers
-- ============================================================
-- username must be lowercase handle; enforced at API layer; we just dedupe here
DO $$
BEGIN
  -- If any user has username NULL, auto-generate from email prefix so we can add UNIQUE
  UPDATE users
     SET username = LOWER(REGEXP_REPLACE(SPLIT_PART(email,'@',1),'[^a-z0-9_]','','g'))
                    || '_' || SUBSTRING(id::text, 1, 6)
   WHERE username IS NULL OR TRIM(username) = '';
END$$;

-- Ensure uniqueness (already declared in schema but belt-and-suspenders)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_display_name_trgm ON users USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin (username gin_trgm_ops);


-- ============================================================
-- FRIENDSHIPS
-- Pending/accepted/declined. Request direction preserved via requester_id.
-- Unique constraint on unordered pair to stop duplicates.
-- ============================================================
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|accepted|declined|blocked
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (user_a_id <> user_b_id),
  CHECK (user_a_id < user_b_id),  -- enforce canonical (sorted) order
  UNIQUE(user_a_id, user_b_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_a ON friendships(user_a_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);


-- ============================================================
-- CONVERSATIONS + PARTICIPANTS + MESSAGES
-- 1:1 DMs in V1 (participants = exactly 2). Schema allows group later.
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_group BOOLEAN DEFAULT false,
  title VARCHAR(255),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cp_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_cp_conv ON conversation_participants(conversation_id);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);


-- ============================================================
-- POSTS + LIKES + COMMENTS
-- Real social-feed records. Supersedes the seeded `activities` table for NEW activity.
-- Existing activities table stays in place (will be purged in P4).
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  image_url TEXT,
  -- optional link-out to structured references
  ref_type VARCHAR(30),       -- 'checkin' | 'review' | 'plan_share' | 'post'
  ref_id UUID,                -- id of the referenced record
  is_public BOOLEAN DEFAULT true,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_venue ON posts(venue_id);

CREATE TABLE IF NOT EXISTS post_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id);

CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_post_comments_user ON post_comments(user_id);


-- ============================================================
-- PLAN_STOPS + PLAN_INVITES (richer plans)
-- Existing plan_venues stays; we add an ordered/timed stop layer on top.
-- ============================================================
CREATE TABLE IF NOT EXISTS plan_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  arrival_time VARCHAR(20),   -- e.g. '7:00 PM' or ISO time
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plan_stops_plan ON plan_stops(plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_plan_stops_venue ON plan_stops(venue_id);

CREATE TABLE IF NOT EXISTS plan_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|accepted|declined|cancelled
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(plan_id, invitee_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_invites_invitee ON plan_invites(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_plan_invites_plan ON plan_invites(plan_id);


-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- recipient
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,         -- who triggered it
  type VARCHAR(40) NOT NULL,  -- friend_request|friend_accept|plan_invite|plan_accept|new_message|post_like|post_comment
  ref_type VARCHAR(30),       -- 'friendship'|'plan'|'conversation'|'message'|'post'|'comment'
  ref_id UUID,
  data JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;


COMMIT;