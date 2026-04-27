/**
 * Push notification dispatcher.
 * - Pulls active push_tokens for a user
 * - Sends via FCM (Android) and APNs (iOS) if credentials are configured
 * - Gracefully degrades to logging if credentials missing (dev/staging)
 *
 * Integration with APNs/FCM is left "soft" — we import providers lazily so
 * the backend boots fine even without credentials. Set these env vars in
 * production to enable real delivery:
 *
 *   FCM_SERVICE_ACCOUNT_JSON   — full JSON service-account key (Firebase)
 *   APNS_KEY_ID
 *   APNS_TEAM_ID
 *   APNS_BUNDLE_ID             — e.g. "app.scenelink.ios"
 *   APNS_KEY_P8                — full .p8 file contents
 *   APNS_ENV                   — "production" or "development" (default: production)
 */

const pool = require('../config/database');

let fcmApp = null;
let apnsProvider = null;

function initFCM() {
  if (fcmApp !== null) return fcmApp;
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (!raw) { fcmApp = false; return fcmApp; }
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const credJson = JSON.parse(raw);
      admin.initializeApp({ credential: admin.credential.cert(credJson) });
    }
    fcmApp = admin;
    console.log('[push] FCM initialized');
    return fcmApp;
  } catch (e) {
    console.warn('[push] FCM init failed:', e.message);
    fcmApp = false;
    return fcmApp;
  }
}

function initAPNs() {
  if (apnsProvider !== null) return apnsProvider;
  try {
    if (!process.env.APNS_KEY_ID || !process.env.APNS_TEAM_ID || !process.env.APNS_KEY_P8) {
      apnsProvider = false;
      return apnsProvider;
    }
    const apn = require('apn');
    apnsProvider = new apn.Provider({
      token: {
        key: process.env.APNS_KEY_P8,
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID,
      },
      production: (process.env.APNS_ENV || 'production') === 'production',
    });
    console.log('[push] APNs initialized');
    return apnsProvider;
  } catch (e) {
    console.warn('[push] APNs init failed:', e.message);
    apnsProvider = false;
    return apnsProvider;
  }
}

/**
 * Send a push to a single user (all their active devices).
 *   userId: uuid
 *   payload: { title, body, data? }
 */
async function pushToUser(userId, payload) {
  if (!userId || !payload || !payload.title) return { sent: 0 };

  let tokens = [];
  try {
    const { rows } = await pool.query(
      `SELECT token, platform FROM push_tokens
       WHERE user_id = $1 AND active = TRUE
       ORDER BY last_seen_at DESC LIMIT 20`,
      [userId]
    );
    tokens = rows;
  } catch (e) {
    console.error('[push] lookup failed', e.message);
    return { sent: 0 };
  }
  if (tokens.length === 0) return { sent: 0 };

  const iosTokens = tokens.filter(t => t.platform === 'ios').map(t => t.token);
  const androidTokens = tokens.filter(t => t.platform === 'android').map(t => t.token);
  const webTokens = tokens.filter(t => t.platform === 'web').map(t => t.token);

  let sent = 0;
  const failed = [];

  // Android + Web via FCM
  const fcm = initFCM();
  if (fcm && (androidTokens.length + webTokens.length) > 0) {
    try {
      const messaging = fcm.messaging();
      const msg = {
        notification: { title: payload.title, body: payload.body || '' },
        data: Object.fromEntries(
          Object.entries(payload.data || {}).map(([k, v]) => [k, String(v)])
        ),
        tokens: [...androidTokens, ...webTokens],
      };
      const resp = await messaging.sendEachForMulticast(msg);
      sent += resp.successCount;
      resp.responses.forEach((r, i) => {
        if (!r.success && r.error) {
          const code = r.error.code || '';
          if (code.includes('registration-token-not-registered') ||
              code.includes('invalid-argument')) {
            failed.push([...androidTokens, ...webTokens][i]);
          }
        }
      });
    } catch (e) {
      console.warn('[push] FCM send failed', e.message);
    }
  } else if (!fcm && (androidTokens.length + webTokens.length) > 0) {
    console.log('[push] (dev) would send to', androidTokens.length + webTokens.length,
      'Android/Web devices —', payload.title);
  }

  // iOS via APNs
  const apns = initAPNs();
  if (apns && iosTokens.length > 0) {
    try {
      const apn = require('apn');
      const notif = new apn.Notification();
      notif.topic = process.env.APNS_BUNDLE_ID || 'app.scenelink.ios';
      notif.alert = { title: payload.title, body: payload.body || '' };
      notif.sound = 'default';
      notif.payload = payload.data || {};
      notif.pushType = 'alert';
      const results = await apns.send(notif, iosTokens);
      sent += (results.sent || []).length;
      (results.failed || []).forEach(f => {
        if (f.status === '410' || f.status === '400') failed.push(f.device);
      });
    } catch (e) {
      console.warn('[push] APNs send failed', e.message);
    }
  } else if (!apns && iosTokens.length > 0) {
    console.log('[push] (dev) would send to', iosTokens.length,
      'iOS devices —', payload.title);
  }

  // Deactivate expired tokens
  if (failed.length > 0) {
    try {
      await pool.query(
        `UPDATE push_tokens SET active = FALSE WHERE token = ANY($1::text[])`,
        [failed]
      );
    } catch (_) { /* noop */ }
  }

  return { sent, failed: failed.length };
}

module.exports = { pushToUser };