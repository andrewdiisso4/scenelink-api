/**
 * SceneLink — Phase 9A media upload (capability-gated)
 *
 * Media storage is OPTIONAL and only activates when object-storage credentials
 * are present in the environment. Supported providers (auto-detected):
 *   - Cloudinary:  CLOUDINARY_URL  (cloudinary://key:secret@cloud)
 *
 * Endpoints:
 *   GET  /api/media/capability        — { enabled, provider } (public-ish, no secrets)
 *   POST /api/media/sign              — returns a signed upload payload for the client
 *                                       (auth required). Never exposes the secret.
 *   POST /api/media/record            — records an uploaded asset URL after the client
 *                                       uploads directly to the provider (auth required).
 *
 * If no provider is configured, capability returns { enabled:false } and the
 * frontend hides photo-attach. This is REPORTED, not hidden.
 */
const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function detectProvider() {
  if (process.env.CLOUDINARY_URL) {
    try {
      const u = new URL(process.env.CLOUDINARY_URL);
      return {
        provider: 'cloudinary',
        cloudName: u.hostname,
        apiKey: u.username,
        apiSecret: u.password,
      };
    } catch (_) { return null; }
  }
  return null;
}

router.get('/capability', (req, res) => {
  const p = detectProvider();
  res.json({ enabled: !!p, provider: p ? p.provider : null });
});

// POST /api/media/sign { folder?, kind? } — Cloudinary signed upload params
router.post('/sign', requireAuth, (req, res) => {
  const p = detectProvider();
  if (!p) return res.status(503).json({ error: 'Media storage not configured', enabled: false });
  if (p.provider !== 'cloudinary') return res.status(503).json({ error: 'Unsupported provider' });

  const timestamp = Math.round(Date.now() / 1000);
  const folder = `scenelink/${String(req.body && req.body.kind || 'post').replace(/[^a-z]/gi, '')}`;
  // Signature = sha1 of sorted params + api_secret (Cloudinary spec)
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(toSign + p.apiSecret).digest('hex');

  res.json({
    enabled: true,
    provider: 'cloudinary',
    cloudName: p.cloudName,
    apiKey: p.apiKey,
    timestamp,
    folder,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${p.cloudName}/image/upload`,
  });
});

// POST /api/media/record { url, thumb_url?, width?, height?, mime_type?, bytes?, kind? }
router.post('/record', requireAuth, async (req, res) => {
  try {
    const p = detectProvider();
    if (!p) return res.status(503).json({ error: 'Media storage not configured' });
    const b = req.body || {};
    const url = String(b.url || '').trim();
    if (!/^https:\/\//i.test(url)) return res.status(400).json({ error: 'Valid https url required' });
    const kind = ['post', 'avatar', 'message', 'checkin'].includes(b.kind) ? b.kind : 'post';
    const ins = await pool.query(
      `INSERT INTO media_assets (owner_id, url, thumb_url, mime_type, width, height, bytes, kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, url, thumb_url, width, height, kind, created_at`,
      [req.user.id, url, b.thumb_url || null, b.mime_type || null,
       b.width || null, b.height || null, b.bytes || null, kind]
    );
    // If avatar, also update the user's avatar_url
    if (kind === 'avatar') {
      await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [url, req.user.id]);
    }
    res.status(201).json({ asset: ins.rows[0] });
  } catch (err) {
    console.error('[media] record error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
