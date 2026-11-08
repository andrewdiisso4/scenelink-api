/* Phase 7D JS bundle - concatenation of 34 per-page scripts */

/* === js/sl-avatar.js === */
/**
 * SL-AVATAR — single helper for local SVG initial avatars.
 * Replaces external api.dicebear.com which fails (ERR_FAILED) and adds latency.
 * Works as data: URI, no network request.
 */
(function(global){
  'use strict';
  function localInitialAvatar(name){
    var n = String(name||'?').trim();
    var initials = n.split(/\s+/).slice(0,2).map(function(p){return (p[0]||'').toUpperCase();}).join('') || '?';
    initials = initials.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">'+
              '<rect width="80" height="80" fill="#1a1a1a"/>'+
              '<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="system-ui,Arial" font-size="30" font-weight="700" fill="#d4af37">'+initials+'</text>'+
              '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  // Idempotent define: never clobber an existing valid impl; always guarantee .local is a function.
  if (!global.SL_AVATAR || typeof global.SL_AVATAR.local !== 'function') {
    global.SL_AVATAR = global.SL_AVATAR || {};
    global.SL_AVATAR.local = localInitialAvatar;
  }
})(window);

/* === js/config.js === */
// SceneLink Configuration — PRODUCTION
// Google Maps API Configuration

const CONFIG = {
    // GOOGLE_MAPS_API_KEY removed — SceneLink uses Leaflet/OSM for all live maps.
    // If Google Maps JS is ever needed again, inject via env.js as window.__SL_GMAPS_KEY
    // (scoped to HTTPS referrer scenelink.app in the GCP console).
    GOOGLE_CLIENT_ID: '476937141773-733s6hkeapqs1b12kfelpn2c05m2kdt2.apps.googleusercontent.com',
    MAP_SETTINGS: {
        defaultCenter: { lat: 42.3601, lng: -71.0589 },
        defaultZoom: 13,
        minZoom: 10,
        maxZoom: 18
    },
    // API proxied to Render via Netlify (/api/* → scenelink-api-prod.onrender.com/api/*)
    API_BASE_URL: '/api',
    FEATURES: {
        socialFeed: true,
        groupPlanning: true,
        aiSearch: true,
        realTimeUpdates: true,
        notifications: true
    }
};

// Also set on window for modules that use the new pattern
window.SL_CONFIG = {
    API_BASE_URL: '/api',
    GOOGLE_CLIENT_ID: CONFIG.GOOGLE_CLIENT_ID,
    // Apple Services ID. Set to '' to hide the Apple button entirely,
    // or leave set to show a polished "Coming soon" state until the
    // Apple private key is configured on the backend.
    APPLE_CLIENT_ID: 'app.scenelink.www',
    // Controls whether the Apple button is clickable.
    // Backend verifies the Apple id_token against Apple JWKS
    // (https://appleid.apple.com/auth/keys) using only APPLE_CLIENT_ID.
    // No TEAM_ID / KEY_ID / PRIVATE_KEY are required on the server for
    // the web id_token flow — those are only required for the native
    // authorization-code exchange flow, which we do not use.
    APPLE_ENABLED: true
};
// Legacy compat
window.SLConfig = window.SLConfig || {};
window.SLConfig.GOOGLE_CLIENT_ID = CONFIG.GOOGLE_CLIENT_ID;
window.SLConfig.API_URL = CONFIG.API_BASE_URL;
window.SLConfig.API_BASE_URL = CONFIG.API_BASE_URL;
window.GOOGLE_CLIENT_ID = CONFIG.GOOGLE_CLIENT_ID;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

/* === js/sl-api.js === */
/* ================================================================
   SceneLink API Client — talks to Render backend via Netlify proxy
   Exposes: window.SLApi
   v2 — Phase 3/4/5/6/7: friends, messages, posts, notifications, users
   ================================================================ */
(function(){
  'use strict';
  var BASE = (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) || '/api';
  var TOKEN_KEY = 'sl_jwt_token';

  function getToken(){ try { return localStorage.getItem(TOKEN_KEY) || ''; } catch(e){ return ''; } }
  function setToken(t){ try { localStorage.setItem(TOKEN_KEY, t); } catch(e){} }
  function clearToken(){ try { localStorage.removeItem(TOKEN_KEY); } catch(e){} }

  function qs(params){
    if (!params) return '';
    var parts = [];
    Object.keys(params).forEach(function(k){
      if (params[k] === undefined || params[k] === null) return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    });
    return parts.length ? ('?' + parts.join('&')) : '';
  }

  async function req(path, opts){
    opts = opts || {};
    var headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {});
    var tok = getToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    var body = opts.body;
    if (body && typeof body !== 'string') body = JSON.stringify(body);
    var res = await fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: body,
      credentials: 'omit', signal: opts.signal, keepalive: !!opts.keepalive
    });
    var txt = await res.text();
    var data; try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = { raw: txt }; }
    if (!res.ok) {
      var err = new Error((data && data.error) || ('HTTP ' + res.status));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  window.SLApi = {
    // ---- token management
    getToken: getToken, setToken: setToken, clearToken: clearToken,
    isLoggedIn: function(){ return !!getToken(); },

    // ---- auth
    signup: function(email, password, displayName, username){
      return req('/auth/signup', { method:'POST', body:{ email: email, password: password, display_name: displayName, username: username || undefined }})
        .then(function(d){ if (d && d.token) setToken(d.token); return d; });
    },
    login: function(email, password){
      return req('/auth/login', { method:'POST', body:{ email: email, password: password }})
        .then(function(d){ if (d && d.token) setToken(d.token); return d; });
    },
    me: function(){ return req('/auth/me'); },
    logout: function(){
      if(window.SLAuth && window.SLAuth.logout) return window.SLAuth.logout({reload:false});
      var hadToken=!!getToken(), timer, controller=typeof AbortController !== 'undefined' ? new AbortController() : null;
      var request=req('/auth/logout',{method:'POST',body:{},signal:controller && controller.signal,keepalive:true});
      clearToken();
      try { localStorage.removeItem('sl_user_cache'); localStorage.removeItem('sl_user'); } catch(_){}
      try { window.dispatchEvent(new CustomEvent('sl-auth-changed',{detail:{user:null,authed:false}})); } catch(_){}
      var timeout=new Promise(function(resolve){ timer=setTimeout(function(){if(controller)controller.abort();resolve({ok:true,revoked:false,error:'Session revocation timed out'});},8000); });
      var outcome=request.then(function(d){return{ok:true,revoked:hadToken && !!(d && d.revoked)};},function(err){return{ok:true,revoked:false,error:err.message};});
      return Promise.race([outcome,timeout]).then(function(result){clearTimeout(timer);return result;});
    },
    forgotPassword: function(email){ return req('/auth/forgot-password', { method:'POST', body:{ email: email }}); },
    resetPassword: function(resetToken, password){ return req('/auth/reset-password', { method:'POST', body:{ token: resetToken, password: password }}); },
    deleteAccount: function(password, reason){ return req('/auth/account', { method:'DELETE', body:{ password: password || '', reason: reason || '' }}).then(function(d){ if(!d || d.deleted !== true) throw new Error('Deletion was not confirmed'); clearToken(); return d; }); },
    updateProfile: function(body){
      return req('/auth/profile', { method:'PUT', body: body });
    },
    usernameAvailable: function(u){
      return req('/auth/username-available?u=' + encodeURIComponent(u));
    },

    // ---- users (public)
    userMe: function(){ return req('/users/me'); },
    userByIdentifier: function(identifier){ return req('/users/' + encodeURIComponent(identifier)); },
    searchUsers: function(q, limit){ return req('/users/search' + qs({ q: q, limit: limit || 10 })); },

    // ---- friends
    friends: function(){ return req('/friends'); },
    friendsPending: function(){ return req('/friends/pending'); },
    sendFriendRequest: function(body){
      // body: { user_id } or { username }
      return req('/friends/request', { method:'POST', body: body });
    },
    acceptFriend: function(friendshipId){
      return req('/friends/accept', { method:'POST', body:{ friendship_id: friendshipId }});
    },
    declineFriend: function(friendshipId){
      return req('/friends/decline', { method:'POST', body:{ friendship_id: friendshipId }});
    },
    removeFriend: function(friendUserId){
      return req('/friends/' + encodeURIComponent(friendUserId), { method:'DELETE' });
    },

    // ---- messaging
    conversations: function(){ return req('/conversations'); },
    startConversation: function(userId){
      return req('/conversations', { method:'POST', body:{ user_id: userId }});
    },
    messages: function(conversationId, opts){
      opts = opts || {};
      return req('/conversations/' + encodeURIComponent(conversationId) + '/messages' + qs({ cursor: opts.cursor, limit: opts.limit }));
    },
    sendMessage: function(conversationId, body){
      return req('/conversations/' + encodeURIComponent(conversationId) + '/messages',
        { method:'POST', body:{ body: body }});
    },
    markConversationRead: function(conversationId, throughId){
      return req('/conversations/' + encodeURIComponent(conversationId) + '/read', { method:'POST', body:{ through_id: throughId } });
    },
    conversationsUnreadCount: function(){ return req('/conversations/unread-count'); },

    // ---- posts & feed
    feed: function(){ return req('/posts/feed'); },
    postsByUser: function(userId){ return req('/posts' + qs({ user_id: userId })); },
    createPost: function(body){
      // body: { body, venue_id?, image_url? }
      return req('/posts', { method:'POST', body: body });
    },
    deletePost: function(postId){
      return req('/posts/' + encodeURIComponent(postId), { method:'DELETE' });
    },
    toggleLike: function(postId){
      return req('/posts/' + encodeURIComponent(postId) + '/like', { method:'POST' });
    },
    comments: function(postId){
      return req('/posts/' + encodeURIComponent(postId) + '/comments');
    },
    addComment: function(postId, body){
      return req('/posts/' + encodeURIComponent(postId) + '/comments',
        { method:'POST', body:{ body: body }});
    },
    deleteComment: function(postId, commentId){
      return req('/posts/' + encodeURIComponent(postId) + '/comments/' + encodeURIComponent(commentId),
        { method:'DELETE' });
    },

    // ---- notifications
    notifications: function(){ return req('/notifications'); },
    unreadCount: function(){ return req('/notifications/unread-count'); },
    markAllRead: function(){ return req('/notifications/read-all', { method:'POST' }); },
    markNotificationRead: function(id){
      return req('/notifications/' + encodeURIComponent(id) + '/read', { method:'POST' });
    },

    // ---- legacy activity (kept for back-compat, returns empty after purge)
    activity: function(){ return req('/activity'); },

    // ---- venues
    venues: function(params){ return window.SLVenueData.list(params); },
    venuesTonight: function(){ return window.SLVenueData.list({limit:40}); },
    venuesExplore: function(){ return window.SLVenueData.list({}); },
    venuesNightlife: function(){ return window.SLVenueData.list({mode:'nightlife'}); },
    venuesFeatured: function(){ return window.SLVenueData.list({limit:6}); },
    venueById: function(id){ return window.SLVenueData.detail(id); },
    venueBySlug: function(slug){ return window.SLVenueData.detail(slug); },
    venueSearch: function(q){ return window.SLVenueData.list({q:q}); },

    // ---- events
    events: function(){ return req('/events'); },

    // ---- launch forms
    newsletterSubscribe: function(email, source){ return req('/newsletter/subscribe', { method:'POST', body:{ email: email, source: source || 'web' }}); },
    contactSubmit: function(body){ return req('/contact', { method:'POST', body: body }); },
    businessInterest: function(body){ return req('/business/upgrade-interest', { method:'POST', body: body }); },
    concierge: function(message, context){ return req('/concierge', { method:'POST', body:{ message: message, context: context || {} }}); },

    // ---- favorites (auth required)
    favorites: function(){ return req('/favorites'); },
    toggleFavorite: function(venueId){ return req('/favorites/toggle', { method:'POST', body:{ venue_id: venueId }}); },
    saveFavorite: function(venueId){ return req('/favorites/' + encodeURIComponent(venueId), { method:'POST' }); },
    unsaveFavorite: function(venueId){ return req('/favorites/' + encodeURIComponent(venueId), { method:'DELETE' }); },

    // ---- lists
    lists: function(){ return req('/lists'); },
    createList: function(name, description){
      return req('/lists', { method:'POST', body:{ name: name, description: description || '' }});
    },
    addToList: function(listId, venueId){
      return req('/lists/' + encodeURIComponent(listId) + '/venues', { method:'POST', body:{ venue_id: venueId }});
    },
    removeFromList: function(listId, venueId){
      return req('/lists/' + encodeURIComponent(listId) + '/venues/' + encodeURIComponent(venueId), { method:'DELETE' });
    },
    deleteList: function(listId){ return req('/lists/' + encodeURIComponent(listId), { method:'DELETE' }); },

    // ---- plans (v2)
    plans: function(){ return req('/plans'); },
    planById: function(id){ return req('/plans/' + encodeURIComponent(id)); },
    createPlan: function(body, date, description){
      // body: { name, date?, description? } or legacy signature (name, date, description)
      if (typeof body === 'string') body = { name: body, date: date || null, description: description || '' };
      return req('/plans', { method:'POST', body: body });
    },
    deletePlan: function(id){ return req('/plans/' + encodeURIComponent(id), { method:'DELETE' }); },
    // Backward-compat: AI Concierge and legacy UI still use /plans/:id/venues
    addVenueToPlan: function(planId, venueId){
      return req('/plans/' + encodeURIComponent(planId) + '/venues',
        { method:'POST', body:{ venue_id: venueId }});
    },
    addToPlan: function(planId, venueId){
      return req('/plans/' + encodeURIComponent(planId) + '/venues',
        { method:'POST', body:{ venue_id: venueId }});
    },
    // v2 stops
    addStop: function(planId, body){
      // body: { venue_id, sort_order?, arrival_time?, notes? }
      return req('/plans/' + encodeURIComponent(planId) + '/stops',
        { method:'POST', body: body });
    },
    updateStop: function(planId, stopId, body){
      return req('/plans/' + encodeURIComponent(planId) + '/stops/' + encodeURIComponent(stopId),
        { method:'PUT', body: body });
    },
    deleteStop: function(planId, stopId){
      return req('/plans/' + encodeURIComponent(planId) + '/stops/' + encodeURIComponent(stopId),
        { method:'DELETE' });
    },
    // Plan invites
    invitePlan: function(planId, body){
      // body: { user_id } or { username }
      return req('/plans/' + encodeURIComponent(planId) + '/invites',
        { method:'POST', body: body });
    },
    incomingPlanInvites: function(){ return req('/plans/invites/incoming'); },
    acceptPlanInvite: function(planId, inviteId){
      return req('/plans/' + encodeURIComponent(planId) + '/invites/' + encodeURIComponent(inviteId) + '/accept',
        { method:'POST' });
    },
    declinePlanInvite: function(planId, inviteId){
      return req('/plans/' + encodeURIComponent(planId) + '/invites/' + encodeURIComponent(inviteId) + '/decline',
        { method:'POST' });
    },
    sharePlan: function(planId, body){
      return req('/plans/' + encodeURIComponent(planId) + '/share',
        { method:'POST', body: body || {} });
    },

    // ---- reviews
    reviewsForVenue: function(venueId){ return req('/reviews?venue_id=' + encodeURIComponent(venueId)); },
    postReview: function(venueId, rating, content){
      // Backend accepts `content`; allow either positional or object call
      if (typeof venueId === 'object' && venueId !== null) {
        return req('/reviews', { method:'POST', body: venueId });
      }
      return req('/reviews', { method:'POST', body:{ venue_id: venueId, rating: rating, content: content || '' }});
    },

    // ---- checkins
    checkin: function(body){
      // body: { venue_id, note?, visibility? }
      if (typeof body === 'string') body = { venue_id: body };
      return req('/checkins', { method:'POST', body: body });
    },
    myCheckins: function(){ return req('/checkins'); },
    deleteCheckin: function(id){ return req('/checkins/' + encodeURIComponent(id), { method:'DELETE' }); },
    checkinsByVenue: function(venueId){
      return req('/checkins/venue/' + encodeURIComponent(venueId));
    },

    // ---- block / unblock (Phase 6E)
    blockUser: function(userId, reason){
      return req('/users/' + encodeURIComponent(userId) + '/block', { method:'POST', body:{ reason: reason || null }});
    },
    unblockUser: function(userId){
      return req('/users/' + encodeURIComponent(userId) + '/block', { method:'DELETE' });
    },
    listBlocked: function(){ return req('/users/blocked'); },

    // ---- rename list (Phase 6E)
    renameList: function(listId, fields){
      return req('/lists/' + encodeURIComponent(listId), { method:'PATCH', body: fields || {} });
    },

    // ---- AI Concierge (preserved)
    // Phase 7B-Resume: aligned with real backend route POST /api/concierge
    // (live widget ai-concierge-v5.js already calls /api/concierge directly;
    // this helper is now consistent so any future caller hits the same route)
    aiMessage: function(body){
      // body: { message, session_id? }
      return req('/concierge', { method:'POST', body: body });
    },

    // ---- universal search + social summary (Phase 8C)
    universalSearch: function(q, limit){ return req('/search/universal' + qs({ q: q, limit: limit || 6 })); },
    socialSummary: function(){ return req('/social/summary'); },

    // ---- health
    health: function(){ return req('/health'); },

    // ---- compliance (App Store required)
    deleteAccount: function(password, reason){
      return req('/auth/account', { method:'DELETE', body:{ password: password || '', reason: reason || null } })
        .then(function(d){ clearToken(); return d; });
    },

    // ---- content reports (UGC moderation)
    reportContent: function(target_type, target_id, reason, details){
      return req('/reports', { method:'POST', body:{
        target_type: target_type, target_id: target_id,
        reason: reason, details: details || null
      }});
    },
    myReports: function(){ return req('/reports/mine'); },

    // ---- push notification tokens (called from native shell)
    registerPushToken: function(token, platform, device_id, app_version){
      return req('/push/register-token', { method:'POST', body:{
        token: token, platform: platform,
        device_id: device_id || null, app_version: app_version || null
      }});
    },
    unregisterPushToken: function(token){
      return req('/push/token', { method:'DELETE', body:{ token: token }});
    },
  };

  // Fire once-on-load auth check
  if (getToken()) {
    window.SLApi.me().then(function(d){
      if (d && d.user) {
        window.SL_USER = d.user;
        window.dispatchEvent(new CustomEvent('sl-auth-ready', { detail:{ user: d.user }}));
      } else {
        clearToken();
      }
    }).catch(function(){ clearToken(); });
  }
})();

/* === js/sl-auth-core.js === */
/* =========================================================================
   SL AUTH CORE — Single source of truth for SceneLink authentication.
   Replaces: auth.js (broken Supabase), universal-auth.js, parts of sl-auth.js.
   
   Storage:
     sl_jwt_token   → JWT string (read/written by sl-api.js + here ONLY)
     sl_user_cache  → JSON { user } cached profile
   
   API: window.SLAuth
     SLAuth.isAuthed()          → bool
     SLAuth.user()              → cached user object or null
     SLAuth.token()             → jwt string or ''
     SLAuth.refresh()           → Promise<user|null>  (hits /api/auth/me)
     SLAuth.login(email, pw)    → Promise<user>
     SLAuth.signup({...})       → Promise<user>
     SLAuth.logout()            → clears state, dispatches sl-auth-changed, reloads
     SLAuth.requireAuth(label)  → Promise<user> (opens modal if logged out)
     SLAuth.openLogin(tab)      → opens the auth modal ('login'|'signup')
   
   Events:
     window.dispatchEvent('sl-auth-changed', { detail: { user, authed } })
   ========================================================================= */
(function(){
  'use strict';

  if (window.SLAuth && window.SLAuth.__core === true) return; // already loaded

  var TOKEN_KEY = 'sl_jwt_token';
  var USER_KEY  = 'sl_user_cache';

  var state = {
    user: null,
    loading: false,
    lastRefresh: 0
  };

  // ---------- storage helpers ----------
  function readToken(){
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch(e){ return ''; }
  }
  function writeToken(t){
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else   localStorage.removeItem(TOKEN_KEY);
    } catch(e){}
  }
  function readCache(){
    try {
      var raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      return (obj && obj.user) ? obj.user : (obj || null);
    } catch(e){ return null; }
  }
  function writeCache(user){
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify({ user: user, cached_at: Date.now() }));
      else      localStorage.removeItem(USER_KEY);
    } catch(e){}
  }

  // ---------- core state ----------
  function isAuthed(){
    return !!readToken();
  }
  function currentUser(){
    if (state.user) return state.user;
    var c = readCache();
    if (c) state.user = c;
    return state.user;
  }
  function emit(){
    try {
      window.dispatchEvent(new CustomEvent('sl-auth-changed', {
        detail: { user: state.user, authed: isAuthed() }
      }));
    } catch(e){}
  }

  // ---------- api ----------
  function apiBase(){
    try {
      if (window.SL_CONFIG && window.SL_CONFIG.API_BASE_URL) return window.SL_CONFIG.API_BASE_URL;
    } catch(e){}
    return '/api';
  }
  function apiCall(path, opts){
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    var tok = readToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    return fetch(apiBase() + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal, keepalive: !!opts.keepalive
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if (!r.ok) {
          var msg = (j && (j.error || j.message)) || ('HTTP ' + r.status);
          var err = new Error(msg);
          err.status = r.status;
          err.body = j;
          throw err;
        }
        return j;
      });
    });
  }

  // ---------- auth operations ----------
  function refresh(){
    if (!isAuthed()) {
      state.user = null;
      writeCache(null);
      emit();
      return Promise.resolve(null);
    }
    state.loading = true;
    var refreshingToken = readToken();
    return apiCall('/auth/me').then(function(j){
      if(readToken() !== refreshingToken){ state.loading=false; return null; }
      state.loading = false;
      state.lastRefresh = Date.now();
      var u = (j && j.user) ? j.user : j;
      state.user = u;
      writeCache(u);
      if (window.SLApi && window.SLApi.setToken) {
        var t = readToken(); if (t) window.SLApi.setToken(t);
      }
      emit();
      return u;
    }).catch(function(err){
      state.loading = false;
      if (err.status === 401 || err.status === 403) {
        // token dead → clean logout
        writeToken(null);
        writeCache(null);
        state.user = null;
        emit();
      }
      return null;
    });
  }

  function login(email, password){
    return apiCall('/auth/login', {
      method: 'POST',
      body: { email: email, password: password }
    }).then(function(d){
      if (!d || !d.token) throw new Error('Login failed');
      writeToken(d.token);
      writeCache(d.user);
      state.user = d.user;
      if (window.SLApi && window.SLApi.setToken) window.SLApi.setToken(d.token);
      emit();
      return d.user;
    });
  }

  function signup(payload){
    return apiCall('/auth/signup', {
      method: 'POST',
      body: payload
    }).then(function(d){
      if (!d || !d.token) throw new Error('Signup failed');
      writeToken(d.token);
      writeCache(d.user);
      state.user = d.user;
      if (window.SLApi && window.SLApi.setToken) window.SLApi.setToken(d.token);
      emit();
      return d.user;
    });
  }

  function forgotPassword(email){
    return apiCall('/auth/forgot-password', { method: 'POST', body: { email: email } });
  }

  // Google OAuth — backend verifies the Google ID token
  function loginWithGoogle(idToken){
    if (!idToken) return Promise.reject(new Error('Missing Google id_token'));
    return apiCall('/auth/google', {
      method: 'POST',
      body: { id_token: idToken }
    }).then(function(d){
      if (!d || !d.token) throw new Error('Google sign-in failed');
      writeToken(d.token);
      writeCache(d.user);
      state.user = d.user;
      if (window.SLApi && window.SLApi.setToken) window.SLApi.setToken(d.token);
      emit();
      return d.user;
    });
  }

  // Apple Sign In — backend verifies the Apple identity token
  function loginWithApple(payload){
    // payload: { id_token, user?: { name: {firstName, lastName}, email } }
    if (!payload || !payload.id_token) return Promise.reject(new Error('Missing Apple id_token'));
    return apiCall('/auth/apple', {
      method: 'POST',
      body: payload
    }).then(function(d){
      if (!d || !d.token) throw new Error('Apple sign-in failed');
      writeToken(d.token);
      writeCache(d.user);
      state.user = d.user;
      if (window.SLApi && window.SLApi.setToken) window.SLApi.setToken(d.token);
      emit();
      return d.user;
    });
  }

  function logout(opts){
    opts = opts || {};
    var hadToken = !!readToken(), timer, controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    // Start with the existing bearer token, then immediately end local authentication.
    var request;
    try { request = hadToken ? apiCall('/auth/logout', {method:'POST',body:{},signal:controller && controller.signal,keepalive:true}) : Promise.resolve({revoked:false}); }
    catch(err) { request = Promise.reject(err); }
    writeToken(null); writeCache(null); state.user = null;
    try { ['sl_token','sl_current_user','sl_auth_token','auth_token','jwt','sl_user'].forEach(function(k){ localStorage.removeItem(k); }); } catch(e){}
    emit();
    var timeout = new Promise(function(resolve){
      timer = setTimeout(function(){ if(controller) controller.abort(); resolve({ok:true,revoked:false,error:'Session revocation timed out'}); }, 8000);
    });
    var outcome = Promise.resolve(request).then(function(d){ return {ok:true,revoked:hadToken && !!(d && d.revoked)}; },function(err){ return {ok:true,revoked:false,error:err.message}; });
    return Promise.race([outcome,timeout]).then(function(result){
      if(typeof clearTimeout==='function') clearTimeout(timer);
      if(opts.reload !== false) window.location.href = '/';
      return result;
    });
  }

  // ---------- modal gate ----------
  function openLogin(tab){
    if (window.SLAuthUI && typeof window.SLAuthUI.open === 'function') {
      window.SLAuthUI.open(tab || 'login');
      return;
    }
    // fallback — wait up to 2s for UI module to mount
    var waited = 0;
    var iv = setInterval(function(){
      waited += 100;
      if (window.SLAuthUI && window.SLAuthUI.open) {
        clearInterval(iv);
        window.SLAuthUI.open(tab || 'login');
      } else if (waited >= 2000) {
        clearInterval(iv);
        // last-resort alert so user isn't stranded
        alert('Please sign in to continue.');
      }
    }, 100);
  }

  function requireAuth(label){
    return new Promise(function(resolve, reject){
      if (isAuthed() && state.user) return resolve(state.user);
      if (isAuthed()) {
        return refresh().then(function(u){
          if (u) resolve(u); else openAndWait();
        });
      }
      openAndWait();

      function openAndWait(){
        openLogin('login');
        // resolve when auth-changed fires
        function onChange(e){
          if (e.detail && e.detail.authed && e.detail.user) {
            window.removeEventListener('sl-auth-changed', onChange);
            resolve(e.detail.user);
          }
        }
        window.addEventListener('sl-auth-changed', onChange);
      }
    });
  }

  // ---------- boot ----------
  window.SLAuth = {
    __core: true,
    isAuthed: isAuthed,
    user: currentUser,
    token: readToken,
    // compat aliases — older code calls these names:
    getUser:  currentUser,
    getToken: readToken,
    openModal: openLogin,
    refresh: refresh,
    login: login,
    signup: signup,
    loginWithGoogle: loginWithGoogle,
    loginWithApple: loginWithApple,
    forgotPassword: forgotPassword,
    logout: logout,
    requireAuth: requireAuth,
    openLogin: openLogin
  };

  // Initial refresh on boot (quietly)
  if (isAuthed()) {
    setTimeout(function(){ refresh(); }, 0);
  }

  // Cross-tab sync
  window.addEventListener('storage', function(e){
    if (e.key === TOKEN_KEY || e.key === USER_KEY) {
      state.user = readCache();
      emit();
    }
  });

  console.log('[SLAuth] core ready · authed=', isAuthed());
})();

/* === js/sl-auth-ui.js === */
/* =========================================================================
   SL AUTH UI — Premium login / signup / forgot-password modal.
   Depends on: SLAuth (sl-auth-core.js).
   Exposes: window.SLAuthUI = { open, close }
   ========================================================================= */
