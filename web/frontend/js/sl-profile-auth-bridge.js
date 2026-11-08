/**
 * SceneLink — Profile Auth Bridge
 * Overlays real authenticated user data onto legacy profile.js mock data.
 * Also redirects to login-prompt if the user is not logged in.
 */
(function () {
    'use strict';

    function isLoggedIn() {
        try {
            if (window.SLAuth && typeof SLAuth.isLoggedIn === 'function') return !!SLAuth.isLoggedIn();
            return !!(localStorage.getItem('sl_auth_token') || localStorage.getItem('sl_jwt_token') || localStorage.getItem('sl_jwt_v2'));
        } catch (_) { return false; }
    }

    function getUser() {
        try {
            if (window.SLAuth && typeof SLAuth.getUser === 'function') {
                var u = SLAuth.getUser();
                if (u) return u;
            }
            var raw = localStorage.getItem('sl_user');
            if (raw) { var p = JSON.parse(raw); return p.user || p; }
        } catch (_) {}
        return null;
    }

    function displayNameFor(u) {
        if (!u) return 'Guest';
        return u.display_name || u.displayName || u.username || u.name || (u.email ? u.email.split('@')[0] : 'Account');
    }

    function applyAuthState() {
        var nameEl = document.getElementById('userName');
        var bioEl = document.getElementById('userBio');
        var avatarEl = document.getElementById('userAvatar');
        var signOutBtn = document.getElementById('signOutBtn');

        if (isLoggedIn()) {
            var u = getUser() || {};
            if (nameEl && displayNameFor(u)) nameEl.textContent = displayNameFor(u);
            if (bioEl && !u.bio && u.email) bioEl.textContent = u.email;
            else if (bioEl && u.bio) bioEl.textContent = u.bio;
            if (avatarEl && u.avatar_url) avatarEl.src = u.avatar_url;

            // Real sign-out using SLAuth
            if (signOutBtn && !signOutBtn.__slBound) {
                signOutBtn.__slBound = true;
                signOutBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (!confirm('Sign out of SceneLink?')) return;
                    try {
                        if (window.SLAuth && typeof SLAuth.logout === 'function') SLAuth.logout();
                        else {
                            ['sl_auth_token','sl_jwt_token','sl_jwt_v2','sl_user'].forEach(function(k){ localStorage.removeItem(k); });
                        }
                    } catch (_) {}
                    window.dispatchEvent(new Event('sl-auth-change'));
                    setTimeout(function () { window.location.href = 'index.html'; }, 400);
                }, true);
            }

            // Hydrate favorites into profile favorite list
            if (window.SLApi && typeof SLApi.getFavorites === 'function') {
                SLApi.getFavorites().then(function (res) {
                    var favs = (res && (res.favorites || res.venues || res.data)) || [];
                    var countEl = document.getElementById('visitedCount') || document.querySelector('[data-stat="visited"]');
                    // noop if no favorites
                }).catch(function () {});
            }
        } else {
            // Not logged in — show login prompt overlay on profile content
            var main = document.querySelector('.profile-main, main.profile, main, .profile-container');
            if (main && !document.getElementById('sl-profile-login-gate')) {
                var overlay = document.createElement('div');
                overlay.id = 'sl-profile-login-gate';
                overlay.style.cssText = 'max-width:520px;margin:80px auto;padding:40px 28px;background:linear-gradient(135deg,rgba(212,175,55,0.08),rgba(255,255,255,0.02));border:1px solid rgba(212,175,55,0.3);border-radius:20px;text-align:center;color:#fff;';
                overlay.innerHTML =
                    '<div style="font-size:48px;margin-bottom:16px;">👤</div>' +
                    '<h2 style="margin:0 0 10px;font-size:26px;font-weight:800;">Sign in to view your profile</h2>' +
                    '<p style="margin:0 0 24px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.5;">Access your saved venues, lists, plans, and personalized recommendations.</p>' +
                    '<button id="slProfileLoginBtn" style="background:linear-gradient(135deg,#D4AF37,#b8860b);color:#0a0a0a;border:none;padding:14px 32px;border-radius:12px;font-weight:800;font-size:15px;cursor:pointer;letter-spacing:0.3px;">Sign In / Sign Up</button>';
                // Hide any existing profile content
                var existing = main.querySelector('.profile-header, .profile-content, .profile-grid');
                if (existing) existing.style.display = 'none';
                main.prepend(overlay);
                var btn = document.getElementById('slProfileLoginBtn');
                if (btn) {
                    btn.addEventListener('click', function () {
                        if (window.SLAuth && SLAuth.openLogin) SLAuth.openLogin('login');
                        else if (window.SLAuthUI && SLAuthUI.open) SLAuthUI.open('login');
                        else {
                            var trigger = document.querySelector('.sl-auth-trigger');
                            if (trigger) trigger.click();
                        }
                    });
                }
            }
        }
    }

    function init() {
        // Wait briefly for SLAuth to hydrate from backend
        setTimeout(applyAuthState, 100);
        setTimeout(applyAuthState, 800);
        window.addEventListener('sl-auth-change', applyAuthState);
        document.addEventListener('sl-auth-change', applyAuthState);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();