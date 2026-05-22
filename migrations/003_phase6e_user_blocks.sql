-- ============================================================
-- SceneLink Phase 6E Migration: user_blocks + supporting indexes
-- Closes the App-Store-best-practice block/unblock gap (Apple 1.2)
-- alongside the existing Report flow.
-- Idempotent. Additive only. Zero impact on existing queries.
-- ============================================================

BEGIN;

-- ============================================================
-- USER_BLOCKS
-- A blocks B  ->  B cannot:
--   - send a friend request to A
--   - DM A
--   - see A in user search results (via API filter)
-- B is not notified of the block (per safety best practice).
-- A unique (blocker_id, blocked_id) pair stops dupes.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_blocks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id),
  CONSTRAINT user_blocks_unique_pair UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

COMMIT;
