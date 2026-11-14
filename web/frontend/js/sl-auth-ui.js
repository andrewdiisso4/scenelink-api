/* =========================================================================
   SL AUTH UI — Premium login / signup / forgot-password modal.
   Depends on: SLAuth (sl-auth-core.js).
   Exposes: window.SLAuthUI = { open, close }
   ========================================================================= */
(function(){
  'use strict';

  if (window.SLAuthUI && window.SLAuthUI.__ui === true) return;

  var recoveryEpoch = 0;
  function resetRecovery(){
    recoveryEpoch++;
    if (!overlay) return;
    var btn = overlay.querySelector('[data-form="forgot"] .sl-auth-submit');
    if (btn) { btn.disabled = false; btn.textContent = "Send reset link"; }
  }
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
      html += '<div data-google-host aria-label="Sign in with Google"></div>' +
        '<button type="button" class="sl-oauth-btn" data-oauth="google-retry">Loading Google…</button>';
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
    overlay = el('div', { class: 'sl-auth-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'slAuthTitle' });
    overlay.innerHTML = [
      '<div class="sl-auth-modal">',
      '  <button type="button" class="sl-auth-close" aria-label="Close">&times;</button>',
      '  <div class="sl-auth-brand">',
      '    <div class="sl-auth-brand-logo"><img class="sl-auth-official-logo" src="/images/brand/scenelink-full.png" alt="SceneLink" width="88" height="88"></div>',
      '    <h2 class="sl-auth-title" id="slAuthTitle" data-sl-title>Welcome back</h2>',
      '    <p class="sl-auth-sub" data-sl-sub>Sign in to continue to SceneLink</p>',
      '  </div>',

      '  <div class="sl-auth-tabs" data-sl-tabs>',
      '    <button type="button" class="sl-auth-tab active" data-tab="login">Sign in</button>',
      '    <button type="button" class="sl-auth-tab" data-tab="signup">Create account</button>',
      '  </div>',

      '  <div class="sl-auth-error" data-sl-error role="alert"></div>',
      '  <div class="sl-auth-success" data-sl-success role="status" aria-live="polite"></div>',

      '  <div data-sl-oauth-slot>' + oauthButtonsHTML() + '</div>',
      '  <button type="button" class="sl-auth-link" data-oauth-cancel hidden>Cancel sign-in and retry</button>',

      '  <form class="sl-auth-form active" data-form="login" autocomplete="on" novalidate>',
      '    <div class="sl-auth-field">',
      '      <label class="sl-auth-label" for="slLoginEmail">Email</label>',
      '      <input class="sl-auth-input" type="email" id="slLoginEmail" autocapitalize="none" spellcheck="false" name="email" autocomplete="email" placeholder="you@example.com" required>',
      '    </div>',
      '    <div class="sl-auth-field">',
      '      <label class="sl-auth-label" for="slLoginPassword">Password</label>',
      '      <input class="sl-auth-input" type="password" id="slLoginPassword" name="password" autocomplete="current-password" placeholder="••••••••" required>',
      '    </div>',
      '    <button type="submit" class="sl-auth-submit">Sign in</button>',
      '    <div class="sl-auth-foot">',
      '      <button type="button" class="sl-auth-link" data-action="forgot">Forgot password?</button>',
      '    </div>',
      '  </form>',

      '  <form class="sl-auth-form" data-form="signup" autocomplete="on" novalidate>',
      '    <div class="sl-auth-field">',
      '      <label class="sl-auth-label" for="slSignupDisplayName">Display name</label>',
      '      <input class="sl-auth-input" type="text" id="slSignupDisplayName" name="display_name" autocomplete="name" placeholder="How your friends know you" required maxlength="60">',
      '    </div>',
      '    <div class="sl-auth-row">',
      '      <div class="sl-auth-field">',
      '        <label class="sl-auth-label" for="slSignupUsername">Username</label>',
      '        <input class="sl-auth-input" type="text" id="slSignupUsername" autocapitalize="none" spellcheck="false" name="username" autocomplete="username" placeholder="yourhandle" required maxlength="24" pattern="[a-zA-Z0-9_]+">',
      '      </div>',
      '    </div>',
      '    <div class="sl-auth-field">',
      '      <label class="sl-auth-label" for="slSignupEmail">Email</label>',
      '      <input class="sl-auth-input" type="email" id="slSignupEmail" autocapitalize="none" spellcheck="false" name="email" autocomplete="email" placeholder="you@example.com" required>',
      '    </div>',
      '    <div class="sl-auth-field">',
      '      <label class="sl-auth-label" for="slSignupPassword">Password</label>',
      '      <input class="sl-auth-input" type="password" id="slSignupPassword" name="password" autocomplete="new-password" placeholder="At least 8 characters" required minlength="8">',
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
      '      <label class="sl-auth-label" for="slRecoveryEmail">Email</label>',
      '      <input class="sl-auth-input" type="email" id="slRecoveryEmail" name="email" autocomplete="email" placeholder="you@example.com" required>',
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

    overlay.querySelector('[data-oauth-cancel]').addEventListener('click', function(){ failOAuth(oauthEpoch, ''); });

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
      if (provider === 'google-retry') prepareGoogle(oauthEpoch);
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
    resetRecovery();
    resetOAuth();
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

    overlay.querySelector('[data-sl-oauth-slot]').hidden = tab === 'forgot';
    if (tab !== 'forgot' && overlay.classList.contains('open')) prepareOAuth();

    // focus first input
    setTimeout(function(){
      var first = overlay.querySelector('.sl-auth-form.active input');
      if (first && overlay.classList.contains('open')) first.focus();
    }, 50);
  }

  // SDK loads are shared; modal lifetimes and sign-in attempts are not.
  var emailSequence = 0, oauthEpoch = 0, oauthAttempt = null, appleReady = false, sdkLoads = {};
  function sessionToken(){ return window.SLAuth && window.SLAuth.token ? window.SLAuth.token() : ''; }
  function isCurrent(epoch){ return epoch === oauthEpoch && overlay && overlay.classList.contains('open'); }
  function restoreOAuth(){
    var slot = overlay.querySelector('[data-sl-oauth-slot]');
    slot.inert = false; slot.removeAttribute('inert'); slot.removeAttribute('aria-busy');
    slot.style.pointerEvents = '';
    slot.querySelectorAll('button').forEach(function(btn){ btn.disabled = false; });
  }
  function resetOAuth(){
    oauthEpoch++; emailSequence++;
    if (oauthAttempt) clearTimeout(oauthAttempt.timer);
    oauthAttempt = null; appleReady = false;
    if (overlay) {
      restoreOAuth(); overlay.querySelector('[data-oauth-cancel]').hidden = true;
      ['login', 'signup'].forEach(function(name){
        var button = overlay.querySelector('[data-form="' + name + '"] .sl-auth-submit');
        button.disabled = false; button.textContent = name === 'login' ? 'Sign in' : 'Create account';
      });
    }
  }
  function loadSDK(name, url, ready){
    if (ready()) return Promise.resolve();
    if (sdkLoads[name]) return sdkLoads[name];
    var pending = new Promise(function(resolve, reject){
      var script = document.createElement('script'), done = false, poll, timer;
      function finish(error){
        if (done) return;
        done = true; clearTimeout(timer); clearInterval(poll);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve();
      }
      timer = setTimeout(function(){ finish(new Error(name + ' sign-in could not load. Check your connection and retry.')); }, 10000);
      script.src = url; script.async = true;
      script.onload = function(){ if (ready()) finish(); else poll = setInterval(function(){ if (ready()) finish(); }, 50); };
      script.onerror = function(){ finish(new Error('Could not reach ' + name + '. Check your connection and retry.')); };
      document.head.appendChild(script);
    });
    sdkLoads[name] = pending;
    pending.catch(function(){ if (sdkLoads[name] === pending) delete sdkLoads[name]; });
    return pending;
  }
  function googleSDK(){ return window.google && window.google.accounts && window.google.accounts.id; }
  function appleSDK(){ return window.AppleID && window.AppleID.auth && typeof window.AppleID.auth.signIn === 'function'; }
  function prepareOAuth(){ prepareGoogle(oauthEpoch); prepareApple(oauthEpoch); }
  function prepareGoogle(epoch){
    var config = window.SL_CONFIG || {}, retry = overlay.querySelector('[data-oauth="google-retry"]'), host = overlay.querySelector('[data-google-host]');
    if (!config.GOOGLE_CLIENT_ID || !retry || retry.disabled && retry.textContent === 'Loading Google…') return;
    retry.hidden = false; retry.disabled = true; retry.textContent = 'Loading Google…'; host.innerHTML = '';
    loadSDK('Google', 'https://accounts.google.com/gsi/client', googleSDK).then(function(){
      if (!isCurrent(epoch)) return;
      // Reject old popups even when GIS delivers them to its latest callback.
      var bytes = new Uint32Array(4); window.crypto.getRandomValues(bytes);
      var nonce = Array.from(bytes).map(function(n){ return n.toString(16); }).join('-'), startingToken = sessionToken();
      googleSDK().initialize({client_id: config.GOOGLE_CLIENT_ID, ux_mode: 'popup', auto_select: false, nonce: nonce,
        callback: function(response){
          if (!isCurrent(epoch) || sessionToken() !== startingToken || oauthAttempt && oauthAttempt.provider !== 'google') return;
          if (oauthAttempt && oauthAttempt.exchanging) return;
          if (!response || !response.credential) { failOAuth(epoch, 'Google did not return a credential. Please retry.'); return; }
          try {
            var payload = JSON.parse(atob(response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (payload.nonce !== nonce) return;
          } catch (error) { failOAuth(epoch, 'Google returned an invalid credential. Please retry.'); return; }
          var attempt = oauthAttempt || beginOAuth('google', epoch);
          if (!attempt) return;
          attempt.exchanging = true;
          exchange(attempt, function(options){ return window.SLAuth.loginWithGoogle(response.credential, options); });
        }
      });
      googleSDK().renderButton(host, {theme: 'filled_black', size: 'large', type: 'standard',
        click_listener: function(){ if (isCurrent(epoch) && !oauthAttempt) beginOAuth('google', epoch); }
      });
      retry.hidden = true; retry.disabled = false; retry.textContent = 'Retry Google sign-in';
    }).catch(function(error){
      if (!isCurrent(epoch)) return;
      retry.hidden = false; retry.disabled = false; retry.textContent = 'Retry Google sign-in';
      setMessage('error', error.message || 'Google sign-in could not load. Please retry.');
    });
  }
  function prepareApple(epoch){
    var config = window.SL_CONFIG || {}, btn = overlay.querySelector('[data-oauth="apple"]');
    if (!btn || !config.APPLE_ENABLED || !config.APPLE_CLIENT_ID) return;
    btn.disabled = true; btn.querySelector('span:last-child').textContent = 'Loading Apple…';
    loadSDK('Apple', 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js', appleSDK).then(function(){
      if (!isCurrent(epoch)) return;
      window.AppleID.auth.init({clientId: config.APPLE_CLIENT_ID, scope: 'name email', redirectURI: config.APPLE_REDIRECT_URI || window.location.origin + '/', usePopup: true});
      appleReady = true; btn.disabled = false; btn.querySelector('span:last-child').textContent = 'Continue with Apple';
    }).catch(function(error){
      if (!isCurrent(epoch)) return;
      appleReady = false; btn.disabled = false; btn.querySelector('span:last-child').textContent = 'Retry loading Apple';
      setMessage('error', error.message || 'Apple sign-in could not load. Please retry.');
    });
  }
  function beginOAuth(provider, epoch){
    if (!isCurrent(epoch) || oauthAttempt) return null;
    setMessage();
    emailSequence++;
    var attempt = {provider: provider, epoch: epoch, exchanging: false, startingToken: sessionToken()};
    oauthAttempt = attempt; overlay.querySelector('[data-oauth-cancel]').hidden = false;
    var slot = overlay.querySelector('[data-sl-oauth-slot]');
    slot.inert = true; slot.setAttribute('inert', ''); slot.setAttribute('aria-busy', 'true'); slot.style.pointerEvents = 'none';
    slot.querySelectorAll('button').forEach(function(btn){ btn.disabled = true; });
    attempt.timer = setTimeout(function(){ if (currentAttempt(attempt)) failOAuth(epoch, provider + ' sign-in took too long. Please retry or use email.'); }, 60000);
    return attempt;
  }
  function currentAttempt(attempt){ return oauthAttempt === attempt && isCurrent(attempt.epoch); }
  function failOAuth(epoch, message){
    if (!isCurrent(epoch)) return;
    resetOAuth(); prepareOAuth(); setMessage(message ? 'error' : null, message);
  }
  function exchange(attempt, request){
    Promise.resolve().then(function(){
      if (!currentAttempt(attempt) || sessionToken() !== attempt.startingToken) return null;
      return request({isCurrent: function(){ return currentAttempt(attempt) && sessionToken() === attempt.startingToken; }});
    }).then(function(user){
      if (!currentAttempt(attempt) || !user) return;
      clearTimeout(attempt.timer);
      setMessage('success', 'Welcome, ' + (user.display_name || user.username) + '!');
      attempt.timer = setTimeout(function(){ if (currentAttempt(attempt)) close(); }, 500);
    }).catch(function(error){ if (currentAttempt(attempt)) failOAuth(attempt.epoch, error.message || 'Sign-in failed. Please retry.'); });
  }
  function startApple(){
    var config = window.SL_CONFIG || {};
    if (!config.APPLE_ENABLED || !config.APPLE_CLIENT_ID || oauthAttempt) return;
    if (!appleReady) { prepareApple(oauthEpoch); return; }
    var attempt = beginOAuth('apple', oauthEpoch);
    if (!attempt) return;
    var result;
    // Preserve user activation: signIn is synchronous within this ready-button click.
    try { result = window.AppleID.auth.signIn(); } catch (error) { result = Promise.reject(error); }
    Promise.resolve(result).then(function(data){
      if (!currentAttempt(attempt) || sessionToken() !== attempt.startingToken) return;
      if (!data || !data.authorization || !data.authorization.id_token) throw new Error('Apple did not return an ID token.');
      attempt.exchanging = true;
      exchange(attempt, function(options){ return window.SLAuth.loginWithApple({id_token: data.authorization.id_token, user: data.user || undefined}, options); });
    }).catch(function(error){
      if (!currentAttempt(attempt)) return;
      var message = error && (error.message || error.error) || 'Apple sign-in failed.';
      if (/popup_closed|user_cancel|user_trigger|cancel/i.test(message)) message = '';
      else if (/invalid_client/i.test(message)) message = 'Apple sign-in is unavailable because its provider configuration needs updating. Please use Google or email.';
      failOAuth(attempt.epoch, message);
    });
  }

  function onLogin(e){
    e.preventDefault();
    var f = e.currentTarget;
    if (f.querySelector('.sl-auth-submit').disabled) return;
    setMessage();
    var email = f.email.value.trim();
    var pw    = f.password.value;
    if (!email || !pw){ setMessage('error', 'Please enter email and password.'); return; }
    resetOAuth();
    var emailEpoch = oauthEpoch, sequence = emailSequence;
    function emailCurrent(){ return isCurrent(emailEpoch) && sequence === emailSequence; }
    var btn = f.querySelector('.sl-auth-submit');
    btn.disabled = true; btn.textContent = 'Signing in...';
    window.SLAuth.login(email, pw, {isCurrent: emailCurrent}).then(function(user){
      if (!emailCurrent()) return;
      setMessage('success', 'Welcome back, ' + (user.display_name || user.username) + '!');
      setTimeout(function(){
        if (!emailCurrent()) return;
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
      if (!emailCurrent() || err.code === 'AUTH_SUPERSEDED') return;
      setMessage('error', err.message || 'Sign in failed. Check your email and password.');
    }).finally(function(){
      if (!emailCurrent()) return;
      prepareOAuth();
      btn.disabled = false; btn.textContent = 'Sign in';
    });
  }

  function onSignup(e){
    e.preventDefault();
    var f = e.currentTarget;
    if (f.querySelector('.sl-auth-submit').disabled) return;
    setMessage();
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
    resetOAuth();
    var emailEpoch = oauthEpoch, sequence = emailSequence;
    function emailCurrent(){ return isCurrent(emailEpoch) && sequence === emailSequence; }
    var btn = f.querySelector('.sl-auth-submit');
    btn.disabled = true; btn.textContent = 'Creating account...';
    window.SLAuth.signup(payload, {isCurrent: emailCurrent}).then(function(user){
      if (!emailCurrent()) return;
      setMessage('success', 'Welcome to SceneLink, ' + (user.display_name || user.username) + '!');
      setTimeout(function(){ if (emailCurrent()) close(); }, 500);
    }).catch(function(err){
      if (!emailCurrent() || err.code === 'AUTH_SUPERSEDED') return;
      var msg = err.message || 'Sign up failed.';
      if (/already|exists|unique/i.test(msg)) {
        msg = 'That email or username is already taken.';
      }
      setMessage('error', msg);
    }).finally(function(){
      if (!emailCurrent()) return;
      prepareOAuth();
      btn.disabled = false; btn.textContent = 'Create account';
    });
  }

  function onForgot(e){
    e.preventDefault();
    var f = e.currentTarget;
    var btn = f.querySelector('.sl-auth-submit');
    if (btn.disabled) return;
    setMessage();
    var input = f.elements.namedItem('email');
    var email = input.value.trim();
    if (!email || !input.validity.valid){ setMessage('error', 'Enter a valid email address.'); input.focus(); return; }
    var epoch = recoveryEpoch;
    function current(){ return epoch === recoveryEpoch && overlay.classList.contains('open'); }
    btn.disabled = true; btn.textContent = 'Sending...';
    Promise.resolve().then(function(){ return window.SLAuth.forgotPassword(email); }).then(function(){
      if (current()) setMessage('success', 'If an account exists for that email, a password reset link has been requested. Check your inbox and spam folder.');
    }).catch(function(err){
      if (!current()) return;
      setMessage('error', err && err.status === 429
        ? 'Too many reset requests. Please wait a few minutes, then try again.'
        : 'We could not confirm your reset request. Check your connection and try again.');
    }).finally(function(){
      if (current()) { btn.disabled = false; btn.textContent = 'Send reset link'; }
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
    restoreOAuth();
    if ((tab || 'login') !== 'forgot') prepareOAuth();
    document.body.style.overflow = 'hidden';
  }

  function close(){
    if (!overlay || !overlay.classList.contains('open')) return;
    resetRecovery();
    resetOAuth();
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