(function(){
  'use strict';

  if (window.SLAuthUI && window.SLAuthUI.__ui === true) return;

  var MOUNTED = false;
  var overlay = null;
  var previousFocus = null, previousOverflow = null;

  function el(tag, attrs, html){
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs){ n.setAttribute(k, attrs[k]); }
    if (html != null) n.innerHTML = html;
    return n;
  }

  function oauthButtonsHTML(){
    var appleEnabled = !!(window.SL_CONFIG && window.SL_CONFIG.APPLE_ENABLED);
    var googleEnabled = !!(window.SL_CONFIG && window.SL_CONFIG.GOOGLE_CLIENT_ID);
    var html = '<div class="sl-oauth-stack">';
    if (googleEnabled) {
      html += [
        '<button type="button" class="sl-oauth-btn sl-oauth-google" data-oauth="google">',
        '  <span class="sl-oauth-icon" aria-hidden="true">',
        '    <svg viewBox="0 0 24 24" width="18" height="18">',
        '      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>',
        '      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/>',
        '      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.44.35-2.09V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.84z"/>',
        '      <path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>',
        '    </svg>',
        '  </span>',
        '  <span>Continue with Google</span>',
        '</button>'
      ].join('');
    }
    if (appleEnabled || (window.SL_CONFIG && window.SL_CONFIG.APPLE_CLIENT_ID)) {
      var disabled = !appleEnabled;
      html += [
        '<button type="button" class="sl-oauth-btn sl-oauth-apple' + (disabled ? ' is-disabled' : '') + '" ',
        '        data-oauth="apple"' + (disabled ? ' aria-disabled="true"' : '') + '>',
        '  <span class="sl-oauth-icon" aria-hidden="true">',
        '    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">',
        '      <path d="M16.365 1.43c0 1.14-.468 2.28-1.23 3.1-.84.9-2.206 1.596-3.3 1.5-.138-1.1.42-2.25 1.15-2.97.82-.82 2.208-1.44 3.38-1.63zM20.94 17.1c-.546 1.26-.81 1.83-1.51 2.95-.98 1.57-2.36 3.52-4.07 3.53-1.52.01-1.91-.99-3.97-.98-2.07.01-2.5 1-4.02.98-1.71-.02-3.02-1.78-4-3.35C1.64 15.32.82 9.88 3.73 6.95c1.47-1.48 3.32-2.36 4.99-2.36 1.7 0 2.77.93 4.17.93 1.36 0 2.19-.93 4.15-.93 1.48 0 3.05.81 4.18 2.2-3.68 2.01-3.08 7.27-.28 10.31z"/>',
        '    </svg>',
        '  </span>',
        '  <span>' + (disabled ? 'Apple Sign In — coming soon' : 'Continue with Apple') + '</span>',
        '</button>'
      ].join('');
    }
    html += '</div>';
    if (googleEnabled || appleEnabled) {
      html += '<div class="sl-auth-or">or continue with email</div>';
    }
    return html;
  }

  function build(){
    if (MOUNTED) return;
    overlay = el('div', { class: 'sl-auth-overlay', role: 'dialog', 'aria-modal': 'true' });
    overlay.innerHTML = [
      '<div class="sl-auth-modal">',
      '  <button type="button" class="sl-auth-close" aria-label="Close">&times;</button>',
      '  <div class="sl-auth-brand">',
      '    <div class="sl-auth-brand-logo">🌃</div>',
      '    <h2 class="sl-auth-title" data-sl-title>Welcome back</h2>',
      '    <p class="sl-auth-sub" data-sl-sub>Sign in to continue to SceneLink</p>',
      '  </div>',

      '  <div class="sl-auth-tabs" data-sl-tabs>',
      '    <button type="button" class="sl-auth-tab active" data-tab="login">Sign in</button>',
      '    <button type="button" class="sl-auth-tab" data-tab="signup">Create account</button>',
      '  </div>',

      '  <div class="sl-auth-error" data-sl-error></div>',
      '  <div class="sl-auth-success" data-sl-success></div>',

      '  <div data-sl-oauth-slot>' + oauthButtonsHTML() + '</div>',

      '  <form class="sl-auth-form active" data-form="login" autocomplete="on" novalidate>',
      '    <div class="sl-auth-field">',
      '      <label class="sl-auth-label">Email</label>',
      '      <input class="sl-auth-input" type="email" name="email" autocomplete="email" placeholder="you@example.com" required>',
      '    </div>',
      '    <div class="sl-auth-field">',
      '      <label class="sl-auth-label">Password</label>',
      '      <input class="sl-auth-input" type="password" name="password" autocomplete="current-password" placeholder="••••••••" required>',
      '    </div>',
      '    <button type="submit" class="sl-auth-submit">Sign in</button>',
      '    <div class="sl-auth-foot">',
      '      <button type="button" class="sl-auth-link" data-action="forgot">Forgot password?</button>',
      '    </div>',
      '  </form>',

      '  <form class="sl-auth-form" data-form="signup" autocomplete="on" novalidate>',
      '    <div class="sl-auth-field">',
      '      <label class="sl-auth-label">Display name</label>',
      '      <input class="sl-auth-input" type="text" name="display_name" autocomplete="name" placeholder="How your friends know you" required maxlength="60">',
      '    </div>',
      '    <div class="sl-auth-row">',
      '      <div class="sl-auth-field">',
      '        <label class="sl-auth-label">Username</label>',
      '        <input class="sl-auth-input" type="text" name="username" autocomplete="username" placeholder="yourhandle" required maxlength="24" pattern="[a-zA-Z0-9_]+">',
      '      </div>',
      '    </div>',
      '    <div class="sl-auth-field">',
      '      <label class="sl-auth-label">Email</label>',
      '      <input class="sl-auth-input" type="email" name="email" autocomplete="email" placeholder="you@example.com" required>',
      '    </div>',
      '    <div class="sl-auth-field">',
      '      <label class="sl-auth-label">Password</label>',
      '      <input class="sl-auth-input" type="password" name="password" autocomplete="new-password" placeholder="At least 8 characters" required minlength="8">',
      '      <div class="sl-auth-hint">Use at least 8 characters with a mix of letters and numbers.</div>',
      '    </div>',
      '    <button type="submit" class="sl-auth-submit">Create account</button>',
      '    <p class="sl-auth-terms">',
      '      By creating an account, you agree to our ',
      '      <a href="/terms.html" target="_blank">Terms</a> and ',
      '      <a href="/privacy.html" target="_blank">Privacy Policy</a>.',
      '    </p>',
      '  </form>',

      '  <form class="sl-auth-form" data-form="forgot" autocomplete="on" novalidate>',
      '    <div class="sl-auth-field">',
      '      <label class="sl-auth-label">Email</label>',
      '      <input class="sl-auth-input" type="email" name="email" autocomplete="email" placeholder="you@example.com" required>',
      '      <div class="sl-auth-hint">We\'ll send a password reset link if an account exists.</div>',
      '    </div>',
      '    <button type="submit" class="sl-auth-submit">Send reset link</button>',
      '    <div class="sl-auth-foot">',
      '      <button type="button" class="sl-auth-link" data-action="back-to-login">← Back to sign in</button>',
      '    </div>',
      '  </form>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);

    // events
    overlay.addEventListener('click', function(e){
      if (e.target === overlay) close();
    });
    overlay.querySelector('.sl-auth-close').addEventListener('click', close);

    // tabs
    overlay.querySelectorAll('.sl-auth-tab').forEach(function(t){
      t.addEventListener('click', function(){ switchTab(t.getAttribute('data-tab')); });
    });

    // forgot link
    overlay.querySelector('[data-action="forgot"]').addEventListener('click', function(){ switchTab('forgot'); });
    overlay.querySelector('[data-action="back-to-login"]').addEventListener('click', function(){ switchTab('login'); });

    // forms
    overlay.querySelector('[data-form="login"]').addEventListener('submit', onLogin);
    overlay.querySelector('[data-form="signup"]').addEventListener('submit', onSignup);
    overlay.querySelector('[data-form="forgot"]').addEventListener('submit', onForgot);

    // OAuth buttons (delegated so re-renders still work)
    overlay.addEventListener('click', function(e){
      var btn = e.target.closest('[data-oauth]');
      if (!btn || btn.classList.contains('is-disabled')) {
        if (btn && btn.classList.contains('is-disabled')) {
          setMessage('error', 'Apple Sign In is coming soon. Please use Google or email.');
        }
        return;
      }
      var provider = btn.getAttribute('data-oauth');
      if (provider === 'google') startGoogle();
      else if (provider === 'apple') startApple();
    });

    // ESC to close
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    MOUNTED = true;
  }

  function setMessage(type, text){
    if (!overlay) return;
    var err = overlay.querySelector('[data-sl-error]');
    var suc = overlay.querySelector('[data-sl-success]');
    err.classList.remove('show'); suc.classList.remove('show');
    if (type === 'error'   && text){ err.textContent = text; err.classList.add('show'); }
    if (type === 'success' && text){ suc.textContent = text; suc.classList.add('show'); }
  }

  function switchTab(tab){
    if (!overlay) return;
    setMessage();
    var titles = {
      login:  { t: 'Welcome back',       s: 'Sign in to continue to SceneLink' },
      signup: { t: 'Create your account', s: 'Join SceneLink and start planning nights out' },
      forgot: { t: 'Reset password',     s: 'We\'ll email you a reset link' }
    };
    var conf = titles[tab] || titles.login;
    overlay.querySelector('[data-sl-title]').textContent = conf.t;
    overlay.querySelector('[data-sl-sub]').textContent   = conf.s;

    // tabs visibility: hide tab strip for forgot
    var tabStrip = overlay.querySelector('[data-sl-tabs]');
    tabStrip.style.display = (tab === 'forgot') ? 'none' : 'flex';

    overlay.querySelectorAll('.sl-auth-tab').forEach(function(el){
      el.classList.toggle('active', el.getAttribute('data-tab') === tab);
    });
    overlay.querySelectorAll('.sl-auth-form').forEach(function(f){
      f.classList.toggle('active', f.getAttribute('data-form') === tab);
    });

    // focus first input
    setTimeout(function(){
      var first = overlay.querySelector('.sl-auth-form.active input');
      if (first && overlay.classList.contains('open')) first.focus();
    }, 50);
  }

  // ---------- Google OAuth ----------
  var _googleLoaded = false;
  function loadGoogleSDK(){
    return new Promise(function(resolve, reject){
      if (window.google && window.google.accounts && window.google.accounts.id) {
        resolve(); return;
      }
      if (_googleLoaded) {
        // poll until ready (max ~8s)
        var tries = 0;
        var iv = setInterval(function(){
          if (window.google && window.google.accounts && window.google.accounts.id) {
            clearInterval(iv); resolve();
          } else if (++tries > 80) { clearInterval(iv); reject(new Error('Google Sign-In is taking too long. Please check your connection and try again.')); }
        }, 100);
        return;
      }
      _googleLoaded = true;
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      var settled = false;
      var hardTimeout = setTimeout(function(){
        if (settled) return;
        settled = true;
        _googleLoaded = false; // allow retry on next click
        reject(new Error('Google Sign-In is taking too long. Please check your connection and try again.'));
      }, 10000);
      s.onload = function(){
        if (settled) return;
        settled = true;
        clearTimeout(hardTimeout);
        // Wait briefly for google.accounts.id to actually be defined
        var waits = 0;
        var iv2 = setInterval(function(){
          if (window.google && window.google.accounts && window.google.accounts.id) {
            clearInterval(iv2); resolve();
          } else if (++waits > 40) {
            clearInterval(iv2);
            _googleLoaded = false;
            reject(new Error('Google Sign-In failed to initialize. Please try again.'));
          }
        }, 50);
      };
      s.onerror = function(){
        if (settled) return;
        settled = true;
        clearTimeout(hardTimeout);
        _googleLoaded = false;
        reject(new Error('Could not reach Google. Check your connection and try again.'));
      };
      document.head.appendChild(s);
    });
  }

  function startGoogle(){
    setMessage();
    var clientId = window.SL_CONFIG && window.SL_CONFIG.GOOGLE_CLIENT_ID;
    if (!clientId) { setMessage('error', 'Google Sign-In is not configured.'); return; }
    var btn = overlay.querySelector('[data-oauth="google"]');
    if (btn) { btn.disabled = true; btn.querySelector('span:last-child').textContent = 'Connecting to Google…'; }

    loadGoogleSDK().then(function(){
      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: function(resp){
            if (!resp || !resp.credential) {
              setMessage('error', 'Google did not return a credential.');
              resetGoogleBtn(); return;
            }
            window.SLAuth.loginWithGoogle(resp.credential).then(function(user){
              setMessage('success', 'Welcome, ' + (user.display_name || user.username) + '!');
              setTimeout(close, 500);
            }).catch(function(err){
              setMessage('error', err.message || 'Google sign-in failed.');
              resetGoogleBtn();
            });
          },
          ux_mode: 'popup',
          auto_select: false
        });

        // Hard safety: if no result in 25s, reset the button and message the user.
        var promptSettled = false;
        var promptTimeout = setTimeout(function(){
          if (promptSettled) return;
          promptSettled = true;
          setMessage('error', 'Google Sign-In did not respond. Please try again or use email.');
          resetGoogleBtn();
        }, 25000);
        var _origCb = window.SLAuth && window.SLAuth.loginWithGoogle;
        // Wrap resetGoogleBtn so timeout is cleared on resolve paths
        var _origReset = resetGoogleBtn;

        // Use prompt() for One Tap style OR render a temporary button and click it.
        google.accounts.id.prompt(function(notification){
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // fallback: render button and trigger click
            renderGoogleButtonFallback(clientId, function(){
              promptSettled = true; clearTimeout(promptTimeout);
            });
          } else if (notification.isDismissedMoment && notification.isDismissedMoment()) {
            promptSettled = true; clearTimeout(promptTimeout);
            resetGoogleBtn();
          }
        });
      } catch(err){
        setMessage('error', 'Could not start Google sign-in.');
        resetGoogleBtn();
      }
    }).catch(function(err){
      setMessage('error', err.message || 'Google SDK failed to load.');
      resetGoogleBtn();
    });
  }

  function renderGoogleButtonFallback(clientId, onShown){
    // Render the official Google button in a hidden slot and auto-click.
    var host = document.getElementById('sl-google-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sl-google-host';
      host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
      document.body.appendChild(host);
    }
    host.innerHTML = '';
    try {
      google.accounts.id.renderButton(host, { theme: 'filled_black', size: 'large', type: 'standard' });
      setTimeout(function(){
        var real = host.querySelector('div[role="button"]');
        if (real) { real.click(); if (typeof onShown === 'function') onShown(); }
        else setMessage('error', 'Please allow popups to sign in with Google.');
      }, 300);
    } catch(e){
      setMessage('error', 'Please allow popups to sign in with Google.');
    }
  }

  function resetGoogleBtn(){
    var btn = overlay.querySelector('[data-oauth="google"]');
    if (btn) { btn.disabled = false; btn.querySelector('span:last-child').textContent = 'Continue with Google'; }
  }

  // ---------- Apple OAuth ----------
  function startApple(){
    // If APPLE_ENABLED=false, the button is inert. Kept for future enablement:
    setMessage();
    var clientId = window.SL_CONFIG && window.SL_CONFIG.APPLE_CLIENT_ID;
    if (!clientId || !(window.SL_CONFIG && window.SL_CONFIG.APPLE_ENABLED)) {
      setMessage('error', 'Apple Sign In is coming soon. Please use Google or email.');
      return;
    }
    // Prevent an infinite "loading" state: hard cap at 25s from button click
    // to final Apple response (matches Google prompt timeout).
    var settled = false;
    var hardTimer = setTimeout(function(){
      if (settled) return;
      settled = true;
      setMessage('error', 'Apple sign-in took too long. Please try again or use email.');
      resetAppleBtn();
    }, 25000);

    var btn = overlay.querySelector('[data-oauth="apple"]');
    if (btn) { btn.disabled = true; var lbl = btn.querySelector('span:last-child'); if (lbl) lbl.textContent = 'Connecting to Apple…'; }

    loadAppleSDK().then(function(){
      try {
        AppleID.auth.init({
          clientId: clientId,
          scope: 'name email',
          redirectURI: window.location.origin + '/',
          usePopup: true
        });
        return AppleID.auth.signIn();
      } catch(e){ throw e; }
    }).then(function(data){
      if (!data || !data.authorization || !data.authorization.id_token) {
        throw new Error('Apple did not return an ID token.');
      }
      return window.SLAuth.loginWithApple({
        id_token: data.authorization.id_token,
        user: data.user || undefined
      }).then(function(user){
        if (settled) return;
        settled = true;
        clearTimeout(hardTimer);
        setMessage('success', 'Welcome, ' + (user.display_name || user.username) + '!');
        setTimeout(close, 500);
      });
    }).catch(function(err){
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      // Apple's popup cancel throws { error: 'popup_closed_by_user' } — show friendly text
      var msg = (err && err.message) || (err && err.error) || 'Apple sign-in failed.';
      if (/popup_closed|user_cancel|user_trigger|cancel/i.test(msg)) {
        setMessage(); // silent cancel
      } else {
        setMessage('error', msg);
      }
      resetAppleBtn();
    });
  }

  function resetAppleBtn(){
    var btn = overlay.querySelector('[data-oauth="apple"]');
    if (btn) { btn.disabled = false; var lbl = btn.querySelector('span:last-child'); if (lbl) lbl.textContent = 'Continue with Apple'; }
  }

  function loadAppleSDK(){
    return new Promise(function(resolve, reject){
      if (window.AppleID) return resolve();
      // Hard timeout on SDK load: 10s (matches Google SDK load cap)
      var sdkTimer = setTimeout(function(){
        reject(new Error('Apple SDK took too long to load. Please try again.'));
      }, 10000);
      var s = document.createElement('script');
      s.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
      s.async = true;
      s.defer = true;
      s.onload = function(){ clearTimeout(sdkTimer); resolve(); };
      s.onerror = function(){ clearTimeout(sdkTimer); reject(new Error('Failed to load Apple SDK')); };
      document.head.appendChild(s);
    });
  }

  function onLogin(e){
    e.preventDefault();
    setMessage();
    var f = e.currentTarget;
    var email = f.email.value.trim();
    var pw    = f.password.value;
    if (!email || !pw){ setMessage('error', 'Please enter email and password.'); return; }
    var btn = f.querySelector('.sl-auth-submit');
    btn.disabled = true; btn.textContent = 'Signing in...';
    window.SLAuth.login(email, pw).then(function(user){
      setMessage('success', 'Welcome back, ' + (user.display_name || user.username) + '!');
      setTimeout(function(){
        close();
        // if we're on a page that should refresh after login, do so
        try {
          var url = new URL(window.location.href);
          if (url.searchParams.get('after_login')){
            url.searchParams.delete('after_login');
            window.location.href = url.toString();
          } else {
            // soft re-render via event (pages listen to sl-auth-changed)
          }
        } catch(e){}
      }, 400);
    }).catch(function(err){
      setMessage('error', err.message || 'Sign in failed. Check your email and password.');
    }).finally(function(){
      btn.disabled = false; btn.textContent = 'Sign in';
    });
  }

  function onSignup(e){
    e.preventDefault();
    setMessage();
    var f = e.currentTarget;
    var payload = {
      display_name: f.display_name.value.trim(),
      username:     f.username.value.trim().toLowerCase(),
      email:        f.email.value.trim(),
      password:     f.password.value
    };
    if (!payload.display_name || !payload.username || !payload.email || !payload.password){
      setMessage('error', 'Please fill all fields.'); return;
    }
    if (!/^[a-z0-9_]{3,24}$/.test(payload.username)){
      setMessage('error', 'Username must be 3–24 chars: letters, numbers, underscore only.'); return;
    }
    if (payload.password.length < 8){
      setMessage('error', 'Password must be at least 8 characters.'); return;
    }
    var btn = f.querySelector('.sl-auth-submit');
    btn.disabled = true; btn.textContent = 'Creating account...';
    window.SLAuth.signup(payload).then(function(user){
      setMessage('success', 'Welcome to SceneLink, ' + (user.display_name || user.username) + '!');
      setTimeout(close, 500);
    }).catch(function(err){
      var msg = err.message || 'Sign up failed.';
      if (/already|exists|unique/i.test(msg)) {
        msg = 'That email or username is already taken.';
      }
      setMessage('error', msg);
    }).finally(function(){
      btn.disabled = false; btn.textContent = 'Create account';
    });
  }

  function onForgot(e){
    e.preventDefault();
    setMessage();
    var f = e.currentTarget;
    var email = f.email.value.trim();
    if (!email){ setMessage('error', 'Enter your email.'); return; }
    var btn = f.querySelector('.sl-auth-submit');
    btn.disabled = true; btn.textContent = 'Sending...';
    window.SLAuth.forgotPassword(email).then(function(){
      setMessage('success', 'If that email exists, a reset link is on the way.');
    }).catch(function(err){
      // be generic
      setMessage('success', 'If that email exists, a reset link is on the way.');
    }).finally(function(){
      btn.disabled = false; btn.textContent = 'Send reset link';
    });
  }

  function open(tab, returnFocus){
    window.dispatchEvent(new CustomEvent('sl:explicit-modal'));
    build();
    if (!overlay.classList.contains('open')) {
      previousFocus = returnFocus || document.activeElement;
      previousOverflow = document.body.style.overflow;
    }
    setMessage();
    switchTab(tab || 'login');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close(){
    if (!overlay || !overlay.classList.contains('open')) return;
    overlay.classList.remove('open');
    document.body.style.overflow = previousOverflow || '';
    if (previousFocus && previousFocus.isConnected && !previousFocus.disabled) previousFocus.focus();
    setMessage();
  }

  // --- Lightweight global click router for [data-sl-auth-action] ---
  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-sl-auth-action]');
    if (!t) return;
    var act = t.getAttribute('data-sl-auth-action');
    if (act === 'login' || act === 'signin')   { e.preventDefault(); open('login'); }
    else if (act === 'signup' || act === 'register'){ e.preventDefault(); open('signup'); }
    else if (act === 'logout'){ e.preventDefault(); window.SLAuth.logout(); }
  });

  // Also handle legacy `.sl-auth-trigger` elements for back-compat
  document.addEventListener('click', function(e){
    var t = e.target.closest('.sl-auth-trigger, [data-auth-open], [data-login-trigger]');
    if (t && !t.hasAttribute('data-sl-auth-action')) {
      e.preventDefault();
      open('login');
    }
  });

  window.SLAuthUI = { __ui: true, open: open, close: close };
  console.log('[SLAuthUI] ready');
})();

/* === js/sl-auth.js === */
/* =========================================================================
   sl-auth.js — Compat shim for legacy code that loads this file.
   Actual auth is handled by sl-auth-core.js + sl-auth-ui.js.
   This file performs:
     1. Self-healing auth-aware UI (header buttons, hello messages)
     2. Back-compat for legacy helpers
   ========================================================================= */
(function(){
  'use strict';

  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

  function applyAuthUI(){
    if (!window.SLAuth) return;
    var authed = window.SLAuth.isAuthed();
    var user = window.SLAuth.user();

    // Elements visible only when authed
    $all('[data-sl-show-if="authed"]').forEach(function(el){
      el.style.display = authed ? '' : 'none';
    });
    // Elements visible only when logged out
    $all('[data-sl-show-if="guest"]').forEach(function(el){
      el.style.display = authed ? 'none' : '';
    });

    // Display name slots
    $all('[data-sl-user="display_name"]').forEach(function(el){
      el.textContent = (user && (user.display_name || user.username)) || '';
    });
    $all('[data-sl-user="username"]').forEach(function(el){
      el.textContent = (user && user.username) ? '@' + user.username : '';
    });
    $all('[data-sl-user="avatar"]').forEach(function(el){
      if (user && user.avatar_url) {
        el.setAttribute('src', user.avatar_url);
        el.style.display = '';
      }
    });

    // Legacy header buttons
    $all('.sl-auth-trigger, [data-auth-open]').forEach(function(el){
      el.style.display = authed ? 'none' : '';
    });
    $all('.sl-logged-in-only, [data-logged-in-only]').forEach(function(el){
      el.style.display = authed ? '' : 'none';
    });
  }

  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  onReady(function(){
    applyAuthUI();
    window.addEventListener('sl-auth-changed', applyAuthUI);
    // re-apply periodically for a few seconds (self-healing for async-rendered headers)
    var count = 0, iv = setInterval(function(){
      applyAuthUI();
      if (++count >= 8) clearInterval(iv);
    }, 500);
  });
})();

/* === js/sl-auth-gate.js === */
/* =========================================================================
   sl-auth-gate.js — Compat shim.
   Real gating logic lives in sl-page-guard.js.
   Exports SLAuthGate alias so older code keeps working.
   ========================================================================= */
(function(){
  'use strict';
  function isAuthed(){ return !!(window.SLAuth && window.SLAuth.isAuthed()); }
  window.SLAuthGate = {
    isAuthenticated: isAuthed,
    isAuthed: isAuthed,
    require: function(label, onAuthed){
      if (isAuthed()) { if (typeof onAuthed === 'function') onAuthed(); return true; }
      if (window.SLAuthUI) window.SLAuthUI.open('login');
      return false;
    }
  };
})();

/* === js/sl-nav-gate.js === */
/* =========================================================================
   sl-nav-gate.js — v2
   Universal nav gating + logged-in user dropdown across ALL pages.
   - Hides Messages link(s) when logged out
   - Hides Login/Signup trigger(s) when logged in
   - Injects user dropdown when logged in
   - Works with ALL header variants in this codebase:
     * .header-enhanced / .nav-enhanced / .nav-right      (home, tonight, events, social, messages, profile, my-lists, plan-with-friends)
     * .sl-explore-header / .sl-header-nav               (explore, nightlife)
     * Any header with .sl-auth-trigger button
   - Re-applies on auth events and mutations.
   ========================================================================= */
