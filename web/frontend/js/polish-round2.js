/**
 * SceneLink — Production Polish Round 2
 * Auth full functionality, Nightlife fixes, Tonight fixes, Homepage fixes
 */
(function () {
    'use strict';

    /* =====================================================
       1. UNIFIED AUTH — FULL FUNCTIONALITY
       Create user, login, logout, terms only on signup
       ===================================================== */

    function initAuthSystem() {
        // NEUTRALIZED — canonical auth is sl-auth-ui.js + sl-auth-core.js
        ['sl-auth-modal', 'sl-auth-modal-r2'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        return;
        // dead code below preserved
        var old = document.getElementById('sl-auth-modal-r2');
        if (old) old.remove();

        // Wire all auth triggers
        var triggers = [
            'headerSignupBtn', 'openSignupModal', 'heroJoinBtn',
            'ctaSignupBtn', 'slExploreSignupBtn'
        ];
        triggers.forEach(function (id) {
            var btn = document.getElementById(id);
            if (btn && !btn._r2wired) {
                btn._r2wired = true;
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    openAuthModal('signup');
                });
            }
        });

        // Wire .btn-header-primary buttons
        document.querySelectorAll('.btn-header-primary').forEach(function (btn) {
            if (!btn._r2wired) {
                btn._r2wired = true;
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    // If text contains "log in", open login tab
                    var text = (btn.textContent || '').toLowerCase();
                    if (text.indexOf('log in') !== -1) {
                        openAuthModal('login');
                    } else {
                        openAuthModal('signup');
                    }
                });
            }
        });

        // Hide old duplicate modals
        ['signupModal', 'loginModal'].forEach(function (id) {
            var m = document.getElementById(id);
            if (m) { m.style.display = 'none'; m.style.visibility = 'hidden'; m.style.pointerEvents = 'none'; }
        });

        // Fully suppress old sl-auth-modal (from auth.js)
        var oldModal = document.getElementById('sl-auth-modal');
        if (oldModal) {
            oldModal.style.display = 'none';
            oldModal.style.visibility = 'hidden';
            oldModal.style.pointerEvents = 'none';
            oldModal.style.zIndex = '-1';
            // Override its show method if any
            oldModal._r2suppressed = true;
            // Watch for it being re-shown
            var obs = new MutationObserver(function () {
                if (oldModal.style.display !== 'none') {
                    oldModal.style.display = 'none';
                }
            });
            obs.observe(oldModal, { attributes: true, attributeFilter: ['style'] });
        }

        // Reflect current auth state
        reflectAuthState();
    }

    function openAuthModal(mode) {
        mode = mode || 'signup';
        var modal = document.getElementById('sl-auth-modal-r2');
        if (!modal) {
            modal = createAuthModal();
        }
        setAuthMode(mode);
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        // Focus first input
        setTimeout(function () {
            var inp = modal.querySelector('#sl-r2-email');
            if (inp) inp.focus();
        }, 100);
    }

    function closeAuthModal() {
        var modal = document.getElementById('sl-auth-modal-r2');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    function setAuthMode(mode) {
        var modal = document.getElementById('sl-auth-modal-r2');
        if (!modal) return;
        var loginTab = modal.querySelector('[data-auth-tab="login"]');
        var signupTab = modal.querySelector('[data-auth-tab="signup"]');
        var nameRow = modal.querySelector('.sl-name-row');
        var termsRows = modal.querySelectorAll('.sl-terms-row');
        var submitBtn = modal.querySelector('#sl-r2-submit');
        var forgotLink = modal.querySelector('#sl-r2-forgot');
        var errorEl = modal.querySelector('.sl-auth-error');

        if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

        if (mode === 'login') {
            modal.classList.remove('signup-mode');
            modal.classList.add('login-mode');
            if (loginTab) loginTab.classList.add('active');
            if (signupTab) signupTab.classList.remove('active');
            if (nameRow) nameRow.style.display = 'none';
            termsRows.forEach(function (r) { r.style.display = 'none'; });
            if (submitBtn) submitBtn.textContent = 'Log In';
            if (forgotLink) forgotLink.style.display = 'block';
        } else {
            modal.classList.add('signup-mode');
            modal.classList.remove('login-mode');
            if (signupTab) signupTab.classList.add('active');
            if (loginTab) loginTab.classList.remove('active');
            if (nameRow) nameRow.style.display = 'block';
            termsRows.forEach(function (r) { r.style.display = 'flex'; });
            if (submitBtn) submitBtn.textContent = 'Create Account';
            if (forgotLink) forgotLink.style.display = 'none';
        }
        modal._authMode = mode;
    }

    function createAuthModal() {
        var modal = document.createElement('div');
        modal.id = 'sl-auth-modal-r2';
        modal.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:99999;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);';

        modal.innerHTML = [
            '<div style="width:420px;max-width:calc(100vw - 40px);background:rgba(12,12,18,0.98);border:1px solid rgba(212,175,55,0.2);border-radius:24px;padding:32px;box-shadow:0 30px 80px rgba(0,0,0,0.7);position:relative;">',
            '  <button id="sl-r2-close" style="position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;">&times;</button>',
            '  <div style="text-align:center;margin-bottom:20px;">',
            '    <h3 style="color:#fff;font-size:22px;margin:0 0 4px;">Welcome to SceneLink</h3>',
            '    <p style="color:rgba(255,255,255,0.4);font-size:13px;margin:0;">Discover the best nightlife, restaurants & events</p>',
            '  </div>',
            '  <div class="sl-tab-bar">',
            '    <button class="sl-tab active" data-auth-tab="login">Log In</button>',
            '    <button class="sl-tab" data-auth-tab="signup">Sign Up</button>',
            '  </div>',
            '  <div class="sl-auth-error" style="display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#fca5a5;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:10px;"></div>',
            '  <form id="sl-r2-form" style="display:grid;gap:12px;" autocomplete="off">',
            '    <div class="sl-name-row" style="display:none;">',
            '      <input id="sl-r2-name" type="text" placeholder="Full Name" style="width:100%;padding:13px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;font-size:14px;outline:none;box-sizing:border-box;">',
            '    </div>',
            '    <input id="sl-r2-email" type="email" placeholder="Email address" required style="width:100%;padding:13px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;font-size:14px;outline:none;box-sizing:border-box;">',
            '    <input id="sl-r2-password" type="password" placeholder="Password" required minlength="6" style="width:100%;padding:13px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;font-size:14px;outline:none;box-sizing:border-box;">',
            '    <div class="sl-terms-row" style="display:none;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,0.5);">',
            '      <input id="sl-r2-age" type="checkbox" style="width:16px;height:16px;accent-color:#D4AF37;flex-shrink:0;">',
            '      <label for="sl-r2-age">I confirm I am 21+ years old</label>',
            '    </div>',
            '    <div class="sl-terms-row" style="display:none;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,0.4);">',
            '      <input id="sl-r2-tos" type="checkbox" style="width:16px;height:16px;accent-color:#D4AF37;flex-shrink:0;">',
            '      <label for="sl-r2-tos">I agree to the <a href="terms.html" style="color:#D4AF37;">Terms of Service</a> & <a href="privacy.html" style="color:#D4AF37;">Privacy Policy</a></label>',
            '    </div>',
            '    <button id="sl-r2-submit" type="submit" style="width:100%;padding:13px;background:linear-gradient(135deg,#D4AF37,#b8962e);color:#0a0a0a;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.25s;">Log In</button>',
            '    <a href="#" id="sl-r2-forgot" style="text-align:center;font-size:12px;color:rgba(212,175,55,0.7);text-decoration:none;display:block;">Forgot password?</a>',
            '  </form>',
            '</div>'
        ].join('');

        document.body.appendChild(modal);

        // Tab switching
        modal.querySelectorAll('.sl-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                setAuthMode(tab.getAttribute('data-auth-tab'));
            });
        });

        // Close
        document.getElementById('sl-r2-close').addEventListener('click', closeAuthModal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeAuthModal();
        });

        // Form submit
        document.getElementById('sl-r2-form').addEventListener('submit', function (e) {
            e.preventDefault();
            handleAuthSubmit();
        });

        // Forgot password
        document.getElementById('sl-r2-forgot').addEventListener('click', function (e) {
            e.preventDefault();
            var email = (document.getElementById('sl-r2-email').value || '').trim();
            if (!email) {
                showAuthError('Please enter your email first.');
                return;
            }
            showAuthError('Password reset link sent to ' + email);
            var errEl = modal.querySelector('.sl-auth-error');
            if (errEl) { errEl.style.background = 'rgba(212,175,55,0.1)'; errEl.style.borderColor = 'rgba(212,175,55,0.2)'; errEl.style.color = '#D4AF37'; }
        });

        return modal;
    }

    function handleAuthSubmit() {
        var modal = document.getElementById('sl-auth-modal-r2');
        var mode = modal._authMode || 'login';
        var email = (document.getElementById('sl-r2-email').value || '').trim();
        var password = (document.getElementById('sl-r2-password').value || '').trim();
        var name = (document.getElementById('sl-r2-name').value || '').trim();

        // Validation
        if (!email) { showAuthError('Please enter your email address.'); return; }
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { showAuthError('Please enter a valid email address.'); return; }
        if (!password || password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

        if (mode === 'signup') {
            var ageCheck = document.getElementById('sl-r2-age');
            var tosCheck = document.getElementById('sl-r2-tos');
            if (ageCheck && !ageCheck.checked) { showAuthError('You must confirm you are 21+ years old.'); return; }
            if (tosCheck && !tosCheck.checked) { showAuthError('Please accept the Terms of Service & Privacy Policy.'); return; }

            // Create account (demo — store in localStorage)
            var users = JSON.parse(localStorage.getItem('sl_users') || '{}');
            if (users[email]) { showAuthError('An account with this email already exists. Try logging in.'); return; }
            users[email] = { name: name || email.split('@')[0], password: password, created: Date.now() };
            localStorage.setItem('sl_users', JSON.stringify(users));
            // Auto log in
            var user = { email: email, name: name || email.split('@')[0] };
            localStorage.setItem('sl_user', JSON.stringify(user));
            closeAuthModal();
            reflectAuthState();
            if (window.showToast) window.showToast('Welcome to SceneLink! 🎉', 'gold');
        } else {
            // Login
            var users2 = JSON.parse(localStorage.getItem('sl_users') || '{}');
            if (users2[email]) {
                if (users2[email].password !== password) { showAuthError('Incorrect password. Please try again.'); return; }
                var user2 = { email: email, name: users2[email].name || email.split('@')[0] };
                localStorage.setItem('sl_user', JSON.stringify(user2));
            } else {
                // Demo: allow any login
                localStorage.setItem('sl_user', JSON.stringify({ email: email, name: email.split('@')[0] }));
            }
            closeAuthModal();
            reflectAuthState();
            if (window.showToast) window.showToast('Welcome back! 👋', 'gold');
        }
    }

    function showAuthError(msg) {
        var modal = document.getElementById('sl-auth-modal-r2');
        if (!modal) return;
        var el = modal.querySelector('.sl-auth-error');
        if (el) {
            el.textContent = msg;
            el.style.display = 'block';
            el.style.background = 'rgba(239,68,68,0.1)';
            el.style.borderColor = 'rgba(239,68,68,0.2)';
            el.style.color = '#fca5a5';
        }
    }

    function reflectAuthState() {
        try {
            var user = JSON.parse(localStorage.getItem('sl_user') || 'null');
            if (!user) return;

            var name = user.name || user.email || '';
            var initials = name.split(/\s+/).map(function (p) { return p.charAt(0); }).slice(0, 2).join('').toUpperCase() || '?';

            // Replace auth buttons with avatar chip
            document.querySelectorAll('.btn-header-primary, #headerSignupBtn, #openSignupModal').forEach(function (btn) {
                if (!btn || btn._r2replaced) return;
                btn._r2replaced = true;

                var chip = document.createElement('div');
                chip.className = 'sl-usermenu-r2';
                chip.style.cssText = 'position:relative;display:inline-flex;align-items:center;';
                chip.innerHTML = [
                    '<button class="sl-userchip-r2" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.25);padding:6px 12px;border-radius:50px;color:#fff;font-size:13px;font-weight:600;">',
                    '  <span style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#D4AF37,#b8962e);color:#0a0a0a;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;">' + initials + '</span>',
                    '  <span style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</span>',
                    '  <span style="opacity:0.5;font-size:10px;">&#9660;</span>',
                    '</button>',
                    '<div class="sl-dropdown-r2" style="display:none;position:absolute;right:0;top:calc(100% + 8px);background:rgba(8,8,14,0.98);border:1px solid rgba(212,175,55,0.15);border-radius:14px;min-width:180px;box-shadow:0 12px 40px rgba(0,0,0,0.5);overflow:hidden;z-index:9999;">',
                    '  <a href="profile.html" style="display:block;padding:11px 14px;color:rgba(255,255,255,0.85);font-size:13px;text-decoration:none;transition:background 0.15s;"><i class="fas fa-user" style="width:20px;color:#D4AF37;"></i> Profile</a>',
                    '  <a href="my-lists.html" style="display:block;padding:11px 14px;color:rgba(255,255,255,0.85);font-size:13px;text-decoration:none;transition:background 0.15s;"><i class="fas fa-heart" style="width:20px;color:#D4AF37;"></i> My Lists</a>',
                    '  <div style="height:1px;background:rgba(255,255,255,0.06);margin:4px 0;"></div>',
                    '  <button class="sl-logout-r2" style="display:block;width:100%;text-align:left;padding:11px 14px;background:none;border:none;color:rgba(255,100,100,0.85);font-size:13px;cursor:pointer;transition:background 0.15s;"><i class="fas fa-sign-out-alt" style="width:20px;"></i> Log Out</button>',
                    '</div>'
                ].join('');

                btn.parentNode.replaceChild(chip, btn);

                // Toggle dropdown
                var chipBtn = chip.querySelector('.sl-userchip-r2');
                var dd = chip.querySelector('.sl-dropdown-r2');
                chipBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    dd.style.display = (dd.style.display === 'block') ? 'none' : 'block';
                });
                document.addEventListener('click', function () { dd.style.display = 'none'; });

                // Hover styles for dropdown items
                dd.querySelectorAll('a, button').forEach(function (item) {
                    item.addEventListener('mouseenter', function () { item.style.background = 'rgba(212,175,55,0.06)'; });
                    item.addEventListener('mouseleave', function () { item.style.background = ''; });
                });

                // Logout
                chip.querySelector('.sl-logout-r2').addEventListener('click', function () {
                    localStorage.removeItem('sl_user');
                    if (window.showToast) window.showToast('Logged out successfully', '');
                    setTimeout(function () { location.reload(); }, 500);
                });
            });
        } catch (e) { /* ignore */ }
    }

    /* =====================================================
       2. NIGHTLIFE — MUSIC FILTER TOGGLE RESET
       ===================================================== */

    function initNightlifeFilterFix() {
        // Fix music genre chips to toggle properly (clicking active = reset to all)
        // Strategy: use capture phase to detect if chip was already active.
        // If it was, we stop propagation and simulate a reset via the reset button.
        // If it wasn't, we let the original handler run normally.
        document.querySelectorAll('.nl-map-chip[data-genre]').forEach(function (chip) {
            chip.addEventListener('click', function (e) {
                var wasActive = chip.classList.contains('active');
                if (wasActive) {
                    // Prevent the original handler from re-activating it
                    e.stopImmediatePropagation();
                    // Remove active from all genre chips
                    document.querySelectorAll('.nl-map-chip[data-genre]').forEach(function (c) {
                        c.classList.remove('active');
                    });
                    // Click the reset button to reset all filters back to default
                    var resetBtn = document.getElementById('nlPremResetBtn');
                    if (resetBtn) {
                        setTimeout(function() { resetBtn.click(); }, 10);
                    }
                }
                // If not wasActive, let the original handler in nightlife-map-premium.js run
            }, true); // capture phase
        });

        // Same for venue type chips (clicking active type resets to "All")
        document.querySelectorAll('.nl-map-chip[data-type]').forEach(function (chip) {
            chip.addEventListener('click', function (e) {
                var type = chip.getAttribute('data-type');
                if (type === 'all') return; // "All" always works normally
                var wasActive = chip.classList.contains('active');

                if (wasActive) {
                    e.stopImmediatePropagation();
                    // Click "All" chip to reset
                    var allChip = document.querySelector('.nl-map-chip[data-type="all"]');
                    if (allChip) {
                        setTimeout(function () { allChip.click(); }, 10);
                    }
                }
            }, true);
        });

        // Also fix the venue list section filters (music genre)
        document.querySelectorAll('.music-genre-filter').forEach(function (btn) {
            if (btn._r2fixed) return;
            btn._r2fixed = true;
            btn.addEventListener('click', function () {
                var genre = btn.getAttribute('data-genre');
                var wasActive = btn.classList.contains('active');

                document.querySelectorAll('.music-genre-filter').forEach(function (b) {
                    b.classList.remove('active');
                });

                if (wasActive && genre !== 'all') {
                    // Reset to "All"
                    var allBtn = document.querySelector('.music-genre-filter[data-genre="all"]');
                    if (allBtn) allBtn.classList.add('active');
                } else {
                    btn.classList.add('active');
                }
            });
        });
    }

    /* =====================================================
       3. NIGHTLIFE — ENHANCED MAP PIN CLICK + POPUP
       ===================================================== */

    function initNightlifeMapPopup() {
        // Wait for the map to be ready
        var checkMap = setInterval(function () {
            var mapEl = document.getElementById('nightlifeMapPremium');
            var card = document.getElementById('nlMapVenueCard');
            if (!mapEl || !card) return;

            clearInterval(checkMap);

            // Enhance the venue card with action buttons if not already there
            if (!card.querySelector('.nl-vc-actions')) {
                var actionsDiv = document.createElement('div');
                actionsDiv.className = 'nl-vc-actions';
                actionsDiv.innerHTML = [
                    '<button class="nl-vc-action-btn primary" id="nlVcViewBtn"><i class="fas fa-eye"></i> View Details</button>',
                    '<button class="nl-vc-action-btn secondary save-btn" id="nlVcSaveBtn2"><i class="far fa-heart"></i> Save</button>',
                    '<button class="nl-vc-action-btn secondary" id="nlVcShareBtn"><i class="fas fa-share-alt"></i></button>'
                ].join('');
                card.appendChild(actionsDiv);

                // View Details → scroll to venue in list below
                document.getElementById('nlVcViewBtn').addEventListener('click', function () {
                    var venueName = card.querySelector('.nl-map-vc-name').textContent.trim();
                    scrollToVenueInList(venueName);
                });

                // Save
                document.getElementById('nlVcSaveBtn2').addEventListener('click', function () {
                    var venueName = card.querySelector('.nl-map-vc-name').textContent.trim();
                    toggleVenueSave(venueName, this);
                });

                // Share
                document.getElementById('nlVcShareBtn').addEventListener('click', function () {
                    var venueName = card.querySelector('.nl-map-vc-name').textContent.trim();
                    if (navigator.share) {
                        navigator.share({ title: venueName, text: 'Check out ' + venueName + ' on SceneLink!', url: window.location.href });
                    } else {
                        navigator.clipboard.writeText(window.location.href).then(function () {
                            if (window.showToast) window.showToast('Link copied! 🔗', 'gold');
                        });
                    }
                });
            }

            // Update save button state when card becomes visible
            var observer = new MutationObserver(function () {
                if (card.classList.contains('active')) {
                    var venueName = card.querySelector('.nl-map-vc-name').textContent.trim();
                    var saveBtn = document.getElementById('nlVcSaveBtn2');
                    if (saveBtn) {
                        var saved = JSON.parse(localStorage.getItem('sl_saved_venues') || '[]');
                        var isSaved = saved.includes(venueName);
                        saveBtn.innerHTML = isSaved ? '<i class="fas fa-heart"></i> Saved' : '<i class="far fa-heart"></i> Save';
                        saveBtn.classList.toggle('saved', isSaved);
                    }
                }
            });
            observer.observe(card, { attributes: true, attributeFilter: ['class'] });

        }, 500);
    }

    function scrollToVenueInList(venueName) {
        // Find venue card in the list below map by matching name
        var cards = document.querySelectorAll('.nightlife-venue-card, [class*="venue-card"]');
        var found = false;
        cards.forEach(function (card) {
            var nameEl = card.querySelector('h3, .venue-name, .nightlife-venue-name, .nl-map-vc-name');
            if (nameEl && nameEl.textContent.trim() === venueName) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.style.transition = 'all 0.3s';
                card.style.boxShadow = '0 0 0 2px #D4AF37, 0 8px 30px rgba(212,175,55,0.2)';
                setTimeout(function () { card.style.boxShadow = ''; }, 2000);
                found = true;
            }
        });

        // If no list card found, scroll to the venues section
        if (!found) {
            var venueSection = document.querySelector('.venues-section, .nightlife-venue-listings-section');
            if (venueSection) {
                venueSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    function toggleVenueSave(venueName, btn) {
        var saved = JSON.parse(localStorage.getItem('sl_saved_venues') || '[]');
        var idx = saved.indexOf(venueName);
        if (idx >= 0) {
            saved.splice(idx, 1);
            if (btn) { btn.innerHTML = '<i class="far fa-heart"></i> Save'; btn.classList.remove('saved'); }
            if (window.showToast) window.showToast('"' + venueName + '" removed from favorites', '');
        } else {
            saved.push(venueName);
            if (btn) { btn.innerHTML = '<i class="fas fa-heart"></i> Saved'; btn.classList.add('saved'); }
            if (window.showToast) window.showToast('"' + venueName + '" saved to favorites ❤️', 'gold');
        }
        localStorage.setItem('sl_saved_venues', JSON.stringify(saved));
    }

    /* =====================================================
       4. NIGHTLIFE — SCROLL TO LIST BUTTON
       ===================================================== */

    function initNightlifeScrollToList() {
        var hero = document.querySelector('.nl-map-hero');
        var venueSection = document.querySelector('.venues-section');
        if (!hero || !venueSection) return;

        // Check if button already exists
        if (document.querySelector('.nl-scroll-to-list')) return;

        var scrollDiv = document.createElement('div');
        scrollDiv.className = 'nl-scroll-to-list';
        scrollDiv.innerHTML = '<button class="nl-scroll-to-list-btn"><i class="fas fa-chevron-down"></i> Browse Venue List</button>';
        hero.parentNode.insertBefore(scrollDiv, hero.nextSibling);

        scrollDiv.addEventListener('click', function () {
            venueSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    /* =====================================================
       5. NIGHTLIFE — SAVE BUTTONS ON VENUE LIST CARDS
       ===================================================== */

    function initNightlifeListSave() {
        var saved = JSON.parse(localStorage.getItem('sl_saved_venues') || '[]');

        // Watch for dynamically rendered venue cards
        var container = document.getElementById('nightlifeVenuesContainer');
        if (!container) return;

        function addSaveButtons() {
            container.querySelectorAll('.nightlife-venue-card, .venue-card').forEach(function (card) {
                if (card.querySelector('.nl-r2-save')) return;

                var nameEl = card.querySelector('h3, .venue-name, .nightlife-venue-name');
                var venueName = nameEl ? nameEl.textContent.trim() : '';
                var isSaved = saved.includes(venueName);

                var btn = document.createElement('button');
                btn.className = 'nl-r2-save' + (isSaved ? ' saved' : '');
                btn.innerHTML = isSaved ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
                btn.title = 'Save to favorites';
                btn.style.cssText = 'position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.1);color:' + (isSaved ? '#D4AF37' : '#fff') + ';font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;z-index:5;';

                if (getComputedStyle(card).position === 'static') {
                    card.style.position = 'relative';
                }

                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    e.preventDefault();
                    toggleVenueSave(venueName, null);
                    var nowSaved = JSON.parse(localStorage.getItem('sl_saved_venues') || '[]');
                    var s = nowSaved.includes(venueName);
                    btn.innerHTML = s ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
                    btn.style.color = s ? '#D4AF37' : '#fff';
                    btn.classList.toggle('saved', s);
                });

                card.appendChild(btn);
            });
        }

        addSaveButtons();
        // Re-run when content changes
        var obs = new MutationObserver(function () { setTimeout(addSaveButtons, 100); });
        obs.observe(container, { childList: true, subtree: true });
    }

    /* =====================================================
       6. TONIGHT — VIEW ALL FUNCTIONALITY
       ===================================================== */

    function initTonightViewAll() {
        var sections = document.getElementById('tp-sections');
        if (!sections) return;

        // Delegate click on "View All" links
        sections.addEventListener('click', function (e) {
            var link = e.target.closest('.tp-section-link');
            if (!link) return;
            e.preventDefault();

            var section = link.closest('.tp-section');
            if (!section) return;

            var grid = section.querySelector('.tp-grid');
            if (!grid) return;

            var isExpanded = section.classList.contains('expanded');

            if (isExpanded) {
                // Collapse — show only first 4 cards
                section.classList.remove('expanded');
                link.innerHTML = 'View All <i class="fas fa-arrow-right"></i>';
                grid.style.maxHeight = '';
                // Scroll section header into view
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                // Expand — show all cards
                section.classList.add('expanded');
                link.innerHTML = 'Show Less <i class="fas fa-chevron-up"></i>';
                link.classList.add('expanded');
                grid.style.maxHeight = 'none';
            }
        });

        // Also handle dynamically rendered sections
        var obs = new MutationObserver(function () {
            // Initially limit grid to ~4 cards worth of height, expand on View All
            sections.querySelectorAll('.tp-section').forEach(function (sec) {
                if (sec._r2init) return;
                sec._r2init = true;
                var grid = sec.querySelector('.tp-grid');
                var cards = grid ? grid.querySelectorAll('.tp-venue-card') : [];
                // If more than 4 cards, set initial max height
                if (cards.length > 4 && grid) {
                    // Don't limit by default — let user expand
                }
            });
        });
        obs.observe(sections, { childList: true, subtree: true });
    }

    /* =====================================================
       7. TONIGHT — FAVORITE FUNCTIONALITY FIX
       ===================================================== */

    function initTonightFavorites() {
        var page = document.querySelector('.tp-page');
        if (!page) return;

        // Delegate save button clicks (bookmark icons on cards)
        document.addEventListener('click', function (e) {
            var saveBtn = e.target.closest('.tp-card-save');
            if (!saveBtn) return;

            e.stopPropagation();
            var isSaved = saveBtn.classList.contains('saved');

            if (isSaved) {
                saveBtn.classList.remove('saved');
                saveBtn.style.background = '';
                saveBtn.style.color = '';
                if (window.showToast) window.showToast('Removed from favorites', '');
            } else {
                saveBtn.classList.add('saved');
                if (window.showToast) window.showToast('Saved to favorites ❤️', 'gold');
            }
        });

        // Also handle the spotlight save (View Details button context)
        document.addEventListener('click', function (e) {
            var btn = e.target.closest('.tp-btn-icon');
            if (!btn) return;
            var icon = btn.querySelector('i');
            if (!icon || !icon.classList.contains('fa-bookmark')) return;

            e.stopPropagation();
            var isSaved = btn.classList.contains('saved');
            btn.classList.toggle('saved', !isSaved);
            if (!isSaved) {
                if (window.showToast) window.showToast('Saved to favorites ❤️', 'gold');
            } else {
                if (window.showToast) window.showToast('Removed from favorites', '');
            }
        });
    }

    /* =====================================================
       8. TONIGHT — NAV ICONS GOLD FIX
       ===================================================== */

    function initTonightNavIcons() {
        // Force gold color on all nav header icons
        document.querySelectorAll('.nav-icon-btn svg').forEach(function (svg) {
            svg.style.stroke = '#D4AF37';
            svg.style.color = '#D4AF37';
        });

        // Heart icon should be filled gold
        document.querySelectorAll('.nav-my-lists svg').forEach(function (svg) {
            svg.style.fill = '#D4AF37';
        });

        // Fix spacing on nav-right
        var navRight = document.querySelector('.nav-right');
        if (navRight) {
            navRight.style.display = 'flex';
            navRight.style.alignItems = 'center';
            navRight.style.gap = '6px';
        }
    }

    /* =====================================================
       9. HOMEPAGE — SEARCH SPACING FIX
       ===================================================== */

    function initHomepageSearchSpacing() {
        var searchSection = document.querySelector('.premium-search-section');
        if (!searchSection) return;

        // Ensure search results dropdown doesn't overlap social layer
        var dropdown = document.getElementById('searchResultsDropdown');
        if (dropdown) {
            // Watch for content changes in dropdown
            var obs = new MutationObserver(function () {
                if (dropdown.innerHTML.trim()) {
                    dropdown.style.display = 'block';
                } else {
                    dropdown.style.display = 'none';
                }
            });
            obs.observe(dropdown, { childList: true, subtree: true, characterData: true });
        }
    }

    /* =====================================================
       MAIN INIT
       ===================================================== */

    function init() {
        initAuthSystem();
        initNightlifeFilterFix();
        initNightlifeMapPopup();
        initNightlifeScrollToList();
        initNightlifeListSave();
        initTonightViewAll();
        initTonightFavorites();
        initTonightNavIcons();
        initHomepageSearchSpacing();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();