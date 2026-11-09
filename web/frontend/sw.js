/**
 * SceneLink Service Worker
 * - Precaches shell: /offline.html + icon set + manifest
 * - Runtime strategies:
 *     HTML navigations      → network-first with offline fallback
 *     Static assets         → stale-while-revalidate (fast + auto-updating)
 *     API requests          → network-only (never cache mutations or JWT responses)
 *     Images (icons/venues) → cache-first (perf)
 *
 * Phase 5J — emergency cache eviction:
 *   - VERSION bumped to phase5j to force a full caches.delete() pass on activate
 *   - On install, ALL caches starting with "sl-" are nuked (not just non-current),
 *     guaranteeing users on stale phase5f8 / phase5h caches cannot keep serving
 *     stale HTML even momentarily
 */

const VERSION = 'sl-connected-20261109-2';
const SHELL_CACHE = `sl-shell-${VERSION}`;
const RUNTIME_CACHE = `sl-runtime-${VERSION}`;
const IMG_CACHE = `sl-img-${VERSION}`;

const SHELL_URLS = [
  '/css/sl-design-system.css?v=connected-20261109-2',
  '/images/brand/scenelink-wordmark.png',
  '/images/brand/scenelink-full.png',
  '/js/sl-connected-lists.js?v=connected-20261109-2',
  '/js/sl-social-messages.js?v=connected-20261109-2',
  '/js/sl-social-profile.js?v=connected-20261109-2',
  '/js/sl-events.js?v=connected-20261109-2',
  '/js/sl-connected-plans.js?v=connected-20261109-2',
  '/js/sl-connected-actions.js?v=connected-20261109-2',
  '/js/sl-connected-api.js?v=connected-20261109-2',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon.ico',
  // Phase 7D: precache the bundles so first-paint after install is instant
  '/css/sl-bundle-7d.css?v=connected-20261109-2',
  '/js/sl-bundle-7d.js?v=connected-20261109-2',
  '/js/sl-nav-gate.js?v=connected-20261109-2',
  '/js/sl-fetch-guard.js?v=connected-20261109-2',
  '/js/sl-version-marker.js?v=connected-20261109-2',
  '/js/sl-bundle-7d-ui.js?v=connected-20261109-2',
  '/css/sl-phase8-launch.css?v=connected-20261109-2',
  '/js/sl-phase8-completion.js?v=connected-20261109-2',
  '/js/sl-phase8d-recovery.js?v=connected-20261109-2',
  '/css/sl-universal-search.css?v=connected-20261109-2',
  '/js/sl-universal-search.js?v=connected-20261109-2',
  '/js/sl-social-network.js?v=connected-20261109-2',
  '/js/sl-social-core.js?v=connected-20261109-2',
  '/js/sl-social-integration-9a.js?v=connected-20261109-2',
  '/js/sl-venue-activity-9a.js?v=connected-20261109-2'
];

// ── install: nuke ALL old sl-* caches, then precache shell ──────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('sl-') && !k.endsWith(VERSION))
            .map((k) => caches.delete(k))
      ))
      .then(() => caches.open(SHELL_CACHE))
      .then((cache) => Promise.allSettled(SHELL_URLS.map((u) =>
        fetch(u, { cache: 'reload' }).then((r) => r.ok ? cache.put(u, r) : null)
      )))
      .then(() => self.skipWaiting())
  );
});

// ── activate: Phase 7E kill-switch — nuke ALL old sl-* caches, claim clients,
//             then broadcast SW_UPDATED so live tabs can soft-reload if desired.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      // Phase 7E: delete EVERY sl-* cache that does not match this VERSION.
      // This forces any stale sl-v1.7.x / sl-v1.8.x / sl-v1.9.x cache to be
      // purged on first visit after this SW activates, eliminating
      // "Phase 7B-Resume" stale-SW situations.
      keys.filter((k) => k.startsWith('sl-') && !k.endsWith(VERSION))
          .map((k) => caches.delete(k))
    ))
    .then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ includeUncontrolled: true }))
    .then((clients) => {
      clients.forEach((c) => {
        try {
          c.postMessage({ type: 'SW_UPDATED', version: VERSION, phase: 'integrated-design-lists' });
        } catch (_) { /* ignore */ }
      });
    })
  );
});

// ── helpers ─────────────────────────────────────────────────────────────
function isAPI(url) {
  return url.pathname.startsWith('/api/') || url.hostname.endsWith('.onrender.com');
}
function isImage(url) {
  return /\.(png|jpg|jpeg|webp|gif|svg|ico)$/i.test(url.pathname) ||
         url.hostname.includes('images.unsplash.com') ||
         url.hostname.includes('dicebear.com');
}
function isStatic(url) {
  return /\.(js|css|woff2?|ttf|otf)$/i.test(url.pathname);
}

// ── fetch: strategy router ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  if (isAPI(url)) {
    return; // let browser handle directly
  }

  // Phase 8D: NEVER intercept cross-origin requests. Letting the SW try to serve
  // cross-origin assets (e.g. the CDN Font Awesome fallback, Sentry, Google Maps)
  // could return undefined/null to respondWith and crash the FetchEvent in WebKit
  // ("Returned response is null"). The browser handles cross-origin natively and
  // honors CSP. Same-origin only below.
  if (url.origin !== self.location.origin) {
    return;
  }

  // HTML navigations — network-first, fallback to cached page only when OFFLINE.
  // Phase 5K: do NOT opportunistically cache successful HTML on the runtime cache.
  // Caching HTML bodies was the root vulnerability that caused stale-launch-copy
  // bug in Phase 5H. We now ONLY use the SW HTML cache as an OFFLINE fallback,
  // and when online the SW always re-fetches HTML from the network.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match(req).then((cached) => cached || caches.match('/offline.html'));
      })
    );
    return;
  }

  // Images — cache-first. Phase 8D: never resolve to undefined — always return a Response.
  if (isImage(url)) {
    event.respondWith(
      caches.open(IMG_CACHE).then((c) =>
        c.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((resp) => {
            if (resp && resp.ok) c.put(req, resp.clone()).catch(() => {});
            return resp;
          }).catch(() => cached || Response.error());
        })
      )
    );
    return;
  }

  // JS/CSS/fonts — stale-while-revalidate. Phase 8D: guard against undefined.
  if (isStatic(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((c) =>
        c.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((resp) => {
            if (resp && resp.ok) c.put(req, resp.clone()).catch(() => {});
            return resp;
          }).catch(() => cached || Response.error());
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Default same-origin — network with cache fallback; never return undefined.
  event.respondWith(
    fetch(req).catch(() => caches.match(req).then((c) => c || Response.error()))
  );
});

// ── push notifications ─────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(_) {}
  const title = data.title || 'SceneLink';
  const body = data.body || '';
  const icon = '/icons/icon-192.png';
  const badge = '/icons/icon-96.png';
  event.waitUntil(
    self.registration.showNotification(title, {
      body, icon, badge,
      data: data.data || {},
      tag: data.tag || 'sl-default'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clis) => {
      for (const c of clis) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});