(function () {
  if (window.__SLNavGate) return;
  window.__SLNavGate = true;

  var AUTH_LINKS = [
    'a[href="messages.html"]',
    'a[href="/messages"]',
    'a[href="messages"]',
    'a[data-page="messages"]'
  ];

  var LOGIN_TRIGGERS = [
    '.sl-auth-trigger',
    '.sl-login-btn',
    '#sl-login-btn',
    '[data-sl-login-btn]',
    '.login-signup-btn',
    'button.login-btn',
    '.btn-header-primary.sl-auth-trigger',
    '.sl-header-auth-btn'
  ];

  var DROPDOWN_ANCHORS = [
    '.nav-right',
    '.sl-header-cta',
    '.header-cta',
    '.user-menu'
  ];

  function isLoggedIn() {
    try {
      if (window.SLAuth && typeof SLAuth.isLoggedIn === 'function') return !!SLAuth.isLoggedIn();
      if (window.SLAuth && typeof SLAuth.getUser === 'function') return !!SLAuth.getUser();
      return !!(localStorage.getItem('sl_auth_token') || localStorage.getItem('sl_jwt_token'));
    } catch (_) { return false; }
  }

  function getUser() {
    try {
      if (window.SLAuth && typeof SLAuth.getUser === 'function') return SLAuth.getUser();
      var raw = localStorage.getItem('sl_user');
      if (raw) { var p = JSON.parse(raw); return p.user || p; }
    } catch (_) {}
    return null;
  }

  function displayNameFor(u) {
    return u.display_name || u.displayName || u.username || (u.email ? u.email.split('@')[0] : 'Account');
  }
  function avatarFor(u) {
    return u.avatar_url || u.avatarUrl ||
      window.SL_AVATAR.local(displayNameFor(u));
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function applyGate() {
    var loggedIn = isLoggedIn();
    var user = getUser();

    AUTH_LINKS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (a) {
        if (a.closest('#sl-user-dropdown')) return;
        var wrap = a.closest('li') || a;
        wrap.style.display = loggedIn ? '' : 'none';
      });
    });

    var loginSelector = LOGIN_TRIGGERS.join(',');
    document.querySelectorAll(loginSelector).forEach(function (btn) {
      if (btn.closest('#sl-user-dropdown')) return;
      var inHeader = btn.closest('header, .header-enhanced, .sl-explore-header, .nav-right, .sl-header-auth-btn-wrap');
      if (!inHeader) return;
      btn.style.display = loggedIn ? 'none' : '';
    });

    var existing = document.getElementById('sl-user-dropdown');
    if (loggedIn && user) {
      if (!existing) {
        injectDropdown(user);
      } else {
        var nm = existing.querySelector('.sl-ud-name');
        var nextName = displayNameFor(user);
        if (nm && nm.textContent !== nextName) nm.textContent = nextName;
        var av = existing.querySelector('.sl-ud-avatar');
        var nextAvatar = avatarFor(user);
        if (av && av.getAttribute('src') !== nextAvatar) av.setAttribute('src', nextAvatar);
        var adminLink = existing.querySelector('[data-sl-admin-link]');
        if (user.role === 'admin' && !adminLink) {
          existing.remove();
          injectDropdown(user);
        }
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function injectDropdown(user) {
    var anchor = null;
    for (var i = 0; i < DROPDOWN_ANCHORS.length; i++) {
      var cand = document.querySelector(DROPDOWN_ANCHORS[i]);
      if (cand) { anchor = cand; break; }
    }
    if (!anchor) {
      var trig = document.querySelector(LOGIN_TRIGGERS.join(','));
      if (trig) anchor = trig.parentNode;
    }
    if (!anchor) anchor = document.querySelector('header, .sl-explore-header') || document.body;

    var avatar = avatarFor(user);
    var name = displayNameFor(user);
    var isAdmin = user.role === 'admin';

    var wrap = document.createElement('div');
    wrap.id = 'sl-user-dropdown';
    wrap.innerHTML = [
      '<style>',
      '#sl-user-dropdown{position:relative;display:inline-block;margin-left:10px;z-index:99999;}',
      '#sl-user-dropdown .sl-ud-trigger{display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 6px;background:rgba(255,255,255,0.06);',
      'border:1px solid rgba(212,175,55,0.4);border-radius:999px;cursor:pointer;color:#fff;font:600 14px/1 "Inter",system-ui,-apple-system,sans-serif;transition:background .15s, border-color .15s;}',
      '#sl-user-dropdown .sl-ud-trigger:hover{background:rgba(212,175,55,0.15);border-color:#d4af37;}',
      '#sl-user-dropdown .sl-ud-avatar{width:30px;height:30px;border-radius:50%;object-fit:cover;background:#222;flex:0 0 auto;}',
      '#sl-user-dropdown .sl-ud-name{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#sl-user-dropdown .sl-ud-caret{margin-left:4px;opacity:.65;font-size:10px;}',
      '#sl-user-dropdown .sl-ud-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:220px;background:#121212;',
      'border:1px solid rgba(212,175,55,0.4);border-radius:12px;padding:8px 0;box-shadow:0 12px 36px rgba(0,0,0,0.7);display:none;overflow:hidden;}',
      '#sl-user-dropdown.open .sl-ud-menu{display:block;animation:slud-in .12s ease-out;}',
      '@keyframes slud-in{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:translateY(0);}}',
      '#sl-user-dropdown .sl-ud-menu a{display:flex;align-items:center;gap:10px;padding:10px 18px;color:#eaeaea;text-decoration:none;font:500 14px/1.2 "Inter",system-ui,sans-serif;transition:background .12s, color .12s;}',
      '#sl-user-dropdown .sl-ud-menu a:hover{background:rgba(212,175,55,0.12);color:#d4af37;}',
      '#sl-user-dropdown .sl-ud-menu a i{width:16px;text-align:center;color:#d4af37;opacity:.85;}',
      '#sl-user-dropdown .sl-ud-menu hr{border:0;border-top:1px solid rgba(255,255,255,0.08);margin:6px 0;}',
      '#sl-user-dropdown .sl-ud-role{display:inline-block;padding:2px 7px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;background:#d4af37;color:#111;border-radius:4px;margin-left:6px;font-weight:800;}',
      '#sl-user-dropdown .sl-ud-badge{display:inline-block;min-width:18px;height:18px;padding:0 6px;font-size:11px;font-weight:700;line-height:18px;text-align:center;background:#e11d48;color:#fff;border-radius:9px;margin-left:auto;}',
      '#sl-user-dropdown .sl-ud-badge[hidden]{display:none;}',
      '#sl-user-dropdown .sl-ud-trigger-badge{position:absolute;top:2px;right:-2px;min-width:16px;height:16px;padding:0 4px;font-size:10px;font-weight:700;line-height:16px;text-align:center;background:#e11d48;color:#fff;border-radius:8px;border:2px solid #0a0a0a;}',
      '#sl-user-dropdown .sl-ud-trigger-badge[hidden]{display:none;}',
      '@media (max-width:720px){#sl-user-dropdown .sl-ud-name{max-width:80px;}#sl-user-dropdown .sl-ud-menu{min-width:200px;right:-10px;}}',
      '</style>',
      '<button class="sl-ud-trigger" type="button" aria-haspopup="true" aria-expanded="false" style="position:relative;">',
        '<img class="sl-ud-avatar" src="' + escapeHtml(avatar) + '" alt="">',
        '<span class="sl-ud-name">' + escapeHtml(name) + '</span>',
        (isAdmin ? '<span class="sl-ud-role">Admin</span>' : ''),
        '<span class="sl-ud-caret">&#9662;</span>',
        '<span class="sl-ud-trigger-badge" data-sl-unread-trigger hidden>0</span>',
      '</button>',
      '<div class="sl-ud-menu" role="menu">',
        '<a href="profile.html" role="menuitem"><i class="fas fa-user"></i> Profile</a>',
        '<a href="messages.html" role="menuitem" data-sl-messages-link><i class="fas fa-envelope"></i> Messages <span class="sl-ud-badge" data-sl-unread-badge hidden>0</span></a>',
        '<a href="my-lists.html" role="menuitem"><i class="fas fa-list-check"></i> My Lists</a>',
        '<a href="plan-with-friends.html" role="menuitem"><i class="fas fa-users"></i> My Plans</a>',
        '<a href="profile.html#saved" role="menuitem"><i class="fas fa-bookmark"></i> Saved Venues</a>',
        '<a href="profile.html#friends" role="menuitem"><i class="fas fa-user-friends"></i> Friends</a>',
        '<a href="social-feed.html" role="menuitem"><i class="fas fa-stream"></i> Social Feed</a>',
        (isAdmin ? '<hr><a href="admin.html" data-sl-admin-link role="menuitem"><i class="fas fa-shield-alt"></i> Admin Portal</a>' : ''),
        '<hr>',
        '<a href="#" data-sl-logout role="menuitem"><i class="fas fa-sign-out-alt"></i> Log out</a>',
      '</div>'
    ].join('');

    if (anchor.classList && (anchor.classList.contains('nav-right') || anchor.classList.contains('sl-header-cta'))) {
      anchor.appendChild(wrap);
    } else {
      if (anchor.parentNode && anchor.parentNode.insertBefore) {
        anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
      } else {
        anchor.appendChild(wrap);
      }
    }

    var trigger = wrap.querySelector('.sl-ud-trigger');
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = wrap.classList.toggle('open');
      trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        wrap.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    wrap.querySelector('[data-sl-logout]').addEventListener('click', function (e) {
      e.preventDefault();
      var done = function () {
        try { window.dispatchEvent(new CustomEvent('sl:logout')); } catch (_) {}
        location.href = 'index.html';
      };
      if (window.SLAuth && typeof SLAuth.logout === 'function') {
        Promise.resolve(SLAuth.logout()).finally(done);
      } else {
        localStorage.removeItem('sl_auth_token');
        localStorage.removeItem('sl_jwt_token');
        localStorage.removeItem('sl_user');
        done();
      }
    });
  }

  // Mutation callbacks must yield and must never rewrite their own unchanged text.
  var gateTimer = null;
  function scheduleGate() {
    if (gateTimer !== null) return;
    gateTimer = setTimeout(function () { gateTimer = null; applyGate(); }, 0);
  }

  function init() {
    applyGate();
    window.addEventListener('sl:auth-changed', scheduleGate);
    window.addEventListener('sl-auth-changed', scheduleGate);
    window.addEventListener('sl-auth-ready', scheduleGate);
    window.addEventListener('sl:login-success', applyGate);
    window.addEventListener('sl:logout', applyGate);
    window.addEventListener('storage', function (e) {
      if (e.key && /sl_(auth_token|jwt_token|user)/.test(e.key)) applyGate();
    });
    try {
      var mo = new MutationObserver(function (records) {
        // Ignore our own dropdown text/markup updates. Auth events handle user changes.
        var externalChange = records.some(function (record) {
          var target = record.target;
          if (target && target.nodeType !== 1) target = target.parentElement;
          return !target || !target.closest || !target.closest('#sl-user-dropdown');
        });
        if (externalChange) scheduleGate();
      });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 30000);
    } catch (_) {}
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      applyGate();
      if (tries > 20) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* === js/sl-page-guard.js === */
/* =========================================================================
   SL PAGE GUARD — Protects pages and actions.
   
   Usage on an HTML page that requires auth:
     <body data-sl-page="requires-auth" data-sl-page-label="Messages">
   
   Usage on elements that require auth for an action:
     <button data-sl-requires-auth data-sl-action-label="Save venue">Save</button>
   
   Depends on: SLAuth (sl-auth-core.js), SLAuthUI (sl-auth-ui.js).
   ========================================================================= */
(function(){
  'use strict';

  function whenReady(fn){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }

  function showGate(label){
    if (document.getElementById('sl-gate-overlay-el')) return;
    var title = String(label || 'Sign in required').replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
    var overlay = document.createElement('div');
    overlay.id = 'sl-gate-overlay-el';
    overlay.className = 'sl-gate-overlay';
    overlay.innerHTML = [
      '<div class="sl-gate-card">',
      '  <div class="sl-gate-icon">🔒</div>',
      '  <h2 class="sl-gate-title">' + title + '</h2>',
      '  <p class="sl-gate-msg">Create a free account or sign in to continue.</p>',
      '  <div class="sl-gate-btns">',
      '    <button type="button" class="sl-gate-btn sl-gate-btn-primary" data-sl-gate="login">Sign in</button>',
      '    <button type="button" class="sl-gate-btn sl-gate-btn-secondary" data-sl-gate="signup">Create account</button>',
      '  </div>',
      // Phase 8E: never trap a logged-out user — always offer a way back to a public page.
      '  <a href="/" class="sl-gate-back" data-sl-gate="home" style="display:inline-block;margin-top:16px;color:#9ca0b4;font-size:13px;text-decoration:none;font-weight:600;">← Back to Explore Boston</a>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    overlay.addEventListener('click', function(e){
      var b = e.target.closest('[data-sl-gate]');
      if (!b) return;
      var which = b.getAttribute('data-sl-gate');
      if (which === 'home') { return; } // let the <a href="/"> navigate normally
      e.preventDefault();
      if (window.SLAuthUI && window.SLAuthUI.open) window.SLAuthUI.open(which);
    });
    // Phase 8E: Escape closes the gate and returns home so users are never stuck.
    var escHandler = function(ev){
      if (ev.key === 'Escape' && document.getElementById('sl-gate-overlay-el') && !document.querySelector('.sl-auth-overlay.open')) {
        try { document.removeEventListener('keydown', escHandler, true); } catch(_){}
        window.location.href = '/';
      }
    };
    document.addEventListener('keydown', escHandler, true);
  }

  function hideGate(){
    var g = document.getElementById('sl-gate-overlay-el');
    if (g) { g.remove(); document.body.style.overflow = ''; }
  }

  function enforcePage(){
    var body = document.body;
    if (!body) return;
    var mode = body.getAttribute('data-sl-page');
    if (!window.SLAuth) return;
    // Phase 5D-B: stamp body with sl-authed class so per-page CSS can
    // gate visibility of protected UI (e.g., messages.html main).
    if (window.SLAuth.isAuthed()) {
      body.classList.add('sl-authed');
      body.classList.remove('sl-loggedout');
    } else {
      body.classList.add('sl-loggedout');
      body.classList.remove('sl-authed');
    }
    if (mode !== 'requires-auth') return;
    var label = body.getAttribute('data-sl-page-label') || 'This page requires sign in';
    if (!window.SLAuth.isAuthed()) {
      showGate(label);
    }
  }

  function wireActionGuards(){
    document.addEventListener('click', function(e){
      // Guard the explicit actionable control, never BODY, a page wrapper, nav or modal dismissal.
      if (e.target.closest('[role=dialog], .sl-auth-modal, #sl-gate-overlay-el, header, nav')) return;
      var t = e.target.closest('button[data-sl-requires-auth], a[data-sl-requires-auth], input[data-sl-requires-auth]');
      if (!t || t === document.body) return;
      if (!window.SLAuth || !window.SLAuth.isAuthed()) {
        e.preventDefault();
        e.stopPropagation();
        var label = t.getAttribute('data-sl-action-label') || 'Sign in required';
        if (window.SLAuthUI && window.SLAuthUI.open) {
          window.SLAuthUI.open('login');
        }
        return false;
      }
    }, true);
  }

  whenReady(function(){
    enforcePage();
    wireActionGuards();

    window.addEventListener('sl-auth-changed', function(e){
      var authed = e.detail && e.detail.authed;
      if (authed) {
        hideGate();
        // notify page scripts that auth state changed
      } else {
        // page guard: re-lock if this page requires auth
        enforcePage();
      }
    });
  });

  window.SLPageGuard = { showGate: showGate, hideGate: hideGate };
})();

/* === js/sl-universal-guards.js === */
/* =========================================================================
   sl-universal-guards.js
   Wraps SLApi methods so any protected API call from logged-out users
   triggers the universal login modal instead of silently 401-ing.
   Also gates common button patterns: .save-btn, .sl-save-btn,
   [data-action="save"], [data-action="plan-add"], .create-plan-btn, etc.
   ========================================================================= */
(function(){
  'use strict';

  function openLogin(label){
    if (window.SLAuthUI && window.SLAuthUI.open) {
      window.SLAuthUI.open('login');
      return true;
    }
    return false;
  }

  function wrapApi(){
    if (!window.SLApi) return;
    if (window.SLApi.__guardsInstalled) return;
    window.SLApi.__guardsInstalled = true;

    // Methods that should not run if logged out
    var PROTECTED = [
      'toggleFavorite','createPost','likePost','unlikePost','commentOnPost',
      'sendFriendRequest','acceptFriendRequest','removeFriend',
      'sendMessage','markRead',
      'createPlan','updatePlan','deletePlan','inviteToPlan','respondToInvite',
      'createReview','updateReview','deleteReview',
      'checkIn','uncheckIn',
      'deleteAccount','reportContent','registerPushToken','unregisterPushToken'
    ];

    PROTECTED.forEach(function(fn){
      var original = window.SLApi[fn];
      if (typeof original !== 'function') return;
      window.SLApi[fn] = function(){
        if (!window.SLApi.isLoggedIn()) {
          openLogin();
          return Promise.reject(new Error('Not authenticated'));
        }
        return original.apply(window.SLApi, arguments);
      };
    });
    console.log('[SLGuards] wrapped ' + PROTECTED.length + ' API methods');
  }

  // Global click delegate: intercept common "save/plan/follow/like" selectors
  function installClickInterceptor(){
    var PROTECTED_SELECTORS = [
      '.sl-save-btn',
      '[data-action="save"]',
      '[data-action="plan-add"]',
      '[data-action="plan-create"]',
      '[data-action="follow"]',
      '[data-action="like"]',
      '[data-action="comment"]',
      '[data-action="review"]',
      '[data-action="check-in"]',
      '[data-action="message"]',
      '.sl-create-plan-btn',
      '.sl-invite-friend-btn'
    ].join(',');

    document.addEventListener('click', function(e){
      var btn = e.target.closest(PROTECTED_SELECTORS);
      if (!btn) return;
      if (window.SLApi && window.SLApi.isLoggedIn()) return; // authorized → pass through
      e.preventDefault();
      e.stopPropagation();
      openLogin();
    }, true); // capture phase so we run before other handlers
  }

  function boot(){
    wrapApi();
    installClickInterceptor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else { boot(); }

  // Also wrap later in case SLApi is re-created or delayed
  setTimeout(wrapApi, 500);
  setTimeout(wrapApi, 1500);
})();

/* === js/sl-nav-controller.js === */
/**
 * SL-NAV-CONTROLLER — single authoritative mobile nav controller.
 * Phase 5D-E. Loaded ONCE per page, replaces 7+ legacy duplicate handlers.
 *
 * Supports BOTH header structures used across the SceneLink site:
 *  A) .header-enhanced > .nav-enhanced > .nav-center  +  #mobileMenuBtn
 *     (home, business, profile, social-feed, events, tonight, messages, lists, plans, etc.)
 *  B) .sl-explore-header.sl-unified-nav > .sl-header-nav  (no hamburger present)
 *     (explore.html, nightlife.html)
 *     -> we INJECT a hamburger and treat the nav like a mobile drawer.
 *
 * Single source of truth class:
 *    body.menu-open                   = drawer open
 *    .mobile-menu-btn.is-open         = animated hamburger to X
 *
 * Re-entrant safe.
 */
(function(){
  'use strict';
  if (window.__SL_NAV_CONTROLLER__) return;
  window.__SL_NAV_CONTROLLER__ = true;

  function ready(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }
  function $(s, root){ return (root||document).querySelector(s); }

  function open(){
    window.dispatchEvent(new CustomEvent('sl:explicit-modal'));
    document.body.classList.add('menu-open');
    var first = document.querySelector('#primary-mobile-menu a[href]');
    if (first) first.focus();
    var btn = $('.mobile-menu-btn'); if (btn){ btn.classList.add('is-open'); btn.setAttribute('aria-expanded','true'); }
  }
  function close(){
    var wasOpen = document.body.classList.contains('menu-open');
    document.body.classList.remove('menu-open');
    var btn = $('.mobile-menu-btn'); if (btn){ btn.classList.remove('is-open'); btn.setAttribute('aria-expanded','false'); if (wasOpen) btn.focus(); }
  }
  function toggle(){
    if (document.body.classList.contains('menu-open')) close(); else open();
  }

  function setActiveLink(){
    var path = (location.pathname || '/').toLowerCase();
    var file = path.substring(path.lastIndexOf('/')+1) || 'index.html';
    var links = document.querySelectorAll('.nav-center .nav-link[href], .sl-header-nav .sl-header-nav-link[href]');
    links.forEach(function(a){
      a.classList.remove('active');
      var href = (a.getAttribute('href')||'').toLowerCase();
      if (!href || href === '#') return;
      var hf = href.split('?')[0].split('#')[0];
      hf = hf.substring(hf.lastIndexOf('/')+1);
      if (hf === file) a.classList.add('active');
      if ((file==='' || file==='index.html') && hf==='index.html') a.classList.add('active');
    });
  }

  function ensureHamburger(parent){
    // For pages without a hamburger, inject one. parent is the header element.
    var existing = parent.querySelector('.mobile-menu-btn, #mobileMenuBtn');
    if (existing) return existing;
    var btn = document.createElement('button');
    btn.className = 'mobile-menu-btn sl-injected-hamburger';
    btn.id = 'mobileMenuBtn';
    btn.type = 'button';
    btn.setAttribute('aria-label','Toggle menu');
    btn.innerHTML = '<span></span><span></span><span></span>';
    parent.appendChild(btn);
    return btn;
  }

  function init(){
    // Try header A (canonical)
    var headerA = $('#mainHeader') || $('.header-enhanced');
    var navA = headerA && headerA.querySelector('.nav-center');
    var btnA = $('#mobileMenuBtn');

    // Try header B (explore/nightlife legacy)
    var headerB = $('.sl-explore-header, .sl-unified-nav');
    var navB = headerB && headerB.querySelector('.sl-header-nav');

    var header, nav, btn;
    if (headerA && navA){
      header = headerA; nav = navA; btn = btnA || ensureHamburger(headerA);
    } else if (headerB && navB){
      header = headerB; nav = navB; btn = ensureHamburger(headerB);
      // Mark the nav so the CSS rules can target it as a drawer
      nav.classList.add('sl-mobile-drawer');
    } else {
      // No supported header on this page (404, offline) — bail.
      return;
    }

    btn.setAttribute('aria-controls','primary-mobile-menu');
    btn.setAttribute('aria-expanded','false');
    if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label','Toggle menu');
    nav.setAttribute('id','primary-mobile-menu');
    nav.setAttribute('role','navigation');

    btn.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      toggle();
    });

    document.addEventListener('click', function(e){
      if (!document.body.classList.contains('menu-open')) return;
      if (header.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.sl-auth-modal,.sl-concierge,.sl-modal,[data-keep-menu]')) return;
      close();
    });

    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) close();
    });

    nav.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a');
      if (a) close();
    });

    var rT;
    window.addEventListener('resize', function(){
      clearTimeout(rT);
      rT = setTimeout(function(){
        if (window.innerWidth > 900 && document.body.classList.contains('menu-open')) close();
      }, 120);
    });

    var scrollT;
    window.addEventListener('scroll', function(){
      if (scrollT) return;
      scrollT = requestAnimationFrame(function(){
        scrollT = null;
        if (window.scrollY > 12) header.classList.add('scrolled'); else header.classList.remove('scrolled');
      });
    }, {passive:true});

    setActiveLink();
  }

  ready(init);
  // Re-run if header is injected late (some pages inject it via JS)
  setTimeout(function(){
    if (!document.querySelector('.mobile-menu-btn')) {
      window.__SL_NAV_CONTROLLER__ = false;
      window.__SL_NAV_CONTROLLER__ = true;
      init();
    }
  }, 800);
})();

/* === js/sl-venue-corrections.js === */
/* Venue fields now come from the canonical backend. Never overwrite identities,
   addresses or coordinates by name, and never wrap fetch to fabricate fields. */
(function () { 'use strict';
  window.SLVenueCorrections = {apply:v => v, applyToPayload:data => data};
})();

/* === js/sl-user-state.js === */
/**
 * SceneLink — Unified User State
 *
 * SINGLE source of truth for: favorites, lists, plans (itinerary), check-ins.
 *
 * - Logged-in: reads/writes via /api + mirrors to localStorage cache for fast paint
 * - Logged-out: localStorage-only (fully persistent until sign-in; migrated to API on auth)
 *
 * Exposes: window.SLState
 * Fires:   'sl-state-change' (detail: { kind: 'favorites'|'lists'|'plan'|'all' })
 *
 * All pages use this. Legacy keys (sl_saved_venues, tp-saved-v2, sl_favorites, sl_lists,
 * sl_user_lists, tp-plan-v2, sl_plan, sl_itinerary) are consolidated here.
 */
(function () {
  'use strict';

  var KEYS = {
    favorites:  'sl_favorites_v3',     // Array of venue objects
    lists:      'sl_lists_v3',         // Array of list objects {id, name, description, venues[]}
    plan:       'sl_active_plan_v3',   // Current itinerary {id, name, date, venues[]}
    checkins:   'sl_checkins_v3',      // Array of {venueId, when}
    lastSync:   'sl_state_last_sync'
  };

  // Legacy keys to migrate from (in priority order — first found wins)
  var LEGACY_FAV_KEYS = ['sl_saved_venues', 'tp-saved-v2', 'sl_favorites'];
  var LEGACY_LISTS_KEYS = ['sl_lists', 'sl_user_lists'];
  var LEGACY_PLAN_KEYS = ['tp-plan-v2', 'sl_plan', 'sl_itinerary'];

  function safeGet(k, fallback) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fallback;
    } catch (_) { return fallback; }
  }
  function safeSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (_) { return false; }
  }
  function safeDel(k) { try { localStorage.removeItem(k); } catch (_) {} }

  function nowIso() { return new Date().toISOString(); }

  function venueShape(v) {
    if (!v) return null;
    return {
      id:           v.id || v.venue_id,
      slug:         v.slug || v.venue_slug || null,
      name:         v.name || v.venue_name || 'Unknown',
      type:         v.type || v.venue_type || v.category || '',
      image:        v.image || v.image_url || v.venue_image || v.img || '',
      rating:       parseFloat(v.rating || v.venue_rating || 0) || 0,
      neighborhood: v.neighborhood || v.venue_neighborhood || '',
      price:        v.price_label || v.price || v.venue_price || '',
      addedAt:      v.addedAt || v.created_at || nowIso()
    };
  }

  // ---- Migration: merge any legacy keys into new canonical keys (one-time) ----
  function migrate() {
    // Favorites
    if (!safeGet(KEYS.favorites, null)) {
      var merged = [];
      var seenIds = {};
      LEGACY_FAV_KEYS.forEach(function (k) {
        var v = safeGet(k, null);
        if (!v) return;
        var items = [];
        if (Array.isArray(v)) items = v;
        else if (typeof v === 'object') items = Object.values(v);
        items.forEach(function (item) {
          var shaped = venueShape(item);
          if (shaped && shaped.id && !seenIds[shaped.id]) {
            seenIds[shaped.id] = true;
            merged.push(shaped);
          }
        });
      });
      safeSet(KEYS.favorites, merged);
    }

    // Lists
    if (!safeGet(KEYS.lists, null)) {
      var lists = [];
      LEGACY_LISTS_KEYS.forEach(function (k) {
        var v = safeGet(k, null);
        if (!v) return;
        var items = Array.isArray(v) ? v : Object.values(v);
        items.forEach(function (l) {
          if (!l || !l.name) return;
          lists.push({
            id: l.id || ('list-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
            name: l.name,
            description: l.description || '',
            venues: Array.isArray(l.venues) ? l.venues.map(venueShape).filter(Boolean) : [],
            createdAt: l.createdAt || l.created_at || nowIso()
          });
        });
      });
      safeSet(KEYS.lists, lists);
    }

    // Plan (itinerary)
    if (!safeGet(KEYS.plan, null)) {
      for (var i = 0; i < LEGACY_PLAN_KEYS.length; i++) {
        var k = LEGACY_PLAN_KEYS[i];
        var v = safeGet(k, null);
        if (v) {
          var items;
          if (Array.isArray(v)) items = v.map(venueShape).filter(Boolean);
          else if (v.venues) items = v.venues.map(venueShape).filter(Boolean);
          else items = [];
          safeSet(KEYS.plan, {
            id: 'local-plan',
            name: (v && v.name) || 'My Plan Tonight',
            date: (v && v.date) || null,
            venues: items,
            createdAt: nowIso()
          });
          break;
        }
      }
      if (!safeGet(KEYS.plan, null)) {
        safeSet(KEYS.plan, { id: 'local-plan', name: 'My Plan Tonight', date: null, venues: [], createdAt: nowIso() });
      }
    }
  }

  migrate();

  // ---- Emit state change events ----
  function emit(kind, detail) {
    detail = Object.assign({ kind: kind }, detail || {});
    try {
      window.dispatchEvent(new CustomEvent('sl-state-change', { detail: detail }));
      document.dispatchEvent(new CustomEvent('sl-state-change', { detail: detail }));
    } catch (_) {}
  }

  // =====================================================================
  // FAVORITES
  // =====================================================================
  var favApiInFlight = null;

  function getFavorites() {
    return safeGet(KEYS.favorites, []) || [];
  }

  function isFavorite(venueId) {
    if (!venueId) return false;
    return getFavorites().some(function (v) { return v.id === venueId; });
  }

  function addFavorite(venue) {
    var shaped = venueShape(venue);
    if (!shaped || !shaped.id) return false;
    var favs = getFavorites();
    if (favs.some(function (v) { return v.id === shaped.id; })) return false;
    favs.unshift(shaped);
    safeSet(KEYS.favorites, favs);
    emit('favorites', { action: 'add', venue: shaped });
    syncFavoriteToApi(shaped.id, true);
    return true;
  }

  function removeFavorite(venueId) {
    if (!venueId) return false;
    var favs = getFavorites();
    var filtered = favs.filter(function (v) { return v.id !== venueId; });
    if (filtered.length === favs.length) return false;
    safeSet(KEYS.favorites, filtered);
    emit('favorites', { action: 'remove', venueId: venueId });
    syncFavoriteToApi(venueId, false);
    return true;
  }

  function toggleFavorite(venue) {
    var shaped = venueShape(venue);
    if (!shaped || !shaped.id) return false;
    if (isFavorite(shaped.id)) {
      removeFavorite(shaped.id);
      return false;
    } else {
      addFavorite(shaped);
      return true;
    }
  }

  function syncFavoriteToApi(venueId, expectFavorited) {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) return;
    // Only valid UUIDs can round-trip through Postgres
    var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(String(venueId))) return;
    // POST /favorites/toggle is idempotent by current state on server; if it mismatches, we re-send
    SLApi.toggleFavorite(venueId)
      .then(function (r) {
        if (r && typeof r.favorited === 'boolean' && r.favorited !== expectFavorited) {
          // Server state differs — toggle once more to align
          return SLApi.toggleFavorite(venueId);
        }
      })
      .catch(function () { /* offline or not logged in; localStorage remains truth */ });
  }

  // =====================================================================
  // LISTS
  // =====================================================================

  function getLists() {
    return safeGet(KEYS.lists, []) || [];
  }

  function createList(name, description) {
    if (!name) return null;
    var lists = getLists();
    var newList = {
      id: 'list-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      name: String(name).trim(),
      description: description || '',
      venues: [],
      createdAt: nowIso()
    };
    lists.unshift(newList);
    safeSet(KEYS.lists, lists);
    emit('lists', { action: 'create', list: newList });

    // Sync to API
    if (window.SLApi && window.SLApi.isLoggedIn()) {
      SLApi.createList(newList.name, newList.description)
        .then(function (r) {
          if (r && r.list && r.list.id) {
            // Replace local id with server id
            var all = getLists();
            var idx = all.findIndex(function (l) { return l.id === newList.id; });
            if (idx >= 0) {
              all[idx].id = r.list.id;
              safeSet(KEYS.lists, all);
              emit('lists', { action: 'sync' });
            }
          }
        }).catch(function () {});
    }
    return newList;
  }

  function deleteList(listId) {
    var lists = getLists();
    var filtered = lists.filter(function (l) { return l.id !== listId; });
    if (filtered.length === lists.length) return false;
    safeSet(KEYS.lists, filtered);
    emit('lists', { action: 'delete', listId: listId });
    if (window.SLApi && window.SLApi.isLoggedIn()) {
      SLApi.deleteList(listId).catch(function () {});
    }
    return true;
  }

  function addVenueToList(listId, venue) {
    var shaped = venueShape(venue);
    if (!shaped) return false;
    var lists = getLists();
    var list = lists.find(function (l) { return l.id === listId; });
    if (!list) return false;
    if (list.venues.some(function (v) { return v.id === shaped.id; })) return false;
    list.venues.unshift(shaped);
    safeSet(KEYS.lists, lists);
    emit('lists', { action: 'add-venue', listId: listId, venue: shaped });
    if (window.SLApi && window.SLApi.isLoggedIn()) {
      SLApi.addToList(listId, shaped.id).catch(function () {});
    }
    return true;
  }

  function removeVenueFromList(listId, venueId) {
    var lists = getLists();
    var list = lists.find(function (l) { return l.id === listId; });
    if (!list) return false;
    var before = list.venues.length;
    list.venues = list.venues.filter(function (v) { return v.id !== venueId; });
    if (list.venues.length === before) return false;
    safeSet(KEYS.lists, lists);
    emit('lists', { action: 'remove-venue', listId: listId, venueId: venueId });
    return true;
  }

  // =====================================================================
  // PLAN (ITINERARY) — single active plan, user can replace/extend
  // =====================================================================

  function getActivePlan() {
    return safeGet(KEYS.plan, { id: 'local-plan', name: 'My Plan Tonight', date: null, venues: [] });
  }

  function setActivePlan(plan) {
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'set', plan: plan });
  }

  function isInPlan(venueId) {
    if (!venueId) return false;
    return getActivePlan().venues.some(function (v) { return v.id === venueId; });
  }

  function addToPlan(venue) {
    var shaped = venueShape(venue);
    if (!shaped || !shaped.id) return false;
    var plan = getActivePlan();
    if (plan.venues.some(function (v) { return v.id === shaped.id; })) return false;
    plan.venues.push(shaped);
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'add', venue: shaped });

    // Sync to API — ensure a server plan exists first
    syncPlanEnsure().then(function (serverPlanId) {
      if (serverPlanId && window.SLApi) {
        SLApi.addToPlan(serverPlanId, shaped.id).catch(function () {});
      }
    });
    return true;
  }

  function removeFromPlan(venueId) {
    var plan = getActivePlan();
    var before = plan.venues.length;
    plan.venues = plan.venues.filter(function (v) { return v.id !== venueId; });
    if (plan.venues.length === before) return false;
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'remove', venueId: venueId });
    return true;
  }

  function togglePlan(venue) {
    var shaped = venueShape(venue);
    if (!shaped || !shaped.id) return false;
    if (isInPlan(shaped.id)) {
      removeFromPlan(shaped.id);
      return false;
    } else {
      addToPlan(shaped);
      return true;
    }
  }

  function reorderPlan(newVenueIds) {
    var plan = getActivePlan();
    var byId = {};
    plan.venues.forEach(function (v) { byId[v.id] = v; });
    plan.venues = newVenueIds.map(function (id) { return byId[id]; }).filter(Boolean);
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'reorder' });
  }

  function clearPlan() {
    var plan = getActivePlan();
    plan.venues = [];
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'clear' });
  }

  function renamePlan(name) {
    var plan = getActivePlan();
    plan.name = name || 'My Plan Tonight';
    safeSet(KEYS.plan, plan);
    emit('plan', { action: 'rename' });
  }

  // Ensure server-side plan exists; return its id
  var planEnsurePromise = null;
  function syncPlanEnsure() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) return Promise.resolve(null);
    var plan = getActivePlan();
    if (plan.serverId) return Promise.resolve(plan.serverId);
    if (planEnsurePromise) return planEnsurePromise;
    planEnsurePromise = SLApi.plans()
      .then(function (r) {
        var plans = (r && r.plans) || [];
        // Find a plan with matching name + today's date, or create one
        var today = new Date().toISOString().slice(0, 10);
        var match = plans.find(function (p) {
          return p.name === plan.name || (p.date && String(p.date).startsWith(today));
        });
        if (match) return match.id;
        return SLApi.createPlan(plan.name, today).then(function (cr) {
          return cr && cr.plan && cr.plan.id;
        });
      })
      .then(function (serverId) {
        if (serverId) {
          var p = getActivePlan();
          p.serverId = serverId;
          safeSet(KEYS.plan, p);
        }
        planEnsurePromise = null;
        return serverId;
      })
      .catch(function () { planEnsurePromise = null; return null; });
    return planEnsurePromise;
  }

  // =====================================================================
  // HYDRATE FROM SERVER on login (merges server data into local state)
  // =====================================================================

  function hydrateFromServer() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) return Promise.resolve();

    var jobs = [];

    // Favorites
    jobs.push(SLApi.favorites().then(function (r) {
      var serverFavs = ((r && r.favorites) || []).map(function (f) {
        return venueShape({
          id: f.venue_id,
          slug: f.venue_slug,
          name: f.venue_name,
          type: f.venue_type,
          image: f.venue_image,
          rating: f.venue_rating,
          neighborhood: f.venue_neighborhood,
          price: f.venue_price,
          addedAt: f.created_at
        });
      }).filter(Boolean);

      // Union of server + local (server wins for duplicates)
      var local = getFavorites();
      var seen = {};
      var merged = [];
      serverFavs.forEach(function (v) { seen[v.id] = true; merged.push(v); });
      local.forEach(function (v) { if (!seen[v.id]) merged.push(v); });
      safeSet(KEYS.favorites, merged);

      // Push any local-only favorites to the server
      local.forEach(function (v) {
        if (!serverFavs.some(function (s) { return s.id === v.id; })) {
          syncFavoriteToApi(v.id, true);
        }
      });
    }).catch(function () {}));

    // Lists
    jobs.push(SLApi.lists().then(function (r) {
      var serverLists = ((r && r.lists) || []).map(function (l) {
        return {
          id: l.id,
          name: l.name,
          description: l.description || '',
          venues: (l.venues || []).map(venueShape).filter(Boolean),
          createdAt: l.created_at,
          serverSynced: true
        };
      });
      if (serverLists.length) safeSet(KEYS.lists, serverLists);
    }).catch(function () {}));

    // Plans — use newest for the active plan
    jobs.push(SLApi.plans().then(function (r) {
      var plans = (r && r.plans) || [];
      if (!plans.length) return;
      // Active plan = first plan in list, or today's plan if found
      var today = new Date().toISOString().slice(0, 10);
      var active = plans.find(function (p) { return p.date && String(p.date).startsWith(today); }) || plans[0];
      if (active) {
        setActivePlan({
          id: 'active-plan',
          serverId: active.id,
          name: active.name,
          date: active.date,
          venues: (active.venues || []).map(venueShape).filter(Boolean),
          members: active.members || [],
          createdAt: active.created_at
        });
      }
    }).catch(function () {}));

    return Promise.all(jobs).then(function () {
      safeSet(KEYS.lastSync, nowIso());
      emit('all', { action: 'hydrate' });
    });
  }

  // Trigger hydration on auth change
  function onAuthChange() {
    if (window.SLApi && window.SLApi.isLoggedIn()) {
      hydrateFromServer();
    }
  }

  window.addEventListener('sl-auth-change', onAuthChange);
  document.addEventListener('sl-auth-change', onAuthChange);

  // Also try once on load
  setTimeout(function () {
    if (window.SLApi && window.SLApi.isLoggedIn()) hydrateFromServer();
  }, 800);

  // =====================================================================
  // PUBLIC API
  // =====================================================================
  window.SLState = {
    // favorites
    getFavorites: getFavorites,
    isFavorite: isFavorite,
    addFavorite: addFavorite,
    removeFavorite: removeFavorite,
    toggleFavorite: toggleFavorite,

    // lists
    getLists: getLists,
    createList: createList,
    deleteList: deleteList,
    addVenueToList: addVenueToList,
    removeVenueFromList: removeVenueFromList,

    // plan
    getActivePlan: getActivePlan,
    isInPlan: isInPlan,
    addToPlan: addToPlan,
    removeFromPlan: removeFromPlan,
    togglePlan: togglePlan,
    reorderPlan: reorderPlan,
    clearPlan: clearPlan,
    renamePlan: renamePlan,

    // sync
    hydrateFromServer: hydrateFromServer,
    venueShape: venueShape,

    KEYS: KEYS
  };
})();

