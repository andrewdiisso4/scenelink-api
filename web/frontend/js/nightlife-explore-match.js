/**
 * SceneLink Nightlife — Premium App Engine
 * Full nightlife discovery experience matching explore page layout
 */
(function(){
'use strict';
function slEsc(value){return window.SLConnected.esc(value);}

// Only run on nightlife page
if (!/nightlife/i.test(window.location.pathname)) return;

// ═══════════════════ VENUE DATA ═══════════════════
var venues = [];

/* ── Map API venue → nightlife format ── */
function mapApiVenue(v, idx) {
    var type = ((v.type || '') + ' ' + (v.category || '')).toLowerCase();
    var nameLC = (v.name || '').toLowerCase();
    var descLC = ((v.description || '') + ' ' + (v.highlight || '') + ' ' + (v.vibe || '') + ' ' + (v.tags || []).join(' ')).toLowerCase();
    var cat = 'bar';
    if (type.includes('nightclub') || type.includes('club') || nameLC.includes('nightclub')) cat = 'nightclub';
    else if (type.includes('lounge') || nameLC.includes('lounge')) cat = 'lounge';
    else if (nameLC.includes('rooftop') || descLC.includes('rooftop') || nameLC.includes('skybar') || descLC.includes('skyline view')) cat = 'rooftop';
    else if (type.includes('music') || type.includes('live') || nameLC.includes('jazz') || descLC.includes('live music') || descLC.includes('live band')) cat = 'music';
    else if (type.includes('brewery') || nameLC.includes('brewing') || nameLC.includes('brewery')) cat = 'brewery';
    else if (type.includes('pub') || nameLC.includes(' pub') || nameLC.endsWith(' pub') || nameLC.includes('tavern')) cat = 'pub';

    var priceMap = { 1:'$', 2:'$$', 3:'$$$', 4:'$$$$' };
    var genreMap = { nightclub:'Electronic', lounge:'Jazz', rooftop:'Top 40', music:'Live Music', bar:'Top 40' };

    var tags = [];
    if (v.genre) tags.push(v.genre);
    else if (cat === 'nightclub') tags.push('Nightclub');
    else if (cat === 'lounge') tags.push('Lounge');
    else if (cat === 'rooftop') tags.push('🌃 Views');
    else if (cat === 'music') tags.push('🎸 Live Music');
    else tags.push('🍺 Bar');
    // No inferred event schedule or music genre.

    return {
        id: v.id,
        slug: v.slug,
        name: v.name,
        type: (v.type || 'Bar') + ' · ' + (v.neighborhood || v.city || 'Location not provided'),
        cat: cat,
        genre: v.genre || '',
        lat: v.lat,
        lng: v.lng,
        rating: null, // Imported aggregate provenance is not verified.
        people: null, // Genuine social activity is rendered by separate social APIs.
        _rawBuzz: null,
        dist: v.distance ? (parseFloat(v.distance).toFixed(1) + ' mi') : '',
        trending: false,
        img: (window.SLVenueImages && SLVenueImages.pick(v)) ||
             v.thumbnail_url || v.cover_image_url || v.image_url || (v.image_urls && v.image_urls[0]) ||
             (window.SLPhoto && SLPhoto.fallbackFor(v)) || '/assets/img/placeholder-venue.svg',
        tags: tags,
        price: priceMap[v.price_level] || 'Price unavailable',
        hours: v.hours_display || 'Hours unavailable',
        vibe: v.description || '',
        cover: v.cover_charge || 'Not provided',
        dressCode: v.dress_code || 'Not provided'
    };
}

// No synthetic venue fallback: API failure is an explicit unavailable state.
var venueLoadError = false, venueLoading=false, venueOffset=0, venueTotal=0, venueMore=false, venueGeneration=0;

/* ── Load venues from API ── */
async function loadVenues(callback, append) {
    var seq=++venueGeneration, offset=append?venueOffset:0;
    venueLoadError=false;venueLoading=true;venueMore=false;
    if(!append){mapViewportEstablished=false;mapViewInteracted=false;venues=[];filtered=[];venueTotal=0;venueOffset=0;renderMarkers();deselectVenue();}
    showLoadingState();window.dispatchEvent(new Event('sl-venues-changed'));
    try {
        var data=await window.SLVenueData.list(Object.assign({mode:'nightlife',limit:100,offset:offset,q:searchQ,type:activeChip},filterState));
        if(seq!==venueGeneration)return;
        var loaded=data.venues.map(mapApiVenue), seen=new Set(venues.map(v=>v.id));
        venues=venues.concat(loaded.filter(function(v){if(seen.has(v.id))return false;seen.add(v.id);return true;}));
        venueOffset=offset+data.venues.length;venueTotal=Number(data.total)||venues.length;venueMore=data.venues.length>0 && data.has_more;
    } catch(err) {if(seq!==venueGeneration)return;venueLoadError=true;venueMore=false;}
    venueLoading=false;
    if(window.__slExploreData)window.__slExploreData.venues=venues;
    if(callback)callback();
}
function refreshNightlife(){return loadVenues(function(){applyAll();});}
function showLoadingState(){
    var cards=document.getElementById('slListCards'),count=document.getElementById('slListCount'),crowd=document.getElementById('slCrowdCount');
    if(cards)cards.innerHTML='<p role="status">Loading matching venues…</p>';
    if(count)count.textContent='Loading…';if(crowd)crowd.textContent='Loading matching venues…';
}
function renderNightlifePagination(){
 var c=document.getElementById('slListCards');if(!c)return;
 var box=document.createElement('div');box.className='sl-connected';box.style.margin='0';
 var label=document.createElement('p');label.textContent=venueLoadError?'Venue service unavailable. No substitute listings are shown.':('Showing '+venues.length+' of '+venueTotal+' matching directory records. Hours and availability are not confirmed.');box.appendChild(label);
 if(venueMore||venueLoadError){var b=document.createElement('button');b.type='button';b.textContent=venueLoadError?'Retry':'Load more venues';b.onclick=function(){b.disabled=true;loadVenues(function(){applyAll();},!venueLoadError);};box.appendChild(b);}
 c.appendChild(box);
}

// ═══════════════════ STATE ═══════════════════
var map, markers=[], filtered=[], activeId=null, mapViewInteracted=false, mapViewportEstablished=false, pendingMapSelection=null;
var currentView='map', activeChip='all', searchQ='';
var filterState={cuisine:'',vibe:'',neighborhood:'',price_level:''};
var catIcons = {
    nightclub:{icon:'fa-bolt', cls:'cat-nightclub'},
    bar:      {icon:'fa-beer-mug-empty', cls:'cat-bar'},
    lounge:   {icon:'fa-cocktail', cls:'cat-lounge'},
    rooftop:  {icon:'fa-cloud-sun', cls:'cat-rooftop'},
    music:    {icon:'fa-music', cls:'cat-music'},
    hot:      {icon:'fa-fire', cls:'cat-hot'}
};

// ═══════════════════ INIT ═══════════════════
function init(){
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

    try { renderMarkers(); }    catch(e){ console.error('[nightlife] renderMarkers failed:', e); }
    try { setupSearch(); }      catch(e){ console.error('[nightlife] setupSearch failed:', e); }
    try { setupChips(); }       catch(e){ console.error('[nightlife] setupChips failed:', e); }
    try { setupViewToggle(); }  catch(e){ console.error('[nightlife] setupViewToggle failed:', e); }
    try { setupFilterModal(); } catch(e){ console.error('[nightlife] setupFilterModal failed:', e); }
    try { setupMapControls(); } catch(e){ console.error('[nightlife] setupMapControls failed:', e); }
    try { updateCrowdIndex(); } catch(e){ console.error('[nightlife] updateCrowdIndex failed:', e); }
    try { renderList(); }       catch(e){ console.error('[nightlife] renderList failed:', e); }

    if(map)setTimeout(function(){map.invalidateSize();},200);
}

// ═══════════════════ MARKERS ═══════════════════
function renderMarkers(){
    if(!map){ return; } // Map failed to init — skip markers (cards still render)
    markers.forEach(function(m){ try{ map.removeLayer(m.leaflet); }catch(_){ } });
    markers = [];

    filtered.forEach(function(v){
        if(v.lat==null||v.lng==null)return;
        var ci = catIcons[v.cat]||catIcons.bar;
        var pulse = v.trending ? '<div class="sl-pin-pulse"></div>' : '';
        var html = '<div class="sl-pin '+ci.cls+'" data-id="'+slEsc(v.id)+'">'+pulse+'<div class="sl-pin-body"><i class="fas '+ci.icon+'"></i></div></div>';
        var icon = L.divIcon({ html:html, className:'', iconSize:[38,42], iconAnchor:[19,42] });
        var lm = L.marker([v.lat,v.lng],{icon:icon}).addTo(map);
        lm.on('click',function(){ selectVenue(v.id); });
        markers.push({leaflet:lm, venue:v});
    });
}

// ═══════════════════ SELECT VENUE ═══════════════════
function selectVenue(id){
    activeId = id;
    var v = venues.find(function(x){ return x.id===id; });
    if(!v) return;
    pendingMapSelection = id;

    // Update card
    var w = document.getElementById('slVenueWrap');
    document.getElementById('slCardImg').src = v.img;
    document.getElementById('slCardImg').alt = v.img.includes('placeholder-') ? 'Venue photo unavailable' : v.name;
    document.getElementById('slCardName').textContent = v.name;
    document.getElementById('slCardRating').innerHTML = v.rating == null ? 'Not yet verified' : '★ '+v.rating;
    // Phase 6D: removed 'N here' label — backend does not currently provide live presence counts; see TODO when /api/venues/:id/presence ships
    var people = document.getElementById('slCardPeople');
    if(people) people.textContent = '';
    document.getElementById('slCardDist').textContent = v.dist;
    document.getElementById('slCardType').textContent = v.type;
    w.classList.add('visible');

    // Energy bar
    var buzz = v._rawBuzz || v.people || 0;
    var pct = Math.min(100, Math.max(0, Math.round((buzz / 100) * 100)));
    var energyLabel = buzz >= 90 ? '🔥 Packed' : buzz >= 70 ? '⚡ Lively' : buzz >= 45 ? '✨ Buzzing' : '😌 Chill';
    var barWrap = document.getElementById('slEnergyBarWrap');
    var barFill = document.getElementById('slEnergyBarFill');
    var barLabel = document.getElementById('slEnergyLabel');
    if (barWrap && barFill && barLabel) {
        barWrap.style.display = 'none';
        setTimeout(function(){ barFill.style.width = pct + '%'; }, 50);
        barLabel.textContent = energyLabel;
    }

    // Activate marker
    document.querySelectorAll('.sl-pin').forEach(function(p){ p.classList.remove('active','bounce'); });
    var pin = document.querySelector('.sl-pin[data-id="'+id+'"]');
    if(pin){ pin.classList.add('active','bounce'); }

    // Pan
    syncMapViewport();

    // Highlight list
    document.querySelectorAll('.sl-list-card').forEach(function(c){ c.classList.remove('highlighted'); });
    var lc = document.querySelector('.sl-list-card[data-id="'+id+'"]');
    if(lc){ lc.classList.add('highlighted'); if(currentView==='list') lc.scrollIntoView({behavior:'smooth',block:'nearest'}); }
}

function deselectVenue(){
    activeId = null; pendingMapSelection = null;
    document.getElementById('slVenueWrap').classList.remove('visible');
    document.querySelectorAll('.sl-pin').forEach(function(p){ p.classList.remove('active'); });
    document.querySelectorAll('.sl-list-card').forEach(function(c){ c.classList.remove('highlighted'); });
}

// ═══════════════════ SEARCH ═══════════════════
function setupSearch(){
    var inp = document.getElementById('slSearchInput');
    var btn = document.getElementById('slSearchBtn');
    var to;
    inp.addEventListener('input',function(){ clearTimeout(to); to = setTimeout(function(){ searchQ=inp.value.trim().toLowerCase(); refreshNightlife(); },250); });
    inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); clearTimeout(to); searchQ=inp.value.trim().toLowerCase(); refreshNightlife(); }
        if(e.key==='Escape'){ clearTimeout(to); inp.value=''; searchQ=''; refreshNightlife(); } });
    if(btn) btn.addEventListener('click',function(){ clearTimeout(to); searchQ=inp.value.trim().toLowerCase(); refreshNightlife(); });
}

