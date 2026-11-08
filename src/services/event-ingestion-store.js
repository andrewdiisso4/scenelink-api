'use strict';
const { randomUUID } = require('node:crypto');

// One SQL statement makes the run receipt and accepted batch atomic. Record
// timestamps reject out-of-order completions; provider ID is the identity.
const SAVE_SQL = `
WITH accepted AS (
 INSERT INTO event_ingestion_runs(run_id,source,scope_key,observed_at,status,record_count)
 SELECT $1::uuid,'ticketmaster',$2,$3::timestamptz,$4,$5::int
 WHERE $7::uuid IS NULL OR EXISTS (SELECT 1 FROM event_ingestion_leases
   WHERE provider='ticketmaster' AND owner=$7::uuid AND expires_at > now())
 ON CONFLICT (run_id) DO NOTHING RETURNING run_id
), incoming AS (
 SELECT r FROM jsonb_array_elements($6::jsonb) r
 WHERE $4 = 'complete' AND EXISTS (SELECT 1 FROM accepted)
), saved AS (
 INSERT INTO event_ingestion_records(source,external_id,payload,provider_status,cancelled,first_seen_at,last_seen_at)
 SELECT 'ticketmaster',r->>'external_id',r,r->>'provider_status',
   (r->>'provider_status')='cancelled',$3::timestamptz,$3::timestamptz FROM incoming
 ORDER BY r->>'external_id'
 ON CONFLICT(source,external_id) DO UPDATE SET
   payload=EXCLUDED.payload, provider_status=EXCLUDED.provider_status,
   cancelled=EXCLUDED.cancelled,last_seen_at=EXCLUDED.last_seen_at
 WHERE EXCLUDED.last_seen_at > event_ingestion_records.last_seen_at
 RETURNING external_id
), seen AS (
 INSERT INTO event_ingestion_observations(source,external_id,scope_key,last_seen_at)
 SELECT 'ticketmaster',r->>'external_id',$2,$3::timestamptz FROM incoming
 CROSS JOIN (SELECT count(*) FROM saved) dependency
 ON CONFLICT(source,external_id,scope_key) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at
 WHERE EXCLUDED.last_seen_at > event_ingestion_observations.last_seen_at
 RETURNING external_id
)
SELECT (SELECT count(*)::int FROM accepted) AS accepted_runs,
       (SELECT count(*)::int FROM saved) AS saved_records,
       (SELECT count(*)::int FROM seen) AS observations`;

async function persistBatch(db, { runId = randomUUID(), scopeKey, observedAt, status, records = [], leaseToken = null }) {
  if (typeof scopeKey !== 'string' || !scopeKey.trim() || scopeKey.length > 1000) throw new Error('Explicit bounded scope required');
  if (typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))) throw new Error('Valid observation timestamp required');
  if (!['complete', 'partial', 'failed'].includes(status)) throw new Error('Invalid run status');
  if (!Array.isArray(records)) throw new Error('Records must be an array');
  const byId = new Map();
  if (status === 'complete') for (const r of records) {
    if (!r || r.source !== 'ticketmaster' || typeof r.external_id !== 'string' || !r.external_id.trim()
        || r.external_id.length > 300 || typeof r.provider_status !== 'string' || !r.provider_status.trim() || r.provider_status.length > 80 || r.is_active !== false || r.requires_review !== true) {
      throw new Error('Only inactive source records requiring review are accepted');
    }
    byId.set(r.external_id, r);
  }
  const values = [...byId.values()];
  const result = await db.query(SAVE_SQL, [runId, scopeKey, observedAt, status, values.length, JSON.stringify(values), leaseToken]);
  return { runId, ...result.rows[0] };
}

// Staleness is an age-based review signal, never proof of cancellation/deletion.
async function freshness(db, { scopeKey, asOf, maxAgeHours = 48 }) {
  if (!scopeKey || !Number.isFinite(Date.parse(asOf)) || !Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new Error('Invalid freshness scope/time');
  return (await db.query(`SELECT source,external_id,last_seen_at,
    last_seen_at < $2::timestamptz - ($3::double precision * interval '1 hour') AS stale
    FROM event_ingestion_observations WHERE scope_key=$1 ORDER BY external_id`, [scopeKey, asOf, maxAgeHours])).rows;
}
module.exports = { persistBatch, freshness };
