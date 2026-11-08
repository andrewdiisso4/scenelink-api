/* ══════════════════════════════════════════════════════════
   SceneLink — Right-Side Venue Panel
   Bidirectional sync with map markers
   ══════════════════════════════════════════════════════════ */
(function(){
    'use strict';
function slEsc(value){return window.SLConnected.esc(value);}

    var retries = 0;
    function init(){
        var data = window.__slExploreData;
        if(!data){
            if(++retries < 50) return setTimeout(init, 300);
            return;
        }

        // Wait for venues to be available (explore-premium.js sets getVenues/getFiltered)
        var venues = (typeof data.getVenues === 'function') ? data.getVenues() : (data.venues || []);
        var filtered = (typeof data.getFiltered === 'function') ? data.getFiltered() : (data.filtered || []);

        if(!venues.length && !filtered.length){
            if(++retries < 50) return setTimeout(init, 300);
            return;
        }

        var panel = document.getElementById('slRightPanel');
        if(!panel) return;

        var cardsContainer = document.getElementById('slRightPanelCards');
        var countEl = document.getElementById('slRightPanelCount');
        if(!cardsContainer) return;

        // Build card HTML for a venue
        function buildCard(v){
            var img = v.thumbnail_url || v.cover_image_url || v.image_url || v.img || (v.image_urls && v.image_urls[0]) ||
                      '/assets/img/placeholder-venue.svg';
            var name = v.name || 'Venue';
            var type = v.type || v.cat || 'Venue';
            // No imported ratings or derived attendance without provenance.
            var hood = v.neighborhood || v.city || v.location || 'Location not provided';
            var saved = window._slSavedVenues && window._slSavedVenues[v.id];
            var heartClass = saved ? 'sl-rp-save saved' : 'sl-rp-save';
            var heartIcon = saved ? 'fas fa-heart' : 'far fa-heart';

            return '<div class="sl-rp-card" data-venue-id="'+slEsc(v.id)+'">' +
                '<img class="sl-rp-card-img" src="'+slEsc(img)+'" alt="'+slEsc(name)+'" loading="lazy" onerror="SL_IMG_FALLBACK(this,\'venue\')">' +
                '<div class="sl-rp-card-body">' +
                    '<div class="sl-rp-card-name">'+slEsc(name)+'</div>' +
                    '<div class="sl-rp-card-meta">' +
                        '<span>'+slEsc(hood)+'</span>' +
                    '</div>' +
                    '<div class="sl-rp-card-type">'+slEsc(type)+'</div>' +
                    '<div class="sl-rp-card-actions">' +
                        '<button class="sl-rp-detail" data-id="'+slEsc(v.id)+'"><i class="fas fa-eye"></i> View</button>' +
                        (window.SLConnected.safeUrl(v.website)
                            ? '<button class="sl-rp-website" data-id="'+slEsc(v.id)+'" data-url="'+slEsc(window.SLConnected.safeUrl(v.website))+'"><i class="fas fa-globe"></i> Venue website (info)</button>'
                            : '') +
                        '<button class="'+heartClass+'" data-id="'+slEsc(v.id)+'"><i class="'+heartIcon+'"></i></button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }

        // Render cards from the shared filtered array
        function renderCards(){
            var f = (typeof data.getFiltered === 'function') ? data.getFiltered() : (data.filtered || []);
            // Preserve genuine empty filters; never substitute popular-looking venues.
            f = f.slice().sort(function(a,b){ return String(a.name || '').localeCompare(String(b.name || '')); });
            var html = '';
            for(var i = 0; i < f.length; i++){
                html += buildCard(f[i]);
            }
            var state = data.getStatus ? data.getStatus() : {total:f.length};
            var empty = state.loading ? 'Loading matching venues…' : state.error ? 'Venue service unavailable. Retry in the list.' : 'No venues match current filters';
            cardsContainer.innerHTML = html || '<p role="status" style="padding:20px;text-align:center;color:#b8b8c1;font-size:13px;">'+empty+'</p>';
            if(countEl) countEl.textContent = state.loading ? 'Loading…' : f.length + ' of ' + state.total + ' matching venues';

            // Highlight active card if any
            var aid = typeof data.getActiveId === 'function' ? data.getActiveId() : null;
            if(aid) highlightCard(aid);
        }

        // Highlight a specific card
        function highlightCard(id){
            var cards = cardsContainer.querySelectorAll('.sl-rp-card');
            for(var i = 0; i < cards.length; i++){
                var c = cards[i];
                c.classList.toggle('active', c.dataset.venueId === id);
                if(c.dataset.venueId === id){
                    c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }

        // Click handler for cards — sync with map
        cardsContainer.addEventListener('click', function(e){
            var card = e.target.closest('.sl-rp-card');
            if(!card) return;
            var venueId = card.dataset.venueId;

            // Save/Favorite button
            var saveBtn = e.target.closest('.sl-rp-save');
            if(saveBtn){
                e.stopPropagation();
                var sid = saveBtn.dataset.id;
                if(!window._slSavedVenues) window._slSavedVenues = {};
                var allVenues = (typeof data.getVenues === 'function') ? data.getVenues() : (data.venues || []);
                var sv = allVenues.find(function(x){ return x.id === sid; });
                var icon = saveBtn.querySelector('i');
                if(!window._slSavedVenues[sid]){
                    window._slSavedVenues[sid] = {
                        id: sid,
                        name: sv ? sv.name : sid,
                        type: sv ? (sv.type || '') : '',
                        img: sv ? (sv.thumbnail_url || sv.cover_image_url || sv.image_url || sv.img || '') : '',
                        time: Date.now()
                    };
                    saveBtn.classList.add('saved');
                    if(icon) icon.className = 'fas fa-heart';
                    rpToast('💛 Saved to Favorites');
                    // API sync
                    if(window.SLApi && window.SLApi.isLoggedIn()) window.SLApi.toggleFavorite(sid).catch(function(){});
                } else {
                    delete window._slSavedVenues[sid];
                    saveBtn.classList.remove('saved');
                    if(icon) icon.className = 'far fa-heart';
                    rpToast('Removed from Favorites');
                    if(window.SLApi && window.SLApi.isLoggedIn()) window.SLApi.toggleFavorite(sid).catch(function(){});
                }
                localStorage.setItem('sl_saved_venues', JSON.stringify(window._slSavedVenues));
                window.dispatchEvent(new Event('sl-lists-changed'));
                return;
            }

            // Detail button — open full venue detail
            var detailBtn = e.target.closest('.sl-rp-detail');
            if(detailBtn){
                e.stopPropagation();
                var did = detailBtn.dataset.id;
                var allV = (typeof data.getVenues === 'function') ? data.getVenues() : (data.venues || []);
                var dv = allV.find(function(x){ return x.id === did; });
                if(window.SLVenueDetail) window.SLVenueDetail.open(dv ? (dv.slug || did) : did);
                return;
            }

            // Old cached reserve controls route to in-site capability, never an external handoff.
            var reserveBtn = e.target.closest('.sl-rp-reserve');
            if(reserveBtn){
                e.stopPropagation();
                var rid = reserveBtn.dataset.id;
                var allV2 = (typeof data.getVenues === 'function') ? data.getVenues() : (data.venues || []);
                var rv = allV2.find(function(x){ return x.id === rid; });
                if(window.SLVenueDetail) window.SLVenueDetail.open(rv ? (rv.slug || rid) : rid);
                return;
            }

            // Website button — opens the venue's website in a new tab
            var websiteBtn = e.target.closest('.sl-rp-website');
            if(websiteBtn){
                e.stopPropagation();
                var wUrl = window.SLConnected.safeUrl(websiteBtn.dataset.url);
                if (wUrl) { window.open(wUrl, '_blank', 'noopener,noreferrer'); return; }
            }

            // View button (fallback when no reservation + no website) — open venue detail
            var viewOnlyBtn = e.target.closest('.sl-rp-view');
            if(viewOnlyBtn){
                e.stopPropagation();
                var vid = viewOnlyBtn.dataset.id;
                var allV3 = (typeof data.getVenues === 'function') ? data.getVenues() : (data.venues || []);
                var vvv = allV3.find(function(x){ return x.id === vid; });
                if(window.SLVenueDetail) window.SLVenueDetail.open(vvv ? (vvv.slug || vid) : vid);
                return;
            }

            // Click card body — sync with map
            if(data.showVenue){
                try { data.showVenue(venueId); } catch(ex){}
            }
            highlightCard(venueId);
        });

        // Refresh as soon as directory state changes; retain a compatibility poll for older modules.
        document.defaultView.addEventListener('sl-venues-changed', renderCards);
        var lastSignature = '';
        setInterval(function(){
            var filtered = data.getFiltered ? data.getFiltered() : (data.filtered || []);
            var signature = filtered.map(function(venue){return venue.id;}).join(',') + JSON.stringify(data.getStatus ? data.getStatus() : {});
            if(signature !== lastSignature){lastSignature=signature;renderCards();}
        }, 400);

        // Initial render
        renderCards();
    }

    function rpToast(msg){
        var t = document.createElement('div');
        t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(212,175,55,0.95);color:#0a0a0a;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700;z-index:999999;pointer-events:none;white-space:nowrap;';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity 0.3s'; }, 2200);
        setTimeout(function(){ if(t.parentNode) t.remove(); }, 2500);
    }

    // Start after DOM ready
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 1000); });
    } else {
        setTimeout(init, 1000);
    }
})();