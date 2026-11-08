#!/usr/bin/env node
'use strict';
// Dormant local rehearsal entry point. No default live request or DB fallback.
const fs = require('node:fs/promises');
const { Pool } = require('pg');
const { persistBatch, freshness } = require('../src/services/event-ingestion-store');
const { runIngestion } = require('../src/services/event-ingestion-job');
async function main() {
  const [fixturePath, runId] = process.argv.slice(2);
  if (!fixturePath || !runId || process.env.QA_ISOLATED_DATABASE !== 'true') throw new Error('Usage: QA_ISOLATED_DATABASE=true DATABASE_URL=<local test DB> node qa/run-event-ingestion.cjs <fixture.json> <stable-run-uuid>');
  const url = new URL(process.env.DATABASE_URL);
  if (!['127.0.0.1','[::1]'].includes(url.hostname) || !/^\/scenelink_[a-z0-9_]+_test$/.test(url.pathname)
      || url.search || url.hash || !url.port || !['postgres:','postgresql:'].includes(url.protocol)) throw new Error('Disposable loopback test database required');
  const providerMode = fixturePath === '--ticketmaster';
  if (providerMode && process.env.ENABLE_PROVIDER_FETCH !== 'true') throw new Error('Provider requests disabled');
  const batch = providerMode ? {
    scopeKey: JSON.stringify(['ticketmaster','US','MA',process.env.EVENT_CITY || 'Boston',process.env.EVENT_START,process.env.EVENT_END]),
    observedAt: new Date().toISOString(),
    providerOptions: { apiKey: process.env.TICKETMASTER_API_KEY, city: process.env.EVENT_CITY || 'Boston',
      startDateTime: process.env.EVENT_START, endDateTime: process.env.EVENT_END },
  } : JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(runId)) throw new Error('Explicit run UUID required');
  if (providerMode && (!batch.providerOptions.apiKey || !Number.isFinite(Date.parse(batch.providerOptions.startDateTime))
      || !Number.isFinite(Date.parse(batch.providerOptions.endDateTime))
      || Date.parse(batch.providerOptions.startDateTime) >= Date.parse(batch.providerOptions.endDateTime))) throw new Error('Provider configuration required');
  const pool = new Pool({ connectionString: url.href, ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
  try {
    console.log(JSON.stringify(await (providerMode ? runIngestion : persistBatch)(pool, { ...batch, runId })));
    console.log(JSON.stringify(await freshness(pool, { scopeKey: batch.scopeKey, asOf: new Date().toISOString() })));
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Event ingestion rehearsal failed; verify local configuration and fixture.'); process.exitCode=1; });
