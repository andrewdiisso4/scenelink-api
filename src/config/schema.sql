-- SceneLink Production Database Schema

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ==================== USERS ====================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  display_name VARCHAR(255),
  username VARCHAR(100) UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  neighborhood VARCHAR(100),
  city VARCHAR(100) DEFAULT 'Boston',
  role VARCHAR(20) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  oauth_provider VARCHAR(20),
  oauth_id VARCHAR(255),
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add OAuth + reset token columns to existing tables (safe ALTER for existing DBs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Index for OAuth lookups
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ==================== VENUES ====================
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'restaurant',
  category VARCHAR(50),
  cuisine VARCHAR(100),
  genre VARCHAR(100),
  address VARCHAR(500),
  neighborhood VARCHAR(100),
  city VARCHAR(100) DEFAULT 'Boston',
  state VARCHAR(10) DEFAULT 'MA',
  zip_code VARCHAR(20),
  lat DECIMAL(10,6),
  lng DECIMAL(10,6),
  description TEXT,
  short_desc TEXT,
  phone VARCHAR(30),
  website VARCHAR(500),
  email VARCHAR(255),
  price_level INTEGER DEFAULT 2,
  price_label VARCHAR(10),
  hours_json JSONB,
  hours_display VARCHAR(255),
  is_open_now BOOLEAN DEFAULT false,
  image_url TEXT,
  image_urls JSONB DEFAULT '[]',
  cover_image_url TEXT,
  rating DECIMAL(3,2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  buzz_score DECIMAL(4,2) DEFAULT 0,
  going_count INTEGER DEFAULT 0,
  friends_going INTEGER DEFAULT 0,
  cover_charge VARCHAR(50),
  dress_code VARCHAR(100),
  tags JSONB DEFAULT '[]',
  badges JSONB DEFAULT '[]',
  features JSONB DEFAULT '[]',
  vibe TEXT,
  highlight TEXT,
  why_hot TEXT,
  pair_with TEXT,
  spotlight BOOLEAN DEFAULT false,
  trending BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  time_slot VARCHAR(50) DEFAULT 'dinner',
  is_active BOOLEAN DEFAULT true,
  is_claimed BOOLEAN DEFAULT false,
  reservation_url TEXT,
  opentable_url TEXT,
  resy_url TEXT,
  yelp_url TEXT,
  google_maps_url TEXT,
  place_id VARCHAR(255),
  source VARCHAR(50) DEFAULT 'curated',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(slug);
CREATE INDEX IF NOT EXISTS idx_venues_type ON venues(type);
CREATE INDEX IF NOT EXISTS idx_venues_neighborhood ON venues(neighborhood);
CREATE INDEX IF NOT EXISTS idx_venues_cuisine ON venues(cuisine);
CREATE INDEX IF NOT EXISTS idx_venues_time_slot ON venues(time_slot);
CREATE INDEX IF NOT EXISTS idx_venues_featured ON venues(featured);
CREATE INDEX IF NOT EXISTS idx_venues_trending ON venues(trending);
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm ON venues USING gin(name gin_trgm_ops);

-- ==================== EVENTS ====================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  venue_name VARCHAR(255),
  venue_slug VARCHAR(255),
  venue_neighborhood VARCHAR(100),
  image_url TEXT,
  date DATE,
  start_time VARCHAR(50),
  end_time VARCHAR(50),
  price VARCHAR(50),
  is_featured BOOLEAN DEFAULT false,
  is_live BOOLEAN DEFAULT false,
  attending_count INTEGER DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);

-- ==================== ACTIVITIES (Social Feed) ====================
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  user_name VARCHAR(255),
  user_display_name VARCHAR(255),
  user_avatar TEXT,
  type VARCHAR(50) NOT NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  venue_name VARCHAR(255),
  venue_type VARCHAR(50),
  venue_neighborhood VARCHAR(100),
  venue_image TEXT,
  venue_rating DECIMAL(3,2),
  content TEXT,
  rating DECIMAL(3,2),
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);

-- ==================== FAVORITES ====================
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

-- ==================== LISTS ====================
CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lists_user ON lists(user_id);

CREATE TABLE IF NOT EXISTS list_venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, venue_id)
);

-- ==================== PLANS ====================
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  date DATE,
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_user ON plans(user_id);

CREATE TABLE IF NOT EXISTS plan_venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plan_id, venue_id)
);

CREATE TABLE IF NOT EXISTS plan_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plan_id, user_id)
);

-- ==================== REVIEWS ====================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  rating DECIMAL(3,2) NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_venue ON reviews(venue_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

-- ==================== CHECK-INS ====================
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_venue ON checkins(venue_id);
-- ==================== MIGRATIONS (idempotent ALTER for existing deploys) ====================
DO $$
BEGIN
  -- Add new venue columns if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='reservation_url') THEN
    ALTER TABLE venues ADD COLUMN reservation_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='opentable_url') THEN
    ALTER TABLE venues ADD COLUMN opentable_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='resy_url') THEN
    ALTER TABLE venues ADD COLUMN resy_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='yelp_url') THEN
    ALTER TABLE venues ADD COLUMN yelp_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='google_maps_url') THEN
    ALTER TABLE venues ADD COLUMN google_maps_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='place_id') THEN
    ALTER TABLE venues ADD COLUMN place_id VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='source') THEN
    ALTER TABLE venues ADD COLUMN source VARCHAR(50) DEFAULT 'curated';
  END IF;
END$$;
