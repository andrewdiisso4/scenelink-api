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

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    if (!window.SLApi) return;
    injectStyles();
    tryInject();
    window.addEventListener('sl-auth-ready', tryInject);
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
      }
      .sl-usearch-row:hover { background: rgba(255,255,255,0.04); }
      .sl-usearch-row img { width: 36px; height: 36px; border-radius: 50%; }
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
        display: grid; grid-template-columns: repeat(3,1fr); gap: 12px;
        margin: 16px 0; padding: 12px; background: rgba(255,255,255,0.04);
        border-radius: 10px; text-align: center;
      }
      #slPublicProfile .sl-pp-stat strong { color: #D4AF37; font-size: 18px; display: block; }
      #slPublicProfile .sl-pp-stat small { color: rgba(255,255,255,0.6); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
      #slPublicProfile .sl-pp-actions {
        display: flex; gap: 8px; margin-top: 12px;
      }
      #slPublicProfile .sl-pp-actions button { flex: 1; }
    `;
    document.head.appendChild(st);
  }

  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function avatar(u) {
    if (!u) return (window.SL_AVATAR ? SL_AVATAR('?') : 'https://ui-avatars.com/api/?name=?&size=88&background=D4AF37&color=0a0a0a');
    if (u.avatar_url) return u.avatar_url;
    var n = u.display_name || u.username || '?';
    return (window.SL_AVATAR ? SL_AVATAR(n) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) + '&size=88&background=D4AF37&color=0a0a0a');
  }

  function tryInject() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) {
      var existing = document.querySelector('.sl-usearch-wrap');
      if (existing) existing.remove();
      return;
    }
    if (document.querySelector('.sl-usearch-wrap')) return;

    var trigger = document.querySelector('.sl-bell-wrap') ||
                  document.querySelector('.nav-right .sl-auth-trigger') ||
                  document.querySelector('.nav-right button');
    if (!trigger || !trigger.parentElement) return;

    var wrap = document.createElement('div');
    wrap.className = 'sl-usearch-wrap';
    wrap.innerHTML =
      '<button class="sl-usearch-btn" id="slUSearchBtn" aria-label="Find people"><i class="fas fa-search"></i></button>' +
      '<div class="sl-usearch-panel" id="slUSearchPanel">' +
      '  <input type="text" id="slUSearchInput" placeholder="Search people by username…" autocomplete="off">' +
      '  <div class="sl-usearch-results" id="slUSearchResults">' +
      '    <div class="sl-usearch-empty">Type at least 2 characters</div>' +
      '  </div>' +
      '</div>';
    trigger.parentElement.insertBefore(wrap, trigger);

    var btn = document.getElementById('slUSearchBtn');
    var panel = document.getElementById('slUSearchPanel');
    var input = document.getElementById('slUSearchInput');
    var results = document.getElementById('slUSearchResults');

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) input.focus();
    });
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open') && !wrap.contains(e.target)) {
        panel.classList.remove('open');
      }
    });

    var timer = null;
    input.addEventListener('input', function () {
      var q = this.value.trim();
      clearTimeout(timer);
      if (q.length < 2) {
        results.innerHTML = '<div class="sl-usearch-empty">Type at least 2 characters</div>';
        return;
      }
      results.innerHTML = '<div class="sl-usearch-empty"><i class="fas fa-spinner fa-spin"></i></div>';
      timer = setTimeout(function () {
        SLApi.searchUsers(q, 10).then(function (r) {
          var users = (r && (r.users || r.results)) || [];
          if (users.length === 0) {
            results.innerHTML = '<div class="sl-usearch-empty">No users found</div>';
            return;
          }
          results.innerHTML = users.map(function (u) {
            return (
              '<div class="sl-usearch-row" data-user="' + esc(u.username || u.id) + '">' +
              '  <img src="' + esc(avatar(u)) + '" alt="">' +
              '  <div class="sl-usearch-meta">' +
              '    <strong>' + esc(u.display_name || u.username) + '</strong>' +
              '    <small>@' + esc(u.username || '') + '</small>' +
              '  </div>' +
              '</div>'
            );
          }).join('');
          results.querySelectorAll('.sl-usearch-row').forEach(function (row) {
            row.addEventListener('click', function () {
              panel.classList.remove('open');
              openPublicProfile(this.dataset.user);
            });
          });
        }).catch(function () {
          results.innerHTML = '<div class="sl-usearch-empty" style="color:#e57373;">Search failed</div>';
        });
      }, 280);
    });
  }

  // ---------- Public profile modal ----------
  function buildPublicProfile() {
    if (document.getElementById('slPublicProfile')) return;
    var m = document.createElement('div');
    m.id = 'slPublicProfile';
    m.className = 'sl-modal-overlay';
    m.innerHTML =
      '<div class="sl-modal" style="max-width:460px;">' +
      '  <div class="sl-modal-header">' +
      '    <h2>Profile</h2>' +
      '    <button class="sl-modal-close" data-close="slPublicProfile"><i class="fas fa-times"></i></button>' +
      '  </div>' +
      '  <div class="sl-modal-body" id="slPPBody" style="padding-top:24px;">' +
      '    <div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i></div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(m);
    m.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () {
        m.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  function openPublicProfile(identifier) {
    buildPublicProfile();
    var m = document.getElementById('slPublicProfile');
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
    var body = document.getElementById('slPPBody');
    body.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i></div>';

    SLApi.userByIdentifier(identifier).then(function (r) {
      var u = (r && r.user) || r;
      if (!u) throw new Error('No user');
      var stats = u.stats || {
        post_count: u.post_count || 0,
        checkin_count: u.checkin_count || 0,
        friend_count: u.friend_count || 0,
        review_count: u.review_count || 0
      };
      var status = u.friendship_status || r.friendship_status || 'none';

      body.innerHTML =
        '<div class="sl-pp-cover"></div>' +
        '<img class="sl-pp-avatar" src="' + esc(avatar(u)) + '">' +
        '<h2 style="color:#fff;margin:8px 0 2px;">' + esc(u.display_name || u.username) + '</h2>' +
        '<div style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:4px;">@' + esc(u.username || '') + '</div>' +
        (u.bio ? '<p style="color:#ccc;font-size:14px;margin:8px 0;line-height:1.5;">' + esc(u.bio) + '</p>' : '') +
        '<div class="sl-pp-stats">' +
        '  <div class="sl-pp-stat"><strong>' + (stats.post_count || 0) + '</strong><small>Posts</small></div>' +
        '  <div class="sl-pp-stat"><strong>' + (stats.checkin_count || 0) + '</strong><small>Check-ins</small></div>' +
        '  <div class="sl-pp-stat"><strong>' + (stats.friend_count || 0) + '</strong><small>Friends</small></div>' +
        '</div>' +
        renderActions(u, status);

      wireActions(u, status);
    }).catch(function (e) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#e57373;">' + esc(e.message || 'Could not load profile') + '</div>';
    });
  }

  function renderActions(u, status) {
    var myId = window.SL_USER && window.SL_USER.id;
    if (myId === u.id) {
      return '<div class="sl-pp-actions"><button class="sl-btn sl-btn-secondary" onclick="window.location.href=\'/profile.html\'">View My Profile</button></div>';
    }
    var html = '<div class="sl-pp-actions">';
    if (status === 'accepted' || status === 'friends') {
      html += '<button class="sl-btn sl-btn-secondary" data-pp-act="remove">Remove Friend</button>';
      html += '<button class="sl-btn sl-btn-primary" data-pp-act="message"><i class="fas fa-envelope"></i> Message</button>';
    } else if (status === 'pending_out') {
      html += '<button class="sl-btn sl-btn-secondary" data-pp-act="cancel">Cancel Request</button>';
      html += '<button class="sl-btn sl-btn-primary" data-pp-act="message"><i class="fas fa-envelope"></i> Message</button>';
    } else if (status === 'pending_in') {
      html += '<button class="sl-btn sl-btn-primary" data-pp-act="accept">Accept Request</button>';
      html += '<button class="sl-btn sl-btn-secondary" data-pp-act="decline">Decline</button>';
    } else {
      html += '<button class="sl-btn sl-btn-primary" data-pp-act="request"><i class="fas fa-user-plus"></i> Add Friend</button>';
      html += '<button class="sl-btn sl-btn-secondary" data-pp-act="message"><i class="fas fa-envelope"></i> Message</button>';
    }
    html += '</div>';
    return html;
  }

  function wireActions(u, status) {
    document.querySelectorAll('[data-pp-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = this.dataset.ppAct;
        var userId = u.id;
        var username = u.username;
        var origHTML = this.innerHTML;
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        var done = function (msg, refresh) {
          if (msg && window.SLToast) window.SLToast(msg, 2500, 'success');
          if (refresh) openPublicProfile(username || userId);
        };
        var fail = function (e) {
          if (window.SLToast) window.SLToast((e && e.message) || 'Failed', 2800, 'error');
          btn.disabled = false;
          btn.innerHTML = origHTML;
        };
        switch (act) {
          case 'request':
            SLApi.sendFriendRequest({ user_id: userId }).then(function () { done('Friend request sent', true); }).catch(fail);
            break;
          case 'cancel':
          case 'remove':
            SLApi.removeFriend(userId).then(function () { done(act === 'remove' ? 'Friend removed' : 'Request cancelled', true); }).catch(fail);
            break;
          case 'accept':
            SLApi.friendsPending().then(function (r) {
              var inc = (r && r.incoming) || [];
              var match = inc.filter(function (x) { return x.other_user_id === userId || x.requester_id === userId; })[0];
              if (!match) throw new Error('No pending request');
              return SLApi.acceptFriend(match.friendship_id);
            }).then(function () { done('Friend accepted 🎉', true); }).catch(fail);
            break;
          case 'decline':
            SLApi.friendsPending().then(function (r) {
              var inc = (r && r.incoming) || [];
              var match = inc.filter(function (x) { return x.other_user_id === userId || x.requester_id === userId; })[0];
              if (!match) throw new Error('No pending request');
              return SLApi.declineFriend(match.friendship_id);
            }).then(function () { done('Declined', true); }).catch(fail);
            break;
          case 'message':
            document.getElementById('slPublicProfile').classList.remove('active');
            document.body.style.overflow = '';
            window.location.href = '/messages.html?user=' + encodeURIComponent(userId);
            break;
        }
      });
    });
  }

  window.SLUserSearch = { openProfile: openPublicProfile };
})();