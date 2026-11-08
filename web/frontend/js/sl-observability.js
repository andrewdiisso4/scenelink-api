/**
 * SceneLink Observability Layer
 * - Sentry Browser SDK (loaded from CDN)
 * - Google Analytics 4 (loaded from CDN)
 *
 * Reads config from window.__SL_ENV (populated by /env.js at build time).
 * Fails safe: if config is missing, does nothing. Never blocks page load.
 *
 * PRIVACY / SECURITY:
 *  - Never captures: passwords, Authorization headers, JWTs, OAuth tokens,
 *    message bodies, API keys, full DB values.
 *  - Scrubs auth headers and password fields from Sentry events.
 *  - GA4 custom events never include PII.
 */
(function () {
  'use strict';

  var ENV = (window.__SL_ENV) || {};
  // Phase 8F: treat placeholder/non-DSN values as "not configured" so we never
  // call Sentry.init() with a bogus DSN (which logs "Invalid Sentry Dsn ..."
  // console errors on every page). A real DSN looks like https://<key>@<host>/<id>.
  function validDsn(v) {
    if (!v || typeof v !== 'string') return '';
    if (/REPLACE_WITH|YOUR_|EXAMPLE|PLACEHOLDER|CHANGEME/i.test(v)) return '';
    if (!/^https?:\/\/.+@.+\/.+/.test(v)) return '';
    return v;
  }
  function validGa(v) {
    if (!v || typeof v !== 'string') return '';
    if (/REPLACE_WITH|YOUR_|EXAMPLE|PLACEHOLDER|CHANGEME/i.test(v)) return '';
    if (!/^(G-|UA-|GTM-)/.test(v)) return '';
    return v;
  }
  var SENTRY_DSN = validDsn(ENV.sentryDsn);
  var GA_ID = validGa(ENV.gaId);
  var SENTRY_ENV = ENV.env || 'production';
  var RELEASE = ENV.release || 'dev';
  var TRACES_RATE = typeof ENV.tracesSampleRate === 'number' ? ENV.tracesSampleRate : 0.1;

  // -------------------- Helper: derive page/feature area ----------------
  function currentPage() {
    try {
      var p = (location.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
      if (p === '/' || p === '/index.html') return 'home';
      var m = p.match(/\/([a-z0-9_-]+)(?:\.html)?$/);
      return m ? m[1] : p;
    } catch (_) { return 'unknown'; }
  }

  function featureArea(page) {
    var map = {
      home: 'landing', index: 'landing',
      explore: 'discovery', nightlife: 'discovery', tonight: 'discovery', events: 'discovery',
      social: 'social', messages: 'messaging', friends: 'social',
      profile: 'profile', 'user-profile': 'profile',
      lists: 'lists', plans: 'plans', favorites: 'lists',
      business: 'business', 'business-login': 'business', 'business-signup': 'business',
      'business-dashboard': 'business', 'claim-venue': 'business',
      admin: 'admin',
      contact: 'support', 'contact-support': 'support',
      about: 'marketing', careers: 'marketing',
      'privacy-policy': 'legal', terms: 'legal',
      login: 'auth', signup: 'auth', 'forgot-password': 'auth', 'reset-password': 'auth',
    };
    return map[page] || 'other';
  }

  // -------------------- Sentry ------------------------------------------
  function initSentry() {
    if (!SENTRY_DSN) {
      console.info('[sl-observability] Sentry DSN not set — skipping.');
      return;
    }
    // Load Sentry CDN bundle
    var s = document.createElement('script');
    s.src = 'https://browser.sentry-cdn.com/7.119.2/bundle.tracing.min.js';
    s.crossOrigin = 'anonymous';
    s.async = true;
    s.onload = function () {
      try {
        if (!window.Sentry) return;
        window.Sentry.init({
          dsn: SENTRY_DSN,
          environment: SENTRY_ENV,
          release: 'scenelink-web@' + RELEASE,
          tracesSampleRate: TRACES_RATE,
          integrations: [new window.Sentry.BrowserTracing()],
          // Scrub sensitive data before it leaves the browser
          beforeSend: function (event, hint) {
            try {
              // Strip request headers that might contain auth tokens
              if (event.request && event.request.headers) {
                var h = event.request.headers;
                ['authorization', 'Authorization', 'cookie', 'Cookie', 'x-admin-secret', 'X-Admin-Secret'].forEach(function (k) {
                  if (h[k]) h[k] = '[scrubbed]';
                });
              }
              // Strip any body that looks like auth payload
              if (event.request && typeof event.request.data === 'string') {
                if (/password|token|secret|authorization/i.test(event.request.data)) {
                  event.request.data = '[scrubbed]';
                }
              }
              // Strip URL query params that might contain tokens
              if (event.request && event.request.url) {
                event.request.url = event.request.url.replace(/([?&](?:token|jwt|access_token|code|secret)=)[^&]+/gi, '$1[scrubbed]');
              }
            } catch (_) {}
            return event;
          },
          // Don't send breadcrumbs with form field values
          beforeBreadcrumb: function (breadcrumb) {
            try {
              if (breadcrumb.category === 'ui.input') {
                // Keep event type but drop the actual input value
                if (breadcrumb.message) breadcrumb.message = '[input]';
              }
              if (breadcrumb.data && breadcrumb.data.url) {
                breadcrumb.data.url = String(breadcrumb.data.url).replace(/([?&](?:token|jwt|access_token|code|secret)=)[^&]+/gi, '$1[scrubbed]');
              }
            } catch (_) {}
            return breadcrumb;
          },
          ignoreErrors: [
            // Browser extension noise
            'ResizeObserver loop limit exceeded',
            'ResizeObserver loop completed with undelivered notifications',
            'Non-Error promise rejection captured',
            // Chrome's top-frame throttle
            'chrome-extension://',
            'moz-extension://',
          ],
          denyUrls: [
            /extensions\//i,
            /^chrome:\/\//i,
            /^moz-extension:\/\//i,
          ],
        });

        var page = currentPage();
        window.Sentry.setTag('page', page);
        window.Sentry.setTag('feature_area', featureArea(page));
        window.Sentry.setTag('app', 'scenelink-web');

        console.info('[sl-observability] Sentry initialized.');
      } catch (e) {
        console.warn('[sl-observability] Sentry init failed:', e && e.message);
      }
    };
    s.onerror = function () {
      console.warn('[sl-observability] Sentry CDN failed to load.');
    };
    // If integrity mismatch happens, fall back to no-integrity load (Sentry publishes minor patches frequently)
    s.onload = (function (orig) {
      return function () { try { orig(); } catch (_) {} };
    })(s.onload);
    document.head.appendChild(s);
  }

  // -------------------- GA4 --------------------------------------------
  function initGA() {
    if (!GA_ID || !/^G-[A-Z0-9]+$/.test(GA_ID)) {
      console.info('[sl-observability] GA4 measurement ID not set — skipping.');
      return;
    }
    // Load gtag.js
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(g);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, {
      send_page_view: true,
      anonymize_ip: true,
      allow_google_signals: false, // conservative default, flip when consent UI is ready
      allow_ad_personalization_signals: false,
      page_path: location.pathname,
      page_title: document.title,
      app_name: 'scenelink-web',
      environment: SENTRY_ENV,
    });

    console.info('[sl-observability] GA4 initialized.');
  }

  // -------------------- Public event API ------------------------------
  // Usage:  SLAnalytics.track('venue_saved', { venue_id: 123 });
  var safeParams = function (p) {
    try {
      if (!p || typeof p !== 'object') return {};
      var out = {};
      Object.keys(p).forEach(function (k) {
        var v = p[k];
        if (v == null) return;
        // Never forward obvious PII keys
        if (/password|token|jwt|secret|email|phone|message|body|dm|auth/i.test(k)) return;
        // Cap strings to avoid blowing out GA payloads
        if (typeof v === 'string') v = v.length > 120 ? v.slice(0, 120) : v;
        if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') out[k] = v;
      });
      return out;
    } catch (_) { return {}; }
  };

  window.SLAnalytics = {
    track: function (eventName, params) {
      try {
        if (!eventName || typeof eventName !== 'string') return;
        var safe = safeParams(params);
        if (typeof window.gtag === 'function') {
          window.gtag('event', eventName, safe);
        }
        if (window.Sentry && window.Sentry.addBreadcrumb) {
          window.Sentry.addBreadcrumb({ category: 'analytics', message: eventName, level: 'info', data: safe });
        }
      } catch (_) {}
    },
    identify: function (userIdOrObj) {
      // Only stable anonymous user id — never email or name
      try {
        var id = (typeof userIdOrObj === 'string') ? userIdOrObj : (userIdOrObj && userIdOrObj.id);
        if (!id) return;
        if (typeof window.gtag === 'function') window.gtag('set', { user_id: String(id) });
        if (window.Sentry && window.Sentry.setUser) window.Sentry.setUser({ id: String(id) });
      } catch (_) {}
    },
    reset: function () {
      try {
        if (typeof window.gtag === 'function') window.gtag('set', { user_id: null });
        if (window.Sentry && window.Sentry.setUser) window.Sentry.setUser(null);
      } catch (_) {}
    },
    page: function (pagePath, pageTitle) {
      try {
        if (typeof window.gtag === 'function' && GA_ID) {
          window.gtag('event', 'page_view', {
            page_path: pagePath || location.pathname,
            page_title: pageTitle || document.title,
          });
        }
      } catch (_) {}
    },
  };

  // -------------------- Auto-instrument common events ---------------
  // Uncaught errors → Sentry does this automatically; we also add breadcrumbs
  window.addEventListener('error', function (e) {
    try {
      if (window.Sentry && window.Sentry.addBreadcrumb) {
        window.Sentry.addBreadcrumb({ category: 'window.error', level: 'error', message: (e && e.message) || 'error' });
      }
    } catch (_) {}
  });
  window.addEventListener('unhandledrejection', function (e) {
    try {
      if (window.Sentry && window.Sentry.addBreadcrumb) {
        window.Sentry.addBreadcrumb({ category: 'promise.rejection', level: 'error', message: String((e && e.reason && e.reason.message) || e.reason || 'unhandled') });
      }
    } catch (_) {}
  });

  // Emit a canonical page_view event once DOM is interactive
  function emitPageView() {
    try {
      var page = currentPage();
      window.SLAnalytics.track('page_view_v2', { page: page, feature_area: featureArea(page) });
    } catch (_) {}
  }

  // -------------------- Auto event wiring (non-invasive) ----------
  function wireAuthEvents() {
    // SLAuth emits 'sl-auth-changed' on login/signup/logout
    try {
      var lastUserId = null;
      try {
        var cached = localStorage.getItem('sl_user_cache');
        if (cached) { var u = JSON.parse(cached); lastUserId = u && u.id ? String(u.id) : null; }
      } catch (_) {}

      window.addEventListener('sl-auth-changed', function (e) {
        try {
          var user = (e && e.detail) || null;
          if (user && user.id) {
            var isNew = String(user.id) !== lastUserId;
            window.SLAnalytics.identify(String(user.id));
            // We can't perfectly tell signup vs login from this event,
            // but first-time observation on this device is a strong signal.
            if (isNew && !lastUserId) {
              window.SLAnalytics.track('login_success', { method: 'password_or_oauth' });
            } else if (isNew) {
              window.SLAnalytics.track('login_success', { method: 'switch_account' });
            }
            lastUserId = String(user.id);
          } else {
            if (lastUserId) window.SLAnalytics.track('logout', {});
            window.SLAnalytics.reset();
            lastUserId = null;
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  function wireClickEvents() {
    // Passive click-level instrumentation using data attributes and href patterns.
    // Opt-in via `data-sl-event="event_name"` attribute on any element.
    document.addEventListener('click', function (e) {
      try {
        var el = e.target && (e.target.closest ? e.target.closest('[data-sl-event]') : null);
        if (el) {
          var name = el.getAttribute('data-sl-event');
          if (name) {
            var params = {};
            Array.prototype.slice.call(el.attributes).forEach(function (a) {
              if (a.name.indexOf('data-sl-p-') === 0) params[a.name.slice(10).replace(/-/g, '_')] = a.value;
            });
            window.SLAnalytics.track(name, params);
          }
        }
        // Auto-track outbound ticket / reservation links
        var a = e.target && (e.target.closest ? e.target.closest('a[href]') : null);
        if (a) {
          var href = a.getAttribute('href') || '';
          if (/ticketmaster|seetickets|eventbrite|stubhub|axs|dice\.fm/i.test(href)) {
            window.SLAnalytics.track('ticket_link_clicked', { domain: (href.match(/^https?:\/\/([^\/?#]+)/) || [])[1] });
          } else if (/opentable|resy|yelp\.com\/reservations|tock/i.test(href)) {
            window.SLAnalytics.track('reservation_link_clicked', { domain: (href.match(/^https?:\/\/([^\/?#]+)/) || [])[1] });
          }
        }
      } catch (_) {}
    }, true);
  }

  function wireCustomEvents() {
    // Product modules dispatch these events; we listen and forward to analytics.
    var map = {
      'sl:venue:viewed':       function(d){ return ['venue_viewed', { venue_id: d && d.venueId }]; },
      'sl:venue:saved':        function(d){ return ['venue_saved', { venue_id: d && d.venueId }]; },
      'sl:favorite:added':     function(d){ return ['favorite_added', { venue_id: d && d.venueId }]; },
      'sl:list:created':       function(d){ return ['list_created', { list_id: d && d.listId }]; },
      'sl:plan:created':       function(d){ return ['plan_created', { plan_id: d && d.planId }]; },
      'sl:plan:shared':        function(d){ return ['itinerary_shared', { plan_id: d && d.planId, channel: d && d.channel }]; },
      'sl:friend:added':       function(d){ return ['friend_added', { peer_id: d && d.peerId }]; },
      'sl:message:started':    function(d){ return ['message_started', { thread_id: d && d.threadId }]; },
      'sl:checkin:created':    function(d){ return ['check_in_created', { venue_id: d && d.venueId }]; },
      'sl:review:submitted':   function(d){ return ['review_submitted', { venue_id: d && d.venueId, rating: d && d.rating }]; },
      'sl:concierge:opened':   function(){ return ['concierge_opened', {}]; },
      'sl:concierge:plan':     function(d){ return ['concierge_plan_created', { plan_id: d && d.planId }]; },
      'sl:support:opened':     function(){ return ['contact_support_opened', {}]; },
      'sl:event:viewed':       function(d){ return ['event_viewed', { event_id: d && d.eventId }]; },
      'sl:signup:started':     function(){ return ['sign_up_started', {}]; },
      'sl:business:claim':     function(d){ return ['business_claim_started', { venue_id: d && d.venueId }]; },
    };
    Object.keys(map).forEach(function (evt) {
      try {
        window.addEventListener(evt, function (e) {
          try {
            var pair = map[evt](e && e.detail);
            if (pair && pair[0]) window.SLAnalytics.track(pair[0], pair[1] || {});
          } catch (_) {}
        });
      } catch (_) {}
    });
  }

  // -------------------- Boot -----------------------------------------
  function boot() {
    try { initSentry(); } catch (_) {}
    try { initGA(); } catch (_) {}
    try { wireAuthEvents(); } catch (_) {}
    try { wireClickEvents(); } catch (_) {}
    try { wireCustomEvents(); } catch (_) {}
    // Defer page_view so GA has time to load
    setTimeout(emitPageView, 500);
  }

  // Phase 7B: defer observability boot until after window load + idle, so GA4 (~466 KB)
  // never blocks LCP/FCP on the critical path. Fall back to a 3s timer if requestIdleCallback is unavailable.
  function scheduleBoot() {
    var idle = window.requestIdleCallback || function (cb) { return setTimeout(cb, 1500); };
    idle(function () { try { boot(); } catch (_) {} }, { timeout: 3000 });
  }

  if (document.readyState === 'complete') {
    scheduleBoot();
  } else {
    window.addEventListener('load', scheduleBoot, { once: true });
  }
})();