// ═══════════════════ CHIPS ═══════════════════
function setupChips(){
    document.querySelectorAll('.sl-chip-btn[data-cat]').forEach(function(b){
        b.addEventListener('click',function(){ setChip(b.getAttribute('data-cat')); });
    });
}

function syncFilterChips(){
    document.querySelectorAll('.sl-chip-btn[data-cat]').forEach(function(button){
        button.classList.toggle('active', button.getAttribute('data-cat') === activeChip);
    });
}
function setChip(cat){
    activeChip=window.SLDiscoveryFilters.type(cat);
    syncFilterChips();refreshNightlife();
}

// ═══════════════════ VIEW TOGGLE ═══════════════════
function setupViewToggle(){
    document.querySelectorAll('.sl-view-btn').forEach(function(b){
        b.addEventListener('click',function(){
            var view = b.getAttribute('data-view');
            currentView = view;
            document.querySelectorAll('.sl-view-btn').forEach(function(x){ x.classList.remove('active'); });
            b.classList.add('active');

            var listEl = document.getElementById('slListView');
            if(view==='list'){
                listEl.classList.add('active');
                renderList();
            } else {
                listEl.classList.remove('active');
                setTimeout(syncMapViewport,0);
            }
        });
    });
}

// ═══════════════════ FILTER MODAL ═══════════════════
function setupFilterModal(){
    window.SLDiscoveryFilters.mount({
        read: function(){return Object.assign({},filterState,{type:activeChip});},
        apply: function(values){
            activeChip=values.type;
            filterState={cuisine:values.cuisine,vibe:values.vibe,neighborhood:values.neighborhood,price_level:values.price_level};
            syncFilterChips();refreshNightlife();
        }
    });
}

