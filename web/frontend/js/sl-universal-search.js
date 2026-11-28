/* SceneLink Phase 8C universal search — one component across all pages. */
(function(){
  'use strict';
  if (window.__SL_UNIVERSAL_SEARCH_BOOTED__) return;
  window.__SL_UNIVERSAL_SEARCH_BOOTED__ = true;
  var API = '/api';
  var RECENT_KEY = 'sl_recent_searches_v1';
  var SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.75" cy="10.75" r="6.25"/><path d="m15.25 15.25 4 4"/></svg>';
  var ASK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"><path d="M10 3.5 12 9l5.5 2-5.5 2-2 5.5L8 13l-5.5-2L8 9zM18.5 3l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM19 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>';
  var TRENDING = ['Date night','Rooftop bars','North End Italian','Live music','Cocktails','Seaport dinner'];
  function qs(sel, root){ return (root || document).querySelector(sel); }
  function qsa(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s){ return String(s || '').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function token(){ try{return typeof window.SLAuth?.token==='function' ? window.SLAuth.token() : (localStorage.getItem('sl_jwt_token')||'');}catch(_){return '';} }
  function getRecent(){ try{return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]').filter(Boolean).slice(0,6);}catch(_){return [];} }
  function saveRecent(q){ q=String(q||'').trim(); if(!q) return; var items=[q].concat(getRecent().filter(function(x){return x.toLowerCase()!==q.toLowerCase();})).slice(0,6); try{localStorage.setItem(RECENT_KEY,JSON.stringify(items));}catch(_){} }
  function api(path,signal){ var h={'Accept':'application/json'}; var t=token(); if(t) h.Authorization='Bearer '+t; return fetch(API+path,{headers:h,credentials:'omit',cache:'no-store',signal:signal}).then(function(r){return r.text().then(function(txt){var d=null;try{d=txt?JSON.parse(txt):null;}catch(_){d={raw:txt};} if(!r.ok){var e=new Error(d&&d.error||('HTTP '+r.status));e.status=r.status;throw e;} return d;});}); }
  function venueUrl(v){ return '/explore.html?' + (v.slug ? 'venue=' + encodeURIComponent(v.slug) : 'venue_id=' + encodeURIComponent(v.id || '')); }
  function initials(name){ return String(name||'?').trim().split(/\s+/).slice(0,2).map(function(x){return x[0]||'';}).join('').toUpperCase() || '?'; }
  function thumbnail(url, label){
    return '<span class="slus-thumb" aria-hidden="true" data-slus-fallback="'+esc(label)+'">'+(url?'<img loading="lazy" decoding="async" src="'+esc(url)+'" alt="">':esc(label))+'</span>';
  }
  function itemHtml(kind, obj){
    if(kind==='venue'){
      var img=obj.thumbnail_url||obj.cover_image_url||obj.image_url||'';
      return '<a class="slus-item" data-slus-item href="'+esc(venueUrl(obj))+'" data-slus-label="'+esc(obj.name)+'">'+
        thumbnail(img,'⌖')+
        '<span class="slus-copy"><span class="slus-name">'+esc(obj.name||'Venue')+'</span> <span class="slus-meta">'+esc([obj.cuisine||obj.category||obj.type,obj.neighborhood].filter(Boolean).join(' · ')||'Boston venue')+'</span></span>'+
        '<span class="slus-kind">Venue</span></a>';
    }
    if(kind==='event'){
      var date = /^\d{4}-\d{2}-\d{2}$/.test(obj.date||'') ? new Date(obj.date+'T12:00:00Z') : null;
      var day = date && Number.isFinite(date.valueOf()) ? date.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'America/New_York'}) : '';
      return '<a class="slus-item" data-slus-item href="/events.html?event='+encodeURIComponent(obj.id)+'" data-slus-label="'+esc(obj.title)+'">'+
        thumbnail('', '◷')+
        '<span class="slus-copy"><span class="slus-name">'+esc(obj.title)+'</span> <span class="slus-meta">'+esc([day,obj.venue_name].filter(Boolean).join(' · ')||'Reviewed Boston event')+'</span></span>'+
        '<span class="slus-kind">Event</span></a>';
    }
    if(kind==='person'){
      return '<a class="slus-item" data-slus-item href="/profile.html?user='+encodeURIComponent(obj.username||obj.id||'')+'" data-slus-label="'+esc(obj.display_name||obj.username)+'">'+
        thumbnail(obj.avatar_url,initials(obj.display_name||obj.username))+
        '<span class="slus-copy"><span class="slus-name">'+esc(obj.display_name||obj.username||'SceneLink user')+'</span> <span class="slus-meta">@'+esc(obj.username||'user')+(obj.neighborhood?' · '+esc(obj.neighborhood):'')+'</span></span>'+
        '<span class="slus-kind">Person</span></a>';
    }
    if(kind==='neighborhood'){
      return '<a class="slus-item" data-slus-item href="/explore.html?neighborhood='+encodeURIComponent(obj.name||obj.neighborhood||obj.label||'')+'" data-slus-label="'+esc(obj.name||obj.neighborhood||obj.label)+'">'+
        '<span class="slus-thumb"><i class="fas fa-map"></i></span><span class="slus-copy"><span class="slus-name">'+esc(obj.name||obj.neighborhood||obj.label)+'</span> <span class="slus-meta">'+esc(Number.isInteger(obj.count)?obj.count+' Boston venues':'Explore this neighborhood')+'</span></span><span class="slus-kind">Area</span></a>';
    }
    return '<a class="slus-item" data-slus-item href="/explore.html?q='+encodeURIComponent(obj.name||obj.label||'')+'" data-slus-label="'+esc(obj.name||obj.label)+'"><span class="slus-thumb"><i class="fas fa-tags"></i></span><span class="slus-copy"><span class="slus-name">'+esc(obj.name||obj.label||'Category')+'</span> <span class="slus-meta">'+esc(Number.isInteger(obj.count)?obj.count+' matches':'Explore this category')+'</span></span><span class="slus-kind">Type</span></a>';
  }
  function openConcierge(q){
    q = String(q || '').trim();
    q = q.slice(0,500);
    if(window.__SL_PHASE8D_RECOVERY__) window.dispatchEvent(new CustomEvent('sl-concierge-draft',{detail:{prompt:q}}));
    else if(window.SLConcierge && typeof window.SLConcierge.draft==='function') { if(q) window.SLConcierge.draft(q); else window.SLConcierge.open(); }
    else window.location.href='/tonight.html?ask='+encodeURIComponent(q || 'Plan my night in Boston');
  }
  function ensureHeaderSearch(){
    if (qs('.sl-universal-search')) return qs('.sl-universal-search');
    var host = qs('[data-sl-universal-search-host]') || qs('.sl-phase8-nav-inner') || qs('.nav-enhanced') || qs('.header-content') || qs('.sl-explore-header') || qs('.sl-header-enhanced') || qs('#mainHeader nav') || qs('header');
    if (!host) return null;
    var wrap=document.createElement('div');
    wrap.className='sl-universal-search';
    wrap.setAttribute('role','search');
    wrap.setAttribute('aria-label','Sitewide search');
    wrap.innerHTML='<div class="slus-box"><span class="slus-icon">'+SEARCH_ICON+'</span>'+
      '<input class="slus-input" type="search" maxlength="120" enterkeyhint="search" placeholder="Venues, events, people…" aria-label="Search SceneLink" role="combobox" aria-autocomplete="list" aria-controls="slusSuggestions" aria-expanded="false" autocomplete="off">'+
      '<button class="slus-clear" type="button" aria-label="Clear search" hidden><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m7 7 10 10M17 7 7 17"/></svg></button>'+
      '<kbd class="slus-shortcut" aria-hidden="true">'+(/Mac|iPad|iPhone/.test((window.navigator && window.navigator.platform || ''))?'⌘ K':'Ctrl K')+'</kbd></div>'+
      '<button class="slus-ai" type="button" aria-label="Ask Concierge" aria-haspopup="dialog" title="Open Concierge. Your search stays a draft until you send it.">'+ASK_ICON+'<span>Ask Concierge</span></button>'+
      '<output class="slus-announcer" role="status" aria-live="polite"></output>'+
      '<div class="slus-panel" id="slusSuggestions" role="listbox" aria-label="SceneLink search suggestions"><div class="slus-scroll"></div></div>';
    var right = qs('.sl-phase8-actions',host) || qs('.nav-right',host) || qs('.header-actions',host);
    if (right && right.parentNode===host) host.insertBefore(wrap,right); else host.appendChild(wrap);
    host.classList.add('sl-search-ready');
    return wrap;
  }
  var debounceTimer=null, activeIndex=-1, lastQuery='', searchGeneration=0, inFlight=null;
  function cancelRequest(){ if(inFlight) inFlight.abort(); inFlight=null; }
  function announce(root, message){ qs('.slus-announcer',root).textContent=message; }
  function askRow(q){ return '<div class="slus-section slus-assist"><button class="slus-item" type="button" data-slus-item data-slus-ask-ai="'+esc(q)+'"><span class="slus-thumb">'+ASK_ICON+'</span><span class="slus-copy"><span class="slus-name">Ask Concierge</span> <span class="slus-meta">Use “'+esc(q)+'” as an unsent draft</span></span><span class="slus-kind">Plan</span></button></div>'; }
  function section(title, html){ return html ? '<div class="slus-section"><div class="slus-title">'+esc(title)+'</div>'+html+'</div>' : ''; }
  function chips(title, arr){ if(!arr||!arr.length)return ''; return '<div class="slus-section"><div class="slus-title">'+esc(title)+'</div><div class="slus-chiprow">'+arr.map(function(x){return '<button class="slus-chip" type="button" data-slus-item data-slus-chip="'+esc(x)+'">'+esc(x)+'</button>';}).join('')+'</div></div>'; }
  function renderDefault(root){
    var sc=qs('.slus-scroll',root), recent=getRecent();
    sc.innerHTML = (recent.length?chips('Recent searches',recent):'') + chips('Try a Boston search', TRENDING) + '<div class="slus-empty">Try a venue, event, neighborhood or username. Press Enter to search Explore.</div>';
    announce(root,'');
    setActive(root,-1);
  }
  function setActive(root, idx){
    var items=qsa('[data-slus-item]',root), input=qs('.slus-input',root);
    activeIndex=idx>=0&&idx<items.length?idx:-1;
    items.forEach(function(it,i){it.id='slusOption'+i;it.setAttribute('role','option');it.setAttribute('aria-selected',String(i===activeIndex));it.classList.toggle('active',i===activeIndex);});
    if(activeIndex<0) input.removeAttribute('aria-activedescendant');
    else {input.setAttribute('aria-activedescendant',items[activeIndex].id);if(typeof items[activeIndex].scrollIntoView==='function')items[activeIndex].scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  function setOpen(root, value){root.classList.toggle('open',value);qs('.slus-input',root).setAttribute('aria-expanded',String(value));if(!value)setActive(root,-1);}

  function renderResults(root, data, q, limited){
    var sc=qs('.slus-scroll',root);
    var venues=Array.isArray(data&&data.venues)?data.venues:[], people=Array.isArray(data&&data.users)?data.users:[], hoods=Array.isArray(data&&data.neighborhoods)?data.neighborhoods:[], cats=Array.isArray(data&&data.categories)?data.categories:[];
    var html='';
    html += section('Venues', venues.slice(0,6).map(function(v){return itemHtml('venue',v);}).join(''));
    html += section('People', people.slice(0,4).map(function(u){return itemHtml('person',u);}).join(''));
    html += section('Neighborhoods', hoods.slice(0,4).map(function(n){return itemHtml('neighborhood',n);}).join(''));
    html += section('Categories', cats.slice(0,4).map(function(c){return itemHtml('category',c);}).join(''));
    var events=(Array.isArray(data&&data.events)?data.events:[]).filter(function(event){
      return event && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(event.id||'') && typeof event.title==='string' && event.title.trim();
    }).slice(0,4);
    html += section('Events',events.map(function(event){return itemHtml('event',event);}).join(''));
    var count=Math.min(6,venues.length)+Math.min(4,people.length)+Math.min(4,hoods.length)+Math.min(4,cats.length)+events.length;
    if(!count) html='<div class="slus-empty"><strong>No matches for “'+esc(q)+'”</strong><br>Try a shorter search or a different neighborhood.</div>';
    sc.innerHTML=(limited?'<div class="slus-status">Only venue results are available right now. Try again for events and people.</div>':'')+html+askRow(q);
    announce(root,limited?'Limited search. Only venue results are available.':(count ? count+' search suggestion'+(count===1?'':'s')+'.' : 'No direct matches.'));
    setActive(root,-1);
  }
  function fetchResults(root,q){
    lastQuery=q;
    var controller=typeof AbortController==='function'?new AbortController():null;
    inFlight=controller;
    var signal=controller?controller.signal:undefined;
    var generation=++searchGeneration, session=token();
    function current(){return generation===searchGeneration&&lastQuery===q&&session===token();}
    setActive(root,-1);
    var sc=qs('.slus-scroll',root); sc.innerHTML='<div class="slus-status"><i class="fas fa-spinner fa-spin"></i> Searching SceneLink…</div>';
    api('/search/universal?q='+encodeURIComponent(q)+'&limit=6',signal).then(function(data){ if(current()) renderResults(root,data,q); }).catch(function(){
      if(!current())return;
      api('/venues?search='+encodeURIComponent(q)+'&limit=6',signal).then(function(data){ if(current()) renderResults(root,{venues:(data&&data.venues)||[]},q,true); }).catch(function(){ if(current()){ sc.innerHTML='<div class="slus-empty"><strong>Search is temporarily unavailable</strong><br>Press Enter to try Explore or retry your search.</div>'+askRow(q); announce(root,'Search is temporarily unavailable.'); setActive(root,-1); } });
    });
  }
  function goSearch(q){ q=String(q||'').trim(); if(!q) return; saveRecent(q); window.location.href='/explore.html?q='+encodeURIComponent(q); }
  function bind(root){
    var input=qs('.slus-input',root), panel=qs('.slus-panel',root), ai=qs('.slus-ai',root); var clear=qs('.slus-clear',root); if(!input||!panel)return;
    // Capture non-bubbling image errors before asynchronous results are inserted.
    // A text fallback needs no image fetch and cannot enter a retry loop.
    root.addEventListener('error',function(e){
      var img=e.target, thumb=img&&img.parentElement;
      if(!img||img.tagName!=='IMG'||!thumb||!thumb.hasAttribute('data-slus-fallback'))return;
      thumb.textContent=thumb.getAttribute('data-slus-fallback')||'⌖';
    },true);
    function open(){ setOpen(root,true); if(!input.value.trim()) renderDefault(root); }
    function close(){ setTimeout(function(){ if(!root.contains(document.activeElement)) setOpen(root,false); }, 0); }
    function resetSession(){searchGeneration++;lastQuery='';clearTimeout(debounceTimer);cancelRequest();input.value='';if(clear)clear.hidden=true;root.classList.remove('slus-has-query');renderDefault(root);setOpen(root,false);}
    ['sl-auth-change','sl-auth-changed','sl-auth-ready'].forEach(function(type){window.addEventListener(type,resetSession);document.addEventListener(type,resetSession);});
    window.addEventListener('storage',function(e){if(e.key===null||e.key==='sl_jwt_token'||e.key==='sl_auth_token')resetSession();});
    input.addEventListener('focus',open); root.addEventListener('focusout',close);
    document.addEventListener('click',function(e){if(!root.contains(e.target))setOpen(root,false);});
    root.addEventListener('keydown',function(e){if(e.key==='Escape'&&e.target!==input){e.preventDefault();input.focus();setOpen(root,false);}});
    var composing=false;
    function update(){
      var q=input.value.trim().slice(0,120); setActive(root,-1); lastQuery=q;
      if(clear) clear.hidden=!input.value;
      root.classList.toggle('slus-has-query',!!input.value);
      searchGeneration++; clearTimeout(debounceTimer); cancelRequest(); open();
      if(!q) return;
      if(composing){ qs('.slus-scroll',root).textContent=''; return; }
      qs('.slus-scroll',root).innerHTML='<div class="slus-status">Searching SceneLink…</div>';
      announce(root,'');
      debounceTimer=setTimeout(function(){ fetchResults(root,q); },160);
    }
    input.addEventListener('input',update);
    input.addEventListener('compositionstart',function(){composing=true;});
    input.addEventListener('compositionend',function(){composing=false;update();});
    if(clear) clear.addEventListener('click',function(){input.value='';input.focus();update();});
    input.addEventListener('keydown',function(e){ if(e.isComposing||composing)return; var items=qsa('[data-slus-item]',root); if(e.key==='ArrowDown'){ e.preventDefault(); if(!root.classList.contains('open')) {open();items=qsa('[data-slus-item]',root);} setActive(root,Math.min(activeIndex+1,items.length-1)); } else if(e.key==='ArrowUp'){ e.preventDefault(); if(!root.classList.contains('open')) open(); setActive(root,Math.max(activeIndex-1,0)); } else if(e.key==='Enter'){ e.preventDefault(); if(activeIndex>=0&&items[activeIndex]){ var label=items[activeIndex].getAttribute('data-slus-label'); if(label) saveRecent(input.value); items[activeIndex].click(); } else goSearch(input.value); } else if(e.key==='Escape'){ setOpen(root,false); input.blur(); } });
    // Keep pointer focus in the search until click; activate equally for keyboard and touch.
    root.addEventListener('mousedown',function(e){if(e.target.closest('[data-slus-chip],[data-slus-ask-ai]'))e.preventDefault();});
    root.addEventListener('click',function(e){ var chip=e.target.closest('[data-slus-chip]'); if(chip){ e.preventDefault(); input.value=chip.getAttribute('data-slus-chip')||chip.textContent; input.dispatchEvent(new Event('input')); input.focus(); } var selected=e.target.closest('a[data-slus-label]'); if(selected) saveRecent(input.value); var ask=e.target.closest('[data-slus-ask-ai]'); if(ask){ e.preventDefault(); var q=ask.getAttribute('data-slus-ask-ai')||input.value; setOpen(root,false); openConcierge(q); } });
    if(ai) ai.addEventListener('click',function(){ setOpen(root,false); openConcierge(input.value); });
  }
  function hotkeys(){ document.addEventListener('keydown',function(e){ if((e.metaKey||e.ctrlKey)&&String(e.key).toLowerCase()==='k'){ var i=qs('.slus-input'); if(i){ e.preventDefault(); i.focus(); i.select(); } } }); }
  function mountConciergeLauncher(){
    if (qs('.sl-concierge-launcher') || !window.__SL_PHASE8D_RECOVERY__ || /\/(?:admin|offline|404)(?:\.html)?\/?$/.test(window.location.pathname || '')) return;
    var launch=document.createElement('button');
    launch.type='button';
    launch.className='sl-concierge-launcher';
    launch.setAttribute('aria-label','Open SceneLink Concierge');
    launch.setAttribute('aria-haspopup','dialog');
    launch.setAttribute('aria-expanded','false');
    launch.innerHTML=ASK_ICON+'<span>Concierge</span>';
    launch.addEventListener('click',function(){
      if (window.SLConcierge && document.body.classList.contains('slc-open')) window.SLConcierge.close();
      else openConcierge('');
    });
    window.addEventListener('sl:concierge-opened',function(){
      launch.setAttribute('aria-expanded','true');
      launch.setAttribute('aria-controls','slConciergePanel');
      launch.setAttribute('aria-label','Close SceneLink Concierge');
    });
    window.addEventListener('sl:concierge-closed',function(){
      launch.setAttribute('aria-expanded','false'); launch.setAttribute('aria-label','Open SceneLink Concierge');
    });
    document.body.classList.add('sl-has-concierge-launcher');
    document.body.appendChild(launch);
  }
  function boot(){
    var root=ensureHeaderSearch();
    if(!root) return;
    bind(root); hotkeys();
    document.addEventListener('click',function(e){
      var trigger=e.target?.closest?.('[data-sl-open-search]');
      if(!trigger||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      var input=qs('.slus-input',root);if(!input)return;
      e.preventDefault();
      var query=trigger.getAttribute('data-sl-open-search');
      if(query){input.value=query;input.dispatchEvent(new Event('input'));}
      input.focus();
    });
    if(window.__SL_PHASE8D_RECOVERY__) mountConciergeLauncher();
    else if(document.readyState!=='complete') document.addEventListener('DOMContentLoaded',mountConciergeLauncher,{once:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
