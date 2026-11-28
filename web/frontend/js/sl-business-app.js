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
    const access = window.SLBizAccess;
    let operator = {};
    let originalFields = null;
    let reportGeneration = 0;
    let switchInFlight = false;
    let switchNeedsReload = false;
    let venueListGeneration = 0;
    let listingSaveInFlight = false;
    const getToken = access.token;
    const getLocalUser = () => operator;
    const setLocalUser = value => { operator = value; };
    const esc = value => String(value ?? '').replace(/[&<>"']/g,
        c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
    async function businessFetch(url, options) {
        const token = getToken();
        if (!token) throw Error('Business sign-in required.');
        if (operator.venue_id && /\/(?:photos|promos|reviews)(?:\/|$)/.test(url) && !url.includes('?')) {
            url += '?venue_id=' + encodeURIComponent(operator.venue_id);
        }
        const response = await window.fetch(url, {...options,cache:'no-store'});
        if (token !== getToken()) throw Error('The business account changed.');
        if (response.status === 401) { access.restore(); throw Error('Sign in again.'); }
        return response;
    }
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
        el.setAttribute('role', isError ? 'alert' : 'status');
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
        setVal('bdEditHours', v.hours_display || '');
        setVal('bdEditAddr', v.address || '');
        setVal('bdEditNhood', v.neighborhood || '');
        setVal('bdEditPhone', v.phone || '');
        setVal('bdEditWeb', v.website || '');
        setVal('bdEditResy', v.resy_url || '');
        setVal('bdEditOpentable', v.opentable_url || '');
        setVal('bdEditReservation', v.reservation_url || '');
        // Show stored values, including legacy categories outside the standard options.
        for (const [id,value] of [['bdEditCat',v.type],['bdEditDress',v.dress_code]]) {
            const select = $(id);
            const text = String(value || '');
            let option = [...select.options].find(o => o.value.toLowerCase() === text.toLowerCase());
            if (!option) { option = new Option(text,text); select.add(option); }
            select.value = option.value;
        }
        const price = Number(v.price_level);
        $('bdEditPrice').value = Number.isInteger(price) && price >= 1 && price <= 4 ? '$'.repeat(price) : '';
        originalFields = collectFormPayload();
        // Update the visible venue card
        setText('bdVName', v.name || 'Your Venue');
        var meta = [v.type, v.neighborhood].filter(Boolean).join(' · ');
        if (meta) setText('bdVMeta', meta);
        var rEl = $('bdVRating');
        if (rEl) {
            if (v.is_active !== true && v.needs_manual_review === true) {
                rEl.textContent = 'Pending review · Not publicly visible';
            } else if (v.rating && Number(v.rating) > 0) {
                rEl.innerHTML = '<i class="fas fa-star" style="color:var(--gold)"></i> ' +
                    Number(v.rating).toFixed(1) + ' · ' + (v.review_count || 0) + ' reviews';
            } else {
                rEl.textContent = v.is_active === true ? 'Active listing' : (v.is_active === false ? 'Inactive listing' : 'Linked listing');
            }
        }
    }

    function showAccount(user) {
        operator = {email:user.email, venueName:user.venue_name, venue_id:user.venue_id, tier:user.tier};
        _activeVenueId = user.venue_id;
        switchInFlight = false;
        switchNeedsReload = false;
        listingSaveInFlight = false;
        $('bdVenueSelect').value = '';
        $('bdSwitchConfirmation').hidden = true;
        $('bdSwitchStatus').textContent = '';
        setText('bdCurrentLocation', user.venue ? 'Now managing '+user.venue.name : 'No active location');
        applyLocationControlState();
        originalFields = null;
        if (user.venue) prefillFromVenue(user.venue);
        if (!user.venue_id) injectCreateListingUI();
        else $('bdCreateListingBtn')?.parentElement.remove();
        $('bdSaveListing').disabled = !user.venue;
        const view = $('bdViewListing');
        view.hidden = !user.venue_id || user.venue?.is_active !== true;
        if (!view.hidden) view.href = '/explore?venue=' + encodeURIComponent(user.venue_id);
        loadReport(30, true);
        loadReviews();
        loadPhotos();
        loadPromos();
        loadVenueList();
    }

    async function loadReport(days, overview) {
        const venueId = operator.venue_id;
        const token = getToken();
        const sequence = overview ? 0 : ++reportGeneration;
        const ids = overview ? ['bdStatViews','bdStatSaves','bdStatPlans','bdStatClicks']
            : ['bdAnalViews','bdAnalSaves','bdAnalCheckins','bdAnalRating'];
        const status = $(overview ? 'bdStatsStatus' : 'bdAnalEmpty');
        const current = () => token === getToken() && venueId === operator.venue_id &&
            (overview || sequence === reportGeneration);
        ids.forEach(id => setText(id, '—'));
        status.style.display = 'block';
        status.textContent = venueId ? 'Loading recorded activity…' : 'A linked venue is needed for reporting.';
        if (!venueId || !token) return;
        try {
            const response = await businessFetch(API+'/listings/'+encodeURIComponent(venueId)+'/analytics?days='+days, {headers:authHeaders()});
            const data = await response.json();
            if (!current()) return;
            const labels = {view:'Listing views', save:'Save events', plan_add:'Plan adds', website_click:'Website clicks',
                checkin:'Check-in events', review_post:'Review posts', booking_click:'Booking-link clicks'};
            const keys = data.metrics;
            if (!response.ok || !data.ok || data.venue_id !== venueId || data.window_days !== days ||
                !Array.isArray(keys) || keys.length !== ids.length || !keys.every(key => Object.hasOwn(labels,key)) ||
                !keys.every(key => Number.isInteger(data.counts?.[key]) && data.counts[key] >= 0)) throw Error();
            keys.forEach((key,i) => {
                const metric = $(ids[i]);
                metric.previousElementSibling.textContent = labels[key];
                metric.textContent = data.counts[key].toLocaleString();
            });
            status.textContent = data.total === 0 ? 'No activity recorded in this period.' : '';
        } catch (_) {
            if (current()) status.textContent = 'Activity is unavailable. Retry to check again.';
        }
    }
    window.setAnalyticsRange = function(button, range) {
        const days = {today:1, week:7, month:30, quarter:90}[range] || 30;
        document.querySelectorAll('.bd-range-btn').forEach(b => b.classList.toggle('active',
            button ? b === button : b.textContent.trim() === 'Month'));
        setText('bdAnalTitle', days === 1 ? 'Last 24 hours' : 'Last '+days+' days');
        loadReport(days, false);
    };

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
            'Fill the form above to submit your listing for review. It stays private until approved. ' +
            'You can keep editing it with "Save Changes" while it is pending.</div>' +
            '<button class="bz-btn bz-btn-gold" id="bdCreateListingBtn" type="button">' +
            '<i class="fas fa-plus-circle"></i> Submit listing for review</button>';
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
            hours_display: $('bdEditHours').value.trim() || null,
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
        if (btn?.disabled) return;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…'; }
        businessFetch(API + '/venue', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(payload)
        })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
            .then(function (res) {
                if (!res.ok) {
                    toast(res.data.error || 'Failed to create listing', true);
                    if (btn) { btn.disabled = false; btn.textContent = 'Submit listing for review'; }
                    return;
                }
                if (!res.data.ok || res.data.pending_review !== true || !res.data.venue?.id ||
                    res.data.venue.is_active !== false || res.data.venue.needs_manual_review !== true) {
                    toast('Listing review status was not confirmed. Reload to check before retrying.', true);
                    if (btn) { btn.disabled=false; btn.textContent='Submit listing for review'; }
                    return;
                }
                toast('Listing saved for review. You can keep editing it.');
                // Sync local state
                var u = getLocalUser() || {};
                u.venue_id = res.data.venue.id;
                u.venueName = res.data.venue.name;
                setLocalUser(u);
                prefillFromVenue(res.data.venue);
                // Remove the create button, the inline save button now handles edits
                var wrap = btn ? btn.parentNode : null;
                if (wrap) wrap.remove();
                access.restore();
            })
            .catch(function () {
                toast('Network error. Please try again.', true);
                if (btn) { btn.disabled = false; btn.textContent = 'Submit listing for review'; }
            });
    }

    // ── Enhanced Save: sends ALL fields via PATCH ──────────────────
    function enhanceSaveHandler() {
        var saveBtn = $('bdSaveListing');
        if (!saveBtn || saveBtn.__slEnhanced) return;
        saveBtn.__slEnhanced = true;
        var newBtn = saveBtn;
        newBtn.addEventListener('click', function () {
            var token = getToken();
            var u = getLocalUser() || {};
            if (!token || !u.venue_id) {
                toast('No linked listing. Use "Create Listing" above.', true);
                return;
            }
            if (newBtn.disabled || !originalFields || switchInFlight || switchNeedsReload) return;
            const allFields = collectFormPayload();
            const payload = Object.fromEntries(Object.entries(allFields).filter(([key,value]) => originalFields[key] !== value));
            if (!Object.keys(payload).length) { toast('No changes to save.'); return; }
            if ('name' in payload && !payload.name) { toast('Enter a venue name.',true); return; }
            const venueId = u.venue_id;
            newBtn.disabled = true;
            listingSaveInFlight = true;
            applyLocationControlState();
            var orig = newBtn.innerHTML;
            newBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
            businessFetch(API + '/venue?venue_id=' + encodeURIComponent(venueId), {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({...payload, expected_active_venue_id:venueId})
            })
                .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
                .then(function (res) {
                    newBtn.disabled = false; newBtn.innerHTML = orig;
                    if (!res.ok) {
                        if (res.status === 409) {
                            switchNeedsReload = true;
                            setText('bdSwitchStatus', 'The active location changed in another tab. Copy any unsaved edits before reloading.');
                        }
                        toast(res.data.error || 'Save failed', true);
                        return;
                    }
                    if (!res.data.ok || res.data.venue?.id !== venueId || !Object.entries(payload).every(([key,value]) =>
                        String(res.data.venue[key] ?? '') === String(value ?? ''))) {
                        toast('The server did not confirm these changes. Check the listing and retry.', true);
                        return;
                    }
                    toast('Listing changes saved.');
                    // Sync local UI
                    u.venueName = payload.name || u.venueName;
                    setLocalUser(u);
                    setText('bdVName', u.venueName);
                    const inProgress = collectFormPayload();
                    const laterEdits = Object.keys(inProgress).some(key => inProgress[key] !== allFields[key]);
                    if (laterEdits) originalFields = allFields;
                    else prefillFromVenue(res.data.venue);
                })
                .catch(function () {
                    newBtn.disabled = false; newBtn.innerHTML = orig;
                    toast('Save could not be confirmed. Reload the listing to check.', true);
                }).finally(function () { listingSaveInFlight = false; applyLocationControlState(); });
        });
    }

    // ── Load real reviews from /api/business/reviews ───────────────
    function loadReviews() {
        var token = getToken();
        if (!token) return;
        const venueId = operator.venue_id;
        businessFetch(API + '/reviews', { headers: authHeaders() })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (token !== getToken() || venueId !== operator.venue_id) return;
                if (!Array.isArray(d?.reviews) || (venueId && d.venue_id !== venueId)) throw Error();
                var c = $('bdReviewsList'); if (!c) return;
                var reviews = d.reviews || [];
                const sort = $('bdReviewSort').selectedIndex;
                if (sort) reviews.sort((a,b) => sort === 1 ? b.rating-a.rating : a.rating-b.rating);
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
                        '<div><span class="bd-review-u">' + esc(r.user_display_name || r.username || 'Guest') + '</span> ' + stars + '</div>' +
                        '<div class="bd-review-t">' + timeAgo(r.created_at) + '</div>' +
                        '</div>' +
                        '<div class="bd-review-txt">' + esc(r.content || r.text || '') + '</div>' +
                        '</div>';
                }).join('');
            })
            .catch(function () {
                if (token === getToken() && venueId === operator.venue_id)
                    setText('bdReviewsList','Reviews unavailable. Reopen Reviews to retry.');
            });
    }

    function timeAgo(ts) {
        if (!ts) return '';
        var d = new Date(ts), now = Date.now(), diff = Math.round((now - d.getTime()) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.round(diff / 60) + 'm ago';
        if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
        return Math.round(diff / 86400) + 'd ago';
    }

    // ═══════════════════════════════════════════════════════════════
    // PHOTOS — real DB via /api/business/photos
    // ═══════════════════════════════════════════════════════════════
    var _activeVenueId = null;  // primary/active venue_id

    function loadPhotos() {
        var token = getToken();
        if (!token) return;
        var qs = _activeVenueId ? '?venue_id=' + encodeURIComponent(_activeVenueId) : '';
        businessFetch(API + '/photos' + qs, { headers: authHeaders() })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!Array.isArray(d?.photos)) throw Error();
                renderPhotosFromBackend(d.photos);
            })
            .catch(function () { setText('bdPhotosGrid','Gallery unavailable. Reopen Photos to retry.'); });
    }

    function renderPhotosFromBackend(photos) {
        var c = $('bdPhotosGrid'); if (!c) return;
        var u = getLocalUser() || {};
        var max = u.tier === 'starter' ? 10 : 99;
        var countEl = $('bdPhotoCount');
        if (countEl) countEl.textContent = '(' + photos.length + '/' + max + ')';

        var html = photos.map(function (p) {
            return '<div class="bd-photo" data-photo-id="' + esc(p.id) + '">' +
                '<img src="' + esc(p.url) + '" alt="' + esc(p.caption || 'Venue photo') + '">' +
                '<button class="bd-photo-del sl-photo-del" data-id="' + esc(p.id) + '" title="Delete">' +
                '<i class="fas fa-times"></i></button>' +
                '</div>';
        }).join('');
        if (photos.length < max) {
            html += '<button type="button" class="bd-photo add" id="bdAddPhoto" aria-label="Add a venue photo"><i class="fas fa-plus"></i></button>';
        }
        c.innerHTML = html;

        // Wire delete buttons
        Array.prototype.slice.call(c.querySelectorAll('.sl-photo-del')).forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!confirm('Delete this photo? This cannot be undone.')) return;
                var id = btn.dataset.id;
                businessFetch(API + '/photos/' + encodeURIComponent(id), {
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
        $('bdPhotoForm').hidden = false;
        setText('bdPhotoStatus','');
        $('bdPhotoURL').focus();
    }
    function closePhotoForm() {
        $('bdPhotoForm').reset();
        $('bdPhotoForm').hidden = true;
        $('bdAddPhoto')?.focus();
    }
    async function savePhoto(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('[type=submit]');
        if (button.disabled || !form.reportValidity()) return;
        const url = $('bdPhotoURL').value.trim();
        if (new URL(url).protocol !== 'https:') {
            setText('bdPhotoStatus','Enter an HTTPS photo URL.');
            return;
        }
        button.disabled = true;
        $('bdPhotoCancel').disabled = true;
        try {
            const response = await businessFetch(API+'/photos', {method:'POST',headers:authHeaders(),
                body:JSON.stringify({url,caption:$('bdPhotoCaption').value.trim() || null})});
            const result = await response.json();
            if (!response.ok || !result.ok || !result.photo?.id || result.photo.url !== url) {
                throw Error(result.error || 'The new photo could not be confirmed.');
            }
            closePhotoForm();
            toast('Photo saved.');
            loadPhotos();
        } catch (error) { setText('bdPhotoStatus', error.message || 'Photo could not be confirmed.'); }
        finally { button.disabled = false; $('bdPhotoCancel').disabled = false; }
    }

    // ═══════════════════════════════════════════════════════════════
    // PROMOS — real DB via /api/business/promos
    // ═══════════════════════════════════════════════════════════════

    function loadPromos() {
        var token = getToken();
        if (!token) return;
        businessFetch(API + '/promos', { headers: authHeaders() })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!Array.isArray(d?.promos)) throw Error();
                renderPromosFromBackend(d.promos);
            }).catch(function () { setText('bdPromoList','Promotions unavailable. Reopen Promotions to retry.'); });
    }

    function promoStatus(p) {
        if (!p.is_active) return 'paused';
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
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone:'America/New_York' });
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
            return '<div class="bd-promo" data-promo-id="' + esc(p.id) + '">' +
                '<div class="bd-promo-info">' +
                '<h4>' + esc(p.title || '(untitled)') + '</h4>' +
                '<p>' + esc(p.description || '') + (p.description ? ' · ' : '') + dates + '</p>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span class="bd-promo-status ' + status + '">' + status.charAt(0).toUpperCase() + status.slice(1) + '</span>' +
                '<button class="bd-b bd-b-o sl-promo-state" type="button" data-id="' + esc(p.id) + '" data-active="' +
                    Boolean(p.is_active) + '">' + (p.is_active ? 'Pause' : 'Resume') + '</button>' +
                '<button class="sl-promo-del" data-id="' + esc(p.id) + '" style="background:transparent;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.6);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;">' +
                '<i class="fas fa-trash"></i></button>' +
                '</div>' +
                '</div>';
        }).join('');
        // Wire delete buttons
        c.querySelectorAll('.sl-promo-state').forEach(button => button.addEventListener('click', async () => {
            if (button.disabled) return;
            button.disabled = true;
            const active = button.dataset.active !== 'true';
            try {
                const response = await businessFetch(API+'/promos/'+encodeURIComponent(button.dataset.id), {
                    method:'PATCH', headers:authHeaders(), body:JSON.stringify({is_active:active})
                });
                const data = await response.json();
                if (!response.ok || !data.ok || data.promo?.id !== button.dataset.id || data.promo.is_active !== active)
                    throw Error('Promotion status was not confirmed.');
                toast(active ? 'Promotion resumed.' : 'Promotion paused.');
                loadPromos();
            } catch (error) { toast(error.message,true); }
            finally { button.disabled = false; }
        }));

        Array.prototype.slice.call(c.querySelectorAll('.sl-promo-del')).forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!confirm('Delete this promotion?')) return;
                var id = btn.dataset.id;
                businessFetch(API + '/promos/' + encodeURIComponent(id), {
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
            if (newBtn.disabled) return;
            if (!title.trim()) { toast('Please enter a title', true); return; }
            if (start && end && end < start) { toast('End date must be on or after the start date.',true); return; }

            newBtn.disabled = true;
            var orig = newBtn.innerHTML;
            newBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…';
            businessFetch(API + '/promos', {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    title: title.trim(),
                    description: desc.trim() || null,
                    starts_at: start ? (start + ' 00:00:00 America/New_York') : null,
                    ends_at: end ? (end + ' 23:59:59.999999 America/New_York') : null,
                    is_active: true
                })
            }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
              .then(function (res) {
                  newBtn.disabled = false; newBtn.innerHTML = orig;
                  if (res.ok && res.data.ok && res.data.promo?.id) {
                      toast('Promotion created.');
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
        const token = getToken();
        const sequence = ++venueListGeneration;
        if (!token) return;
        const relevant = () => token === getToken() && sequence === venueListGeneration && !switchInFlight;
        businessFetch(API + '/venues', { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(function (data) {
                if (!relevant()) return;
                if (!Array.isArray(data?.venues)) throw Error('Unable to load locations.');
                const venues = data.venues;
                const shouldShow = venues.length > 1 || operator.tier === 'enterprise' || operator.tier === 'pro';
                $('bdVenueSwitcher').hidden = !shouldShow;
                populateVenueSwitcher(venues);
                injectAddVenueButton(operator, venues.length);
            })
            .catch(function () {
                if (!relevant() || !['enterprise','pro'].includes(operator.tier)) return;
                $('bdVenueSwitcher').hidden = false;
                $('bdVenueSelect').replaceChildren(new Option('Locations unavailable', ''));
                setText('bdSwitchStatus', 'Could not load locations. Reload the dashboard to retry.');
                applyLocationControlState();
            });
    }

    function populateVenueSwitcher(venues) {
        const select = $('bdVenueSelect');
        const pending = select.value;
        select.replaceChildren(...venues.map(v => new Option([v.name, v.neighborhood || v.city].filter(Boolean).join(' · '), v.id)));
        if (!venues.length) select.append(new Option('No locations yet', ''));
        select.value = venues.some(v => v.id === pending) ? pending : operator.venue_id || '';
        if (select.selectedIndex < 0) select.prepend(new Option('Choose a location', '', true, true));
        applyLocationControlState();
    }

    function applyLocationControlState() {
        const select = $('bdVenueSelect');
        select.disabled = switchInFlight || switchNeedsReload;
        $('bdVenueSwitcher').setAttribute('aria-busy', String(switchInFlight));
        $('panel-listing').toggleAttribute('inert', switchInFlight);
        $('bdDiscardAndSwitch').disabled = switchInFlight || listingSaveInFlight || switchNeedsReload;
        $('bdSwitchLocation').disabled = select.disabled || listingSaveInFlight || !select.value || select.value === operator.venue_id;
        if (switchInFlight || switchNeedsReload) $('bdSaveListing').disabled = true;
    }

    async function switchLocation(discard) {
        const select = $('bdVenueSelect');
        const status = $('bdSwitchStatus');
        const confirm = $('bdSwitchConfirmation');
        const venue_id = select.value;
        if (switchInFlight || switchNeedsReload || listingSaveInFlight || !getToken() || !venue_id || venue_id === operator.venue_id) return;
        const fields = collectFormPayload();
        if (!discard && originalFields && Object.keys(fields).some(key => fields[key] !== originalFields[key])) {
            confirm.hidden = false;
            $('bdKeepEditing').focus();
            return;
        }
        const token = getToken();
        switchInFlight = true;
        confirm.hidden = true;
        applyLocationControlState();
        status.textContent = 'Opening location…';
        try {
            const response = await businessFetch(API + '/venues/switch', {
                method:'POST', headers:authHeaders(),
                body:JSON.stringify({venue_id, expected_active_venue_id:operator.venue_id ?? null})
            });
            const data = await response.json().catch(() => null);
            if (token !== getToken()) return;
            if (response.status === 409) {
                switchNeedsReload = true;
                status.textContent = 'The active location changed in another tab. Your draft is still here. Copy any unsaved edits before reloading.';
                return;
            }
            if (!response.ok || !data?.ok || data.active_venue_id !== venue_id) {
                status.textContent = 'The switch wasn’t confirmed. You are still viewing the original dashboard and your edits have been kept.';
                return;
            }
            status.textContent = 'Location confirmed. Loading its dashboard…';
            switchNeedsReload = true;
            // A fresh authenticated dashboard fetches every location-scoped view.
            window.location.reload();
        } catch (_) {
            if (token === getToken()) status.textContent = 'The switch wasn’t confirmed. Your edits have been kept.';
        } finally {
            if (token !== getToken()) return;
            switchInFlight = false;
            if (!switchNeedsReload) {
                select.value = operator.venue_id || '';
                $('bdSaveListing').disabled = !originalFields;
                select.focus();
            }
            applyLocationControlState();
        }
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
            businessFetch(API + '/venues/add', {
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
                  if (res.ok && res.data.ok && res.data.pending_review === true && res.data.venue?.id &&
                      res.data.venue.is_active === false && res.data.venue.needs_manual_review === true) {
                      toast('Venue saved for review. It is not publicly visible.');
                      if (!operator.venue_id) access.restore();
                      else loadVenueList();
                  } else {
                      toast(res.data.error || 'Venue review status was not confirmed. Reload to check before retrying.', true);
                  }
              });
        });
    }

    // Only validated business accounts can initialize the dashboard.
    window.SLBizApp = {showAccount, loadPhotos, loadPromos, loadReviews, loadVenueList};
    function boot() {
        $('bdPhotoForm').addEventListener('submit',savePhoto);
        $('bdPhotoCancel').addEventListener('click',closePhotoForm);
        $('bdLogout').addEventListener('click', access.logout);
        $('bdVenueSelect').addEventListener('change', () => {
            $('bdSwitchConfirmation').hidden = true;
            setText('bdSwitchStatus','');
            applyLocationControlState();
        });
        $('bdSwitchLocation').addEventListener('click', () => switchLocation(false));
        $('bdDiscardAndSwitch').addEventListener('click', () => switchLocation(true));
        $('bdKeepEditing').addEventListener('click', () => {
            $('bdSwitchConfirmation').hidden = true;
            $('bdVenueSelect').value = operator.venue_id || '';
            document.querySelector('[data-panel="listing"]').click();
            $('bdEditName').focus();
            applyLocationControlState();
        });
        for (const [panel,load] of Object.entries({photos:loadPhotos,reviews:loadReviews,promotions:loadPromos})) {
            document.querySelector('[data-panel="'+panel+'"]').addEventListener('click',load);
        }
        $('bdReviewSort').addEventListener('change', loadReviews);
        $('bdStatsRetry').addEventListener('click', () => loadReport(30, true));
        enhanceSaveHandler();
        enhancePromoCreate();
        access.restore();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
    else boot();
})();
