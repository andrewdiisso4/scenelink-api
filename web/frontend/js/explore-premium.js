/**
 * SceneLink Explore - Premium App Engine (LIVE API VERSION)
 * Fetches real venue data from /api/venues
 */
(function(){
'use strict';
function slEsc(value){return window.SLConnected.esc(value);}

// ═══════════════ STATE ═══════════════
var allVenues = [];  // full list from API
var filtered = [];   // after filters
var map, markers=[], activeId=null, mapViewInteracted=false, mapViewportEstablished=false, pendingMapSelection=null;
var currentView='map', activeChip='all', activeCuisine='all', searchQ='';
var filterState={vibe:'',neighborhood:'',price_level:''};

var catIcons = {
    restaurant:{icon:'fa-utensils', cls:'cat-restaurant'},
    bar:       {icon:'fa-cocktail', cls:'cat-lounge'},
    lounge:    {icon:'fa-cocktail', cls:'cat-lounge'},
    nightclub: {icon:'fa-fire',     cls:'cat-hot'},
    club:      {icon:'fa-fire',     cls:'cat-hot'},
    music:     {icon:'fa-music',    cls:'cat-music'},
    live_music:{icon:'fa-music',    cls:'cat-music'},
    event:     {icon:'fa-star',     cls:'cat-featured'},
    default:   {icon:'fa-map-marker-alt', cls:'cat-lounge'}
};

function getCatIcon(v){
    var t = (v.type||'').toLowerCase();
    if(t.indexOf('restaurant')!==-1||t.indexOf('dining')!==-1) return catIcons.restaurant;
    if(t.indexOf('nightclub')!==-1||t.indexOf('club')!==-1) return catIcons.nightclub;
    if(t.indexOf('music')!==-1||t.indexOf('live')!==-1) return catIcons.music;
    if(t.indexOf('bar')!==-1||t.indexOf('lounge')!==-1) return catIcons.bar;
    return catIcons[t] || catIcons.default;
}

function getPriceLabel(level){
    if(!level) return '';
    return '$'.repeat(Math.max(1,Math.min(4,parseInt(level))));
}

// ═══════════════ API FETCH ═══════════════
// Recovered candidate: server-side search with bounded, explicit pagination.
var venueLoadState = { total: 0, offset: 0, more: false, error: false, loading: false, generation: 0 };
async function loadVenuesFromAPI(append){
    var generation = ++venueLoadState.generation;
    var offset = append ? venueLoadState.offset : 0;
    if (!append) { mapViewportEstablished=false;mapViewInteracted=false; allVenues = []; filtered = []; venueLoadState.total = 0; venueLoadState.offset = 0; renderMarkers(); dismissCard(); }
    venueLoadState.loading = true;
    venueLoadState.error = false;
    venueLoadState.more = false;
    showLoadingState();
    window.dispatchEvent(new Event('sl-venues-changed'));
    try {
        var params = new URLSearchParams({ limit: '100', offset: String(offset), view: 'detail', sort: 'name' });
        if (searchQ) params.set('q', searchQ);
        if (activeChip !== 'all') params.set('type', activeChip);
        if (activeCuisine !== 'all') params.set('cuisine', activeCuisine);
        ['neighborhood','vibe','price_level'].forEach(function(key){ if(filterState[key]) params.set(key,filterState[key]); });
        var data = await window.SLVenueData.list(Object.fromEntries(params));
        if (!data || !Array.isArray(data.venues)) throw new Error('Invalid venue response');
        if (generation !== venueLoadState.generation) return allVenues;
        var loaded = data.venues.filter(function(v){ return v && v.id; }).map(function(v){
            var clean = Object.assign({}, v);
            if(clean.metrics_status !== 'verified') { clean.rating=null; clean.review_count=null; clean.buzz_score=null; clean.going_count=null; clean.friends_going=null; clean.trending=false; clean.featured=false; clean.spotlight=false; }
            return clean;
        });
        var known = new Set((append ? allVenues : []).map(function(v){ return v.id; }));
        allVenues = (append ? allVenues : []).concat(loaded.filter(function(v){ if(known.has(v.id)) return false; known.add(v.id); return true; }));
        allVenues.sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});
        venueLoadState.offset = offset + data.venues.length;
        venueLoadState.total = Number.isFinite(Number(data.total)) ? Number(data.total) : allVenues.length;
        venueLoadState.more = data.venues.length > 0 && (data.has_more === true || venueLoadState.offset < venueLoadState.total);
        return allVenues;
    } catch(err){
        if (generation !== venueLoadState.generation) return allVenues;
        console.error('Failed to load venues:', err);
        venueLoadState.error = true;
        // Never substitute seeded or invented venues for a failed live request.
        return allVenues;
    } finally {
        if (generation === venueLoadState.generation) venueLoadState.loading = false;
    }
}
function refreshVenueSearch(){ return loadVenuesFromAPI(false).then(function(){ applyAll(); }); }
function renderPagination(){
    var c = document.getElementById('slListCards');
    if (!c) return;
    var old = document.getElementById('slVenuePagination');
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'slVenuePagination';
    box.style.cssText = 'padding:16px;grid-column:1/-1;text-align:center';
    var label = document.createElement('p');
    label.textContent = venueLoadState.error ? 'Venue service unavailable. No substitute venues are shown.' :
        (venueLoadState.more ? 'Load more to see the remaining matching venues.' : 'Hours and availability are not confirmed.');
    box.appendChild(label);
    if (venueLoadState.more || venueLoadState.error) {
        var button = document.createElement('button');
        button.type = 'button'; button.className = 'sl-btn sl-btn-primary';
        button.textContent = venueLoadState.error ? 'Retry venue loading' : 'Load more venues';
        button.addEventListener('click', function(){ button.disabled = true; loadVenuesFromAPI(!venueLoadState.error).then(function(){ applyAll(); }); });
        box.appendChild(button);
    }
    c.appendChild(box);
}

