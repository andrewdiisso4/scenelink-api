'use strict';
// Durable signup-only welcome queue. SMTP cannot guarantee exactly-once delivery.
// Claim before sending; never replay a sending/unknown job after a crash/timeout.
const crypto = require('node:crypto');
const recipientHash = email => crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex');

// Call inside the SAME transaction that creates the user, never at login or resend.
async function enqueue(db, user) {
  await db.query(`INSERT INTO signup_welcome_emails(user_id,recipient_hash) VALUES($1,$2)
    ON CONFLICT(user_id) DO NOTHING`, [user.id, recipientHash(user.email)]);
}

function createDispatcher({ pool, mailer, logger = console, sendTimeoutMs = 30000 }) {
  let running = null, scheduled = null, interval = null;
  const report = event => logger.warn('[welcome-email] ' + event); // No IDs, addresses, tokens or provider errors.
  async function dispatch() {
    if (!mailer.isReady()) return;
    for (let i = 0; i < 10; i++) {
      if (!mailer.isReady()) return;
      // Single atomic claim across processes. No network I/O while a DB lock is held.
      const result = await pool.query(`WITH candidate AS (
        SELECT w.user_id FROM signup_welcome_emails w WHERE w.status='pending'
        ORDER BY w.created_at,w.user_id FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE signup_welcome_emails w SET status='sending',claimed_at=NOW()
        FROM candidate c WHERE w.user_id=c.user_id AND w.status='pending' RETURNING w.user_id,w.recipient_hash`);
      const job = result.rows[0];
      if (!job) return;
      let timeout, sendStarted = false;
      try {
        // Read current eligibility after claiming; no address/name copied to queue.
        const account = await pool.query(`SELECT id,email,display_name,email_verified_at,verified_email
          FROM users WHERE id=$1 AND is_active IS TRUE AND COALESCE(is_suspended,false)=false`, [job.user_id]);
        const user = account.rows[0];
        if (!user || recipientHash(user.email) !== job.recipient_hash) {
          await finish(job.user_id, 'cancelled');
          continue;
        }
        const verified = !!user.email_verified_at && String(user.verified_email).toLowerCase() === user.email.toLowerCase();
        const template = mailer.welcomeEmail({ display_name: user.display_name, email_verified: verified });
        const outcome = await Promise.race([
          Promise.resolve().then(() => {
            sendStarted = true;
            return mailer.sendMail({ to: {address:user.email}, ...template, retry: false, privateLog: true });
          }),
          new Promise(resolve => { timeout = setTimeout(() => resolve({ unknown: true }), sendTimeoutMs); }),
        ]);
        if (outcome?.ok) await finish(job.user_id, 'accepted');
        else if (outcome?.skipped && outcome.reason === 'mailer-not-ready') {
          // Explicitly not attempted, so safe to wait for SMTP configuration.
          sendStarted = false;
          // Do not repeat an uncertain reset: another worker may already reclaim it.
          try { await resetPending(job.user_id); } catch (_) { report('queue-unavailable'); }
          return;
        } else { await finish(job.user_id, 'unknown'); report('delivery-outcome-unknown; no automatic resend'); }
      } catch (_) {
        if (!sendStarted) {
          // A known pre-send read/template failure is retryable. Stop this pass
          // rather than immediately reclaiming the same failing job in a loop.
          try { await resetPending(job.user_id); } catch (_) {}
          report('preparation-unavailable; no send attempted');
          return;
        }
        // Includes uncertain SMTP outcomes or DB failure after SMTP acceptance.
        // Leaving the durable claim prevents a later instance from replaying it.
        try { await finish(job.user_id, 'unknown'); } catch (_) {}
        report('delivery-outcome-unknown; no automatic resend');
      } finally { clearTimeout(timeout); }
    }
  }
  async function resetPending(id) {
    await pool.query("UPDATE signup_welcome_emails SET status='pending',claimed_at=NULL WHERE user_id=$1 AND status='sending'", [id]);
  }
  async function finish(id, status) {
    await pool.query("UPDATE signup_welcome_emails SET status=$2,completed_at=NOW() WHERE user_id=$1 AND status='sending'", [id, status]);
  }
  function drain() {
    if (!running) running = dispatch().catch(() => report('queue-unavailable')).finally(() => { running = null; });
    return running;
  }
  function kick() {
    if (scheduled) return;
    scheduled = setImmediate(() => { scheduled = null; void drain(); });
    scheduled.unref?.();
  }
  function start() {
    if (!interval) { interval = setInterval(kick, 30000); interval.unref?.(); }
    kick();
  }
  function stop() { clearInterval(interval); clearImmediate(scheduled); interval = null; scheduled = null; }
  return { drain, kick, start, stop };
}

// Lazily load production dependencies; unit tests use injected offline adapters.
let dispatcher;
function current() {
  if (!dispatcher) dispatcher = createDispatcher({ pool: require('../config/database'), mailer: require('./mailer') });
  return dispatcher;
}
module.exports = { enqueue, recipientHash, createDispatcher,
  kick: () => current().kick(), start: () => current().start(), stop: () => current().stop(), drain: () => current().drain() };
