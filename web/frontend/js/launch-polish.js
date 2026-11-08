/**
 * SceneLink Launch Polish — Final QA Fixes
 * - Enhanced AI Concierge venue cards with images, vibe, save, detail view
 * - Auth button fixes for all entry points
 * - Hero "Join the Scene" button fix
 */
(function() {
    'use strict';

    // ============================================================
    // VENUE IMAGES MAP (Unsplash-based, relevant to venue types)
    // ============================================================
    var venueImages = {
        'Italian': '/assets/img/placeholder-venue.svg',
        'Seafood': '/assets/img/placeholder-venue.svg',
        'Japanese': '/assets/img/placeholder-venue.svg',
        'Spanish': '/assets/img/placeholder-venue.svg',
        'Mediterranean': '/assets/img/placeholder-venue.svg',
        'American': '/assets/img/placeholder-venue.svg',
        'Asian Fusion': '/assets/img/placeholder-venue.svg',
        'Cocktail Bar': '/assets/img/placeholder-venue.svg',
        'Cocktail Lounge': '/assets/img/placeholder-venue.svg',
        'Rooftop Bar': '/assets/img/placeholder-venue.svg',
        'Live Music': '/assets/img/placeholder-event.svg',
        'Nightclub': '/assets/img/placeholder-venue.svg',
        'Beer Garden': '/assets/img/placeholder-venue.svg',
        'default': '/assets/img/placeholder-venue.svg'
    };

    function getVenueImage(venue) {
        return venueImages[venue.type] || venueImages[venue.cuisine] || venueImages['default'];
    }

    // ============================================================
    // OVERRIDE CONCIERGE buildVenueCard
    // ============================================================
    function patchConcierge() {
        // Wait for the concierge to be built
        var panel = document.querySelector('.sl-concierge-panel');
        if (!panel) return;

        // Override the message rendering to enhance venue cards after they're added
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        // Find old-style venue cards and enhance them
                        var cards = node.querySelectorAll ? node.querySelectorAll('.sl-venue-card') : [];
                        cards.forEach(function(card) {
                            if (card.dataset.enhanced) return;
                            card.dataset.enhanced = 'true';
                            enhanceVenueCard(card);
                        });
                    }
                });
            });
        });

        var messages = panel.querySelector('.sl-concierge-messages');
        if (messages) {
            observer.observe(messages, { childList: true, subtree: true });
        }

        // Also enhance any existing cards
        panel.querySelectorAll('.sl-venue-card').forEach(function(card) {
            if (!card.dataset.enhanced) {
                card.dataset.enhanced = 'true';
                enhanceVenueCard(card);
            }
        });
    }

    function enhanceVenueCard(card) {
        // Extract venue data from the card
        var nameEl = card.querySelector('.sl-venue-name');
        var metaEl = card.querySelector('.sl-venue-meta');
        var descEl = card.querySelector('.sl-venue-desc');
        var ratingEl = card.querySelector('.sl-venue-rating');
        var tagsEl = card.querySelector('.sl-venue-tags');

        if (!nameEl) return;

        var venueName = nameEl.textContent.trim();
        var metaText = metaEl ? metaEl.textContent.trim() : '';
        var descText = descEl ? descEl.textContent.trim() : '';
        var ratingText = ratingEl ? ratingEl.textContent.trim() : '';

        // Parse type from meta
        var metaParts = metaText.split('|').map(function(s) { return s.trim(); });
        var venueType = metaParts[0] || '';
        var venuePrice = metaParts[1] || '';
        var venueHood = metaParts[2] || '';

        // Get image
        var imgUrl = getVenueImage({ type: venueType, cuisine: venueType });

        // Determine vibe from description keywords
        var vibe = 'trendy';
        var descLow = descText.toLowerCase();
        if (descLow.indexOf('romantic') >= 0 || descLow.indexOf('intimate') >= 0) vibe = 'romantic';
        else if (descLow.indexOf('lively') >= 0 || descLow.indexOf('vibrant') >= 0 || descLow.indexOf('energetic') >= 0) vibe = 'lively';
        else if (descLow.indexOf('upscale') >= 0 || descLow.indexOf('elegant') >= 0 || descLow.indexOf('sophisticated') >= 0) vibe = 'upscale';
        else if (descLow.indexOf('casual') >= 0 || descLow.indexOf('fun') >= 0) vibe = 'casual';

        // Build enhanced card HTML
        var tags = [];
        if (tagsEl) {
            tagsEl.querySelectorAll('.sl-venue-tag').forEach(function(t) { tags.push(t.textContent.trim()); });
        }

        // Store venue data for detail view
        var venueData = {
            name: venueName,
            type: venueType,
            price: venuePrice,
            neighborhood: venueHood,
            desc: descText,
            rating: ratingText.replace('★', '').trim(),
            vibe: vibe,
            tags: tags,
            img: imgUrl
        };

        // Parse address and hours from second meta row
        var allMetas = card.querySelectorAll('.sl-venue-meta');
        if (allMetas.length > 1) {
            var secondMeta = allMetas[1].textContent.trim();
            var secParts = secondMeta.split('|').map(function(s) { return s.trim(); });
            venueData.address = secParts[0] || '';
            venueData.hours = secParts[1] || '';
        }

        // Replace card content with enhanced version
        card.className = 'concierge-venue-card';
        card.innerHTML =
            '<img class="concierge-venue-img" src="' + imgUrl + '" alt="' + venueName + '" onerror="this.style.display=\'none\'">' +
            '<div class="concierge-venue-body">' +
                '<div class="concierge-venue-name">' + venueName + '</div>' +
                '<div class="concierge-venue-meta">' +
                    '<span>' + venueType + '</span>' +
                    (venueHood ? '<span>📍 ' + venueHood + '</span>' : '') +
                    (ratingText ? '<span>★ ' + venueData.rating + '</span>' : '') +
                    (venuePrice ? '<span>' + venuePrice + '</span>' : '') +
                '</div>' +
                '<span class="concierge-venue-vibe">' + vibe + '</span>' +
                '<div class="concierge-venue-actions">' +
                    '<button class="concierge-btn-detail">View Details</button>' +
                    '<button class="concierge-btn-save">♡ Save</button>' +
                '</div>' +
            '</div>';

        // Wire up View Details
        card.querySelector('.concierge-btn-detail').addEventListener('click', function(e) {
            e.stopPropagation();
            openVenueDetail(venueData);
        });

        // Wire up Save
        card.querySelector('.concierge-btn-save').addEventListener('click', function(e) {
            e.stopPropagation();
            var btn = e.currentTarget;
            if (btn.classList.contains('saved')) {
                btn.classList.remove('saved');
                btn.textContent = '♡ Save';
            } else {
                btn.classList.add('saved');
                btn.textContent = '♥ Saved';
                showMiniToast('Saved to My Lists');
            }
        });
    }

    // ============================================================
    // VENUE DETAIL OVERLAY
    // ============================================================
    function openVenueDetail(v) {
        // Remove existing
        var existing = document.getElementById('conciergeDetailOverlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'conciergeDetailOverlay';
        overlay.className = 'concierge-detail-overlay';

        var tagsHTML = '';
        if (v.tags && v.tags.length) {
            tagsHTML = '<div class="concierge-detail-tags">' +
                v.tags.map(function(t) { return '<span class="concierge-detail-tag">' + t + '</span>'; }).join('') +
            '</div>';
        }

        overlay.innerHTML =
            '<div class="concierge-detail-card" style="position:relative;">' +
                '<button class="concierge-detail-close" id="concDetailClose">&times;</button>' +
                '<img class="concierge-detail-img" src="' + (v.img || venueImages['default']) + '" alt="' + v.name + '" onerror="this.style.height=\'60px\'">' +
                '<div class="concierge-detail-body">' +
                    '<div class="concierge-detail-name">' + v.name + '</div>' +
                    '<div class="concierge-detail-type">' + (v.type || '') + (v.price ? ' · ' + v.price : '') + '</div>' +
                    '<div class="concierge-detail-row"><i class="fas fa-map-marker-alt"></i> ' + (v.address || v.neighborhood || 'Boston') + '</div>' +
                    (v.hours ? '<div class="concierge-detail-row"><i class="fas fa-clock"></i> ' + v.hours + '</div>' : '') +
                    (v.rating ? '<div class="concierge-detail-row"><i class="fas fa-star"></i> ' + v.rating + ' rating</div>' : '') +
                    '<div class="concierge-detail-row"><i class="fas fa-heart"></i> <span class="concierge-venue-vibe" style="margin-left:4px">' + (v.vibe || 'trendy') + '</span></div>' +
                    (v.desc ? '<div class="concierge-detail-desc">' + v.desc + '</div>' : '') +
                    tagsHTML +
                    '<div class="concierge-detail-actions">' +
                        '<button class="concierge-btn-detail" onclick="if(typeof openVenueDetail!==\'undefined\'){return;}window.location.href=\'explore.html\'">Explore More</button>' +
                        '<button class="concierge-btn-save" id="concDetailSave">♡ Save</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        // Close button
        document.getElementById('concDetailClose').addEventListener('click', function() {
            overlay.remove();
        });

        // Click outside to close
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) overlay.remove();
        });

        // ESC to close
        var escHandler = function(e) {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Save button
        document.getElementById('concDetailSave').addEventListener('click', function() {
            var btn = this;
            if (btn.classList.contains('saved')) {
                btn.classList.remove('saved');
                btn.textContent = '♡ Save';
            } else {
                btn.classList.add('saved');
                btn.textContent = '♥ Saved';
                showMiniToast('Saved ' + v.name + ' to My Lists');
            }
        });
    }

    // ============================================================
    // MINI TOAST
    // ============================================================
    function showMiniToast(msg) {
        var toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid rgba(198,169,107,0.4);color:#C6A96B;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:300000;box-shadow:0 4px 16px rgba(0,0,0,0.5);animation:fadeIn 0.2s ease';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(function() {
            toast.style.transition = 'opacity 0.3s';
            toast.style.opacity = '0';
            setTimeout(function() { toast.remove(); }, 300);
        }, 2000);
    }

    // ============================================================
    // AUTH BUTTON FIXES — Ensure ALL entry points work
    // ============================================================
    function fixAuthButtons() {
        // Fix hero "Join the Scene" button
        var heroJoinBtn = document.getElementById('heroJoinBtn');
        if (heroJoinBtn && !heroJoinBtn._launchFixed) {
            heroJoinBtn._launchFixed = true;
            heroJoinBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal('signup');
                }
            });
        }

        // Fix the old v2 signup modal buttons — redirect to universal auth
        var showLogin = document.getElementById('showLoginModal');
        if (showLogin && !showLogin._launchFixed) {
            showLogin._launchFixed = true;
            showLogin.addEventListener('click', function(e) {
                e.preventDefault();
                // Close old modal if open
                var old = document.getElementById('signupModal');
                if (old) old.classList.remove('active');
                document.body.style.overflow = '';
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal('login');
                }
            });
        }

        var showSignup = document.getElementById('showSignupModal');
        if (showSignup && !showSignup._launchFixed) {
            showSignup._launchFixed = true;
            showSignup.addEventListener('click', function(e) {
                e.preventDefault();
                var old = document.getElementById('loginModal');
                if (old) old.classList.remove('active');
                document.body.style.overflow = '';
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal('signup');
                }
            });
        }

        // Fix old v2 signup form — redirect to universal auth
        var signupForm = document.getElementById('signupForm');
        if (signupForm && !signupForm._launchFixed) {
            signupForm._launchFixed = true;
            signupForm.addEventListener('submit', function(e) {
                e.preventDefault();
                // Get data from old form and pass to universal auth
                var name = document.getElementById('signupName') ? document.getElementById('signupName').value : '';
                var email = document.getElementById('signupEmail') ? document.getElementById('signupEmail').value : '';
                var password = document.getElementById('signupPassword') ? document.getElementById('signupPassword').value : '';
                
                // Close old modal
                var old = document.getElementById('signupModal');
                if (old) old.classList.remove('active');
                document.body.style.overflow = '';
                
                // Open universal auth and pre-fill
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal('signup');
                    setTimeout(function() {
                        var uaName = document.getElementById('uaSignupName');
                        var uaEmail = document.getElementById('uaSignupEmail');
                        var uaPass = document.getElementById('uaSignupPassword');
                        if (uaName && name) uaName.value = name;
                        if (uaEmail && email) uaEmail.value = email;
                        if (uaPass && password) uaPass.value = password;
                    }, 100);
                }
            });
        }

        // Fix old v2 login form
        var loginForm = document.getElementById('loginForm');
        if (loginForm && !loginForm._launchFixed) {
            loginForm._launchFixed = true;
            loginForm.addEventListener('submit', function(e) {
                e.preventDefault();
                var email = document.getElementById('loginEmail') ? document.getElementById('loginEmail').value : '';
                var password = document.getElementById('loginPassword') ? document.getElementById('loginPassword').value : '';
                
                var old = document.getElementById('loginModal');
                if (old) old.classList.remove('active');
                document.body.style.overflow = '';
                
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal('login');
                    setTimeout(function() {
                        var uaEmail = document.getElementById('uaLoginEmail');
                        var uaPass = document.getElementById('uaLoginPassword');
                        if (uaEmail && email) uaEmail.value = email;
                        if (uaPass && password) uaPass.value = password;
                    }, 100);
                }
            });
        }
    }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        fixAuthButtons();

        // Patch concierge after it builds
        setTimeout(patchConcierge, 1000);
        setTimeout(patchConcierge, 2500);
        setTimeout(patchConcierge, 5000);

        // Re-fix auth buttons after late-loading scripts
        setTimeout(fixAuthButtons, 500);
        setTimeout(fixAuthButtons, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for cross-script access
    window.LaunchPolish = {
        openVenueDetail: openVenueDetail,
        showMiniToast: showMiniToast
    };
})();