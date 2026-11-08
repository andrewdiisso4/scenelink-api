-- Additive local candidate. Rehearse on an authorized nonproduction copy first.
-- No synthetic achievements, external links, messages or engagement are inserted.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_revision integer NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discoverable boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_achievements boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS share_read_receipts boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS message_version bigint NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS send_body_hash text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS change_seq bigint NOT NULL DEFAULT 0;
-- Hash only the original send body. Reapplying never replaces an existing hash
-- with edited content and never resets a revision or synchronization watermark.
UPDATE messages SET send_body_hash=encode(sha256(convert_to(body,'UTF8')),'hex') WHERE send_body_hash IS NULL;
ALTER TABLE messages ALTER COLUMN send_body_hash SET NOT NULL;
WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY conversation_id ORDER BY created_at,id) AS n FROM messages)
UPDATE messages m SET change_seq=r.n FROM ranked r WHERE m.id=r.id AND m.change_seq=0;
UPDATE conversations c SET message_version=GREATEST(c.message_version,COALESCE((SELECT max(change_seq) FROM messages m WHERE m.conversation_id=c.id),0));
CREATE INDEX IF NOT EXISTS launch_message_changes_idx ON messages(conversation_id,change_seq);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='users'::regclass AND conname='launch_profile_revision_check') THEN
  ALTER TABLE users ADD CONSTRAINT launch_profile_revision_check CHECK(profile_revision>0);
  ALTER TABLE users ADD CONSTRAINT launch_social_links_check CHECK(jsonb_typeof(social_links)='array' AND jsonb_array_length(social_links)<=7);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='messages'::regclass AND conname='launch_message_revision_check') THEN
  ALTER TABLE messages ADD CONSTRAINT launch_message_revision_check CHECK(revision>0 AND change_seq>=0);
  ALTER TABLE messages ADD CONSTRAINT launch_message_hash_check CHECK(send_body_hash ~ '^[0-9a-f]{64}$');
 END IF;
END $$;
INSERT INTO launch_schema_versions(version) VALUES('social-profile-messaging-2026-10-30') ON CONFLICT DO NOTHING;
-- REVIEW CANDIDATE ONLY. Include inside migration013's transaction, before COMMIT.
-- Omitted legacy hashes are calculated once on INSERT, never on edit/delete.
-- Legacy zero-sequence inserts serialize with canonical writers on conversation.
CREATE OR REPLACE FUNCTION launch_legacy_message_insert_compat()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.send_body_hash IS NULL THEN
    NEW.send_body_hash := encode(sha256(convert_to(NEW.body,'UTF8')),'hex');
  END IF;
  IF NEW.change_seq = 0 THEN
    UPDATE conversations SET message_version=message_version+1
      WHERE id=NEW.conversation_id RETURNING message_version INTO NEW.change_seq;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS launch_legacy_message_insert_compat ON messages;
CREATE TRIGGER launch_legacy_message_insert_compat BEFORE INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION launch_legacy_message_insert_compat();

COMMIT;
