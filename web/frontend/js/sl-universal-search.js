/* SceneLink Phase 8C universal search — one component across all pages. */
(function(){
  'use strict';
  if (window.__SL_UNIVERSAL_SEARCH_BOOTED__) return;
  window.__SL_UNIVERSAL_SEARCH_BOOTED__ = true;
  var API = '/api';
  var RECENT_KEY = 'sl_recent_searches_v1';
  var TRENDING = ['Date night','Rooftop bars','North End Italian','Live music','Cocktails','Seaport dinner'];
  function qs(sel, root){ return (root || document).querySelector(sel); }
  function qsa(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s){ return String(s || '').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function token(){ try{return localStorage.getItem('sl_jwt_token')||localStorage.getItem('sl_auth_token')||'';}catch(_){return '';} }
  function getRecent(){ try{return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]').filter(Boolean).slice(0,6);}catch(_){return [];} }
  function saveRecent(q){ q=String(q||'').trim(); if(!q) return; var items=[q].concat(getRecent().filter(function(x){return x.toLowerCase()!==q.toLowerCase();})).slice(0,6); try{localStorage.setItem(RECENT_KEY,JSON.stringify(items));}catch(_){} }
  function api(path){ var h={'Accept':'application/json'}; var t=token(); if(t) h.Authorization='Bearer '+t; return fetch(API+path,{headers:h,credentials:'omit'}).then(function(r){return r.text().then(function(txt){var d=null;try{d=txt?JSON.parse(txt):null;}catch(_){d={raw:txt};} if(!r.ok){var e=new Error(d&&d.error||('HTTP '+r.status));e.status=r.status;throw e;} return d;});}); }
  function venueUrl(v){ return '/explore.html?' + (v.slug ? 'venue=' + encodeURIComponent(v.slug) : 'venue_id=' + encodeURIComponent(v.id || '')); }
  function initials(name){ return String(name||'?').trim().split(/\s+/).slice(0,2).map(function(x){return x[0]||'';}).join('').toUpperCase() || '?'; }
  function itemHtml(kind, obj){
    if(kind==='venue'){
      var img=obj.thumbnail_url||obj.cover_image_url||obj.image_url||'';
      return '<a class="slus-item" data-slus-item href="'+esc(venueUrl(obj))+'" data-slus-label="'+esc(obj.name)+'">'+
        '<span class="slus-thumb">'+(img?'<img loading="lazy" decoding="async" src="'+esc(img)+'" alt="">':'<i class="fas fa-location-dot"></i>')+'</span>'+
        '<span><span class="slus-name">'+esc(obj.name||'Venue')+'</span><span class="slus-meta">'+esc([obj.cuisine||obj.category||obj.type,obj.neighborhood].filter(Boolean).join(' · ')||'Boston venue')+'</span></span>'+
        '<span class="slus-kind">Venue</span></a>';
    }
    if(kind==='person'){
      return '<a class="slus-item" data-slus-item href="/profile.html?user='+encodeURIComponent(obj.username||obj.id||'')+'" data-slus-label="'+esc(obj.display_name||obj.username)+'">'+
        '<span class="slus-thumb">'+(obj.avatar_url?'<img loading="lazy" decoding="async" src="'+esc(obj.avatar_url)+'" alt="">':esc(initials(obj.display_name||obj.username)))+'</span>'+
        '<span><span class="slus-name">'+esc(obj.display_name||obj.username||'SceneLink user')+'</span><span class="slus-meta">@'+esc(obj.username||'user')+(obj.neighborhood?' · '+esc(obj.neighborhood):'')+'</span></span>'+
        '<span class="slus-kind">Person</span></a>';
    }
    if(kind==='neighborhood'){
      return '<a class="slus-item" data-slus-item href="/explore.html?neighborhood='+encodeURIComponent(obj.neighborhood||obj.label||'')+'" data-slus-label="'+esc(obj.neighborhood||obj.label)+'">'+
        '<span class="slus-thumb"><i class="fas fa-map"></i></span><span><span class="slus-name">'+esc(obj.neighborhood||obj.label)+'</span><span class="slus-meta">'+esc(obj.count||'')+' Boston venues</span></span><span class="slus-kind">Area</span></a>';
    }
    return '<a class="slus-item" data-slus-item href="/explore.html?q='+encodeURIComponent(obj.label||'')+'" data-slus-label="'+esc(obj.label)+'"><span class="slus-thumb"><i class="fas fa-tags"></i></span><span><span class="slus-name">'+esc(obj.label||'Category')+'</span><span class="slus-meta">'+esc(obj.count||'')+' matches</span></span><span class="slus-kind">Type</span></a>';
  }
  function openConcierge(q){
    q = String(q || '').trim() || 'Plan my night in Boston';
    var trigger = qs('[data-sl-concierge]');
    if (trigger) { trigger.setAttribute('data-sl-concierge', q); trigger.click(); return; }
    window.dispatchEvent(new CustomEvent('sl-open-concierge',{detail:{prompt:q}}));
    setTimeout(function(){ if(!qs('.sl-ai-concierge,.ai-concierge,.concierge-modal')) window.location.href='/contact.html?ai='+encodeURIComponent(q); }, 160);
  }
  function ensureHeaderSearch(){
    if (qs('.sl-universal-search')) return qs('.sl-universal-search');
    var host = qs('[data-sl-universal-search-host]') || qs('.sl-phase8-nav-inner') || qs('.nav-enhanced') || qs('.header-content') || qs('.sl-header-enhanced') || qs('#mainHeader nav') || qs('header');
    if (!host) return null;
    var wrap=document.createElement('div');
    wrap.className='sl-universal-search';
    wrap.setAttribute('role','search');
    wrap.innerHTML='<div class="slus-box"><i class="fas fa-search slus-icon" aria-hidden="true"></i><input class="slus-input" type="search" placeholder="Search venues, neighborhoods, people, or vibes" aria-label="Search SceneLink" autocomplete="off"><button class="slus-ai" type="button" title="Ask AI Concierge about your search"><i class="fas fa-magic"></i><span>Ask</span></button></div><div class="slus-panel" role="listbox"><div class="slus-scroll"></div></div>';
    var right = qs('.sl-phase8-actions',host) || qs('.nav-right',host) || qs('.header-actions',host);
    if (right && right.parentNode===host) host.insertBefore(wrap,right); else host.appendChild(wrap);
    return wrap;
  }
  var debounceTimer=null, activeIndex=-1, lastQuery='';
  function section(title, html){ return html ? '<div class="slus-section"><div class="slus-title">'+esc(title)+'</div>'+html+'</div>' : ''; }
  function chips(title, arr){ if(!arr||!arr.length)return ''; return '<div class="slus-section"><div class="slus-title">'+esc(title)+'</div><div class="slus-chiprow">'+arr.map(function(x){return '<button class="slus-chip" type="button" data-slus-chip="'+esc(x)+'">'+esc(x)+'</button>';}).join('')+'</div></div>'; }
  function renderDefault(root){
    var sc=qs('.slus-scroll',root), recent=getRecent();
    sc.innerHTML = chips('Trending', TRENDING) + (recent.length?chips('Recent',recent):'') + '<div class="slus-empty">Type a venue, neighborhood, cuisine, person, or vibe. Press <strong>Enter</strong> to open Explore, or choose <strong>Ask AI</strong>.</div>';
  }
  function setActive(root, idx){ var items=qsa('[data-slus-item]',root); activeIndex=idx; items.forEach(function(it,i){ it.classList.toggle('active',i===idx); }); }
  function renderResults(root, data, q){
    var sc=qs('.slus-scroll',root);
    var venues=(data&&data.venues)||[], people=(data&&data.people)||[], hoods=(data&&data.neighborhoods)||[], cats=(data&&data.categories)||[];
    var html='';
    html += section('Venues', venues.slice(0,6).map(function(v){return itemHtml('venue',v);}).join(''));
    html += section('People', people.slice(0,4).map(function(u){return itemHtml('person',u);}).join(''));
    html += section('Neighborhoods', hoods.slice(0,4).map(function(n){return itemHtml('neighborhood',n);}).join(''));
    html += section('Categories', cats.slice(0,4).map(function(c){return itemHtml('category',c);}).join(''));
    html += '<div class="slus-section"><button class="slus-item" type="button" data-slus-ask-ai="'+esc(q)+'"><span class="slus-thumb"><i class="fas fa-magic"></i></span><span><span class="slus-name">Ask AI Concierge</span><span class="slus-meta">Build a night around “'+esc(q)+'”</span></span><span class="slus-kind">AI</span></button></div>';
    if(!venues.length&&!people.length&&!hoods.length&&!cats.length) html='<div class="slus-empty">No direct matches yet. Press Enter to search Explore, or ask AI Concierge for “'+esc(q)+'”.</div>' + html;
    sc.innerHTML=html; setActive(root,-1);
  }
  function fetchResults(root,q){
    lastQuery=q;
    var sc=qs('.slus-scroll',root); sc.innerHTML='<div class="slus-status"><i class="fas fa-spinner fa-spin"></i> Searching SceneLink…</div>';
    api('/search/universal?q='+encodeURIComponent(q)+'&limit=6').then(function(data){ if(lastQuery===q) renderResults(root,data,q); }).catch(function(){
      api('/venues?search='+encodeURIComponent(q)+'&limit=6').then(function(data){ if(lastQuery===q) renderResults(root,{venues:(data&&data.venues)||[]},q); }).catch(function(){ if(lastQuery===q) sc.innerHTML='<div class="slus-empty">Search is temporarily unavailable. Press Enter to open Explore.</div>'; });
    });
  }
  function goSearch(q){ q=String(q||'').trim(); if(!q) return; saveRecent(q); window.location.href='/explore.html?q='+encodeURIComponent(q); }
  function bind(root){
    var input=qs('.slus-input',root), panel=qs('.slus-panel',root), ai=qs('.slus-ai',root); if(!input||!panel)return;
    function open(){ root.classList.add('open'); if(!input.value.trim()) renderDefault(root); }
    function close(){ setTimeout(function(){ root.classList.remove('open'); }, 130); }
    input.addEventListener('focus',open); input.addEventListener('blur',close);
    input.addEventListener('input',function(){ var q=input.value.trim(); open(); clearTimeout(debounceTimer); if(!q){ renderDefault(root); return; } debounceTimer=setTimeout(function(){ fetchResults(root,q); }, 160); });
    input.addEventListener('keydown',function(e){ var items=qsa('[data-slus-item]',root); if(e.key==='ArrowDown'){ e.preventDefault(); if(!root.classList.contains('open')) open(); setActive(root,Math.min(activeIndex+1,items.length-1)); } else if(e.key==='ArrowUp'){ e.preventDefault(); setActive(root,Math.max(activeIndex-1,0)); } else if(e.key==='Enter'){ e.preventDefault(); if(activeIndex>=0&&items[activeIndex]){ var label=items[activeIndex].getAttribute('data-slus-label'); if(label) saveRecent(label); items[activeIndex].click(); } else goSearch(input.value); } else if(e.key==='Escape'){ root.classList.remove('open'); input.blur(); } });
    root.addEventListener('mousedown',function(e){ var chip=e.target.closest('[data-slus-chip]'); if(chip){ e.preventDefault(); input.value=chip.getAttribute('data-slus-chip')||chip.textContent; input.dispatchEvent(new Event('input')); input.focus(); } var ask=e.target.closest('[data-slus-ask-ai]'); if(ask){ e.preventDefault(); var q=ask.getAttribute('data-slus-ask-ai')||input.value; saveRecent(q); openConcierge(q); } });
    if(ai) ai.addEventListener('click',function(){ openConcierge(input.value||'Plan my night in Boston'); });
  }
  function hotkeys(){ document.addEventListener('keydown',function(e){ if((e.metaKey||e.ctrlKey)&&String(e.key).toLowerCase()==='k'){ var i=qs('.slus-input'); if(i){ e.preventDefault(); i.focus(); i.select(); } } }); }
  function boot(){ var root=ensureHeaderSearch(); if(root){ bind(root); hotkeys(); } }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
