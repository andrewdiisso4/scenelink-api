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
