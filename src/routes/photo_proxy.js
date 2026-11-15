/** Server-side Places photo proxy. Never cache provider errors or expose keys. */
const express = require('express');
const https = require('https');
const router = express.Router();
const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
function allowedRedirect(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') &&
      (u.hostname === 'lh3.googleusercontent.com' || u.hostname.endsWith('.googleusercontent.com'));
  } catch { return false; }
}
router.get('/', (req, res) => {
  res.set({'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
  const name = String(req.query.name || '');
  const width = Math.min(1600, Math.max(100, parseInt(req.query.w || 800, 10) || 800));
  const fail = status => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) return res.destroy();
    res.status(status).type('application/json').json({error:'photo unavailable'});
  };
  if (!PHOTO_NAME.test(name)) return fail(400);
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return fail(503);
  let active;
  const requests = new Set();
  res.on('close', () => {
    for (const owner of requests) {
      owner.retired = true;
      owner.request.destroy();
    }
    requests.clear();
  });
  function load(url, redirected = false) {
    const owner = {request: null, retired: false};
    active = owner;
    const current = () => active === owner && !owner.retired && !res.destroyed && !res.writableEnded;
    const failed = status => { if (current()) fail(status); };
    try {
      owner.request = https.get(url, upstream => {
        // Every response needs listeners, even when its body is discarded.
        // A retired redirect must never fail or cancel the newer CDN request.
        upstream.on('error', () => failed(502));
        upstream.on('aborted', () => failed(502));
        const discard = () => {
          owner.retired = true;
          owner.request.setTimeout(0);
          upstream.destroy();
          owner.request.destroy();
          requests.delete(owner);
        };
        if (!current()) return discard();
        const status = upstream.statusCode || 502;
        if (!redirected && status >= 300 && status < 400 && allowedRedirect(upstream.headers.location)) {
          discard();
          return load(upstream.headers.location, true);
        }
        const type = String(upstream.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (status !== 200 || !IMAGE_TYPES.has(type)) {
          discard();
          return fail(status === 400 || status === 404 || status === 410 ? 404 : 502);
        }
        res.type(type);
        upstream.pipe(res);
      });
      requests.add(owner);
      owner.request.setTimeout(10000, () => {
        failed(504);
        owner.request.destroy();
      });
      owner.request.on('error', () => failed(502));
    } catch { failed(502); }
  }
  load(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&key=${encodeURIComponent(key)}`);
});
module.exports = router;
