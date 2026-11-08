/**
 * SceneLink — Premium Map Popup Enhancer
 * Upgrades the #slVenueWrap .sl-venue-card popup on Explore + Nightlife.
 * Runs AFTER page setActiveVenue() to add:
 *   - open-now status
 *   - validated reservation/website buttons
 *   - vibe/description line
 *   - directions action
 *   - correct saved-state heart
 *   - venue data corrections (Memoire etc.)
 *   - auth-gated actions
 *
 * Safe/non-destructive: mutates the existing popup DOM, preserves IDs the
 * page scripts already wire up (slCardSaveBtn, slCardPlanBtn, slCardReserve,
 * slCardDetailBtn, slCardClose).
 */
(function () {
    'use strict';

    // ---- Venue corrections (safety net for stale DB) --------------
    var CORRECTIONS = {};

    // Boston water bounding boxes — if a venue's lat/lng falls inside,
    // we mark it as suspect and show a fallback rather than a bad pin.
    // (Charles River approx between Cambridge and Boston)
    function isInWater(lat, lng) {
        try {
            lat = parseFloat(lat); lng = parseFloat(lng);
            if (!isFinite(lat) || !isFinite(lng)) return false;
            // Charles River strip
            if (lat >= 42.349 && lat <= 42.371 && lng >= -71.101 && lng <= -71.057) {
                // quick band check — the river is a narrow diagonal band
                // rough midline: lat = 42.355 + (lng + 71.08)*(-0.4)
                var midLat = 42.355 - (lng + 71.08) * 0.4;
                if (Math.abs(lat - midLat) < 0.004) return true;
            }
            // Boston Harbor east of venues
            if (lng > -71.018 && lat > 42.335 && lat < 42.400) return true;
            return false;
        } catch (_) { return false; }
    }

    function applyCorrections(v) {
        if (!v || !v.name) return v;
        Object.keys(CORRECTIONS).forEach(function (k) {
            var rule = CORRECTIONS[k];
            try { if (rule.match(v)) rule.apply(v); } catch (_) {}
        });
        return v;
    }

    // ---- Helpers --------------------------------------------------
    function isLoggedIn() {
        try {
            if (window.SLApi && typeof window.SLApi.isLoggedIn === 'function' && window.SLApi.isLoggedIn()) return true;
            if (window.SLAuth && typeof window.SLAuth.isAuthed === 'function' && window.SLAuth.isAuthed()) return true;
            return !!(localStorage.getItem('sl_jwt_token') || localStorage.getItem('sl_jwt_v2'));
        } catch (_) { return false; }
    }
    function requireAuthOrPrompt(actionLabel) {
        if (isLoggedIn()) return true;
        toast('Please log in to ' + (actionLabel || 'continue'));
        try {
            if (window.SLAuth && typeof window.SLAuth.openLogin === 'function') window.SLAuth.openLogin('login');
            else if (window.SLAuth && typeof window.SLAuth.openModal === 'function') window.SLAuth.openModal('login');
            else if (window.SLAuthUI && typeof window.SLAuthUI.open === 'function') window.SLAuthUI.open('login');
        } catch (_) {}
        return false;
    }
    function toast(msg) {
        try {
            var t = document.createElement('div');
            t.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(212,175,55,0.95);color:#0a0a0a;padding:10px 22px;border-radius:12px;font-size:13px;font-weight:700;z-index:999999;white-space:nowrap;';
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; }, 1800);
            setTimeout(function () { if (t.parentNode) t.remove(); }, 2200);
        } catch (_) {}
    }

    function isSavedVenue(id) {
        try {
            if (window.SLState && typeof window.SLState.isFavorite === 'function') return !!window.SLState.isFavorite(id);
            var saved = JSON.parse(localStorage.getItem('sl_saved_venues') || '{}');
            return !!saved[id];
        } catch (_) { return false; }
    }
    function isInPlan(id) {
        try {
            if (window.SLState && typeof window.SLState.isInPlan === 'function') return !!window.SLState.isInPlan(id);
            var plan = JSON.parse(localStorage.getItem('tp-plan-v2') || '[]');
            return plan.some(function (p) { return p && p.id === id; });
        } catch (_) { return false; }
    }

    // Provider links do not authorize an in-site booking flow.
    function pickReserveButton(){ return null; }

    // Open-now calculation from hours string (very permissive)
    function isOpenNow(){return null;}

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
        });
    }

    // ---- Core: upgrade popup when it becomes visible --------------
    function buildActionsHTML(v, opts) {
        opts = opts || {};
        var isNightlife = !!opts.nightlife;
        var saved = isSavedVenue(v.id);
        var planned = isInPlan(v.id);
        var reserve = pickReserveButton(v);
        var website = window.SLConnected.safeUrl(v.website || v.website_url);
        var validWeb = !!website;
        var phone = v.phone || '';
        var validPhone = phone && /[\d]{7,}/.test(phone.replace(/[^\d]/g,''));
        var hasLatLng = v.lat && v.lng && !isNaN(parseFloat(v.lat)) && !isNaN(parseFloat(v.lng));

        var buttons = [];

        // Primary: Reserve > Website > Call > Details (Phase 5D-A H2)
        if (reserve) {
            buttons.push('<a class="sl-mpp-btn sl-mpp-primary" href="' + escapeHtml(reserve.url) + '" target="_blank" rel="noopener"><i class="fas ' + reserve.icon + '"></i> ' + reserve.label + '</a>');
        } else if (validWeb) {
            buttons.push('<a class="sl-mpp-btn sl-mpp-primary" href="' + escapeHtml(website) + '" target="_blank" rel="noopener"><i class="fas fa-globe"></i> Venue website (info)</a>');
        } else if (validPhone) {
            var telHref = 'tel:' + phone.replace(/[^\d+]/g,'');
            buttons.push('<a class="sl-mpp-btn sl-mpp-primary" href="' + escapeHtml(telHref) + '"><i class="fas fa-phone"></i> Call</a>');
        } else {
            buttons.push('<button class="sl-mpp-btn sl-mpp-primary" id="slCardDetailsPrimary"><i class="fas fa-info-circle"></i> Details</button>');
        }

        // Plan Night
        buttons.push('<button class="sl-mpp-btn ' + (planned ? 'saved' : '') + '" id="slCardPlanBtn" title="Plan Night"><i class="fas fa-calendar-plus"></i> ' + (planned ? 'In Plan' : 'Plan') + '</button>');

        // Save (icon)
        buttons.push('<button class="sl-mpp-btn sl-mpp-icon ' + (saved ? 'saved' : '') + '" id="slCardSaveBtn" title="' + (saved ? 'Saved' : 'Save') + '"><i class="' + (saved ? 'fas' : 'far') + ' fa-heart"></i></button>');

        // Add to List (icon)
        buttons.push('<button class="sl-mpp-btn sl-mpp-icon" id="slCardAddListBtn" title="Add to List"><i class="fas fa-layer-group"></i></button>');

        // Directions (icon)
        if (hasLatLng) {
            var dirUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(v.lat + ',' + v.lng);
            buttons.push('<a class="sl-mpp-btn sl-mpp-icon" href="' + dirUrl + '" target="_blank" rel="noopener" title="Directions"><i class="fas fa-directions"></i></a>');
        }

        // Details (arrow)
        buttons.push('<button class="sl-mpp-btn sl-mpp-icon" id="slCardDetailBtn" title="Full details"><i class="fas fa-arrow-right"></i></button>');

        return buttons.join('');
    }

    function buildMetaHTML(v, opts) {
        opts = opts || {};
        var isNightlife = !!opts.nightlife;
        var rating = v.rating ? parseFloat(v.rating).toFixed(1) : null;
        var reviews = v.review_count || 0;
        var price = v.price_label || (v.price_level ? '$'.repeat(v.price_level) : null);
        var open = isOpenNow(v.hours);
        var bits = [];
        if (rating) bits.push('<span class="star">&#9733; ' + rating + (reviews ? ' (' + reviews + ')' : '') + '</span>');
        if (price) bits.push('<span>' + escapeHtml(price) + '</span>');
        if (isNightlife && (v.going_count || v.people)) {
            bits.push('<span class="people"><i class="fas fa-fire"></i> ' + (v.going_count || v.people) + '</span>');
        }
        // Phase 6B: never show "Open now" / "Closed" status until hours_json is ingested system-wide.
        // if (open === true) bits.push('<span class="sl-mpp-open">Open now</span>');
        // else if (open === false) bits.push('<span class="sl-mpp-closed">Closed</span>');
        return bits.join('');
    }

    function typeLine(v) {
        var t = v.type || v.cat || 'Venue';
        var where = v.neighborhood || v.city || '';
        t = String(t).charAt(0).toUpperCase() + String(t).slice(1);
        return where ? t + ' · ' + where : t;
    }

    // Upgrade the popup DOM for the currently active venue
    function upgrade(venue, opts) {
        if (!venue) return;
        applyCorrections(venue);

        // If lat/lng is in water, we don't *correct* coords here (Leaflet already
        // placed the pin), but corrections above handle known cases.

        var wrap = document.getElementById('slVenueWrap');
        if (!wrap) return;
        var card = wrap.querySelector('.sl-venue-card');
        if (!card) return;

        // Info column
        var info = card.querySelector('.sl-venue-card-info');
        if (info) {
            // Preserve name and type id's but enrich meta
            var nameEl = info.querySelector('#slCardName');
            var typeEl = info.querySelector('#slCardType');
            var metaEl = info.querySelector('.sl-venue-card-meta');

            if (nameEl) nameEl.textContent = venue.name || '';
            if (typeEl) typeEl.textContent = typeLine(venue);
            if (metaEl) metaEl.innerHTML = buildMetaHTML(venue, opts);

            // Vibe line (add once)
            var vibeEl = info.querySelector('.sl-mpp-vibe');
            var vibeText = venue.short_desc || venue.vibe || venue.description || '';
            if (vibeText) {
                if (!vibeEl) {
                    vibeEl = document.createElement('div');
                    vibeEl.className = 'sl-mpp-vibe';
                    info.appendChild(vibeEl);
                }
                vibeEl.textContent = vibeText;
            } else if (vibeEl) {
                vibeEl.remove();
            }
        }

        // Action row — rebuild with validated buttons
        var actions = card.querySelector('.sl-venue-card-actions');
        if (actions) {
            actions.innerHTML = buildActionsHTML(venue, opts);
            wireActions(actions, venue);
        }

        // Thumbnail image — use SLVenueImages with premium fallback
        var img = card.querySelector('#slCardImg');
        if (img) {
            var src = (window.SLVenueImages && SLVenueImages.pick && SLVenueImages.pick(venue)) ||
                      venue.thumbnail_url || venue.cover_image_url || venue.image_url ||
                      (venue.image_urls && venue.image_urls[0]) || null;
            if (!src) {
                src = premiumFallback(venue);
            }
            img.src = src;
            img.alt = venue.name || 'Venue';
            img.onerror = function () {
                img.onerror = null;
                img.src = premiumFallback(venue);
            };
        }
    }

    function premiumFallback(v) {
        // Consistent tasteful generic images by type
        var t = String(v && v.type || '').toLowerCase();
        if (/club|nightclub|dance|music|lounge/.test(t)) {
            return '/assets/img/placeholder-venue.svg';
        }
        if (/bar|pub|speakeasy|cocktail|rooftop/.test(t)) {
            return '/assets/img/placeholder-venue.svg';
        }
        if (/restaurant|eat|dining|food|cafe|coffee|brunch/.test(t)) {
            return '/assets/img/placeholder-venue.svg';
        }
        if (/event|concert|show|theater|venue/.test(t)) {
            return '/assets/img/placeholder-event.svg';
        }
        return '/assets/img/placeholder-venue.svg';
    }

    function wireActions(actionsEl, v) {
        // Save
        var saveBtn = actionsEl.querySelector('#slCardSaveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                if (!requireAuthOrPrompt('save venues')) return;
                var nowFav = false;
                if (window.SLState && typeof window.SLState.toggleFavorite === 'function') {
                    try { nowFav = window.SLState.toggleFavorite(v); } catch (_) {}
                } else {
                    try {
                        var saved = JSON.parse(localStorage.getItem('sl_saved_venues') || '{}');
                        if (saved[v.id]) { delete saved[v.id]; nowFav = false; }
                        else { saved[v.id] = { id: v.id, name: v.name, type: v.type || '', time: Date.now() }; nowFav = true; }
                        localStorage.setItem('sl_saved_venues', JSON.stringify(saved));
                        window.dispatchEvent(new Event('sl-lists-changed'));
                    } catch (_) {}
                }
                if (nowFav) {
                    saveBtn.classList.add('saved');
                    saveBtn.querySelector('i').className = 'fas fa-heart';
                    saveBtn.title = 'Saved';
                    toast('💛 Added to favorites');
                } else {
                    saveBtn.classList.remove('saved');
                    saveBtn.querySelector('i').className = 'far fa-heart';
                    saveBtn.title = 'Save';
                    toast('Removed from favorites');
                }
                // backend sync
                if (window.SLApi && window.SLApi.isLoggedIn && window.SLApi.isLoggedIn()) {
                    try { window.SLApi.toggleFavorite(v.id).catch(function () {}); } catch (_) {}
                }
            });
        }

        // Plan Night
        var planBtn = actionsEl.querySelector('#slCardPlanBtn');
        if (planBtn) {
            planBtn.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                if (!requireAuthOrPrompt('plan your night')) return;
                if (window.SLState && typeof window.SLState.addToPlan === 'function' && typeof window.SLState.isInPlan === 'function') {
                    if (window.SLState.isInPlan(v.id)) {
                        toast(v.name + ' is already in your plan');
                    } else {
                        try { window.SLState.addToPlan(v); } catch (_) {}
                        toast('📅 Added to tonight\'s plan');
                        planBtn.classList.add('saved');
                        planBtn.innerHTML = '<i class="fas fa-calendar-plus"></i> In Plan';
                    }
                } else {
                    try {
                        var plan = JSON.parse(localStorage.getItem('tp-plan-v2') || '[]');
                        if (!plan.find(function (p) { return p.id === v.id; })) {
                            plan.push({ id: v.id, name: v.name, type: v.type || '' });
                            localStorage.setItem('tp-plan-v2', JSON.stringify(plan));
                            toast('📅 Added to tonight\'s plan');
                            planBtn.classList.add('saved');
                            planBtn.innerHTML = '<i class="fas fa-calendar-plus"></i> In Plan';
                        } else {
                            toast(v.name + ' is already in your plan');
                        }
                        window.dispatchEvent(new Event('sl-lists-changed'));
                    } catch (_) {}
                }
            });
        }

        // Add to List
        var addListBtn = actionsEl.querySelector('#slCardAddListBtn');
        if (addListBtn) {
            addListBtn.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                if (!requireAuthOrPrompt('add to a list')) return;
                // Prefer the full venue detail's "Add to List" UI by opening the modal
                if (window.SLVenueDetail && typeof window.SLVenueDetail.open === 'function') {
                    window.SLVenueDetail.open(v.slug || v.id);
                } else {
                    toast('Open Details to add to a list');
                }
            });
        }

        // Details arrow
        var detailBtn = actionsEl.querySelector('#slCardDetailBtn') || actionsEl.querySelector('#slCardDetailsPrimary');
        if (detailBtn) {
            detailBtn.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                if (window.SLVenueDetail && typeof window.SLVenueDetail.open === 'function') {
                    window.SLVenueDetail.open(v.slug || v.id);
                } else if (window.openVenueDetail) {
                    window.openVenueDetail(v.slug || v.id);
                }
            });
        }
    }

    // ---- Observer: when popup visibility flips to visible, upgrade ----
    var lastActiveId = null;

    function findActiveVenue() {
        // Try explore-premium.js: window.allVenues, active via pin .active
        var id = null;
        var pin = document.querySelector('.sl-pin.active');
        if (pin) id = pin.getAttribute('data-id');
        if (!id) {
            var nameEl = document.getElementById('slCardName');
            if (nameEl) {
                var nm = nameEl.textContent.trim();
                var all = (window.allVenues || window._slVenues || window.venues || []);
                var hit = all.find(function (v) { return v && v.name === nm; });
                if (hit) id = hit.id;
            }
        }
        if (!id) return null;
        var list = (window.allVenues || window._slVenues || window.venues || []);
        return list.find(function (v) { return v && v.id === id; }) || null;
    }

    function tryUpgrade() {
        var wrap = document.getElementById('slVenueWrap');
        if (!wrap || !wrap.classList.contains('visible')) return;
        var v = findActiveVenue();
        if (!v) return;
        if (lastActiveId === v.id) return;
        lastActiveId = v.id;
        var isNightlife = /nightlife/i.test(location.pathname);
        upgrade(v, { nightlife: isNightlife });
    }

    function setupObserver() {
        var wrap = document.getElementById('slVenueWrap');
        if (!wrap) return;
        try {
            var mo = new MutationObserver(function () { tryUpgrade(); });
            mo.observe(wrap, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
        } catch (_) {}
        // Also poll as a safety net
        setInterval(tryUpgrade, 800);
    }

    // Expose helpers for page scripts
    window.SLMapPopupPremium = {
        upgrade: upgrade,
        applyCorrections: applyCorrections,
        isInWater: isInWater,
        premiumFallback: premiumFallback,
        pickReserveButton: pickReserveButton
    };

    // Boot
    function init() {
        // Only run on pages with the popup
        if (!document.getElementById('slVenueWrap')) return;
        setupObserver();
        // Immediate upgrade if popup already showing
        setTimeout(tryUpgrade, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();