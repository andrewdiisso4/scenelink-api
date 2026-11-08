/*!
 * SceneLink Business App Integration (v1)
 * Augments the inline business.html dashboard with full backend wiring:
 *  - /api/business/me on load (validates token, refreshes user)
 *  - /api/business/venue GET (prefill edit form)
 *  - /api/business/venue POST (CREATE listing when not linked)
 *  - /api/business/venue PATCH (save listing with ALL fields)
 *  - /api/business/reviews
 *  - /api/business/logout
 *
 * Works alongside the inline script in business.html.
 * Safe to load multiple times (idempotent).
 */
(function () {
    'use strict';
    if (window.__slBizApp) return;
    window.__slBizApp = true;

    var API = '/api/business';
    var TOKEN_KEY = 'sl_biz_token';
    var USER_KEY = 'sl_business_user';
    var LOCAL_USER_KEY = 'sl_business';   // inline script uses this key (BK) for UI state

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function getLocalUser() {
        try { return JSON.parse(localStorage.getItem(LOCAL_USER_KEY) || 'null'); } catch (_) { return null; }
    }
    function setLocalUser(u) { localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u)); }
    function authHeaders(extra) {
        var h = { 'Content-Type': 'application/json' };
        var t = getToken();
        if (t) h['Authorization'] = 'Bearer ' + t;
        if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
        return h;
    }

    function toast(msg, isError) {
        var el = document.createElement('div');
        el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:' +
            (isError ? '#2b0d0d' : '#0d2b1a') +
            ';border:1px solid ' + (isError ? '#e17055' : '#00b894') +
            ';border-radius:10px;padding:14px 20px;color:#fff;font-family:sans-serif;font-size:14px;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.5);max-width:340px;';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 3600);
        setTimeout(function () { el.remove(); }, 4200);
    }
    window.slBizToastX = toast;

    // ── DOM helpers ─────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }
    function setVal(id, v) { var el = $(id); if (el && v != null) el.value = v; }
    function setText(id, v) { var el = $(id); if (el) el.textContent = v; }

    // ── Prefill dashboard form from backend venue data ──────────────
    function prefillFromVenue(v) {
        if (!v) return;
        setVal('bdEditName', v.name || '');
        setVal('bdEditDesc', v.description || '');
        setVal('bdEditAddr', v.address || '');
        setVal('bdEditNhood', v.neighborhood || '');
        setVal('bdEditPhone', v.phone || '');
        setVal('bdEditWeb', v.website || '');
        setVal('bdEditResy', v.resy_url || '');
        setVal('bdEditOpentable', v.opentable_url || '');
        setVal('bdEditReservation', v.reservation_url || '');
        // Category select
        var catEl = $('bdEditCat');
        if (catEl && v.type) {
            var target = String(v.type).toLowerCase();
            Array.prototype.slice.call(catEl.options).forEach(function (opt) {
                if (opt.value.toLowerCase() === target || opt.textContent.toLowerCase() === target) {
                    opt.selected = true;
                }
            });
        }
        // Price select
        var priceEl = $('bdEditPrice');
        if (priceEl && v.price_level) {
            var n = Number(v.price_level);
            if (n >= 1 && n <= 4) priceEl.selectedIndex = n - 1;
        }
        // Dress code
        var dressEl = $('bdEditDress');
        if (dressEl && v.dress_code) {
            Array.prototype.slice.call(dressEl.options).forEach(function (opt) {
                if (opt.value === v.dress_code || opt.textContent === v.dress_code) opt.selected = true;
            });
        }
        // Update the visible venue card
        setText('bdVName', v.name || 'Your Venue');
        var meta = [v.type, v.neighborhood].filter(Boolean).join(' · ');
        if (meta) setText('bdVMeta', meta);
        var rEl = $('bdVRating');
        if (rEl) {
            if (v.rating && Number(v.rating) > 0) {
                rEl.innerHTML = '<i class="fas fa-star" style="color:var(--gold)"></i> ' +
                    Number(v.rating).toFixed(1) + ' · ' + (v.review_count || 0) + ' reviews';
            } else {
                rEl.innerHTML = '<i class="fas fa-info-circle"></i> No reviews yet · Listing live';
            }
        }
    }

    // ── Validate token + fetch latest user on load ──────────────────
    function hydrateOnLoad() {
        var token = getToken();
        if (!token) return;
        fetch(API + '/me', { headers: authHeaders() })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d || !d.user) {
                    // Token invalid/expired → clear
                    localStorage.removeItem(TOKEN_KEY);
                    localStorage.removeItem(USER_KEY);
                    return;
                }
                localStorage.setItem(USER_KEY, JSON.stringify(d.user));
                // Sync local UI-state
                var u = getLocalUser() || {};
                u.email = d.user.email;
                u.venueName = d.user.venue_name;
                u.venue_id = d.user.venue_id;
                u.tier = d.user.tier;
                setLocalUser(u);
                // Prefill form + cards with backend venue snapshot
                if (d.user.venue) prefillFromVenue(d.user.venue);
                // Update tier pill
                var tierEl = $('bdTierName');
                if (tierEl && d.user.tier) {
                    tierEl.textContent = d.user.tier.charAt(0).toUpperCase() + d.user.tier.slice(1);
                }
                // If not yet linked, surface Create Listing button
                if (!d.user.venue_id) injectCreateListingUI();
            })
            .catch(function () { /* silent */ });
    }

    // ── Inject "Create Listing" button when business has no linked venue ─
    function injectCreateListingUI() {
        if ($('bdCreateListingBtn')) return;
        var saveBtn = $('bdSaveListing');
        if (!saveBtn) return;
        var wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:14px;padding:14px;background:rgba(212,175,55,0.08);border:1.5px dashed rgba(212,175,55,0.4);border-radius:10px;';
        wrap.innerHTML =
            '<div style="color:var(--gold);font-weight:700;margin-bottom:6px;font-size:13px;">' +
            '<i class="fas fa-magic-wand-sparkles"></i> No listing linked yet</div>' +
            '<div style="color:var(--dim);font-size:12px;margin-bottom:10px;">' +
            'Fill the form above and click below to create your live SceneLink listing. ' +
            'Once created, you\'ll use "Save Changes" to edit it.</div>' +
            '<button class="bz-btn bz-btn-gold" id="bdCreateListingBtn" type="button">' +
            '<i class="fas fa-plus-circle"></i> Create Listing</button>';
        saveBtn.parentNode.insertBefore(wrap, saveBtn.nextSibling);

        $('bdCreateListingBtn').addEventListener('click', createListing);
    }

    function collectFormPayload() {
        var name = ($('bdEditName') || {}).value || '';
        var description = ($('bdEditDesc') || {}).value || '';
        var address = ($('bdEditAddr') || {}).value || '';
        var neighborhood = ($('bdEditNhood') || {}).value || '';
        var phone = ($('bdEditPhone') || {}).value || '';
        var website = ($('bdEditWeb') || {}).value || '';
        var catEl = $('bdEditCat');
        var type = catEl ? catEl.value.toLowerCase() : '';
        var priceEl = $('bdEditPrice');
        var priceLabel = priceEl ? priceEl.value : '';
        var price_level = priceLabel ? priceLabel.length : null;
        var dressEl = $('bdEditDress');
        var dress_code = dressEl ? dressEl.value : '';
        var resyVal = (($('bdEditResy') || {}).value || '').trim();
        var otVal = (($('bdEditOpentable') || {}).value || '').trim();
        var resVal = (($('bdEditReservation') || {}).value || '').trim();
        return {
            name: name.trim(),
            description: description.trim(),
            address: address.trim(),
            neighborhood: neighborhood.trim(),
            city: 'Boston',
            phone: phone.trim(),
            website: website.trim(),
            type: type,
            price_level: price_level,
            price_label: priceLabel || null,
            dress_code: dress_code,
            resy_url: resyVal || null,
            opentable_url: otVal || null,
            reservation_url: resVal || null
        };
    }

    function createListing() {
        var token = getToken();
        if (!token) { toast('Please sign in first', true); return; }
        var payload = collectFormPayload();
        if (!payload.name) { toast('Please enter a venue name', true); return; }
        var btn = $('bdCreateListingBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…'; }
        fetch(API + '/venue', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(payload)
        })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
            .then(function (res) {
                if (!res.ok) {
                    toast(res.data.error || 'Failed to create listing', true);
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus-circle"></i> Create Listing'; }
                    return;
                }
                toast('Listing created! Live on SceneLink ✓');
                // Sync local state
                var u = getLocalUser() || {};
                u.venue_id = res.data.venue.id;
                u.venueName = res.data.venue.name;
                setLocalUser(u);
                var su = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
                su.venue_id = res.data.venue.id;
                su.venue_name = res.data.venue.name;
                localStorage.setItem(USER_KEY, JSON.stringify(su));
                prefillFromVenue(res.data.venue);
                // Remove the create button, the inline save button now handles edits
                var wrap = btn ? btn.parentNode : null;
                if (wrap) wrap.remove();
            })
            .catch(function () {
                toast('Network error. Please try again.', true);
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus-circle"></i> Create Listing'; }
            });
    }

    // ── Enhanced Save: sends ALL fields via PATCH ──────────────────
    function enhanceSaveHandler() {
        var saveBtn = $('bdSaveListing');
        if (!saveBtn || saveBtn.__slEnhanced) return;
        saveBtn.__slEnhanced = true;
        saveBtn.addEventListener('click', function (e) {
            // Run AFTER inline handler (capture = false). Inline handler does PATCH with limited fields;
            // we intercept first by using capture=true so we replace it.
        }, false);
        // Replace by cloning
        var newBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newBtn, saveBtn);
        newBtn.addEventListener('click', function () {
            var token = getToken();
            var u = getLocalUser() || {};
            if (!token || !u.venue_id) {
                toast('No linked listing. Use "Create Listing" above.', true);
                return;
            }
            var payload = collectFormPayload();
            newBtn.disabled = true;
            var orig = newBtn.innerHTML;
            newBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
            fetch(API + '/venue', {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify(payload)
            })
                .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
                .then(function (res) {
                    newBtn.disabled = false; newBtn.innerHTML = orig;
                    if (!res.ok) {
                        toast(res.data.error || 'Save failed', true);
                        return;
                    }
                    toast('Listing saved & live on SceneLink ✓');
                    // Sync local UI
                    u.venueName = payload.name || u.venueName;
                    setLocalUser(u);
                    setText('bdVName', u.venueName);
                    prefillFromVenue(res.data.venue);
                })
                .catch(function () {
                    newBtn.disabled = false; newBtn.innerHTML = orig;
                    toast('Network error. Changes not saved.', true);
                });
        });
    }

    // ── Load real reviews from /api/business/reviews ───────────────
    function loadReviews() {
        var token = getToken();
        if (!token) return;
        fetch(API + '/reviews', { headers: authHeaders() })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d) return;
                var c = $('bdReviewsList'); if (!c) return;
                var reviews = d.reviews || [];
                if (!reviews.length) {
                    c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--dim);">' +
                        '<i class="fas fa-comment-dots" style="font-size:28px;color:var(--gold);margin-bottom:8px;display:block;"></i>' +
                        'No reviews yet. As customers review your venue on SceneLink, they will appear here.</div>';
                    return;
                }
                c.innerHTML = reviews.map(function (r) {
                    var stars = '';
                    for (var i = 0; i < 5; i++) {
                        stars += '<i class="fas fa-star" style="color:' +
                            (i < Math.round(r.rating || 0) ? 'var(--gold)' : 'rgba(255,255,255,0.12)') +
                            ';font-size:11px;margin-right:2px"></i>';
                    }
                    return '<div class="bd-review">' +
                        '<div class="bd-review-top">' +
                        '<div><span class="bd-review-u">' + (r.user_display_name || r.username || 'Guest') + '</span> ' + stars + '</div>' +
                        '<div class="bd-review-t">' + timeAgo(r.created_at) + '</div>' +
                        '</div>' +
                        '<div class="bd-review-txt">' + (r.content || r.text || '') + '</div>' +
                        '</div>';
                }).join('');
            })
            .catch(function () { /* silent */ });
    }

    function timeAgo(ts) {
        if (!ts) return '';
        var d = new Date(ts), now = Date.now(), diff = Math.round((now - d.getTime()) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.round(diff / 60) + 'm ago';
        if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
        return Math.round(diff / 86400) + 'd ago';
    }

    // ── Enhanced logout: calls backend + clears everything ─────────
    function enhanceLogout() {
        var btn = $('bdLogout');
        if (!btn || btn.__slEnhanced) return;
        btn.__slEnhanced = true;
        var orig = btn.cloneNode(true);
        btn.parentNode.replaceChild(orig, btn);
        orig.addEventListener('click', function () {
            var token = getToken();
            // Fire-and-forget logout
            if (token) {
                fetch(API + '/logout', { method: 'POST', headers: authHeaders() }).catch(function () {});
            }
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            localStorage.removeItem(LOCAL_USER_KEY);
            var dash = $('bizDashboard'); if (dash) dash.classList.remove('active');
            var landing = $('bizLanding'); if (landing) landing.classList.remove('hidden');
            toast('Signed out successfully');
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // PHOTOS — real DB via /api/business/photos
    // ═══════════════════════════════════════════════════════════════
    var _activeVenueId = null;  // primary/active venue_id

    function loadPhotos() {
        var token = getToken();
        if (!token) return;
        var qs = _activeVenueId ? '?venue_id=' + encodeURIComponent(_activeVenueId) : '';
        fetch(API + '/photos' + qs, { headers: authHeaders() })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d) return;
                renderPhotosFromBackend(d.photos || []);
            })
            .catch(function () { /* silent */ });
    }

    function renderPhotosFromBackend(photos) {
        var c = $('bdPhotosGrid'); if (!c) return;
        var u = getLocalUser() || {};
        var max = u.tier === 'starter' ? 10 : 99;
        var countEl = $('bdPhotoCount');
        if (countEl) countEl.textContent = '(' + photos.length + '/' + max + ')';

        var html = photos.map(function (p) {
            return '<div class="bd-photo" data-photo-id="' + p.id + '">' +
                '<img src="' + p.url + '" alt="' + (p.caption || 'Venue photo') + '">' +
                '<button class="bd-photo-del sl-photo-del" data-id="' + p.id + '" title="Delete">' +
                '<i class="fas fa-times"></i></button>' +
                '</div>';
        }).join('');
        if (photos.length < max) {
            html += '<div class="bd-photo add" id="bdAddPhoto"><i class="fas fa-plus"></i></div>';
        }
        c.innerHTML = html;

        // Wire delete buttons
        Array.prototype.slice.call(c.querySelectorAll('.sl-photo-del')).forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!confirm('Delete this photo? This cannot be undone.')) return;
                var id = btn.dataset.id;
                fetch(API + '/photos/' + encodeURIComponent(id), {
                    method: 'DELETE', headers: authHeaders()
                }).then(function (r) { return r.ok ? r.json() : null; })
                  .then(function (d) {
                      if (d && d.ok) { toast('Photo deleted'); loadPhotos(); }
                      else toast('Delete failed', true);
                  })
                  .catch(function () { toast('Network error', true); });
            });
        });

        // Wire add button
        var addBtn = $('bdAddPhoto');
        if (addBtn) addBtn.addEventListener('click', openAddPhoto);
    }

    function openAddPhoto() {
        var url = prompt('Paste an image URL:\n(Supported: Unsplash, Pexels, Imgur, your own hosted images)');
        if (!url) return;
        url = String(url).trim();
        if (!/^https?:\/\//i.test(url)) { toast('URL must start with http:// or https://', true); return; }
        var caption = prompt('Caption (optional):') || '';
        fetch(API + '/photos', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ url: url, caption: caption.trim() || null })
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
          .then(function (res) {
              if (res.ok) { toast('Photo added ✓'); loadPhotos(); }
              else toast(res.data.error || 'Failed to add photo', true);
          }).catch(function () { toast('Network error', true); });
    }

    // ═══════════════════════════════════════════════════════════════
    // PROMOS — real DB via /api/business/promos
    // ═══════════════════════════════════════════════════════════════

    function loadPromos() {
        var token = getToken();
        if (!token) return;
        fetch(API + '/promos', { headers: authHeaders() })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d) return;
                renderPromosFromBackend(d.promos || []);
            }).catch(function () { /* silent */ });
    }

    function promoStatus(p) {
        if (!p.is_active) return 'ended';
        var now = Date.now();
        var starts = p.starts_at ? new Date(p.starts_at).getTime() : null;
        var ends = p.ends_at ? new Date(p.ends_at).getTime() : null;
        if (starts && starts > now) return 'scheduled';
        if (ends && ends < now) return 'ended';
        return 'active';
    }

    function fmtDate(ts) {
        if (!ts) return '';
        try {
            var d = new Date(ts);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch (_) { return ''; }
    }

    function renderPromosFromBackend(promos) {
        var c = $('bdPromoList'); if (!c) return;
        if (!promos.length) {
            c.innerHTML = '<div style="padding:30px 20px;text-align:center;color:var(--dim);background:rgba(212,175,55,0.04);border:1px dashed rgba(212,175,55,0.2);border-radius:12px;">' +
                '<i class="fas fa-bullhorn" style="font-size:28px;color:var(--gold);margin-bottom:8px;display:block;"></i>' +
                'No promotions yet. Create your first promotion above to feature it on your SceneLink listing.</div>';
            return;
        }
        c.innerHTML = promos.map(function (p) {
            var status = promoStatus(p);
            var dates = (p.starts_at || p.ends_at)
                ? (fmtDate(p.starts_at) + (p.ends_at ? ' – ' + fmtDate(p.ends_at) : ''))
                : 'Ongoing';
            return '<div class="bd-promo" data-promo-id="' + p.id + '">' +
                '<div class="bd-promo-info">' +
                '<h4>' + (p.title || '(untitled)') + '</h4>' +
                '<p>' + (p.description || '') + (p.description ? ' · ' : '') + dates + '</p>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span class="bd-promo-status ' + status + '">' + status.charAt(0).toUpperCase() + status.slice(1) + '</span>' +
                '<button class="sl-promo-del" data-id="' + p.id + '" style="background:transparent;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.6);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;">' +
                '<i class="fas fa-trash"></i></button>' +
                '</div>' +
                '</div>';
        }).join('');
        // Wire delete buttons
        Array.prototype.slice.call(c.querySelectorAll('.sl-promo-del')).forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!confirm('Delete this promotion?')) return;
                var id = btn.dataset.id;
                fetch(API + '/promos/' + encodeURIComponent(id), {
                    method: 'DELETE', headers: authHeaders()
                }).then(function (r) { return r.ok ? r.json() : null; })
                  .then(function (d) {
                      if (d && d.ok) { toast('Promotion deleted'); loadPromos(); }
                      else toast('Delete failed', true);
                  });
            });
        });
    }

    function enhancePromoCreate() {
        var saveBtn = $('bdPromoSave');
        if (!saveBtn || saveBtn.__slEnhanced) return;
        saveBtn.__slEnhanced = true;
        var newBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newBtn, saveBtn);
        newBtn.addEventListener('click', function () {
            var token = getToken();
            if (!token) { toast('Please sign in', true); return; }
            var title = ($('bdPromoTitle') || {}).value || '';
            var start = ($('bdPromoStart') || {}).value || '';
            var end = ($('bdPromoEnd') || {}).value || '';
            var desc = ($('bdPromoDesc') || {}).value || '';
            if (!title.trim()) { toast('Please enter a title', true); return; }

            newBtn.disabled = true;
            var orig = newBtn.innerHTML;
            newBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…';
            fetch(API + '/promos', {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    title: title.trim(),
                    description: desc.trim() || null,
                    starts_at: start ? (start + 'T00:00:00Z') : null,
                    ends_at: end ? (end + 'T23:59:59Z') : null,
                    is_active: true
                })
            }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
              .then(function (res) {
                  newBtn.disabled = false; newBtn.innerHTML = orig;
                  if (res.ok) {
                      toast('Promotion created ✓');
                      // Reset form + close
                      ['bdPromoTitle', 'bdPromoStart', 'bdPromoEnd', 'bdPromoDesc'].forEach(function (id) {
                          var el = $(id); if (el) el.value = '';
                      });
                      var form = $('bdPromoForm'); if (form) form.style.display = 'none';
                      loadPromos();
                  } else {
                      toast(res.data.error || 'Failed to create promotion', true);
                  }
              }).catch(function () {
                  newBtn.disabled = false; newBtn.innerHTML = orig;
                  toast('Network error', true);
              });
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // MULTI-VENUE SWITCHER
    // ═══════════════════════════════════════════════════════════════

    function loadVenueList() {
        var token = getToken();
        if (!token) return;
        fetch(API + '/venues', { headers: authHeaders() })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d) return;
                var venues = d.venues || [];
                populateVenueSwitcher(venues);
                // Show multi-venue UI if user has >1 venue OR is pro/enterprise
                var u = getLocalUser() || {};
                var shouldShow = venues.length > 1 || u.tier === 'enterprise' || u.tier === 'pro';
                var switcher = $('bdVenueSwitcher');
                if (switcher) switcher.style.display = shouldShow ? 'flex' : 'none';
                // If there is a primary, store it as active
                var primary = venues.filter(function (v) { return v.is_primary; })[0] || venues[0];
                if (primary) _activeVenueId = primary.id;
                injectAddVenueButton(u, venues.length);
            })
            .catch(function () { /* silent */ });
    }

    function populateVenueSwitcher(venues) {
        var sel = $('bdVenueSelect');
        if (!sel) return;
        if (!venues.length) {
            sel.innerHTML = '<option value="">No venues yet</option>';
            return;
        }
        sel.innerHTML = venues.map(function (v) {
            var label = v.name + (v.neighborhood ? ' — ' + v.neighborhood : '');
            return '<option value="' + v.id + '"' + (v.is_primary ? ' selected' : '') + '>' + label + '</option>';
        }).join('');
        // Override the inline onchange with a real switch handler
        sel.onchange = function () {
            var venue_id = sel.value;
            if (!venue_id) return;
            fetch(API + '/venues/switch', {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ venue_id: venue_id })
            }).then(function (r) { return r.ok ? r.json() : null; })
              .then(function (d) {
                  if (d && d.ok) {
                      _activeVenueId = venue_id;
                      toast('Switched venue ✓');
                      // Refresh everything for the new active venue
                      hydrateOnLoad();
                      loadPhotos();
                      loadPromos();
                      loadReviews();
                  } else {
                      toast('Switch failed', true);
                  }
              });
        };
    }

    function injectAddVenueButton(u, existingCount) {
        // Allow pro (3) and enterprise (99). Starter tier gets upgrade prompt.
        if ($('bdAddVenueBtn')) return;
        var switcher = $('bdVenueSwitcher');
        if (!switcher) return;
        var btn = document.createElement('button');
        btn.id = 'bdAddVenueBtn';
        btn.className = 'bd-b bd-b-o';
        btn.style.cssText = 'padding:6px 12px;font-size:12px;margin-left:auto;';
        btn.innerHTML = '<i class="fas fa-plus"></i> Add Venue';
        switcher.appendChild(btn);
        btn.addEventListener('click', function () {
            var tier = (u && u.tier) || 'starter';
            var maxAllowed = tier === 'enterprise' ? 99 : (tier === 'pro' ? 3 : 1);
            if (existingCount >= maxAllowed) {
                toast('Your ' + tier + ' plan allows ' + maxAllowed + ' venue(s). Upgrade to add more.', true);
                return;
            }
            var name = prompt('Venue name:');
            if (!name || !name.trim()) return;
            var address = prompt('Address (optional):') || '';
            var neighborhood = prompt('Neighborhood (optional):') || '';
            var type = prompt('Type (restaurant, bar, lounge, nightclub, etc.):') || 'restaurant';
            fetch(API + '/venues/add', {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    name: name.trim(),
                    address: address.trim() || null,
                    neighborhood: neighborhood.trim() || null,
                    type: type.trim().toLowerCase(),
                    city: 'Boston'
                })
            }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
              .then(function (res) {
                  if (res.ok) {
                      toast('Venue added ✓');
                      loadVenueList();
                  } else {
                      toast(res.data.error || 'Failed to add venue', true);
                  }
              });
        });
    }

    // ── Boot ────────────────────────────────────────────────────────
    function boot() {
        enhanceLogout();
        enhanceSaveHandler();
        enhancePromoCreate();
        if (getToken()) {
            hydrateOnLoad();
            setTimeout(function () { loadReviews(); }, 600);
            setTimeout(function () { loadPhotos(); }, 800);
            setTimeout(function () { loadPromos(); }, 900);
            setTimeout(function () { loadVenueList(); }, 1000);
        }
    }

    // Public API for inline handlers to call after login/claim
    window.SLBizApp = {
        reload: function () {
            if (!getToken()) return;
            hydrateOnLoad();
            setTimeout(loadReviews, 200);
            setTimeout(loadPhotos, 300);
            setTimeout(loadPromos, 400);
            setTimeout(loadVenueList, 500);
        },
        loadPhotos: loadPhotos,
        loadPromos: loadPromos,
        loadVenueList: loadVenueList,
        loadReviews: loadReviews,
        hydrate: hydrateOnLoad
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 50);
    }
})();