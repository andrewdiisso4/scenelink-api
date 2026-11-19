-- Isolated QA only. Explicitly apply after event_ingestion_staging.sql.
-- Never install at application startup or enable in a live environment.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Do not silently adopt or deduplicate a preexisting manual occurrence.
CREATE UNIQUE INDEX IF NOT EXISTS events_review_ticketmaster_identity
 ON events(source,external_id) WHERE source='ticketmaster' AND external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS event_ingestion_publications (
 source text NOT NULL CHECK(source='ticketmaster'),
 external_id text NOT NULL,
 event_id uuid NOT NULL UNIQUE REFERENCES events(id) ON DELETE RESTRICT,
 revision text NOT NULL CHECK(length(revision)=64),
 event_fingerprint text NOT NULL CHECK(length(event_fingerprint)=64),
 decision text NOT NULL CHECK(decision IN ('publish','cancel')),
 PRIMARY KEY(source,external_id),
 FOREIGN KEY(source,external_id) REFERENCES event_ingestion_records(source,external_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS event_ingestion_publication_reviews (
 source text NOT NULL,
 external_id text NOT NULL,
 revision text NOT NULL CHECK(length(revision)=64),
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 decision text NOT NULL CHECK(decision IN ('publish','cancel')),
 reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(source,external_id,revision),
 FOREIGN KEY(source,external_id) REFERENCES event_ingestion_publications(source,external_id) ON DELETE RESTRICT
);
COMMIT;
