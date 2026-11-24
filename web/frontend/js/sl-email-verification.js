/* Isolated ownership-confirmation entry point; no storage, analytics or automatic POST. */
(function () {
  'use strict';
  var token = '';
  try {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    var tokens = params.getAll('token');
    if (tokens.length === 1 && /^[a-f0-9]{64}$/i.test(tokens[0])) token = tokens[0];
  } catch (_) { token = ''; }
  try { window.history.replaceState(null, '', window.location.pathname); }
  catch (_) { token = ''; }
  function requestJSON(endpoint, payload) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null, timer;
    var timeout = new Promise(function (_resolve, reject) {
      timer = setTimeout(function () {
        var error = new Error('Account service timed out'); error.code = 'ACCOUNT_TIMEOUT'; reject(error);
        if (controller) controller.abort();
      }, 15000);
    });
    var request = Promise.resolve().then(function () {
      return fetch(endpoint, {
        method: 'POST', mode: 'same-origin', credentials: 'omit', redirect: 'error',
        cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller && controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
    }).then(async function (response) {
      return { response: response, body: await response.json().catch(function () { return null; }) };
    });
    return Promise.race([request, timeout]).finally(function () { clearTimeout(timer); });
  }
  function init() {
    var button = document.getElementById('verifySubmit');
    var status = document.getElementById('verifyStatus');
    if (!button || !status) return;
    var busy = false;
    function message(text, kind) { status.textContent = text; status.setAttribute('data-kind', kind || ''); }
    if (!token) { message('This verification link is missing or invalid. Sign in to SceneLink and request another verification email.', 'error'); return; }
    button.disabled = false;
    message('Select Confirm email to verify ownership of your email address.');
    button.addEventListener('click', async function () {
      if (busy || !token) return;
      busy = true; button.disabled = true;
      message('Confirming your email…');
      try {
        var result = await requestJSON('/api/auth/verification/confirm', { token: token });
        var response = result.response;
        if (!response.ok) {
          if (response.status === 400) message('This verification link is invalid, expired, or already used. Sign in and request another verification email.', 'error');
          else if (response.status === 429) message('Too many attempts. Please wait before trying again.', 'error');
          else message('Email verification is temporarily unavailable. Please try again later.', 'error');
          return;
        }
        if (!result.body || result.body.ok !== true) {
          message('Verification could not be confirmed. Sign in to check your account or request a fresh link.', 'error'); return;
        }
        token = '';
        message('Your email is verified. Previous sessions have been signed out. Return to SceneLink and log in again.', 'success');
      } catch (_) { message('Unable to reach the verification service. Verification was not confirmed. Please try again.', 'error'); }
      finally { busy = false; button.disabled = !token; }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
