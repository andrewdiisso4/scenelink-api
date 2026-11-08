/* Dedicated reset entry point. Token stays in this closure only. */
(function () {
  'use strict';
  var token = '';
  var safeUrl = false;
  try {
    var fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    var query = new URLSearchParams(window.location.search);
    var tokens = fragment.has('token') ? fragment.getAll('token') : query.getAll('token');
    // Reject ambiguous links rather than choosing between two different tokens.
    if (fragment.has('token') && query.has('token') && query.getAll('token').some(function (value) { return value !== tokens[0]; })) tokens = [];
    if (tokens.length === 1 && /^[a-f0-9]{64}$/i.test(tokens[0])) token = tokens[0];
  } catch (_) { token = ''; }
  try {
    window.history.replaceState(null, '', window.location.pathname);
    safeUrl = true;
  } catch (_) { token = ''; }

  function init() {
    var form = document.getElementById('resetForm');
    var password = document.getElementById('newPassword');
    var confirm = document.getElementById('confirmPassword');
    var submit = document.getElementById('resetSubmit');
    var status = document.getElementById('resetStatus');
    if (!form || !password || !confirm || !submit || !status) return;
    var busy = false;
    function message(text, kind) { status.textContent = text; status.setAttribute('data-kind', kind || ''); }
    function disabled(value) { password.disabled = value; confirm.disabled = value; submit.disabled = value; }
    if (!token || !safeUrl) {
      disabled(true);
      message('This reset link is missing or invalid. Return to SceneLink and request a new password reset link.', 'error');
      return;
    }
    disabled(false);
    message('Enter and confirm your new password.');
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || !token) return;
      if (password.value.length < 8) { message('Use a password with at least 8 characters.', 'error'); password.focus(); return; }
      if (new TextEncoder().encode(password.value).length > 72) { message('Use a password of no more than 72 UTF-8 bytes (some characters use more than one byte).', 'error'); password.focus(); return; }
      if (password.value !== confirm.value) { message('The passwords do not match.', 'error'); confirm.focus(); return; }
      busy = true;
      disabled(true);
      message('Resetting your password…');
      try {
        var response = await fetch('/api/auth/reset-password', {
          method: 'POST', mode: 'same-origin', credentials: 'omit', redirect: 'error',
          cache: 'no-store', referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token, password: password.value })
        });
        if (!response.ok) {
          if (response.status === 400) message('The reset link is invalid, expired, or currently unavailable. Request a new reset link from SceneLink.', 'error');
          else if (response.status === 429) message('Too many attempts. Please wait before trying again.', 'error');
          else message('Password reset is temporarily unavailable. Please try again later.', 'error');
          return;
        }
        token = '';
        password.value = '';
        confirm.value = '';
        form.hidden = true;
        message('Your password has been reset. Return to SceneLink to log in with your new password.', 'success');
      } catch (_) {
        message('Unable to reach the reset service. Your password reset was not confirmed. Please try again.', 'error');
      } finally {
        busy = false;
        disabled(!token);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