/* === js/sl-universal-actions.js === */
/**
 * SceneLink — Universal Save/Plan Action Handler
 *
 * Reads declarative data attributes from any button to wire save/plan actions.
 * Pages only need to add the right attributes to any button; this script handles
 * everything (auth-gating, API sync, visual state, toasts).
 *
 * Attributes:
 *   data-sl-action="save"|"plan"|"remove-fav"|"remove-plan"
 *   data-sl-venue-id="{uuid or number}"
 *   data-sl-venue-slug="{slug}"           (optional)
 *   data-sl-venue-name="{name}"           (for local/toast display)
 *   data-sl-venue-type="{type}"           (optional)
 *   data-sl-venue-image="{url}"           (optional)
 *   data-sl-venue-price="{$ label}"       (optional)
 *   data-sl-venue-neighborhood="{...}"    (optional)
 *   data-sl-venue-rating="{0-5}"          (optional)
 *
 * Visual state classes applied:
 *   .sl-saved, .sl-in-plan
 *
 * Child icon toggling:
 *   <i class="far fa-heart"></i>  ↔  <i class="fas fa-heart"></i>
 *   <i class="fas fa-plus"></i>   ↔  <i class="fas fa-check"></i>
 */
(function () {
  'use strict';

  // ---- Toast ----
  var _toastContainer = null;
  function toast(msg, kind) {
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.id = 'sl-toast-container';
      _toastContainer.style.cssText =
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10050;' +
        'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
      document.body.appendChild(_toastContainer);
    }
    var bg = '#D4AF37', color = '#000';
    if (kind === 'remove') { bg = '#333'; color = '#fff'; }
    if (kind === 'error')  { bg = '#ef4444'; color = '#fff'; }
    if (kind === 'info')   { bg = '#1e293b'; color = '#fff'; }

    var t = document.createElement('div');
    t.style.cssText =
      'background:' + bg + ';color:' + color + ';padding:10px 22px;border-radius:24px;' +
      'font-weight:600;font-size:14px;box-shadow:0 8px 28px rgba(0,0,0,0.45);' +
      'opacity:0;transform:translateY(12px);transition:opacity 0.25s, transform 0.25s;' +
      'pointer-events:auto;';
    t.textContent = msg;
    _toastContainer.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translateY(12px)';
      setTimeout(function () { t.remove(); }, 260);
    }, 2400);
  }

  // ---- Extract venue payload from button or parent card ----
  function extractVenue(btn) {
    var ds = btn.dataset;
    var v = {
      id:           ds.slVenueId || ds.venueId,
      slug:         ds.slVenueSlug || ds.venueSlug,
      name:         ds.slVenueName || ds.venueName,
      type:         ds.slVenueType || ds.venueType,
      image:        ds.slVenueImage || ds.venueImage,
      rating:       ds.slVenueRating || ds.venueRating,
      neighborhood: ds.slVenueNeighborhood || ds.venueNeighborhood,
      price:        ds.slVenuePrice || ds.venuePrice
    };
    // Fallback: walk up to nearest card element with data-venue-* attrs
    if (!v.id) {
      var card = btn.closest('[data-venue-id], [data-sl-venue-id]');
      if (card) {
        var cds = card.dataset;
        v = {
          id:           cds.slVenueId || cds.venueId,
          slug:         cds.slVenueSlug || cds.venueSlug,
          name:         cds.slVenueName || cds.venueName,
          type:         cds.slVenueType || cds.venueType,
          image:        cds.slVenueImage || cds.venueImage,
          rating:       cds.slVenueRating || cds.venueRating,
          neighborhood: cds.slVenueNeighborhood || cds.venueNeighborhood,
          price:        cds.slVenuePrice || cds.venuePrice
        };
      }
    }
    return v.id ? v : null;
  }

  // ---- Toggle heart icon ----
  function setSavedIcon(btn, isSaved) {
    btn.classList.toggle('sl-saved', isSaved);
    btn.classList.toggle('saved', isSaved);
    btn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
    var icon = btn.querySelector('i.fa-heart, i.fa-bookmark, i[class*="heart"], i[class*="bookmark"]');
    if (icon) {
      if (icon.classList.contains('fa-heart')) {
        icon.classList.toggle('far', !isSaved);
        icon.classList.toggle('fas', isSaved);
      } else if (icon.classList.contains('fa-bookmark')) {
        icon.classList.toggle('far', !isSaved);
        icon.classList.toggle('fas', isSaved);
      }
      icon.style.color = isSaved ? '#D4AF37' : '';
    }
    // Label swap if button has a text label like "Save" / "Saved"
    var txt = btn.querySelector('.sl-btn-label, .btn-label');
    if (txt) txt.textContent = isSaved ? 'Saved' : 'Save';
  }

  function setPlanIcon(btn, inPlan) {
    btn.classList.toggle('sl-in-plan', inPlan);
    btn.classList.toggle('in-plan', inPlan);
    btn.setAttribute('aria-pressed', inPlan ? 'true' : 'false');
    var icon = btn.querySelector('i.fa-plus, i.fa-check, i[class*="plus"], i[class*="check"]');
    if (icon) {
      if (inPlan) {
        icon.classList.remove('fa-plus'); icon.classList.add('fa-check');
      } else {
        icon.classList.remove('fa-check'); icon.classList.add('fa-plus');
      }
    }
    var txt = btn.querySelector('.sl-btn-label, .btn-label');
    if (txt) txt.textContent = inPlan ? 'In Plan' : 'Add to Plan';
  }

  // ---- Sync ALL matching buttons on the page to current state ----
  function refreshAll() {
    document.querySelectorAll('[data-sl-action="save"]').forEach(function (btn) {
      var v = extractVenue(btn);
      if (v) setSavedIcon(btn, window.SLState.isFavorite(v.id));
    });
    document.querySelectorAll('[data-sl-action="plan"]').forEach(function (btn) {
      var v = extractVenue(btn);
      if (v) setPlanIcon(btn, window.SLState.isInPlan(v.id));
    });
    updateHeaderBadge();
  }

  // ---- Header badge: show plan count ----
  function updateHeaderBadge() {
    var plan = window.SLState.getActivePlan();
    var count = plan.venues.length;
    var badges = document.querySelectorAll('.sl-plan-count-badge');
    badges.forEach(function (b) {
      b.textContent = count;
      b.style.display = count > 0 ? '' : 'none';
    });
  }

  // ---- Auth gate ----
  function isLoggedIn() {
    try {
      if (window.SLApi && typeof window.SLApi.isLoggedIn === 'function') return window.SLApi.isLoggedIn();
      if (window.SLAuth && typeof window.SLAuth.isAuthed === 'function') return window.SLAuth.isAuthed();
      return !!(localStorage.getItem('sl_jwt_token') || localStorage.getItem('sl_jwt_v2'));
    } catch (_) { return false; }
  }
  function requireAuthOrPrompt(actionLabel) {
    if (isLoggedIn()) return true;
    // Prefer premium login prompt modal if available
    try {
      if (window.SLPolish && typeof window.SLPolish.showLoginPrompt === 'function') {
        window.SLPolish.showLoginPrompt(actionLabel);
        return false;
      }
    } catch (_) {}
    // Fallback: toast + auth modal
    toast('Please log in to ' + (actionLabel || 'continue'), 'info');
    try {
      if (window.SLAuth && typeof window.SLAuth.openLogin === 'function') window.SLAuth.openLogin('login');
      else if (window.SLAuthUI && typeof window.SLAuthUI.open === 'function') window.SLAuthUI.open('login');
    } catch (_) {}
    return false;
  }

  // ---- Handle click ----
  function onClick(e) {
    var btn = e.target.closest('[data-sl-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-sl-action');
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();

    if (action === 'save' || action === 'plan' || action === 'remove-fav' || action === 'remove-plan' || action === 'add-to-list') {
      var label = action === 'save' ? 'save favorites' :
                  action === 'plan' ? 'build your plan' :
                  action === 'add-to-list' ? 'add to a list' : 'continue';
      if (!requireAuthOrPrompt(label)) return;
    }

    var venue = extractVenue(btn);
    if (!venue || !venue.id) {
      console.warn('[sl-universal-actions] no venue data on button', btn);
      return;
    }

    if (action === 'save') {
      var nowSaved = window.SLState.toggleFavorite(venue);
      setSavedIcon(btn, nowSaved);
      // Sync all other buttons for this venue
      document.querySelectorAll('[data-sl-action="save"][data-sl-venue-id="' + venue.id + '"]').forEach(function (b) {
        setSavedIcon(b, nowSaved);
      });
      toast(nowSaved ? ('Saved ' + (venue.name || 'venue')) : ('Removed ' + (venue.name || 'venue')), nowSaved ? 'saved' : 'remove');
      return;
    }

    if (action === 'plan') {
      var nowInPlan = window.SLState.togglePlan(venue);
      setPlanIcon(btn, nowInPlan);
      document.querySelectorAll('[data-sl-action="plan"][data-sl-venue-id="' + venue.id + '"]').forEach(function (b) {
        setPlanIcon(b, nowInPlan);
      });
      toast(nowInPlan ? ('Added ' + (venue.name || 'venue') + ' to your plan') : ('Removed from plan'), nowInPlan ? 'saved' : 'remove');
      updateHeaderBadge();
      return;
    }

    if (action === 'remove-fav') {
      window.SLState.removeFavorite(venue.id);
      toast('Removed from favorites', 'remove');
      return;
    }

    if (action === 'remove-plan') {
      window.SLState.removeFromPlan(venue.id);
      toast('Removed from plan', 'remove');
      updateHeaderBadge();
      return;
    }
  }

  // ---- Init ----
  function init() {
    document.addEventListener('click', onClick, true);
    refreshAll();

    // Refresh when state changes
    window.addEventListener('sl-state-change', refreshAll);
    document.addEventListener('sl-state-change', refreshAll);
    // Refresh when auth changes (hydrate may have updated favorites)
    window.addEventListener('sl-auth-change', function () {
      setTimeout(refreshAll, 400);
      setTimeout(refreshAll, 1500);
    });

    // Repeat refresh to catch late-rendered cards
    setTimeout(refreshAll, 500);
    setTimeout(refreshAll, 1500);
    setTimeout(refreshAll, 3000);

    // Observe DOM for new cards
    try {
      var mo = new MutationObserver(function (muts) {
        var hasNew = muts.some(function (m) {
          return [].some.call(m.addedNodes, function (n) {
            return n.nodeType === 1 && (
              n.matches && n.matches('[data-sl-action], [data-venue-id]') ||
              n.querySelector && n.querySelector('[data-sl-action], [data-venue-id]')
            );
          });
        });
        if (hasNew) refreshAll();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public helpers
  window.SLActions = {
    refresh: refreshAll,
    toast: toast
  };
})();

/* === js/sl-feature-flags.js === */
/**
 * SceneLink V1 Launch — Feature Flags & Coming-Soon Labels
 *
 * After Phase 2-4, most social features are backed by real endpoints:
 *   - /api/friends, /api/conversations, /api/posts, /api/notifications
 *   - /api/reviews (POST), /api/checkins (POST)
 *   - /api/concierge (AI Concierge backend)
 *
 * This file still exists to:
 *  - provide a central `window.SL_FLAGS` toggle set
 *  - inject the shared toast style + `.sl-coming-soon-pill` / `.sl-feature-disabled` helpers
 *  - (optionally) disable not-yet-implemented UI pieces
 */
(function() {
  'use strict';

  const FLAGS = {
    FRIENDS_BACKEND: true,        // /api/friends LIVE
    AI_CONCIERGE_BACKEND: true,   // /api/concierge LIVE
    REVIEWS_WRITE: true,          // /api/reviews (POST) LIVE
    SOCIAL_FEED_REAL: true,       // /api/posts/feed LIVE
    CHECKINS_BACKEND: true,
    LISTS_BACKEND: true,
    FAVORITES_BACKEND: true,
    PLANS_BACKEND: true,
    MESSAGING_BACKEND: true,      // /api/conversations LIVE
    NOTIFICATIONS_BACKEND: true,  // /api/notifications LIVE
  };
  window.SL_FLAGS = FLAGS;

  // Inject shared toast + pill styles (used across app)
  const style = document.createElement('style');
  style.textContent = `
    .sl-coming-soon-pill {
      display: inline-block;
      padding: 2px 8px;
      margin-left: 6px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      background: linear-gradient(135deg, #d4a017 0%, #b8860b 100%);
      color: #000;
      border-radius: 10px;
      vertical-align: middle;
      white-space: nowrap;
    }
    .sl-feature-disabled {
      opacity: 0.55;
      pointer-events: none;
      position: relative;
    }
    .sl-feature-disabled::after {
      content: "Coming Soon";
      position: absolute;
      top: 8px;
      right: 8px;
      background: linear-gradient(135deg, #d4a017 0%, #b8860b 100%);
      color: #000;
      padding: 3px 10px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      z-index: 5;
      pointer-events: none;
    }
    .sl-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(20, 20, 20, 0.95);
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      border: 1px solid rgba(212, 160, 23, 0.4);
      font-size: 14px;
      z-index: 100000;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      animation: slSlideUp 0.3s ease-out;
      max-width: 90vw;
      text-align: center;
    }
    .sl-toast.sl-toast-error {
      border-color: rgba(255, 80, 80, 0.5);
    }
    .sl-toast.sl-toast-success {
      border-color: rgba(80, 220, 140, 0.5);
    }
    @keyframes slSlideUp {
      from { opacity: 0; transform: translate(-50%, 20px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
  `;
  document.head.appendChild(style);

  function toast(msg, ms, kind) {
    const t = document.createElement('div');
    t.className = 'sl-toast' + (kind ? ' sl-toast-' + kind : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.2s'; }, (ms || 2800) - 200);
    setTimeout(() => t.remove(), ms || 2800);
  }
  window.SLToast = toast;

  function addPill(el, text) {
    if (!el || el.querySelector('.sl-coming-soon-pill')) return;
    const pill = document.createElement('span');
    pill.className = 'sl-coming-soon-pill';
    pill.textContent = text || 'Soon';
    el.appendChild(pill);
  }

  function applyFlags() {
    // All major features are now backed by real endpoints — no need to disable.
    // This function is preserved as a hook for future feature flag work.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyFlags);
  } else {
    applyFlags();
  }

  window.SLFeatureFlags = { FLAGS, applyFlags, toast, addPill };
})();

/* === js/sl-notifications-bell.js === */
/**
 * SceneLink — Notifications Bell (site-wide)
 * Auto-injects into every page's header when user is logged in.
 * Polls /api/notifications/unread-count every 30s; dropdown shows recent.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    if (!window.SLApi) return;
    injectStyles();
    tryInject();
    // Re-try after auth settles (sl-auth.js toggles UI)
    window.addEventListener('sl-auth-ready', tryInject);
    setTimeout(tryInject, 1500);
    setTimeout(tryInject, 4000);
  });

  function injectStyles() {
    if (document.getElementById('sl-bell-style')) return;
    var st = document.createElement('style');
    st.id = 'sl-bell-style';
    st.textContent = `
      .sl-bell-wrap { position: relative; display: inline-block; margin-right: 10px; vertical-align: middle; }
      .sl-bell-btn {
        background: transparent; border: 1px solid rgba(255,255,255,0.14);
        color: #fff; width: 40px; height: 40px; border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        cursor: pointer; position: relative; transition: all 0.2s;
      }
      .sl-bell-btn:hover { border-color: #D4AF37; color: #D4AF37; }
      .sl-bell-btn .sl-bell-badge {
        position: absolute; top: -3px; right: -3px;
        background: #e11d48; color: #fff; min-width: 18px; height: 18px;
        border-radius: 9px; font-size: 10px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        padding: 0 4px; border: 2px solid #0a0a0a;
      }
      .sl-bell-dropdown {
        position: absolute; top: 48px; right: 0;
        width: 360px; max-width: 92vw; max-height: 70vh; overflow-y: auto;
        background: #141414; border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px; padding: 8px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        display: none; z-index: 99990;
      }
      .sl-bell-dropdown.open { display: block; }
      .sl-bell-dropdown .sl-bell-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 12px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .sl-bell-dropdown .sl-bell-header strong { color: #fff; font-size: 14px; }
      .sl-bell-dropdown .sl-bell-header button {
        background: transparent; border: 0; color: #D4AF37;
        font-size: 12px; cursor: pointer;
      }
      .sl-notif-item {
        display: flex; gap: 10px; padding: 10px 12px; border-radius: 8px;
        text-decoration: none; color: #fff; cursor: pointer;
      }
      .sl-notif-item:hover { background: rgba(255,255,255,0.04); }
      .sl-notif-item.unread { background: rgba(212,175,55,0.06); }
      .sl-notif-item img {
        width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
      }
      .sl-notif-item .sl-notif-body {
        flex: 1; min-width: 0; font-size: 13px; line-height: 1.4;
      }
      .sl-notif-item .sl-notif-body small {
        display: block; color: rgba(255,255,255,0.4); font-size: 11px; margin-top: 2px;
      }
      .sl-notif-empty {
        text-align: center; padding: 32px 12px; color: rgba(255,255,255,0.4);
        font-size: 13px;
      }
    `;
    document.head.appendChild(st);
  }

  function tryInject() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) {
      // Remove bell if user logged out
      var existing = document.querySelector('.sl-bell-wrap');
      if (existing) existing.remove();
      return;
    }
    if (document.querySelector('.sl-bell-wrap')) {
      refreshCount();
      return;
    }

    // Find header anchor — try nav-right or the auth-trigger button's parent
    var trigger = document.querySelector('.nav-right .sl-auth-trigger') ||
                  document.querySelector('.nav-right button') ||
                  document.querySelector('header .sl-auth-trigger');
    if (!trigger || !trigger.parentElement) return;

    var wrap = document.createElement('div');
    wrap.className = 'sl-bell-wrap';
    wrap.innerHTML =
      '<button class="sl-bell-btn" id="slBellBtn" aria-label="Notifications">' +
      '  <i class="fas fa-bell"></i>' +
      '  <span class="sl-bell-badge" style="display:none;" id="slBellBadge">0</span>' +
      '</button>' +
      '<div class="sl-bell-dropdown" id="slBellDropdown">' +
      '  <div class="sl-bell-header">' +
      '    <strong>Notifications</strong>' +
      '    <button id="slBellMarkAll">Mark all read</button>' +
      '  </div>' +
      '  <div id="slBellList"><div class="sl-notif-empty"><i class="fas fa-spinner fa-spin"></i></div></div>' +
      '</div>';

    trigger.parentElement.insertBefore(wrap, trigger);

    document.getElementById('slBellBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDropdown();
    });
    document.getElementById('slBellMarkAll').addEventListener('click', function (e) {
      e.stopPropagation();
      window.SLApi.markAllRead().then(function () {
        refreshCount();
        loadList();
      }).catch(function () {});
    });
    // Close on outside click
    document.addEventListener('click', function (e) {
      var dd = document.getElementById('slBellDropdown');
      var wrap = document.querySelector('.sl-bell-wrap');
      if (dd && dd.classList.contains('open') && wrap && !wrap.contains(e.target)) {
        dd.classList.remove('open');
      }
    });

    refreshCount();
    // Poll every 30s
    setInterval(refreshCount, 30000);
  }

  function toggleDropdown() {
    var dd = document.getElementById('slBellDropdown');
    if (!dd) return;
    if (dd.classList.contains('open')) {
      dd.classList.remove('open');
    } else {
      dd.classList.add('open');
      loadList();
    }
  }

  function refreshCount() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) return;
    window.SLApi.unreadCount().then(function (r) {
      var n = (r && (r.unread !== undefined ? r.unread : r.count)) || 0;
      var badge = document.getElementById('slBellBadge');
      if (!badge) return;
      if (n > 0) {
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }).catch(function () {});
  }

  function loadList() {
    var list = document.getElementById('slBellList');
    if (!list) return;
    list.innerHTML = '<div class="sl-notif-empty"><i class="fas fa-spinner fa-spin"></i></div>';
    window.SLApi.notifications().then(function (r) {
      var items = (r && r.notifications) || [];
      if (items.length === 0) {
        list.innerHTML = '<div class="sl-notif-empty">No notifications yet</div>';
        return;
      }
      list.innerHTML = items.slice(0, 20).map(renderNotif).join('');
      list.querySelectorAll('[data-notif-id]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          var id = this.dataset.notifId;
          var href = this.dataset.href;
          window.SLApi.markNotificationRead(id).catch(function () {});
          if (href) window.location.href = href;
        });
      });
    }).catch(function () {
      list.innerHTML = '<div class="sl-notif-empty" style="color:#e57373;">Could not load</div>';
    });
  }

  function renderNotif(n) {
    var actor = n.actor_display_name || n.actor_username || 'Someone';
    var avatar = n.actor_avatar_url ||
      (window.SL_AVATAR ? SL_AVATAR(actor) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(actor) +
      '&size=40&background=D4AF37&color=0a0a0a');
    var unreadCls = n.read_at ? '' : 'unread';
    var text = '';
    var href = '#';
    switch (n.type) {
      case 'friend_request':
        text = '<b>' + esc(actor) + '</b> sent you a friend request';
        href = '/profile.html';
        break;
      case 'friend_accept':
        text = '<b>' + esc(actor) + '</b> accepted your friend request';
        href = '/profile.html';
        break;
      case 'new_message':
        text = '<b>' + esc(actor) + '</b> sent you a message';
        href = '/messages.html';
        break;
      case 'post_like':
        text = '<b>' + esc(actor) + '</b> liked your post';
        href = '/social-feed.html';
        break;
      case 'post_comment':
        text = '<b>' + esc(actor) + '</b> commented on your post';
        href = '/social-feed.html';
        break;
      case 'plan_invite':
        text = '<b>' + esc(actor) + '</b> invited you to a plan';
        href = '/plan-with-friends.html';
        break;
      case 'plan_accept':
        text = '<b>' + esc(actor) + '</b> joined your plan';
        href = '/plan-with-friends.html';
        break;
      default:
        text = '<b>' + esc(actor) + '</b> — ' + esc(n.type);
    }
    return (
      '<a class="sl-notif-item ' + unreadCls + '" data-notif-id="' + esc(n.id) + '" data-href="' + esc(href) + '" href="' + esc(href) + '">' +
      '  <img src="' + esc(avatar) + '" alt="">' +
      '  <div class="sl-notif-body">' +
      text +
      '<small>' + esc(relTime(n.created_at)) + '</small>' +
      '  </div>' +
      '</a>'
    );
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function relTime(iso) {
    if (!iso) return '';
    var ms = Date.now() - new Date(iso).getTime();
    var s = Math.floor(ms / 1000);
    if (s < 60) return 'just now';
    var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
    return new Date(iso).toLocaleDateString();
  }
})();

/* === js/sl-review-modal.js === */
/**
 * SceneLink — Write Review Modal (Yelp-style, no check-in required)
 * Wires any `.btn-write-review`, `[data-action="write-review"]` element,
 * or a data-venue-id attribute to a modal that POSTs to /api/reviews.
 *
 * Exposes: window.SLReviewModal.open(venueId, venueName)
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    if (!window.SLApi) return;
    injectStyles();
    wireTriggers();
    // Re-wire whenever new DOM is injected (venue cards etc.)
    setTimeout(wireTriggers, 1500);
    setTimeout(wireTriggers, 4000);
  });

  function injectStyles() {
    if (document.getElementById('sl-review-style')) return;
    var st = document.createElement('style');
    st.id = 'sl-review-style';
    st.textContent = `
      #slReviewModal .sl-rating-stars {
        display: flex; gap: 4px; font-size: 32px; justify-content: center;
        padding: 12px 0;
      }
      #slReviewModal .sl-rating-stars i {
        color: rgba(255,255,255,0.2); cursor: pointer; transition: transform 0.1s;
      }
      #slReviewModal .sl-rating-stars i:hover { transform: scale(1.1); }
      #slReviewModal .sl-rating-stars i.active { color: #D4AF37; }
      #slReviewModal .sl-rating-label {
        text-align: center; color: rgba(255,255,255,0.6); font-size: 13px;
        min-height: 18px; margin-bottom: 8px;
      }
    `;
    document.head.appendChild(st);
  }

  function buildModal() {
    if (document.getElementById('slReviewModal')) return;
    var m = document.createElement('div');
    m.id = 'slReviewModal';
    m.className = 'sl-modal-overlay';
    m.innerHTML =
      '<div class="sl-modal">' +
      '  <div class="sl-modal-header">' +
      '    <h2>Write a Review</h2>' +
      '    <button class="sl-modal-close" data-close="slReviewModal"><i class="fas fa-times"></i></button>' +
      '  </div>' +
      '  <div class="sl-modal-body">' +
      '    <div id="slReviewVenueLabel" style="font-size:14px;color:rgba(255,255,255,0.7);margin-bottom:8px;"></div>' +
      '    <div class="sl-rating-stars" id="slRatingStars">' +
      '      <i class="fas fa-star" data-rating="1"></i>' +
      '      <i class="fas fa-star" data-rating="2"></i>' +
      '      <i class="fas fa-star" data-rating="3"></i>' +
      '      <i class="fas fa-star" data-rating="4"></i>' +
      '      <i class="fas fa-star" data-rating="5"></i>' +
      '    </div>' +
      '    <div class="sl-rating-label" id="slRatingLabel">Tap to rate</div>' +
      '    <div class="sl-form-group">' +
      '      <label>Your review (optional)</label>' +
      '      <textarea class="sl-input" id="slReviewText" rows="5" maxlength="2000" placeholder="Share what you loved, what stood out, or any tips for others…"></textarea>' +
      '      <div class="sl-char-count"><span id="slReviewCount">0</span>/2000</div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="sl-modal-footer">' +
      '    <button class="sl-btn sl-btn-secondary" data-close="slReviewModal">Cancel</button>' +
      '    <button class="sl-btn sl-btn-primary" id="slReviewSubmit" disabled><i class="fas fa-check"></i> Post Review</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(m);

    m.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { close(); });
    });

    var rating = 0;
    var labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
    m.querySelectorAll('#slRatingStars i').forEach(function (star) {
      star.addEventListener('mouseenter', function () {
        var r = parseInt(this.dataset.rating, 10);
        paintStars(r);
      });
      star.addEventListener('mouseleave', function () { paintStars(rating); });
      star.addEventListener('click', function () {
        rating = parseInt(this.dataset.rating, 10);
        paintStars(rating);
        document.getElementById('slRatingLabel').textContent = labels[rating] || '';
        document.getElementById('slReviewSubmit').disabled = rating < 1;
      });
    });

    function paintStars(r) {
      m.querySelectorAll('#slRatingStars i').forEach(function (s) {
        var v = parseInt(s.dataset.rating, 10);
        s.classList.toggle('active', v <= r);
      });
    }

    document.getElementById('slReviewText').addEventListener('input', function () {
      document.getElementById('slReviewCount').textContent = this.value.length;
    });

    document.getElementById('slReviewSubmit').addEventListener('click', function () {
      var btn = this;
      var venueId = m.dataset.venueId;
      var content = document.getElementById('slReviewText').value.trim();
      if (!venueId || rating < 1) return;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting…';
      window.SLApi.postReview({
        venue_id: venueId,
        rating: rating,
        content: content
      }).then(function () {
        if (window.SLToast) window.SLToast('Review posted 🎉', 2800, 'success');
        close();
        // Notify other scripts (venue detail page) to refresh
        window.dispatchEvent(new CustomEvent('sl-review-posted', { detail: { venue_id: venueId }}));
      }).catch(function (err) {
        if (window.SLToast) window.SLToast(err.message || 'Could not post review', 2800, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Post Review';
      });
    });

    // Expose close helper
    m._reset = function (venueId, venueName) {
      m.dataset.venueId = venueId || '';
      document.getElementById('slReviewVenueLabel').textContent =
        venueName ? 'Reviewing ' + venueName : '';
      rating = 0;
      paintStars(0);
      document.getElementById('slRatingLabel').textContent = 'Tap to rate';
      document.getElementById('slReviewText').value = '';
      document.getElementById('slReviewCount').textContent = '0';
      document.getElementById('slReviewSubmit').disabled = true;
      document.getElementById('slReviewSubmit').innerHTML = '<i class="fas fa-check"></i> Post Review';
    };

    function close() {
      m.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  function open(venueId, venueName) {
    if (!window.SLApi.isLoggedIn()) {
      // Trigger sign-in flow
      var trig = document.querySelector('.sl-auth-trigger');
      if (trig) trig.click();
      else if (window.SLToast) window.SLToast('Please sign in first');
      return;
    }
    if (!venueId) {
      if (window.SLToast) window.SLToast('No venue specified');
      return;
    }
    buildModal();
    var m = document.getElementById('slReviewModal');
    m._reset(venueId, venueName);
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function wireTriggers() {
    var sels = [
      '.btn-write-review',
      '[data-action="write-review"]',
      '[data-write-review]',
      '.write-review-btn'
    ];
    sels.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (el.dataset.slReviewWired) return;
        el.dataset.slReviewWired = '1';
        el.addEventListener('click', function (e) {
          var venueId = this.dataset.venueId ||
                        this.closest('[data-venue-id]') && this.closest('[data-venue-id]').dataset.venueId;
          var venueName = this.dataset.venueName ||
                          this.closest('[data-venue-name]') && this.closest('[data-venue-name]').dataset.venueName;
          if (!venueId) {
            // Try a common body attribute on venue pages
            venueId = document.body.dataset.venueId || '';
            venueName = document.body.dataset.venueName || '';
          }
          if (!venueId) return; // silently skip if no venue context
          e.preventDefault();
          e.stopPropagation();
          open(venueId, venueName);
        }, true);
      });
    });
  }

  window.SLReviewModal = { open: open, wire: wireTriggers };
})();

/* === js/sl-plans-v2.js === */
/**
 * SceneLink — Plans V2 augmentations
 *
 * Adds to plan-with-friends.html (and related pages):
 *   1. Incoming plan-invite banner at top when SLApi.incomingPlanInvites() returns any
 *   2. Plan-detail modal (open via window.SLPlansV2.openDetail(planId))
 *      - Shows stops with delete button
 *      - Invite-by-username form
 *      - Accept/decline actions for invites
 *      - Share plan button (creates a post)
 *
 * Does NOT touch the existing demo plan cards or create-plan modal.
 */
(function () {
  'use strict';
    if (window.SL_CONNECTED_PLANS) return;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    if (!window.SLApi) return;
    injectStyles();
    renderInvitesBanner();
    // Re-check when login completes
    window.addEventListener('sl-auth-ready', renderInvitesBanner);
    // Poll every 60s for new invites when on plan page
    if (/plan-with-friends/.test(location.pathname)) {
      setInterval(renderInvitesBanner, 60000);
    }
  });

  function injectStyles() {
    if (document.getElementById('sl-plans-v2-style')) return;
    var st = document.createElement('style');
    st.id = 'sl-plans-v2-style';
    st.textContent = `
      .sl-invites-banner {
        max-width: 1100px; margin: 16px auto; padding: 0 20px;
      }
      .sl-invites-card {
        background: linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.04));
        border: 1px solid rgba(212,175,55,0.35); border-radius: 14px;
        padding: 16px 20px;
      }
      .sl-invites-card h3 {
        color: #D4AF37; margin: 0 0 12px; font-size: 16px; display:flex; align-items:center; gap:8px;
      }
      .sl-invite-row {
        display: flex; align-items: center; gap: 12px; padding: 8px 0;
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .sl-invite-row:first-of-type { border-top: 0; }
      .sl-invite-row img { width: 36px; height: 36px; border-radius: 50%; }
      .sl-invite-row .sl-invite-meta { flex: 1; min-width: 0; color: #fff; font-size: 14px; }
      .sl-invite-row .sl-invite-meta small { display:block; color: rgba(255,255,255,0.5); font-size: 12px; }
      .sl-invite-row button {
        background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #fff;
        padding: 6px 12px; border-radius: 8px; font-size: 12px; cursor: pointer;
        margin-left: 6px; transition: all 0.15s;
      }
      .sl-invite-row button:hover { border-color: #D4AF37; color: #D4AF37; }
      .sl-invite-row button.primary {
        background: linear-gradient(135deg, #D4AF37, #b8860b); color: #000; border: 0; font-weight: 700;
      }

      #slPlanDetailModal .sl-plan-stops {
        display: flex; flex-direction: column; gap: 10px;
      }
      #slPlanDetailModal .sl-plan-stop {
        display: flex; gap: 12px; padding: 12px; background: rgba(255,255,255,0.04);
        border-radius: 10px; align-items: center;
      }
      #slPlanDetailModal .sl-plan-stop .sl-stop-order {
        background: #D4AF37; color: #000; width: 28px; height: 28px;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 13px; flex-shrink: 0;
      }
      #slPlanDetailModal .sl-plan-stop .sl-stop-meta { flex: 1; min-width: 0; }
      #slPlanDetailModal .sl-plan-stop .sl-stop-meta strong { color: #fff; display: block; }
      #slPlanDetailModal .sl-plan-stop .sl-stop-meta small { color: rgba(255,255,255,0.5); }
      #slPlanDetailModal .sl-plan-stop button {
        background: transparent; border: 0; color: #e57373; cursor: pointer;
      }
      #slPlanDetailModal .sl-plan-members {
        display: flex; flex-wrap: wrap; gap: 8px;
      }
      #slPlanDetailModal .sl-plan-member {
        display: flex; align-items: center; gap: 6px;
        background: rgba(255,255,255,0.05); padding: 4px 10px 4px 4px;
        border-radius: 16px; font-size: 12px; color: #fff;
      }
      #slPlanDetailModal .sl-plan-member img {
        width: 24px; height: 24px; border-radius: 50%;
      }
      #slPlanDetailModal .sl-invite-form {
        display: flex; gap: 8px; margin-top: 8px;
      }
      #slPlanDetailModal .sl-invite-form input {
        flex: 1; background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1); color: #fff;
        padding: 8px 12px; border-radius: 8px; font-size: 13px;
      }
    `;
    document.head.appendChild(st);
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function avatar(u) {
    if (!u) return (window.SL_AVATAR ? SL_AVATAR('?') : 'https://ui-avatars.com/api/?name=?&size=36&background=D4AF37&color=0a0a0a');
    if (u.avatar_url) return u.avatar_url;
    var n = u.display_name || u.username || '?';
    return (window.SL_AVATAR ? SL_AVATAR(n) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) +
      '&size=36&background=D4AF37&color=0a0a0a');
  }

  // ---------- Invites banner ----------
  function renderInvitesBanner() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) return;
    if (!/plan-with-friends/.test(location.pathname)) return;

    SLApi.incomingPlanInvites().then(function (r) {
      var invites = (r && r.invites) || [];
      var existing = document.getElementById('slInvitesBanner');
      if (existing) existing.remove();
      if (invites.length === 0) return;

      var banner = document.createElement('div');
      banner.className = 'sl-invites-banner';
      banner.id = 'slInvitesBanner';
      banner.innerHTML =
        '<div class="sl-invites-card">' +
        '<h3><i class="fas fa-envelope-open-text"></i> ' +
          invites.length + ' plan invite' + (invites.length === 1 ? '' : 's') + '</h3>' +
        invites.map(function (inv) {
          var u = { display_name: inv.inviter_display_name, username: inv.inviter_username, avatar_url: inv.inviter_avatar_url };
          return (
            '<div class="sl-invite-row" data-invite-id="' + esc(inv.invite_id || inv.id) + '" data-plan-id="' + esc(inv.plan_id) + '">' +
            '  <img src="' + esc(avatar(u)) + '" alt="">' +
            '  <div class="sl-invite-meta">' +
            '    <strong>' + esc(inv.plan_name || 'A plan') + '</strong>' +
            '    <small>from ' + esc(u.display_name || u.username || 'someone') + (inv.plan_date ? ' · ' + esc(inv.plan_date) : '') + '</small>' +
            '  </div>' +
            '  <button class="primary" data-act="accept">Accept</button>' +
            '  <button data-act="decline">Decline</button>' +
            '</div>'
          );
        }).join('') +
        '</div>';

      // Insert after the hero section (before #pwfPlansSection)
      var anchor = document.getElementById('pwfPlansSection') || document.querySelector('main') || document.body;
      anchor.parentNode.insertBefore(banner, anchor);

      banner.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = this.closest('.sl-invite-row');
          var act = this.dataset.act;
          var planId = row.dataset.planId;
          var inviteId = row.dataset.inviteId;
          this.disabled = true;
          this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          var fn = act === 'accept' ? SLApi.acceptPlanInvite : SLApi.declinePlanInvite;
          fn.call(SLApi, planId, inviteId).then(function () {
            if (window.SLToast) window.SLToast(act === 'accept' ? 'Joined plan 🎉' : 'Invite declined', 2500, act === 'accept' ? 'success' : null);
            row.remove();
            // If empty, remove banner
            if (!banner.querySelector('.sl-invite-row')) banner.remove();
          }).catch(function (e) {
            if (window.SLToast) window.SLToast(e.message || 'Failed', 2800, 'error');
            btn.disabled = false;
            btn.textContent = act === 'accept' ? 'Accept' : 'Decline';
          });
        });
      });
    }).catch(function () {});
  }

  // ---------- Plan-detail modal ----------
  function buildPlanDetailModal() {
    if (document.getElementById('slPlanDetailModal')) return;
    var m = document.createElement('div');
    m.id = 'slPlanDetailModal';
    m.className = 'sl-modal-overlay';
    m.innerHTML =
      '<div class="sl-modal" style="max-width:600px;">' +
      '  <div class="sl-modal-header">' +
      '    <h2 id="slPlanDetailTitle">Plan</h2>' +
      '    <button class="sl-modal-close" data-close="slPlanDetailModal"><i class="fas fa-times"></i></button>' +
      '  </div>' +
      '  <div class="sl-modal-body" id="slPlanDetailBody">' +
      '    <div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i></div>' +
      '  </div>' +
      '  <div class="sl-modal-footer">' +
      '    <button class="sl-btn sl-btn-secondary" id="slPlanShareBtn"><i class="fas fa-share"></i> Share to Feed</button>' +
      '    <button class="sl-btn sl-btn-primary" data-close="slPlanDetailModal">Close</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(m);

    m.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () {
        m.classList.remove('active');
        document.body.style.overflow = '';
      });
    });

    document.getElementById('slPlanShareBtn').addEventListener('click', function () {
      var pid = m.dataset.planId;
      if (!pid) return;
      var btn = this;
      btn.disabled = true;
      SLApi.sharePlan(pid).then(function () {
        if (window.SLToast) window.SLToast('Plan shared to your feed', 2500, 'success');
      }).catch(function (e) {
        if (window.SLToast) window.SLToast(e.message || 'Share failed', 2500, 'error');
      }).finally(function () { btn.disabled = false; });
    });
  }

  function openDetail(planId) {
    if (!SLApi.isLoggedIn()) {
      var trig = document.querySelector('.sl-auth-trigger');
      if (trig) trig.click();
      return;
    }
    buildPlanDetailModal();
    var m = document.getElementById('slPlanDetailModal');
    m.dataset.planId = planId;
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
    loadPlan(planId);
  }

  function loadPlan(planId) {
    var body = document.getElementById('slPlanDetailBody');
    body.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i></div>';
    SLApi.planById(planId).then(function (r) {
      var p = (r && r.plan) || r;
      if (!p) throw new Error('No plan');

      document.getElementById('slPlanDetailTitle').textContent = p.name || 'Plan';

      var stops = p.stops || [];
      var members = p.members || [];
      var invites = p.invites || [];

      var html = '';
      if (p.date) html += '<div style="color:rgba(255,255,255,0.6);font-size:13px;margin-bottom:12px;"><i class="far fa-calendar"></i> ' + esc(p.date) + '</div>';
      if (p.description) html += '<p style="color:#ddd;margin-bottom:16px;">' + esc(p.description) + '</p>';

      // Members
      if (members.length > 0) {
        html += '<div style="margin-bottom:18px;"><div style="font-size:12px;text-transform:uppercase;color:#D4AF37;margin-bottom:8px;letter-spacing:0.5px;">Members (' + members.length + ')</div>';
        html += '<div class="sl-plan-members">';
        members.forEach(function (mem) {
          html += '<div class="sl-plan-member"><img src="' + esc(avatar(mem)) + '"> ' + esc(mem.display_name || mem.username || 'User') + '</div>';
        });
        html += '</div></div>';
      }

      // Pending invites
      if (invites.length > 0) {
        html += '<div style="margin-bottom:18px;"><div style="font-size:12px;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:8px;letter-spacing:0.5px;">Pending Invites (' + invites.length + ')</div>';
        html += '<div class="sl-plan-members">';
        invites.forEach(function (inv) {
          var u = { display_name: inv.display_name || inv.invitee_display_name, username: inv.username || inv.invitee_username, avatar_url: inv.avatar_url || inv.invitee_avatar_url };
          html += '<div class="sl-plan-member" style="opacity:0.6;"><img src="' + esc(avatar(u)) + '"> ' + esc(u.display_name || u.username || 'User') + ' <small style="margin-left:4px;color:#888;">pending</small></div>';
        });
        html += '</div></div>';
      }

      // Invite form
      html += '<div style="margin-bottom:18px;"><div style="font-size:12px;text-transform:uppercase;color:#D4AF37;margin-bottom:8px;letter-spacing:0.5px;">Invite Someone</div>';
      html += '<div class="sl-invite-form"><input type="text" id="slInviteUsername" placeholder="@username" autocomplete="off"><button class="sl-btn sl-btn-primary" id="slInviteSendBtn" style="padding:8px 14px;"><i class="fas fa-paper-plane"></i></button></div></div>';

      // Stops
      html += '<div style="font-size:12px;text-transform:uppercase;color:#D4AF37;margin-bottom:8px;letter-spacing:0.5px;">Stops (' + stops.length + ')</div>';
      if (stops.length === 0) {
        html += '<p style="color:rgba(255,255,255,0.4);font-size:13px;">No stops yet. Use "Add to Plan" on any venue page to build out the itinerary.</p>';
      } else {
        html += '<div class="sl-plan-stops">';
        stops.forEach(function (s, i) {
          html += '<div class="sl-plan-stop" data-stop-id="' + esc(s.id) + '">' +
            '  <div class="sl-stop-order">' + (s.sort_order || (i + 1)) + '</div>' +
            '  <div class="sl-stop-meta">' +
            '    <strong>' + esc(s.venue_name || 'Venue') + '</strong>' +
            (s.venue_neighborhood ? '<small>' + esc(s.venue_neighborhood) + '</small>' : '') +
            (s.arrival_time ? '<small><i class="far fa-clock"></i> ' + esc(s.arrival_time) + '</small>' : '') +
            (s.notes ? '<small style="display:block;margin-top:4px;color:rgba(255,255,255,0.7);">' + esc(s.notes) + '</small>' : '') +
            '  </div>' +
            (p.is_owner !== false ? '  <button data-del-stop="' + esc(s.id) + '" title="Remove"><i class="fas fa-trash"></i></button>' : '') +
            '</div>';
        });
        html += '</div>';
      }

      body.innerHTML = html;

      // Wire invite send
      var inviteBtn = document.getElementById('slInviteSendBtn');
      var inviteInput = document.getElementById('slInviteUsername');
      if (inviteBtn && inviteInput) {
        function doInvite() {
          var uname = inviteInput.value.trim().replace(/^@/, '');
          if (!uname) return;
          inviteBtn.disabled = true;
          inviteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          SLApi.invitePlan(planId, { username: uname }).then(function () {
            if (window.SLToast) window.SLToast('Invite sent to @' + uname, 2500, 'success');
            inviteInput.value = '';
            loadPlan(planId);
          }).catch(function (e) {
            if (window.SLToast) window.SLToast(e.message || 'Could not invite', 2800, 'error');
          }).finally(function () {
            inviteBtn.disabled = false;
            inviteBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
          });
        }
        inviteBtn.addEventListener('click', doInvite);
        inviteInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') doInvite(); });
      }

      // Wire delete stop
      body.querySelectorAll('[data-del-stop]').forEach(function (b) {
        b.addEventListener('click', function () {
          var stopId = this.dataset.delStop;
          if (!confirm('Remove this stop?')) return;
          SLApi.deleteStop(planId, stopId).then(function () {
            if (window.SLToast) window.SLToast('Stop removed');
            loadPlan(planId);
          }).catch(function (e) {
            if (window.SLToast) window.SLToast(e.message || 'Failed', 2800, 'error');
          });
        });
      });
    }).catch(function (e) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#e57373;">Could not load plan</div>';
    });
  }

  window.SLPlansV2 = {
    openDetail: openDetail,
    refreshInvites: renderInvitesBanner
  };
})();

