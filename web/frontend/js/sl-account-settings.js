/**
 * SL Account Settings — auto-injects "Danger Zone" section with Delete My Account
 * on profile.html. Required for App Store compliance (Guideline 5.1.1(v)).
 *
 * The button opens a confirmation modal that requires password re-entry
 * (including OAuth accounts).
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
      ' display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;overflow:auto;backdrop-filter:blur(6px);}',
      '.sl-acct-m{background:#111;border:1px solid rgba(229,57,53,0.3);border-radius:16px;',
      ' width:100%;max-width:460px;max-height:calc(100dvh - 40px);overflow:auto;box-sizing:border-box;padding:28px;color:#fff;',
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

  var closeDialog = null, pendingOwners = new Set();
  function sessionKey(){
    try { return localStorage.getItem('sl_jwt_token') || ''; } catch (_) { return ''; }
  }

  var observedSession = sessionKey(), sessionGeneration = 0;

  function updateDeleteButton(){
    var button = document.getElementById('slAcctDeleteBtn');
    if (!button) return;
    button.disabled = pendingOwners.has(sessionKey());
    button.textContent = button.disabled ? 'Deletion request pending…' : 'Delete my account';
  }
  function openDeleteModal() {
    var owner = sessionKey();
    if (!owner || pendingOwners.has(owner)) return;
    if (closeDialog) closeDialog();
    var returnFocus = document.activeElement;
    var oldOverflow = document.body.style.overflow;
    var closed = false, generation = sessionGeneration;
    function ownsSession(){ return sessionKey() === owner && sessionGeneration === generation; }
    function ownsDialog(){ return !closed && ownsSession(); }
    var status = document.getElementById('slAcctStatus');
    if (status) status.textContent = '';

    injectStyle();
    var prev = document.getElementById('slAcctDelOverlay');
    if (prev) prev.remove();

    var pwField =
      '<p style="font-size:12px;color:rgba(255,255,255,0.6);">Password confirmation is required, including accounts created with Google or Apple. If you have not set a SceneLink password, use email recovery first, then sign in again.</p>' +
      '<button type="button" id="slAcctRecover" style="background:none;border:none;color:#D4AF37;text-decoration:underline;cursor:pointer;margin-bottom:12px">Set or recover my password</button>' +
      '<label for="slAcctPw" style="font-size:12px;color:rgba(255,255,255,0.6);display:block;margin-bottom:6px;">Re-enter password</label>' +
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
        '<input type="text" aria-label="Type DELETE to confirm account deletion" id="slAcctConfirm" placeholder="Type DELETE to confirm" autocomplete="off">' +
        pwField +
        '<label for="slAcctReason" style="font-size:12px;color:rgba(255,255,255,0.6);display:block;margin-bottom:6px;margin-top:6px;">Reason (optional — helps us improve)</label>' +
        '<textarea id="slAcctReason" maxlength="500" placeholder="Why are you leaving?"></textarea>' +
        '<div id="slAcctErr" role="alert" class="sl-acct-err" style="display:none;"></div>' +
        '<div class="sl-acct-actions">' +
          '<button class="cancel" id="slAcctCancel">Keep my account</button>' +
          '<button class="confirm" id="slAcctConfirmBtn" disabled>Delete permanently</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';

    function close() {
      if (closed) return;
      closed = true;
      ov.querySelectorAll("input, textarea").forEach(function(input){ input.value = ""; });
      closeDialog = null;
      try { ov.remove(); } catch(_){}
      document.body.style.overflow = oldOverflow;
      if (returnFocus && returnFocus.isConnected && !returnFocus.disabled) returnFocus.focus();
      document.removeEventListener('keydown', onKey);
    }
    closeDialog = close;
    function onKey(e){
      if(e.key === 'Escape') { e.preventDefault(); close(); return; }
      if(e.key !== 'Tab') return;
      var items = Array.from(ov.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]'));
      var first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (e.shiftKey && (document.activeElement === first || !ov.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !ov.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
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
      confirmBtn.disabled = deleting || !(typed && pwOk);
    }
    confirmInput.addEventListener('input', checkReady);
    if (pwInput) pwInput.addEventListener('input', checkReady);

    var deleting = false;
    confirmBtn.addEventListener('click', function () {
      if(deleting || confirmBtn.disabled) return;
      if (!ownsDialog()) { close(); return; }
      deleting = true;
      pendingOwners.add(owner);
      updateDeleteButton();
      var err = document.getElementById('slAcctErr');
      err.style.display = 'none';
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting…';
      var pw = pwInput ? pwInput.value : '';
      var reason = (document.getElementById('slAcctReason').value || '').trim().slice(0, 500);

      var request;
      try { request = window.SLApi.deleteAccount(pw, reason); } catch(e) { request = Promise.reject(e); }
      pwInput.value = '';
      Promise.resolve(request).then(function (result) {
        if (!ownsSession()) return;
        if(!result || result.deleted !== true) throw new Error('Deletion was not confirmed. Please try again.');
        close();
        // Preserve native push cleanup while this is still the deleted session.
        if (window.Capacitor && window.SLPush && window.SLPush.unregister) {
          try { Promise.resolve(window.SLPush.unregister()).catch(function(){}); } catch(_){}
        }
        // End the deleted session through the shared auth lifecycle. The API already
        // revoked its sessions; logout also clears caches and broadcasts locally.
        if (window.SLAuth && window.SLAuth.logout) window.SLAuth.logout({reload:false});

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
        setTimeout(function () { if (!sessionKey()) location.href = '/'; }, 3000);
      }).catch(function (e) {
        if (!ownsSession()) return;
        if (closed) {
          var status = document.getElementById('slAcctStatus');
          if (status) status.textContent = 'Account deletion was not confirmed. Please try again.';
          return;
        }
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
                esc((window.SLApi && window.SLApi.getCurrentUser && (window.SLApi.getCurrentUser()||{}).email) || 'your account email') +
              '</b></p>' +
              '<div class="sl-acct-actions" style="margin-top:18px;">' +
                '<button class="cancel" id="slAcctFallbackClose">Close</button>' +
                '<a class="confirm" style="text-align:center;line-height:1.3;text-decoration:none;display:flex;align-items:center;justify-content:center;" ' +
                'href="mailto:info@scenelink.app?subject=' + subject + '&body=' + body + '">Email info@scenelink.app</a>' +
              '</div>';
            modal.querySelector('#slAcctFallbackClose').addEventListener('click', close);
            modal.querySelector('#slAcctFallbackClose').focus();
          }
          return;
        }
        err.textContent = msg || 'Could not delete account';
        err.style.display = 'block';
        checkReady();
        confirmBtn.textContent = 'Delete permanently';
        pwInput.focus();
      }).finally(function(){ pendingOwners.delete(owner); updateDeleteButton(); });
    });

    // Autofocus
    confirmInput.focus();
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
        '<p id="slAcctStatus" role="status" aria-live="polite"></p>' +
      '</div>';
    main.appendChild(section);
    updateDeleteButton();

    document.getElementById('slAcctLogout').addEventListener('click', function () {
      if (!confirm('Sign out of SceneLink?')) return;
      if (window.SLAuth && window.SLAuth.logout) {
        window.SLAuth.logout({reload:false}).then(function(){
          if (!sessionKey()) location.href = '/';
        });
      }
    });

    document.getElementById('slAcctDeleteBtn').addEventListener('click', function () {
      openDeleteModal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSection);
  } else {
    injectSection();
  }
  function refreshAccount(){
    var current = sessionKey();
    if (current !== observedSession) { sessionGeneration++; observedSession = current; }
    if (closeDialog) closeDialog();
    var section = document.getElementById('slAcctSettings');
    if (section) section.remove();
    injectSection();
  }
  window.addEventListener('sl:explicit-modal', function(){ if (closeDialog) closeDialog(); });
  window.addEventListener('sl-auth-ready', refreshAccount);
  window.addEventListener('sl-auth-changed', refreshAccount);
  window.addEventListener('storage', function(e){
    if (!e.key || e.key === 'sl_jwt_token') refreshAccount();
  });
})();