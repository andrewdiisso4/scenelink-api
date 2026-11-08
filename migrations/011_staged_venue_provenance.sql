-- Additive staging-import audit. Does not import or activate any venue.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS external_id text;
CREATE TABLE IF NOT EXISTS venue_import_batches (
 id uuid PRIMARY KEY,
 source text NOT NULL,
 source_release text NOT NULL,
 input_sha256 char(64) NOT NULL,
 provenance_sha256 char(64) NOT NULL,
 notices_sha256 char(64) NOT NULL,
 input_count integer NOT NULL CHECK(input_count>=0),
 source_report jsonb NOT NULL DEFAULT '{}',
 inserted_count integer NOT NULL DEFAULT 0,
 skipped_count integer NOT NULL DEFAULT 0,
 outcomes jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS venue_source_records (
 source text NOT NULL,
 external_id text NOT NULL,
 venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
 import_batch_id uuid NOT NULL REFERENCES venue_import_batches(id) ON DELETE RESTRICT,
 source_release text NOT NULL,
 provenance jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source,external_id)
);
CREATE INDEX IF NOT EXISTS venue_source_records_venue_idx ON venue_source_records(venue_id);
CREATE INDEX IF NOT EXISTS venue_external_source_lookup_idx ON venues(source,external_id) WHERE external_id IS NOT NULL;
INSERT INTO launch_schema_versions(version) VALUES('staged-venue-provenance-2026-10-27') ON CONFLICT DO NOTHING;
COMMIT;