/* === js/sl-user-search.js === */
/**
 * SceneLink — Site-wide User Search + Public Profile viewer
 *
 * Adds a search icon to every page header that opens a lightweight
 * dropdown for finding other users by username/display_name.
 * Clicking a user opens a public-profile modal showing their bio + friendship status,
 * with Add Friend / Message / View Profile actions.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    if (!window.SLApi) return;
    injectStyles();
    tryInject();
    window.addEventListener('sl-auth-ready', tryInject);
    setTimeout(tryInject, 1500);
  });

  function injectStyles() {
    if (document.getElementById('sl-usearch-style')) return;
    var st = document.createElement('style');
    st.id = 'sl-usearch-style';
    st.textContent = `
      .sl-usearch-wrap { position: relative; display: inline-block; margin-right: 10px; vertical-align: middle; }
      .sl-usearch-btn {
        background: transparent; border: 1px solid rgba(255,255,255,0.14);
        color: #fff; width: 40px; height: 40px; border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        cursor: pointer; transition: all 0.2s;
      }
      .sl-usearch-btn:hover { border-color: #D4AF37; color: #D4AF37; }
      .sl-usearch-panel {
        position: absolute; top: 48px; right: 0;
        width: 340px; max-width: 92vw;
        background: #141414; border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px; padding: 12px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        display: none; z-index: 99989;
      }
      .sl-usearch-panel.open { display: block; }
      .sl-usearch-panel input {
        width: 100%; background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1); color: #fff;
        padding: 10px 12px; border-radius: 8px; font-size: 14px;
      }
      .sl-usearch-panel input:focus { outline: none; border-color: #D4AF37; }
      .sl-usearch-results {
        max-height: 340px; overflow-y: auto; margin-top: 8px;
      }
      .sl-usearch-row {
        display: flex; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer;
      }
      .sl-usearch-row:hover { background: rgba(255,255,255,0.04); }
      .sl-usearch-row img { width: 36px; height: 36px; border-radius: 50%; }
      .sl-usearch-row .sl-usearch-meta { flex: 1; min-width: 0; font-size: 13px; }
      .sl-usearch-row .sl-usearch-meta strong { color: #fff; display: block; }
      .sl-usearch-row .sl-usearch-meta small { color: #888; }
      .sl-usearch-empty { text-align: center; padding: 20px; color: rgba(255,255,255,0.4); font-size: 13px; }

      #slPublicProfile .sl-pp-cover {
        height: 120px; background: linear-gradient(135deg, #D4AF37 0%, #b8860b 100%);
        border-radius: 12px 12px 0 0; margin: -24px -24px 0;
      }
      #slPublicProfile .sl-pp-avatar {
        width: 88px; height: 88px; border-radius: 50%; border: 4px solid #141414;
        margin-top: -44px; background: #0a0a0a;
      }
      #slPublicProfile .sl-pp-stats {
        display: grid; grid-template-columns: repeat(3,1fr); gap: 12px;
        margin: 16px 0; padding: 12px; background: rgba(255,255,255,0.04);
        border-radius: 10px; text-align: center;
      }
      #slPublicProfile .sl-pp-stat strong { color: #D4AF37; font-size: 18px; display: block; }
      #slPublicProfile .sl-pp-stat small { color: rgba(255,255,255,0.6); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
      #slPublicProfile .sl-pp-actions {
        display: flex; gap: 8px; margin-top: 12px;
      }
      #slPublicProfile .sl-pp-actions button { flex: 1; }
    `;
    document.head.appendChild(st);
  }

  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function avatar(u) {
    if (!u) return (window.SL_AVATAR ? SL_AVATAR('?') : 'https://ui-avatars.com/api/?name=?&size=88&background=D4AF37&color=0a0a0a');
    if (u.avatar_url) return u.avatar_url;
    var n = u.display_name || u.username || '?';
    return (window.SL_AVATAR ? SL_AVATAR(n) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) + '&size=88&background=D4AF37&color=0a0a0a');
  }

  function tryInject() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) {
      var existing = document.querySelector('.sl-usearch-wrap');
      if (existing) existing.remove();
      return;
    }
    if (document.querySelector('.sl-usearch-wrap')) return;

    var trigger = document.querySelector('.sl-bell-wrap') ||
                  document.querySelector('.nav-right .sl-auth-trigger') ||
                  document.querySelector('.nav-right button');
    if (!trigger || !trigger.parentElement) return;

    var wrap = document.createElement('div');
    wrap.className = 'sl-usearch-wrap';
    wrap.innerHTML =
      '<button class="sl-usearch-btn" id="slUSearchBtn" aria-label="Find people"><i class="fas fa-search"></i></button>' +
      '<div class="sl-usearch-panel" id="slUSearchPanel">' +
      '  <input type="text" id="slUSearchInput" placeholder="Search people by username…" autocomplete="off">' +
      '  <div class="sl-usearch-results" id="slUSearchResults">' +
      '    <div class="sl-usearch-empty">Type at least 2 characters</div>' +
      '  </div>' +
      '</div>';
    trigger.parentElement.insertBefore(wrap, trigger);

    var btn = document.getElementById('slUSearchBtn');
    var panel = document.getElementById('slUSearchPanel');
    var input = document.getElementById('slUSearchInput');
    var results = document.getElementById('slUSearchResults');

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) input.focus();
    });
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open') && !wrap.contains(e.target)) {
        panel.classList.remove('open');
      }
    });

    var timer = null;
    input.addEventListener('input', function () {
      var q = this.value.trim();
      clearTimeout(timer);
      if (q.length < 2) {
        results.innerHTML = '<div class="sl-usearch-empty">Type at least 2 characters</div>';
        return;
      }
      results.innerHTML = '<div class="sl-usearch-empty"><i class="fas fa-spinner fa-spin"></i></div>';
      timer = setTimeout(function () {
        SLApi.searchUsers(q, 10).then(function (r) {
          var users = (r && (r.users || r.results)) || [];
          if (users.length === 0) {
            results.innerHTML = '<div class="sl-usearch-empty">No users found</div>';
            return;
          }
          results.innerHTML = users.map(function (u) {
            return (
              '<div class="sl-usearch-row" data-user="' + esc(u.username || u.id) + '">' +
              '  <img src="' + esc(avatar(u)) + '" alt="">' +
              '  <div class="sl-usearch-meta">' +
              '    <strong>' + esc(u.display_name || u.username) + '</strong>' +
              '    <small>@' + esc(u.username || '') + '</small>' +
              '  </div>' +
              '</div>'
            );
          }).join('');
          results.querySelectorAll('.sl-usearch-row').forEach(function (row) {
            row.addEventListener('click', function () {
              panel.classList.remove('open');
              openPublicProfile(this.dataset.user);
            });
          });
        }).catch(function () {
          results.innerHTML = '<div class="sl-usearch-empty" style="color:#e57373;">Search failed</div>';
        });
      }, 280);
    });
  }

  // ---------- Public profile modal ----------
  function buildPublicProfile() {
    if (document.getElementById('slPublicProfile')) return;
    var m = document.createElement('div');
    m.id = 'slPublicProfile';
    m.className = 'sl-modal-overlay';
    m.innerHTML =
      '<div class="sl-modal" style="max-width:460px;">' +
      '  <div class="sl-modal-header">' +
      '    <h2>Profile</h2>' +
      '    <button class="sl-modal-close" data-close="slPublicProfile"><i class="fas fa-times"></i></button>' +
      '  </div>' +
      '  <div class="sl-modal-body" id="slPPBody" style="padding-top:24px;">' +
      '    <div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i></div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(m);
    m.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () {
        m.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  function openPublicProfile(identifier) {
    buildPublicProfile();
    var m = document.getElementById('slPublicProfile');
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
    var body = document.getElementById('slPPBody');
    body.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i></div>';

    SLApi.userByIdentifier(identifier).then(function (r) {
      var u = (r && r.user) || r;
      if (!u) throw new Error('No user');
      var stats = u.stats || {
        post_count: u.post_count || 0,
        checkin_count: u.checkin_count || 0,
        friend_count: u.friend_count || 0,
        review_count: u.review_count || 0
      };
      var status = u.friendship_status || r.friendship_status || 'none';

      body.innerHTML =
        '<div class="sl-pp-cover"></div>' +
        '<img class="sl-pp-avatar" src="' + esc(avatar(u)) + '">' +
        '<h2 style="color:#fff;margin:8px 0 2px;">' + esc(u.display_name || u.username) + '</h2>' +
        '<div style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:4px;">@' + esc(u.username || '') + '</div>' +
        (u.bio ? '<p style="color:#ccc;font-size:14px;margin:8px 0;line-height:1.5;">' + esc(u.bio) + '</p>' : '') +
        '<div class="sl-pp-stats">' +
        '  <div class="sl-pp-stat"><strong>' + (stats.post_count || 0) + '</strong><small>Posts</small></div>' +
        '  <div class="sl-pp-stat"><strong>' + (stats.checkin_count || 0) + '</strong><small>Check-ins</small></div>' +
        '  <div class="sl-pp-stat"><strong>' + (stats.friend_count || 0) + '</strong><small>Friends</small></div>' +
        '</div>' +
        renderActions(u, status);

      wireActions(u, status);
    }).catch(function (e) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#e57373;">' + esc(e.message || 'Could not load profile') + '</div>';
    });
  }

  function renderActions(u, status) {
    var myId = window.SL_USER && window.SL_USER.id;
    if (myId === u.id) {
      return '<div class="sl-pp-actions"><button class="sl-btn sl-btn-secondary" onclick="window.location.href=\'/profile.html\'">View My Profile</button></div>';
    }
    var html = '<div class="sl-pp-actions">';
    if (status === 'accepted' || status === 'friends') {
      html += '<button class="sl-btn sl-btn-secondary" data-pp-act="remove">Remove Friend</button>';
      html += '<button class="sl-btn sl-btn-primary" data-pp-act="message"><i class="fas fa-envelope"></i> Message</button>';
    } else if (status === 'pending_out') {
      html += '<button class="sl-btn sl-btn-secondary" data-pp-act="cancel">Cancel Request</button>';
      html += '<button class="sl-btn sl-btn-primary" data-pp-act="message"><i class="fas fa-envelope"></i> Message</button>';
    } else if (status === 'pending_in') {
      html += '<button class="sl-btn sl-btn-primary" data-pp-act="accept">Accept Request</button>';
      html += '<button class="sl-btn sl-btn-secondary" data-pp-act="decline">Decline</button>';
    } else {
      html += '<button class="sl-btn sl-btn-primary" data-pp-act="request"><i class="fas fa-user-plus"></i> Add Friend</button>';
      html += '<button class="sl-btn sl-btn-secondary" data-pp-act="message"><i class="fas fa-envelope"></i> Message</button>';
    }
    html += '</div>';
    return html;
  }

  function wireActions(u, status) {
    document.querySelectorAll('[data-pp-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = this.dataset.ppAct;
        var userId = u.id;
        var username = u.username;
        var origHTML = this.innerHTML;
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        var done = function (msg, refresh) {
          if (msg && window.SLToast) window.SLToast(msg, 2500, 'success');
          if (refresh) openPublicProfile(username || userId);
        };
        var fail = function (e) {
          if (window.SLToast) window.SLToast((e && e.message) || 'Failed', 2800, 'error');
          btn.disabled = false;
          btn.innerHTML = origHTML;
        };
        switch (act) {
          case 'request':
            SLApi.sendFriendRequest({ user_id: userId }).then(function () { done('Friend request sent', true); }).catch(fail);
            break;
          case 'cancel':
          case 'remove':
            SLApi.removeFriend(userId).then(function () { done(act === 'remove' ? 'Friend removed' : 'Request cancelled', true); }).catch(fail);
            break;
          case 'accept':
            SLApi.friendsPending().then(function (r) {
              var inc = (r && r.incoming) || [];
              var match = inc.filter(function (x) { return x.other_user_id === userId || x.requester_id === userId; })[0];
              if (!match) throw new Error('No pending request');
              return SLApi.acceptFriend(match.friendship_id);
            }).then(function () { done('Friend accepted 🎉', true); }).catch(fail);
            break;
          case 'decline':
            SLApi.friendsPending().then(function (r) {
              var inc = (r && r.incoming) || [];
              var match = inc.filter(function (x) { return x.other_user_id === userId || x.requester_id === userId; })[0];
              if (!match) throw new Error('No pending request');
              return SLApi.declineFriend(match.friendship_id);
            }).then(function () { done('Declined', true); }).catch(fail);
            break;
          case 'message':
            document.getElementById('slPublicProfile').classList.remove('active');
            document.body.style.overflow = '';
            window.location.href = '/messages.html?user=' + encodeURIComponent(userId);
            break;
        }
      });
    });
  }

  window.SLUserSearch = { openProfile: openPublicProfile };
})();

/* === js/sl-phase6e-actions.js === */
/* ============================================================
   SceneLink Phase 6E — UI for the three closed gaps
   - rename_list  → ✏️ button on each owned list card on profile.html
   - delete_checkin → 🗑 button on each check-in card on profile.html
   - block / unblock → button in the public profile modal (sl-user-search)
   - blocked-list view → "Blocked users" section in account-settings (lazy loaded)
   ============================================================
   Self-contained, idempotent, defensive. Runs after DOM ready on every page.
   ============================================================ */
