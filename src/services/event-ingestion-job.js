'use strict';
const { persistBatch } = require('./event-ingestion-store');
const { stageTicketmaster, normalizeEvent } = require('./ticketmaster-staging');
const { acquireLease, releaseLease, reserveRequest, boundedTransport } = require('./event-provider-control');

async function runIngestion(db, { runId, scopeKey, observedAt, providerOptions = {}, collect = stageTicketmaster,
  refreshKnown = collect === stageTicketmaster, dailyLimit = 1000 }) {
  // A retry of a completed run never refetches/reapplies an older snapshot.
  const existing = await db.query('SELECT status FROM event_ingestion_runs WHERE run_id=$1::uuid', [runId]);
  if (existing.rows.length) return { runId, duplicate: true, status: existing.rows[0].status };
  const leaseToken = await acquireLease(db);
  if (!leaseToken) return { runId, status: 'busy', retryable: true };
  try {
    const done = await db.query('SELECT status FROM event_ingestion_runs WHERE run_id=$1::uuid', [runId]);
    if (done.rows.length) return { runId, duplicate: true, status: done.rows[0].status };
    const fetchImpl = boundedTransport({ reserve: () => reserveRequest(db, dailyLimit, leaseToken),
      fetchImpl: providerOptions.fetchImpl, pause: providerOptions.pause });
    let batch;
    try {
      batch = await collect({ ...providerOptions, fetchImpl });
      if (refreshKnown && batch.complete === true && batch.truncated === false) {
        const known = await db.query(`SELECT external_id FROM event_ingestion_observations
          WHERE source='ticketmaster' AND scope_key=$1
          ORDER BY last_detail_checked_at NULLS FIRST,last_seen_at,external_id LIMIT 10`, [scopeKey]);
        for (const { external_id: id } of known.rows) {
          const query = new URLSearchParams({ apikey: providerOptions.apiKey });
          const response = await fetchImpl(`https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(id)}.json?${query}`);
          if (response.status !== 404) {
            if (!response.ok) throw new Error('Known-ID refresh failed');
            const event = await response.json();
            if (event.id !== id || typeof event.name !== 'string' || !event.name.trim()) throw new Error('Invalid known-ID payload');
            batch.records.push(normalizeEvent(event, observedAt));
          }
          // Fair rotation includes 404s, but neither 404 nor this check timestamp
          // changes event status or last-seen freshness evidence.
          await db.query(`UPDATE event_ingestion_observations SET last_detail_checked_at=now()
            WHERE source='ticketmaster' AND external_id=$1 AND scope_key=$2`, [id,scopeKey]);
        }
      }
    } catch {
      await persistBatch(db, { runId, scopeKey, observedAt, status: 'failed', leaseToken });
      throw new Error('Provider collection failed; existing event records preserved');
    }
    const status = batch.complete === true && batch.truncated === false ? 'complete' : 'partial';
    const result = await persistBatch(db, { runId, scopeKey, observedAt, status, records: batch.records, leaseToken });
    if (Number(result.accepted_runs) !== 1) throw new Error('Lease expired; batch not accepted');
    return { status, ...result };
  } finally { await releaseLease(db, leaseToken); }
}
module.exports = { runIngestion };
