/**
 * SceneLink — Plan Integration Bridge
 *
 * Bridges the unified SLState plan system with the plan-with-friends.html UI.
 * - Shows the user's actual "Tonight" plan (built via "Add to Plan" buttons across the site)
 *   as the first plan card on plan-with-friends.
 * - When logged in, also fetches /api/plans for saved plans.
 * - Keeps demo/sample plans as inspiration for new users.
 */
(function () {
  'use strict';
    if (window.SL_CONNECTED_PLANS) return;

  if (!/plan-with-friends/.test(window.location.pathname)) return;

  // ──────────────────────────────────────────────────────────
  // Build a "virtual plan" from the user's unified SLState
  // ──────────────────────────────────────────────────────────
  function buildLocalPlan() {
    if (!window.SLState || typeof SLState.getActivePlan !== 'function') return null;
    var p = SLState.getActivePlan();
    if (!p || !p.venues || !p.venues.length) return null;

    var me = { id: 'user_self', name: 'You', initials: 'YO' };
    try {
      var cached = JSON.parse(localStorage.getItem('sl_user_cache') || '{}');
      if (cached && cached.name) {
        me = {
          id: cached.id || 'user_self',
          name: cached.name,
          initials: (cached.name || 'Y').split(' ').map(function (s) { return s.charAt(0); }).join('').slice(0, 2).toUpperCase()
        };
      }
    } catch (_) {}

    var venues = p.venues.map(function (v, i) {
      return {
        id: v.id || v.venue_id || ('v' + i),
        name: v.name || 'Venue',
        type: v.type || v.cuisine || 'Venue',
        area: v.neighborhood || '',
        time: v.plan_time || '',
        votes: { up: 1, down: 0 },
        voters: [me.id]
      };
    });

    return {
      id: 'local_plan',
      title: p.title || p.name || 'My Night Out 🎉',
      date: p.date || new Date().toISOString().split('T')[0],
      time: p.start_time || '8:00 PM',
      status: 'planning',
      creator: me,
      attendees: [me],
      venues: venues,
      messages: [
        { author: me, text: 'I started planning this night — add friends to share and vote!', time: 'Just now' }
      ],
      description: p.description || 'Your current night-out plan. Invite friends below to coordinate.',
      isLocal: true
    };
  }

  // ──────────────────────────────────────────────────────────
  // Inject the user's local plan into PlanWithFriends
  // ──────────────────────────────────────────────────────────
  function syncLocalPlan() {
    if (!window.PlanWithFriends) return;
    var localPlan = buildLocalPlan();
    var plans = window.PlanWithFriends.getPlans();
    if (!plans) return;

    // Remove any previous local_plan entry
    var idx = plans.findIndex(function (p) { return p.id === 'local_plan'; });
    if (idx !== -1) plans.splice(idx, 1);

    // Add fresh one at the top if we have venues
    if (localPlan) plans.unshift(localPlan);

    // Re-render
    if (typeof window.PlanWithFriends.renderPlans === 'function') {
      window.PlanWithFriends.renderPlans();
    }
    if (typeof window.PlanWithFriends.updateTabCounts === 'function') {
      window.PlanWithFriends.updateTabCounts();
    }
  }

  // ──────────────────────────────────────────────────────────
  // Also fetch /api/plans for logged-in users
  // ──────────────────────────────────────────────────────────
  async function syncServerPlans() {
    if (!window.SLApi || !SLApi.isLoggedIn() || !SLApi.plans) return;
    try {
      var res = await SLApi.plans();
      var serverPlans = (res && (res.plans || res)) || [];
      if (!Array.isArray(serverPlans) || !serverPlans.length) return;

      var me = { id: 'user_self', name: 'You', initials: 'YO' };
      try {
        var cached = JSON.parse(localStorage.getItem('sl_user_cache') || '{}');
        if (cached && cached.name) {
          me = {
            id: cached.id || 'user_self',
            name: cached.name,
            initials: (cached.name || 'Y').split(' ').map(function (s) { return s.charAt(0); }).join('').slice(0, 2).toUpperCase()
          };
        }
      } catch (_) {}

      var plans = window.PlanWithFriends.getPlans();
      if (!plans) return;

      serverPlans.forEach(function (sp) {
        // Skip if already present
        if (plans.find(function (p) { return p.id === ('srv_' + sp.id); })) return;

        var venues = (sp.venues || []).map(function (v, i) {
          return {
            id: v.id || v.venue_id || ('v' + i),
            name: v.name || 'Venue',
            type: v.type || 'Venue',
            area: v.neighborhood || '',
            time: v.plan_time || '',
            votes: { up: 1, down: 0 },
            voters: [me.id]
          };
        });

        plans.push({
          id: 'srv_' + sp.id,
          title: sp.name || sp.title || 'Saved Plan',
          date: sp.date || sp.created_at || new Date().toISOString(),
          time: sp.start_time || '8:00 PM',
          status: sp.status || 'confirmed',
          creator: me,
          attendees: [me],
          venues: venues,
          messages: [],
          description: sp.description || '',
          isServer: true
        });
      });

      if (typeof window.PlanWithFriends.renderPlans === 'function') {
        window.PlanWithFriends.renderPlans();
      }
      if (typeof window.PlanWithFriends.updateTabCounts === 'function') {
        window.PlanWithFriends.updateTabCounts();
      }
    } catch (err) {
      console.warn('[sl-plan-integration] Server plans fetch failed:', err);
    }
  }

  // ──────────────────────────────────────────────────────────
  // Bootstrap: wait for PlanWithFriends to be initialized
  // ──────────────────────────────────────────────────────────
  function bootstrap() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (window.PlanWithFriends && typeof PlanWithFriends.getPlans === 'function') {
        clearInterval(iv);
        syncLocalPlan();
        syncServerPlans();
      } else if (tries > 40) {
        clearInterval(iv);
      }
    }, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // Listen for state changes (user added/removed venues)
  window.addEventListener('sl-state-change', function (e) {
    if (e.detail && (e.detail.kind === 'plan' || e.detail.kind === 'all')) {
      syncLocalPlan();
    }
  });

  // Listen for auth changes (refetch server plans)
  window.addEventListener('sl-auth-change', function () {
    setTimeout(function () { syncServerPlans(); }, 500);
  });
  document.addEventListener('sl-auth-change', function () {
    setTimeout(function () { syncServerPlans(); }, 500);
  });
})();