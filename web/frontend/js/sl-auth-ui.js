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