(function () {
  'use strict';

  if (window.__sl_phase6e_loaded__) return;
  window.__sl_phase6e_loaded__ = true;

  // -------------------------------------------------------------
  // 1. Extend SLApi with the three new endpoints (idempotent)
  // -------------------------------------------------------------
  function extendApi() {
    if (!window.SLApi) return false;
    var Api = window.SLApi;

    // Reuse the API base + auth helpers via SLApi internals; if not exposed,
    // build a minimal request shim that mirrors the rest of sl-api.js style.
    var API_BASE = (window.SLConfig && (window.SLConfig.API_BASE_URL || window.SLConfig.API_URL)) ||
                   (window.SL_API_BASE) || '/api';

    function getToken() {
      try {
        return (Api.getToken && Api.getToken()) ||
               localStorage.getItem('sl_auth_token') ||
               localStorage.getItem('sl_jwt_token') ||
               null;
      } catch (_) { return null; }
    }

    function req(path, opts) {
      opts = opts || {};
      var headers = { 'Accept': 'application/json' };
      if (opts.body) headers['Content-Type'] = 'application/json';
      var tok = getToken();
      if (tok) headers['Authorization'] = 'Bearer ' + tok;
      return fetch(API_BASE + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: 'omit'
      }).then(function (r) {
        return r.text().then(function (t) {
          var data = null;
          try { data = t ? JSON.parse(t) : null; } catch(_){ data = { _raw: t }; }
          if (!r.ok) {
            var err = new Error((data && data.error) || ('HTTP ' + r.status));
            err.status = r.status;
            err.data = data;
            throw err;
          }
          return data;
        });
      });
    }

    if (!Api.renameList) {
      Api.renameList = function (listId, fields) {
        // fields: { name?, description? }
        return req('/lists/' + encodeURIComponent(listId), {
          method: 'PATCH',
          body: fields || {}
        });
      };
    }
    if (!Api.deleteCheckin) {
      Api.deleteCheckin = function (checkinId) {
        return req('/checkins/' + encodeURIComponent(checkinId), {
          method: 'DELETE'
        });
      };
    }
    if (!Api.blockUser) {
      Api.blockUser = function (userId, reason) {
        return req('/users/' + encodeURIComponent(userId) + '/block', {
          method: 'POST',
          body: { reason: reason || null }
        });
      };
    }
    if (!Api.unblockUser) {
      Api.unblockUser = function (userId) {
        return req('/users/' + encodeURIComponent(userId) + '/block', {
          method: 'DELETE'
        });
      };
    }
    if (!Api.listBlocked) {
      Api.listBlocked = function () {
        return req('/users/blocked');
      };
    }
    return true;
  }

  // -------------------------------------------------------------
  // 2. Tiny toast helper (uses SLToast if present, else console)
  // -------------------------------------------------------------
  function toast(msg, kind) {
    if (window.SLToast) { window.SLToast(msg, 2400, kind || 'success'); return; }
    if (window.SLNotifications && window.SLNotifications.success && (!kind || kind === 'success')) {
      window.SLNotifications.success(msg); return;
    }
    if (window.SLNotifications && window.SLNotifications.error && kind === 'error') {
      window.SLNotifications.error(msg); return;
    }
    // last-resort visible toast
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:' + (kind === 'error' ? '#7a1f1f' : '#1f5e3a') + ';' +
      'color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;z-index:99999;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.4);font-family:Inter,system-ui,sans-serif;';
    document.body.appendChild(el);
    setTimeout(function(){ el.style.transition='opacity .3s'; el.style.opacity='0'; }, 1900);
    setTimeout(function(){ el.remove(); }, 2400);
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // -------------------------------------------------------------
  // 3. Generic confirm/prompt modals (small, themed)
  // -------------------------------------------------------------
  function confirmModal(title, body, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'sl-p6e-overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;';
      ov.innerHTML =
        '<div style="background:#141414;border:1px solid rgba(212,175,55,0.25);border-radius:14px;max-width:420px;width:100%;padding:24px;font-family:Inter,system-ui,sans-serif;color:#fff;">' +
          '<h3 style="color:#D4AF37;margin:0 0 8px;font-size:18px;">' + escHtml(title) + '</h3>' +
          '<div style="color:rgba(255,255,255,0.75);font-size:14px;line-height:1.5;margin:0 0 20px;">' + (body || '') + '</div>' +
          '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
            '<button data-act="cancel" style="background:transparent;border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.8);padding:9px 16px;border-radius:8px;font-weight:600;cursor:pointer;">' + escHtml(opts.cancelText || 'Cancel') + '</button>' +
            '<button data-act="ok" style="background:' + (opts.danger ? '#b3261e' : 'linear-gradient(135deg,#D4AF37,#b8860b)') + ';color:' + (opts.danger ? '#fff' : '#000') + ';border:0;padding:9px 18px;border-radius:8px;font-weight:700;cursor:pointer;">' + escHtml(opts.okText || 'Confirm') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      function close(val) { ov.remove(); resolve(val); }
      ov.querySelector('[data-act="cancel"]').addEventListener('click', function(){ close(false); });
      ov.querySelector('[data-act="ok"]').addEventListener('click', function(){ close(true); });
      ov.addEventListener('click', function(e){ if (e.target === ov) close(false); });
    });
  }

  function promptModal(title, body, fields, opts) {
    opts = opts || {};
    // fields: [{ name, label, value, maxLength, multiline }]
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;';
      var inputsHtml = fields.map(function (f, i) {
        var cap = f.maxLength ? ' maxlength="' + f.maxLength + '"' : '';
        var input = f.multiline
          ? '<textarea data-fname="' + escHtml(f.name) + '" rows="3"' + cap + ' style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px 12px;color:#fff;font-size:14px;font-family:Inter,system-ui,sans-serif;resize:vertical;">' + escHtml(f.value || '') + '</textarea>'
          : '<input data-fname="' + escHtml(f.name) + '" type="text" value="' + escHtml(f.value || '') + '"' + cap + ' style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px 12px;color:#fff;font-size:14px;font-family:Inter,system-ui,sans-serif;">';
        return '<div style="margin-bottom:14px;">' +
                  '<label style="display:block;font-size:13px;color:rgba(255,255,255,0.65);margin-bottom:6px;">' + escHtml(f.label || f.name) + '</label>' +
                  input +
               '</div>';
      }).join('');
      ov.innerHTML =
        '<div style="background:#141414;border:1px solid rgba(212,175,55,0.25);border-radius:14px;max-width:440px;width:100%;padding:24px;font-family:Inter,system-ui,sans-serif;color:#fff;">' +
          '<h3 style="color:#D4AF37;margin:0 0 6px;font-size:18px;">' + escHtml(title) + '</h3>' +
          (body ? '<p style="color:rgba(255,255,255,0.65);font-size:13px;margin:0 0 16px;">' + escHtml(body) + '</p>' : '') +
          inputsHtml +
          '<div id="slP6eErr" style="color:#ff8a8a;font-size:13px;margin:-6px 0 12px;display:none;"></div>' +
          '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
            '<button data-act="cancel" style="background:transparent;border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.8);padding:9px 16px;border-radius:8px;font-weight:600;cursor:pointer;">Cancel</button>' +
            '<button data-act="ok" style="background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;border:0;padding:9px 18px;border-radius:8px;font-weight:700;cursor:pointer;">' + escHtml(opts.okText || 'Save') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      var first = ov.querySelector('[data-fname]');
      if (first) { setTimeout(function(){ first.focus(); first.select && first.select(); }, 50); }
      function close(val) { ov.remove(); resolve(val); }
      function showErr(msg) {
        var e = ov.querySelector('#slP6eErr');
        e.textContent = msg;
        e.style.display = msg ? '' : 'none';
      }
      ov.querySelector('[data-act="cancel"]').addEventListener('click', function(){ close(null); });
      ov.querySelector('[data-act="ok"]').addEventListener('click', function(){
        var out = {};
        for (var i=0;i<fields.length;i++){
          var el = ov.querySelector('[data-fname="' + fields[i].name + '"]');
          out[fields[i].name] = el ? el.value : '';
        }
        if (opts.validate) {
          var msg = opts.validate(out);
          if (msg) { showErr(msg); return; }
        }
        close(out);
      });
      ov.addEventListener('click', function(e){ if (e.target === ov) close(null); });
    });
  }

  // -------------------------------------------------------------
  // 4. RENAME LIST — enhance profile.html lists tab
  // -------------------------------------------------------------
  // Strategy: profile.html renders lists as <a href="my-lists.html#list=ID">…</a>.
  // We mutation-observe the lists tab container, and after each render we add a
  // small ✏️ pencil button overlay to each list card.
  function decorateListCards(scope) {
    scope = scope || document;
    var anchors = scope.querySelectorAll('a[href*="my-lists.html#list="]');
    anchors.forEach(function (a) {
      if (a.getAttribute('data-p6e-decorated')) return;
      a.setAttribute('data-p6e-decorated', '1');
      var m = (a.getAttribute('href') || '').match(/list=([^&]+)/);
      var listId = m && m[1];
      if (!listId) return;

      // Inject pencil button positioned in top-right
      a.style.position = a.style.position || 'relative';
      var btn = document.createElement('button');
      btn.className = 'sl-p6e-list-rename';
      btn.title = 'Rename list';
      btn.setAttribute('aria-label', 'Rename list');
      btn.innerHTML = '<i class="fas fa-pen"></i>';
      btn.style.cssText = 'position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.55);border:1px solid rgba(212,175,55,0.3);color:#D4AF37;width:30px;height:30px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;z-index:2;transition:background 0.15s;';
      btn.addEventListener('mouseenter', function(){ btn.style.background = 'rgba(212,175,55,0.18)'; });
      btn.addEventListener('mouseleave', function(){ btn.style.background = 'rgba(0,0,0,0.55)'; });
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        // Read current name + description from the card body
        var nameEl = a.querySelector('div[style*="color:#D4AF37"], div[style*="color: #D4AF37"]');
        var descEl = nameEl && nameEl.nextElementSibling;
        var currentName = (nameEl && nameEl.textContent || '').trim();
        var currentDesc = (descEl && descEl.textContent || '').trim();
        if (currentDesc === 'No description') currentDesc = '';

        promptModal('Rename list', '', [
          { name: 'name', label: 'Name', value: currentName, maxLength: 80 },
          { name: 'description', label: 'Description (optional)', value: currentDesc, maxLength: 500, multiline: true }
        ], {
          okText: 'Save',
          validate: function (v) {
            var n = (v.name || '').trim();
            if (!n) return 'Name is required';
            if (n.length > 80) return 'Name must be 80 characters or fewer';
            if ((v.description || '').length > 500) return 'Description must be 500 characters or fewer';
            return null;
          }
        }).then(function (vals) {
          if (!vals) return;
          window.SLApi.renameList(listId, { name: vals.name.trim(), description: (vals.description || '').trim() })
            .then(function (resp) {
              toast('List renamed');
              // Update the card text in place
              if (nameEl && resp && resp.list) {
                nameEl.textContent = resp.list.name || vals.name;
                if (descEl) descEl.textContent = resp.list.description || vals.description || 'No description';
              }
            })
            .catch(function (err) {
              if (err.status === 409) toast('You already have a list with that name', 'error');
              else if (err.status === 400) toast(err.message || 'Invalid name', 'error');
              else if (err.status === 404) toast('List not found', 'error');
              else toast(err.message || 'Could not rename list', 'error');
            });
        });
      });
      a.appendChild(btn);
    });
  }

  // -------------------------------------------------------------
  // 5. DELETE CHECKIN — enhance any checkin row that exposes a venue + id
  // -------------------------------------------------------------
  // The profile page renders check-ins via sl-profile-page.js; some markup
  // doesn't currently expose checkin IDs. Phase 6E approach: we expose the
  // delete affordance via a globally-installed delegated handler on any
  // element with [data-checkin-id] (we also patch any inline renderers that
  // we know of below).
  function decorateCheckinCards(scope) {
    scope = scope || document;
    var rows = scope.querySelectorAll('[data-checkin-id]');
    rows.forEach(function (row) {
      if (row.getAttribute('data-p6e-decorated')) return;
      row.setAttribute('data-p6e-decorated', '1');
      var checkinId = row.getAttribute('data-checkin-id');
      var ownerId = row.getAttribute('data-checkin-user-id');
      var meId = (window.SL_USER && window.SL_USER.id) ||
                 (window.SLApi && window.SLApi.getUser && window.SLApi.getUser() && window.SLApi.getUser().id);
      if (ownerId && meId && ownerId !== meId) return; // only show on own check-ins

      row.style.position = row.style.position || 'relative';
      var btn = document.createElement('button');
      btn.className = 'sl-p6e-checkin-delete';
      btn.title = 'Delete check-in';
      btn.setAttribute('aria-label', 'Delete check-in');
      btn.innerHTML = '<i class="fas fa-trash"></i>';
      btn.style.cssText = 'position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,90,90,0.45);color:#ff8a8a;width:30px;height:30px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;z-index:2;';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        confirmModal('Delete check-in?', 'This will permanently remove the check-in from your profile and decrement the venue\'s "going" count.', { okText: 'Delete', cancelText: 'Keep', danger: true })
          .then(function (ok) {
            if (!ok) return;
            window.SLApi.deleteCheckin(checkinId)
              .then(function () {
                toast('Check-in deleted');
                row.style.transition = 'opacity .25s, transform .25s';
                row.style.opacity = '0';
                row.style.transform = 'translateY(-6px)';
                setTimeout(function(){ row.remove(); }, 260);
              })
              .catch(function (err) {
                if (err.status === 404) toast('Check-in not found', 'error');
                else toast(err.message || 'Could not delete check-in', 'error');
              });
          });
      });
      row.appendChild(btn);
    });
  }

  // -------------------------------------------------------------
  // 6. BLOCK / UNBLOCK — enhance public profile modal
  // -------------------------------------------------------------
  // sl-user-search.js renders an action bar inside #slPPBody. We watch for the
  // modal becoming active, then decorate the bottom of the body with a Block
  // (or Unblock) button. We also re-decorate when the modal content changes.
  function decoratePublicProfile() {
    var modal = document.getElementById('slPublicProfile');
    if (!modal) return;
    var body = document.getElementById('slPPBody');
    if (!body || body.getAttribute('data-p6e-decorating')) return;

    // The page exposes the loaded user via window-scoped state managed by
    // sl-user-search.js. We don't have a direct hook, so we read from the DOM:
    // the username appears as "@..." below the display_name. We also grab the
    // user.id via a dataset attribute we set, falling back to API lookup.
    var unameEl = body.querySelector('div[style*="rgba(255,255,255,0.5)"]');
    if (!unameEl) return;
    var uname = (unameEl.textContent || '').replace(/^@/, '').trim();
    if (!uname) return;
    if (body.getAttribute('data-p6e-uname') === uname) return; // already decorated for this profile
    body.setAttribute('data-p6e-uname', uname);
    body.setAttribute('data-p6e-decorating', '1');

    // Look up user via the public profile endpoint (cheap; cached by sl-api?)
    window.SLApi.userByIdentifier(uname).then(function (r) {
      var u = (r && r.user) || r;
      if (!u || !u.id) return;
      var meId = (window.SL_USER && window.SL_USER.id);
      if (meId === u.id) return; // never on own profile

      // Check current block state
      window.SLApi.listBlocked().then(function (blockedResp) {
        var blocked = (blockedResp && blockedResp.blocked) || [];
        var isBlocked = blocked.some(function (b){ return b.id === u.id; });
        renderBlockButton(body, u, isBlocked);
      }).catch(function () {
        // If block-list lookup fails, still show Block (assume not blocked)
        renderBlockButton(body, u, false);
      });
    }).catch(function () {}).then(function () {
      body.removeAttribute('data-p6e-decorating');
    });
  }

  function renderBlockButton(body, u, isBlocked) {
    // Avoid duplicate
    var existing = body.querySelector('.sl-p6e-block-row');
    if (existing) existing.remove();

    var row = document.createElement('div');
    row.className = 'sl-p6e-block-row';
    row.style.cssText = 'margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;';
    row.innerHTML =
      '<button class="sl-p6e-block-btn" style="background:transparent;border:1px solid ' + (isBlocked ? 'rgba(212,175,55,0.45)' : 'rgba(255,90,90,0.45)') + ';color:' + (isBlocked ? '#D4AF37' : '#ff8a8a') + ';padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">' +
        '<i class="fas ' + (isBlocked ? 'fa-user-check' : 'fa-user-slash') + '"></i> ' +
        (isBlocked ? 'Unblock' : 'Block') +
      '</button>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:6px;">' +
        (isBlocked ? 'Unblocking restores friend requests, search visibility, and direct messages.' : 'Blocking hides this user from your search, prevents friend requests, and stops messages.') +
      '</div>';
    body.appendChild(row);

    var btn = row.querySelector('.sl-p6e-block-btn');
    btn.addEventListener('click', function () {
      if (isBlocked) {
        confirmModal('Unblock ' + (u.display_name || u.username) + '?', 'They\'ll be able to find you in search, send you friend requests, and message you again.', { okText: 'Unblock' })
          .then(function (ok) {
            if (!ok) return;
            window.SLApi.unblockUser(u.id)
              .then(function () {
                toast('Unblocked');
                renderBlockButton(body, u, false);
              })
              .catch(function (err) { toast(err.message || 'Could not unblock', 'error'); });
          });
      } else {
        confirmModal('Block ' + (u.display_name || u.username) + '?',
          '<div style="text-align:left;">' +
            'They won\'t be able to:<br>' +
            '&nbsp;• find you in search<br>' +
            '&nbsp;• send you friend requests<br>' +
            '&nbsp;• message you<br><br>' +
            'Any existing friendship will be ended. They will not be notified.' +
          '</div>',
          { okText: 'Block', danger: true })
          .then(function (ok) {
            if (!ok) return;
            window.SLApi.blockUser(u.id)
              .then(function () {
                toast('Blocked');
                renderBlockButton(body, u, true);
              })
              .catch(function (err) { toast(err.message || 'Could not block', 'error'); });
          });
      }
    });
  }

  // -------------------------------------------------------------
  // 7. Run + observe
  // -------------------------------------------------------------
  function runDecorators() {
    decorateListCards(document);
    decorateCheckinCards(document);
    var modal = document.getElementById('slPublicProfile');
    if (modal && modal.classList.contains('active')) {
      decoratePublicProfile();
    }
  }

  function start() {
    if (!extendApi()) {
      // SLApi not yet loaded — retry shortly
      return setTimeout(start, 200);
    }
    runDecorators();

    // Observe the body for any new list/checkin cards (profile tab swaps, async loads).
    var mo = new MutationObserver(function (muts) {
      var needRun = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) { needRun = true; break; }
        if (m.type === 'attributes') { needRun = true; break; }
      }
      if (needRun) {
        // Throttle
        clearTimeout(window.__sl_p6e_t);
        window.__sl_p6e_t = setTimeout(runDecorators, 80);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

/* === js/sl-profile-hydrate.js === */
/**
 * SceneLink — Real Profile Data Hydration
 * Overlays actual user data from /api/auth/me onto V2 profile page elements.
 * Non-destructive: only updates elements if they exist.
 */
(function() {
  'use strict';
  if (document.body && document.body.hasAttribute('data-sl-social-profile')) return;

  async function hydrateProfile() {
    if (!window.SLApi || !SLApi.isLoggedIn()) return;
    try {
      const data = await SLApi.me();
      const user = data.user || data;
      if (!user || !user.email) return;

      const name = user.display_name || user.username || user.email.split('@')[0];
      const email = user.email;
      const avatar = user.avatar_url || window.SL_AVATAR.local(name);
      const neighborhood = user.neighborhood || 'Boston';
      const city = user.city || 'Boston';
      const bio = user.bio || '';

      // Update common profile selectors
      const nameSelectors = [
        '.profile-name', '.user-name', '[data-user-name]',
        '#profile-name', '#user-name', '.profile-display-name'
      ];
      nameSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.tagName === 'INPUT') el.value = name;
          else el.textContent = name;
        });
      });

      const emailSelectors = [
        '.profile-email', '.user-email', '[data-user-email]',
        '#profile-email', '#user-email'
      ];
      emailSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.tagName === 'INPUT') el.value = email;
          else el.textContent = email;
        });
      });

      const avatarSelectors = [
        '.profile-avatar', '.user-avatar', '.avatar-img',
        '#profile-avatar', '[data-user-avatar]'
      ];
      avatarSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.tagName === 'IMG') el.src = avatar;
          else el.style.backgroundImage = `url(${avatar})`;
        });
      });

      const locationSelectors = [
        '.profile-location', '.user-location', '[data-user-location]'
      ];
      locationSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          el.textContent = `${neighborhood}, ${city}`;
        });
      });

      // Hydrate favorites count if element exists
      try {
        const favs = await SLApi.favorites();
        const list = favs.favorites || favs || [];
        const count = Array.isArray(list) ? list.length : 0;
        document.querySelectorAll(
          '[data-stat="favorites"], .stat-favorites .stat-value, .favorites-count'
        ).forEach(el => { el.textContent = count; });
      } catch(_) {}

      // Expose to window for other scripts
      window.SL_CURRENT_USER = user;
      document.dispatchEvent(new CustomEvent('sl-profile-hydrated', { detail: user }));
    } catch(err) {
      console.warn('[SL] Profile hydration skipped:', err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateProfile);
  } else {
    hydrateProfile();
  }
  // Re-run after auth change
  document.addEventListener('sl-auth-change', hydrateProfile);

  window.SLProfileHydrate = hydrateProfile;
})();

/* === js/sl-profile-page.js === */
/**
 * SceneLink — Profile Page Real Data Renderer
 * Only runs on profile.html. Renders real favorites/lists/plans/checkins from the backend.
 */
(function() {
    'use strict';
  if (document.body && document.body.hasAttribute('data-sl-social-profile')) return;

    // Only run on profile page
    const isProfilePage = /profile(-v2)?\.html/.test(window.location.pathname) ||
                         window.location.pathname === '/profile' ||
                         document.body.getAttribute('data-page') === 'profile';
    if (!isProfilePage && !document.querySelector('[data-profile-page], .profile-page')) {
        // Heuristic: if page has profile-container/profile-header element, assume profile page
        if (!document.querySelector('.profile-container, .profile-header, #profileContainer')) return;
    }

    async function render() {
        if (!window.SLApi || !window.SLApi.isLoggedIn()) {
            // Show logged-out prompt
            const container = document.querySelector('.profile-container, main, .profile-page');
            if (container && !container.querySelector('.sl-profile-locked')) {
                const prompt = document.createElement('div');
                prompt.className = 'sl-profile-locked';
                prompt.style.cssText = 'text-align:center;padding:80px 20px;color:#fff;background:#0a0a0a;min-height:60vh;';
                prompt.innerHTML =
                    '<div style="max-width:460px;margin:0 auto;background:#141414;padding:40px;border-radius:16px;border:1px solid rgba(212,175,55,0.2);">' +
                        '<i class="fas fa-user-lock" style="font-size:48px;color:#D4AF37;margin-bottom:20px;display:block;"></i>' +
                        '<h2 style="color:#D4AF37;margin-bottom:12px;">Sign in to view your profile</h2>' +
                        '<p style="color:rgba(255,255,255,0.7);margin-bottom:24px;">Log in to see your favorites, lists, plans, and check-ins.</p>' +
                        '<button class="sl-auth-trigger" style="background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;border:none;padding:12px 32px;border-radius:8px;font-weight:600;cursor:pointer;font-size:16px;">Log In / Sign Up</button>' +
                    '</div>';
                container.insertBefore(prompt, container.firstChild);
            }
            return;
        }

        try {
            const me = await window.SLApi.me();
            const user = me.user || me;
            const name = user.display_name || user.username || user.email.split('@')[0];
            const email = user.email;
            const avatar = user.avatar_url || window.SL_AVATAR.local(name);

            // ---- Hero info ----
            document.querySelectorAll('.profile-name,.user-name,#profileName,#userName,.profile-display-name')
                .forEach(el => {
                    if (el.tagName === 'INPUT') el.value = name; else el.textContent = name;
                });
            document.querySelectorAll('.profile-email,.user-email,#profileEmail')
                .forEach(el => { if (el.tagName === 'INPUT') el.value = email; else el.textContent = email; });
            document.querySelectorAll('.profile-avatar img,.user-avatar img,.avatar-img,#profileAvatar img').forEach(img => { img.src = avatar; });
            document.querySelectorAll('img.profile-avatar,img.user-avatar,img.avatar-img,img#profileAvatar').forEach(img => { img.src = avatar; });
            document.querySelectorAll('.profile-location,.user-location')
                .forEach(el => { el.textContent = `${user.neighborhood || 'Boston'}, ${user.city || 'MA'}`; });
            document.querySelectorAll('.profile-bio,.user-bio').forEach(el => {
                el.textContent = user.bio || 'Discovering the best of Boston one venue at a time.';
            });

            // ---- Fetch collections in parallel ----
            const [favRes, listsRes, plansRes, checkinsRes] = await Promise.allSettled([
                window.SLApi.favorites(),
                window.SLApi.lists(),
                window.SLApi.plans(),
                window.SLApi.myCheckins ? window.SLApi.myCheckins() : Promise.resolve({ checkins: [] })
            ]);

            const favorites = (favRes.value && (favRes.value.favorites || favRes.value)) || [];
            const lists = (listsRes.value && (listsRes.value.lists || listsRes.value)) || [];
            const plans = (plansRes.value && (plansRes.value.plans || plansRes.value)) || [];
            const checkins = (checkinsRes.value && (checkinsRes.value.checkins || checkinsRes.value)) || [];

            // ---- Stats ----
            const stats = {
                favorites: favorites.length,
                lists: lists.length,
                plans: plans.length,
                checkins: checkins.length || user.checkins_count || 0
            };
            document.querySelectorAll('[data-stat="favorites"],.stat-favorites .stat-value,.favorites-count').forEach(e => e.textContent = stats.favorites);
            document.querySelectorAll('[data-stat="lists"],.stat-lists .stat-value,.lists-count').forEach(e => e.textContent = stats.lists);
            document.querySelectorAll('[data-stat="plans"],.stat-plans .stat-value,.plans-count').forEach(e => e.textContent = stats.plans);
            document.querySelectorAll('[data-stat="checkins"],.stat-checkins .stat-value,.checkins-count').forEach(e => e.textContent = stats.checkins);

            // ---- Build a fresh Profile Summary panel at top of page ----
            let panel = document.getElementById('sl-profile-summary');
            if (!panel) {
                panel = document.createElement('section');
                panel.id = 'sl-profile-summary';
                panel.className = 'sl-profile-summary';
                panel.style.cssText = 'padding:40px 20px;background:linear-gradient(135deg,#0a0a0a 0%,#151515 100%);color:#fff;';
                // Prefer inserting after header
                const header = document.querySelector('header');
                if (header && header.nextSibling) {
                    header.parentNode.insertBefore(panel, header.nextSibling);
                } else {
                    document.body.insertBefore(panel, document.body.firstChild);
                }
            }
            panel.innerHTML =
                '<div style="max-width:1200px;margin:0 auto;display:flex;gap:24px;align-items:center;flex-wrap:wrap;">' +
                    '<img src="' + avatar + '" alt="' + name + '" style="width:96px;height:96px;border-radius:50%;border:3px solid #D4AF37;object-fit:cover;">' +
                    '<div style="flex:1;min-width:220px;">' +
                        '<h1 style="margin:0 0 4px;color:#D4AF37;font-size:28px;">' + name + '</h1>' +
                        '<div style="color:rgba(255,255,255,0.6);font-size:14px;">' + email + '</div>' +
                        '<div style="color:rgba(255,255,255,0.5);font-size:13px;margin-top:4px;"><i class="fas fa-map-marker-alt"></i> ' + (user.neighborhood || 'Boston') + ', ' + (user.city || 'MA') + '</div>' +
                    '</div>' +
                    '<div style="display:flex;gap:28px;flex-wrap:wrap;">' +
                        statBlock('Favorites', stats.favorites) +
                        statBlock('Lists', stats.lists) +
                        statBlock('Plans', stats.plans) +
                        statBlock('Check-ins', stats.checkins) +
                    '</div>' +
                    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
                        '<a href="/explore.html" style="padding:10px 20px;background:#D4AF37;color:#000;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none;"><i class="fas fa-compass"></i> Explore</a>' +
                        '<button id="sl-profile-logout-btn" onclick="(function(){if(window.SLApi)window.SLApi.logout();if(window.SLAuth)window.SLAuth.logout();localStorage.clear();window.location.href=\'/\';})();" style="padding:10px 20px;background:transparent;color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:13px;cursor:pointer;"><i class="fas fa-sign-out-alt"></i> Sign Out</button>' +
                    '</div>' +
                '</div>' +
                buildTabsHTML(favorites, lists, plans, checkins);

            bindTabs();

        } catch(err) {
            console.error('[sl-profile-page]', err);
        }
    }

    function statBlock(label, value) {
        return '<div style="text-align:center;min-width:72px;">' +
                 '<div style="font-size:28px;font-weight:700;color:#D4AF37;">' + value + '</div>' +
                 '<div style="font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:rgba(255,255,255,0.55);">' + label + '</div>' +
               '</div>';
    }

    function buildTabsHTML(favorites, lists, plans, checkins) {
        const tabs =
            '<div class="sl-pp-tabs" style="max-width:1200px;margin:32px auto 0;border-bottom:1px solid rgba(212,175,55,0.2);display:flex;gap:24px;flex-wrap:wrap;">' +
                '<button class="sl-pp-tab sl-active" data-tab="favorites" style="background:none;border:none;color:#D4AF37;padding:12px 4px;cursor:pointer;font-size:14px;font-weight:600;border-bottom:2px solid #D4AF37;">Favorites (' + favorites.length + ')</button>' +
                '<button class="sl-pp-tab" data-tab="lists" style="background:none;border:none;color:rgba(255,255,255,0.6);padding:12px 4px;cursor:pointer;font-size:14px;font-weight:600;border-bottom:2px solid transparent;">My Lists (' + lists.length + ')</button>' +
                '<button class="sl-pp-tab" data-tab="plans" style="background:none;border:none;color:rgba(255,255,255,0.6);padding:12px 4px;cursor:pointer;font-size:14px;font-weight:600;border-bottom:2px solid transparent;">Plans (' + plans.length + ')</button>' +
                '<button class="sl-pp-tab" data-tab="checkins" style="background:none;border:none;color:rgba(255,255,255,0.6);padding:12px 4px;cursor:pointer;font-size:14px;font-weight:600;border-bottom:2px solid transparent;">Check-ins (' + (checkins ? checkins.length : 0) + ')</button>' +
            '</div>' +
            '<div class="sl-pp-tab-content" data-tab="favorites" style="max-width:1200px;margin:0 auto;padding:24px 0;">' +
                renderFavorites(favorites) +
            '</div>' +
            '<div class="sl-pp-tab-content sl-hidden" data-tab="lists" style="max-width:1200px;margin:0 auto;padding:24px 0;display:none;">' +
                renderLists(lists) +
            '</div>' +
            '<div class="sl-pp-tab-content sl-hidden" data-tab="plans" style="max-width:1200px;margin:0 auto;padding:24px 0;display:none;">' +
                renderPlans(plans) +
            '</div>' +
            '<div class="sl-pp-tab-content sl-hidden" data-tab="checkins" style="max-width:1200px;margin:0 auto;padding:24px 0;display:none;">' +
                renderCheckins(checkins || []) +
            '</div>';
        return tabs;
    }

    function renderCheckins(items) {
        if (!items.length) return emptyState('📍', 'No check-ins yet', 'Check in at venues to track your nights out.', 'Find a Venue', 'explore.html');
        // Each row carries data-checkin-id so sl-phase6e-actions.js can attach a delete button.
        return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">' +
            items.map(c => {
                const venueName = (c.venue_name || 'Venue');
                const venueSlug = c.venue_slug || c.venue_id || '';
                const venueImg  = c.venue_image || '/assets/img/placeholder-venue.svg';
                const note = c.note ? c.note : '';
                const when = c.created_at ? new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
                const me = (window.SL_USER && window.SL_USER.id) || '';
                return '<div class="sl-checkin-card" data-checkin-id="' + c.id + '" data-checkin-user-id="' + me + '" style="background:#141414;border:1px solid rgba(212,175,55,0.15);border-radius:12px;padding:16px;color:#fff;position:relative;">' +
                    '<div style="display:flex;gap:12px;align-items:center;">' +
                        '<img src="' + venueImg + '" alt="" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex-shrink:0;" onerror="this.src=\'/assets/img/placeholder-venue.svg\'">' +
                        '<div style="flex:1;min-width:0;">' +
                            '<div style="font-weight:600;font-size:15px;color:#D4AF37;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + venueName + '</div>' +
                            '<div style="font-size:12px;color:rgba(255,255,255,0.5);">' + (c.venue_neighborhood || '') + (c.venue_neighborhood && when ? ' • ' : '') + when + '</div>' +
                        '</div>' +
                    '</div>' +
                    (note ? '<div style="margin-top:10px;font-size:13px;color:rgba(255,255,255,0.75);font-style:italic;line-height:1.4;">"' + note + '"</div>' : '') +
                '</div>';
            }).join('') +
        '</div>';
    }

    function renderFavorites(items) {
        if (!items.length) return emptyState('💛', 'No favorites yet', 'Tap the heart on any venue to save it here.', 'Explore Venues', 'explore.html');
        return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;">' +
            items.map(v =>
                '<a href="explore.html#venue=' + (v.slug || v.venue_id || v.id) + '" style="background:#141414;border:1px solid rgba(212,175,55,0.15);border-radius:12px;padding:16px;text-decoration:none;color:#fff;display:block;transition:transform 0.2s;">' +
                    '<div style="font-weight:600;margin-bottom:6px;color:#fff;">' + (v.name || v.venue_name || 'Venue') + '</div>' +
                    '<div style="font-size:12px;color:rgba(255,255,255,0.5);">' + (v.neighborhood || v.category || '') + '</div>' +
                '</a>'
            ).join('') +
        '</div>';
    }

    function renderLists(items) {
        if (!items.length) return emptyState('📋', 'No lists yet', 'Create your first collection of favorite spots.', 'Create a List', 'my-lists.html');
        return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">' +
            items.map(l =>
                '<a href="my-lists.html#list=' + l.id + '" style="background:#141414;border:1px solid rgba(212,175,55,0.15);border-radius:12px;padding:20px;text-decoration:none;color:#fff;display:block;">' +
                    '<div style="font-weight:600;font-size:16px;margin-bottom:4px;color:#D4AF37;">' + (l.name || 'Untitled') + '</div>' +
                    '<div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:8px;">' + (l.description || 'No description') + '</div>' +
                    '<div style="font-size:11px;color:rgba(255,255,255,0.4);"><i class="fas fa-map-marker-alt"></i> ' + (l.venue_count || 0) + ' venues</div>' +
                '</a>'
            ).join('') +
        '</div>';
    }

    function renderPlans(items) {
        if (!items.length) return emptyState('🗓️', 'No plans yet', 'Start planning your next night out with friends.', 'Create a Plan', 'plan-with-friends.html');
        return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">' +
            items.map(p =>
                '<a href="plan-with-friends.html#plan=' + p.id + '" style="background:#141414;border:1px solid rgba(212,175,55,0.15);border-radius:12px;padding:20px;text-decoration:none;color:#fff;display:block;">' +
                    '<div style="font-weight:600;font-size:16px;margin-bottom:4px;color:#D4AF37;">' + (p.name || 'Untitled Plan') + '</div>' +
                    '<div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:8px;"><i class="fas fa-calendar"></i> ' + (p.date ? new Date(p.date).toLocaleDateString() : 'No date') + '</div>' +
                    '<div style="font-size:11px;color:rgba(255,255,255,0.4);">' + (p.venue_count || 0) + ' venues</div>' +
                '</a>'
            ).join('') +
        '</div>';
    }

    function emptyState(emoji, title, subtitle, cta, ctaHref) {
        return '<div style="text-align:center;padding:48px 20px;color:#fff;">' +
                    '<div style="font-size:48px;margin-bottom:12px;">' + emoji + '</div>' +
                    '<div style="font-size:18px;color:#D4AF37;margin-bottom:6px;font-weight:600;">' + title + '</div>' +
                    '<div style="color:rgba(255,255,255,0.6);margin-bottom:20px;">' + subtitle + '</div>' +
                    '<a href="' + ctaHref + '" style="display:inline-block;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;">' + cta + '</a>' +
                '</div>';
    }

    function bindTabs() {
        document.querySelectorAll('.sl-pp-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const t = this.dataset.tab;
                document.querySelectorAll('.sl-pp-tab').forEach(b => {
                    const active = b.dataset.tab === t;
                    b.classList.toggle('sl-active', active);
                    b.style.color = active ? '#D4AF37' : 'rgba(255,255,255,0.6)';
                    b.style.borderBottomColor = active ? '#D4AF37' : 'transparent';
                });
                document.querySelectorAll('.sl-pp-tab-content').forEach(c => {
                    c.style.display = c.dataset.tab === t ? '' : 'none';
                });
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
    document.addEventListener('sl-auth-change', render);
})();

/* === js/sl-plan-fix.js === */
/**
 * SceneLink — Create Plan Real Backend Persistence
 * Intercepts PlanWithFriends.createPlan() + the submit form and persists
 * to /api/plans via SLApi.createPlan()
 */
(function() {
    'use strict';
    if (window.SL_CONNECTED_PLANS) return;

    const isPlanPage = /plan-with-friends/.test(window.location.pathname) ||
                     !!document.querySelector('[data-plan-page], .pwf-container, #pwfCreateBtn');
    if (!isPlanPage) return;

    // Wait for PlanWithFriends module to exist
    let tries = 0;
    const wait = setInterval(function() {
        tries++;
        if (window.PlanWithFriends && window.PlanWithFriends.createPlan) {
            clearInterval(wait);
            hook();
        } else if (tries > 40) {
            clearInterval(wait);
            hookFormOnly();
        }
    }, 100);

    function hook() {
        const original = window.PlanWithFriends.createPlan;
        window.PlanWithFriends.createPlan = function(data) {
            // Call original first (for UI state)
            const ret = original.apply(this, arguments);
            // Then persist to backend if logged in
            persistPlan(data);
            return ret;
        };
        // Also hook form submit as safety net
        hookFormOnly();
        console.log('[sl-plan-fix] Hooked PlanWithFriends.createPlan');
    }

    function hookFormOnly() {
        // Watch form submit as a fallback
        document.addEventListener('submit', function(e) {
            const form = e.target.closest('#pwfCreateForm, form[data-plan-form], form.pwf-create-form');
            if (!form) return;
            const data = readForm(form);
            if (data.title) persistPlan(data);
        }, true);
        // Also intercept clicks on "Create Plan" button if no form submit
        document.addEventListener('click', function(e) {
            const btn = e.target.closest('#pwfCreateSubmit, [data-plan-submit]');
            if (!btn) return;
            const form = btn.closest('form') || document.getElementById('pwfCreateForm');
            if (form) {
                setTimeout(function() {
                    const data = readForm(form);
                    if (data.title) persistPlan(data);
                }, 200);
            }
        });
    }

    function readForm(form) {
        function val(name) {
            const el = form.querySelector('[name="' + name + '"], #' + name);
            return el ? el.value.trim() : '';
        }
        return {
            title: val('title') || val('planTitle') || val('pwfTitle') || document.querySelector('#pwfCreateModal input[type="text"]')?.value,
            date: val('date') || val('planDate') || val('pwfDate'),
            time: val('time') || val('planTime') || val('pwfTime'),
            description: val('description') || val('planDesc') || val('pwfDesc'),
            venueName: val('venue') || val('venueName')
        };
    }

    async function persistPlan(data) {
        if (!window.SLApi || !window.SLApi.isLoggedIn()) {
            if (window.SLToast) window.SLToast('💡 Log in to save your plans across devices');
            return;
        }
        try {
            const payload = {
                name: data.title,
                date: data.date || null,
                description: data.description || (data.time ? 'Planned for ' + data.time : '')
            };
            const res = await window.SLApi.createPlan(payload.name, payload.date, payload.description);
            console.log('[sl-plan-fix] Plan saved to backend:', res);
            if (window.SLToast) window.SLToast('✅ Plan saved to your account');

            // If venue provided, try to attach it
            if (data.venueName && res.plan && res.plan.id) {
                // Look up venue by name
                try {
                    const vRes = await window.SLApi.venueSearch(data.venueName);
                    const venue = (vRes.venues || vRes || [])[0];
                    if (venue) await window.SLApi.addToPlan(res.plan.id, venue.id);
                } catch(_) {}
            }
        } catch(err) {
            console.warn('[sl-plan-fix] persist failed', err);
            if (window.SLToast) window.SLToast('⚠️ Plan saved locally but not synced: ' + err.message);
        }
    }
})();

/* === js/sl-venue-detail.js === */
/* One canonical venue detail on every page. API data is escaped; newer navigation wins. */
(function () {
  'use strict';
  let overlay, generation = 0, previousFocus, previousOverflow, openedId;
  const C = () => window.SLConnected, E = value => C().esc(value);
  function build() {
    if (overlay) return overlay;
    overlay = document.createElement('div'); overlay.id = 'sl-venue-detail'; overlay.className = 'sl-vd-overlay';
    overlay.innerHTML = '<section class="sl-connected" role="dialog" aria-modal="true" aria-label="Venue details" tabindex="-1"><button type="button" class="sl-secondary sl-vd-close" aria-label="Close venue details">Close</button><div class="sl-vd-content" aria-live="polite"></div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('.sl-vd-close')) close(); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      if (e.key === 'Tab') {
        const all = Array.from(overlay.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')).filter(el => !el.hidden);
        if (!all.length) return;
        if (e.shiftKey && document.activeElement === all[0]) { e.preventDefault(); all[all.length-1].focus(); }
        else if (!e.shiftKey && document.activeElement === all[all.length-1]) { e.preventDefault(); all[0].focus(); }
      }
    });
    return overlay;
  }
  function hide() {
    ++generation; openedId = null;
    if (overlay) overlay.classList.remove('sl-open');
    document.body.style.overflow = previousOverflow || '';
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }
  function close() {
    hide();
    const url = new URL(location.href);
    if (history.state && history.state.slVenue) { history.back(); return; }
    if (url.hash.startsWith('#venue=')) url.hash = '';
    url.searchParams.delete('venue'); url.searchParams.delete('venue_id');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  async function open(id, fromUrl) {
    if (!id || !window.SLVenueData) return;
    window.dispatchEvent(new CustomEvent('sl:explicit-modal'));
    const seq = ++generation; openedId = String(id); build();
    if (!overlay.classList.contains('sl-open')) { previousFocus = document.activeElement; previousOverflow = document.body.style.overflow; }
    overlay.classList.add('sl-open'); document.body.style.overflow = 'hidden';
    overlay.querySelector('.sl-vd-close').focus();
    const content = overlay.querySelector('.sl-vd-content'); content.textContent = 'Loading venue details…';
    if (!fromUrl) {
      const url = new URL(location.href); url.hash = 'venue=' + encodeURIComponent(id);
      if (history.state && history.state.slVenue) history.replaceState({slVenue:true},'',url.pathname + url.search + url.hash);
      else history.pushState({slVenue:true},'',url.pathname + url.search + url.hash);
    }
    try {
      const v = await window.SLVenueData.detail(id); if (seq !== generation) return;
      render(v, content); loadReviews(v.id, seq);
    } catch (e) {
      if (seq !== generation) return;
      content.innerHTML = '<h2>Venue details unavailable</h2><p>' + E(e.message) + '</p><button type="button" data-retry-venue>Retry</button>';
      content.querySelector('[data-retry-venue]').onclick = () => open(id, true);
    }
  }
  function field(label, value) { return '<div><dt>' + E(label) + '</dt><dd>' + E(value || 'Not provided') + '</dd></div>'; }
  function render(v, content) {
    const booking = v.booking || {}, website = C().safeUrl(v.website), directions = C().safeUrl(v.google_maps_url);
    // A provider URL is not an in-site reservation integration.
    const price = v.price_label || (Number.isInteger(v.price_level) && v.price_level > 0 && v.price_level < 5 ? '$'.repeat(v.price_level) : null);
    content.innerHTML = '<h1>' + E(v.name) + '</h1><p class="sl-muted">' + E([v.type,v.neighborhood || v.city].filter(Boolean).join(' · ')) + '</p>' +
      '<img class="sl-vd-image" src="' + E(v.thumbnail_url) + '" alt="' + E(v.thumbnail_url.includes('placeholder-') ? 'Venue photo unavailable' : v.name) + '">' +
      '<p>' + E(v.description || 'No venue description has been provided.') + '</p>' +
      '<dl class="sl-vd-fields">' + field('Address',[v.address,v.city,v.state,v.zip_code].filter(Boolean).join(', ')) + field('Hours',v.hours_display) + field('Phone',v.phone) + field('Price',price) + '</dl>' +
      '<p class="sl-muted">' + E(window.SLVenueData.sourceText(v)) + '</p>' +
      '<div class="sl-notice"><strong>No reservation has been made.</strong> SceneLink saves, plans and RSVPs do not book a table or buy a ticket. ' +
      'In-site reservations are unavailable for this venue. Availability, reservation requests and provider confirmations are not connected; nothing has been submitted. Booking will remain on SceneLink when a supported integration is available.</div>' +
      '<div class="sl-row">' +
      (website ? '<a class="sl-link-button sl-secondary" href="' + E(website) + '" target="_blank" rel="noopener noreferrer">Venue website ↗</a>' : '') +
      (directions ? '<a class="sl-link-button sl-secondary" href="' + E(directions) + '" target="_blank" rel="noopener noreferrer">Directions ↗</a>' : '') + '</div>' +
      '<div class="sl-row" style="margin-top:18px"><button type="button" data-save-venue>Save venue</button><a class="sl-link-button sl-secondary" href="/plan-with-friends?venue_id=' + encodeURIComponent(v.id) + '">Plan with friends</a><button type="button" class="sl-secondary" data-review-venue>Write a review</button></div>' +
      '<p data-venue-status role="status"></p><h2>Community reviews</h2><div data-venue-reviews>Loading submitted reviews…</div>';
    content.querySelector('[data-save-venue]').onclick = async function () {
      this.disabled = true; const button = this, current = generation, status = content.querySelector('[data-venue-status]');
      try { await C().once('save:' + v.id, () => C().request('/favorites/' + encodeURIComponent(v.id), {method:'POST'}));
        if (current !== generation) return; button.textContent = 'Saved to your account'; status.textContent = 'Venue saved. This is not a reservation.';
      } catch (e) { if (current === generation) { status.textContent = e.message; button.disabled = false; if(e.status===401 && window.SLAuthUI)window.SLAuthUI.open('login', button); } }
    };
    content.querySelector('[data-review-venue]').onclick = () => {
      if (window.SLReviewModal) window.SLReviewModal.open(v.id, v.name);
      else content.querySelector('[data-venue-status]').textContent = 'Reviews are unavailable. Please retry later.';
    };
  }
  async function loadReviews(id, seq) {
    try {
      const data = await C().request('/reviews?venue_id=' + encodeURIComponent(id)); if (seq !== generation) return;
      const reviews = data.reviews || data.items; if (!Array.isArray(reviews)) throw new Error('Reviews unavailable');
      const host = overlay.querySelector('[data-venue-reviews]');
      host.innerHTML = reviews.length ? reviews.map(r => '<article class="sl-item"><strong>' + E(r.display_name || r.username || 'SceneLink member') + '</strong>' +
        (Number(r.rating)>=1 && Number(r.rating)<=5 ? '<span> · ' + E(r.rating) + '/5</span>' : '') + '<p>' + E(r.content || r.body || '') + '</p></article>').join('') : '<p>No community reviews have been submitted.</p>';
    } catch (_) { if(seq===generation){const host=overlay.querySelector('[data-venue-reviews]');if(host)host.textContent='Community reviews are unavailable. No substitute reviews are shown.';} }
  }
  function fromLocation() {
    const url = new URL(location.href), match = url.hash.match(/^#venue=(.+)$/);
    let id;
    try { id = match ? decodeURIComponent(match[1]) : url.searchParams.get('venue') || url.searchParams.get('venue_id'); }
    catch (_) { if (openedId) hide(); return; } // Malformed external links must not break page initialization.
    if (id && id !== openedId && !/plan-with-friends/.test(location.pathname)) open(id, true);
    else if (!id && overlay && overlay.classList.contains('sl-open')) hide();
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-sl-action],.sl-vd-overlay,.sl-connected')) return;
    const trigger = e.target.closest('[data-open-venue],a[data-venue-slug],button[data-venue-slug]');
    if (trigger) { const id = trigger.dataset.openVenue || trigger.dataset.venueSlug; if (id) {e.preventDefault(); open(id);} }
  });
  window.addEventListener('popstate',fromLocation); window.addEventListener('hashchange',fromLocation);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fromLocation);else fromLocation();
  window.SLVenueDetail = {open,close};
})();

