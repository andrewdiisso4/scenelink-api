-- Additive only: existing events remain stored, but require source review before publication.
-- This does not import events, approve their sources, or create provider reservations.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE events ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_url text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_review_status text NOT NULL DEFAULT 'unreviewed';
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_reviewed_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS event_source_reviews (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
 source text NOT NULL,
 source_url text NOT NULL,
 external_id text,
 status text NOT NULL CHECK(status IN ('reviewed','rejected','unreviewed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_source_reviews_event_idx ON event_source_reviews(event_id,created_at DESC);
CREATE TABLE IF NOT EXISTS event_rsvps (
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('going','interested','not_going')),
 audience text NOT NULL DEFAULT 'private' CHECK(audience IN ('private','public')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,user_id)
);
CREATE INDEX IF NOT EXISTS event_rsvps_user_idx ON event_rsvps(user_id,updated_at DESC,event_id);
CREATE INDEX IF NOT EXISTS event_rsvps_public_going_idx ON event_rsvps(event_id) WHERE status='going' AND audience='public';
INSERT INTO launch_schema_versions(version) VALUES('event-rsvps-2026-10-30') ON CONFLICT DO NOTHING;
COMMIT;