function showLoadingState(){
    var c = document.getElementById('slListCards');
    if(c) c.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,0.5);"><i class="fas fa-spinner fa-spin" style="font-size:28px;color:#D4AF37;margin-bottom:12px;display:block;"></i>Loading venues...</div>';
    var ct = document.getElementById('slListCount');
    if(ct) ct.textContent = 'Loading...';
    var ci = document.getElementById('slCrowdCount');
    if(ci) ci.textContent = 'Loading venues...';
}

function showError(msg){
    var c = document.getElementById('slListCards');
    if(c) c.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,0.5);">⚠️ '+msg+'</div>';
}

// ═══════════════ INIT ═══════════════
async function init(){
    // Leaflet loads asynchronously; initialize exactly once when it is ready.
    if (window.SLDiscoveryMap) window.SLDiscoveryMap.mount(function (readyMap) {
        map = readyMap;
        renderMarkers();
        mapViewportEstablished=false;
        syncMapViewport();
    });
    var canvas = document.getElementById('slMapCanvas');
    if(canvas) ['pointerdown','wheel','keydown'].forEach(function(type){
        canvas.addEventListener(type,function(){mapViewInteracted=true;},{passive:true});
    });

    // ─── Setup functions (each isolated; one failure shouldn't cascade) ───
    try { setupSearch(); }       catch(e){ console.error('[explore] setupSearch failed:', e); }
    try { setupChips(); }        catch(e){ console.error('[explore] setupChips failed:', e); }
    try { setupCuisineChips(); } catch(e){ console.error('[explore] setupCuisineChips failed:', e); }
    try { setupViewToggle(); }   catch(e){ console.error('[explore] setupViewToggle failed:', e); }
    try { setupFilterModal(); }  catch(e){ console.error('[explore] setupFilterModal failed:', e); }
    try { setupMapControls(); }  catch(e){ console.error('[explore] setupMapControls failed:', e); }

    // Read URL params
    var p = new URLSearchParams(window.location.search);
    var initialQ = p.get('q') || p.get('search') || '';
    var initialCat = window.SLDiscoveryFilters.type(p.get('type') || p.get('cat'));
    activeCuisine = (p.get('cuisine') || 'all').trim().toLowerCase();
    filterState.vibe = p.get('vibe') || '';
    filterState.price_level = /^[1-4]$/.test(p.get('price_level')) ? p.get('price_level') : '';
    var initialNeighborhood = p.get('neighborhood') || '';
    searchQ = initialQ.trim().toLowerCase();
    filterState.neighborhood = initialNeighborhood;
    var input = document.getElementById('slSearchInput');
    if(input) input.value = initialQ;
    if(initialCat) activeChip = initialCat;
    syncFilterChips();

    // ─── CRITICAL PATH: Load real venue data (must succeed or use fallback) ───
    try {
        await loadVenuesFromAPI();
    } catch(e){
        console.error('[explore] loadVenuesFromAPI crashed:', e);
        allVenues = []; venueLoadState.error = true;
    }

    filtered = (allVenues||[]).slice();
    try { applyAll(); }
    catch(e){
        console.error('[explore] applyAll failed, falling back to direct renderList:', e);
        try { renderList(); } catch(e2){ console.error('[explore] renderList also failed:', e2); }
    }


    setTimeout(function(){ try { if(map) map.invalidateSize(); } catch(_){} }, 200);
}

