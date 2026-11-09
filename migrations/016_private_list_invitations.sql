-- Consent-based private lists. Existing lists, public choices and venues are preserved.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE lists ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE lists ALTER COLUMN is_public SET DEFAULT false;
CREATE TABLE IF NOT EXISTS list_members (
 list_id uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','left','removed')),
 invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 invitation_id uuid NOT NULL DEFAULT uuid_generate_v4(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 responded_at timestamptz,
 PRIMARY KEY (list_id,user_id)
);
CREATE INDEX IF NOT EXISTS list_members_user_idx ON list_members(user_id,status,list_id);
-- A replay receipt survives list deletion, so a delayed create retry cannot resurrect it.
CREATE TABLE IF NOT EXISTS list_create_requests (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 client_id uuid NOT NULL,
 body_hash char(64) NOT NULL,
 list_id uuid REFERENCES lists(id) ON DELETE SET NULL,
 PRIMARY KEY(user_id,client_id)
);
-- Identifier-only reservations have no owner, content or timestamps. They survive
-- account deletion so old public links cannot be reassigned to another account.
CREATE TABLE IF NOT EXISTS list_id_reservations (id uuid PRIMARY KEY);
INSERT INTO list_id_reservations(id)
 SELECT id FROM lists UNION SELECT client_id FROM list_create_requests
 ON CONFLICT DO NOTHING;
-- A deleted list UUID cannot be claimed by another account and revive old links.
CREATE UNIQUE INDEX IF NOT EXISTS list_create_requests_client_idx ON list_create_requests(client_id);
INSERT INTO launch_schema_versions(version) VALUES('private-list-invitations-2026-11-09') ON CONFLICT DO NOTHING;
COMMIT;
