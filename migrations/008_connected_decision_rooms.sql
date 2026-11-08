-- New private planning feature. Does not alter or fabricate legacy plans/activity.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS launch_rooms (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name varchar(100) NOT NULL, description varchar(1000) NOT NULL DEFAULT '',
 event_date date, state text NOT NULL DEFAULT 'planning' CHECK (state IN ('planning','confirmed','cancelled')),
 selected_venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS launch_room_members (
 room_id uuid NOT NULL REFERENCES launch_rooms(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','left','removed')),
 invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), responded_at timestamptz,
 PRIMARY KEY(room_id,user_id)
);
CREATE TABLE IF NOT EXISTS launch_room_options (
 room_id uuid NOT NULL REFERENCES launch_rooms(id) ON DELETE CASCADE,
 venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
 proposed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(room_id,venue_id)
);
CREATE TABLE IF NOT EXISTS launch_room_votes (
 room_id uuid NOT NULL, venue_id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 choice text NOT NULL CHECK (choice IN ('yes','maybe','no')),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(room_id,venue_id,user_id),
 FOREIGN KEY(room_id,venue_id) REFERENCES launch_room_options(room_id,venue_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS launch_rooms_owner_idx ON launch_rooms(owner_id,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS launch_rooms_member_idx ON launch_room_members(user_id,status,room_id);
INSERT INTO launch_schema_versions(version) VALUES('connected-rooms-2026-09-09') ON CONFLICT DO NOTHING;
COMMIT;
