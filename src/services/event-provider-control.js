'use strict';
const { randomUUID } = require('node:crypto');

async function acquireLease(db) {
  const owner = randomUUID();
  const result = await db.query(`INSERT INTO event_ingestion_leases(provider,owner,expires_at)
    VALUES ('ticketmaster',$1::uuid,now()+interval '15 minutes')
    ON CONFLICT(provider) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at
    WHERE event_ingestion_leases.expires_at <= now() RETURNING owner`, [owner]);
  return result.rows.length ? owner : null;
}
async function releaseLease(db, owner) {
  await db.query("DELETE FROM event_ingestion_leases WHERE provider='ticketmaster' AND owner=$1::uuid", [owner]);
}
async function reserveRequest(db, dailyLimit, leaseToken = null) {
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1000) throw new Error('Daily budget must be 1–1000');
  const result = await db.query(`INSERT INTO event_ingestion_quotas(provider,quota_day,requests)
    SELECT 'ticketmaster',(now() AT TIME ZONE 'UTC')::date,1
    WHERE $2::uuid IS NULL OR EXISTS(SELECT 1 FROM event_ingestion_leases
      WHERE provider='ticketmaster' AND owner=$2::uuid AND expires_at > now())
    ON CONFLICT(provider,quota_day) DO UPDATE SET requests=event_ingestion_quotas.requests+1
    WHERE event_ingestion_quotas.requests < $1::int RETURNING requests`, [dailyLimit, leaseToken]);
  if (!result.rows.length) throw new Error('Local provider budget exhausted or lease expired');
}

function boundedTransport({ reserve, fetchImpl = fetch, pause = ms => new Promise(r => setTimeout(r, ms)), now = Date.now }) {
  let providerExhausted = false;
  return async (url, options = {}) => {
    const target = new URL(url);
    if (target.origin !== 'https://app.ticketmaster.com' || !/^\/discovery\/v2\/events(?:\.json|\/[A-Za-z0-9_-]+\.json)$/.test(target.pathname)
        || target.username || target.password || target.hash || (options.method && options.method !== 'GET')) throw new Error('Unsupported provider request');
    for (let attempt = 0; attempt < 3; attempt++) {
      if (providerExhausted) throw new Error('Provider quota exhausted');
      await reserve();
      await pause(550);
      let response;
      try { response = await fetchImpl(url, { ...options, method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000) }); }
      catch {
        if (attempt === 2) throw new Error('Provider transport failed after bounded retries');
        await pause(500 * (attempt + 1)); continue;
      }
      if (response.headers?.get('rate-limit-available') === '0') providerExhausted = true;
      if (![429,500,502,503,504].includes(response.status) || attempt === 2 || providerExhausted) return response;
      const retryAfter = response.headers?.get('retry-after');
      const delay = retryAfter == null ? 500 * (attempt + 1)
        : /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now();
      // Do not retry early when server asks for more than this run's budget.
      if (!Number.isFinite(delay) || delay > 2000) return response;
      await response.body?.cancel();
      await pause(Math.max(0, delay));
    }
  };
}
module.exports = { acquireLease, releaseLease, reserveRequest, boundedTransport };