// ═══════════════ MARKERS ═══════════════
function renderMarkers(){
    if(!map){ return; } // Map failed to initialize — skip marker rendering (cards still render)
    markers.forEach(function(m){ try { map.removeLayer(m.leaflet); } catch(e){} });
    markers = [];

    filtered.forEach(function(v){
        if(v.lat == null || v.lng == null || !Number.isFinite(Number(v.lat)) || !Number.isFinite(Number(v.lng))) return;
        var ci = getCatIcon(v);
        var isTrending = v.trending || (v.buzz_score && v.buzz_score > 80);
        var pulse = isTrending ? '<div class="sl-pin-pulse"></div>' : '';
        var html = '<div class="sl-pin '+ci.cls+'" data-id="'+slEsc(v.id)+'">'+pulse+'<div class="sl-pin-body"><i class="fas '+ci.icon+'"></i></div></div>';
        var icon = L.divIcon({ html:html, className:'', iconSize:[38,42], iconAnchor:[19,42] });
        try {
            var lm = L.marker([parseFloat(v.lat),parseFloat(v.lng)],{icon:icon}).addTo(map);
            lm.on('click',function(){ selectVenue(v.id); });
            markers.push({leaflet:lm, venue:v});
        } catch(e){ console.warn('Marker error for',v.name,e); }
    });
}

