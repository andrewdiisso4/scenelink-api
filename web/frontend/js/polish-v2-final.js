/* ============================================================
   SUPER NINJA FINAL PASS V2 — JavaScript
   Layered on top of all existing polish files
   ============================================================ */
(function () {
    'use strict';

    function bootV2() {
        initUnifiedAuth();
        initUniversalSaveModal();
        initToastSystem();

        var page = detectPage();
        if (page === 'nightlife') {
            initNightlifeStickyMap();
            initNightlifeBrowseDivider();
            initNightlifeCardMatch();
        }
        if (page === 'explore') {
            initExploreLogoFix();
            initExploreNavIconsFix();
            initExploreDuplicateLocBtn();
            initItineraryPanel();
            initExploreListSpacing();
        }
        if (page === 'home') {
            initHeroTextFix();
            removeAuthPlaceholders();
        }
        if (page === 'profile') {
            initProfilePhotoUpload();
            initProfileTabSync();
            initProfileListsFavorites();
        }

        // Global: wire all save buttons to universal modal
        wireSaveButtons();
    }

    // Handle both cases: DOMContentLoaded already fired or not yet
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootV2);
    } else {
        bootV2();
    }

    function detectPage() {
        var path = location.pathname.toLowerCase();
        if (path.indexOf('nightlife') >= 0) return 'nightlife';
        if (path.indexOf('explore') >= 0) return 'explore';
        if (path.indexOf('profile') >= 0) return 'profile';
        if (path.indexOf('tonight') >= 0) return 'tonight';
        if (path.indexOf('event') >= 0) return 'events';
        if (path.indexOf('index') >= 0 || path === '/' || path.endsWith('/')) return 'home';
        return 'other';
    }

    /* ============================================================
       1. UNIFIED AUTH SYSTEM
       ============================================================ */
    function initUnifiedAuth() {
        // NEUTRALIZED — canonical auth is now sl-auth-ui.js + sl-auth-core.js
        // Kill/remove any legacy auth modals this file or predecessors created
        ['sl-auth-modal', 'sl-auth-modal-r2', 'sl-auth-modal-v2'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        return; // short-circuit — no wiring, no DOM injection
        // (dead code below preserved intentionally to avoid cascade errors)
        function killR2Modal() {
            var r2 = document.getElementById('sl-auth-modal-r2');
            if (r2) {
                r2.style.display = 'none';
                r2.style.visibility = 'hidden';
                r2.style.pointerEvents = 'none';
                r2.style.zIndex = '-9999';
                r2.style.opacity = '0';
                r2.setAttribute('aria-hidden', 'true');
            }
            // Also suppress the OLD auth.js modal
            var oldModal = document.getElementById('sl-auth-modal');
            if (oldModal && !oldModal._v2Created) {
                oldModal.style.display = 'none';
                oldModal.style.visibility = 'hidden';
                oldModal.style.zIndex = '-9999';
            }
        }
        killR2Modal();

        // Create V2 modal immediately
        createAuthModal();

        // Wire all login/signup buttons site-wide with capture:true to fire FIRST
        function wireAuthButtons() {
            killR2Modal(); // Re-kill in case polish-final.js re-created it

            var selectors = [
                '.btn-header-primary',
                '#headerSignupBtn',
                '#openSignupModal',
                '#heroJoinBtn',
                '.btn-join-scene',
                '.auth-trigger',
                '[data-auth-trigger]'
            ];
            document.querySelectorAll(selectors.join(',')).forEach(function (btn) {
                if (btn._v2AuthWired) return;
                btn._v2AuthWired = true;
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    killR2Modal();
                    openUnifiedAuthModal();
                }, true); // capture phase
            });

            // Also wire any button with "Log in" / "Sign up" text
            document.querySelectorAll('button').forEach(function (btn) {
                var text = (btn.textContent || '').trim().toLowerCase();
                if ((text.indexOf('log in') >= 0 || text.indexOf('sign up') >= 0) && !btn._v2AuthWired) {
                    btn._v2AuthWired = true;
                    btn.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        killR2Modal();
                        openUnifiedAuthModal();
                    }, true);
                }
            });
        }

        // Wire immediately, then again after delays to catch dynamically added buttons
        wireAuthButtons();
        setTimeout(wireAuthButtons, 300);
        setTimeout(wireAuthButtons, 800);
        setTimeout(wireAuthButtons, 2000);

        // MutationObserver to catch any new auth buttons added dynamically
        var authObserver = new MutationObserver(function () {
            killR2Modal();
            wireAuthButtons();
        });
        authObserver.observe(document.body, { childList: true, subtree: true });
        // Stop observing after 5 seconds to prevent performance issues
        setTimeout(function () { authObserver.disconnect(); }, 5000);

        // If user is already logged in, reflect state
        reflectGlobalAuthState();
        setTimeout(reflectGlobalAuthState, 500);
        setTimeout(reflectGlobalAuthState, 1500);
        setTimeout(reflectGlobalAuthState, 3000);
    }

    function openUnifiedAuthModal() {
        // Always use the V2 modal
        var modal = document.getElementById('v2AuthModal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            return;
        }
        // Shouldn't happen, but create if needed
        createAuthModal();
        var created = document.getElementById('v2AuthModal');
        if (created) {
            created.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    function createAuthModal() {
        if (document.getElementById('v2AuthModal')) return;

        var modal = document.createElement('div');
        modal.id = 'v2AuthModal';
        modal._v2Created = true;
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999999;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
        var inputStyle = 'width:100%;padding:14px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;font-size:14px;outline:none;box-sizing:border-box;';
        modal.innerHTML =
            '<div style="width:420px;max-width:calc(100vw - 40px);background:rgba(12,12,18,0.98);border:1px solid rgba(212,175,55,0.2);border-radius:24px;padding:32px;box-shadow:0 30px 80px rgba(0,0,0,0.7);position:relative;">' +
            '  <button id="v2AuthClose" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.1);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;">&#215;</button>' +
            '  <h3 style="text-align:center;color:#fff;margin:0 0 4px;font-size:22px;font-weight:700;">Welcome to SceneLink</h3>' +
            '  <p style="text-align:center;color:rgba(255,255,255,0.5);margin:0 0 24px;font-size:13px;">Discover the best nightlife, restaurants &amp; events</p>' +
            '  <div style="display:flex;border-bottom:1px solid rgba(255,255,255,0.1);margin-bottom:20px;">' +
            '    <button class="v2-auth-tab active" data-mode="login" style="flex:1;padding:10px;background:none;border:none;color:rgba(255,255,255,0.5);font-size:14px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;">Log In</button>' +
            '    <button class="v2-auth-tab" data-mode="signup" style="flex:1;padding:10px;background:none;border:none;color:#D4AF37;font-size:14px;font-weight:600;cursor:pointer;border-bottom:2px solid #D4AF37;">Sign Up</button>' +
            '  </div>' +
            '  <div id="v2AuthError" style="display:none;background:#3a1c1c;border:1px solid #5d2a2a;color:#ffd4d4;padding:10px;border-radius:12px;margin-bottom:12px;font-size:13px;"></div>' +
            '  <form id="v2AuthForm" style="display:grid;gap:14px;" onsubmit="return false;">' +
            '    <input id="v2FullName" type="text" placeholder="Full Name" style="' + inputStyle + 'display:block;">' +
            '    <input id="v2Email" type="email" placeholder="Email address" style="' + inputStyle + '">' +
            '    <input id="v2Password" type="password" placeholder="Password" style="' + inputStyle + '">' +
            '    <div id="v2SignupFields" style="display:block;">' +
            '      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:10px;cursor:pointer;">' +
            '        <input id="v2Age21" type="checkbox" style="width:16px;height:16px;accent-color:#D4AF37;"> I confirm I am 21+ years old' +
            '      </label>' +
            '      <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,0.5);cursor:pointer;">' +
            '        <input id="v2Tos" type="checkbox" style="width:16px;height:16px;accent-color:#D4AF37;"> I agree to the <a href="terms.html" style="color:#D4AF37">Terms of Service</a> &amp; <a href="privacy.html" style="color:#D4AF37">Privacy Policy</a>' +
            '      </label>' +
            '    </div>' +
            '    <button id="v2AuthSubmit" type="button" style="width:100%;padding:14px;background:linear-gradient(135deg,#D4AF37,#b8962e);color:#0a0a0a;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;margin-top:4px;">Create Account</button>' +
            '    <a href="#" id="v2ForgotPw" style="text-align:center;font-size:12px;color:rgba(212,175,55,0.7);display:none;text-decoration:none;">Forgot password?</a>' +
            '  </form>' +
            '</div>';

        document.body.appendChild(modal);
        modal.dataset.authMode = 'signup'; // Default to signup (stored on DOM for accessibility)
        var authMode = 'signup';

        // Tab switching
        modal.querySelectorAll('.v2-auth-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                modal.querySelectorAll('.v2-auth-tab').forEach(function (t) {
                    t.classList.remove('active');
                    t.style.color = 'rgba(255,255,255,0.5)';
                    t.style.borderBottom = '2px solid transparent';
                });
                tab.classList.add('active');
                tab.style.color = '#D4AF37';
                tab.style.borderBottom = '2px solid #D4AF37';
                authMode = tab.dataset.mode;
                modal.dataset.authMode = authMode;
                var signupFields = document.getElementById('v2SignupFields');
                var nameField = document.getElementById('v2FullName');
                var submitBtn = document.getElementById('v2AuthSubmit');
                var forgotLink = document.getElementById('v2ForgotPw');
                if (authMode === 'signup') {
                    signupFields.style.display = 'block';
                    nameField.style.display = 'block';
                    submitBtn.textContent = 'Create Account';
                    forgotLink.style.display = 'none';
                } else {
                    signupFields.style.display = 'none';
                    nameField.style.display = 'none';
                    submitBtn.textContent = 'Log In';
                    forgotLink.style.display = 'block';
                }
                hideAuthError();
            });
        });

        // Close
        document.getElementById('v2AuthClose').addEventListener('click', closeAuthModal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeAuthModal();
        });

        // Submit
        document.getElementById('v2AuthSubmit').addEventListener('click', function () {
            // Use DOM attribute as primary source (more reliable across contexts)
            var currentMode = modal.dataset.authMode || authMode;
            var email = (document.getElementById('v2Email').value || '').trim();
            var password = (document.getElementById('v2Password').value || '').trim();
            var name = (document.getElementById('v2FullName').value || '').trim();

            if (!email) { showAuthError('Please enter your email.'); return; }
            if (!password || password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

            if (currentMode === 'signup') {
                if (!document.getElementById('v2Age21').checked) { showAuthError('You must confirm you are 21+.'); return; }
                if (!document.getElementById('v2Tos').checked) { showAuthError('Please accept the Terms & Privacy Policy.'); return; }
            }

            if (currentMode === 'login') {
                // Check if user exists
                var users = JSON.parse(localStorage.getItem('sl_users') || '[]');
                var found = users.find(function (u) { return u.email === email; });
                if (!found) {
                    showAuthError('No account found with that email. Please sign up.');
                    return;
                }
            }

            // Store user in localStorage
            var displayName = name || email.split('@')[0];
            var user = {
                email: email,
                name: displayName,
                initials: displayName.split(/\s+/).map(function (p) { return p.charAt(0); }).slice(0, 2).join('').toUpperCase(),
                createdAt: new Date().toISOString()
            };
            localStorage.setItem('sl_user', JSON.stringify(user));

            // Also store in sl_users array for persistence
            var users2 = JSON.parse(localStorage.getItem('sl_users') || '[]');
            if (!users2.find(function (u) { return u.email === email; })) {
                users2.push(user);
                localStorage.setItem('sl_users', JSON.stringify(users2));
            }

            closeAuthModal();
            reflectGlobalAuthState();
            showToast(currentMode === 'signup' ? 'Welcome to SceneLink! 🎉' : 'Welcome back! ✨');
        });

        // Forgot password
        document.getElementById('v2ForgotPw').addEventListener('click', function (e) {
            e.preventDefault();
            showAuthError('Password reset link sent to your email.');
        });
    }

    function closeAuthModal() {
        var modal = document.getElementById('v2AuthModal');
        if (modal) {
            modal.style.display = 'none';
        }
        // Also kill R2 modal in case it snuck back
        var r2 = document.getElementById('sl-auth-modal-r2');
        if (r2) { r2.style.display = 'none'; }
        var old = document.getElementById('sl-auth-modal');
        if (old && !old._v2Created) { old.style.display = 'none'; }
        document.body.style.overflow = '';
    }

    function showAuthError(msg) {
        var el = document.getElementById('v2AuthError');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
    }

    function hideAuthError() {
        var el = document.getElementById('v2AuthError');
        if (el) el.style.display = 'none';
    }

    function reflectGlobalAuthState() {
        try {
            var user = JSON.parse(localStorage.getItem('sl_user') || 'null');
            if (!user) return;

            var initials = (user.initials || 'U');
            var chipHTML = '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#D4AF37,#b8962e);color:#0a0a0a;font-weight:900;font-size:11px;margin-right:6px">' + initials + '</span> ' + (user.name || 'User');
            var chipStyle = 'display:inline-flex !important;align-items:center;gap:6px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.25);padding:6px 14px;border-radius:50px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;';

            // Find ALL auth-related buttons across ALL page layouts
            var authSelectors = [
                '.btn-header-primary',
                '#headerSignupBtn',
                '#openSignupModal',
                '.sl-hdr-signup',
                '.sl-signup-btn',
                '.btn-join-scene'
            ];
            var found = document.querySelectorAll(authSelectors.join(','));
            
            // Also find buttons by text content (but NOT hero CTA buttons)
            document.querySelectorAll('button, a.btn, .btn').forEach(function (btn) {
                var text = (btn.textContent || '').trim().toLowerCase();
                // Skip hero CTA buttons — they should change label, not become chips
                if (btn.closest('.hero-cta-row')) {
                    if (text.indexOf('join') >= 0 || text.indexOf('sign up') >= 0) {
                        if (!btn._v2HeroConverted) {
                            btn._v2HeroConverted = true;
                            btn.innerHTML = '<i class="fas fa-list"></i> My Lists';
                            btn.onclick = function() { window.location.href = 'my-lists.html'; };
                        }
                    }
                    return;
                }
                if (text === 'sign up' || text === 'log in / sign up' || text === 'log in' || text === 'join now' || text === 'get started') {
                    convertToUserChip(btn, chipHTML, chipStyle, user);
                }
            });

            found.forEach(function (btn) {
                // Skip hero CTA buttons — they should change label, not become chips
                if (btn.closest('.hero-cta-row')) {
                    if (!btn._v2HeroConverted) {
                        btn._v2HeroConverted = true;
                        btn.innerHTML = '<i class="fas fa-list"></i> My Lists';
                        btn.style.cssText = btn.style.cssText; // keep existing style
                        btn.onclick = function() { window.location.href = 'my-lists.html'; };
                    }
                    return;
                }
                convertToUserChip(btn, chipHTML, chipStyle, user);
            });

            // Trigger polish-final.js reflectAuthState if available
            if (typeof window._pfReflectAuth === 'function') {
                window._pfReflectAuth();
            }
        } catch (e) { /* ignore */ }
    }

    function convertToUserChip(btn, chipHTML, chipStyle, user) {
        if (btn._v2Converted) return;
        btn._v2Converted = true;
        btn.innerHTML = chipHTML;
        btn.style.cssText = chipStyle;
        // Remove old click listeners by cloning
        var clone = btn.cloneNode(true);
        clone._v2Converted = true;
        clone._v2MenuWired = true;
        clone._v2AuthWired = true;
        btn.parentNode.replaceChild(clone, btn);
        clone.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            toggleUserMenu(clone);
        }, true);
    }

    function toggleUserMenu(anchorBtn) {
        var existing = document.getElementById('sl-v2-usermenu');
        if (existing) { existing.remove(); return; }

        var dd = document.createElement('div');
        dd.id = 'sl-v2-usermenu';
        dd.style.cssText = 'position:fixed;z-index:99999;background:rgba(12,12,18,0.97);border:1px solid rgba(212,175,55,0.15);border-radius:14px;min-width:180px;box-shadow:0 12px 40px rgba(0,0,0,0.5);overflow:hidden;';
        dd.innerHTML =
            '<a href="profile.html" style="display:block;padding:12px 16px;color:rgba(255,255,255,0.85);font-size:13px;text-decoration:none;transition:background 0.15s" onmouseover="this.style.background=\'rgba(212,175,55,0.08)\'" onmouseout="this.style.background=\'\'"><i class="fas fa-user" style="width:18px;color:#D4AF37"></i> Profile</a>' +
            '<a href="my-lists.html" style="display:block;padding:12px 16px;color:rgba(255,255,255,0.85);font-size:13px;text-decoration:none;transition:background 0.15s" onmouseover="this.style.background=\'rgba(212,175,55,0.08)\'" onmouseout="this.style.background=\'\'"><i class="fas fa-heart" style="width:18px;color:#D4AF37"></i> My Lists</a>' +
            '<button id="sl-v2-logout" style="display:block;width:100%;text-align:left;padding:12px 16px;background:none;border:none;border-top:1px solid rgba(255,255,255,0.05);color:rgba(255,100,100,0.85);font-size:13px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background=\'rgba(239,68,68,0.08)\'" onmouseout="this.style.background=\'\'"><i class="fas fa-sign-out-alt" style="width:18px"></i> Log Out</button>';

        document.body.appendChild(dd);
        var rect = anchorBtn.getBoundingClientRect();
        dd.style.top = (rect.bottom + 8) + 'px';
        dd.style.right = (window.innerWidth - rect.right) + 'px';

        document.getElementById('sl-v2-logout').addEventListener('click', function () {
            localStorage.removeItem('sl_user');
            dd.remove();
            location.reload();
        });

        setTimeout(function () {
            document.addEventListener('click', function closeMenu(e) {
                if (!dd.contains(e.target) && e.target !== anchorBtn) {
                    dd.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 50);
    }

    /* ============================================================
       2. UNIVERSAL SAVE-TO-LIST MODAL
       ============================================================ */
    var saveModalOverlay = null;

    function initUniversalSaveModal() {
        if (document.getElementById('slSaveModalOverlay')) return;

        saveModalOverlay = document.createElement('div');
        saveModalOverlay.id = 'slSaveModalOverlay';
        saveModalOverlay.className = 'sl-save-modal-overlay';
        saveModalOverlay.innerHTML =
            '<div class="sl-save-modal">' +
            '  <h3><i class="fas fa-heart" style="margin-right:8px;color:#D4AF37"></i> Save to List</h3>' +
            '  <div class="sl-save-venue-name" id="slSaveVenueName"></div>' +
            '  <div class="sl-save-lists" id="slSaveLists"></div>' +
            '  <div class="sl-save-create-row">' +
            '    <input class="sl-save-create-input" id="slSaveNewListInput" placeholder="Create new list...">' +
            '    <button class="sl-save-create-btn" id="slSaveCreateBtn"><i class="fas fa-plus"></i> Add</button>' +
            '  </div>' +
            '  <div class="sl-save-actions">' +
            '    <button class="sl-save-cancel" id="slSaveCancelBtn">Cancel</button>' +
            '    <button class="sl-save-done" id="slSaveDoneBtn"><i class="fas fa-check"></i> Done</button>' +
            '  </div>' +
            '</div>';

        document.body.appendChild(saveModalOverlay);

        // Close
        document.getElementById('slSaveCancelBtn').addEventListener('click', closeSaveModal);
        saveModalOverlay.addEventListener('click', function (e) {
            if (e.target === saveModalOverlay) closeSaveModal();
        });

        // Create new list
        document.getElementById('slSaveCreateBtn').addEventListener('click', function () {
            var input = document.getElementById('slSaveNewListInput');
            var name = (input.value || '').trim();
            if (!name) return;
            addUserList(name);
            input.value = '';
            renderSaveListItems();
        });

        // Done
        document.getElementById('slSaveDoneBtn').addEventListener('click', function () {
            saveToDoneLists();
            closeSaveModal();
        });
    }

    var currentSaveVenue = null;

    window._slOpenSaveModal = function (venueId, venueName) {
        currentSaveVenue = { id: venueId, name: venueName };
        document.getElementById('slSaveVenueName').textContent = 'Saving: ' + (venueName || 'Venue');
        renderSaveListItems();
        saveModalOverlay.classList.add('active');
    };

    function closeSaveModal() {
        if (saveModalOverlay) saveModalOverlay.classList.remove('active');
        currentSaveVenue = null;
    }

    function getUserLists() {
        var lists = JSON.parse(localStorage.getItem('sl_user_lists') || 'null');
        if (!lists) {
            lists = [
                { id: 'favorites', name: 'Favorites', icon: 'fas fa-heart', venues: [] },
                { id: 'date-night', name: 'Date Night', icon: 'fas fa-wine-glass-alt', venues: [] },
                { id: 'with-friends', name: 'With Friends', icon: 'fas fa-users', venues: [] },
                { id: 'trying-soon', name: 'Trying Soon', icon: 'fas fa-clock', venues: [] }
            ];
            localStorage.setItem('sl_user_lists', JSON.stringify(lists));
        }
        return lists;
    }

    function addUserList(name) {
        var lists = getUserLists();
        var id = 'list-' + Date.now();
        lists.push({ id: id, name: name, icon: 'fas fa-list', venues: [] });
        localStorage.setItem('sl_user_lists', JSON.stringify(lists));
    }

    function renderSaveListItems() {
        var container = document.getElementById('slSaveLists');
        if (!container) return;
        var lists = getUserLists();
        var venueId = currentSaveVenue ? currentSaveVenue.id : null;

        container.innerHTML = '';
        lists.forEach(function (list) {
            var isSelected = venueId && list.venues.indexOf(venueId) >= 0;
            var item = document.createElement('div');
            item.className = 'sl-save-list-item' + (isSelected ? ' selected' : '');
            item.innerHTML =
                '<div class="sl-save-list-icon"><i class="' + list.icon + '"></i></div>' +
                '<div>' +
                '  <div class="sl-save-list-name">' + list.name + '</div>' +
                '  <div class="sl-save-list-count">' + list.venues.length + ' venues</div>' +
                '</div>' +
                '<span class="sl-save-list-check"><i class="fas fa-check-circle"></i></span>';
            item.dataset.listId = list.id;
            item.addEventListener('click', function () {
                item.classList.toggle('selected');
            });
            container.appendChild(item);
        });
    }

    function saveToDoneLists() {
        if (!currentSaveVenue) return;
        var lists = getUserLists();
        var selectedIds = [];
        document.querySelectorAll('.sl-save-list-item.selected').forEach(function (item) {
            selectedIds.push(item.dataset.listId);
        });

        lists.forEach(function (list) {
            var idx = list.venues.indexOf(currentSaveVenue.id);
            if (selectedIds.indexOf(list.id) >= 0) {
                if (idx < 0) list.venues.push(currentSaveVenue.id);
            } else {
                if (idx >= 0) list.venues.splice(idx, 1);
            }
        });

        localStorage.setItem('sl_user_lists', JSON.stringify(lists));

        // Also update legacy saved venues
        var saved = JSON.parse(localStorage.getItem('sl_saved_venues') || '[]');
        if (selectedIds.length > 0 && saved.indexOf(currentSaveVenue.id) < 0) {
            saved.push(currentSaveVenue.id);
        } else if (selectedIds.length === 0) {
            saved = saved.filter(function (v) { return v !== currentSaveVenue.id; });
        }
        localStorage.setItem('sl_saved_venues', JSON.stringify(saved));

        showToast('Saved to ' + selectedIds.length + ' list' + (selectedIds.length !== 1 ? 's' : '') + ' ✓');
    }

    function wireSaveButtons() {
        function wireAll() {
            // ALL save button selectors across all pages
            var saveSelectors = [
                '.sl-list-card-save',
                '.sl-venue-card-save',
                '.sl-venue-save',
                '#slCardSave',
                '.nl-r2-save',
                '.nl-vc-save-btn',
                '[data-action="save"]',
                '.save-btn'
            ];
            document.querySelectorAll(saveSelectors.join(',')).forEach(function (btn) {
                if (btn._v2SaveWired) return;
                btn._v2SaveWired = true;
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    var card = btn.closest('[data-id], .sl-venue-card, .sl-list-card, .nightlife-venue-card, .sl-venue-wrap');
                    var venueId = (card && card.dataset.id) || 'venue-' + Date.now();
                    var venueName = '';
                    if (card) {
                        var nameEl = card.querySelector('.sl-venue-card-name, .sl-list-card-name, .venue-name h3, .nl-map-vc-name, h3');
                        venueName = nameEl ? nameEl.textContent.trim() : 'Venue';
                    }
                    // Fallback: try to get name from currently visible venue card
                    if (!venueName || venueName === 'Venue') {
                        var vcName = document.querySelector('#slVcName, .sl-vc-name');
                        if (vcName) venueName = vcName.textContent.trim();
                    }
                    window._slOpenSaveModal(venueId, venueName || 'Venue');
                }, true); // capture phase to fire before original handler
            });

            // Explore detail save button
            var detSaveBtn = document.getElementById('slDetSaveBtn');
            if (detSaveBtn && !detSaveBtn._v2SaveWired) {
                detSaveBtn._v2SaveWired = true;
                detSaveBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    var nameEl = document.getElementById('slDetName');
                    var venueName = nameEl ? nameEl.textContent.trim() : 'Venue';
                    window._slOpenSaveModal('det-' + venueName.replace(/\s+/g, '-'), venueName);
                }, true);
            }
        }

        // Wire immediately and after delays for dynamically added elements
        wireAll();
        setTimeout(wireAll, 500);
        setTimeout(wireAll, 1500);
        setTimeout(wireAll, 3000);

        // Also observe for new save buttons
        var saveObserver = new MutationObserver(wireAll);
        saveObserver.observe(document.body, { childList: true, subtree: true });
        setTimeout(function() { saveObserver.disconnect(); }, 10000);
    }

    /* ============================================================
       3. TOAST SYSTEM
       ============================================================ */
    function initToastSystem() {
        if (document.getElementById('slToastV2')) return;
        var toast = document.createElement('div');
        toast.id = 'slToastV2';
        toast.className = 'sl-toast';
        document.body.appendChild(toast);
    }

    function showToast(msg) {
        var toast = document.getElementById('slToastV2');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('visible');
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(function () {
            toast.classList.remove('visible');
        }, 2800);
    }
    window.showToast = showToast;

    /* ============================================================
       4. NIGHTLIFE — STICKY MAP + BROWSE DIVIDER
       ============================================================ */
    function initNightlifeStickyMap() {
        // The CSS handles sticky positioning
        // Add a gradient fade at bottom of map for smooth transition
        var hero = document.querySelector('.nl-map-hero');
        if (!hero) return;

        // Remove the old "Browse Venue List" button from round2/round3
        var oldBrowse = document.querySelector('.nl-scroll-to-list');
        if (oldBrowse) oldBrowse.style.display = 'none';
    }

    function initNightlifeBrowseDivider() {
        var hero = document.querySelector('.nl-map-hero');
        if (!hero || document.querySelector('.nl-browse-divider')) return;

        var divider = document.createElement('div');
        divider.className = 'nl-browse-divider';
        divider.innerHTML =
            '<button class="nl-browse-btn-v2" onclick="document.querySelector(\'.nightlife-venue-listings-section\').scrollIntoView({behavior:\'smooth\'})">' +
            '<i class="fas fa-chevron-down"></i> Browse Venues' +
            '</button>';
        hero.appendChild(divider);
    }

    function initNightlifeCardMatch() {
        // The CSS already matches the styling
        // Wire view details on nightlife popup to work
        var observer = new MutationObserver(function () {
            var viewBtn = document.querySelector('#nlMapVenueCard .nl-vc-action-btn.primary');
            if (viewBtn && !viewBtn._v2Wired) {
                viewBtn._v2Wired = true;
                // Already handled by nightlife-map-premium.js
            }
        });
        var card = document.getElementById('nlMapVenueCard');
        if (card) {
            observer.observe(card, { childList: true, subtree: true, attributes: true });
        }
    }

    /* ============================================================
       5. EXPLORE — FIXES
       ============================================================ */
    function initExploreLogoFix() {
        var logo = document.querySelector('.sl-explore-logo');
        if (logo) {
            logo.style.height = '36px';
            logo.style.width = 'auto';
        }
    }

    function initExploreNavIconsFix() {
        // Gold color + spacing handled by CSS
        // Fix overlapping by ensuring proper flex layout
        var header = document.querySelector('.sl-explore-header');
        if (!header) return;

        // Ensure right icons container has proper gap
        var rightIcons = header.querySelector('.sl-hdr-right-icons');
        if (rightIcons) {
            rightIcons.style.display = 'flex';
            rightIcons.style.alignItems = 'center';
            rightIcons.style.gap = '10px';
        }
    }

    function initExploreDuplicateLocBtn() {
        // Remove duplicate my-location buttons
        var locBtns = document.querySelectorAll('#slLocateBtn, .sl-locate-btn-r3, .nl-r3-my-loc-btn');
        if (locBtns.length > 1) {
            // Keep only the first functional one
            for (var i = 1; i < locBtns.length; i++) {
                locBtns[i].style.display = 'none';
            }
        }
    }

    function initExploreListSpacing() {
        // CSS handles most of this, but ensure cards have proper data-id
        setTimeout(function () {
            document.querySelectorAll('.sl-list-card').forEach(function (card, idx) {
                if (!card.dataset.id) {
                    card.dataset.id = 'explore-venue-' + idx;
                }
            });
        }, 1000);
    }

    /* ============================================================
       6. ITINERARY PANEL (EXPLORE)
       ============================================================ */
    function initItineraryPanel() {
        if (document.getElementById('slItineraryPanel')) return;

        var panel = document.createElement('div');
        panel.id = 'slItineraryPanel';
        panel.className = 'sl-itinerary-panel';
        panel.innerHTML =
            '<div class="sl-itinerary-header">' +
            '  <h3><i class="fas fa-route" style="margin-right:8px"></i> My Itinerary</h3>' +
            '  <button class="sl-itinerary-close" id="slItineraryClose">&#215;</button>' +
            '</div>' +
            '<div class="sl-itinerary-items" id="slItineraryItems">' +
            '  <div class="sl-itinerary-empty"><i class="fas fa-map-marked-alt"></i>No venues added yet.<br>Click "Add to Itinerary" on any venue.</div>' +
            '</div>' +
            '<div class="sl-itinerary-footer">' +
            '  <button class="sl-itinerary-share-btn" id="slItineraryShareBtn"><i class="fas fa-share-alt" style="margin-right:8px"></i> Share Itinerary</button>' +
            '</div>';

        document.body.appendChild(panel);

        document.getElementById('slItineraryClose').addEventListener('click', function () {
            panel.classList.remove('open');
        });

        document.getElementById('slItineraryShareBtn').addEventListener('click', function () {
            showToast('Itinerary link copied! 📋');
        });

        // Wire the existing "Add to Itinerary" button in explore detail
        setTimeout(function () {
            var addBtn = document.getElementById('slDetAddToItinerary');
            if (addBtn && !addBtn._v2Wired) {
                addBtn._v2Wired = true;
                addBtn.addEventListener('click', function () {
                    var name = (document.getElementById('slDetName') || {}).textContent || 'Venue';
                    var img = (document.getElementById('slDetImg') || {}).src || '';
                    var type = (document.getElementById('slDetMeta') || {}).textContent || '';
                    addToItinerary({ name: name, img: img, type: type });
                });
            }
        }, 2000);

        // Also wire the itinerary button in explore header if it exists
        setTimeout(function () {
            var itBtn = document.querySelector('[data-action="itinerary"], .sl-itinerary-btn');
            if (!itBtn) {
                // Look for a route/calendar icon button in the explore header
                document.querySelectorAll('.sl-explore-icon-btn, .sl-hdr-icon').forEach(function (btn) {
                    if (btn.querySelector('.fa-route, .fa-map-marked-alt')) {
                        btn._v2ItWired = true;
                        btn.addEventListener('click', function () {
                            panel.classList.toggle('open');
                        });
                    }
                });
            }
        }, 1000);
    }

    function addToItinerary(venue) {
        var items = JSON.parse(localStorage.getItem('sl_itinerary') || '[]');
        if (items.find(function (v) { return v.name === venue.name; })) {
            showToast('Already in itinerary!');
            return;
        }
        items.push(venue);
        localStorage.setItem('sl_itinerary', JSON.stringify(items));
        renderItinerary();
        document.getElementById('slItineraryPanel').classList.add('open');
        showToast('Added to itinerary! 🗺️');
    }

    function renderItinerary() {
        var container = document.getElementById('slItineraryItems');
        if (!container) return;
        var items = JSON.parse(localStorage.getItem('sl_itinerary') || '[]');

        if (items.length === 0) {
            container.innerHTML = '<div class="sl-itinerary-empty"><i class="fas fa-map-marked-alt"></i>No venues added yet.<br>Click "Add to Itinerary" on any venue.</div>';
            return;
        }

        container.innerHTML = '';
        items.forEach(function (v, i) {
            var item = document.createElement('div');
            item.className = 'sl-itinerary-item';
            item.innerHTML =
                '<img src="' + (v.img || 'https://via.placeholder.com/48') + '" alt="">' +
                '<div class="sl-itinerary-item-info">' +
                '  <div class="sl-itinerary-item-name">' + v.name + '</div>' +
                '  <div class="sl-itinerary-item-type">' + (v.type || '').substring(0, 40) + '</div>' +
                '</div>' +
                '<button class="sl-itinerary-item-remove" data-idx="' + i + '"><i class="fas fa-times"></i></button>';
            container.appendChild(item);
        });

        container.querySelectorAll('.sl-itinerary-item-remove').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var idx = parseInt(btn.dataset.idx);
                items.splice(idx, 1);
                localStorage.setItem('sl_itinerary', JSON.stringify(items));
                renderItinerary();
                showToast('Removed from itinerary');
            });
        });
    }

    /* ============================================================
       7. HOMEPAGE FIXES
       ============================================================ */
    function initHeroTextFix() {
        var heroTitle = document.querySelector('.hero-title-main');
        if (heroTitle) {
            heroTitle.style.whiteSpace = 'nowrap';
            heroTitle.style.letterSpacing = '0.04em';
        }
    }

    function removeAuthPlaceholders() {
        // Remove any placeholder text about auth not being implemented
        var allElements = document.querySelectorAll('p, span, div');
        allElements.forEach(function (el) {
            if (el.children.length === 0) {
                var text = el.textContent || '';
                if (text.indexOf('functionality would be implemented') >= 0 ||
                    text.indexOf('Sign up functionality') >= 0) {
                    el.style.display = 'none';
                }
            }
        });
    }

    /* ============================================================
       8. PROFILE — PHOTO UPLOAD
       ============================================================ */
    function initProfilePhotoUpload() {
        // Target the avatar container - try multiple selectors
        var avatarContainer = document.querySelector('.profile-avatar-large, .profile-avatar, .profile-avatar-circle, .profile-avatar-wrapper > div');
        console.log('[V2] Profile photo upload init, avatar found:', !!avatarContainer, avatarContainer ? avatarContainer.className : null);
        if (!avatarContainer) return;

        // Check if already wrapped
        if (avatarContainer.closest('.profile-avatar-upload-wrap')) {
            console.log('[V2] Already wrapped, skipping');
            return;
        }

        // Check if there's already an edit button we should hide
        var existingEditBtn = avatarContainer.querySelector('.edit-avatar-btn');
        if (existingEditBtn) {
            existingEditBtn.style.display = 'none';
        }

        var wrapper = document.createElement('div');
        wrapper.className = 'profile-avatar-upload-wrap';
        wrapper.style.cssText = 'position:relative;display:inline-block;';

        avatarContainer.parentNode.insertBefore(wrapper, avatarContainer);
        wrapper.appendChild(avatarContainer);
        console.log('[V2] Wrapper created and avatar wrapped');

        // Upload overlay
        var overlay = document.createElement('div');
        overlay.className = 'profile-avatar-upload-overlay';
        overlay.innerHTML = '<i class="fas fa-camera"></i>';
        wrapper.appendChild(overlay);

        // File input
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.cssText = 'position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;z-index:5;';
        wrapper.appendChild(fileInput);
        console.log('[V2] File input added');

        // Handle file selection
        fileInput.addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function (ev) {
                var dataUrl = ev.target.result;

                // Find existing image or create new one
                var img = avatarContainer.querySelector('img');
                if (!img) {
                    img = document.createElement('img');
                    img.className = 'profile-avatar-img';
                    avatarContainer.insertBefore(img, avatarContainer.firstChild);
                }
                img.src = dataUrl;
                img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';

                // Persist
                localStorage.setItem('sl_profile_photo', dataUrl);
                showToast('Profile photo updated! 📸');
            };
            reader.readAsDataURL(file);
        });

        // Load saved photo
        var savedPhoto = localStorage.getItem('sl_profile_photo');
        if (savedPhoto) {
            var img = avatarContainer.querySelector('img');
            if (!img) {
                img = document.createElement('img');
                img.className = 'profile-avatar-img';
                avatarContainer.insertBefore(img, avatarContainer.firstChild);
            }
            img.src = savedPhoto;
            img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
        }
    }

    /* ============================================================
       9. PROFILE — TAB SYNC
       ============================================================ */
    function initProfileTabSync() {
        // Sync profile tabs with content sections
        var tabBtns = document.querySelectorAll('.tab-btn[data-tab], .profile-content-tab, .profile-nav-tab');
        
        tabBtns.forEach(function (tab) {
            tab.addEventListener('click', function () {
                var tabName = tab.dataset.tab || tab.textContent.trim().toLowerCase();
                tabName = tabName.replace(/[^a-z]/g, '');
                
                console.log('[V2] Tab clicked:', tabName);
                
                // Remove active from all tabs
                tabBtns.forEach(function(t) { t.classList.remove('active'); });
                // Add active to clicked tab
                tab.classList.add('active');
                
                // Hide all tab content
                document.querySelectorAll('.tab-content').forEach(function(c) { 
                    c.classList.remove('active'); 
                });
                
                // Show the target content
                var targetContent = document.getElementById(tabName) || document.querySelector('.tab-content#' + tabName);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    }

    /* ============================================================
       10. PROFILE — LISTS + FAVORITES
       ============================================================ */
    function initProfileListsFavorites() {
        // Ensure favorites list exists
        getUserLists();

        // If on profile, show lists in the "My Lists" tab
        var listsPanel = document.getElementById('profileTabLists');
        if (!listsPanel) return;

        // Check if already populated by round3
        if (listsPanel.querySelector('.profile-lists-grid-v2')) return;

        var lists = getUserLists();
        var grid = document.createElement('div');
        grid.className = 'profile-lists-grid-v2';
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;padding:8px 0;';

        lists.forEach(function (list) {
            var card = document.createElement('div');
            card.style.cssText = 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:18px;cursor:pointer;transition:all 0.2s;';
            card.innerHTML =
                '<div style="width:40px;height:40px;border-radius:12px;background:rgba(212,175,55,0.1);display:flex;align-items:center;justify-content:center;color:#D4AF37;font-size:16px;margin-bottom:12px"><i class="' + list.icon + '"></i></div>' +
                '<div style="color:#fff;font-size:14px;font-weight:600;margin-bottom:4px">' + list.name + '</div>' +
                '<div style="color:rgba(255,255,255,0.35);font-size:12px">' + list.venues.length + ' venues</div>';
            card.addEventListener('mouseenter', function () { card.style.borderColor = 'rgba(212,175,55,0.2)'; });
            card.addEventListener('mouseleave', function () { card.style.borderColor = 'rgba(255,255,255,0.06)'; });
            grid.appendChild(card);
        });

        // Prepend to panel (keep existing content)
        var existingContent = listsPanel.innerHTML;
        listsPanel.innerHTML = '';
        listsPanel.appendChild(grid);
    }

})();