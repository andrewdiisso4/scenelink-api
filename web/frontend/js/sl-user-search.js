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
  if (window.__slUserSearchLoaded) return;
  window.__slUserSearchLoaded = true;
  var session, epoch = 0, searchSerial = 0, profileSerial = 0, searchTimer, returnFocus, previousOverflow;
  var uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    if (!window.SLApi) return;
    injectStyles();
    refreshSession();
    ['sl-auth-ready', 'sl-auth-change', 'sl-auth-changed'].forEach(function (name) {
      window.addEventListener(name, function () { refreshSession(true); });
      document.addEventListener(name, function () { refreshSession(true); });
    });
    window.addEventListener('storage', function (event) {
      if (event.key === 'sl_jwt_token' || event.key === null) refreshSession(true);
    });
    window.addEventListener('sl:explicit-modal', function () {
      closeSearch(); closePublicProfile();
    });
    document.addEventListener('click', function (event) {
      var wrap = document.querySelector('.sl-usearch-wrap');
      if (wrap && !wrap.contains(event.target)) closeSearch();
    });
    document.addEventListener('keydown', function (event) {
      var modal = document.getElementById('slPublicProfile');
      if (event.key === 'Escape') { closeSearch(); closePublicProfile(); }
      if (modal && event.key === 'Tab') {
        var controls = Array.from(modal.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled)'));
        var first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
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
        width: 100%; border: 0; background: transparent; text-align: left; color: inherit;
      }
      .sl-usearch-row:hover { background: rgba(255,255,255,0.04); }
      .sl-usearch-avatar { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; }
      .sl-usearch-row:focus-visible, #slPublicProfile button:focus-visible, #slPublicProfile a:focus-visible { outline: 2px solid #D4AF37; outline-offset: 3px; }
      .sl-pp-initial { display: inline-flex; align-items: center; justify-content: center; color: #D4AF37; background: #222; font-weight: 700; }
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
        display: grid; grid-template-columns: repeat(2,1fr); gap: 12px;
        margin: 16px 0; padding: 12px; background: rgba(255,255,255,0.04);
        border-radius: 10px; text-align: center;
      }
      #slPublicProfile .sl-pp-stat strong { color: #D4AF37; font-size: 18px; display: block; }
      #slPublicProfile .sl-pp-stat small { color: rgba(255,255,255,0.6); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
      #slPublicProfile .sl-pp-actions {
        display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;
      }
      #slPublicProfile .sl-pp-actions button { flex: 1; }
    `;
    document.head.appendChild(st);
  }

  function esc(value) { return value == null ? '' : String(value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function token() { try { return window.SLApi && window.SLApi.getToken ? window.SLApi.getToken() || '' : localStorage.getItem('sl_jwt_token') || ''; } catch (_) { return ''; } }
  function current(ticket) { return ticket.epoch === epoch && ticket.session === session && ticket.session === token(); }
  function refreshSession(force) {
    var next = token();
    if (force || next !== session) {
      session = next; epoch++; searchSerial++; clearTimeout(searchTimer);
      closePublicProfile();
      var wrap = document.querySelector('.sl-usearch-wrap'); if (wrap) wrap.remove();
    }
    tryInject();
  }
  function avatarHTML(user, className) {
    var value = user.avatar_url, url;
    try { url = typeof value === 'string' && value.length <= 2048 ? new URL(value) : null; } catch (_) { url = null; }
    if (url && url.protocol === 'https:' && !url.username && !url.password) return '<img class="' + className + '" src="' + esc(url.href) + '" alt="" referrerpolicy="no-referrer">';
    return '<span class="' + className + ' sl-pp-initial" aria-hidden="true">' + esc(String(user.display_name || user.username || '?').trim().slice(0, 1).toUpperCase()) + '</span>';
  }
  function closeSearch() {
    var panel = document.getElementById('slUSearchPanel'), button = document.getElementById('slUSearchBtn');
    if (panel) panel.classList.remove('open'); if (button) button.setAttribute('aria-expanded', 'false');
  }
  function resetSearch() {
    searchSerial++; clearTimeout(searchTimer); closeSearch();
    var input = document.getElementById('slUSearchInput'), results = document.getElementById('slUSearchResults');
    if (input) input.value = '';
    if (results) results.innerHTML = '<div class="sl-usearch-empty">Type at least 2 characters</div>';
  }
  function tryInject() {
    if (!window.SLApi || !token()) return;
    if (document.querySelector('.sl-usearch-wrap')) return;
    var trigger = document.querySelector('.sl-bell-wrap') || document.querySelector('.nav-right .sl-auth-trigger') || document.querySelector('.nav-right button');
    if (!trigger || !trigger.parentElement) return;
    var wrap = document.createElement('div'); wrap.className = 'sl-usearch-wrap';
    wrap.innerHTML = '<button type="button" class="sl-usearch-btn" id="slUSearchBtn" aria-label="Find people" aria-expanded="false" aria-controls="slUSearchPanel"><i class="fas fa-search" aria-hidden="true"></i></button>' +
      '<div class="sl-usearch-panel" id="slUSearchPanel"><input type="search" id="slUSearchInput" aria-label="Search people by username" placeholder="Search people by username…" maxlength="80" autocomplete="off">' +
      '<div class="sl-usearch-results" id="slUSearchResults" role="status" aria-live="polite"><div class="sl-usearch-empty">Type at least 2 characters</div></div></div>';
    trigger.parentElement.insertBefore(wrap, trigger);
    var button = wrap.querySelector('#slUSearchBtn'), panel = wrap.querySelector('#slUSearchPanel'), input = wrap.querySelector('#slUSearchInput'), results = wrap.querySelector('#slUSearchResults');
    button.addEventListener('click', function (event) {
      event.stopPropagation(); if (token() !== session) { refreshSession(); return; }
      panel.classList.toggle('open'); button.setAttribute('aria-expanded', String(panel.classList.contains('open')));
      if (panel.classList.contains('open')) input.focus();
    });
    function search() {
      if (token() !== session) { refreshSession(); return; }
      var query = input.value.trim(), ticket = { epoch: epoch, session: session, serial: ++searchSerial };
      clearTimeout(searchTimer);
      function valid() { return current(ticket) && ticket.serial === searchSerial && wrap.isConnected && input.value.trim() === query; }
      if (query.replace(/^@/, '').length < 2) { results.innerHTML = '<div class="sl-usearch-empty">Type at least 2 characters</div>'; return; }
      results.innerHTML = '<div class="sl-usearch-empty">Searching people…</div>';
      searchTimer = setTimeout(function () {
        if (!valid()) return;
        Promise.resolve().then(function () { if (valid()) return window.SLApi.searchUsers(query, 10); }).then(function (response) {
          if (!valid()) return;
          var users = response && (response.results || response.users);
          if (!Array.isArray(users) || users.some(function (u) { return !u || !uuid.test(u.id || ''); })) throw new Error('People search returned an incomplete response.');
          results.innerHTML = users.length ? users.map(function (u) {
            return '<button type="button" class="sl-usearch-row" data-user="' + esc(u.id) + '">' + avatarHTML(u, 'sl-usearch-avatar') + '<span class="sl-usearch-meta"><strong>' + esc(u.display_name || u.username || 'SceneLink member') + '</strong><small>' + esc(u.username ? '@' + u.username : '') + '</small></span></button>';
          }).join('') : '<div class="sl-usearch-empty">No visible matches. Try an exact @username.</div>';
          results.querySelectorAll('[data-user]').forEach(function (row) { row.addEventListener('click', function () { if (valid()) { closeSearch(); openPublicProfile(row.dataset.user); } }); });
        }).catch(function () {
          if (!valid()) return;
          results.innerHTML = '<div class="sl-usearch-empty">People search could not be loaded. <button type="button">Retry search</button></div>';
          results.querySelector('button').addEventListener('click', search);
        });
      }, 280);
    }
    input.addEventListener('input', search);
  }

  // This modal owns its actions. Legacy decorators must not perform additional
  // profile reads or attach actions whose identity/session has already changed.
  function buildPublicProfile() {
    var modal = document.getElementById('slPublicProfile'); if (modal) return modal;
    modal = document.createElement('div'); modal.id = 'slPublicProfile'; modal.className = 'sl-modal-overlay';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'slPPTitle');
    modal.innerHTML = '<div class="sl-modal" style="max-width:460px;"><div class="sl-modal-header"><h2 id="slPPTitle">Profile</h2><button type="button" class="sl-modal-close" data-close="slPublicProfile" aria-label="Close profile"><i class="fas fa-times" aria-hidden="true"></i></button></div><div class="sl-modal-body" id="slPPBody" data-sl-profile-managed="true" style="padding-top:24px;"></div></div>';
    modal.querySelector('[data-close]').addEventListener('click', closePublicProfile);
    modal.addEventListener('click', function (event) { if (event.target === modal) closePublicProfile(); });
    document.body.appendChild(modal); return modal;
  }
  function closePublicProfile() {
    profileSerial++;
    var modal = document.getElementById('slPublicProfile');
    if (!modal) return;
    modal.remove(); document.body.style.overflow = previousOverflow || ''; previousOverflow = undefined;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus(); returnFocus = null;
  }
  function profileCurrent(context) { return current(context) && context.serial === profileSerial && context.modal.isConnected && context.modal.classList.contains('active'); }
  function statusHTML(message) { return '<p id="slPPStatus" role="status" aria-live="polite">' + esc(message || '') + '</p>'; }
  function openPublicProfile(identifier, confirmation) {
    if (!window.SLApi) return;
    if (token() !== session) refreshSession();
    var modal = buildPublicProfile(), body = modal.querySelector('#slPPBody');
    if (!modal.classList.contains('active')) { returnFocus = document.activeElement; previousOverflow = document.body.style.overflow; }
    modal.classList.add('active'); document.body.style.overflow = 'hidden';
    var context = { epoch: epoch, session: session, serial: ++profileSerial, modal: modal, body: body, busy: false };
    body.innerHTML = '<p role="status">Loading profile…</p>' + statusHTML(confirmation);
    modal.querySelector('[data-close]').focus();
    return Promise.resolve().then(function () { if (profileCurrent(context)) return window.SLApi.userByIdentifier(identifier); }).then(function (response) {
      if (!profileCurrent(context)) return;
      var user = response && response.user, relation = response && response.friendship_status;
      if (!user || !uuid.test(user.id || '') || (uuid.test(identifier) && user.id.toLowerCase() !== identifier.toLowerCase()) || typeof response.can_view !== 'boolean' || typeof response.is_me !== 'boolean' ||
          (relation && (!uuid.test(relation.id || '') || !['accepted', 'pending', 'declined'].includes(relation.status) || relation.status === 'pending' && !['incoming', 'outgoing'].includes(relation.direction)))) throw new Error('Profile returned an incomplete response. Please retry.');
      context.user = user; context.profile = response;
      var counts = response.can_view ? [['post_count', 'Posts'], ['friend_count', 'Friends']].filter(function (item) { return Number.isSafeInteger(user[item[0]]) && user[item[0]] >= 0; }) : [];
      body.innerHTML = '<div class="sl-pp-cover"></div>' + avatarHTML(user, 'sl-pp-avatar') + '<h2 style="color:#fff;margin:8px 0 2px;">' + esc(user.display_name || user.username || 'SceneLink member') + '</h2>' +
        '<div class="sl-pp-username" style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:4px;">' + esc(user.username ? '@' + user.username : '') + '</div>' +
        (response.can_view && user.bio ? '<p style="color:#ccc;font-size:14px;margin:8px 0;line-height:1.5;">' + esc(user.bio) + '</p>' : '') +
        (!response.can_view ? '<p>This profile is private. An accepted friendship is required to see shared details.</p>' : '') +
        (counts.length ? '<div class="sl-pp-stats">' + counts.map(function (item) { return '<div class="sl-pp-stat"><strong>' + user[item[0]] + '</strong><small>' + item[1] + '</small></div>'; }).join('') + '</div>' : '') +
        renderActions(context) + statusHTML(confirmation) + '<p><a href="/profile?u=' + encodeURIComponent(user.id) + '">View ' + (response.is_me ? 'my' : 'full') + ' profile</a></p>';
      body.querySelectorAll('[data-pp-act]').forEach(function (button) { button.addEventListener('click', function () { act(context, button.dataset.ppAct); }); });
    }).catch(function (error) {
      if (!profileCurrent(context)) return;
      body.innerHTML = '<p role="alert">' + esc(error && error.message || 'Could not load profile.') + '</p>' + statusHTML(confirmation) + '<button type="button" data-profile-retry>Retry profile</button>';
      body.querySelector('[data-profile-retry]').addEventListener('click', function () { if (profileCurrent(context)) openPublicProfile(identifier, confirmation); });
    });
  }
  function actionButton(action, label) { return '<button type="button" class="sl-btn sl-btn-secondary" data-pp-act="' + action + '">' + label + '</button>'; }
  function renderActions(context) {
    var profile = context.profile, relation = profile.friendship_status, actions = '';
    if (profile.is_me) return '';
    if (!context.session) return '<button type="button" class="sl-auth-trigger sl-btn sl-btn-primary">Sign in to connect</button>';
    if (relation && relation.status === 'accepted') actions += actionButton('remove', 'Remove Friend');
    else if (relation && relation.status === 'pending' && relation.direction === 'incoming') actions += actionButton('accept', 'Accept Request') + actionButton('decline', 'Decline');
    else if (relation && relation.status === 'pending' && relation.direction === 'outgoing') actions += actionButton('cancel', 'Cancel Request');
    else actions += actionButton('request', 'Add Friend');
    if (profile.can_message === true) actions += actionButton('message', 'Message');
    actions += actionButton('block', 'Block');
    return '<div class="sl-pp-actions">' + actions + '</div>' + (profile.can_message === true ? '' : '<p>Messaging is unavailable under the current privacy settings.</p>');
  }
  function confirmationFor(action, result, context) {
    var user = context.user, relation = context.profile.friendship_status;
    function unconfirmed() { throw new Error('The service did not confirm this change. Reload the profile before trying again.'); }
    if (!result || typeof result !== 'object') return unconfirmed();
    if (action === 'request') {
      if (!uuid.test(result.friendship_id || '')) return unconfirmed();
      if (result.status === 'accepted') return 'You are already friends.';
      if (result.status !== 'pending' || !['incoming', 'outgoing'].includes(result.direction)) return unconfirmed();
      return result.direction === 'incoming' ? 'This member already sent you a request. Accept it to become friends.' : 'Friend request sent. It is pending until this member accepts.';
    }
    if (action === 'accept' || action === 'decline') {
      if (!relation || result.friendship_id !== relation.id || result.status !== (action === 'accept' ? 'accepted' : 'declined')) return unconfirmed();
      return action === 'accept' ? 'Friend request accepted.' : 'Request declined.';
    }
    if (action === 'cancel' || action === 'remove') {
      if (result.removed !== true || result.user_id !== user.id) return unconfirmed();
      return action === 'cancel' ? 'Request cancelled.' : 'Friend removed.';
    }
    if (action === 'block' && result.success === true && result.blocked_id === user.id) return 'Member blocked. Any friendship has ended.';
    return unconfirmed();
  }
  function act(context, action) {
    if (token() !== session) { refreshSession(); return; }
    if (!profileCurrent(context) || !context.session || context.busy) return;
    if (action === 'message') {
      if (context.profile.can_message === true) { closePublicProfile(); window.location.href = '/messages?to=' + encodeURIComponent(context.user.id); }
      return;
    }
    if (['remove', 'cancel', 'block'].includes(action) && !window.confirm(action === 'block' ? 'Block this member? This ends any friendship and prevents contact.' : action === 'cancel' ? 'Cancel this pending friend request?' : 'Remove this friendship?')) return;
    if (!profileCurrent(context)) return;
    var relation = context.profile.friendship_status, api = window.SLApi, id = context.user.id;
    var methods = { request: ['sendFriendRequest', { user_id: id }], accept: ['acceptFriend', relation && relation.id], decline: ['declineFriend', relation && relation.id], cancel: ['removeFriend', id], remove: ['removeFriend', id], block: ['blockUser', id] };
    var operation = methods[action]; if (!operation) return;
    context.busy = true;
    var controls = context.body.querySelectorAll('[data-pp-act]'); controls.forEach(function (button) { button.disabled = true; });
    context.body.querySelector('#slPPStatus').textContent = 'Saving your choice…';
    Promise.resolve().then(function () { if (profileCurrent(context)) return api[operation[0]](operation[1]); }).then(function (result) {
      if (!profileCurrent(context)) return;
      var message = confirmationFor(action, result, context);
      if (window.SLToast) window.SLToast(message, 3000, 'success');
      if (action === 'block') { resetSearch(); closePublicProfile(); }
      else openPublicProfile(id, message);
    }).catch(function (error) {
      if (!profileCurrent(context)) return;
      var message = error && error.message || 'Could not save your choice. Please retry.';
      context.body.querySelector('#slPPStatus').textContent = message;
      if (window.SLToast) window.SLToast(message, 3000, 'error');
    }).finally(function () {
      context.busy = false;
      if (profileCurrent(context)) controls.forEach(function (button) { button.disabled = false; });
    });
  }
  window.SLUserSearch = { openProfile: openPublicProfile };
})();
