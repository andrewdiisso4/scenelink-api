/**
 * SceneLink — Profile Page Real Data Renderer
 * Only runs on profile.html. Renders real favorites/lists/plans/checkins from the backend.
 */
(function() {
    'use strict';
  if (document.body && document.body.hasAttribute('data-sl-social-profile')) return;

    // Only run on profile page
    const isProfilePage = /profile(-v2)?\.html/.test(window.location.pathname) ||
                         window.location.pathname === '/profile' ||
                         document.body.getAttribute('data-page') === 'profile';
    if (!isProfilePage && !document.querySelector('[data-profile-page], .profile-page')) {
        // Heuristic: if page has profile-container/profile-header element, assume profile page
        if (!document.querySelector('.profile-container, .profile-header, #profileContainer')) return;
    }

    async function render() {
        if (!window.SLApi || !window.SLApi.isLoggedIn()) {
            // Show logged-out prompt
            const container = document.querySelector('.profile-container, main, .profile-page');
            if (container && !container.querySelector('.sl-profile-locked')) {
                const prompt = document.createElement('div');
                prompt.className = 'sl-profile-locked';
                prompt.style.cssText = 'text-align:center;padding:80px 20px;color:#fff;background:#0a0a0a;min-height:60vh;';
                prompt.innerHTML =
                    '<div style="max-width:460px;margin:0 auto;background:#141414;padding:40px;border-radius:16px;border:1px solid rgba(212,175,55,0.2);">' +
                        '<i class="fas fa-user-lock" style="font-size:48px;color:#D4AF37;margin-bottom:20px;display:block;"></i>' +
                        '<h2 style="color:#D4AF37;margin-bottom:12px;">Sign in to view your profile</h2>' +
                        '<p style="color:rgba(255,255,255,0.7);margin-bottom:24px;">Log in to see your favorites, lists, plans, and check-ins.</p>' +
                        '<button class="sl-auth-trigger" style="background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;border:none;padding:12px 32px;border-radius:8px;font-weight:600;cursor:pointer;font-size:16px;">Log In / Sign Up</button>' +
                    '</div>';
                container.insertBefore(prompt, container.firstChild);
            }
            return;
        }

        try {
            const me = await window.SLApi.me();
            const user = me.user || me;
            const name = user.display_name || user.username || user.email.split('@')[0];
            const email = user.email;
            const avatar = user.avatar_url || window.SL_AVATAR.local(name);

            // ---- Hero info ----
            document.querySelectorAll('.profile-name,.user-name,#profileName,#userName,.profile-display-name')
                .forEach(el => {
                    if (el.tagName === 'INPUT') el.value = name; else el.textContent = name;
                });
            document.querySelectorAll('.profile-email,.user-email,#profileEmail')
                .forEach(el => { if (el.tagName === 'INPUT') el.value = email; else el.textContent = email; });
            document.querySelectorAll('.profile-avatar img,.user-avatar img,.avatar-img,#profileAvatar img').forEach(img => { img.src = avatar; });
            document.querySelectorAll('img.profile-avatar,img.user-avatar,img.avatar-img,img#profileAvatar').forEach(img => { img.src = avatar; });
            document.querySelectorAll('.profile-location,.user-location')
                .forEach(el => { el.textContent = `${user.neighborhood || 'Boston'}, ${user.city || 'MA'}`; });
            document.querySelectorAll('.profile-bio,.user-bio').forEach(el => {
                el.textContent = user.bio || 'Discovering the best of Boston one venue at a time.';
            });

            // ---- Fetch collections in parallel ----
            const [favRes, listsRes, plansRes, checkinsRes] = await Promise.allSettled([
                window.SLApi.favorites(),
                window.SLApi.lists(),
                window.SLApi.plans(),
                window.SLApi.myCheckins ? window.SLApi.myCheckins() : Promise.resolve({ checkins: [] })
            ]);

            const favorites = (favRes.value && (favRes.value.favorites || favRes.value)) || [];
            const lists = (listsRes.value && (listsRes.value.lists || listsRes.value)) || [];
            const plans = (plansRes.value && (plansRes.value.plans || plansRes.value)) || [];
            const checkins = (checkinsRes.value && (checkinsRes.value.checkins || checkinsRes.value)) || [];

            // ---- Stats ----
            const stats = {
                favorites: favorites.length,
                lists: lists.length,
                plans: plans.length,
                checkins: checkins.length || user.checkins_count || 0
            };
            document.querySelectorAll('[data-stat="favorites"],.stat-favorites .stat-value,.favorites-count').forEach(e => e.textContent = stats.favorites);
            document.querySelectorAll('[data-stat="lists"],.stat-lists .stat-value,.lists-count').forEach(e => e.textContent = stats.lists);
            document.querySelectorAll('[data-stat="plans"],.stat-plans .stat-value,.plans-count').forEach(e => e.textContent = stats.plans);
            document.querySelectorAll('[data-stat="checkins"],.stat-checkins .stat-value,.checkins-count').forEach(e => e.textContent = stats.checkins);

            // ---- Build a fresh Profile Summary panel at top of page ----
            let panel = document.getElementById('sl-profile-summary');
            if (!panel) {
                panel = document.createElement('section');
                panel.id = 'sl-profile-summary';
                panel.className = 'sl-profile-summary';
                panel.style.cssText = 'padding:40px 20px;background:linear-gradient(135deg,#0a0a0a 0%,#151515 100%);color:#fff;';
                // Prefer inserting after header
                const header = document.querySelector('header');
                if (header && header.nextSibling) {
                    header.parentNode.insertBefore(panel, header.nextSibling);
                } else {
                    document.body.insertBefore(panel, document.body.firstChild);
                }
            }
            panel.innerHTML =
                '<div style="max-width:1200px;margin:0 auto;display:flex;gap:24px;align-items:center;flex-wrap:wrap;">' +
                    '<img src="' + avatar + '" alt="' + name + '" style="width:96px;height:96px;border-radius:50%;border:3px solid #D4AF37;object-fit:cover;">' +
                    '<div style="flex:1;min-width:220px;">' +
                        '<h1 style="margin:0 0 4px;color:#D4AF37;font-size:28px;">' + name + '</h1>' +
                        '<div style="color:rgba(255,255,255,0.6);font-size:14px;">' + email + '</div>' +
                        '<div style="color:rgba(255,255,255,0.5);font-size:13px;margin-top:4px;"><i class="fas fa-map-marker-alt"></i> ' + (user.neighborhood || 'Boston') + ', ' + (user.city || 'MA') + '</div>' +
                    '</div>' +
                    '<div style="display:flex;gap:28px;flex-wrap:wrap;">' +
                        statBlock('Favorites', stats.favorites) +
                        statBlock('Lists', stats.lists) +
                        statBlock('Plans', stats.plans) +
                        statBlock('Check-ins', stats.checkins) +
                    '</div>' +
                    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
                        '<a href="/explore.html" style="padding:10px 20px;background:#D4AF37;color:#000;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none;"><i class="fas fa-compass"></i> Explore</a>' +
                        '<button id="sl-profile-logout-btn" onclick="(function(){if(window.SLApi)window.SLApi.logout();if(window.SLAuth)window.SLAuth.logout();localStorage.clear();window.location.href=\'/\';})();" style="padding:10px 20px;background:transparent;color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:13px;cursor:pointer;"><i class="fas fa-sign-out-alt"></i> Sign Out</button>' +
                    '</div>' +
                '</div>' +
                buildTabsHTML(favorites, lists, plans, checkins);

            bindTabs();

        } catch(err) {
            console.error('[sl-profile-page]', err);
        }
    }

    function statBlock(label, value) {
        return '<div style="text-align:center;min-width:72px;">' +
                 '<div style="font-size:28px;font-weight:700;color:#D4AF37;">' + value + '</div>' +
                 '<div style="font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:rgba(255,255,255,0.55);">' + label + '</div>' +
               '</div>';
    }

    function buildTabsHTML(favorites, lists, plans, checkins) {
        const tabs =
            '<div class="sl-pp-tabs" style="max-width:1200px;margin:32px auto 0;border-bottom:1px solid rgba(212,175,55,0.2);display:flex;gap:24px;flex-wrap:wrap;">' +
                '<button class="sl-pp-tab sl-active" data-tab="favorites" style="background:none;border:none;color:#D4AF37;padding:12px 4px;cursor:pointer;font-size:14px;font-weight:600;border-bottom:2px solid #D4AF37;">Favorites (' + favorites.length + ')</button>' +
                '<button class="sl-pp-tab" data-tab="lists" style="background:none;border:none;color:rgba(255,255,255,0.6);padding:12px 4px;cursor:pointer;font-size:14px;font-weight:600;border-bottom:2px solid transparent;">My Lists (' + lists.length + ')</button>' +
                '<button class="sl-pp-tab" data-tab="plans" style="background:none;border:none;color:rgba(255,255,255,0.6);padding:12px 4px;cursor:pointer;font-size:14px;font-weight:600;border-bottom:2px solid transparent;">Plans (' + plans.length + ')</button>' +
                '<button class="sl-pp-tab" data-tab="checkins" style="background:none;border:none;color:rgba(255,255,255,0.6);padding:12px 4px;cursor:pointer;font-size:14px;font-weight:600;border-bottom:2px solid transparent;">Check-ins (' + (checkins ? checkins.length : 0) + ')</button>' +
            '</div>' +
            '<div class="sl-pp-tab-content" data-tab="favorites" style="max-width:1200px;margin:0 auto;padding:24px 0;">' +
                renderFavorites(favorites) +
            '</div>' +
            '<div class="sl-pp-tab-content sl-hidden" data-tab="lists" style="max-width:1200px;margin:0 auto;padding:24px 0;display:none;">' +
                renderLists(lists) +
            '</div>' +
            '<div class="sl-pp-tab-content sl-hidden" data-tab="plans" style="max-width:1200px;margin:0 auto;padding:24px 0;display:none;">' +
                renderPlans(plans) +
            '</div>' +
            '<div class="sl-pp-tab-content sl-hidden" data-tab="checkins" style="max-width:1200px;margin:0 auto;padding:24px 0;display:none;">' +
                renderCheckins(checkins || []) +
            '</div>';
        return tabs;
    }

    function renderCheckins(items) {
        if (!items.length) return emptyState('📍', 'No check-ins yet', 'Check in at venues to track your nights out.', 'Find a Venue', 'explore.html');
        // Each row carries data-checkin-id so sl-phase6e-actions.js can attach a delete button.
        return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">' +
            items.map(c => {
                const venueName = (c.venue_name || 'Venue');
                const venueSlug = c.venue_slug || c.venue_id || '';
                const venueImg  = c.venue_image || '/assets/img/placeholder-venue.svg';
                const note = c.note ? c.note : '';
                const when = c.created_at ? new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
                const me = (window.SL_USER && window.SL_USER.id) || '';
                return '<div class="sl-checkin-card" data-checkin-id="' + c.id + '" data-checkin-user-id="' + me + '" style="background:#141414;border:1px solid rgba(212,175,55,0.15);border-radius:12px;padding:16px;color:#fff;position:relative;">' +
                    '<div style="display:flex;gap:12px;align-items:center;">' +
                        '<img src="' + venueImg + '" alt="" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex-shrink:0;" onerror="this.src=\'/assets/img/placeholder-venue.svg\'">' +
                        '<div style="flex:1;min-width:0;">' +
                            '<div style="font-weight:600;font-size:15px;color:#D4AF37;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + venueName + '</div>' +
                            '<div style="font-size:12px;color:rgba(255,255,255,0.5);">' + (c.venue_neighborhood || '') + (c.venue_neighborhood && when ? ' • ' : '') + when + '</div>' +
                        '</div>' +
                    '</div>' +
                    (note ? '<div style="margin-top:10px;font-size:13px;color:rgba(255,255,255,0.75);font-style:italic;line-height:1.4;">"' + note + '"</div>' : '') +
                '</div>';
            }).join('') +
        '</div>';
    }

    function renderFavorites(items) {
        if (!items.length) return emptyState('💛', 'No favorites yet', 'Tap the heart on any venue to save it here.', 'Explore Venues', 'explore.html');
        return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;">' +
            items.map(v =>
                '<a href="explore.html#venue=' + (v.slug || v.venue_id || v.id) + '" style="background:#141414;border:1px solid rgba(212,175,55,0.15);border-radius:12px;padding:16px;text-decoration:none;color:#fff;display:block;transition:transform 0.2s;">' +
                    '<div style="font-weight:600;margin-bottom:6px;color:#fff;">' + (v.name || v.venue_name || 'Venue') + '</div>' +
                    '<div style="font-size:12px;color:rgba(255,255,255,0.5);">' + (v.neighborhood || v.category || '') + '</div>' +
                '</a>'
            ).join('') +
        '</div>';
    }

    function renderLists(items) {
        if (!items.length) return emptyState('📋', 'No lists yet', 'Create your first collection of favorite spots.', 'Create a List', 'my-lists.html');
        return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">' +
            items.map(l =>
                '<a href="my-lists.html#list=' + l.id + '" style="background:#141414;border:1px solid rgba(212,175,55,0.15);border-radius:12px;padding:20px;text-decoration:none;color:#fff;display:block;">' +
                    '<div style="font-weight:600;font-size:16px;margin-bottom:4px;color:#D4AF37;">' + (l.name || 'Untitled') + '</div>' +
                    '<div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:8px;">' + (l.description || 'No description') + '</div>' +
                    '<div style="font-size:11px;color:rgba(255,255,255,0.4);"><i class="fas fa-map-marker-alt"></i> ' + (l.venue_count || 0) + ' venues</div>' +
                '</a>'
            ).join('') +
        '</div>';
    }

    function renderPlans(items) {
        if (!items.length) return emptyState('🗓️', 'No plans yet', 'Start planning your next night out with friends.', 'Create a Plan', 'plan-with-friends.html');
        return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">' +
            items.map(p =>
                '<a href="plan-with-friends.html#plan=' + p.id + '" style="background:#141414;border:1px solid rgba(212,175,55,0.15);border-radius:12px;padding:20px;text-decoration:none;color:#fff;display:block;">' +
                    '<div style="font-weight:600;font-size:16px;margin-bottom:4px;color:#D4AF37;">' + (p.name || 'Untitled Plan') + '</div>' +
                    '<div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:8px;"><i class="fas fa-calendar"></i> ' + (p.date ? new Date(p.date).toLocaleDateString() : 'No date') + '</div>' +
                    '<div style="font-size:11px;color:rgba(255,255,255,0.4);">' + (p.venue_count || 0) + ' venues</div>' +
                '</a>'
            ).join('') +
        '</div>';
    }

    function emptyState(emoji, title, subtitle, cta, ctaHref) {
        return '<div style="text-align:center;padding:48px 20px;color:#fff;">' +
                    '<div style="font-size:48px;margin-bottom:12px;">' + emoji + '</div>' +
                    '<div style="font-size:18px;color:#D4AF37;margin-bottom:6px;font-weight:600;">' + title + '</div>' +
                    '<div style="color:rgba(255,255,255,0.6);margin-bottom:20px;">' + subtitle + '</div>' +
                    '<a href="' + ctaHref + '" style="display:inline-block;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;">' + cta + '</a>' +
                '</div>';
    }

    function bindTabs() {
        document.querySelectorAll('.sl-pp-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const t = this.dataset.tab;
                document.querySelectorAll('.sl-pp-tab').forEach(b => {
                    const active = b.dataset.tab === t;
                    b.classList.toggle('sl-active', active);
                    b.style.color = active ? '#D4AF37' : 'rgba(255,255,255,0.6)';
                    b.style.borderBottomColor = active ? '#D4AF37' : 'transparent';
                });
                document.querySelectorAll('.sl-pp-tab-content').forEach(c => {
                    c.style.display = c.dataset.tab === t ? '' : 'none';
                });
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
    document.addEventListener('sl-auth-change', render);
})();