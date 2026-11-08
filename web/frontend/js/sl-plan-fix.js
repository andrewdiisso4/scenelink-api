/**
 * SceneLink — Create Plan Real Backend Persistence
 * Intercepts PlanWithFriends.createPlan() + the submit form and persists
 * to /api/plans via SLApi.createPlan()
 */
(function() {
    'use strict';
    if (window.SL_CONNECTED_PLANS) return;

    const isPlanPage = /plan-with-friends/.test(window.location.pathname) ||
                     !!document.querySelector('[data-plan-page], .pwf-container, #pwfCreateBtn');
    if (!isPlanPage) return;

    // Wait for PlanWithFriends module to exist
    let tries = 0;
    const wait = setInterval(function() {
        tries++;
        if (window.PlanWithFriends && window.PlanWithFriends.createPlan) {
            clearInterval(wait);
            hook();
        } else if (tries > 40) {
            clearInterval(wait);
            hookFormOnly();
        }
    }, 100);

    function hook() {
        const original = window.PlanWithFriends.createPlan;
        window.PlanWithFriends.createPlan = function(data) {
            // Call original first (for UI state)
            const ret = original.apply(this, arguments);
            // Then persist to backend if logged in
            persistPlan(data);
            return ret;
        };
        // Also hook form submit as safety net
        hookFormOnly();
        console.log('[sl-plan-fix] Hooked PlanWithFriends.createPlan');
    }

    function hookFormOnly() {
        // Watch form submit as a fallback
        document.addEventListener('submit', function(e) {
            const form = e.target.closest('#pwfCreateForm, form[data-plan-form], form.pwf-create-form');
            if (!form) return;
            const data = readForm(form);
            if (data.title) persistPlan(data);
        }, true);
        // Also intercept clicks on "Create Plan" button if no form submit
        document.addEventListener('click', function(e) {
            const btn = e.target.closest('#pwfCreateSubmit, [data-plan-submit]');
            if (!btn) return;
            const form = btn.closest('form') || document.getElementById('pwfCreateForm');
            if (form) {
                setTimeout(function() {
                    const data = readForm(form);
                    if (data.title) persistPlan(data);
                }, 200);
            }
        });
    }

    function readForm(form) {
        function val(name) {
            const el = form.querySelector('[name="' + name + '"], #' + name);
            return el ? el.value.trim() : '';
        }
        return {
            title: val('title') || val('planTitle') || val('pwfTitle') || document.querySelector('#pwfCreateModal input[type="text"]')?.value,
            date: val('date') || val('planDate') || val('pwfDate'),
            time: val('time') || val('planTime') || val('pwfTime'),
            description: val('description') || val('planDesc') || val('pwfDesc'),
            venueName: val('venue') || val('venueName')
        };
    }

    async function persistPlan(data) {
        if (!window.SLApi || !window.SLApi.isLoggedIn()) {
            if (window.SLToast) window.SLToast('💡 Log in to save your plans across devices');
            return;
        }
        try {
            const payload = {
                name: data.title,
                date: data.date || null,
                description: data.description || (data.time ? 'Planned for ' + data.time : '')
            };
            const res = await window.SLApi.createPlan(payload.name, payload.date, payload.description);
            console.log('[sl-plan-fix] Plan saved to backend:', res);
            if (window.SLToast) window.SLToast('✅ Plan saved to your account');

            // If venue provided, try to attach it
            if (data.venueName && res.plan && res.plan.id) {
                // Look up venue by name
                try {
                    const vRes = await window.SLApi.venueSearch(data.venueName);
                    const venue = (vRes.venues || vRes || [])[0];
                    if (venue) await window.SLApi.addToPlan(res.plan.id, venue.id);
                } catch(_) {}
            }
        } catch(err) {
            console.warn('[sl-plan-fix] persist failed', err);
            if (window.SLToast) window.SLToast('⚠️ Plan saved locally but not synced: ' + err.message);
        }
    }
})();