// ═══════════════ SELECT VENUE ═══════════════
function selectVenue(id){
    activeId = id;
    var v = allVenues.find(function(x){ return x.id===id; });
    if(!v) return;
    pendingMapSelection = id;

    var w = document.getElementById('slVenueWrap');
    var imgSrc = (window.SLVenueImages && SLVenueImages.pick(v)) ||
                 v.thumbnail_url || v.cover_image_url || v.image_url || (v.image_urls && v.image_urls[0]) ||
                 (window.SLPhoto && SLPhoto.fallbackFor(v)) || '/assets/img/placeholder-venue.svg';

    var imgEl = document.getElementById('slCardImg');
    if(imgEl) { imgEl.src = imgSrc; imgEl.alt = imgSrc.includes('placeholder-') ? 'Venue photo unavailable' : v.name; }

    var nameEl = document.getElementById('slCardName');
    if(nameEl) nameEl.textContent = v.name;

    var ratingEl = document.getElementById('slCardRating');
    if(ratingEl) ratingEl.innerHTML = '★ '+(v.rating ? parseFloat(v.rating).toFixed(1) : 'New');

    var peopleEl = document.getElementById('slCardPeople');
    if(peopleEl) {
      // Phase 6A: only show real going_count. No buzz_score derived fakery.
      if (typeof v.going_count === 'number' && v.going_count > 0) {
        peopleEl.textContent = v.going_count + ' going';
        peopleEl.style.display = '';
      } else {
        peopleEl.textContent = '';
        peopleEl.style.display = 'none';
      }
    }

    var distEl = document.getElementById('slCardDist');
    if(distEl) distEl.textContent = v.neighborhood || v.city || 'Boston';

    var typeEl = document.getElementById('slCardType');
    if(typeEl) typeEl.textContent = (v.type||'Venue') + (v.neighborhood ? ' · '+v.neighborhood : '');

    if(w) w.classList.add('visible');

    // Wire up View button to open real detail
    var viewBtn = document.getElementById('slCardViewBtn');
    if(viewBtn){
        viewBtn.setAttribute('data-slug', v.slug||v.id);
        viewBtn.onclick = function(){ openDetail(v.id); };
    }

    // Activate marker
    document.querySelectorAll('.sl-pin').forEach(function(p){ p.classList.remove('active','bounce'); });
    var pin = document.querySelector('.sl-pin[data-id="'+id+'"]');
    if(pin){ pin.classList.add('active','bounce'); setTimeout(function(){ pin.classList.remove('bounce'); },600); }

    // Pan map
    syncMapViewport();

    // Highlight list card
    document.querySelectorAll('.sl-list-card').forEach(function(c){ c.classList.remove('highlighted'); });
    var lc = document.querySelector('.sl-list-card[data-id="'+id+'"]');
    if(lc){ lc.classList.add('highlighted'); if(currentView==='list') lc.scrollIntoView({behavior:'smooth',block:'nearest'}); }
}

function dismissCard(){
    var w = document.getElementById('slVenueWrap');
    if(w) w.classList.remove('visible');
    activeId = null; pendingMapSelection = null;
}

function openDetail(id){
    var v = allVenues.find(function(x){ return x.id===id; });
    if(!v) return;
    // Try the real venue detail panel first
    if(window.SLVenueDetail && typeof window.SLVenueDetail.open === 'function'){
        window.SLVenueDetail.open(v.slug || v.id);
    } else if(window.openVenueDetail){
        window.openVenueDetail(v.slug || v.id);
    } else {
        showToast('Opening '+slEsc(v.name)+'...');
    }
}

// ═══════════════ SEARCH ═══════════════
function setupSearch(){
    var input = document.getElementById('slSearchInput');
    if(!input) return;
    var debTimer;
    input.addEventListener('input', function(){
        clearTimeout(debTimer);
        debTimer = setTimeout(function(){
            searchQ = input.value.trim().toLowerCase();
            refreshVenueSearch();
        }, 250);
    });
    input.addEventListener('keydown', function(e){
        if(e.key==='Enter'){ e.preventDefault(); submitSearch(); }
        if(e.key==='Escape'){ clearTimeout(debTimer); input.value=''; searchQ=''; refreshVenueSearch(); }
    });
    function submitSearch(){ clearTimeout(debTimer); searchQ=input.value.trim().toLowerCase(); refreshVenueSearch(); }
    var button = document.getElementById('slSearchBtn');
    if(button) button.addEventListener('click', submitSearch);
}

// ═══════════════ CATEGORY CHIPS ═══════════════
function setupChips(){
    document.querySelectorAll('.sl-chip-btn[data-cat]').forEach(function(btn){
        btn.addEventListener('click', function(){
            setChip(btn.getAttribute('data-cat'));
        });
    });
}

function syncFilterChips(){
    document.querySelectorAll('.sl-chip-btn[data-cat]').forEach(function(button){
        button.classList.toggle('active', button.getAttribute('data-cat') === activeChip);
    });
    document.querySelectorAll('.sl-cuisine-chip[data-cuisine]').forEach(function(button){
        button.classList.toggle('active', button.getAttribute('data-cuisine') === activeCuisine);
    });
}
function setChip(cat){
    activeChip = window.SLDiscoveryFilters.type(cat);
    syncFilterChips();
    refreshVenueSearch();
}
function setupCuisineChips(){
    document.querySelectorAll('.sl-cuisine-chip[data-cuisine]').forEach(function(button){
        button.addEventListener('click', function(){
            var cuisine = button.getAttribute('data-cuisine');
            activeCuisine = activeCuisine === cuisine ? 'all' : cuisine;
            syncFilterChips();
            refreshVenueSearch();
        });
    });
}

