'use strict';
// Exact-candidate API boundary: inactive provider staging never grants public
// visibility, source approval, booking or RSVP eligibility.
module.exports = async ({ api, pool, check, crypto, req, root }) => {
  const assert = req('node:assert/strict'), fs = req('node:fs'), path = req('node:path');
  const { persistBatch } = req('./src/services/event-ingestion-store');
  const { runIngestion } = req('./src/services/event-ingestion-job');
  const snapshot = async () => {
    const out = {};
    for (const table of ['events','event_source_reviews','event_rsvps']) {
      out[table] = (await pool.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows;
    }
    return out;
  };
  const before = await snapshot(), externalId = crypto.randomUUID();
  await check('inactive event staging coexists with migrations007-013 and cannot appear in public APIs or accept RSVPs', async () => {
    const migration = fs.readFileSync(path.join(root,'qa/migrations/event_ingestion_staging.sql'),'utf8');
    await pool.query(migration); await pool.query(migration);
    const batch = {runId:crypto.randomUUID(),scopeKey:'isolated-api-fixture',observedAt:new Date().toISOString(),status:'complete',records:[{
      source:'ticketmaster',external_id:externalId,title:'Fictional Staging Only Fixture',provider_status:'onsale',requires_review:true,is_active:false,
    }]};
    assert.equal((await persistBatch(pool,batch)).saved_records,1);
    assert.equal((await api('GET','/events?q=Fictional%20Staging%20Only%20Fixture')).total,0);
    await api('GET','/events/'+externalId,undefined,null,404);
    const member = await api('POST','/auth/signup',{email:'ingestion-api@example.invalid',username:'ingestion_api',password:'Fictional ingestion QA password 2026'},null,201);
    await pool.query('UPDATE users SET email_verified_at=now(),verified_email=lower(email) WHERE id=$1',[member.user.id]);
    await api('PUT','/events/'+externalId+'/rsvp',{status:'going'},member.token,404);
    assert.deepEqual(await snapshot(),before);
  });
  await check('failed provider collection preserves candidate events, reviews and RSVPs without public mutations', async () => {
    const runId = crypto.randomUUID();
    await assert.rejects(runIngestion(pool,{runId,scopeKey:'isolated-api-fixture',observedAt:new Date().toISOString(),collect:async()=>{throw Error('Fictional provider outage');}}),/preserved/);
    assert.equal((await pool.query('SELECT status FROM event_ingestion_runs WHERE run_id=$1',[runId])).rows[0].status,'failed');
    assert.equal((await pool.query('SELECT count(*)::int n FROM event_ingestion_records WHERE is_active OR NOT requires_review')).rows[0].n,0);
    assert.deepEqual(await snapshot(),before);
  });
};
