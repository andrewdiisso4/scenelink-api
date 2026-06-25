-- ============================================================
-- SceneLink Phase 8C — Universal Search + Social Completion Support
-- Additive/idempotent. Supports /api/search/universal and social badges.
-- ============================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Fast universal venue search.
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm ON venues USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_venues_cuisine_trgm ON venues USING gin (cuisine gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_venues_neighborhood_trgm ON venues USING gin (neighborhood gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_venues_type_category ON venues(type, category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_venues_buzz_rating ON venues(buzz_score DESC NULLS LAST, rating DESC NULLS LAST) WHERE is_active = true;

-- Social launch indexes. Tables are created by 002_social_v1.sql; these stay safe on existing prod.
CREATE INDEX IF NOT EXISTS idx_posts_public_created ON posts(created_at DESC) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_messages_unread_lookup ON messages(conversation_id, sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_user_read ON conversation_participants(user_id, conversation_id, last_read_at);
CREATE INDEX IF NOT EXISTS idx_friendships_pending_incoming ON friendships(status, requester_id, user_a_id, user_b_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

COMMIT;
