-- ============================================================
-- SceneLink Phase 8 Launch Completion Migration
-- Additive, idempotent. Supports owner-QA launch flows.
-- ============================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Password reset/profile launch flow indexes
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_active_email ON users(LOWER(email)) WHERE is_active = true;


-- Account deletion audit table used by DELETE /api/auth/account.
CREATE TABLE IF NOT EXISTS user_deletions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  email_hash TEXT NOT NULL,
  deletion_reason TEXT,
  ip_address TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_deletions_date ON user_deletions(deleted_at DESC);

-- Plan invites table is used by /api/plans even when full collaboration stays beta-gated.
CREATE TABLE IF NOT EXISTS plan_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(plan_id, invitee_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_invites_invitee ON plan_invites(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_plan_invites_plan ON plan_invites(plan_id);

-- Minimal business account table so business-interest FK and business beta routes are safe.
CREATE TABLE IF NOT EXISTS business_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  venue_name VARCHAR(255),
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  tier VARCHAR(32) DEFAULT 'starter',
  phone VARCHAR(64),
  website VARCHAR(255),
  status VARCHAR(32) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  reset_token VARCHAR(128),
  reset_token_expires TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bu_email ON business_users(email);
CREATE INDEX IF NOT EXISTS idx_bu_venue ON business_users(venue_id);

-- Favorites/list QA paths
CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON favorites(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_list_venues_list_added ON list_venues(list_id, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_list_venues_venue ON list_venues(venue_id);

ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT;

-- Basic plan creation and venue attachment
CREATE TABLE IF NOT EXISTS plan_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  sort_order INT DEFAULT 0,
  arrival_time VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plan_id, venue_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_stops_plan ON plan_stops(plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_plan_stops_venue ON plan_stops(venue_id);
CREATE INDEX IF NOT EXISTS idx_plan_venues_plan_added ON plan_venues(plan_id, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_venues_venue ON plan_venues(venue_id);

-- Business-interest lead capture, separate from full business account checkout.
CREATE TABLE IF NOT EXISTS business_upgrade_interest (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_user_id UUID REFERENCES business_users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  venue_name VARCHAR(255),
  desired_tier VARCHAR(64),
  message TEXT,
  status VARCHAR(32) DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_interest_created ON business_upgrade_interest(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_interest_status ON business_upgrade_interest(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_interest_email ON business_upgrade_interest(LOWER(email));

-- Newsletter/contact admin review paths
CREATE INDEX IF NOT EXISTS idx_contact_created_status ON contact_messages(created_at DESC, status);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='newsletter_subscribers') THEN
    CREATE INDEX IF NOT EXISTS idx_newsletter_status_created ON newsletter_subscribers(status, subscribed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_newsletter_email_lower ON newsletter_subscribers(LOWER(email));
  END IF;
END$$;

COMMIT;