// ═══════════════════ MAP CONTROLS ═══════════════════
function setupMapControls(){
    var zIn = document.getElementById('slZoomIn');
    var zOut = document.getElementById('slZoomOut');
    var loc = document.getElementById('slLocateBtn');
    var sloc = document.getElementById('slSearchLoc');

    if(zIn) zIn.addEventListener('click',function(){ if(map) {mapViewInteracted=true;map.zoomIn();} });
    if(zOut) zOut.addEventListener('click',function(){ if(map) {mapViewInteracted=true;map.zoomOut();} });

    function locateUser(){
        mapViewInteracted = true;
        if(!map || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(function(pos){
            var ll = [pos.coords.latitude, pos.coords.longitude];
            map.setView(ll, 15);
            L.circleMarker(ll, {radius:8, fillColor:'#D4AF37', fillOpacity:1, color:'#fff', weight:2}).addTo(map);
        });
    }
    if(loc) loc.addEventListener('click', locateUser);
    if(sloc) sloc.addEventListener('click', locateUser);

    // Close venue card
    var closeCard = document.getElementById('slCardClose');
    if(closeCard) closeCard.addEventListener('click', deselectVenue);

    // Plan night from card
    var planBtn = document.getElementById('slCardPlanBtn');
    if(planBtn) planBtn.addEventListener('click', function(){
        if(activeId){ var v = venues.find(function(x){return x.id===activeId;}); if(v) openPlanNight(v); }
    });

    // Save/Favorites from card — real localStorage + API sync
    var saveBtn = document.getElementById('slCardSaveBtn');
    if(saveBtn) saveBtn.addEventListener('click', function(){
        if(!activeId) return;
        var v = venues.find(function(x){return x.id===activeId;});
        if(!v) return;
        toggleSaveVenue(v.id, saveBtn);
    });

    // Reserve from card — open venue detail (has Resy/OpenTable links)
    var reserveBtn = document.getElementById('slCardReserve');
    if(reserveBtn) reserveBtn.addEventListener('click', function(){
        if(activeId) openDetail(activeId);
    });

    // Detail from card
    var detailBtn = document.getElementById('slCardDetailBtn');
    if(detailBtn) detailBtn.addEventListener('click', function(){
        if(activeId) openDetail(activeId);
    });
}

// ═══════════════════ CROWD INDEX ═══════════════════
function updateCrowdIndex(){
    var el = document.getElementById('slCrowdCount');
    if(!el) return;
    var total = 0;
    var haveReal = false;
    filtered.forEach(function(v){ if (typeof v.people === 'number' && v.people > 0) { total += v.people; haveReal = true; } });
    el.textContent = haveReal ? (total.toLocaleString() + ' people out tonight') : (filtered.length+' of '+venueTotal+' venues · '+filtered.filter(function(v){return v.lat!=null&&v.lng!=null;}).length+' mapped');
}

// ═══════════════════ APPLY ALL FILTERS ═══════════════════
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
    filtered = venues.slice();
    if(venueLoading){showLoadingState();return;}
    deselectVenue();
    renderMarkers();
    renderList();
    updateCrowdIndex();
    window.dispatchEvent(new Event('sl-venues-changed'));

    syncMapViewport();
}

