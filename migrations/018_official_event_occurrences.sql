-- Additive, explicitly deployed migration. No events are backfilled or published.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS official_event_occurrences (
    occurrence_key text PRIMARY KEY CHECK (occurrence_key ~ '^city-winery-boston:[a-z0-9]+(-[a-z0-9]+)*$'),
    event_id uuid NOT NULL UNIQUE REFERENCES events(id) ON DELETE RESTRICT,
    original_facts jsonb NOT NULL,
    staged_by uuid REFERENCES users(id) ON DELETE SET NULL,
    staged_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
COMMIT;
