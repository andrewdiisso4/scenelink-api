/**
 * SL Account Settings — mounts account controls in the owner's Privacy & settings
 * panel, with a main-content fallback for legacy profile pages.
 *
 * Confirmation uses password re-entry or a recent verified provider sign-in,
 * as required by the server for the current account.
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
      '#slspPanelSettings>.sl-acct-settings{margin:16px 0 0;max-width:none;padding:0;}',
      '.sl-acct-card{background:var(--sl-ui-surface,#191e23);border:1px solid var(--sl-ui-border,#49535e);',
      ' border-radius:var(--sl-ui-radius,12px);padding:22px;}',
      '.sl-acct-card h3{margin:0 0 6px 0;font-size:16px;color:var(--sl-ui-text,#f5f6f7);}',
      '.sl-acct-card p{margin:0 0 16px 0;color:var(--sl-ui-muted,#b9c1ca);font-size:14px;line-height:1.5;}',
      '.sl-acct-danger{border-color:rgba(229,57,53,0.35);}',
      '.sl-acct-danger h3{color:#ff8a80;}',
      '.sl-acct-btn{background:transparent;color:#ff8a80;border:1px solid rgba(229,57,53,0.4);',
      ' min-height:44px;padding:10px 16px;border-radius:var(--sl-ui-radius,12px);font-size:14px;font-weight:600;cursor:pointer;',
      ' transition:all 0.15s;}',
      '.sl-acct-btn:hover{background:rgba(229,57,53,0.1);border-color:#e53935;color:#fff;}',
      '.sl-acct-btn.neutral{color:rgba(255,255,255,0.7);border-color:rgba(255,255,255,0.2);}',
      '.sl-acct-btn.neutral:hover{color:#fff;border-color:#D4AF37;}',
      '#slspPanelSettings .sl-acct-btn{background:transparent;color:#ff8a80;border-color:rgba(229,57,53,0.4);}',
      '#slspPanelSettings .sl-acct-btn:hover{background:rgba(229,57,53,0.1);color:#fff;border-color:#e53935;}',
      '#slspPanelSettings .sl-acct-btn.neutral{color:var(--sl-ui-text,#f5f6f7);border-color:var(--sl-ui-border,#49535e);}',
      '#slspPanelSettings .sl-acct-btn.neutral:hover{background:var(--sl-ui-raised,#252b31);border-color:var(--sl-ui-gold,#e3bc54);}',
      '.sl-acct-ov{position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;',
      ' display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;overflow:auto;backdrop-filter:blur(6px);}',
      '.sl-acct-m{background:var(--sl-ui-surface,#191e23);border:1px solid var(--sl-ui-border,#49535e);border-radius:var(--sl-ui-radius,12px);',
      ' width:100%;max-width:460px;max-height:calc(100dvh - 40px);overflow:auto;box-sizing:border-box;padding:28px;color:var(--sl-ui-text,#f5f6f7);box-shadow:var(--sl-ui-shadow,0 18px 60px rgb(0 0 0 / 28%));',
      ' font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.sl-acct-m h2{margin:0 0 10px 0;font-size:20px;color:#ff8a80;}',
      '.sl-acct-m p{margin:0 0 16px 0;color:var(--sl-ui-muted,#b9c1ca);font-size:14px;line-height:1.5;}',
      '.sl-acct-m ul{margin:0 0 18px 20px;padding:0;color:var(--sl-ui-muted,#b9c1ca);font-size:14px;line-height:1.5;}',
      '.sl-acct-m ul li{margin-bottom:4px;}',
      '.sl-acct-m input{width:100%;min-height:44px;background:var(--sl-ui-bg,#101316);',
      ' border:1px solid var(--sl-ui-border,#49535e);color:var(--sl-ui-text,#f5f6f7);border-radius:var(--sl-ui-radius,12px);padding:12px;',
      ' font-size:16px;box-sizing:border-box;margin-bottom:12px;}',
      '.sl-acct-m label{display:block;margin-bottom:6px;color:var(--sl-ui-muted,#b9c1ca);font-size:14px;}',
      '.sl-acct-m .sl-acct-link{min-height:44px;background:none;border:0;padding:8px 0;color:var(--sl-ui-gold,#e3bc54);text-decoration:underline;font:inherit;font-size:14px;cursor:pointer;}',
      '.sl-acct-m [hidden]{display:none!important;}',
      '.sl-acct-settings :focus-visible,.sl-acct-m :focus-visible{outline:3px solid var(--sl-ui-focus,#f4d88e);outline-offset:3px;}',
      '.sl-acct-m .sl-acct-actions{display:flex;gap:10px;margin-top:12px;}',
      '.sl-acct-m .sl-acct-actions button{flex:1;min-height:44px;padding:12px;border-radius:var(--sl-ui-radius,12px);',
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
    var closed = false, generation = sessionGeneration, requirementsTimer = null, requirementsRequest = 0, cancelRequirements = null;
    function ownsSession(){ return sessionKey() === owner && sessionGeneration === generation; }
    function ownsDialog(){ return !closed && ownsSession(); }
    var status = document.getElementById('slAcctStatus');
    if (status) status.textContent = '';

    injectStyle();
    var prev = document.getElementById('slAcctDelOverlay');
    if (prev) prev.remove();

    var pwField =
      '<div id="slAcctPasswordFields" hidden>' +
        '<label for="slAcctPw">Re-enter your SceneLink password</label>' +
        '<input type="password" id="slAcctPw" placeholder="Your password" autocomplete="current-password" disabled>' +
        '<button type="button" id="slAcctRecover" class="sl-acct-link">Forgot your password?</button>' +
      '</div>';

    var ov = document.createElement('div');
    ov.className = 'sl-acct-ov';
    ov.id = 'slAcctDelOverlay';
    ov.innerHTML =
      '<div class="sl-acct-m" role="dialog" aria-modal="true" aria-labelledby="slAcctDelTitle">' +
        '<h2 id="slAcctDelTitle">Delete your account?</h2>' +
        '<p>This is permanent and cannot be undone. The following will be deleted:</p>' +
        '<ul>' +
          '<li>Your profile, posts, reviews, and check-ins</li>' +
          '<li>Your friend connections and messages you sent</li>' +
          '<li>Your plans and all plan invitations</li>' +
          '<li>Your notifications and push-token registrations</li>' +
        '</ul>' +
        '<p>A deletion receipt retains your account ID and deletion time.</p>' +
        '<p>Type <b>DELETE</b> to confirm.</p>' +
        '<input type="text" aria-label="Type DELETE to confirm account deletion" id="slAcctConfirm" placeholder="Type DELETE to confirm" autocomplete="off">' +
        '<p id="slAcctRequirementStatus" role="status" aria-live="polite">Checking how to confirm your account…</p>' +
        '<p id="slAcctAppleRevokeNotice" hidden>Apple access is not revoked automatically. After deletion, we will show how to disconnect SceneLink in your Apple Account settings.</p>' +
        '<button type="button" id="slAcctRetryRequirements" class="sl-acct-link" hidden>Try again</button>' +
        '<button type="button" id="slAcctReauthenticate" class="sl-acct-link" hidden>Sign in again</button>' +
        pwField +
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
      requirementsRequest++;
      if (requirementsTimer) clearTimeout(requirementsTimer);
      if (cancelRequirements) cancelRequirements();
      ov.querySelectorAll("input, textarea").forEach(function(input){ input.value = ""; });
      closeDialog = null;
      try { ov.remove(); } catch(_){}
      document.body.style.overflow = oldOverflow;
      if (returnFocus && returnFocus.isConnected && !returnFocus.disabled) returnFocus.focus();
      else if (ownsSession()) {
        var replacement = document.getElementById('slAcctDeleteBtn');
        if (replacement && !replacement.disabled && !replacement.closest('[hidden]')) replacement.focus();
      }
      document.removeEventListener('keydown', onKey);
    }
    closeDialog = close;
    function onKey(e){
      if(e.key === 'Escape') { e.preventDefault(); close(); return; }
      if(e.key !== 'Tab') return;
      var items = Array.from(ov.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]')).filter(function(item){ return !item.closest('[hidden]'); });
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
    document.getElementById('slAcctReauthenticate').addEventListener('click', function(){
      close();
      if(window.SLAuthUI && window.SLAuthUI.open) window.SLAuthUI.open('login');
    });

    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.getElementById('slAcctCancel').addEventListener('click', close);

    var confirmInput = document.getElementById('slAcctConfirm');
    var pwInput = document.getElementById('slAcctPw');
    var confirmBtn = document.getElementById('slAcctConfirmBtn');
    var confirmation = null;
    var requirementStatus = document.getElementById('slAcctRequirementStatus');
    var retryRequirements = document.getElementById('slAcctRetryRequirements');
    var reauthenticate = document.getElementById('slAcctReauthenticate');

    function checkReady() {
      var typed = (confirmInput.value || '').trim() === 'DELETE';
      var confirmed = confirmation && confirmation.can_delete && (confirmation.method === 'recent_provider_sign_in' || pwInput.value.length >= 1);
      confirmBtn.disabled = deleting || !(typed && confirmed);
    }
    confirmInput.addEventListener('input', checkReady);
    if (pwInput) pwInput.addEventListener('input', checkReady);

    var deleting = false;
    function loadRequirements(){
      var attempt = ++requirementsRequest;
      confirmation = null;
      requirementStatus.textContent = 'Checking how to confirm your account…';
      retryRequirements.hidden = true;
      reauthenticate.hidden = true;
      document.getElementById('slAcctAppleRevokeNotice').hidden = true;
      document.getElementById('slAcctPasswordFields').hidden = true;
      pwInput.disabled = true;
      pwInput.value = '';
      checkReady();
      var request;
      try { request = window.SLApi.accountDeletionRequirements(); } catch(error) { request = Promise.reject(error); }
      var timer;
      var cancel;
      var timeout = new Promise(function(_resolve,reject){
        cancel = cancelRequirements = function(){ reject(new Error('Confirmation check dismissed')); };
        timer = requirementsTimer = setTimeout(function(){ reject(new Error('Confirmation check timed out')); },12000);
      });
      Promise.race([Promise.resolve(request),timeout]).then(function(result){
        if(!ownsDialog() || attempt !== requirementsRequest) return;
        var c = result && result.confirmation;
        if(!c || ['password','recent_provider_sign_in','unavailable'].indexOf(c.method) < 0 ||
          [null,'google','apple'].indexOf(c.provider) < 0 || typeof c.can_delete !== 'boolean' || typeof c.recent_sign_in_required !== 'boolean' || c.recent_sign_in_window_seconds !== 300 ||
          (c.method === 'password' && (!c.can_delete || c.recent_sign_in_required)) ||
          (c.method === 'recent_provider_sign_in' && (!c.provider || c.can_delete === c.recent_sign_in_required)) ||
          (c.method === 'unavailable' && c.can_delete)) throw new Error('Invalid account confirmation response');
        confirmation = c;
        document.getElementById('slAcctAppleRevokeNotice').hidden = c.provider !== 'apple';
        if(c.method === 'password'){
          document.getElementById('slAcctPasswordFields').hidden = false;
          pwInput.disabled = false;
          requirementStatus.textContent = 'Confirm with your SceneLink password.';
        }else if(c.method === 'recent_provider_sign_in'){
          var providerName = c.provider === 'apple' ? 'Apple' : 'Google';
          requirementStatus.textContent = c.can_delete ? 'Your recent '+providerName+' sign-in confirms this account. Type DELETE to continue.' : 'Sign in again with '+providerName+', then reopen account deletion within five minutes.';
          reauthenticate.hidden = c.can_delete;
        }else{
          requirementStatus.textContent = 'We could not confirm an available sign-in method for deletion. Contact info@scenelink.app for help.';
          retryRequirements.hidden = false;
        }
        checkReady();
      }).catch(function(){
        if(!ownsDialog() || attempt !== requirementsRequest) return;
        confirmation = null;
        requirementStatus.textContent = 'We could not confirm how to delete this account. Your account has not been deleted. Please try again.';
        retryRequirements.hidden = false;
        checkReady();
      }).finally(function(){ clearTimeout(timer); if(requirementsTimer === timer) requirementsTimer = null; if(cancelRequirements === cancel) cancelRequirements = null; });
    }
    retryRequirements.addEventListener('click',loadRequirements);
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
      var pw = confirmation.method === 'password' ? pwInput.value : '';
      var reason = '';

      var request;
      try { request = window.SLApi.deleteAccount(pw, reason, 'DELETE'); } catch(e) { request = Promise.reject(e); }
      pwInput.value = '';
      var deletionTimer;
      var deadline = new Promise(function(_resolve,reject){
        deletionTimer = setTimeout(function(){
          var error = new Error('The deletion outcome is unknown because the request timed out. Reload this page to check your account before trying again.');
          error.code = 'ACCOUNT_DELETION_OUTCOME_UNKNOWN';
          reject(error);
        },20000);
      });
      // A hung fetch or response body cannot keep the account controls disabled.
      // Once the deadline wins, later completion must never claim success or
      // clear a session, even if the same person has opened a new request.
      Promise.race([Promise.resolve(request),deadline]).then(function (result) {
        if (!ownsSession()) return;
        if(!result || result.deleted !== true) throw new Error('Deletion was not confirmed. Please try again.');
        var manualAppleRevocation = result.apple_revocation_required === true;
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
                'Your SceneLink account has been deleted. A deletion receipt retains your account ID and deletion time.' +
              '</p>' +
              (manualAppleRevocation ?
                '<p style="color:var(--sl-ui-muted,#b9c1ca);font-size:14px;line-height:1.5;">Apple access has not been revoked automatically. On your iPhone, open Settings, choose your Apple Account, then Sign in with Apple. Select SceneLink and follow Apple&#39;s steps to remove access.</p>' +
                '<p><a id="slAcctAppleRevokeHelp" href="https://support.apple.com/102571" target="_blank" rel="noopener noreferrer" style="color:var(--sl-ui-gold,#e3bc54);">Open Apple&#39;s instructions</a></p>' : '') +
              '<a href="/" style="display:inline-block;background:#D4AF37;color:#000;' +
              'padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Return home</a>' +
            '</div>' +
          '</div>';
        // Keep the remaining Apple instructions available until the person leaves.
        if(!manualAppleRevocation) setTimeout(function () { if (!sessionKey()) location.href = '/'; }, 3000);
      }).catch(function (e) {
        if (!ownsSession()) return;
        var outcomeUnknown = e && e.code === 'ACCOUNT_DELETION_OUTCOME_UNKNOWN';
        if (closed) {
          var status = document.getElementById('slAcctStatus');
          if (status) status.textContent = outcomeUnknown ? e.message : 'Account deletion was not confirmed. Please try again.';
          return;
        }
        deleting = false;
        if(outcomeUnknown) confirmInput.value = '';
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
        if(e && (e.code === 'ACCOUNT_REAUTHENTICATION_REQUIRED' || (e.status === 409 && confirmation && confirmation.method === 'recent_provider_sign_in'))){
          confirmation = null;
          reauthenticate.hidden = false;
          requirementStatus.textContent = 'Sign in again, then reopen account deletion within five minutes.';
        }
        checkReady();
        confirmBtn.textContent = 'Delete permanently';
        if(!reauthenticate.hidden) reauthenticate.focus();
        else if(!pwInput.disabled) pwInput.focus();
        else confirmInput.focus();
      }).finally(function(){ clearTimeout(deletionTimer); pendingOwners.delete(owner); updateDeleteButton(); });
    });

    // Autofocus
    confirmInput.focus();
    loadRequirements();
  }

  function injectSection() {
    if (!isProfilePage()) return;
    if (document.getElementById('slAcctSettings')) return;

    // Only for signed-in users
    var token = null;
    try { token = localStorage.getItem('sl_jwt_token'); } catch(_){}
    if (!token) return;

    // The canonical controller replaces its host after asynchronous profile loads
    // and saves. Only its own-profile settings panel is an account-controls mount.
    var profile = document.getElementById('slSocialProfile');
    var main = profile ? profile.querySelector('#slspPanelSettings') : document.querySelector('main') || document.body;
    if (!main) return;
    injectStyle();
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
        '<p>Permanently delete your account and the content you created. This cannot be undone.</p>' +
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
    if (current !== observedSession) {
      sessionGeneration++; observedSession = current;
      if (closeDialog) closeDialog();
      var section = document.getElementById('slAcctSettings');
      if (section) section.remove();
      // Wait for the new account's profile, independent of auth-listener order.
      if (document.getElementById('slSocialProfile')) return;
    }
    injectSection();
  }
  window.addEventListener('sl:profile-rendered', function(e){
    if (e.target === document.getElementById('slSocialProfile')) injectSection();
  });
  window.addEventListener('sl:explicit-modal', function(){ if (closeDialog) closeDialog(); });
  window.addEventListener('sl-auth-ready', refreshAccount);
  window.addEventListener('sl-auth-changed', refreshAccount);
  window.addEventListener('storage', function(e){
    if (!e.key || e.key === 'sl_jwt_token') refreshAccount();
  });
})();