// ═══════════════ VIEW TOGGLE ═══════════════
function setupViewToggle(){
    document.querySelectorAll('.sl-view-btn[data-view]').forEach(function(btn){
        btn.addEventListener('click', function(){
            var view = btn.getAttribute('data-view');
            currentView = view;
            document.querySelectorAll('.sl-view-btn').forEach(function(b){ b.classList.toggle('active', b===btn); });
            var listEl = document.getElementById('slListView');
            if(listEl) listEl.classList.toggle('active', view==='list');
            if(view==='map') setTimeout(syncMapViewport,0);
        });
    });
}

// ═══════════════ FILTER MODAL ═══════════════
function setupFilterModal(){
    window.SLDiscoveryFilters.mount({
        read: function(){ return Object.assign({},filterState,{type:activeChip,cuisine:activeCuisine === 'all' ? '' : activeCuisine}); },
        apply: function(values){
            activeChip=values.type; activeCuisine=values.cuisine.toLowerCase() || 'all';
            filterState={vibe:values.vibe,neighborhood:values.neighborhood,price_level:values.price_level};
            syncFilterChips(); refreshVenueSearch();
        }
    });
}

// ═══════════════ MAP CONTROLS ═══════════════
function setupMapControls(){
    var zoomIn  = document.getElementById('slZoomIn');
    var zoomOut = document.getElementById('slZoomOut');
    var locateBtn = document.getElementById('slLocateBtn') || document.getElementById('slLocate');
    var fitBtn  = document.getElementById('slFitAll');

    if(zoomIn)  zoomIn.addEventListener('click', function(){ if(map) {mapViewInteracted=true;map.zoomIn();} });
    if(zoomOut) zoomOut.addEventListener('click', function(){ if(map) {mapViewInteracted=true;map.zoomOut();} });
    if(fitBtn) fitBtn.addEventListener('click',function(){mapViewInteracted=true;fitCurrentResults();});
    function locateUser(){
        mapViewInteracted = true;
        if(!map) return;
        if(navigator.geolocation){
            navigator.geolocation.getCurrentPosition(
                function(pos){ map.setView([pos.coords.latitude,pos.coords.longitude],15); },
                function(){ showToast('Location access denied'); }
            );
        } else { showToast('Geolocation not supported'); }
    }
    if(locateBtn) locateBtn.addEventListener('click', locateUser);
    var searchLocate = document.getElementById('slSearchLoc');
    if(searchLocate) searchLocate.addEventListener('click', locateUser);
}

// ═══════════════ APPLY ALL FILTERS ═══════════════
function validMapPoint(v){
    return v && v.lat != null && v.lng != null && Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lng)) && Math.abs(Number(v.lat))<=90 && Math.abs(Number(v.lng))<=180;
}
function fitCurrentResults(){
    if(!map || currentView !== 'map') return;
    var points=filtered.filter(validMapPoint).map(function(v){return [Number(v.lat),Number(v.lng)];});
    if(points.length){
        map.invalidateSize();
        map.fitBounds(L.latLngBounds(points),{padding:[60,60],maxZoom:15});
        mapViewportEstablished=true;
    }
}
function syncMapViewport(){
    if(!map || currentView !== 'map') return;
    // List hides the canvas. Recalculate its visible size before establishing a camera target.
    map.invalidateSize();
    if(pendingMapSelection){
        var selected=filtered.find(function(v){return v.id===pendingMapSelection;});
        pendingMapSelection=null;
        if(validMapPoint(selected)){
            map.panTo([Number(selected.lat),Number(selected.lng)],{animate:true,duration:0.5});
            mapViewportEstablished=true;
            return;
        }
    }
    if(!mapViewInteracted && !mapViewportEstablished) fitCurrentResults();
}

