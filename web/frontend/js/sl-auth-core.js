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
  // A response belongs to the sign-in/session that started it, even if storage
  // later returns to the same token after an account switch.
  var sessionEpoch = 0;

  function beginSignIn(){
    return { epoch: ++sessionEpoch, token: readToken() };
  }
  function ownsSession(request){
    return request.epoch === sessionEpoch && request.token === readToken();
  }
  function completeSignIn(request, data, failure, options){
    if (!ownsSession(request) || options && options.isCurrent && !options.isCurrent()) {
      var err = new Error('This sign-in attempt was superseded. Please use your current sign-in.');
      err.code = 'AUTH_SUPERSEDED';
      throw err;
    }
    if (!data || !data.token) throw new Error(failure);
    writeToken(data.token);
    writeCache(data.user);
    state.user = data.user;
    if (window.SLApi && window.SLApi.setToken) window.SLApi.setToken(data.token);
    emit();
    return data.user;
  }

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
    if (!isAuthed()) return null;
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
    var refreshingSession = { epoch: sessionEpoch, token: readToken() };
    return apiCall('/auth/me').then(function(j){
      if(!ownsSession(refreshingSession)){ state.loading=false; return null; }
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
      if(!ownsSession(refreshingSession)){ state.loading=false; return null; }
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

  function login(email, password, options){
    var request = beginSignIn();
    return apiCall('/auth/login', {
      method: 'POST',
      body: { email: email, password: password }
    }).then(function(d){
      return completeSignIn(request, d, 'Login failed', options);
    });
  }

  function signup(payload, options){
    var request = beginSignIn();
    return apiCall('/auth/signup', {
      method: 'POST',
      body: payload
    }).then(function(d){
      return completeSignIn(request, d, 'Signup failed', options);
    });
  }

  function forgotPassword(email){
    return apiCall('/auth/forgot-password', { method: 'POST', body: { email: email } });
  }

  // Google OAuth — backend verifies the Google ID token
  function loginWithGoogle(idToken, options){
    if (!idToken) return Promise.reject(new Error('Missing Google id_token'));
    var request = beginSignIn();
    return apiCall('/auth/google', {
      method: 'POST',
      body: { id_token: idToken }
    }).then(function(d){
      return completeSignIn(request, d, 'Google sign-in failed', options);
    });
  }

  // Apple Sign In — backend verifies the Apple identity token
  function loginWithApple(payload, options){
    // payload: { id_token, user?: { name: {firstName, lastName}, email } }
    if (!payload || !payload.id_token) return Promise.reject(new Error('Missing Apple id_token'));
    var request = beginSignIn();
    return apiCall('/auth/apple', {
      method: 'POST',
      body: payload
    }).then(function(d){
      return completeSignIn(request, d, 'Apple sign-in failed', options);
    });
  }

  function logout(opts){
    opts = opts || {};
    var logoutEpoch = ++sessionEpoch;
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
      if(opts.reload !== false && logoutEpoch === sessionEpoch && !readToken()) window.location.href = '/';
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
    if (e.key === TOKEN_KEY || e.key === USER_KEY || e.key === null) {
      if (e.key === TOKEN_KEY || e.key === null) sessionEpoch++;
      state.user = isAuthed() ? readCache() : null;
      emit();
    }
  });

  console.log('[SLAuth] core ready · authed=', isAuthed());
})();
