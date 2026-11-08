/**
 * SceneLink — Plans V2 augmentations
 *
 * Adds to plan-with-friends.html (and related pages):
 *   1. Incoming plan-invite banner at top when SLApi.incomingPlanInvites() returns any
 *   2. Plan-detail modal (open via window.SLPlansV2.openDetail(planId))
 *      - Shows stops with delete button
 *      - Invite-by-username form
 *      - Accept/decline actions for invites
 *      - Share plan button (creates a post)
 *
 * Does NOT touch the existing demo plan cards or create-plan modal.
 */
(function () {
  'use strict';
    if (window.SL_CONNECTED_PLANS) return;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    if (!window.SLApi) return;
    injectStyles();
    renderInvitesBanner();
    // Re-check when login completes
    window.addEventListener('sl-auth-ready', renderInvitesBanner);
    // Poll every 60s for new invites when on plan page
    if (/plan-with-friends/.test(location.pathname)) {
      setInterval(renderInvitesBanner, 60000);
    }
  });

  function injectStyles() {
    if (document.getElementById('sl-plans-v2-style')) return;
    var st = document.createElement('style');
    st.id = 'sl-plans-v2-style';
    st.textContent = `
      .sl-invites-banner {
        max-width: 1100px; margin: 16px auto; padding: 0 20px;
      }
      .sl-invites-card {
        background: linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.04));
        border: 1px solid rgba(212,175,55,0.35); border-radius: 14px;
        padding: 16px 20px;
      }
      .sl-invites-card h3 {
        color: #D4AF37; margin: 0 0 12px; font-size: 16px; display:flex; align-items:center; gap:8px;
      }
      .sl-invite-row {
        display: flex; align-items: center; gap: 12px; padding: 8px 0;
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .sl-invite-row:first-of-type { border-top: 0; }
      .sl-invite-row img { width: 36px; height: 36px; border-radius: 50%; }
      .sl-invite-row .sl-invite-meta { flex: 1; min-width: 0; color: #fff; font-size: 14px; }
      .sl-invite-row .sl-invite-meta small { display:block; color: rgba(255,255,255,0.5); font-size: 12px; }
      .sl-invite-row button {
        background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #fff;
        padding: 6px 12px; border-radius: 8px; font-size: 12px; cursor: pointer;
        margin-left: 6px; transition: all 0.15s;
      }
      .sl-invite-row button:hover { border-color: #D4AF37; color: #D4AF37; }
      .sl-invite-row button.primary {
        background: linear-gradient(135deg, #D4AF37, #b8860b); color: #000; border: 0; font-weight: 700;
      }

      #slPlanDetailModal .sl-plan-stops {
        display: flex; flex-direction: column; gap: 10px;
      }
      #slPlanDetailModal .sl-plan-stop {
        display: flex; gap: 12px; padding: 12px; background: rgba(255,255,255,0.04);
        border-radius: 10px; align-items: center;
      }
      #slPlanDetailModal .sl-plan-stop .sl-stop-order {
        background: #D4AF37; color: #000; width: 28px; height: 28px;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 13px; flex-shrink: 0;
      }
      #slPlanDetailModal .sl-plan-stop .sl-stop-meta { flex: 1; min-width: 0; }
      #slPlanDetailModal .sl-plan-stop .sl-stop-meta strong { color: #fff; display: block; }
      #slPlanDetailModal .sl-plan-stop .sl-stop-meta small { color: rgba(255,255,255,0.5); }
      #slPlanDetailModal .sl-plan-stop button {
        background: transparent; border: 0; color: #e57373; cursor: pointer;
      }
      #slPlanDetailModal .sl-plan-members {
        display: flex; flex-wrap: wrap; gap: 8px;
      }
      #slPlanDetailModal .sl-plan-member {
        display: flex; align-items: center; gap: 6px;
        background: rgba(255,255,255,0.05); padding: 4px 10px 4px 4px;
        border-radius: 16px; font-size: 12px; color: #fff;
      }
      #slPlanDetailModal .sl-plan-member img {
        width: 24px; height: 24px; border-radius: 50%;
      }
      #slPlanDetailModal .sl-invite-form {
        display: flex; gap: 8px; margin-top: 8px;
      }
      #slPlanDetailModal .sl-invite-form input {
        flex: 1; background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1); color: #fff;
        padding: 8px 12px; border-radius: 8px; font-size: 13px;
      }
    `;
    document.head.appendChild(st);
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function avatar(u) {
    if (!u) return (window.SL_AVATAR ? SL_AVATAR('?') : 'https://ui-avatars.com/api/?name=?&size=36&background=D4AF37&color=0a0a0a');
    if (u.avatar_url) return u.avatar_url;
    var n = u.display_name || u.username || '?';
    return (window.SL_AVATAR ? SL_AVATAR(n) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) +
      '&size=36&background=D4AF37&color=0a0a0a');
  }

  // ---------- Invites banner ----------
  function renderInvitesBanner() {
    if (!window.SLApi || !window.SLApi.isLoggedIn()) return;
    if (!/plan-with-friends/.test(location.pathname)) return;

    SLApi.incomingPlanInvites().then(function (r) {
      var invites = (r && r.invites) || [];
      var existing = document.getElementById('slInvitesBanner');
      if (existing) existing.remove();
      if (invites.length === 0) return;

      var banner = document.createElement('div');
      banner.className = 'sl-invites-banner';
      banner.id = 'slInvitesBanner';
      banner.innerHTML =
        '<div class="sl-invites-card">' +
        '<h3><i class="fas fa-envelope-open-text"></i> ' +
          invites.length + ' plan invite' + (invites.length === 1 ? '' : 's') + '</h3>' +
        invites.map(function (inv) {
          var u = { display_name: inv.inviter_display_name, username: inv.inviter_username, avatar_url: inv.inviter_avatar_url };
          return (
            '<div class="sl-invite-row" data-invite-id="' + esc(inv.invite_id || inv.id) + '" data-plan-id="' + esc(inv.plan_id) + '">' +
            '  <img src="' + esc(avatar(u)) + '" alt="">' +
            '  <div class="sl-invite-meta">' +
            '    <strong>' + esc(inv.plan_name || 'A plan') + '</strong>' +
            '    <small>from ' + esc(u.display_name || u.username || 'someone') + (inv.plan_date ? ' · ' + esc(inv.plan_date) : '') + '</small>' +
            '  </div>' +
            '  <button class="primary" data-act="accept">Accept</button>' +
            '  <button data-act="decline">Decline</button>' +
            '</div>'
          );
        }).join('') +
        '</div>';

      // Insert after the hero section (before #pwfPlansSection)
      var anchor = document.getElementById('pwfPlansSection') || document.querySelector('main') || document.body;
      anchor.parentNode.insertBefore(banner, anchor);

      banner.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = this.closest('.sl-invite-row');
          var act = this.dataset.act;
          var planId = row.dataset.planId;
          var inviteId = row.dataset.inviteId;
          this.disabled = true;
          this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          var fn = act === 'accept' ? SLApi.acceptPlanInvite : SLApi.declinePlanInvite;
          fn.call(SLApi, planId, inviteId).then(function () {
            if (window.SLToast) window.SLToast(act === 'accept' ? 'Joined plan 🎉' : 'Invite declined', 2500, act === 'accept' ? 'success' : null);
            row.remove();
            // If empty, remove banner
            if (!banner.querySelector('.sl-invite-row')) banner.remove();
          }).catch(function (e) {
            if (window.SLToast) window.SLToast(e.message || 'Failed', 2800, 'error');
            btn.disabled = false;
            btn.textContent = act === 'accept' ? 'Accept' : 'Decline';
          });
        });
      });
    }).catch(function () {});
  }

  // ---------- Plan-detail modal ----------
  function buildPlanDetailModal() {
    if (document.getElementById('slPlanDetailModal')) return;
    var m = document.createElement('div');
    m.id = 'slPlanDetailModal';
    m.className = 'sl-modal-overlay';
    m.innerHTML =
      '<div class="sl-modal" style="max-width:600px;">' +
      '  <div class="sl-modal-header">' +
      '    <h2 id="slPlanDetailTitle">Plan</h2>' +
      '    <button class="sl-modal-close" data-close="slPlanDetailModal"><i class="fas fa-times"></i></button>' +
      '  </div>' +
      '  <div class="sl-modal-body" id="slPlanDetailBody">' +
      '    <div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i></div>' +
      '  </div>' +
      '  <div class="sl-modal-footer">' +
      '    <button class="sl-btn sl-btn-secondary" id="slPlanShareBtn"><i class="fas fa-share"></i> Share to Feed</button>' +
      '    <button class="sl-btn sl-btn-primary" data-close="slPlanDetailModal">Close</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(m);

    m.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () {
        m.classList.remove('active');
        document.body.style.overflow = '';
      });
    });

    document.getElementById('slPlanShareBtn').addEventListener('click', function () {
      var pid = m.dataset.planId;
      if (!pid) return;
      var btn = this;
      btn.disabled = true;
      SLApi.sharePlan(pid).then(function () {
        if (window.SLToast) window.SLToast('Plan shared to your feed', 2500, 'success');
      }).catch(function (e) {
        if (window.SLToast) window.SLToast(e.message || 'Share failed', 2500, 'error');
      }).finally(function () { btn.disabled = false; });
    });
  }

  function openDetail(planId) {
    if (!SLApi.isLoggedIn()) {
      var trig = document.querySelector('.sl-auth-trigger');
      if (trig) trig.click();
      return;
    }
    buildPlanDetailModal();
    var m = document.getElementById('slPlanDetailModal');
    m.dataset.planId = planId;
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
    loadPlan(planId);
  }

  function loadPlan(planId) {
    var body = document.getElementById('slPlanDetailBody');
    body.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i></div>';
    SLApi.planById(planId).then(function (r) {
      var p = (r && r.plan) || r;
      if (!p) throw new Error('No plan');

      document.getElementById('slPlanDetailTitle').textContent = p.name || 'Plan';

      var stops = p.stops || [];
      var members = p.members || [];
      var invites = p.invites || [];

      var html = '';
      if (p.date) html += '<div style="color:rgba(255,255,255,0.6);font-size:13px;margin-bottom:12px;"><i class="far fa-calendar"></i> ' + esc(p.date) + '</div>';
      if (p.description) html += '<p style="color:#ddd;margin-bottom:16px;">' + esc(p.description) + '</p>';

      // Members
      if (members.length > 0) {
        html += '<div style="margin-bottom:18px;"><div style="font-size:12px;text-transform:uppercase;color:#D4AF37;margin-bottom:8px;letter-spacing:0.5px;">Members (' + members.length + ')</div>';
        html += '<div class="sl-plan-members">';
        members.forEach(function (mem) {
          html += '<div class="sl-plan-member"><img src="' + esc(avatar(mem)) + '"> ' + esc(mem.display_name || mem.username || 'User') + '</div>';
        });
        html += '</div></div>';
      }

      // Pending invites
      if (invites.length > 0) {
        html += '<div style="margin-bottom:18px;"><div style="font-size:12px;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:8px;letter-spacing:0.5px;">Pending Invites (' + invites.length + ')</div>';
        html += '<div class="sl-plan-members">';
        invites.forEach(function (inv) {
          var u = { display_name: inv.display_name || inv.invitee_display_name, username: inv.username || inv.invitee_username, avatar_url: inv.avatar_url || inv.invitee_avatar_url };
          html += '<div class="sl-plan-member" style="opacity:0.6;"><img src="' + esc(avatar(u)) + '"> ' + esc(u.display_name || u.username || 'User') + ' <small style="margin-left:4px;color:#888;">pending</small></div>';
        });
        html += '</div></div>';
      }

      // Invite form
      html += '<div style="margin-bottom:18px;"><div style="font-size:12px;text-transform:uppercase;color:#D4AF37;margin-bottom:8px;letter-spacing:0.5px;">Invite Someone</div>';
      html += '<div class="sl-invite-form"><input type="text" id="slInviteUsername" placeholder="@username" autocomplete="off"><button class="sl-btn sl-btn-primary" id="slInviteSendBtn" style="padding:8px 14px;"><i class="fas fa-paper-plane"></i></button></div></div>';

      // Stops
      html += '<div style="font-size:12px;text-transform:uppercase;color:#D4AF37;margin-bottom:8px;letter-spacing:0.5px;">Stops (' + stops.length + ')</div>';
      if (stops.length === 0) {
        html += '<p style="color:rgba(255,255,255,0.4);font-size:13px;">No stops yet. Use "Add to Plan" on any venue page to build out the itinerary.</p>';
      } else {
        html += '<div class="sl-plan-stops">';
        stops.forEach(function (s, i) {
          html += '<div class="sl-plan-stop" data-stop-id="' + esc(s.id) + '">' +
            '  <div class="sl-stop-order">' + (s.sort_order || (i + 1)) + '</div>' +
            '  <div class="sl-stop-meta">' +
            '    <strong>' + esc(s.venue_name || 'Venue') + '</strong>' +
            (s.venue_neighborhood ? '<small>' + esc(s.venue_neighborhood) + '</small>' : '') +
            (s.arrival_time ? '<small><i class="far fa-clock"></i> ' + esc(s.arrival_time) + '</small>' : '') +
            (s.notes ? '<small style="display:block;margin-top:4px;color:rgba(255,255,255,0.7);">' + esc(s.notes) + '</small>' : '') +
            '  </div>' +
            (p.is_owner !== false ? '  <button data-del-stop="' + esc(s.id) + '" title="Remove"><i class="fas fa-trash"></i></button>' : '') +
            '</div>';
        });
        html += '</div>';
      }

      body.innerHTML = html;

      // Wire invite send
      var inviteBtn = document.getElementById('slInviteSendBtn');
      var inviteInput = document.getElementById('slInviteUsername');
      if (inviteBtn && inviteInput) {
        function doInvite() {
          var uname = inviteInput.value.trim().replace(/^@/, '');
          if (!uname) return;
          inviteBtn.disabled = true;
          inviteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          SLApi.invitePlan(planId, { username: uname }).then(function () {
            if (window.SLToast) window.SLToast('Invite sent to @' + uname, 2500, 'success');
            inviteInput.value = '';
            loadPlan(planId);
          }).catch(function (e) {
            if (window.SLToast) window.SLToast(e.message || 'Could not invite', 2800, 'error');
          }).finally(function () {
            inviteBtn.disabled = false;
            inviteBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
          });
        }
        inviteBtn.addEventListener('click', doInvite);
        inviteInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') doInvite(); });
      }

      // Wire delete stop
      body.querySelectorAll('[data-del-stop]').forEach(function (b) {
        b.addEventListener('click', function () {
          var stopId = this.dataset.delStop;
          if (!confirm('Remove this stop?')) return;
          SLApi.deleteStop(planId, stopId).then(function () {
            if (window.SLToast) window.SLToast('Stop removed');
            loadPlan(planId);
          }).catch(function (e) {
            if (window.SLToast) window.SLToast(e.message || 'Failed', 2800, 'error');
          });
        });
      });
    }).catch(function (e) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#e57373;">Could not load plan</div>';
    });
  }

  window.SLPlansV2 = {
    openDetail: openDetail,
    refreshInvites: renderInvitesBanner
  };
})();