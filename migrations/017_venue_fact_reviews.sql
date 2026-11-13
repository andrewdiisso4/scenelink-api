-- Additive only. Run deliberately before using the operator; no factual edits here.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS field_provenance JSONB NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS venue_fact_review_audit (
  id UUID PRIMARY KEY,
  operation TEXT NOT NULL CHECK (operation IN ('apply','rollback')),
  manifest_digest TEXT NOT NULL,
  operator TEXT NOT NULL,
  reverses UUID REFERENCES venue_fact_review_audit(id),
  records JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((operation = 'rollback') = (reverses IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS venue_fact_review_apply_digest
  ON venue_fact_review_audit(manifest_digest) WHERE operation = 'apply';
CREATE UNIQUE INDEX IF NOT EXISTS venue_fact_review_rollback_once
  ON venue_fact_review_audit(reverses) WHERE operation = 'rollback';

-- Reviewed duplicate suppression does not merge/delete rows or rewrite references.
-- No FK on duplicate_of: missing canonical must fail visible, not delete aliases.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS duplicate_of UUID;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS duplicate_review JSONB NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS venues_duplicate_of ON venues(duplicate_of) WHERE duplicate_of IS NOT NULL;
CREATE TABLE IF NOT EXISTS venue_duplicate_review_audit (
  id UUID PRIMARY KEY,
  operation TEXT NOT NULL CHECK (operation IN ('suppress','rollback')),
  manifest_digest TEXT NOT NULL,
  operator TEXT NOT NULL,
  reverses UUID REFERENCES venue_duplicate_review_audit(id),
  records JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((operation = 'rollback') = (reverses IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS venue_duplicate_review_apply_digest
  ON venue_duplicate_review_audit(manifest_digest) WHERE operation = 'suppress';
CREATE UNIQUE INDEX IF NOT EXISTS venue_duplicate_review_rollback_once
  ON venue_duplicate_review_audit(reverses) WHERE operation = 'rollback';