/* === js/sl-sync.js === */
/* ================================================================
   SceneLink Sync — mirrors localStorage favorites/lists into the
   backend whenever a logged-in user modifies them. On login, pulls
   server state down and merges with local.

   Non-destructive: V2 pages continue to use localStorage; this runs
   in the background to add server-side persistence for logged-in users.
   ================================================================ */
(function(){
  'use strict';
  if (!window.SLApi) return;

  // Storage keys the V2 frontend uses
  var FAV_KEY = 'sl_favorites';          // array of venue ids
  var LISTS_KEY = 'sl_lists';            // array of {id, name, items:[venueId]}

  function readFavs(){ try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch(e){ return []; } }
  function readLists(){ try { return JSON.parse(localStorage.getItem(LISTS_KEY)) || []; } catch(e){ return []; } }

  // Venue IDs in V2 are integers (1,2,3…) from hardcoded data.
  // Backend expects UUIDs. We'll do a best-effort sync using venue NAME matching.
  var _venueNameToId = null;
  async function venueNameToId(name){
    if (!_venueNameToId) {
      try {
        var r = await window.SLApi.venues();
        _venueNameToId = {};
        (r.venues || []).forEach(function(v){ _venueNameToId[v.name.toLowerCase()] = v.id; });
      } catch(e) { _venueNameToId = {}; }
    }
    return _venueNameToId[(name||'').toLowerCase()];
  }

  // Expose a helper V2 pages can call with a venue name
  window.SLSync = {
    favoriteByName: async function(venueName){
      if (!window.SLApi.isLoggedIn()) return null;
      try {
        var id = await venueNameToId(venueName);
        if (!id) return null;
        return await window.SLApi.toggleFavorite(id);
      } catch(e) { console.debug('SLSync.favoriteByName err', e); return null; }
    },
  };

  // Auto-hook: whenever the page toggles a heart/save button carrying [data-venue-name],
  // the click handler may fire our sync as well. We attach a capturing listener.
  document.addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== document) {
      if (t.matches && (t.matches('.heart-btn') || t.matches('[data-action="favorite"]') || t.classList && t.classList.contains('favorite-btn'))) {
        var name = t.getAttribute('data-venue-name') || (t.closest('[data-venue-name]') && t.closest('[data-venue-name]').getAttribute('data-venue-name'));
        if (name) window.SLSync.favoriteByName(name);
        return;
      }
      t = t.parentNode;
    }
  }, true);
})();

/* === js/sl-venue-images.js === */
/**
 * SceneLink Venue Image Curator
 * 
 * Maps venue type/cuisine/category → curated high-quality Unsplash images.
 * This provides visually distinctive, attractive imagery without Google Places API costs.
 * 
 * Strategy:
 * 1. Use venue.cover_image_url / venue.image_url if available (and not a generic default)
 * 2. Otherwise, deterministically pick a curated image based on venue characteristics
 * 3. Deterministic = same venue always gets same image (stable caching)
 */
(function(){
    'use strict';

    // High-quality, cuisine/category-specific Unsplash photos (CC0/free commercial use)
    // Organized by category → curated array. Each image is ~800px wide, optimized.
    var IMAGE_POOL = {
        // ─── Restaurants by cuisine ───
        italian: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        american: [
            '/assets/img/placeholder-event.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        japanese: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        sushi: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        chinese: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        mexican: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        thai: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        indian: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        french: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        mediterranean: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        seafood: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        steakhouse: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        pizza: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        cafe: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        coffee: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        bakery: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        dessert: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        icecream: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],

        // ─── Bars & Nightlife ───
        bar: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        cocktail: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        pub: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        brewery: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        wine: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        lounge: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        nightclub: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        club: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        rooftop: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],

        // ─── Music & Entertainment ───
        music: [
            '/assets/img/placeholder-event.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        livemusic: [
            '/assets/img/placeholder-event.svg',
            '/assets/img/placeholder-venue.svg'
        ],
        jazz: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-event.svg'
        ],
        venue: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-event.svg'
        ],

        // ─── Generic fallback (attractive Boston-vibe restaurant/bar) ───
        default: [
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg',
            '/assets/img/placeholder-venue.svg'
        ]
    };

    // Deterministic hash: same venue name → same image pick
    function hashName(str){
        var h = 0, s = String(str||'');
        for (var i = 0; i < s.length; i++){
            h = ((h << 5) - h) + s.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h);
    }

    function categorize(v){
        var hints = [
            v.cuisine, v.cuisine_type, v.type, v.category, v.subcategory,
            v.genre, v.vibe, v.name
        ].map(function(x){ return (x||'').toString().toLowerCase(); }).join(' ');

        // Specific cuisines first (more specific wins)
        if (/\b(sushi|ramen)\b/.test(hints)) return 'sushi';
        if (/\b(japanese)\b/.test(hints)) return 'japanese';
        if (/\b(italian|pasta|trattoria|osteria)\b/.test(hints)) return 'italian';
        if (/\b(pizza|pizzeria)\b/.test(hints)) return 'pizza';
        if (/\b(mexican|taco|taqueria|burrito)\b/.test(hints)) return 'mexican';
        if (/\b(thai)\b/.test(hints)) return 'thai';
        if (/\b(indian|curry|tandoor)\b/.test(hints)) return 'indian';
        if (/\b(chinese|dim sum|szechuan|cantonese)\b/.test(hints)) return 'chinese';
        if (/\b(french|brasserie|bistro)\b/.test(hints)) return 'french';
        if (/\b(mediterranean|greek|turkish|lebanese)\b/.test(hints)) return 'mediterranean';
        if (/\b(seafood|oyster|lobster)\b/.test(hints)) return 'seafood';
        if (/\b(steakhouse|steak house)\b/.test(hints)) return 'steakhouse';
        if (/\b(bakery|patisserie|pastries)\b/.test(hints)) return 'bakery';
        if (/\b(ice[-\s]?cream|gelato|creamery)\b/.test(hints)) return 'icecream';
        if (/\b(dessert)\b/.test(hints)) return 'dessert';
        if (/\b(coffee|espresso)\b/.test(hints)) return 'coffee';
        if (/\b(cafe|café)\b/.test(hints)) return 'cafe';

        // Nightlife categories
        if (/\b(nightclub|night_club|discoteca)\b/.test(hints)) return 'nightclub';
        if (/\b(rooftop)\b/.test(hints)) return 'rooftop';
        if (/\b(brewery|beer garden|taproom)\b/.test(hints)) return 'brewery';
        if (/\b(pub|tavern)\b/.test(hints)) return 'pub';
        if (/\b(wine bar|winery)\b/.test(hints)) return 'wine';
        if (/\b(cocktail|speakeasy)\b/.test(hints)) return 'cocktail';
        if (/\b(lounge)\b/.test(hints)) return 'lounge';
        if (/\b(jazz)\b/.test(hints)) return 'jazz';
        if (/\b(live[-\s]?music)\b/.test(hints)) return 'livemusic';
        if (/\b(music)\b/.test(hints)) return 'music';
        if (/\b(club)\b/.test(hints)) return 'club';
        if (/\b(bar)\b/.test(hints)) return 'bar';
        if (/\b(american|burger|diner|grill)\b/.test(hints)) return 'american';
        if (/\b(venue)\b/.test(hints)) return 'venue';
        if (/\b(restaurant)\b/.test(hints)) return 'american'; // restaurant default

        return 'default';
    }

    // Detect if an image URL is a generic stock fallback that should be replaced
    function isGenericFallback(url){
        if (!url) return true;
        // Old default fallback from various JS files
        if (url.indexOf('photo-1414235077428-338989a2e8c0') !== -1) return true;
        return false;
    }

    function pickImage(venue){
        if (!venue) return IMAGE_POOL.default[0];

        // Prefer existing real image if it's not the generic stock fallback.
        // thumbnail_url is the canonical field returned by /api/venues?view=card
        // (Phase 2D — resolves via Netlify /api/photo proxy to Google Places photos).
        var existing = venue.thumbnail_url || venue.cover_image_url || venue.image_url ||
                       (venue.image_urls && venue.image_urls[0]);
        if (existing && !isGenericFallback(existing)) return existing;

        // Otherwise pick deterministically from category pool
        var cat = categorize(venue);
        var pool = IMAGE_POOL[cat] || IMAGE_POOL.default;
        var idx = hashName(venue.name || venue.id || '') % pool.length;
        return pool[idx];
    }

    // Expose globally for all frontend pages
    window.SLVenueImages = {
        pick: pickImage,
        categorize: categorize,
        pool: IMAGE_POOL
    };
})();

/* === js/sl-analytics.js === */
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

/* === js/sl-capacitor-bridge.js === */
/**
 * SL Capacitor Bridge — runs only inside the native iOS/Android shell.
 *
 * Wires up:
 *   - Push notifications registration → /api/push/register-token
 *   - Status bar style
 *   - Deep-link / Universal Link handling
 *   - Back button behavior on Android
 *   - Network status listener
 *   - App lifecycle hooks (refresh token on resume)
 *
 * Gracefully no-ops in web browsers.
 */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) {
    // web — expose empty shim so other scripts can `if (window.SLNative)` without crashing
    window.SLNative = { isNative: false };
    return;
  }

  document.documentElement.classList.add('sl-native');
  document.body && document.body.classList.add('sl-native');

  var SLNative = {
    isNative: true,
    platform: Cap.getPlatform && Cap.getPlatform(),
    ready: false,
    pushToken: null,
    appVersion: null
  };
  window.SLNative = SLNative;

  function getAppVersion() {
    try {
      return Cap.Plugins && Cap.Plugins.App && Cap.Plugins.App.getInfo().then(function (info) {
        SLNative.appVersion = info && (info.version || info.build);
        return SLNative.appVersion;
      });
    } catch (_) { return Promise.resolve(null); }
  }

  // ── Status bar (keep dark) ───────────────────────────────────────
  try {
    if (Cap.Plugins && Cap.Plugins.StatusBar) {
      var S = Cap.Plugins.StatusBar;
      S.setStyle && S.setStyle({ style: 'DARK' }).catch(() => {});
      S.setBackgroundColor && S.setBackgroundColor({ color: '#0a0a0a' }).catch(() => {});
      S.setOverlaysWebView && S.setOverlaysWebView({ overlay: false }).catch(() => {});
    }
  } catch (_) {}

  // ── Push notifications ───────────────────────────────────────────
  function registerPush() {
    var P = Cap.Plugins && Cap.Plugins.PushNotifications;
    if (!P) return;

    P.requestPermissions().then(function (result) {
      if (result && (result.receive === 'granted' || result.receive === 'prompt-with-rationale')) {
        P.register();
      } else {
        console.log('[native] push permission denied');
      }
    }).catch((e) => console.warn('[native] push perm err', e));

    P.addListener('registration', function (token) {
      var raw = token && (token.value || token.token);
      if (!raw) return;
      SLNative.pushToken = raw;
      var platform = SLNative.platform === 'ios' ? 'ios' : 'android';

      function sendTokenWhenReady() {
        if (window.SLApi && window.SLApi.registerPushToken) {
          var tok = null;
          try { tok = localStorage.getItem('sl_jwt_token'); } catch (_){}
          if (!tok) return; // wait for user to sign in
          window.SLApi.registerPushToken(raw, platform, Cap.DeviceId || null, SLNative.appVersion)
            .then(() => console.log('[native] push token registered'))
            .catch((e) => console.warn('[native] push register err', e.message));
        } else {
          setTimeout(sendTokenWhenReady, 400);
        }
      }
      sendTokenWhenReady();
      // Also send when user signs in later
      window.addEventListener('sl-auth-ready', sendTokenWhenReady, { once: true });
    });

    P.addListener('registrationError', function (err) {
      console.warn('[native] push registration error', err);
    });

    // Foreground: show native-ish toast instead of system notification
    P.addListener('pushNotificationReceived', function (n) {
      var title = (n && (n.title || (n.notification && n.notification.title))) || 'SceneLink';
      var body  = (n && (n.body  || (n.notification && n.notification.body)))  || '';
      if (window.SLToast) window.SLToast(title + (body ? ' — ' + body : ''), 3500, 'success');
    });

    // Tap action: navigate
    P.addListener('pushNotificationActionPerformed', function (a) {
      var data = (a && a.notification && a.notification.data) || {};
      if (data.url) location.href = data.url;
      else if (data.type === 'message' && data.user_id) location.href = '/messages.html?user=' + data.user_id;
      else if (data.type === 'friend_request') location.href = '/profile.html#friends';
      else if (data.type === 'plan_invite') location.href = '/plan-with-friends.html';
    });
  }

  // Re-register push token on logout/delete-account
  SLNative.unregisterPush = function () {
    if (!SLNative.pushToken) return Promise.resolve();
    if (window.SLApi && window.SLApi.unregisterPushToken) {
      return window.SLApi.unregisterPushToken(SLNative.pushToken).catch(() => {});
    }
    return Promise.resolve();
  };
  window.SLPush = { unregister: SLNative.unregisterPush };

  // ── Deep links (scenelink://... or https://scenelink.app/...) ────
  try {
    var A = Cap.Plugins && Cap.Plugins.App;
    if (A && A.addListener) {
      A.addListener('appUrlOpen', function (event) {
        if (!event || !event.url) return;
        try {
          var u = new URL(event.url);
          // Translate web URL or custom scheme to an in-app path
          var path = u.pathname + (u.search || '') + (u.hash || '');
          if (path && path !== location.pathname + location.search + location.hash) {
            location.href = path;
          }
        } catch (_) {}
      });
    }
  } catch (_) {}

  // ── Android back button ──────────────────────────────────────────
  try {
    var A2 = Cap.Plugins && Cap.Plugins.App;
    if (A2 && A2.addListener && SLNative.platform === 'android') {
      A2.addListener('backButton', function () {
        if (history.length > 1) history.back();
        else A2.exitApp();
      });
    }
  } catch (_) {}

  // ── Network listener (optional — shows toast) ────────────────────
  try {
    var N = Cap.Plugins && Cap.Plugins.Network;
    if (N && N.addListener) {
      N.addListener('networkStatusChange', function (s) {
        if (!s.connected && window.SLToast) window.SLToast('Offline — some features limited', 2500, 'error');
        else if (s.connected && window.SLToast) window.SLToast('Back online', 1800, 'success');
      });
    }
  } catch (_) {}

  // ── App resume: re-check auth ────────────────────────────────────
  try {
    var A3 = Cap.Plugins && Cap.Plugins.App;
    if (A3 && A3.addListener) {
      A3.addListener('appStateChange', function (state) {
        if (state && state.isActive && window.SLApi && window.SLApi.me) {
          window.SLApi.me().catch(() => {});
        }
      });
    }
  } catch (_) {}

  // Kick off
  getAppVersion().finally(function () {
    SLNative.ready = true;
    registerPush();
    window.dispatchEvent(new CustomEvent('sl-native-ready', { detail: SLNative }));
  });
})();

/* === js/sl-pwa-boot.js === */
/**
 * SL PWA Boot — service worker registration + update prompt
 * Registers /sw.js, listens for updates, shows a non-intrusive "Update available" toast.
 */
(function () {
  if (window.__SL_PWA_BOOT__) return;
  window.__SL_PWA_BOOT__ = true;

  if (!('serviceWorker' in navigator)) return;
  // Skip in Capacitor native — it uses its own asset serving
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;

  function showUpdateToast(registration) {
    if (document.getElementById('sl-pwa-update-toast')) return;
    var t = document.createElement('div');
    t.id = 'sl-pwa-update-toast';
    t.style.cssText = [
      'position:fixed;left:50%;transform:translateX(-50%);z-index:999999;',
      'background:#0d0d0d;color:#fff;border:1px solid #D4AF37;border-radius:12px;',
      'padding:12px 18px;box-shadow:0 8px 28px rgba(0,0,0,0.5);',
      'font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      'display:flex;align-items:center;gap:12px;max-width:420px;',
      'bottom:calc(80px + env(safe-area-inset-bottom, 0px));'
    ].join('');
    t.innerHTML =
      '<span style="flex:1;">A new version of SceneLink is available.</span>' +
      '<button id="sl-pwa-refresh" style="background:#D4AF37;color:#000;border:none;padding:8px 14px;border-radius:8px;font-weight:600;cursor:pointer;">Refresh</button>' +
      '<button id="sl-pwa-dismiss" style="background:transparent;color:rgba(255,255,255,0.55);border:none;padding:8px;cursor:pointer;font-size:18px;">×</button>';
    document.body.appendChild(t);
    document.getElementById('sl-pwa-refresh').addEventListener('click', function () {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      location.reload();
    });
    document.getElementById('sl-pwa-dismiss').addEventListener('click', function () {
      try { t.remove(); } catch(_){}
    });
  }

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (reg) {
      // When a new SW is waiting, prompt
      if (reg.waiting) showUpdateToast(reg);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(reg);
          }
        });
      });
    }).catch(function (e) {
      console.warn('[pwa] SW register failed', e.message);
    });

    // Reload when controller changes (after skipWaiting)
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  });

  // ── Install prompt (Add to Home Screen) ─────────────────────────────
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    // Expose programmatic install
    window.SLInstallPrompt = {
      available: true,
      show: function () {
        if (!deferredPrompt) return Promise.resolve('unavailable');
        deferredPrompt.prompt();
        return deferredPrompt.userChoice.then(function (r) {
          deferredPrompt = null;
          window.SLInstallPrompt.available = false;
          return r.outcome;
        });
      }
    };
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    if (window.SLInstallPrompt) window.SLInstallPrompt.available = false;
    console.log('[pwa] installed');
  });
})();

/* === js/sl-report-modal.js === */
/**
 * SL Report Modal — UGC moderation required by App Store Guideline 1.2
 *
 * Usage (from any button):
 *   <button data-action="report" data-target-type="post" data-target-id="{uuid}">Report</button>
 *
 * Or programmatically:
 *   window.SLReportModal.open('post', '<uuid>', { label: 'this post' });
 *
 * Reasons map 1:1 to backend CHECK constraint.
 */
