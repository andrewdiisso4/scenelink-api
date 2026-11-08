/**
 * SceneLink — Production Polish Pass
 * Unified Auth, Map Sync, Save Feature, Trending Badges, Global UX
 */
(function () {
    'use strict';

    /* =====================================================
       1. UNIFIED AUTH SYSTEM
       Wire every auth button to the single sl-auth-modal
       ===================================================== */

    function initUnifiedAuth() {
        // List of all button IDs that should open the auth modal
        var authTriggers = [
            'headerSignupBtn', 'openSignupModal', 'heroJoinBtn',
            'ctaSignupBtn', 'slExploreSignupBtn'
        ];

        // Wire buttons
        authTriggers.forEach(function (id) {
            var btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    openUnifiedAuth();
                });
            }
        });

        // Also wire any .btn-header-primary that isn't already wired
        document.querySelectorAll('.btn-header-primary').forEach(function (btn) {
            if (!btn._authWired) {
                btn._authWired = true;
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    openUnifiedAuth();
                });
            }
        });

        // Hide old duplicate modals permanently
        ['signupModal', 'loginModal'].forEach(function (id) {
            var m = document.getElementById(id);
            if (m) {
                m.style.display = 'none';
                m.style.visibility = 'hidden';
                m.style.pointerEvents = 'none';
            }
        });

        // Reflect login state from localStorage (simple demo state)
        reflectAuthState();
    }

    function openUnifiedAuth() {
        // Try the proper auth.js modal first
        var modal = document.getElementById('sl-auth-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            return;
        }

        // Fallback: create inline modal
        createFallbackModal();
    }

    function createFallbackModal() {
        if (document.getElementById('sl-auth-modal')) {
            document.getElementById('sl-auth-modal').style.display = 'flex';
            return;
        }

        var modal = document.createElement('div');
        modal.id = 'sl-auth-modal';
        modal.innerHTML = [
            '<div class="sl-card">',
            '  <div class="sl-title">',
            '    <h3>Sign in to SceneLink</h3>',
            '    <button class="sl-close" id="sl-auth-close">&#215;</button>',
            '  </div>',
            '  <div id="sl-auth-error" style="display:none;background:#3a1c1c;border:1px solid #5d2a2a;color:#ffd4d4;padding:10px;border-radius:12px;margin-bottom:10px;font-size:13px;"></div>',
            '  <form id="sl-auth-form" style="display:grid;gap:14px;">',
            '    <input id="sl-email" type="email" placeholder="Email address" required>',
            '    <input id="sl-password" type="password" placeholder="Password" required minlength="6">',
            '    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,0.6)">',
            '      <input id="sl-21" type="checkbox" required style="width:16px;height:16px;"> I am 21+ years old',
            '    </label>',
            '    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,0.5)">',
            '      <input id="sl-tos" type="checkbox" required style="width:16px;height:16px;"> I agree to the Terms & Privacy Policy',
            '    </label>',
            '    <button id="sl-login" type="button" class="sl-primary">Log In</button>',
            '    <button id="sl-signup" type="button" class="sl-ghost">Create Account</button>',
            '    <a href="#" class="sl-link" style="text-align:center;font-size:12px;color:rgba(212,175,55,0.7);" id="sl-forgot">Forgot password?</a>',
            '  </form>',
            '</div>'
        ].join('');

        modal.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:99999;';
        document.body.appendChild(modal);

        // Close handlers
        document.getElementById('sl-auth-close').addEventListener('click', function () {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        });

        // Login handler (demo)
        document.getElementById('sl-login').addEventListener('click', function () {
            var email = (document.getElementById('sl-email').value || '').trim();
            if (!email) { showAuthError('Please enter your email.'); return; }
            // Demo login — store in localStorage
            localStorage.setItem('sl_user', JSON.stringify({ email: email, name: email.split('@')[0] }));
            modal.style.display = 'none';
            document.body.style.overflow = '';
            reflectAuthState();
        });

        // Signup handler (demo)
        document.getElementById('sl-signup').addEventListener('click', function () {
            var email = (document.getElementById('sl-email').value || '').trim();
            var checked21 = document.getElementById('sl-21').checked;
            var checkedTos = document.getElementById('sl-tos').checked;
            if (!email) { showAuthError('Please enter your email.'); return; }
            if (!checked21) { showAuthError('You must confirm you are 21+.'); return; }
            if (!checkedTos) { showAuthError('Please accept the Terms & Privacy Policy.'); return; }
            localStorage.setItem('sl_user', JSON.stringify({ email: email, name: email.split('@')[0] }));
            modal.style.display = 'none';
            document.body.style.overflow = '';
            reflectAuthState();
        });

        // Forgot password
        document.getElementById('sl-forgot').addEventListener('click', function (e) {
            e.preventDefault();
            showAuthError('Check your email for a reset link.');
        });
    }

    function showAuthError(msg) {
        var el = document.getElementById('sl-auth-error');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
    }

    function reflectAuthState() {
        try {
            var user = JSON.parse(localStorage.getItem('sl_user') || 'null');
            if (!user) return;

            var name = user.name || user.email;
            var initials = name.split(/\s+/).map(function (p) { return p.charAt(0); }).slice(0, 2).join('').toUpperCase();

            // Replace "Sign Up" button in header with avatar chip
            document.querySelectorAll('.btn-header-primary, #headerSignupBtn, #openSignupModal').forEach(function (btn) {
                if (!btn || btn._replaced) return;
                btn._replaced = true;
                var chip = document.createElement('div');
                chip.className = 'sl-usermenu';
                chip.style.cssText = 'position:relative;display:inline-block;margin-left:6px;';
                chip.innerHTML = [
                    '<button class="sl-userchip" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.25);padding:6px 12px;border-radius:50px;color:#fff;font-size:13px;font-weight:600;">',
                    '  <span style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#D4AF37,#b8962e);color:#0a0a0a;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;">' + initials + '</span>',
                    '  <span class="sl-caret" style="opacity:0.6;font-size:10px;">&#9660;</span>',
                    '</button>',
                    '<div class="sl-dropdown" style="display:none;position:absolute;right:0;top:calc(100% + 8px);background:rgba(8,8,14,0.97);border:1px solid rgba(212,175,55,0.15);border-radius:14px;min-width:180px;box-shadow:0 12px 40px rgba(0,0,0,0.5);overflow:hidden;z-index:9999;">',
                    '  <a href="profile.html" style="display:block;padding:11px 14px;color:rgba(255,255,255,0.85);font-size:13px;text-decoration:none;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(212,175,55,0.08)\'" onmouseout="this.style.background=\'\'">&#128100; Profile</a>',
                    '  <a href="my-lists.html" style="display:block;padding:11px 14px;color:rgba(255,255,255,0.85);font-size:13px;text-decoration:none;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(212,175,55,0.08)\'" onmouseout="this.style.background=\'\'">&#9829; My Lists</a>',
                    '  <button id="sl-logout-btn" style="display:block;width:100%;text-align:left;padding:11px 14px;background:none;border:none;border-top:1px solid rgba(255,255,255,0.05);color:rgba(255,100,100,0.85);font-size:13px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(239,68,68,0.08)\'" onmouseout="this.style.background=\'\'">&#x2192; Log Out</button>',
                    '</div>'
                ].join('');

                btn.parentNode.replaceChild(chip, btn);

                // Toggle dropdown
                var chipBtn = chip.querySelector('.sl-userchip');
                var dd = chip.querySelector('.sl-dropdown');
                chipBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    dd.style.display = (dd.style.display === 'block') ? 'none' : 'block';
                });
                document.addEventListener('click', function () { dd.style.display = 'none'; });

                // Logout
                var logoutBtn = chip.querySelector('#sl-logout-btn');
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', function () {
                        localStorage.removeItem('sl_user');
                        location.reload();
                    });
                }
            });
        } catch (e) { /* ignore */ }
    }

    /* =====================================================
       2. HOMEPAGE SEARCH BAR CLEANUP
       Inject Boston, MA location hint
       ===================================================== */

    function initHomepageSearch() {
        var searchSection = document.querySelector('.premium-search-section');
        if (!searchSection) return;

        // Inject location hint below search card if not present
        var wrapper = searchSection.querySelector('.premium-search-wrapper');
        if (wrapper && !wrapper.querySelector('.search-location-hint')) {
            var hint = document.createElement('div');
            hint.className = 'search-location-hint';
            hint.innerHTML = '<i class="fas fa-map-marker-alt"></i><span>Boston, MA</span>';
            // Find a good insertion point
            var card = wrapper.querySelector('.premium-search-card');
            if (card && card.nextSibling) {
                wrapper.insertBefore(hint, card.nextSibling);
            } else if (card) {
                wrapper.appendChild(hint);
            }
        }
    }

    /* =====================================================
       3. EXPLORE — CATEGORY FILTER SYNC (MAP + LIST)
       Ensure clicking Restaurants/Bars filters both
       ===================================================== */

    function initExploreFilterSync() {
        // This runs on the explore page only
        var chips = document.querySelectorAll('.sl-chip-btn[data-cat]');
        if (!chips.length) return;

        chips.forEach(function (chip) {
            chip.addEventListener('click', function () {
                chips.forEach(function (c) { c.classList.remove('active'); });
                chip.classList.add('active');

                // Show/hide cuisine row
                var cuisineBar = document.getElementById('slCuisineFilters');
                if (cuisineBar) {
                    if (chip.dataset.cat === 'restaurant') {
                        cuisineBar.classList.add('visible');
                    } else {
                        cuisineBar.classList.remove('visible');
                    }
                }
            });
        });

        // Cuisine chip hover/active
        document.querySelectorAll('.sl-cuisine-chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
                document.querySelectorAll('.sl-cuisine-chip').forEach(function (c) { c.classList.remove('active'); });
                chip.classList.add('active');
            });
        });
    }

    /* =====================================================
       4. EXPLORE — HEADER NAV INJECTION
       Replace small logo+back with full nav
       ===================================================== */

    function initExploreHeader() {
        var header = document.querySelector('.sl-explore-header');
        if (!header || header._upgraded) return;
        header._upgraded = true;

        // Keep back button and logo, inject nav links and right side
        var spacer = header.querySelector('.sl-explore-header-spacer');
        if (!spacer) return;

        // Inject nav links after logo
        var navLinks = document.createElement('nav');
        navLinks.className = 'sl-explore-nav-links';
        navLinks.innerHTML = [
            '<a href="index.html" class="sl-explore-nav-link">Home</a>',
            '<a href="explore.html" class="sl-explore-nav-link active">Explore</a>',
            '<a href="social-feed.html" class="sl-explore-nav-link">Social</a>',
            '<a href="events.html" class="sl-explore-nav-link">Events</a>',
            '<a href="nightlife.html" class="sl-explore-nav-link">Nightlife</a>',
            '<a href="tonight.html" class="sl-explore-nav-link">Tonight\'s Picks</a>'
        ].join('');

        // Insert after logo
        var logo = header.querySelector('.sl-explore-logo');
        if (logo && logo.nextSibling) {
            header.insertBefore(navLinks, logo.nextSibling);
        } else {
            header.insertBefore(navLinks, spacer);
        }

        // Inject right-side icons
        var rightGroup = document.createElement('div');
        rightGroup.className = 'sl-explore-header-right';
        rightGroup.innerHTML = [
            '<a href="my-lists.html" class="sl-explore-header-icon" title="My Lists"><i class="fas fa-heart"></i></a>',
            '<a href="profile.html" class="sl-explore-header-icon" title="Profile"><i class="fas fa-user"></i></a>',
            '<button class="sl-explore-signup-btn" id="slExploreSignupBtn">Sign Up</button>'
        ].join('');
        header.appendChild(rightGroup);

        // Remove the old spacer if still there
        var oldSpacer = header.querySelector('.sl-explore-header-spacer');
        if (oldSpacer) oldSpacer.style.flex = '1';

        // Wire signup button
        var signupBtn = document.getElementById('slExploreSignupBtn');
        if (signupBtn) {
            signupBtn.addEventListener('click', function (e) {
                e.preventDefault();
                openUnifiedAuth();
            });
        }
    }

    /* =====================================================
       5. NIGHTLIFE — SAVE TO LIST FEATURE
       ===================================================== */

    function initNightlifeSave() {
        // Add save button to the venue preview card if not present
        var vcInfo = document.querySelector('.nl-map-vc-info');
        if (vcInfo && !document.querySelector('.nl-vc-save-btn')) {
            var saveBtn = document.createElement('button');
            saveBtn.className = 'nl-vc-save-btn';
            saveBtn.id = 'nlVcSaveBtn';
            saveBtn.innerHTML = '<i class="far fa-heart"></i> Save';
            saveBtn.title = 'Save to My Lists';

            var card = document.querySelector('.nl-map-venue-card');
            if (card) card.appendChild(saveBtn);

            saveBtn.addEventListener('click', function () {
                var venueName = document.querySelector('.nl-map-vc-name');
                var name = venueName ? venueName.textContent : 'Venue';
                toggleNightlifeSave(saveBtn, name);
            });
        }
    }

    // Track saved nightlife venues
    window._nlSavedVenues = window._nlSavedVenues || {};

    function toggleNightlifeSave(btn, venueName) {
        var key = venueName.trim();
        if (window._nlSavedVenues[key]) {
            delete window._nlSavedVenues[key];
            btn.innerHTML = '<i class="far fa-heart"></i> Save';
            btn.classList.remove('saved');
            showToast('"' + key + '" removed from lists');
        } else {
            window._nlSavedVenues[key] = true;
            btn.innerHTML = '<i class="fas fa-heart"></i> Saved';
            btn.classList.add('saved');
            showToast('"' + key + '" saved to My Lists ✓', 'gold');

            // Also persist to localStorage for cross-page access
            try {
                var saved = JSON.parse(localStorage.getItem('sl_saved_venues') || '[]');
                if (!saved.includes(key)) {
                    saved.push(key);
                    localStorage.setItem('sl_saved_venues', JSON.stringify(saved));
                }
            } catch (e) { /* ignore */ }
        }
    }

    /* =====================================================
       6. NIGHTLIFE — TRENDING TONIGHT BADGE
       Add "Trending Tonight" badge to hot venue cards
       ===================================================== */

    function initTrendingBadges() {
        // Inject on nightlife venue listing cards
        document.querySelectorAll('.nightlife-venue-card, .venue-card, [data-trending="true"]').forEach(function (card) {
            if (card.querySelector('.nl-trending-badge')) return; // already added
            if (card.dataset.trending === 'true' || card.classList.contains('trending')) {
                var badge = document.createElement('div');
                badge.className = 'venue-card-trending';
                badge.innerHTML = '<span class="nl-trending-badge">Trending Tonight</span>';
                if (getComputedStyle(card).position === 'static') {
                    card.style.position = 'relative';
                }
                card.appendChild(badge);
            }
        });
    }

    /* =====================================================
       7. TONIGHT PAGE — SPOTLIGHT IMAGE FIX
       ===================================================== */

    function fixTonightSpotlight() {
        var spotlight = document.getElementById('tp-spotlight');
        if (!spotlight) return;

        // Watch for spotlight content being rendered (it's dynamically injected)
        var observer = new MutationObserver(function () {
            var imgs = spotlight.querySelectorAll('img');
            imgs.forEach(function (img) {
                if (!img.src || img.src === window.location.href) {
                    img.src = '/assets/img/placeholder-venue.svg';
                }
                img.addEventListener('error', function () {
                    this.src = '/assets/img/placeholder-venue.svg';
                    this.style.objectFit = 'cover';
                });
            });

            // Also fix card images
            var cardImgs = document.querySelectorAll('.tp-card-img, .tp-featured-img, .tp-spotlight-bg');
            cardImgs.forEach(function (img) {
                if (img.tagName === 'IMG') {
                    img.addEventListener('error', function () {
                        this.src = '/assets/img/placeholder-venue.svg';
                    });
                }
            });
        });

        observer.observe(spotlight, { childList: true, subtree: true });

        // Also fix any images that already exist
        document.querySelectorAll('.tp-card img, .tp-featured img').forEach(function (img) {
            img.addEventListener('error', function () {
                this.src = '/assets/img/placeholder-venue.svg';
            });
        });
    }

    /* =====================================================
       8. GLOBAL — TOAST NOTIFICATION
       ===================================================== */

    function showToast(msg, style) {
        var existing = document.getElementById('sl-toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.id = 'sl-toast';
        toast.textContent = msg;

        var bg = style === 'gold'
            ? 'linear-gradient(135deg,rgba(212,175,55,0.18),rgba(212,175,55,0.08))'
            : 'rgba(20,20,28,0.96)';
        var border = style === 'gold'
            ? '1px solid rgba(212,175,55,0.3)'
            : '1px solid rgba(255,255,255,0.08)';

        toast.style.cssText = [
            'position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(20px);',
            'background:' + bg + ';',
            'border:' + border + ';',
            'color:#fff;padding:12px 24px;border-radius:50px;font-size:13px;font-weight:600;',
            'z-index:99998;backdrop-filter:blur(24px);',
            'box-shadow:0 8px 30px rgba(0,0,0,0.4);',
            'transition:all 0.35s cubic-bezier(0.34,1.3,0.64,1);',
            'white-space:nowrap;pointer-events:none;'
        ].join('');

        document.body.appendChild(toast);
        setTimeout(function () { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; }, 20);
        setTimeout(function () {
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            toast.style.opacity = '0';
            setTimeout(function () { if (toast.parentNode) toast.remove(); }, 400);
        }, 2800);
    }

    window.showToast = showToast;

    /* =====================================================
       9. EXPLORE — MAP/LIST SYNC ENHANCEMENT
       Click card → highlight pin | Click pin → scroll card
       ===================================================== */

    function initExploreMapSync() {
        // Delegate card clicks to scroll + highlight marker
        document.addEventListener('click', function (e) {
            var card = e.target.closest('.sl-list-card');
            if (!card) return;
            var id = parseInt(card.dataset.id);
            if (!id) return;

            // Highlight marker bounce
            var pin = document.querySelector('.sl-pin[data-id="' + id + '"]');
            if (pin) {
                document.querySelectorAll('.sl-pin').forEach(function (p) { p.classList.remove('active', 'bounce'); });
                pin.classList.add('active', 'bounce');
                setTimeout(function () { pin.classList.remove('bounce'); }, 600);
            }
        });

        // Hover card → subtle marker lift
        document.addEventListener('mouseover', function (e) {
            var card = e.target.closest('.sl-list-card');
            if (!card) return;
            var id = parseInt(card.dataset.id);
            if (!id) return;
            var pin = document.querySelector('.sl-pin[data-id="' + id + '"]');
            if (pin) pin.style.zIndex = '9999';
        });
        document.addEventListener('mouseout', function (e) {
            var card = e.target.closest('.sl-list-card');
            if (!card) return;
            document.querySelectorAll('.sl-pin').forEach(function (p) { p.style.zIndex = ''; });
        });
    }

    /* =====================================================
       10. HERO PHONE MOCKUP — ANIMATION ENHANCEMENT
       ===================================================== */

    function initHeroAnimations() {
        // Subtle parallax on hero
        var hero = document.querySelector('.hero-v2');
        if (!hero) return;

        var ticking = false;
        window.addEventListener('scroll', function () {
            if (!ticking) {
                requestAnimationFrame(function () {
                    var scrollY = window.pageYOffset;
                    var heroBg = hero.querySelector(':before') || hero;
                    // Move the pseudo-element via a CSS custom property
                    hero.style.setProperty('--hero-scroll', scrollY * 0.3 + 'px');
                    ticking = false;
                });
                ticking = true;
            }
        });

        // Add parallax support via CSS
        if (!document.getElementById('hero-parallax-style')) {
            var style = document.createElement('style');
            style.id = 'hero-parallax-style';
            style.textContent = [
                '.hero-v2::before {',
                '  transform: scale(1.08) translateY(var(--hero-scroll, 0)) !important;',
                '}'
            ].join('\n');
            document.head.appendChild(style);
        }
    }

    /* =====================================================
       11. NIGHTLIFE — VENUE LISTING SAVE BUTTONS
       Add save button to each venue card in the list below map
       ===================================================== */

    function initNightlifeVenueListSave() {
        var savedVenues = JSON.parse(localStorage.getItem('sl_saved_venues') || '[]');

        // Add save buttons to nightlife venue cards
        document.querySelectorAll('.nightlife-venue-card').forEach(function (card) {
            if (card.querySelector('.nl-list-save-btn')) return;

            var name = card.querySelector('h3, .venue-name, .nightlife-venue-name');
            var venueName = name ? name.textContent.trim() : '';

            var saveBtn = document.createElement('button');
            saveBtn.className = 'nl-list-save-btn';
            var isSaved = savedVenues.includes(venueName);

            saveBtn.innerHTML = isSaved
                ? '<i class="fas fa-heart"></i> Saved'
                : '<i class="far fa-heart"></i> Save';

            saveBtn.style.cssText = [
                'background:' + (isSaved ? 'rgba(212,175,55,0.2)' : 'rgba(212,175,55,0.08)') + ';',
                'border:1px solid rgba(212,175,55,' + (isSaved ? '0.35' : '0.2') + ');',
                'color:#D4AF37;border-radius:10px;padding:7px 14px;font-size:12px;',
                'font-weight:600;cursor:pointer;display:inline-flex;align-items:center;',
                'gap:5px;transition:all 0.2s;margin-top:8px;'
            ].join('');

            if (isSaved) saveBtn.classList.add('saved');

            saveBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var saved2 = JSON.parse(localStorage.getItem('sl_saved_venues') || '[]');
                var idx = saved2.indexOf(venueName);
                if (idx >= 0) {
                    saved2.splice(idx, 1);
                    saveBtn.innerHTML = '<i class="far fa-heart"></i> Save';
                    saveBtn.style.background = 'rgba(212,175,55,0.08)';
                    saveBtn.classList.remove('saved');
                    showToast('"' + venueName + '" removed', '');
                } else {
                    saved2.push(venueName);
                    saveBtn.innerHTML = '<i class="fas fa-heart"></i> Saved';
                    saveBtn.style.background = 'rgba(212,175,55,0.2)';
                    saveBtn.classList.add('saved');
                    showToast('"' + venueName + '" saved to My Lists ✓', 'gold');
                }
                localStorage.setItem('sl_saved_venues', JSON.stringify(saved2));
            });

            // Find actions area or append to card
            var actions = card.querySelector('.venue-actions, .nightlife-venue-actions, .venue-action-buttons');
            if (actions) {
                actions.appendChild(saveBtn);
            } else {
                card.appendChild(saveBtn);
            }
        });
    }

    /* =====================================================
       12. GLOBAL — IMAGE ERROR FALLBACK
       ===================================================== */

    function initImageFallbacks() {
        document.querySelectorAll('img[src]').forEach(function (img) {
            if (img._fallbackWired) return;
            img._fallbackWired = true;
            img.addEventListener('error', function () {
                if (!this.src.includes('unsplash')) {
                    this.src = '/assets/img/placeholder-venue.svg';
                }
            });
        });
    }

    /* =====================================================
       13. TONIGHT — SECTION CARD IMAGE FALLBACK
       Watch for dynamically rendered venue sections
       ===================================================== */

    function initTonightImageFallbacks() {
        var sections = document.getElementById('tp-sections');
        if (!sections) return;

        var obs = new MutationObserver(function () {
            sections.querySelectorAll('img').forEach(function (img) {
                if (img._fallbackWired) return;
                img._fallbackWired = true;
                // Ensure src is set
                if (!img.src || img.src === window.location.href || img.src.endsWith('/')) {
                    img.src = '/assets/img/placeholder-venue.svg';
                }
                img.addEventListener('error', function () {
                    var fallbacks = [
                        '/assets/img/placeholder-venue.svg',
                        '/assets/img/placeholder-venue.svg',
                        '/assets/img/placeholder-venue.svg'
                    ];
                    var idx = Math.floor(Math.random() * fallbacks.length);
                    this.src = fallbacks[idx];
                });
            });
        });
        obs.observe(sections, { childList: true, subtree: true });
    }

    /* =====================================================
       MAIN INIT
       ===================================================== */

    function init() {
        initUnifiedAuth();
        initHomepageSearch();
        initExploreFilterSync();
        initExploreHeader();
        initNightlifeSave();
        initTrendingBadges();
        fixTonightSpotlight();
        initHeroAnimations();
        initNightlifeVenueListSave();
        initImageFallbacks();
        initTonightImageFallbacks();
        initExploreMapSync();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();