function applyAll(){
    // The server has already applied every supported filter across the entire directory.
    filtered = allVenues.slice();
    if(venueLoadState.loading){showLoadingState();return;}
    try { renderMarkers(); }    catch(e){ console.error('[explore] renderMarkers failed:', e); }
    try { renderList(); renderPagination(); }       catch(e){ console.error('[explore] renderList failed:', e); }
    try { updateCrowdIndex(); } catch(e){ console.error('[explore] updateCrowdIndex failed:', e); }

    if(activeId && !filtered.find(function(v){return v.id===activeId;})) dismissCard();
    syncMapViewport();
    window.dispatchEvent(new Event('sl-venues-changed'));
}

// ═══════════════ RENDER LIST ═══════════════
function renderList(){
    var c = document.getElementById('slListCards');
    if(!c) return;
    c.innerHTML = '';

    var countEl = document.getElementById('slListCount');
    if(countEl) countEl.textContent = (venueLoadState.error ? 'Venue service unavailable' : filtered.length + ' of ' + venueLoadState.total + ' matching venues');

    if(filtered.length === 0){
        c.innerHTML = '<div style="padding:40px 20px;text-align:center;color:rgba(255,255,255,0.4);">' +
            '<i class="fas fa-search" style="font-size:32px;margin-bottom:12px;display:block;color:#D4AF37;opacity:0.5;"></i>' +
            '<div style="font-size:16px;margin-bottom:8px;">'+(venueLoadState.error ? 'Venue data unavailable' : 'No venues match your filters')+'</div>' +
            '<div style="font-size:13px;">Try adjusting your search or clearing filters</div>' +
            '</div>';
        return;
    }

    filtered.forEach(function(v){
        var img = (window.SLVenueImages && SLVenueImages.pick(v)) ||
                  v.thumbnail_url || v.cover_image_url || v.image_url || (v.image_urls && v.image_urls[0]) ||
                  (window.SLPhoto && SLPhoto.fallbackFor(v)) || '/assets/img/placeholder-venue.svg';
        var rating = v.rating ? parseFloat(v.rating).toFixed(1) : 'New';
        var price = getPriceLabel(v.price_level);
        var hood = v.neighborhood || v.city || 'Location not provided';
        var vtype = v.type || 'Venue';
        var isTrending = v.trending || (v.buzz_score && v.buzz_score > 75);
        var isFeatured = v.featured || v.spotlight;
        var badgeText = isTrending ? '🔥 Trending' : (isFeatured ? '⭐ Featured' : '');
        var badgeCls  = isTrending ? 'hot' : 'featured';
        // Phase 6A: only use real going_count when present and > 0. No buzz_score derivation.
        var goingCount = (typeof v.going_count === 'number' && v.going_count > 0) ? v.going_count : null;
        // Phase 6B: never derive "Open status" without real hours_json. Show hours_display only when present.
        var hoursText = v.hours_display || '';

        var tags = [];
        if(v.tags && Array.isArray(v.tags)) tags = v.tags.slice(0,2);
        else if(v.badges && Array.isArray(v.badges)) tags = v.badges.slice(0,2);
        var tagsHtml = tags.map(function(t){ return '<span class="sl-list-tag lounge">'+slEsc(t)+'</span>'; }).join('');

        var saved = (window._slSavedVenues||{})[v.id];

        var card = document.createElement('div');
        card.className = 'sl-list-card';
        card.setAttribute('data-id', v.id);
        card.setAttribute('data-slug', v.slug||'');
        card.innerHTML =
            '<div class="sl-list-card-imgwrap">' +
                '<img class="sl-list-card-img" src="'+slEsc(img)+'" alt="'+slEsc(v.name)+'" loading="lazy">' +
                (badgeText ? '<div class="sl-list-card-badge '+badgeCls+'">'+badgeText+'</div>' : '') +
                '<button class="sl-list-card-save'+(saved?' saved':'')+'" data-vid="'+slEsc(v.id)+'" title="Save to List">' +
                    '<i class="'+(saved?'fas':'far')+' fa-heart"></i>' +
                '</button>' +
                // Energy "here" badge intentionally removed from Explore — kept only on Nightlife
                '' +
            '</div>' +
            '<div class="sl-list-card-body">' +
                '<div class="sl-list-card-top">' +
                    '<div class="sl-list-card-name">'+slEsc(v.name)+'</div>' +
                    '<div class="sl-list-card-rating"><i class="fas fa-star"></i> '+rating+'</div>' +
                '</div>' +
                '<div class="sl-list-card-detail">'+slEsc(vtype)+(price?' · '+slEsc(price):'')+(hoursText?' · '+slEsc(hoursText):'')+'</div>' +
                (tagsHtml ? '<div class="sl-list-card-tags">'+tagsHtml+'</div>' : '') +
                '<div class="sl-list-card-bottom">' +
                    '<div class="sl-list-card-dist"><i class="fas fa-map-marker-alt"></i> '+slEsc(hood)+'</div>' +
                    '<div class="sl-list-card-actions">' +
                        '<button class="sl-list-plan-btn" data-id="'+slEsc(v.id)+'"><i class="fas fa-calendar-plus"></i> Plan Night</button>' +
                        '<button class="sl-list-view-btn" data-id="'+slEsc(v.id)+'" data-slug="'+slEsc(v.slug||v.id)+'"><i class="fas fa-arrow-right"></i> View</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        card.addEventListener('click',function(e){
            if(e.target.closest('.sl-list-card-save')){ e.stopPropagation(); toggleSaveVenue(v.id, e.target.closest('.sl-list-card-save')); return; }
            if(e.target.closest('.sl-list-plan-btn')){ e.stopPropagation(); openPlanNight(v); return; }
            if(e.target.closest('.sl-list-view-btn')){ e.stopPropagation(); openDetail(v.id); return; }
            if(!map || v.lat == null || v.lng == null){ openDetail(v.id); return; }
            selectVenue(v.id);
            if(currentView==='list'){
                currentView='map';
                var listEl = document.getElementById('slListView');
                if(listEl) listEl.classList.remove('active');
                document.querySelectorAll('.sl-view-btn').forEach(function(b){
                    b.classList.toggle('active', b.getAttribute('data-view')==='map');
                });
                setTimeout(syncMapViewport,150);
            }
        });

        c.appendChild(card);
    });
}

