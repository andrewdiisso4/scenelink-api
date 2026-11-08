-- Explicit local rehearsal only. Not in startup migration directories.
-- Reconciled locally with candidate v1 migrations 007–013; release approval still required.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS event_ingestion_runs (
  run_id uuid PRIMARY KEY,
  source text NOT NULL CHECK (source = 'ticketmaster'),
  scope_key text NOT NULL,
  observed_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('complete','partial','failed')),
  record_count integer NOT NULL CHECK (record_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS event_ingestion_records (
  source text NOT NULL CHECK (source = 'ticketmaster'),
  external_id text NOT NULL,
  payload jsonb NOT NULL,
  provider_status text NOT NULL,
  cancelled boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  requires_review boolean NOT NULL DEFAULT true CHECK (requires_review),
  is_active boolean NOT NULL DEFAULT false CHECK (NOT is_active),
  PRIMARY KEY (source, external_id)
);
CREATE TABLE IF NOT EXISTS event_ingestion_observations (
  source text NOT NULL,
  external_id text NOT NULL,
  scope_key text NOT NULL,
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY (source, external_id, scope_key),
  FOREIGN KEY (source, external_id) REFERENCES event_ingestion_records(source, external_id)
);
CREATE INDEX IF NOT EXISTS event_ingestion_observations_freshness
  ON event_ingestion_observations(scope_key, last_seen_at);
ALTER TABLE event_ingestion_observations ADD COLUMN IF NOT EXISTS last_detail_checked_at timestamptz;
CREATE TABLE IF NOT EXISTS event_ingestion_leases (
  provider text PRIMARY KEY CHECK(provider='ticketmaster'),
  owner uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS event_ingestion_quotas (
  provider text NOT NULL CHECK(provider='ticketmaster'),
  quota_day date NOT NULL,
  requests integer NOT NULL CHECK(requests > 0),
  PRIMARY KEY(provider,quota_day)
);
COMMIT;