// ═══════════════════ RENDER LIST ═══════════════════
function renderList(){
    var c = document.getElementById('slListCards');
    if(!c) return;
    c.innerHTML = '';

    var countEl = document.getElementById('slListCount');
    if(countEl) countEl.textContent = venueLoadError ? 'Venue service unavailable' : filtered.length+' of '+venueTotal+' matching venues';
    if (!filtered.length) {
        var empty = document.createElement('p');
        empty.setAttribute('role', 'status');
        empty.textContent = venueLoadError ? 'Venue listings are temporarily unavailable. Please try again later.' : 'No venues match this selection. Try another search or explore the venue directory.';
        c.appendChild(empty);
        renderNightlifePagination();
        return;
    }

    filtered.forEach(function(v,i){
        var tagCls = v.cat==='nightclub'?'nightclub':v.cat==='bar'?'bar':v.cat==='lounge'?'lounge':v.cat==='rooftop'?'rooftop':v.cat==='music'?'music':'bar';
        var tagsHtml = v.tags.map(function(t){
            return '<span class="sl-list-tag '+tagCls+'">'+slEsc(t)+'</span>';
        }).join('');

        // Badge
        var badgeCls = tagCls;
        var badgeText = v.trending ? '🔥 Trending' : v.cat==='music' ? '🎵 Live Music' : v.rating >= 4.7 ? '⭐ Featured' : '';

        var saved = (window._slSavedVenues||{})[v.id];

        var card = document.createElement('div');
        card.className = 'sl-list-card';
        card.setAttribute('data-id',v.id);
        card.innerHTML =
            '<div class="sl-list-card-imgwrap">'+
                '<img class="sl-list-card-img" src="'+slEsc(v.img)+'" alt="'+slEsc(v.name)+'" loading="lazy">'+
                (badgeText ? '<div class="sl-list-card-badge '+badgeCls+'">'+badgeText+'</div>' : '')+
                '<button class="sl-list-card-save'+(saved?' saved':'')+'" data-vid="'+slEsc(v.id)+'" title="Save to List">'+
                    '<i class="'+(saved?'fas':'far')+' fa-heart"></i>'+
                '</button>'+
                /* Phase 6D: removed 'N here' card label — no live presence backend yet */
                ''+
            '</div>'+
            '<div class="sl-list-card-body">'+
                '<div class="sl-list-card-top">'+
                    '<div class="sl-list-card-name">'+slEsc(v.name)+'</div>'+
                    '<div class="sl-list-card-rating"><i class="fas fa-star"></i> '+v.rating+'</div>'+
                '</div>'+
                '<div class="sl-list-card-detail">'+slEsc(v.type)+' · '+slEsc(v.price)+' · '+slEsc(v.hours)+'</div>'+
                '<div class="sl-list-card-tags">'+tagsHtml+'</div>'+
                '<div class="sl-list-card-bottom">'+
                    '<div class="sl-list-card-dist"><i class="fas fa-map-marker-alt"></i> '+slEsc(v.dist)+'</div>'+
                    '<div class="sl-list-card-actions">'+
                        '<button class="sl-list-plan-btn" data-id="'+slEsc(v.id)+'"><i class="fas fa-calendar-plus"></i> Plan Night</button>'+
                        '<button class="sl-list-view-btn" data-id="'+slEsc(v.id)+'"><i class="fas fa-arrow-right"></i> View</button>'+
                    '</div>'+
                '</div>'+
            '</div>';

        // Event delegation
        card.addEventListener('click',function(e){
            var saveBtn = e.target.closest('.sl-list-card-save');
            if(saveBtn){ e.stopPropagation(); toggleSaveVenue(v.id, saveBtn); return; }
            var planBtn = e.target.closest('.sl-list-plan-btn');
            if(planBtn){ e.stopPropagation(); openPlanNight(v); return; }
            if(e.target.closest('.sl-list-view-btn')){ e.stopPropagation(); openDetail(v.id); return; }
            // A map outage or missing coordinates must not break venue discovery.
            if(!map || v.lat == null || v.lng == null){ openDetail(v.id); return; }
            selectVenue(v.id);
            if(currentView==='list'){
                currentView='map';
                document.getElementById('slListView').classList.remove('active');
                document.querySelectorAll('.sl-view-btn').forEach(function(b){
                    b.classList.toggle('active',b.getAttribute('data-view')==='map');
                });
                if(map)setTimeout(syncMapViewport,100);
            }
        });

        c.appendChild(card);
    });
renderNightlifePagination();
}