// ═══════════════ SAVE TO LIST ═══════════════
window._slSavedVenues = JSON.parse(localStorage.getItem('sl_saved_venues')||'{}');

function toggleSaveVenue(vid, btn){ return window.SLVenueActions.save(vid,btn); }

function showToast(msg){
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(212,175,55,0.95);color:#0a0a0a;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700;z-index:9999;pointer-events:none;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity 0.3s'; },2000);
    setTimeout(function(){ if(t.parentNode) t.remove(); },2500);
}

// ═══════════════ PLAN NIGHT ═══════════════
function openPlanNight(v){ window.location.href='/plan-with-friends?venue_id='+encodeURIComponent(v.id); }

// ═══════════════ CROWD INDEX ═══════════════
function updateCrowdIndex(){
    var total = filtered.reduce(function(s,v){ return s+(v.going_count||0); },0);
    var el = document.getElementById('slCrowdCount');
    if(el) el.textContent = filtered.length+' of '+venueLoadState.total+' venues · '+filtered.filter(function(v){return v.lat != null && v.lng != null;}).length+' mapped';
}

// ═══════════════ GLOBAL CLICK EVENTS ═══════════════
document.addEventListener('click',function(e){
    // View Details button (card popup)
    if(e.target.closest('#slCardViewBtn,#slCardDetailBtn') && activeId){ openDetail(activeId); }

    // Plan Night button (card popup) — supports both #slCardPlan and #slCardPlanBtn
    if((e.target.closest('#slCardPlan') || e.target.closest('#slCardPlanBtn')) && activeId){
        var pv = allVenues.find(function(x){return x.id===activeId;});
        if(pv) openPlanNight(pv);
    }

    // Save/Favorite button (card popup) — supports both #slCardSave and #slCardSaveBtn
    if((e.target.closest('#slCardSave') || e.target.closest('#slCardSaveBtn')) && activeId){
        var sBtn = e.target.closest('#slCardSave') || e.target.closest('#slCardSaveBtn');
        toggleSaveVenue(activeId, sBtn);
    }

    // Reserve button (card popup) — opens venue detail which has Resy/OpenTable links
    if(e.target.closest('#slCardReserve') && activeId){
        openDetail(activeId);
    }

    if(e.target.closest('.sl-detail-close')){
        var overlay = document.getElementById('slDetailOverlay');
        if(overlay) overlay.classList.remove('active');
    }
    var detailOverlay = document.getElementById('slDetailOverlay');
    if(detailOverlay && e.target === detailOverlay) detailOverlay.classList.remove('active');
});

