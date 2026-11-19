/**
 * SceneLink — Phase 9A Social Feed Hub (js/sl-social-feed-9a.js)
 *
 * Drives social-feed.html using window.SL.social.*. Populates the EXISTING shell:
 *   #socialLanding  (logged-out premium landing — shown when not authed)
 *   #socialFeed     (logged-in hub — composer, feed, sidebar)
 *
 * Real data only. No fakes. Loaders clear on success/failure/timeout/logged-out.
 * Never blocks the app shell. Pagination via cursor. Friend requests, suggestions,
 * stats, trending, messages preview, notifications preview — all real.
 *
 * Requires: js/sl-social-core.js (window.SL.social)
 */
(function () {
  'use strict';

  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn); else fn(); }

  function social(){ return (window.SL && window.SL.social) || null; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function $(id){ return document.getElementById(id); }
  function initial(name){ return (String(name||'S').trim().charAt(0)||'S').toUpperCase(); }
  function timeAgo(iso){
    if(!iso) return 'just now';
    var s=Math.floor((Date.now()-new Date(iso).getTime())/1000);
    if(s<5) return 'just now';
    if(s<60) return s+'s';
    if(s<3600) return Math.floor(s/60)+'m';
    if(s<86400) return Math.floor(s/3600)+'h';
    if(s<604800) return Math.floor(s/86400)+'d';
    return new Date(iso).toLocaleDateString();
  }
  function avatarHtml(url, name, size){
    size = size||40;
    if(url){
      return '<img src="'+esc(url)+'" alt="" width="'+size+'" height="'+size+'" loading="lazy" '+
        'style="width:'+size+'px;height:'+size+'px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#1a1a1a;" '+
        'onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'sl-avatar-fallback\',textContent:\''+esc(initial(name))+'\',style:\'width:'+size+'px;height:'+size+'px;border-radius:50%;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;\'}))">';
    }
    return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;font-size:'+Math.round(size*0.4)+'px;">'+esc(initial(name))+'</div>';
  }

  var STATE = {
    me: null,
    feed: [],
    nextCursor: null,
    hasMore: false,
    loadingFeed: false,
    feedRequest: 0,
    activeTab: 'all',
    mediaEnabled: false,
    booted: false,
    session: null,
    epoch: 0,
    postBusy: false,
    postAttempt: null,
    commentAttempts: Object.create(null)
  };

  function sessionToken(){
    try {
      if(window.SLAuth && window.SLAuth.getToken) return window.SLAuth.getToken() || '';
      if(window.SLApi && window.SLApi.getToken) return window.SLApi.getToken() || '';
      return localStorage.getItem('sl_jwt_token') || '';
    } catch(_){ return ''; }
  }
  function forSession(callback){
    var epoch=STATE.epoch, token=STATE.session;
    return function(){
      if(epoch!==STATE.epoch || token!==sessionToken()) return;
      return callback.apply(this,arguments);
    };
  }
  var sessionCleanups=[];
  function clearPrivateState(){
    sessionCleanups.splice(0).forEach(function(close){close();});
    STATE.me=null;STATE.feed=[];STATE.nextCursor=null;STATE.hasMore=false;STATE.loadingFeed=false;
    STATE.feedRequest++;STATE.activeTab='all';renderFeedTabs();
    STATE.pendingImage=null;STATE.mediaEnabled=false;pendingVenue=null;STATE.postBusy=false;STATE.postAttempt=null;STATE.commentAttempts=Object.create(null);
    ['sfFeedContent','sfSuggestions','sfTrending','sfStories','sfComposerExtra','sfPostStatus'].forEach(function(id){var el=$(id);if(el)el.innerHTML='';});
    ['sfRequestsCard','sfMessagesCard'].forEach(function(id){var el=$(id);if(el)el.remove();});
    ['sfStatCheckins','sfStatReviews','sfStatSaved','sfStatScene'].forEach(function(id){setText(id,'—');});
    var avatar=$('sfUserAvatar');if(avatar)avatar.textContent='?';
    var input=$('sfCreateInput');if(input){input.value='';input.placeholder="Share what you're up to tonight...";}
    var post=$('sfPostBtn');if(post){post.disabled=false;post.textContent='Post';}
    var audience=$('sfAudience');if(audience)audience.value='friends';
    document.querySelectorAll('[data-sf-session-toast]').forEach(function(el){el.remove();});
  }

  // ── Boot / auth toggle ──────────────────────────────────────────────
  function boot(force){
    var s = social();
    var landing = $('socialLanding');
    var feed = $('socialFeed');
    if(!landing || !feed){ return; } // not the social page shell

    if(!s){
      // social core failed to load → show landing (logged-out clean state), never spin
      showLanding(); 
      return;
    }

    var next=sessionToken();
    if(STATE.session===next && force!==true) return;
    var changed=STATE.session!==next;STATE.session=next;STATE.epoch++;
    if(changed)clearPrivateState();
    if(s.isLoggedIn()){
      showFeed();
      loadMe().then(forSession(function(){
        if(!STATE.me){
          var content=$('sfFeedContent');if(content){content.innerHTML=errorState('Could not load your account.', 'sfRetryAccount');var retry=$('sfRetryAccount');if(retry)retry.onclick=function(){boot(true);};}
          return;
        }
        renderComposerIdentity();
        loadFeed(true);
        loadSidebar();
        detectMedia();
      }));
    } else {
      showLanding();
    }
  }

  function showLanding(){
    STATE.epoch++;clearPrivateState();
    var landing=$('socialLanding'), feed=$('socialFeed');
    if(landing){ landing.classList.remove('hidden'); landing.style.display=''; }
    if(feed){ feed.classList.remove('active'); feed.style.display='none'; }
  }
  function showFeed(){
    var landing=$('socialLanding'), feed=$('socialFeed');
    if(landing){ landing.classList.add('hidden'); landing.style.display='none'; }
    if(feed){ feed.classList.add('active'); feed.style.display=''; }
  }

  function loadMe(){
    var s=social();
    return s.getMe().then(forSession(function(r){
      STATE.me = (r.ok && r.data && (r.data.user||r.data)) || null;
      if(!STATE.me && r.loggedOut){ showLanding(); }
      return STATE.me;
    }));
  }

  // ── Composer identity + actions ─────────────────────────────────────
  function renderComposerIdentity(){
    var av=$('sfUserAvatar');
    if(av && STATE.me){
      var name = STATE.me.display_name || (STATE.me.email||'').split('@')[0] || 'you';
      av.outerHTML = '<div id="sfUserAvatar">'+avatarHtml(STATE.me.avatar_url, name, 40)+'</div>';
    }
    var input=$('sfCreateInput');
    if(input && STATE.me){
      var fn=(STATE.me.display_name||'').split(' ')[0]||'';
      input.placeholder = fn ? ("What's the move tonight, "+fn+'?') : "Share what you're up to tonight...";
    }
  }

  function detectMedia(){
    var s=social();
    s.getMediaCapability().then(forSession(function(r){
      STATE.mediaEnabled = !!(r.ok && r.data && r.data.enabled===true && r.data.contract==='server-upload-v1');
      // Photo availability is explicit; this does not enable the provider.
      var photoBtn = document.querySelector('.sf-create-action[data-act="photo"]');
      if(photoBtn){photoBtn.setAttribute('title',STATE.mediaEnabled?'Choose a PNG, JPEG or WebP image up to 4 MB':'Photo uploads are not connected');photoBtn.style.opacity=STATE.mediaEnabled?'':'0.55';}
    }));
  }

  function wireComposer(){
    var input=$('sfCreateInput');
    var postBtn=$('sfPostBtn');
    var composer=document.querySelector('.sf-create');
    if(composer&&!$('sfAudience')){
      var label=document.createElement('label');label.style.cssText='display:block;margin:12px 0;color:#ccc;font-size:13px';
      label.innerHTML='Post audience <select id="sfAudience" style="margin-left:8px;padding:7px;background:#181818;color:#fff;border:1px solid #D4AF37;border-radius:6px"><option value="friends">Friends</option><option value="public">Public</option><option value="private">Only me</option></select>';
      composer.appendChild(label);
    }
    if(composer&&!$('sfPostStatus')){var postStatus=document.createElement('p');postStatus.id='sfPostStatus';postStatus.setAttribute('role','status');postStatus.style.cssText='font-size:13px;color:#ccc';composer.appendChild(postStatus);}
    var actions=document.querySelectorAll('.sf-create-action');

    if(postBtn && input){
      postBtn.addEventListener('click', submitPost);
      input.addEventListener('keydown', function(e){
        if((e.key==='Enter') && (e.metaKey||e.ctrlKey)){ e.preventDefault(); submitPost(); }
      });
    }

    // Tag legacy Photo / Plan controls. Visit logging always goes through the venue form.
    actions.forEach(function(btn){
      var label=(btn.textContent||'').toLowerCase();
      if(label.indexOf('photo')>=0) btn.setAttribute('data-act','photo');
      else if(label.indexOf('plan')>=0) btn.setAttribute('data-act','plan');
      btn.addEventListener('click', function(){ onComposerAction(btn.getAttribute('data-act')); });
    });

    // tabs
    document.querySelectorAll('.sf-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        var scope=tab.getAttribute('data-tab');
        if(!STATE.me || !['all','friends'].includes(scope) || STATE.activeTab===scope) return;
        STATE.activeTab=scope;
        renderFeedTabs();
        loadFeed(true);
      });
    });
  }

  function renderFeedTabs(){
    document.querySelectorAll('.sf-tab').forEach(function(tab){
      var active=tab.getAttribute('data-tab')===STATE.activeTab;
      tab.classList.toggle('active',active);
      tab.setAttribute('aria-pressed',String(active));
    });
  }

  var pendingVenue = null; // for attaching a venue to a post
  function onComposerAction(act){
    if(act==='visit'){ openVenuePicker(); }
    else if(act==='photo'){
      if(!STATE.mediaEnabled){ toast('Photo uploads are not connected.'); return; }
      openPhotoPicker();
    }
    else if(act==='plan'){ window.location.href='plan-with-friends.html'; }
  }

  function postSubmissionId(){
    if(window.crypto && window.crypto.randomUUID)return window.crypto.randomUUID();
    if(!window.crypto || !window.crypto.getRandomValues)throw Error('Use a secure browser to post safely.');
    var bytes=window.crypto.getRandomValues(new Uint8Array(16));bytes[6]=bytes[6]&15|64;bytes[8]=bytes[8]&63|128;
    var h=Array.from(bytes,function(b){return b.toString(16).padStart(2,'0');}).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function submitPost(){
    var input=$('sfCreateInput'); var postBtn=$('sfPostBtn');
    if(!input || !postBtn || STATE.postBusy || !STATE.me || STATE.session!==sessionToken()) return;
    var body=(input.value||'').trim();
    if(!body && !pendingVenue && !STATE.pendingImage){ input.focus(); return; }
    var payload={ body: body, audience: $('sfAudience') ? $('sfAudience').value : 'friends' };
    if(pendingVenue) payload.venue_id = pendingVenue.id;
    if(STATE.pendingImage) payload.image_url = STATE.pendingImage;
    var fingerprint=JSON.stringify(payload),attempt=STATE.postAttempt;
    try {if(!attempt||attempt.fingerprint!==fingerprint)attempt={id:postSubmissionId(),fingerprint:fingerprint};}
    catch(e){setText('sfPostStatus',e.message);return;}
    STATE.postAttempt=attempt;payload.client_id=attempt.id;STATE.postBusy=true;
    postBtn.disabled=true;postBtn.textContent='Posting…';setText('sfPostStatus','Saving your post…');
    social().createPost(payload).then(forSession(function(r){
      STATE.postBusy=false;postBtn.disabled=false;postBtn.textContent='Post';
      if(r.ok && (!r.data || !r.data.post || r.data.post.id!==attempt.id))r={ok:false,error:'The service did not confirm the saved post.'};
      if(r.ok){
        STATE.postAttempt=null;
        // Do not erase text or attachments added while the earlier post was saving.
        if(input.value.trim()===body)input.value='';
        if(pendingVenue && pendingVenue.id===payload.venue_id)pendingVenue=null;
        if(STATE.pendingImage===payload.image_url)STATE.pendingImage=null;
        if(!pendingVenue&&!STATE.pendingImage)clearComposerExtras();
        setText('sfPostStatus','Post saved.');loadFeed(true);loadSidebar();
      } else if(r.loggedOut){ showLanding(); }
      else {setText('sfPostStatus',(r.error||'Posting was not confirmed.')+' Try again without changing the post to avoid duplicates.');}
    }));
  }

  function clearComposerExtras(){
    var ex=$('sfComposerExtra'); if(ex) ex.innerHTML='';
  }
  function setComposerExtra(html){
    var create=document.querySelector('.sf-create');
    var ex=$('sfComposerExtra');
    if(!ex && create){ ex=document.createElement('div'); ex.id='sfComposerExtra'; ex.style.cssText='margin-top:8px;'; create.appendChild(ex); }
    if(ex) ex.innerHTML=html;
  }

  // ── Pick a venue to open its explicit visit form; never log on selection. ──
  function openVenuePicker(){
    var html='<div style="display:flex;gap:8px;align-items:center;background:#0c0c0c;border:1px solid rgba(212,175,55,.25);border-radius:10px;padding:8px;">'+
      '<i class="fas fa-location-dot" style="color:#D4AF37;"></i>'+
      '<input id="sfVenueSearch" aria-label="Find a venue to mark Been" placeholder="Find a venue to mark Been…" '+
        'style="flex:1;background:none;border:none;color:#fff;font-size:13px;outline:none;">'+
      '<button type="button" id="sfVenueCancel" aria-label="Close venue search" style="background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:16px;">&times;</button>'+
      '</div><div id="sfVenueResults" style="margin-top:6px;"></div>';
    setComposerExtra(html);
    var inp=$('sfVenueSearch'); if(inp) inp.focus();
    var cancel=$('sfVenueCancel'); if(cancel) cancel.addEventListener('click', clearComposerExtras);
    if(inp){
      var t=null;
      inp.addEventListener('input', forSession(function(){
        clearTimeout(t);
        var q=inp.value.trim();
        if(q.length<2){ $('sfVenueResults').innerHTML=''; return; }
        t=setTimeout(forSession(function(){ if(inp.isConnected && inp.value.trim()===q) searchVenues(q,inp); }), 250);
      }));
    }
  }

  function searchVenues(q,input){
    var box=$('sfVenueResults'); if(!box) return;
    function current(){return box.isConnected && input.isConnected && input.value.trim()===q;}
    box.innerHTML='<div role="status">Searching…</div>';
    // venue search endpoint (public)
    fetch((window.SL_CONFIG&&window.SL_CONFIG.API_BASE_URL||'/api')+'/venues/search?q='+encodeURIComponent(q)+'&limit=6')
      .then(forSession(function(r){ if(!r.ok) throw Error('Search unavailable'); return r.json(); }))
      .then(forSession(function(d){
        if(!current()) return;
        var list = d && (d.venues || d.items || d.results);
        if(!Array.isArray(list)) throw Error('Search unavailable');
        list=list.filter(function(v){return v && typeof v.id==='string' && v.id && typeof v.name==='string' && v.name;});
        if(!list.length){ box.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;padding:6px;">No venues found.</div>'; return; }
        box.innerHTML = list.map(function(v){
          return '<a class="sf-venue-result" href="/explore?venue='+encodeURIComponent(v.id)+'" '+
            'style="display:flex;width:100%;text-align:left;gap:8px;align-items:center;background:#141414;border:1px solid rgba(255,255,255,.05);border-radius:8px;padding:8px;margin-bottom:4px;cursor:pointer;color:#fff;">'+
            '<i class="fas fa-martini-glass" style="color:#D4AF37;font-size:12px;"></i>'+
            '<span style="font-size:13px;">'+esc(v.name)+(v.neighborhood?' <span style="color:rgba(255,255,255,.4);">· '+esc(v.neighborhood)+'</span>':'')+'</span>'+
            '</a>';
        }).join('');
        box.querySelectorAll('.sf-venue-result').forEach(function(b){
          b.addEventListener('click', function(event){
            if(!window.SLVenueDetail || typeof window.SLVenueDetail.open!=='function' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            window.SLVenueDetail.open(new URL(b.href).searchParams.get('venue'));
          });
        });
      }))
      .catch(forSession(function(){ if(current()) box.innerHTML='<div role="status">Venue search is unavailable. Try again or <a href="/explore">open Explore</a>.</div>'; }));
  }

  function openPhotoPicker(){
    var inp=document.createElement('input');
    inp.type='file'; inp.accept='image/png,image/jpeg,image/webp';
    inp.addEventListener('change', forSession(function(){
      var f=inp.files&&inp.files[0]; if(!f) return;
      setComposerExtra('<div style="color:rgba(255,255,255,.5);font-size:12px;">Uploading photo…</div>');
      social().uploadMedia(f,'post').then(forSession(function(r){
        if(r.ok&&r.url){ STATE.pendingImage=r.url;
          setComposerExtra('<div style="position:relative;display:inline-block;"><img src="'+esc(r.url)+'" style="max-height:120px;border-radius:8px;"><button onclick="window.__sfClearImg&&window.__sfClearImg()" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.7);border:none;color:#fff;border-radius:50%;width:24px;height:24px;cursor:pointer;">&times;</button></div>');
          window.__sfClearImg=function(){ STATE.pendingImage=null; clearComposerExtras(); };
        } else if(r.pending_review){setComposerExtra('<p role="status">'+esc(r.error)+'</p>');}
        else { setComposerExtra('<div style="color:#f66;font-size:12px;">'+esc(r.error||'Upload failed')+'</div>'); }
      }));
    }));
    inp.click();
  }

  // ── Feed ────────────────────────────────────────────────────────────
  function loadFeed(reset){
    var content=$('sfFeedContent'); if(!content || !STATE.me) return;
    if(!reset && (STATE.loadingFeed || !STATE.nextCursor)) return;
    var request=++STATE.feedRequest, scope=STATE.activeTab, settled=false;
    STATE.loadingFeed=true;
    if(reset){ STATE.feed=[]; STATE.nextCursor=null; STATE.hasMore=false; content.innerHTML = skeletonFeed(); }
    var cursor = reset ? null : STATE.nextCursor;
    function current(){return request===STATE.feedRequest && scope===STATE.activeTab && !settled;}
    function showError(message){
      if(!current()) return;
      settled=true;
      STATE.loadingFeed=false;
      if(reset){ content.innerHTML=errorState(message,'sfRetryFeed');wireRetry(); }
      else {
        var more=$('sfLoadMore');
        if(more){more.disabled=false;more.textContent='Try loading more again';}
        var error=$('sfFeedPageError');
        if(error)error.textContent=message;
      }
    }
    var guard=setTimeout(forSession(function(){showError('Feed is taking too long.');}),13000);
    social().getFeed(cursor,15,scope).then(forSession(function(r){
      clearTimeout(guard);if(!current())return;
      if(r.loggedOut){ showLanding(); return; }
      var d=r.data||{};
      if(!r.ok || !Array.isArray(d.items) || d.items.some(function(x){return !x || typeof x.id!=='string' || !x.id || !['post','checkin','review','list_share'].includes(x.kind);}) ||
        (d.has_more && (typeof d.next_cursor!=='string' || !d.next_cursor || d.next_cursor===cursor))){
        showError('Could not load this activity.');return;
      }
      settled=true;
      STATE.loadingFeed=false;
      var seen=new Set(STATE.feed.map(function(x){return x.kind+':'+x.id;}));
      d.items.forEach(function(x){var key=x.kind+':'+x.id;if(!seen.has(key)){seen.add(key);STATE.feed.push(x);}});
      STATE.nextCursor = d.next_cursor || null;
      STATE.hasMore = !!d.has_more;
      renderFeed();
    })).catch(forSession(function(){clearTimeout(guard);showError('Could not load this activity.');}));
  }

  function wireRetry(){
    var b=$('sfRetryFeed'); if(b) b.addEventListener('click', function(){ loadFeed(true); });
  }

  function renderFeed(){
    var content=$('sfFeedContent'); if(!content) return;
    if(!STATE.feed.length && !STATE.hasMore){ content.innerHTML=emptyFeed(); var c=$('sfEmptyCheckin'); if(c) c.addEventListener('click',openVenuePicker); return; }
    var html = STATE.feed.map(renderCard).join('');
    html += STATE.hasMore
      ? '<p role="status" id="sfFeedPageError"></p><button type="button" id="sfLoadMore" style="display:block;width:100%;background:#141414;border:1px solid rgba(212,175,55,.2);color:#D4AF37;padding:12px;border-radius:10px;font-weight:600;cursor:pointer;margin-top:8px;">Load more</button>'
      : '<div style="text-align:center;color:rgba(255,255,255,.3);font-size:12px;padding:16px;">You\'re all caught up</div>';
    content.innerHTML=html;
    var lm=$('sfLoadMore'); if(lm) lm.addEventListener('click', function(){ lm.textContent='Loading…';lm.disabled=true;$('sfFeedPageError').textContent='';loadFeed(false); });
    STATE.feed.forEach(function(x){ wireCard(x); });
  }

  function kindLabel(x){
    if(x.kind==='checkin') return 'logged a visit';
    if(x.kind==='review') return 'reviewed';
    if(x.kind==='list_share' || (x.ref_type==='list_share')) return 'shared a list';
    return '';
  }

  function renderCard(x){
    var name=x.display_name||x.username||'SceneLink user';
    var handle=x.username?'@'+x.username:'';
    var klabel=kindLabel(x);
    var venueHtml = (x.venue_id && x.venue_name)
      ? '<a href="/explore?venue='+encodeURIComponent(x.venue_id)+'" style="color:#D4AF37;text-decoration:none;font-weight:600;">'+esc(x.venue_name)+'</a>'+(x.venue_neighborhood?' <span style="color:rgba(255,255,255,.4);">· '+esc(x.venue_neighborhood)+'</span>':'')
      : '';
    var body = x.body ? '<div style="color:rgba(255,255,255,.88);font-size:14px;margin-top:6px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;">'+esc(x.body)+'</div>' : '';
    var img = x.image_url ? '<img src="'+esc(x.image_url)+'" alt="" loading="lazy" style="width:100%;max-height:360px;object-fit:cover;border-radius:10px;margin-top:10px;">' : '';
    var rating = (x.kind==='review' && x.rating) ? '<div style="color:#D4AF37;font-size:13px;margin-top:4px;">'+stars(Number(x.rating))+'</div>' : '';
    var isPost = x.kind==='post';
    var canModerate = STATE.me && STATE.me.id !== x.user_id;
    var visitAudience = x.kind==='checkin' && STATE.me && STATE.me.id===x.user_id ?
      ({private:' · Only you',friends:' · Shared with accepted friends',public:' · Public'})[x.audience] || '' : '';

    var actions = isPost ? (
      '<div class="sf-card-actions" style="display:flex;gap:18px;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.05);font-size:13px;">'+
        '<button class="sf-like" data-id="'+esc(x.id)+'" style="background:none;border:none;color:'+(x.liked_by_me?'#D4AF37':'rgba(255,255,255,.6)')+';cursor:pointer;font-size:13px;display:flex;align-items:center;gap:5px;">'+
          '<i class="'+(x.liked_by_me?'fas':'far')+' fa-heart"></i> <span class="sf-like-count">'+(x.like_count||0)+'</span></button>'+
        '<button class="sf-comment-toggle" data-id="'+esc(x.id)+'" style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:13px;display:flex;align-items:center;gap:5px;">'+
          '<i class="far fa-comment"></i> <span class="sf-comment-count">'+(x.comment_count||0)+'</span></button>'+
        (canModerate?'<button class="sf-report" data-id="'+esc(x.id)+'" title="Report" style="background:none;border:none;color:rgba(255,255,255,.3);cursor:pointer;margin-left:auto;"><i class="fas fa-flag"></i></button>':'')+
      '</div>'+
      '<div class="sf-comments" data-id="'+esc(x.id)+'" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.05);"></div>'
    ) : '';

    return '<article class="sf-card" data-id="'+esc(x.id)+'" data-kind="'+esc(x.kind)+'" style="background:#141414;border:1px solid rgba(255,255,255,.05);border-radius:14px;padding:16px;margin-bottom:12px;">'+
      '<div style="display:flex;gap:12px;">'+
        '<a href="profile.html?u='+encodeURIComponent(x.username||x.user_id)+'" style="text-decoration:none;">'+avatarHtml(x.avatar_url,name,42)+'</a>'+
        '<div style="flex:1;min-width:0;">'+
          '<div style="font-size:14px;color:#fff;">'+
            '<a href="profile.html?u='+encodeURIComponent(x.username||x.user_id)+'" style="color:#fff;text-decoration:none;font-weight:700;">'+esc(name)+'</a>'+
            (handle?' <span style="color:rgba(255,255,255,.35);font-weight:400;font-size:12px;">'+esc(handle)+'</span>':'')+
            (klabel?' <span style="color:rgba(255,255,255,.5);font-weight:400;">'+klabel+'</span>':'')+
            (venueHtml?' '+(klabel?'at ':'')+venueHtml:'')+
          '</div>'+
          body+img+rating+
          '<div style="color:rgba(255,255,255,.55);font-size:12px;margin-top:8px;">'+timeAgo(x.created_at)+visitAudience+'</div>'+
          actions+
        '</div>'+
      '</div>'+
    '</article>';
  }

  function wireCard(x){
    var article=document.querySelector('.sf-card[data-id="'+cssEsc(x.id)+'"]');
    if(!article) return;
    var like=article.querySelector('.sf-like');
    if(like) like.addEventListener('click', function(){
      if(!STATE.me) return showLanding();
      var icon=like.querySelector('i'); var cnt=like.querySelector('.sf-like-count');
      social().likePost(x.id).then(forSession(function(r){
        if(r.ok && r.data){
          var liked = r.data.liked!=null?r.data.liked:!x.liked_by_me;
          x.liked_by_me=liked; x.like_count=r.data.like_count!=null?r.data.like_count:x.like_count;
          if(icon) icon.className=(liked?'fas':'far')+' fa-heart';
          like.style.color=liked?'#D4AF37':'rgba(255,255,255,.6)';
          if(cnt) cnt.textContent=x.like_count;
        } else if(r.loggedOut){ showLanding(); }
      }));
    });

    var ct=article.querySelector('.sf-comment-toggle');
    var box=article.querySelector('.sf-comments');
    if(ct && box) ct.addEventListener('click', function(){
      if(box.style.display!=='none'){ box.style.display='none'; return; }
      box.style.display='block';
      if(box.querySelector('.sf-comment-input')||box.dataset.loading==='true')return;
      box.dataset.loading='true';
      box.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;">Loading…</div>';
      social().getComments(x.id).then(forSession(function(r){
        if(!box.isConnected)return;delete box.dataset.loading;
        var comments=r.ok&&r.data&&(r.data.comments||r.data.items);
        if(!Array.isArray(comments)){box.innerHTML='<p role="status">Comments could not be loaded. Close and reopen comments to retry.</p>';return;}
        box.innerHTML=commentsHtml(comments);
        wireCommentSubmit(box,x,article);
      })).catch(forSession(function(){if(!box.isConnected)return;delete box.dataset.loading;box.innerHTML='<p role="status">Comments could not be loaded. Close and reopen comments to retry.</p>';}));
    });

    var rep=article.querySelector('.sf-report');
    if(rep) rep.addEventListener('click', function(){ openReport('post', x.id); });
  }

  function commentsHtml(comments){
    var list=comments.map(function(c){
      return '<div style="display:flex;gap:8px;margin-bottom:8px;">'+
        avatarHtml(c.avatar_url, c.display_name||c.username, 28)+
        '<div style="flex:1;background:#0c0c0c;border-radius:10px;padding:8px 10px;">'+
          '<div style="font-size:12px;color:#fff;"><b>'+esc(c.display_name||c.username||'user')+'</b> <span style="color:rgba(255,255,255,.4);font-weight:400;">· '+timeAgo(c.created_at)+'</span></div>'+
          '<div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:2px;white-space:pre-wrap;word-wrap:break-word;">'+esc(c.body)+'</div>'+
        '</div></div>';
    }).join('') || '<div style="color:rgba(255,255,255,.4);font-size:12px;margin-bottom:8px;">Be the first to comment.</div>';
    var composer = STATE.me
      ? '<div style="display:flex;gap:8px;margin-top:6px;"><input class="sf-comment-input" placeholder="Write a comment…" maxlength="1000" style="flex:1;background:#0c0c0c;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;color:#fff;font-size:13px;"><button class="sf-comment-submit" style="background:#D4AF37;color:#000;border:none;padding:6px 14px;border-radius:8px;font-weight:600;cursor:pointer;">Send</button></div>'
      : '<div style="color:rgba(255,255,255,.4);font-size:12px;">Log in to comment.</div>';
    return '<div class="sf-comment-list">'+list+'</div>'+composer+'<p class="sf-comment-status" role="status"></p>';
  }

  function wireCommentSubmit(box, x, article){
    var btn=box.querySelector('.sf-comment-submit'); var inp=box.querySelector('.sf-comment-input');
    if(!btn||!inp) return;
    btn.disabled=!!STATE.commentAttempts[x.id];
    var attempt=null;
    function commentStatus(text,target){var el=(target||box).querySelector('.sf-comment-status');if(el)el.textContent=text;}
    function unlock(){if(STATE.commentAttempts[x.id]!==attempt)return;delete STATE.commentAttempts[x.id];document.querySelectorAll('.sf-comments[data-id="'+cssEsc(x.id)+'"] .sf-comment-submit').forEach(function(button){button.disabled=false;});}
    function submit(){
      if(STATE.commentAttempts[x.id]||!STATE.me||STATE.session!==sessionToken())return;
      var submitted=inp.value||'',body=submitted.trim(); if(!body) return;
      attempt={};STATE.commentAttempts[x.id]=attempt;btn.disabled=true;commentStatus('Saving comment…');
      social().commentPost(x.id, body).then(forSession(function(r){
        var target=box.isConnected?box:document.querySelector('.sf-comments[data-id="'+cssEsc(x.id)+'"]');
        if(!target||!target.querySelector('.sf-comment-input')){unlock();return;}
        if(r.ok){
          if(inp.isConnected&&inp.value===submitted)inp.value='';
          commentStatus('Comment saved. Refreshing comments…',target);
          social().getComments(x.id).then(forSession(function(rr){
            unlock();if(!target.isConnected)return;
            var comments=rr.ok&&rr.data&&(rr.data.comments||rr.data.items);
            if(!Array.isArray(comments)){commentStatus('Comment saved, but comments could not be refreshed. Your new draft is unchanged.',target);return;}
            var replacement=document.createElement('div');replacement.innerHTML=commentsHtml(comments);
            var list=target.querySelector('.sf-comment-list');if(list)list.innerHTML=replacement.querySelector('.sf-comment-list').innerHTML;
            var targetArticle=target.closest('.sf-card'),cc=targetArticle&&targetArticle.querySelector('.sf-comment-count'); if(cc) cc.textContent=comments.length;
            commentStatus('Comment saved.',target);
          })).catch(forSession(function(){unlock();if(target.isConnected)commentStatus('Comment saved, but comments could not be refreshed. Your new draft is unchanged.',target);}));
        } else if(r.loggedOut){showLanding();}
        else {unlock();commentStatus((r.error||'The comment could not be confirmed.')+' Your draft is unchanged. Check the comments before retrying.',target);}
      })).catch(forSession(function(){unlock();commentStatus('The comment could not be confirmed. Your draft is unchanged. Check the comments before retrying.');}));
    }
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', function(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); submit(); } });
  }

  // ── Sidebar: stats, friend requests, suggestions, trending ──────────
  function loadSidebar(){
    loadStats();
    loadFriendRequests();
    loadSuggestions();
    loadTrending();
    loadMessagesPreview();
  }

  function loadStats(){
    social().getSummary().then(forSession(function(r){
      if(!r.ok || !r.data) return;
      var d=r.data;
      setText('sfStatCheckins', Number.isInteger(d.checkins)&&d.checkins>=0?d.checkins:'—');
      setText('sfStatReviews', d.reviews!=null?d.reviews:'—');
      setText('sfStatSaved', d.saved_venues!=null?d.saved_venues:'—');
      setText('sfStatScene', d.lists!=null?d.lists:'—');
    }));
  }
  function setText(id,v){ var el=$(id); if(el) el.textContent=String(v); }

  function loadFriendRequests(){
    social().getFriendRequests().then(forSession(function(r){
      var incoming=(r.ok&&r.data&&r.data.incoming)||[];
      // find or create a requests card above suggestions
      var host=$('sfSuggestions'); if(!host) return;
      var reqCard=$('sfRequestsCard');
      if(!incoming.length){ if(reqCard) reqCard.remove(); return; }
      if(!reqCard){
        reqCard=document.createElement('div');
        reqCard.className='sf-sidebar-card'; reqCard.id='sfRequestsCard';
        host.closest('.sf-sidebar-card').parentNode.insertBefore(reqCard, host.closest('.sf-sidebar-card'));
      }
      reqCard.innerHTML='<div class="sf-sidebar-title">Friend Requests <span style="background:#D4AF37;color:#000;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;">'+incoming.length+'</span></div>'+
        incoming.map(function(f){
          return '<div class="sf-req" data-fid="'+esc(f.friendship_id)+'" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);">'+
            avatarHtml(f.avatar_url,f.display_name||f.username,36)+
            '<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(f.display_name||f.username)+'</div>'+
              (f.username?'<div style="font-size:11px;color:rgba(255,255,255,.4);">@'+esc(f.username)+'</div>':'')+'</div>'+
            '<div style="display:flex;gap:4px;flex-shrink:0;">'+
              '<button class="sf-accept" style="background:#D4AF37;color:#000;border:none;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;">Accept</button>'+
              '<button class="sf-decline" style="background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);border:none;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;">×</button>'+
            '</div></div>';
        }).join('');
      reqCard.querySelectorAll('.sf-req').forEach(function(row){
        var fid=row.getAttribute('data-fid');
        row.querySelector('.sf-accept').addEventListener('click', function(){
          social().acceptFriendRequest(fid).then(forSession(function(rr){ if(rr.ok){ row.remove(); loadStats(); loadSuggestions(); refreshBadges(); if(!reqCard.querySelectorAll('.sf-req').length) reqCard.remove(); } }));
        });
        row.querySelector('.sf-decline').addEventListener('click', function(){
          social().declineFriendRequest(fid).then(forSession(function(rr){ if(rr.ok){ row.remove(); if(!reqCard.querySelectorAll('.sf-req').length) reqCard.remove(); } }));
        });
      });
    }));
  }

  function loadSuggestions(){
    var host=$('sfSuggestions'); if(!host) return;
    host.innerHTML='<div style="color:rgba(255,255,255,.3);font-size:12px;padding:8px 0;">Loading…</div>';
    social().getSuggestions(6).then(forSession(function(r){
      var list=(r.ok&&r.data&&r.data.suggestions)||[];
      var card=host.closest('.sf-sidebar-card');
      var title=card&&card.querySelector('.sf-sidebar-title');
      if(title) title.firstChild.textContent='People You May Know ';
      if(!list.length){ host.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;padding:8px 0;">No suggestions yet. Search for friends to connect.</div>'; return; }
      host.innerHTML=list.map(function(u){
        return '<div class="sf-sugg" data-id="'+esc(u.id)+'" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);">'+
          '<a href="profile.html?u='+encodeURIComponent(u.username||u.id)+'">'+avatarHtml(u.avatar_url,u.display_name||u.username,36)+'</a>'+
          '<div style="flex:1;min-width:0;"><a href="profile.html?u='+encodeURIComponent(u.username||u.id)+'" style="font-size:13px;color:#fff;font-weight:600;text-decoration:none;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(u.display_name||u.username)+'</a>'+
            (u.neighborhood?'<div style="font-size:11px;color:rgba(255,255,255,.4);">'+esc(u.neighborhood)+'</div>':'')+'</div>'+
          '<button class="sf-add" style="background:rgba(212,175,55,.12);border:1px solid rgba(212,175,55,.3);color:#D4AF37;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0;">Add</button>'+
        '</div>';
      }).join('');
      host.querySelectorAll('.sf-sugg').forEach(function(row){
        var id=row.getAttribute('data-id');
        var btn=row.querySelector('.sf-add');
        btn.addEventListener('click', function(){
          btn.disabled=true; btn.textContent='…';
          social().sendFriendRequest(id).then(forSession(function(rr){
            if(rr.ok){ btn.textContent='Requested'; btn.style.opacity='0.6'; }
            else if(rr.loggedOut){ showLanding(); }
            else { btn.disabled=false; btn.textContent='Add'; }
          }));
        });
      });
    }));
  }

  function loadTrending(){
    var host=$('sfTrending'); if(!host) return;
    host.innerHTML='<div style="color:rgba(255,255,255,.3);font-size:12px;padding:8px 0;">Loading…</div>';
    // real venues — trending = top venues endpoint (public)
    fetch((window.SL_CONFIG&&window.SL_CONFIG.API_BASE_URL||'/api')+'/venues?limit=5&sort=trending')
      .then(forSession(function(r){ return r.ok?r.json():{venues:[]}; }))
      .then(forSession(function(d){
        var list=(d.venues||d.items||d.results||[]).slice(0,5);
        if(!list.length){ host.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;padding:8px 0;">Explore venues in Boston.</div>'; return; }
        host.innerHTML=list.map(function(v){
          return '<a href="explore.html?venue='+encodeURIComponent(v.slug||v.id)+'" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);text-decoration:none;">'+
            '<div style="width:36px;height:36px;border-radius:8px;background:rgba(212,175,55,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-fire" style="color:#D4AF37;font-size:13px;"></i></div>'+
            '<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(v.name)+'</div>'+
              (v.neighborhood?'<div style="font-size:11px;color:rgba(255,255,255,.4);">'+esc(v.neighborhood)+'</div>':'')+'</div></a>';
        }).join('');
      }))
      .catch(forSession(function(){ host.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;padding:8px 0;">Explore venues in Boston.</div>'; }));
  }

  function loadMessagesPreview(){
    // Add a messages preview card to sidebar (top) if not present
    var sidebar=document.querySelector('.sf-sidebar'); if(!sidebar) return;
    var card=$('sfMessagesCard');
    if(!card){
      card=document.createElement('div'); card.className='sf-sidebar-card'; card.id='sfMessagesCard';
      sidebar.insertBefore(card, sidebar.firstChild);
    }
    card.innerHTML='<div class="sf-sidebar-title">Messages <a href="messages.html" class="sf-see-all">Open</a></div><div id="sfMsgList" style="color:rgba(255,255,255,.3);font-size:12px;padding:8px 0;">Loading…</div>';
    social().getConversations().then(forSession(function(r){
      var list=(r.ok&&r.data&&r.data.conversations)||[];
      var host=$('sfMsgList'); if(!host) return;
      if(!list.length){ host.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;">No conversations yet. <a href="messages.html" style="color:#D4AF37;">Start one</a>.</div>'; return; }
      host.innerHTML=list.slice(0,4).map(function(c){
        var peers=(c.participants||[]).filter(function(p){return !STATE.me||p.id!==STATE.me.id;});
        var peer=peers.length===1?peers[0]:null;
        var name=c.title||peers.map(function(p){return p.display_name||p.username||'SceneLink member';}).join(', ')||'Conversation';
        var preview=c.last_message_deleted?'Message deleted':typeof c.last_message==='string'?c.last_message:c.last_message&&c.last_message.body||'';
        var unread=c.unread_count||0;
        return '<a href="/messages?conversation='+encodeURIComponent(c.id||c.conversation_id)+'" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);text-decoration:none;">'+
          avatarHtml(peer&&peer.avatar_url,name,34)+
          '<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(name)+'</div>'+
            '<div style="font-size:11px;color:rgba(255,255,255,.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(preview)+'</div></div>'+
          (unread?'<span style="background:#D4AF37;color:#000;border-radius:10px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;padding:0 5px;">'+unread+'</span>':'')+
        '</a>';
      }).join('');
    }));
  }

  // ── Report modal ────────────────────────────────────────────────────
  function openReport(type, id){
    var reasons=[['spam','Spam'],['harassment','Harassment'],['hate_speech','Hate speech'],['violence','Violence'],['sexual_content','Sexual content'],['other','Other']];
    var ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML='<div style="background:#141414;border:1px solid rgba(212,175,55,.2);border-radius:16px;padding:24px;max-width:380px;width:100%;">'+
      '<h3 style="color:#fff;margin:0 0 16px;font-size:18px;">Report this '+esc(type)+'</h3>'+
      '<div id="sfReasons">'+reasons.map(function(r){ return '<button data-r="'+r[0]+'" style="display:block;width:100%;text-align:left;background:#0c0c0c;border:1px solid rgba(255,255,255,.06);color:#fff;border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;font-size:14px;">'+r[1]+'</button>'; }).join('')+'</div>'+
      '<button id="sfReportCancel" style="width:100%;background:none;border:none;color:rgba(255,255,255,.5);padding:8px;cursor:pointer;margin-top:4px;">Cancel</button>'+
    '</div>';
    document.body.appendChild(ov);
    function close(){ ov.remove(); document.removeEventListener('keydown',onKey);sessionCleanups=sessionCleanups.filter(function(fn){return fn!==close;}); }
    sessionCleanups.push(close);
    function onKey(e){ if(e.key==='Escape') close(); }
    document.addEventListener('keydown',onKey);
    ov.addEventListener('click', function(e){ if(e.target===ov) close(); });
    ov.querySelector('#sfReportCancel').addEventListener('click', close);
    ov.querySelectorAll('#sfReasons button').forEach(function(b){
      b.addEventListener('click', function(){
        var reason=b.getAttribute('data-r');
        social().reportContent(type,id,reason).then(forSession(function(r){ if(r.ok){ close(); toast('Report received.'); } else toast(r.error || 'Report could not be submitted. Please try again.'); }));
      });
    });
  }

  // ── Skeletons / empty / error / toast ───────────────────────────────
  function skeletonFeed(){
    var one='<div style="background:#141414;border:1px solid rgba(255,255,255,.05);border-radius:14px;padding:16px;margin-bottom:12px;">'+
      '<div style="display:flex;gap:12px;"><div class="sl-skel" style="width:42px;height:42px;border-radius:50%;"></div>'+
      '<div style="flex:1;"><div class="sl-skel" style="height:12px;width:40%;border-radius:4px;margin-bottom:8px;"></div>'+
      '<div class="sl-skel" style="height:10px;width:90%;border-radius:4px;margin-bottom:6px;"></div>'+
      '<div class="sl-skel" style="height:10px;width:70%;border-radius:4px;"></div></div></div></div>';
    return one+one+one;
  }
  function emptyFeed(){
    return '<div style="background:#141414;border:1px dashed rgba(212,175,55,.25);border-radius:14px;padding:48px 24px;text-align:center;">'+
      '<i class="fas fa-compass" style="font-size:36px;color:#D4AF37;margin-bottom:14px;display:block;"></i>'+
      '<div style="color:#fff;font-weight:700;font-size:18px;margin-bottom:8px;">'+(STATE.activeTab==='friends'?'No friend activity yet':'Your feed is just getting started')+'</div>'+
      '<div style="color:rgba(255,255,255,.7);font-size:14px;line-height:1.6;max-width:340px;margin:0 auto 18px;">'+(STATE.activeTab==='friends'?'Activity shared by accepted friends appears here, along with your own. <a href="/profile#friends">Find friends</a>.':'Log a place you visited or share where you\'re headed next.')+'</div>'+
      '<button type="button" id="sfEmptyCheckin" style="background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;border:none;padding:11px 22px;border-radius:10px;font-weight:700;cursor:pointer;">Log a visit</button>'+
    '</div>';
  }
  function errorState(msg, retryId){
    return '<div style="background:#141414;border:1px solid rgba(255,80,80,.2);border-radius:14px;padding:36px 24px;text-align:center;">'+
      '<i class="fas fa-triangle-exclamation" style="font-size:30px;color:#f66;margin-bottom:12px;display:block;"></i>'+
      '<div style="color:#fff;font-weight:600;margin-bottom:6px;">'+esc(msg)+'</div>'+
      '<button id="'+esc(retryId)+'" style="background:rgba(212,175,55,.12);border:1px solid rgba(212,175,55,.3);color:#D4AF37;padding:8px 18px;border-radius:8px;font-weight:600;cursor:pointer;margin-top:8px;">Try again</button>'+
    '</div>';
  }
  function stars(r){ var n=Math.max(0,Math.min(5,Math.round(r))); return '★'.repeat(n)+'<span style="color:rgba(255,255,255,.2);">'+'★'.repeat(5-n)+'</span>'; }
  function toast(msg){
    var t=document.createElement('div');
    t.textContent=msg;t.setAttribute('data-sf-session-toast','');
    t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid rgba(212,175,55,.3);color:#fff;padding:12px 20px;border-radius:10px;z-index:99999;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.5);';
    document.body.appendChild(t);
    setTimeout(forSession(function(){ t.style.transition='opacity .4s'; t.style.opacity='0'; setTimeout(forSession(function(){t.remove();}),400); }), 2600);
  }
  function cssEsc(s){ return String(s).replace(/["\\]/g,'\\$&'); }

  // realtime badges — bump message preview / requests on unread change
  function refreshBadges(){
    var s=social(); if(!s) return;
    s.getSummary().then(forSession(function(r){ if(r.ok&&r.data){ /* header badges handled by integration script */ } }));
  }

  // ── Init ────────────────────────────────────────────────────────────
  ready(function(){
    // ensure skeleton CSS exists
    if(!document.getElementById('sl-skel-css')){
      var st=document.createElement('style'); st.id='sl-skel-css';
      st.textContent='.sl-skel{background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.10),rgba(255,255,255,.04));background-size:200% 100%;animation:slShimmer 1.4s infinite;}@keyframes slShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
      document.head.appendChild(st);
    }
    // wait briefly for SL.social to be present
    var tries=0;
    (function waitCore(){
      if(social() || tries>30){ wireComposer(); boot(); STATE.booted=true; return; }
      tries++; setTimeout(waitCore, 100);
    })();

    // react to auth changes
    ['sl-auth-change','sl-auth-changed','sl-auth-ready'].forEach(function(type){window.addEventListener(type,boot);document.addEventListener(type,boot);});
    window.addEventListener('storage',function(e){if(e.key===null||e.key==='sl_jwt_token'||e.key==='sl_user')boot();});
    window.addEventListener('pageshow',boot);
    window.addEventListener('sl-checkins-changed',function(){if(STATE.me && STATE.session===sessionToken()){loadFeed(true);loadStats();}});
    document.addEventListener('visibilitychange',function(){if(!document.hidden)boot();});
    // realtime: refresh message preview when unread changes
    var s=social();
    if(s && s.realtime && s.realtime.on){
      s.realtime.on(function(u){
        if(STATE.me && STATE.session===sessionToken()){ loadMessagesPreview(); loadFriendRequests(); }
      });
    }
  });
})();
