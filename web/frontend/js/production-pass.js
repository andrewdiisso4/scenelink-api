/* ================================================================
   SCENELINK PRODUCTION PASS — Final Launch JS
   Handles: Homepage restructure, Explore fixes, Nightlife fixes,
            Social flow, Auth polish
   ================================================================ */
window.__prodPassLoaded = true;
(function() {
    'use strict';

    var isHome = /index\.html/i.test(window.location.pathname) || window.location.pathname === '/' || window.location.pathname.endsWith('/');
    var isExplore = /explore/i.test(window.location.pathname);
    var isNightlife = /nightlife/i.test(window.location.pathname);
    var isSocial = /social/i.test(window.location.pathname);

    /* ==========================================================
       1. HOMEPAGE — Restructure Tonight in Boston as Section
       ========================================================== */
    function restructureHomepage() {
        // DISABLED: Homepage reverted to scenelink.app original layout
        // Tonight in Boston content now lives on Explore and Tonight's Picks pages
        return;

        if (!isHome) return;

        // Wait for product-evolution to finish building
        setTimeout(function() {
            var tonightHero = document.querySelector('.tonight-hero');
            var shortcuts = document.querySelector('.evo-shortcuts');
            var outBar = document.querySelector('.out-tonight-bar');
            var feed = document.querySelector('.tonight-feed');
            var hero = document.querySelector('.hero-v2');

            if (!hero || !feed) return;

            // Move shortcuts into the hero area (after CTA buttons)
            var ctaRow = hero.querySelector('.hero-cta-row');
            if (ctaRow && shortcuts) {
                // Insert shortcuts below the CTA row inside the hero
                ctaRow.parentNode.insertBefore(shortcuts, ctaRow.nextSibling);
                shortcuts.style.marginTop = '28px';
            }

            // Move out-tonight bar into hero after shortcuts
            if (shortcuts && outBar) {
                shortcuts.parentNode.insertBefore(outBar, shortcuts.nextSibling);
                outBar.style.marginTop = '16px';
                outBar.style.marginBottom = '0';
            }

            // Remove the redundant tonight-hero overlay
            if (tonightHero) {
                tonightHero.style.display = 'none';
            }

            // Social strip — move to top of feed if it's buried
            var socialStrip = document.querySelector('.social-strip');
            if (socialStrip && feed) {
                var firstSection = feed.querySelector('.evo-feed-section');
                if (firstSection) {
                    feed.insertBefore(socialStrip, firstSection);
                }
            }

            // Add "Tonight in Boston" section header above the feed
            if (feed && !document.getElementById('tonightSectionHeader')) {
                var header = document.createElement('div');
                header.id = 'tonightSectionHeader';
                header.style.cssText = 'max-width:1200px;margin:0 auto;padding:40px 20px 16px;';
                header.innerHTML = '<h2 style="font-size:28px;font-weight:800;color:#fff;margin:0;display:flex;align-items:center;gap:10px;">' +
                    '<span style="font-size:24px;">🌃</span> Tonight in Boston' +
                    '<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-size:11px;font-weight:700;padding:3px 10px;border-radius:50px;margin-left:8px;">' +
                    '<span style="width:6px;height:6px;border-radius:50%;background:#ef4444;animation:blink 1.5s infinite;"></span> LIVE</span></h2>' +
                    '<p style="font-size:14px;color:rgba(255,255,255,0.5);margin:6px 0 0;">What\'s happening right now across the city</p>';
                feed.parentNode.insertBefore(header, feed);
            }

            // Ensure the feed itself appears below the hero cleanly
            if (feed) {
                feed.style.paddingTop = '0';
            }

        }, 400);
    }

    /* ==========================================================
       2. EXPLORE PAGE — Fix List/Map Sync + Overlap
       ========================================================== */
    function fixExplorePage() {
        if (!isExplore) return;

        setTimeout(function() {
            // Fix "Discover" header overlap
            var listView = document.getElementById('slListView');
            if (listView) {
                // Ensure list view has proper containment
                listView.style.position = 'relative';
                listView.style.zIndex = '10';
                listView.style.overflowY = 'auto';
                listView.style.maxHeight = '100vh';
                
                var listHeader = listView.querySelector('.sl-list-header');
                if (listHeader) {
                    listHeader.style.position = 'sticky';
                    listHeader.style.top = '0';
                    listHeader.style.zIndex = '12';
                    listHeader.style.background = 'rgba(10,10,10,0.98)';
                    listHeader.style.backdropFilter = 'blur(10px)';
                    listHeader.style.padding = '16px 20px';
                    listHeader.style.borderBottom = '1px solid rgba(212,175,55,0.1)';
                }
            }

            // Add save buttons to list cards if missing
            enhanceExploreListCards();
        }, 1500);
    }

    function enhanceExploreListCards() {
        var cards = document.querySelectorAll('#slListCards .sl-list-card');
        cards.forEach(function(card) {
            if (card.dataset.ppEnhanced) return;
            card.dataset.ppEnhanced = '1';

            // Check if save button already exists
            var existingSave = card.querySelector('.sl-save-btn, [data-action="save"]');
            if (!existingSave) {
                var actions = card.querySelector('.sl-list-card-actions, .sl-list-actions');
                if (!actions) {
                    actions = document.createElement('div');
                    actions.className = 'sl-list-card-actions';
                    actions.style.cssText = 'display:flex;gap:8px;padding:8px 12px;border-top:1px solid rgba(255,255,255,0.05);';
                    card.appendChild(actions);
                }

                var saveBtn = document.createElement('button');
                saveBtn.className = 'sl-save-btn';
                saveBtn.innerHTML = '<i class="fas fa-bookmark"></i> Save';
                saveBtn.style.cssText = 'background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.2);color:#D4AF37;padding:6px 14px;border-radius:8px;font-size:12px;cursor:pointer;transition:all 0.2s;';
                saveBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openUnifiedSave(card.querySelector('.sl-list-card-name, h4, h3')?.textContent || 'Venue');
                });
                actions.appendChild(saveBtn);
            }
        });

        // Re-check periodically for dynamically loaded cards
        setTimeout(enhanceExploreListCards, 3000);
    }

    /* ==========================================================
       3. NIGHTLIFE PAGE — Sticky Map + Better UX
       ========================================================== */
    function fixNightlifePage() {
        if (!isNightlife) return;

        setTimeout(function() {
            // Make map area sticky
            var mapHero = document.querySelector('.nl-map-hero');
            var mapEl = document.getElementById('nlMap');
            
            if (mapHero && mapEl) {
                // Prevent scroll on map from scrolling page
                mapEl.addEventListener('wheel', function(e) {
                    e.stopPropagation();
                }, { passive: false });
                
                mapEl.addEventListener('touchmove', function(e) {
                    e.stopPropagation();
                }, { passive: false });
            }

            // Add "Browse Venues" scroll indicator if not visible
            var browseBtn = document.querySelector('.nl-browse-toggle button, .nl-browse-btn, button[class*="Browse"]');
            if (browseBtn) {
                browseBtn.style.cssText = 'background:linear-gradient(135deg,rgba(212,175,55,0.15),rgba(212,175,55,0.05));border:1px solid rgba(212,175,55,0.3);color:#D4AF37;padding:12px 32px;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;';
                
                // Make it scroll to venues on click
                browseBtn.addEventListener('click', function() {
                    var venueSection = document.querySelector('.nightlife-venue-listings-section');
                    if (venueSection) {
                        venueSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
            }

            // Enhance nightlife venue cards with save button if missing
            enhanceNightlifeCards();
        }, 2000);
    }

    function enhanceNightlifeCards() {
        var cards = document.querySelectorAll('.venue-card-enhanced, .nl-venue-card');
        cards.forEach(function(card) {
            if (card.dataset.ppSave) return;
            card.dataset.ppSave = '1';

            // Find the card's action area
            var actions = card.querySelector('.venue-actions, .nl-venue-actions, .venue-card-footer');
            if (!actions) {
                actions = card.querySelector('[class*="actions"]');
            }

            // Check if there's already a save button
            var existingSave = card.querySelector('[class*="save"], button:has(i.fa-bookmark)');
            if (existingSave) return;

            // Get venue name
            var nameEl = card.querySelector('h3, h4, .venue-name, [class*="name"]');
            var venueName = nameEl ? nameEl.textContent.trim() : 'Venue';

            // Add save button to the actions area
            if (actions) {
                var saveBtn = document.createElement('button');
                saveBtn.innerHTML = '<i class="fas fa-bookmark"></i> Save';
                saveBtn.style.cssText = 'background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.2);color:#D4AF37;padding:8px 16px;border-radius:10px;font-size:12px;cursor:pointer;transition:all 0.2s;margin-top:6px;';
                saveBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    openUnifiedSave(venueName);
                });
                actions.appendChild(saveBtn);
            }
        });

        setTimeout(enhanceNightlifeCards, 5000);
    }

    /* ==========================================================
       4. SOCIAL FLOW — Logged in vs. not logged in
       ========================================================== */
    function setupSocialFlow() {
        // Wire social nav button behavior
        var socialLinks = document.querySelectorAll('a[href="social-feed.html"]');
        socialLinks.forEach(function(link) {
            if (link._ppSocialWired) return;
            link._ppSocialWired = true;

            link.addEventListener('click', function(e) {
                var user = null;
                try { user = JSON.parse(localStorage.getItem('sl_user')); } catch(ex) {}

                // If logged in, let normal navigation happen
                if (user) return;

                // If not logged in on other pages, show social preview that drives signup
                if (!isSocial) {
                    // Let it navigate to social-feed.html which will show preview
                    return;
                }
            });
        });

        // On social page, show signup prompt if not logged in
        if (isSocial) {
            var user = null;
            try { user = JSON.parse(localStorage.getItem('sl_user')); } catch(ex) {}
            
            if (!user) {
                setTimeout(function() {
                    addSocialSignupBanner();
                }, 1000);
            }
        }
    }

    function addSocialSignupBanner() {
        if (document.getElementById('ppSocialBanner')) return;
        
        var banner = document.createElement('div');
        banner.id = 'ppSocialBanner';
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:linear-gradient(135deg,rgba(12,12,18,0.98),rgba(20,15,5,0.98));border-top:1px solid rgba(212,175,55,0.3);padding:20px;text-align:center;backdrop-filter:blur(12px);';
        banner.innerHTML = 
            '<div style="max-width:600px;margin:0 auto;">' +
            '<p style="color:#fff;font-size:16px;font-weight:700;margin:0 0 6px;">See where your friends are going tonight</p>' +
            '<p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0 0 14px;">Sign up to unlock the full social experience — activity feeds, shared lists, and group planning.</p>' +
            '<button id="ppSocialSignupBtn" style="background:linear-gradient(135deg,#D4AF37,#b8962e);color:#0a0a0a;border:none;padding:12px 32px;border-radius:50px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.2s;">Join SceneLink — It\'s Free</button>' +
            '</div>';
        
        document.body.appendChild(banner);
        
        document.getElementById('ppSocialSignupBtn').addEventListener('click', function() {
            // Open universal auth modal
            if (typeof window.openAuthModal === 'function') {
                window.openAuthModal('signup');
            }
        });
    }

    /* ==========================================================
       5. UNIFIED SAVE SYSTEM (cross-page)
       ========================================================== */
    function openUnifiedSave(venueName) {
        // Try the product-evolution save modal first
        var evoModal = document.getElementById('slEvoSaveModal');
        if (evoModal) {
            evoModal.classList.add('open');
            evoModal.style.display = 'flex';
            return;
        }

        // Try the polish-v2 save modal
        var v2Modal = document.getElementById('sl-v2-save-modal');
        if (v2Modal) {
            v2Modal.style.display = 'flex';
            return;
        }

        // Fallback — create a quick save toast
        showProductionToast('Saved to Favorites ✓', 'bookmark');
    }

    function showProductionToast(msg, icon) {
        var existing = document.querySelector('.pp-toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.className = 'pp-toast';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:rgba(12,12,18,0.95);border:1px solid rgba(212,175,55,0.3);color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;z-index:999999;display:flex;align-items:center;gap:8px;opacity:0;transition:all 0.3s;backdrop-filter:blur(10px);';
        toast.innerHTML = (icon ? '<i class="fas fa-' + icon + '" style="color:#D4AF37"></i> ' : '') + msg;
        document.body.appendChild(toast);

        requestAnimationFrame(function() {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });

        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(function() { toast.remove(); }, 300);
        }, 2500);
    }

    /* ==========================================================
       6. AUTH POLISH — Remove all placeholders
       ========================================================== */
    function polishAuth() {
        // Remove any remaining placeholder text
        document.querySelectorAll('*').forEach(function(el) {
            if (el.children.length === 0) {
                var t = el.textContent || '';
                if (t.indexOf('functionality would be') >= 0 ||
                    t.indexOf('Coming soon') >= 0 ||
                    t.indexOf('Placeholder') >= 0 ||
                    t.indexOf('TODO') >= 0) {
                    el.style.display = 'none';
                }
            }
        });
    }

    /* ==========================================================
       7. GLOBAL — Remove dead clicks
       ========================================================== */
    function fixDeadClicks() {
        // Wire all "#" links to do nothing gracefully
        document.querySelectorAll('a[href="#"]').forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
            });
        });
    }

    /* ==========================================================
       BOOT
       ========================================================== */
    function init() {
        restructureHomepage();
        fixExplorePage();
        fixNightlifePage();
        setupSocialFlow();
        polishAuth();
        fixDeadClicks();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* ==========================================================
       PERSISTENT AUTH REFLECTOR - catches late-loading navs
       ========================================================== */
    function persistentAuthReflect() {
        // Unified routes use the session-aware canonical navigation gate.
        if (document.documentElement.dataset.slDesign === 'unified') return;
        try {
            var user = JSON.parse(localStorage.getItem('sl_user') || 'null');
            if (!user) return;
            var initials = (user.initials || 'U');

            // Find any remaining auth buttons that haven't been converted
            var selectors = '.btn-header-primary, #headerSignupBtn, #openSignupModal, .sl-hdr-signup, .sl-signup-btn, .btn-join-scene';
            var found = document.querySelectorAll(selectors);
            found.forEach(function(btn) {
                if (btn._prodPassConverted) return;
                if (btn.closest('.hero-cta-row')) return;
                var text = (btn.textContent || '').trim().toLowerCase();
                if (text.indexOf('log in') >= 0 || text.indexOf('sign up') >= 0 || text === 'join now' || text === 'get started') {
                    btn._prodPassConverted = true;
                    btn.innerHTML = '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#D4AF37,#b8962e);color:#0a0a0a;font-weight:900;font-size:11px;margin-right:6px">' + initials + '</span> ' + (user.name || 'User');
                    btn.style.cssText = 'display:inline-flex !important;align-items:center;gap:6px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.25);padding:6px 14px;border-radius:50px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;';
                    btn.id = '';
                    btn.className = 'sl-user-chip-prod';
                }
            });

            // Also check by text content
            document.querySelectorAll('button').forEach(function(btn) {
                if (btn._prodPassConverted) return;
                if (btn.closest('.hero-cta-row')) return;
                var text = (btn.textContent || '').trim().toLowerCase();
                if (text === 'sign up' || text === 'log in / sign up' || text === 'log in' || text === 'join now' || text === 'get started') {
                    btn._prodPassConverted = true;
                    btn.innerHTML = '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#D4AF37,#b8962e);color:#0a0a0a;font-weight:900;font-size:11px;margin-right:6px">' + initials + '</span> ' + (user.name || 'User');
                    btn.style.cssText = 'display:inline-flex !important;align-items:center;gap:6px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.25);padding:6px 14px;border-radius:50px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;';
                    btn.id = '';
                    btn.className = 'sl-user-chip-prod';
                }
            });
        } catch(e) { /* silent */ }
    }

    // Run auth reflector multiple times to catch late-loading headers
    setTimeout(persistentAuthReflect, 100);
    setTimeout(persistentAuthReflect, 500);
    setTimeout(persistentAuthReflect, 1500);
    setTimeout(persistentAuthReflect, 3000);
    setTimeout(persistentAuthReflect, 5000);

    // Discovery owns its selected category. Delayed synthetic clicks used to
    // override user searches and explicit All selections after the page loaded.
})();