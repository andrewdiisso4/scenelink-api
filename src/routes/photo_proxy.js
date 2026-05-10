/**
 * Google Places photo proxy endpoint.
 *
 * The client passes photo_name (a Google resource name like
 * `places/ChIJ.../photos/Ab43m-...`). The server fetches the photo from
 * Google using the server-side API key and streams it back with aggressive
 * caching headers so the key NEVER reaches the browser.
 *
 * Route:  GET /api/photo?name=<photo_name>&w=<max_width_px>
 *
 * Security:
 *   - API key read from process.env.GOOGLE_PLACES_API_KEY (never logged)
 *   - photo_name must start with 'places/' and contain '/photos/' (whitelist)
 *   - redirects followed server-side; final CDN URL is never exposed because
 *     we stream the bytes, not redirect the client
 *   - 1h CDN cache + 24h browser cache — photos rarely change
 */
const express = require("express");
const https   = require("https");

const router = express.Router();
const ALLOWED_WIDTHS = [200, 400, 800, 1200, 1600];
const MAX_WIDTH = 1600;
const DEFAULT_WIDTH = 800;

router.get("/", async (req, res) => {
  try {
    const name = String(req.query.name || "");
    const w    = Math.min(MAX_WIDTH, Math.max(100, parseInt(req.query.w || DEFAULT_WIDTH, 10) || DEFAULT_WIDTH));

    // Whitelist validation — photo resource names use letters/digits/underscores/hyphens
    if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name)) {
      return res.status(400).json({ error: "invalid photo name" });
    }

    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) {
      return res.status(500).json({ error: "photo service unavailable" });
    }

    const url = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w}&key=${key}`;

    https.get(url, (upstream) => {
      if (upstream.statusCode && upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
        // Follow the redirect ourselves — do NOT expose the CDN URL as a redirect to the client
        https.get(upstream.headers.location, (cdn) => {
          res.set({
            "Content-Type":  cdn.headers["content-type"] || "image/jpeg",
            "Cache-Control": "public, max-age=86400, s-maxage=3600",
            "X-Content-Type-Options": "nosniff",
          });
          cdn.pipe(res);
        }).on("error", () => res.status(502).json({ error: "upstream cdn error" }));
        return;
      }
      res.set({
        "Content-Type":  upstream.headers["content-type"] || "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=3600",
        "X-Content-Type-Options": "nosniff",
      });
      upstream.pipe(res);
    }).on("error", () => res.status(502).json({ error: "upstream error" }));
  } catch (e) {
    // Intentionally no logging of error detail (may contain key in URL)
    res.status(500).json({ error: "internal photo error" });
  }
});

module.exports = router;