(function () {
  if (window.__SL_REPORT_MODAL__) return;
  window.__SL_REPORT_MODAL__ = true;

  var REASONS = [
    { k: 'spam',           l: 'Spam or scam' },
    { k: 'harassment',     l: 'Harassment or bullying' },
    { k: 'hate_speech',    l: 'Hate speech' },
    { k: 'violence',       l: 'Violence or threats' },
    { k: 'sexual_content', l: 'Sexual or explicit content' },
    { k: 'misinformation', l: 'Misinformation' },
    { k: 'illegal',        l: 'Illegal activity' },
    { k: 'impersonation',  l: 'Impersonation' },
    { k: 'self_harm',      l: 'Self-harm or suicide' },
    { k: 'other',          l: 'Something else' }
  ];

  function esc(s) { return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  function injectStyle() {
    if (document.getElementById('sl-report-modal-style')) return;
    var s = document.createElement('style');
    s.id = 'sl-report-modal-style';
    s.textContent = [
      '.sl-rep-ov{position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:99999;',
      ' display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);}',
      '.sl-rep-m{background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:16px;',
      ' width:100%;max-width:440px;max-height:90vh;overflow-y:auto;padding:26px;color:#fff;',
      ' font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.sl-rep-m h3{margin:0 0 6px 0;font-size:18px;color:#fff;}',
      '.sl-rep-m p.sl-rep-sub{color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 18px 0;}',
      '.sl-rep-m .sl-rep-row{display:flex;align-items:center;gap:10px;padding:12px 14px;',
      ' border:1px solid rgba(255,255,255,0.1);border-radius:10px;margin-bottom:8px;cursor:pointer;',
      ' transition:all 0.15s;}',
      '.sl-rep-m .sl-rep-row:hover{border-color:#D4AF37;background:rgba(212,175,55,0.06);}',
      '.sl-rep-m .sl-rep-row.sel{border-color:#D4AF37;background:rgba(212,175,55,0.1);}',
      '.sl-rep-m .sl-rep-row input{margin:0;}',
      '.sl-rep-m .sl-rep-row label{flex:1;cursor:pointer;font-size:14px;color:#fff;}',
      '.sl-rep-m textarea{width:100%;background:#0a0a0a;border:1px solid rgba(255,255,255,0.15);',
      ' color:#fff;border-radius:8px;padding:10px;font:inherit;font-size:13px;min-height:70px;',
      ' resize:vertical;margin:14px 0 6px 0;box-sizing:border-box;}',
      '.sl-rep-m textarea:focus{outline:none;border-color:#D4AF37;}',
      '.sl-rep-m .sl-rep-actions{display:flex;gap:10px;margin-top:18px;}',
      '.sl-rep-m .sl-rep-btn{flex:1;padding:12px;border-radius:10px;font-weight:600;',
      ' font-size:14px;cursor:pointer;border:none;transition:all 0.15s;}',
      '.sl-rep-m .sl-rep-btn.ghost{background:transparent;color:rgba(255,255,255,0.6);',
      ' border:1px solid rgba(255,255,255,0.15);}',
      '.sl-rep-m .sl-rep-btn.ghost:hover{color:#fff;border-color:rgba(255,255,255,0.3);}',
      '.sl-rep-m .sl-rep-btn.primary{background:#e53935;color:#fff;}',
      '.sl-rep-m .sl-rep-btn.primary:hover{background:#c62828;}',
      '.sl-rep-m .sl-rep-btn.primary:disabled{opacity:0.4;cursor:not-allowed;}',
      '.sl-rep-err{color:#e57373;font-size:13px;margin-top:8px;}',
      '.sl-rep-ok{color:#81c784;font-size:13px;margin-top:8px;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function toast(msg, kind) {
    if (window.SLToast) return window.SLToast(msg, 2800, kind || 'success');
    // fallback
    try { console.log('[report]', kind || '', msg); } catch(_){}
  }

  function open(targetType, targetId, opts) {
    opts = opts || {};
    if (!targetType || !targetId) return;

    // Require login
    var tok = null;
    try { tok = localStorage.getItem('sl_jwt_token'); } catch(_) {}
    if (!tok) {
      if (window.SLAuthOpen) window.SLAuthOpen();
      else toast('Sign in to report content', 'error');
      return;
    }

    injectStyle();

    // Remove any existing modal
    var prev = document.getElementById('slReportOverlay');
    if (prev) prev.remove();

    var subject = opts.label || (targetType + ' content');

    var ov = document.createElement('div');
    ov.className = 'sl-rep-ov';
    ov.id = 'slReportOverlay';
    ov.innerHTML =
      '<div class="sl-rep-m" role="dialog" aria-modal="true" aria-labelledby="slRepTitle">' +
        '<h3 id="slRepTitle">Report ' + esc(subject) + '</h3>' +
        '<p class="sl-rep-sub">Help us keep SceneLink safe. Your report is anonymous to the person being reported.</p>' +
        '<div id="slRepReasons">' +
          REASONS.map(function (r) {
            return '<div class="sl-rep-row" data-k="' + r.k + '">' +
              '<input type="radio" name="slRepReason" id="slr_' + r.k + '" value="' + r.k + '">' +
              '<label for="slr_' + r.k + '">' + esc(r.l) + '</label>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<textarea id="slRepDetails" placeholder="Optional — add more context (max 1000 chars)" maxlength="1000"></textarea>' +
        '<div id="slRepErr" class="sl-rep-err" style="display:none;"></div>' +
        '<div class="sl-rep-actions">' +
          '<button class="sl-rep-btn ghost" id="slRepCancel">Cancel</button>' +
          '<button class="sl-rep-btn primary" id="slRepSubmit" disabled>Submit report</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';

    function close() {
      try { ov.remove(); } catch(_) {}
      document.body.style.overflow = '';
    }

    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.getElementById('slRepCancel').addEventListener('click', close);

    var chosen = null;
    ov.querySelectorAll('.sl-rep-row').forEach(function (row) {
      row.addEventListener('click', function () {
        chosen = row.dataset.k;
        ov.querySelectorAll('.sl-rep-row').forEach(function (r) { r.classList.remove('sel'); });
        row.classList.add('sel');
        var radio = row.querySelector('input[type=radio]');
        if (radio) radio.checked = true;
        document.getElementById('slRepSubmit').disabled = false;
      });
    });

    document.getElementById('slRepSubmit').addEventListener('click', function () {
      if (!chosen) return;
      var err = document.getElementById('slRepErr');
      err.style.display = 'none';
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Submitting…';
      var details = (document.getElementById('slRepDetails').value || '').trim().slice(0, 1000);

      window.SLApi.reportContent(targetType, targetId, chosen, details).then(function (r) {
        close();
        if (r && r.already_reported) {
          toast('Already reported — thanks for letting us know.', 'success');
        } else {
          toast('Report submitted. Our team will review it shortly.', 'success');
        }
      }).catch(function (e) {
        err.textContent = (e && e.message) || 'Could not submit report';
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Submit report';
      });
    });
  }

  // Delegated click for any [data-action="report"]
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-action="report"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    open(btn.dataset.targetType, btn.dataset.targetId, { label: btn.dataset.targetLabel });
  });

  window.SLReportModal = { open: open };
})();

/* === js/sl-account-settings.js === */
/**
 * SL Account Settings — auto-injects "Danger Zone" section with Delete My Account
 * on profile.html. Required for App Store compliance (Guideline 5.1.1(v)).
 *
 * The button opens a confirmation modal that requires password re-entry
 * (or skips password for OAuth accounts).
 */
(function () {
  if (window.__SL_ACCOUNT_SETTINGS__) return;
  window.__SL_ACCOUNT_SETTINGS__ = true;

  // Only run on profile page (and only for signed-in users)
  function isProfilePage() {
    var p = (location.pathname || '').toLowerCase();
    return p.endsWith('/profile.html') || p === '/profile' || p.endsWith('/profile/');
  }

  function esc(s) { return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  function injectStyle() {
    if (document.getElementById('sl-account-settings-style')) return;
    var s = document.createElement('style');
    s.id = 'sl-account-settings-style';
    s.textContent = [
      '.sl-acct-settings{margin:32px auto 48px;max-width:960px;padding:0 20px;}',
      '.sl-acct-card{background:#0d0d0d;border:1px solid rgba(255,255,255,0.08);',
      ' border-radius:14px;padding:22px;}',
      '.sl-acct-card h3{margin:0 0 6px 0;font-size:16px;color:#fff;}',
      '.sl-acct-card p{margin:0 0 16px 0;color:rgba(255,255,255,0.55);font-size:13px;}',
      '.sl-acct-danger{border-color:rgba(229,57,53,0.35);}',
      '.sl-acct-danger h3{color:#ff8a80;}',
      '.sl-acct-btn{background:transparent;color:#ff8a80;border:1px solid rgba(229,57,53,0.4);',
      ' padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;',
      ' transition:all 0.15s;}',
      '.sl-acct-btn:hover{background:rgba(229,57,53,0.1);border-color:#e53935;color:#fff;}',
      '.sl-acct-btn.neutral{color:rgba(255,255,255,0.7);border-color:rgba(255,255,255,0.2);}',
      '.sl-acct-btn.neutral:hover{color:#fff;border-color:#D4AF37;}',
      '.sl-acct-ov{position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;',
      ' display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);}',
      '.sl-acct-m{background:#111;border:1px solid rgba(229,57,53,0.3);border-radius:16px;',
      ' width:100%;max-width:460px;padding:28px;color:#fff;',
      ' font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.sl-acct-m h2{margin:0 0 10px 0;font-size:20px;color:#ff8a80;}',
      '.sl-acct-m p{margin:0 0 16px 0;color:rgba(255,255,255,0.75);font-size:14px;line-height:1.5;}',
      '.sl-acct-m ul{margin:0 0 18px 20px;padding:0;color:rgba(255,255,255,0.65);font-size:13px;}',
      '.sl-acct-m ul li{margin-bottom:4px;}',
      '.sl-acct-m input[type=password]{width:100%;background:#0a0a0a;',
      ' border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:8px;padding:12px;',
      ' font-size:14px;box-sizing:border-box;margin-bottom:10px;}',
      '.sl-acct-m input[type=password]:focus{outline:none;border-color:#D4AF37;}',
      '.sl-acct-m input[type=text]{width:100%;background:#0a0a0a;',
      ' border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:8px;padding:12px;',
      ' font-size:14px;box-sizing:border-box;margin-bottom:10px;}',
      '.sl-acct-m textarea{width:100%;background:#0a0a0a;border:1px solid rgba(255,255,255,0.15);',
      ' color:#fff;border-radius:8px;padding:10px;font:inherit;font-size:13px;min-height:60px;',
      ' resize:vertical;box-sizing:border-box;margin-bottom:10px;}',
      '.sl-acct-m .sl-acct-actions{display:flex;gap:10px;margin-top:12px;}',
      '.sl-acct-m .sl-acct-actions button{flex:1;padding:12px;border-radius:10px;',
      ' font-weight:600;font-size:14px;cursor:pointer;border:none;}',
      '.sl-acct-m .sl-acct-actions .cancel{background:transparent;color:rgba(255,255,255,0.7);',
      ' border:1px solid rgba(255,255,255,0.15);}',
      '.sl-acct-m .sl-acct-actions .confirm{background:#e53935;color:#fff;}',
      '.sl-acct-m .sl-acct-actions .confirm:disabled{opacity:0.35;cursor:not-allowed;}',
      '.sl-acct-err{color:#e57373;font-size:13px;margin:6px 0 12px;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function openDeleteModal(isOAuth) {
    injectStyle();
    var prev = document.getElementById('slAcctDelOverlay');
    if (prev) prev.remove();

    var pwField =
      '<p style="font-size:12px;color:rgba(255,255,255,0.6);">Password confirmation is required, including accounts created with Google or Apple. If you have not set a SceneLink password, use email recovery first, then sign in again.</p>' +
      '<button type="button" id="slAcctRecover" style="background:none;border:none;color:#D4AF37;text-decoration:underline;cursor:pointer;margin-bottom:12px">Set or recover my password</button>' +
      '<label style="font-size:12px;color:rgba(255,255,255,0.6);display:block;margin-bottom:6px;">Re-enter password</label>' +
      '<input type="password" id="slAcctPw" placeholder="Your password" autocomplete="current-password">';

    var ov = document.createElement('div');
    ov.className = 'sl-acct-ov';
    ov.id = 'slAcctDelOverlay';
    ov.innerHTML =
      '<div class="sl-acct-m" role="dialog" aria-modal="true" aria-labelledby="slAcctDelTitle">' +
        '<h2 id="slAcctDelTitle">Delete your account?</h2>' +
        '<p>This is permanent and cannot be undone. The following will be deleted:</p>' +
        '<ul>' +
          '<li>Your profile, posts, reviews, and check-ins</li>' +
          '<li>Your friends, messages, and conversation history</li>' +
          '<li>Your plans and all plan invitations</li>' +
          '<li>Your notifications and push-token registrations</li>' +
        '</ul>' +
        '<p style="font-size:12px;color:rgba(255,255,255,0.5);">Type <b style="color:#ff8a80;">DELETE</b> to confirm.</p>' +
        '<input type="text" id="slAcctConfirm" placeholder="Type DELETE to confirm" autocomplete="off">' +
        pwField +
        '<label style="font-size:12px;color:rgba(255,255,255,0.6);display:block;margin-bottom:6px;margin-top:6px;">Reason (optional — helps us improve)</label>' +
        '<textarea id="slAcctReason" maxlength="500" placeholder="Why are you leaving?"></textarea>' +
        '<div id="slAcctErr" class="sl-acct-err" style="display:none;"></div>' +
        '<div class="sl-acct-actions">' +
          '<button class="cancel" id="slAcctCancel">Keep my account</button>' +
          '<button class="confirm" id="slAcctConfirmBtn" disabled>Delete permanently</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';

    function close() {
      try { ov.remove(); } catch(_){}
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e){ if(e.key==='Escape') close(); }
    document.addEventListener('keydown', onKey);
    document.getElementById('slAcctRecover').addEventListener('click', function(){
      close();
      if(window.SLAuthUI && window.SLAuthUI.open) window.SLAuthUI.open('forgot');
    });

    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.getElementById('slAcctCancel').addEventListener('click', close);

    var confirmInput = document.getElementById('slAcctConfirm');
    var pwInput = document.getElementById('slAcctPw');
    var confirmBtn = document.getElementById('slAcctConfirmBtn');

    function checkReady() {
      var typed = (confirmInput.value || '').trim() === 'DELETE';
      var pwOk = !!(pwInput && pwInput.value.length >= 1);
      confirmBtn.disabled = !(typed && pwOk);
    }
    confirmInput.addEventListener('input', checkReady);
    if (pwInput) pwInput.addEventListener('input', checkReady);

    var deleting = false;
    confirmBtn.addEventListener('click', function () {
      if(deleting || confirmBtn.disabled) return;
      deleting = true;
      var err = document.getElementById('slAcctErr');
      err.style.display = 'none';
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting…';
      var pw = pwInput ? pwInput.value : '';
      var reason = (document.getElementById('slAcctReason').value || '').trim().slice(0, 500);

      window.SLApi.deleteAccount(pw, reason).then(function (result) {
        if(!result || result.deleted !== true) throw new Error('Deletion was not confirmed. Please try again.');
        document.removeEventListener('keydown', onKey);
        // Clear all local state
        try { localStorage.removeItem('sl_jwt_token'); } catch(_){}
        try { localStorage.removeItem('sl_user'); localStorage.removeItem('sl_user_cache'); } catch(_){}
        try { sessionStorage.clear(); } catch(_){}


        // Unregister push tokens if we're in a Capacitor app
        if (window.Capacitor && window.SLPush && window.SLPush.unregister) {
          try { window.SLPush.unregister(); } catch(_){}
        }

        // Show a full-screen confirmation then redirect
        document.body.innerHTML =
          '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
          'background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
          'padding:40px;text-align:center;">' +
            '<div style="max-width:380px;">' +
              '<div style="font-size:48px;margin-bottom:16px;">👋</div>' +
              '<h1 style="font-size:22px;margin:0 0 12px;color:#D4AF37;">Account deleted</h1>' +
              '<p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.5;margin:0 0 24px;">' +
                'Your SceneLink account has been deleted. See our privacy policy for any records retained for security or legal obligations.' +
              '</p>' +
              '<a href="/" style="display:inline-block;background:#D4AF37;color:#000;' +
              'padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Return home</a>' +
            '</div>' +
          '</div>';
        setTimeout(function () { location.href = '/'; }, 3000);
      }).catch(function (e) {
        deleting = false;
        // Phase 6B: if the backend deletion endpoint isn't live yet,
        // pivot to the honest "contact us to delete" path instead of
        // showing a confusing error. This is a temporary gate until
        // the DELETE /api/auth/account PR is approved + deployed.
        var msg = (e && e.message) || '';
        var status = e && e.status;
        var isNotImplemented = status === 404 || status === 501 ||
          /not.found|endpoint.not.found|not.implemented/i.test(msg);
        if (isNotImplemented) {
          var subject = encodeURIComponent('Account deletion request');
          var body = encodeURIComponent(
            'Hi SceneLink team,\n\n' +
            'Please permanently delete my account and all associated data.\n\n' +
            (reason ? 'Reason: ' + reason + '\n\n' : '') +
            'I understand this action is irreversible.\n\nThank you.'
          );
          var modal = document.querySelector('.sl-acct-m');
          if (modal) {
            modal.innerHTML =
              '<h2 id="slAcctDelTitle">Email us to delete</h2>' +
              '<p>Self-service deletion is currently unavailable. Your account has not been deleted. You can contact support to request help.</p>' +
              '<p style="font-size:12px;color:rgba(255,255,255,0.6);">Your email: <b>' +
                ((window.SLApi && window.SLApi.getCurrentUser && (window.SLApi.getCurrentUser()||{}).email) || 'your account email') +
              '</b></p>' +
              '<div class="sl-acct-actions" style="margin-top:18px;">' +
                '<button class="cancel" onclick="document.getElementById(\'slAcctDelOverlay\').remove();document.body.style.overflow=\'\';">Close</button>' +
                '<a class="confirm" style="text-align:center;line-height:1.3;text-decoration:none;display:flex;align-items:center;justify-content:center;" ' +
                'href="mailto:info@scenelink.app?subject=' + subject + '&body=' + body + '">Email info@scenelink.app</a>' +
              '</div>';
          }
          return;
        }
        err.textContent = msg || 'Could not delete account';
        err.style.display = 'block';
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete permanently';
      });
    });

    // Autofocus
    setTimeout(function () { confirmInput.focus(); }, 100);
  }

  function injectSection() {
    if (!isProfilePage()) return;
    if (document.getElementById('slAcctSettings')) return;

    // Only for signed-in users
    var token = null;
    try { token = localStorage.getItem('sl_jwt_token'); } catch(_){}
    if (!token) return;

    injectStyle();

    // Find main content container
    var main = document.querySelector('main') || document.body;
    var section = document.createElement('section');
    section.className = 'sl-acct-settings';
    section.id = 'slAcctSettings';
    section.innerHTML =
      '<div class="sl-acct-card">' +
        '<h3>Account</h3>' +
        '<p>Manage your SceneLink account preferences.</p>' +
        '<button class="sl-acct-btn neutral" id="slAcctLogout">Sign out</button>' +
      '</div>' +
      '<div class="sl-acct-card sl-acct-danger" style="margin-top:14px;">' +
        '<h3>Danger zone</h3>' +
        '<p>Permanently delete your account and all associated data. This cannot be undone.</p>' +
        '<button class="sl-acct-btn" id="slAcctDeleteBtn">Delete my account</button>' +
      '</div>';
    main.appendChild(section);

    document.getElementById('slAcctLogout').addEventListener('click', function () {
      if (!confirm('Sign out of SceneLink?')) return;
      try { localStorage.removeItem('sl_jwt_token'); } catch(_){}
      try { localStorage.removeItem('sl_user'); localStorage.removeItem('sl_user_cache'); } catch(_){}
      location.href = '/';
    });

    document.getElementById('slAcctDeleteBtn').addEventListener('click', function () {
      // Determine if OAuth by checking cached user, then fall back to /me
      function go(user) {
        var isOAuth = !!(user && user.oauth_provider);
        openDeleteModal(isOAuth);
      }
      if (window.SL_USER) return go(window.SL_USER);
      window.SLApi.me().then(function (r) { go(r && r.user); })
        .catch(function () { go(false); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSection);
  } else {
    injectSection();
  }
  window.addEventListener('sl-auth-ready', injectSection);
})();

/* === js/sl-bottom-tabs.js === */
/**
 * SL Bottom Tabs — mobile-only bottom nav (iOS/Android-style).
 * - Auto-injects on screens ≤ 860 px
 * - 5 tabs: Home, Explore, Concierge, Plans, Profile
 * - Respects safe-area insets
 * - Active-state inferred from pathname
 */
(function () {
  if (window.__SL_BOTTOM_TABS__) return;
  window.__SL_BOTTOM_TABS__ = true;

  var TABS = [
    { href: '/',                      icon: 'home',          label: 'Home',      match: ['/', '/index.html'] },
    { href: '/tonight.html',          icon: 'fire',          label: 'Tonight',   match: ['/tonight.html','/tonight-v2.html'] },
    { href: '/explore.html',          icon: 'compass',       label: 'Explore',   match: ['/explore.html','/nightlife.html','/events.html'] },
    { href: '/plan-with-friends.html',icon: 'calendar-alt',  label: 'Plans',     match: ['/plan-with-friends.html','/my-lists.html'] },
    { href: '/profile.html',          icon: 'user',          label: 'You',       match: ['/profile.html','/social-feed.html','/messages.html'] }
  ];

  function injectStyle() {
    if (document.getElementById('sl-bt-style')) return;
    var s = document.createElement('style');
    s.id = 'sl-bt-style';
    s.textContent = [
      /* Only visible on mobile */
      '@media (max-width: 860px) {',
      '  body { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }',
      '  .sl-bottom-tabs {',
      '    position: fixed; left: 0; right: 0; bottom: 0;',
      '    background: rgba(10,10,10,0.92);',
      '    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);',
      '    border-top: 1px solid rgba(255,255,255,0.08);',
      '    display: flex; justify-content: space-around; align-items: stretch;',
      '    padding-bottom: env(safe-area-inset-bottom, 0px);',
      '    z-index: 9998;',
      '    height: calc(64px + env(safe-area-inset-bottom, 0px));',
      '  }',
      '  .sl-bottom-tabs a {',
      '    flex: 1; display: flex; flex-direction: column; align-items: center;',
      '    justify-content: center; gap: 3px;',
      '    color: rgba(255,255,255,0.55); text-decoration: none;',
      '    font-size: 10px; font-weight: 500;',
      '    transition: color 0.15s;',
      '    -webkit-tap-highlight-color: transparent;',
      '    padding: 6px 2px 4px;',
      '  }',
      '  .sl-bottom-tabs a i { font-size: 20px; margin-bottom: 1px; }',
      '  .sl-bottom-tabs a.active { color: #D4AF37; }',
      '  .sl-bottom-tabs a.active i {',
      '    transform: scale(1.12); filter: drop-shadow(0 0 8px rgba(212,175,55,0.5));',
      '  }',
      '  .sl-bottom-tabs a:active { background: rgba(212,175,55,0.08); }',
      /* Hide desktop footer on mobile when bottom tabs present (cleaner) */
      '  body.sl-has-tabs footer { padding-bottom: 80px; }',
      '}',
      '@media (min-width: 861px) { .sl-bottom-tabs { display: none !important; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function inject() {
    if (document.getElementById('slBottomTabs')) return;

    // Never in Capacitor if using native nav later — but it's still useful, so keep for now
    // Only skip on auth page / embedded flows
    var path = (location.pathname || '/').toLowerCase();
    if (path.endsWith('/auth.html')) return;

    injectStyle();

    var nav = document.createElement('nav');
    nav.className = 'sl-bottom-tabs';
    nav.id = 'slBottomTabs';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Main navigation');

    var currentPath = path;
    nav.innerHTML = TABS.map(function (t) {
      var active = t.match.some(function (m) {
        if (m === '/' || m === '/index.html') return currentPath === '/' || currentPath === '/index.html';
        return currentPath === m.toLowerCase() || currentPath.endsWith(m.toLowerCase());
      });
      return '<a href="' + t.href + '"' + (active ? ' class="active" aria-current="page"' : '') + '>' +
        '<i class="fas fa-' + t.icon + '"></i>' +
        '<span>' + t.label + '</span>' +
      '</a>';
    }).join('');

    document.body.appendChild(nav);
    document.body.classList.add('sl-has-tabs');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();

/* === js/sl-img-fallback.js === */
/*!
 * sl-img-fallback.js — SceneLink image fallback guard + same-origin avatar helper
 * ------------------------------------------------------------------
 * Single-shot handler. The fallback image is same-origin SVG, so it
 * cannot rate-limit, CORS-block, or 404. Even if it somehow did, we
 * clear `onerror` before re-assigning `src`, so the browser can
 * NEVER loop.
 *
 * Usage from inline HTML:
 *   <img src="..." onerror="SL_IMG_FALLBACK(this,'venue')">
 *   <img src="..." onerror="SL_IMG_FALLBACK(this,'event')">
 *   <img src="..." onerror="SL_IMG_FALLBACK(this,'avatar')">
 *
 * Kind defaults to 'venue' if unknown.
 *
 * Also exposes:
 *   window.SL_AVATAR(name, opts?)  →  data: URI avatar SVG
 *     Replaces external ui-avatars.com calls with a same-origin,
 *     zero-request inline avatar (initials on colored circle).
 *     opts: { size?:number, bg?:string, fg?:string }
 * ------------------------------------------------------------------
 */
(function () {
    'use strict';

    var PLACEHOLDERS = {
        venue:  '/assets/img/placeholder-venue.svg',
        event:  '/assets/img/placeholder-event.svg',
        avatar: '/assets/img/placeholder-avatar.svg'
    };

    function slImgFallback(img, kind) {
        if (!img) return;

        // If we've already swapped this img once, do NOT swap again.
        if (img.__slFallbackUsed) {
            try {
                img.onerror = null;
                img.removeAttribute('onerror');
                img.style.visibility = 'hidden';
            } catch (e) {}
            return;
        }

        img.__slFallbackUsed = true;

        // CRITICAL: clear the handler BEFORE touching src.
        try {
            img.onerror = null;
            img.removeAttribute('onerror');
        } catch (e) {}

        var src = PLACEHOLDERS[kind] || PLACEHOLDERS.venue;
        try {
            img.src = src;
        } catch (e) {
            try { img.style.visibility = 'hidden'; } catch (e2) {}
        }
    }

    // ---- Same-origin avatar generator (zero external request) ----
    // Deterministic color from name so same name → same color.
    var PALETTE = [
        '#D4AF37','#3b82f6','#8b5cf6','#10b981','#ef4444',
        '#f97316','#06b6d4','#ec4899','#eab308','#22c55e'
    ];
    function hashStr(s) {
        var h = 0;
        for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
        return Math.abs(h);
    }
    function initialsOf(name) {
        if (!name) return '?';
        var parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    function slAvatar(name, opts) {
        opts = opts || {};
        var size = opts.size || 96;
        var bg = opts.bg || PALETTE[hashStr(String(name || '')) % PALETTE.length];
        var fg = opts.fg || '#0a0a0a';
        var label = initialsOf(name);
        var svg = '' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
            '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + (size/2) + '" fill="' + bg + '"/>' +
            '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" ' +
            'font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Inter,Helvetica,Arial,sans-serif" ' +
            'font-size="' + Math.round(size * 0.42) + '" font-weight="700" fill="' + fg + '">' +
            label.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
            '</text></svg>';
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    window.SL_IMG_FALLBACK = slImgFallback;
    // Preserve both supported call styles when the bundled fallback loads after sl-avatar.js.
    slAvatar.local = window.SL_AVATAR && typeof window.SL_AVATAR.local === 'function' ? window.SL_AVATAR.local : slAvatar;
    window.SL_AVATAR = slAvatar;

    window.SL = window.SL || {};
    window.SL.imgFallback = slImgFallback;
    window.SL.avatar = slAvatar;
})();

/* === js/sl-unread-poller.js === */
/*! =========================================================================
 *  sl-unread-poller.js  —  Phase 3
 *  Polls unread message count + notifications when logged in, updates nav badges.
 *  Safe against network errors; backs off on auth errors.
 * ========================================================================= */
(function () {
  if (window.__SLUnreadPoller) return;
  window.__SLUnreadPoller = true;

  var POLL_MS = 60000;          // 60s steady
  var FAST_POLL_MS = 15000;     // 15s right after user activity
  var MAX_BACKOFF_MS = 5 * 60 * 1000;
  var backoff = 0;
  var timer = null;

  function isLoggedIn() {
    try {
      if (window.SLAuth && typeof SLAuth.isLoggedIn === 'function') return !!SLAuth.isLoggedIn();
      return !!(localStorage.getItem('sl_auth_token') || localStorage.getItem('sl_jwt_token'));
    } catch (_) { return false; }
  }

  function setBadges(count) {
    var n = Math.max(0, parseInt(count, 10) || 0);
    var display = n > 99 ? '99+' : String(n);

    var menu = document.querySelector('[data-sl-unread-badge]');
    if (menu) {
      if (n > 0) { menu.textContent = display; menu.removeAttribute('hidden'); }
      else       { menu.textContent = '0';     menu.setAttribute('hidden', ''); }
    }
    var trig = document.querySelector('[data-sl-unread-trigger]');
    if (trig) {
      if (n > 0) { trig.textContent = display; trig.removeAttribute('hidden'); }
      else       { trig.textContent = '0';     trig.setAttribute('hidden', ''); }
    }

    try { window.SL_UNREAD_COUNT = n; } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('sl:unread-updated', { detail: { count: n } })); } catch (_) {}
  }

  async function fetchUnread() {
    if (!isLoggedIn() || !window.SLApi) return null;
    try {
      // Prefer the messages-specific count for the Messages badge.
      if (typeof SLApi.conversationsUnreadCount === 'function') {
        var r = await SLApi.conversationsUnreadCount();
        return (r && typeof r.unread === 'number') ? r.unread : 0;
      }
      // Fallback: direct fetch
      var base = (window.SL_API_BASE || '/api').replace(/\/$/, '');
      var token = localStorage.getItem('sl_auth_token') || localStorage.getItem('sl_jwt_token');
      if (!token) return null;
      var resp = await fetch(base + '/conversations/unread-count', {
        headers: { Authorization: 'Bearer ' + token },
        credentials: 'omit'
      });
      if (resp.status === 401) return 'unauth';
      if (!resp.ok) throw new Error('http ' + resp.status);
      var data = await resp.json();
      return (data && typeof data.unread === 'number') ? data.unread : 0;
    } catch (e) {
      return null;
    }
  }

  async function tick() {
    if (!isLoggedIn()) { setBadges(0); scheduleNext(); return; }
    var n = await fetchUnread();
    if (n === 'unauth') {
      // Token invalid — back off a lot
      backoff = Math.min((backoff || POLL_MS) * 2, MAX_BACKOFF_MS);
    } else if (n === null) {
      backoff = Math.min((backoff || POLL_MS) * 2, MAX_BACKOFF_MS);
    } else {
      backoff = 0;
      setBadges(n);
    }
    scheduleNext();
  }

  function scheduleNext(ms) {
    clearTimeout(timer);
    var wait = ms || backoff || POLL_MS;
    timer = setTimeout(tick, wait);
  }

  function start() {
    scheduleNext(1500); // first tick shortly after boot
    window.addEventListener('sl:login-success', function () { scheduleNext(800); });
    window.addEventListener('sl:auth-changed', function () { scheduleNext(800); });
    window.addEventListener('sl:logout', function () { setBadges(0); clearTimeout(timer); });
    window.addEventListener('focus', function () { scheduleNext(500); });
    // Speed up right after user sends/opens a message
    window.addEventListener('sl:message-sent', function () { scheduleNext(500); });
    window.addEventListener('sl:conversation-opened', function () { scheduleNext(500); });
    // Pause when tab hidden
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { clearTimeout(timer); }
      else { scheduleNext(500); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
