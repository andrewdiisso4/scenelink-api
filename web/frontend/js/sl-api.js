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
        .then(function(d){ if(!d || d.deleted !== true) throw new Error('Deletion was not confirmed. Please try again.'); return d; });
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