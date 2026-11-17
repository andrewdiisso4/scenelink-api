'use strict';
// Hard request-attempt quota, not a dollar budget. No prompts, identity or credentials persisted.
const MAX_DAILY_REQUESTS = 10000;
function quotaConfig(env = process.env) {
  const raw = String(env.CONCIERGE_AI_DAILY_REQUEST_LIMIT || '');
  const limit = /^\d+$/.test(raw) ? Number(raw) : 0;
  return { enabled: env.CONCIERGE_AI_ENABLED === 'true' && Number.isSafeInteger(limit) && limit > 0 && limit <= MAX_DAILY_REQUESTS, limit };
}
async function reserveProviderAttempt(pool, env = process.env) {
  const config = quotaConfig(env);
  if (!config.enabled) return { allowed: false, reason: 'disabled' };
  // DB UTC clock + one atomic upsert provide one global budget across processes.
  // Failed/timed-out attempts are deliberately not refunded: upstream may have charged.
  try {
    const result = await pool.query(`INSERT INTO concierge_ai_daily_quota (quota_day, attempts)
      VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 1)
      ON CONFLICT (quota_day) DO UPDATE SET attempts = concierge_ai_daily_quota.attempts + 1
      WHERE concierge_ai_daily_quota.attempts < $1
      RETURNING attempts`, [config.limit]);
    return result.rows.length ? { allowed: true } : { allowed: false, reason: 'quota_exhausted' };
  } catch (_) {
    // Missing migration or DB fault must never fall back to an unmetered provider call.
    return { allowed: false, reason: 'quota_unavailable' };
  }
}
module.exports = { quotaConfig, reserveProviderAttempt };