// ═══════════════════ SAVE VENUE ═══════════════════
function toggleSaveVenue(vid, btn){ return window.SLVenueActions.save(vid,btn); }

function nlToast(msg){
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(212,175,55,0.95);color:#0a0a0a;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700;z-index:999999;pointer-events:none;white-space:nowrap;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity 0.3s'; }, 2200);
    setTimeout(function(){ if(t.parentNode) t.remove(); }, 2500);
}

// ═══════════════════ PLAN NIGHT ═══════════════════
function openPlanNight(v){ window.location.href='/plan-with-friends?venue_id='+encodeURIComponent(v.id); }

// ═══════════════════ DETAIL MODAL ═══════════════════
function openDetail(id){ return window.SLVenueDetail.open(id); }

// ═══════════════════ BOOT ═══════════════════
function _doInit(){
    var params = new URLSearchParams(location.search);
    searchQ = (params.get('q') || params.get('search') || '').trim().toLowerCase();
    var input = document.getElementById('slSearchInput');
    if(input) input.value = params.get('q') || params.get('search') || '';
    activeChip = window.SLDiscoveryFilters.type(params.get('type') || params.get('cat'));
    filterState={cuisine:params.get('cuisine')||'',vibe:params.get('vibe')||'',neighborhood:params.get('neighborhood')||'',price_level:/^[1-4]$/.test(params.get('price_level'))?params.get('price_level'):''};
    syncFilterChips();
    // Wire interactions before the first response so slow loading never traps a newer search.
    init();
    refreshNightlife();
}
if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _doInit);
} else {
    _doInit();
}

// Expose data for right-side panel sync
window.__slExploreData = {getStatus:function(){return {total:venueTotal,loading:venueLoading,error:venueLoadError};}, venues: venues, filtered: filtered, markers: markers, getVenues:function(){return venues;},getFiltered:function(){return filtered;},getActiveId: function(){ return activeId; }, showVenue: selectVenue }; // updated after loadVenues

})();