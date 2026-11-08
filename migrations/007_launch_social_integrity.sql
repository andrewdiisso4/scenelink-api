-- Additive, repeatable migration. No seeded users, posts, engagement, or venue data.
-- Requires a backup and isolated integration run before production deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS auth_revocations (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_revocations_expiry_idx ON auth_revocations(expires_at);
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS last_read_message_id uuid;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS audience text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'private';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='posts'::regclass AND conname='launch_posts_audience_check') THEN
    ALTER TABLE posts ADD CONSTRAINT launch_posts_audience_check CHECK (audience IS NULL OR audience IN ('public','friends','private'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='checkins'::regclass AND conname='launch_checkins_audience_check') THEN
    ALTER TABLE checkins ADD CONSTRAINT launch_checkins_audience_check CHECK (audience IN ('public','friends','private'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS launch_posts_cursor_idx ON posts(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS launch_user_posts_cursor_idx ON posts(user_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS launch_comments_cursor_idx ON post_comments(post_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS launch_messages_cursor_idx ON messages(conversation_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS launch_venue_name_idx ON venues(lower(name),id) WHERE is_active;
CREATE TABLE IF NOT EXISTS launch_schema_versions (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO launch_schema_versions(version) VALUES ('social-search-2026-09-09') ON CONFLICT DO NOTHING;
COMMIT;
