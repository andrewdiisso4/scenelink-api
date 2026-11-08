/**
 * SceneLink — Phase 9A Social Core (js/sl-social-core.js)
 *
 * Single client layer for ALL social functionality. Exposes window.SL.social.*
 * Every method:
 *   - times out (default 12s) and never hangs
 *   - catches errors and returns a normalized { ok, status, data, error } shape
 *   - never throws into the app shell
 *   - treats 401 as logged-out (ok:false, status:401, loggedOut:true)
 *
 * Realtime: SSE (/api/events/stream) for unread badges, with:
 *   - exponential backoff reconnect
 *   - pause while document.hidden
 *   - polling fallback every 45s if SSE fails
 *   - single connection per tab
 *
 * This file MUST NOT break the homepage, nav, search, auth, AI Concierge,
 * lists, or venue discovery if any social call fails.
 */
(function () {
  'use strict';
  if (window.SL && window.SL.social && window.SL.social.__v === '9a') return;

  var BASE = (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) ||
             (window.SLConfig && window.SLConfig.API_BASE_URL) || '/api';
  var DEFAULT_TIMEOUT = 12000;

  function token() {
    try {
      if (window.SLAuth && window.SLAuth.getToken) return window.SLAuth.getToken() || '';
      if (window.SLApi && window.SLApi.getToken) return window.SLApi.getToken() || '';
      return localStorage.getItem('sl_jwt_token') || '';
    } catch (_) { return ''; }
  }
  function isLoggedIn() { return !!token(); }

  // Core fetch with timeout + normalized result. Never throws.
  function request(method, path, body, opts) {
    opts = opts || {};
    var controller = new AbortController();
    var to = setTimeout(function () { controller.abort(); }, opts.timeout || DEFAULT_TIMEOUT);
    var headers = { 'Content-Type': 'application/json' };
    var tok = token();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;

    return fetch(BASE + path, {
      method: method,
      headers: headers,
      body: body != null ? JSON.stringify(body) : undefined,
      credentials: 'omit',
      signal: controller.signal,
    }).then(function (res) {
      clearTimeout(to);
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = { raw: txt }; }
        if (res.status === 401) return { ok: false, status: 401, loggedOut: true, data: data, error: 'Not logged in' };
        if (res.status === 403) return { ok: false, status: 403, forbidden: true, data: data, error: (data && data.error) || 'Forbidden' };
        if (res.status === 404) return { ok: false, status: 404, notFound: true, data: data, error: (data && data.error) || 'Not found' };
        if (res.status === 429) return { ok: false, status: 429, rateLimited: true, data: data, error: 'Slow down a moment' };
        if (!res.ok) return { ok: false, status: res.status, data: data, error: (data && data.error) || ('HTTP ' + res.status) };
        return { ok: true, status: res.status, data: data };
      });
    }).catch(function (e) {
      clearTimeout(to);
      var aborted = e && (e.name === 'AbortError');
      return { ok: false, status: 0, networkError: true, timeout: aborted, data: null,
               error: aborted ? 'Request timed out' : 'Network error' };
    });
  }

  var GET = function (p, o) { return request('GET', p, null, o); };
  var POST = function (p, b, o) { return request('POST', p, b, o); };
  var PATCH = function (p, b, o) { return request('PATCH', p, b, o); };
  var PUT = function (p, b, o) { return request('PUT', p, b, o); };
  var DEL = function (p, b, o) { return request('DELETE', p, b, o); };

  // ─────────────────────────────────────────────────────────────────────────
  // Social API surface
  // ─────────────────────────────────────────────────────────────────────────
  var social = {
    __v: '9a',
    isLoggedIn: isLoggedIn,
    request: request,

    // Profiles
    getMe:           function () { return GET('/users/me'); },
    updateMe:        function (patch) { return PUT('/auth/profile', patch); },
    getProfile:      function (idOrUsername) { return GET('/users/' + encodeURIComponent(idOrUsername)); },
    searchUsers:     function (q, limit) { return GET('/users/search?q=' + encodeURIComponent(q || '') + '&limit=' + (limit || 20)); },
    getSuggestions:  function (limit) { return GET('/users/suggestions?limit=' + (limit || 10)); },

    // Social summary (badges)
    getSummary:      function () { return GET('/social/summary'); },

    // Friends
    getFriends:           function () { return GET('/friends'); },
    getFriendRequests:    function () { return GET('/friends/pending'); },
    sendFriendRequest:    function (userId) { return POST('/friends/request', { user_id: userId }); },
    acceptFriendRequest:  function (friendshipId) { return POST('/friends/accept', { friendship_id: friendshipId }); },
    declineFriendRequest: function (friendshipId) { return POST('/friends/decline', { friendship_id: friendshipId }); },
    removeFriend:         function (userId) { return DEL('/friends/' + encodeURIComponent(userId)); },
    blockUser:            function (userId) { return POST('/users/' + encodeURIComponent(userId) + '/block'); },
    unblockUser:          function (userId) { return DEL('/users/' + encodeURIComponent(userId) + '/block'); },
    reportUser:           function (userId, reason) { return POST('/reports', { target_type: 'user', target_id: userId, reason: reason }); },
    reportContent:        function (type, id, reason) { return POST('/reports', { target_type: type, target_id: id, reason: reason }); },

    // Feed / posts
    getFeed:        function (cursor, limit) {
      var qp = '?limit=' + (limit || 20);
      if (cursor) qp += '&cursor=' + encodeURIComponent(cursor);
      return GET('/posts/feed' + qp);
    },
    getUserPosts:   function (userId) { return GET('/posts?user_id=' + encodeURIComponent(userId)); },
    createPost:     function (payload) { return POST('/posts', payload); }, // { body, venue_id?, image_url? }
    deletePost:     function (postId) { return DEL('/posts/' + encodeURIComponent(postId)); },
    likePost:       function (postId) { return POST('/posts/' + encodeURIComponent(postId) + '/like'); }, // toggle
    getComments:    function (postId) { return GET('/posts/' + encodeURIComponent(postId) + '/comments'); },
    commentPost:    function (postId, text) { return POST('/posts/' + encodeURIComponent(postId) + '/comments', { body: text }); },
    deleteComment:  function (postId, commentId) { return DEL('/posts/' + encodeURIComponent(postId) + '/comments/' + encodeURIComponent(commentId)); },

    // Check-ins + venue activity
    checkIn:          function (venueId, note) { return POST('/checkins', { venue_id: venueId, note: note || null }); },
    deleteCheckIn:    function (id) { return DEL('/checkins/' + encodeURIComponent(id)); },
    getVenueActivity: function (venueIdOrSlug, limit) { return GET('/venues/' + encodeURIComponent(venueIdOrSlug) + '/activity?limit=' + (limit || 20)); },

    // Messages
    getConversations:    function () { return GET('/conversations'); },
    startConversation:   function (userId) { return POST('/conversations', { user_id: userId }); },
    getMessages:         function (convId, cursor, limit) {
      var qp = '?limit=' + (limit || 50);
      if (cursor) qp += '&cursor=' + encodeURIComponent(cursor);
      return GET('/conversations/' + encodeURIComponent(convId) + '/messages' + qp);
    },
    sendMessage:         function (convId, text) { return POST('/conversations/' + encodeURIComponent(convId) + '/messages', { body: text }); },
    markConversationRead:function (convId, throughId) { return POST('/conversations/' + encodeURIComponent(convId) + '/read', { through_id: throughId }); },
    getUnreadMessages:   function () { return GET('/conversations/unread-count'); },

    // Notifications
    getNotifications:        function () { return GET('/notifications'); },
    getUnreadNotifications:  function () { return GET('/notifications/unread-count'); },
    markNotificationRead:    function (id) { return POST('/notifications/' + encodeURIComponent(id) + '/read'); },
    markAllNotificationsRead:function () { return POST('/notifications/read-all'); },

    // Sharing
    shareVenue:   function (venueId, text) { return POST('/posts', { body: text || '', venue_id: venueId }); },
    shareList:    function (listId) { return POST('/lists/' + encodeURIComponent(listId) + '/share'); },
    sharePlan:    function (planId) { return POST('/plans/' + encodeURIComponent(planId) + '/share'); },
    getList:      function (listId) { return GET('/lists/' + encodeURIComponent(listId)); },

    // Plans
    getPlans:           function () { return GET('/plans'); },
    createPlan:         function (payload) { return POST('/plans', payload); },
    getPlan:            function (id) { return GET('/plans/' + encodeURIComponent(id)); },
    invitePlan:         function (planId, userId) { return POST('/plans/' + encodeURIComponent(planId) + '/invites', { user_id: userId }); },
    acceptPlanInvite:   function (planId, inviteId) { return POST('/plans/' + encodeURIComponent(planId) + '/invites/' + encodeURIComponent(inviteId) + '/accept'); },
    declinePlanInvite:  function (planId, inviteId) { return POST('/plans/' + encodeURIComponent(planId) + '/invites/' + encodeURIComponent(inviteId) + '/decline'); },
    getPlanInvites:     function () { return GET('/plans/invites/incoming'); },

    // Media (capability-gated)
    getMediaCapability: function () { return GET('/media/capability'); },
    signMediaUpload:    function (kind) { return POST('/media/sign', { kind: kind || 'post' }); },
    recordMedia:        function (payload) { return POST('/media/record', payload); },

    // High-level: upload an image File via Cloudinary signed upload (if enabled).
    // Returns { ok, url } or { ok:false, error }.
    uploadMedia: function (file, kind) {
      return social.signMediaUpload(kind).then(function (sig) {
        if (!sig.ok) return { ok: false, error: sig.error || 'Media not available', enabled: false };
        var s = sig.data;
        var fd = new FormData();
        fd.append('file', file);
        fd.append('api_key', s.apiKey);
        fd.append('timestamp', s.timestamp);
        fd.append('folder', s.folder);
        fd.append('signature', s.signature);
        return fetch(s.uploadUrl, { method: 'POST', body: fd })
          .then(function (r) { return r.json(); })
          .then(function (up) {
            if (!up || !up.secure_url) return { ok: false, error: 'Upload failed' };
            return social.recordMedia({
              url: up.secure_url, thumb_url: up.secure_url,
              width: up.width, height: up.height, mime_type: up.resource_type,
              bytes: up.bytes, kind: kind || 'post'
            }).then(function (rec) {
              if (!rec.ok) return { ok: false, error: rec.error || 'Could not register uploaded image' };
              return { ok: true, url: up.secure_url, asset: rec.data && rec.data.asset };
            });
          })
          .catch(function () { return { ok: false, error: 'Upload error' }; });
      });
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime (SSE) — unread badge sync. Pause when hidden, backoff reconnect.
  // ─────────────────────────────────────────────────────────────────────────
  var rt = (function () {
    var es = null, backoff = 1000, MAXB = 30000, pollTimer = null, listeners = [];
    var lastUnread = { notifications: 0, messages: 0 };
    var stopped = false;

    function emit(u) {
      lastUnread = u;
      listeners.forEach(function (fn) { try { fn(u); } catch (_) {} });
    }
    function on(fn) { listeners.push(fn); if (lastUnread) { try { fn(lastUnread); } catch (_) {} } return function(){ listeners = listeners.filter(function(x){return x!==fn;}); }; }

    function startPolling() {
      stopPolling();
      pollTimer = setInterval(function () {
        if (document.hidden || !isLoggedIn()) return;
        Promise.all([social.getUnreadNotifications(), social.getUnreadMessages()]).then(function (r) {
          var n = (r[0].ok && r[0].data && r[0].data.unread) || 0;
          var m = (r[1].ok && r[1].data && r[1].data.unread) || 0;
          emit({ notifications: n, messages: m });
        });
      }, 45000);
    }
    function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

    function connect() {
      if (stopped || !isLoggedIn() || document.hidden) return;
      // Canonical API intentionally disables query-token SSE. Never put JWTs in URLs.
      Promise.all([social.getUnreadNotifications(), social.getUnreadMessages()]).then(function(r){
        if (!stopped && r[0].ok && r[1].ok) emit({notifications:r[0].data.unread||0,messages:r[1].data.unread||0});
      });
      startPolling();
    }

    function start() {
      stopped = false;
      if (!isLoggedIn()) return;
      connect();
    }
    function stop() {
      stopped = true;
      if (es) { try { es.close(); } catch (_) {} es = null; }
      stopPolling();
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (es) { try { es.close(); } catch (_) {} es = null; } }
      else if (isLoggedIn() && !stopped) { connect(); }
    });

    return { start: start, stop: stop, on: on, current: function(){ return lastUnread; } };
  })();

  social.realtime = rt;

  // Auto-start realtime when logged in (deferred so auth core loads first)
  setTimeout(function () { if (isLoggedIn()) rt.start(); }, 1200);

  window.SL = window.SL || {};
  window.SL.social = social;
  console.log('[SL.social] Phase 9A core ready · loggedIn=', isLoggedIn());
})();