// Dismiss card on map background click
document.addEventListener('click',function(e){
    var card = document.getElementById('slVenueWrap');
    if(!card || !card.classList.contains('visible')) return;
    if(card.contains(e.target)) return;
    if(e.target.closest('.sl-pin')) return;
    if(e.target.closest('.sl-map-toolbar')||e.target.closest('.sl-map-ctrls')||e.target.closest('.sl-crowd-index')) return;
    if(e.target.closest('.leaflet-container')){ dismissCard(); }
});

// Phase 5D-A H4: Venue card close button (X) — wire all close paths
(function wireVenueCardClose(){
    function closeCard(e){
        if(e){ e.preventDefault(); e.stopPropagation(); }
        dismissCard();
        // Also close detail overlay if open
        var ov = document.getElementById('slDetailOverlay');
        if(ov && ov.classList.contains('active')) ov.classList.remove('active');
        // Restore body scroll
        try { document.body.style.overflow = ''; document.documentElement.style.overflow = ''; } catch(_){}
    }
    function bindClose(){
        var btn = document.getElementById('slCardClose');
        if(btn && !btn._slBound){
            btn._slBound = true;
            btn.addEventListener('click', closeCard);
            btn.addEventListener('touchend', closeCard);
        }
        // Also bind any close button in detail overlay
        document.querySelectorAll('.sl-detail-close, [data-venue-close], .sl-venue-close').forEach(function(b){
            if(b._slBound) return;
            b._slBound = true;
            b.addEventListener('click', closeCard);
        });
    }
    // Re-bind on every selectVenue (markup may be re-rendered)
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindClose);
    else bindClose();
    // Watch for late DOM injection
    var mo = new MutationObserver(function(){ bindClose(); });
    try { mo.observe(document.body, {childList:true, subtree:true}); } catch(_){}

    // Escape key closes any visible venue card or detail overlay
    document.addEventListener('keydown', function(e){
        if(e.key === 'Escape' || e.keyCode === 27){
            var card = document.getElementById('slVenueWrap');
            var ov = document.getElementById('slDetailOverlay');
            if((card && card.classList.contains('visible')) || (ov && ov.classList.contains('active'))){
                closeCard(e);
            }
        }
    });
    // Expose for debugging / external triggers
    window.SLVenueCardClose = closeCard;
})();

// ═══════════════ BOOT ═══════════════
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
else init();

// Expose for right-side panel sync and debugging
window.__slExploreData = {
    getVenues:  function(){ return allVenues; },
    getStatus: function(){return {total:venueLoadState.total,loading:venueLoadState.loading,error:venueLoadState.error};},
    getFiltered:function(){ return filtered; },
    getMarkers: function(){ return markers; },
    getActiveId:function(){ return activeId; },
    showVenue:  selectVenue,
    applyAll:   applyAll,
    setSearch:  function(q){ searchQ=String(q||'').trim().toLowerCase(); return refreshVenueSearch(); }
};

})();