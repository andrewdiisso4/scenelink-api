/**
 * SceneLink First-Party Analytics
 *
 * Lightweight event tracker. Stores events in localStorage (queue),
 * best-effort POSTs to /api/analytics/event, non-blocking.
 * Respects Do Not Track header.
 */
(function(){
    'use strict';

    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') {
        window.SLAnalytics = { track: function(){}, flush: function(){}, disabled: true };
        return;
    }

    var SESSION_KEY = 'sl_analytics_session';
    var QUEUE_KEY = 'sl_analytics_queue';
    var MAX_QUEUE = 50;
    var FLUSH_DELAY_MS = 5000; // debounce
    var FLUSH_ENDPOINT = '/api/analytics/event'; // best-effort, non-blocking

    // Session management: new session every 30min of inactivity
    function getSession(){
        var s;
        try { s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch(_){}
        if (!s || (Date.now() - s.last) > 30 * 60 * 1000) {
            s = {
                id: 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
                start: Date.now(),
                last: Date.now()
            };
        }
        s.last = Date.now();
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch(_){}
        return s;
    }

    function getUserId(){
        // Prefer real auth user, fall back to anonymous ID
        try {
            var uc = JSON.parse(localStorage.getItem('sl_user_cache') || 'null');
            if (uc && uc.id) return { user_id: uc.id, anon: false };
        } catch(_){}
        var aid = localStorage.getItem('sl_anon_id');
        if (!aid) {
            aid = 'anon_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
            try { localStorage.setItem('sl_anon_id', aid); } catch(_){}
        }
        return { user_id: aid, anon: true };
    }

    function getQueue(){
        try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch(_){ return []; }
    }
    function setQueue(q){
        try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); } catch(_){}
    }

    var flushTimer;
    function scheduleFlush(){
        clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
    }

    function flush(){
        var q = getQueue();
        if (!q.length) return;
        // Best-effort POST; keep in queue on failure
        var toSend = q.slice();
        try {
            var body = JSON.stringify({ events: toSend });
            var headers = { 'Content-Type': 'application/json' };
            var token = localStorage.getItem('sl_jwt_token');
            if (token) headers['Authorization'] = 'Bearer ' + token;

            // Use sendBeacon for reliability on page unload
            if (navigator.sendBeacon && document.visibilityState === 'hidden') {
                var blob = new Blob([body], { type: 'application/json' });
                navigator.sendBeacon(FLUSH_ENDPOINT, blob);
                setQueue([]);
                return;
            }
            fetch(FLUSH_ENDPOINT, {
                method: 'POST',
                headers: headers,
                body: body,
                keepalive: true
            }).then(function(r){
                if (r.ok) setQueue([]);
                // On non-ok, leave queue for retry
            }).catch(function(){
                // Network error — keep queue
            });
        } catch(_){}
    }

    function track(event, properties){
        try {
            var sess = getSession();
            var who = getUserId();
            var evt = {
                event: event,
                ts: Date.now(),
                session_id: sess.id,
                user_id: who.user_id,
                anon: who.anon,
                url: location.pathname + location.search,
                referrer: document.referrer || null,
                ...(properties || {})
            };
            var q = getQueue();
            q.push(evt);
            setQueue(q);
            scheduleFlush();
            // Also console-log in dev for debugging (detect non-production by hostname)
            if (/localhost|127\.0\.0\.1/.test(location.hostname)) {
                console.debug('[SLAnalytics]', event, properties);
            }
        } catch(_){}
    }

    // ── Auto-track page views ──
    function trackPageView(){
        track('page_view', {
            title: document.title,
            path: location.pathname,
            hash: location.hash || null
        });
    }

    // ── Auto-wire common app events ──
    function bindEvents(){
        // SLState / unified action events
        window.addEventListener('sl:saved',        function(e){ track('venue_save',    { venue_id: e.detail && e.detail.id }); });
        window.addEventListener('sl:unsaved',      function(e){ track('venue_unsave',  { venue_id: e.detail && e.detail.id }); });
        window.addEventListener('sl:plan-created', function(e){ track('plan_create',   { plan_id: e.detail && e.detail.id }); });
        window.addEventListener('sl:checked-in',   function(e){ track('checkin',       { venue_id: e.detail && e.detail.venue_id }); });
        window.addEventListener('sl:review-posted',function(e){ track('review_post',   { venue_id: e.detail && e.detail.venue_id }); });
        window.addEventListener('sl:concierge-ask',function(e){ track('concierge_query', { q: (e.detail && e.detail.query || '').slice(0, 200) }); });
        window.addEventListener('sl:booking-click',function(e){ track('booking_click', { venue_id: e.detail && e.detail.venue_id, provider: e.detail && e.detail.provider }); });
        window.addEventListener('sl:auth-login',   function(e){ track('auth_login',    { method: e.detail && e.detail.method }); });
        window.addEventListener('sl:auth-signup',  function(e){ track('auth_signup',   { method: e.detail && e.detail.method }); });

        // Flush on visibility change (page leave)
        document.addEventListener('visibilitychange', function(){
            if (document.visibilityState === 'hidden') flush();
        });
        window.addEventListener('pagehide', flush);
    }

    window.SLAnalytics = {
        track: track,
        flush: flush,
        getSession: getSession,
        getQueue: getQueue,
        disabled: false
    };

    // Boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function(){
            bindEvents();
            trackPageView();
        });
    } else {
        bindEvents();
        trackPageView();
    }
})();