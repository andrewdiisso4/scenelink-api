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
    mediaEnabled: false,
    booted: false
  };

  // ── Boot / auth toggle ──────────────────────────────────────────────
  function boot(){
    var s = social();
    var landing = $('socialLanding');
    var feed = $('socialFeed');
    if(!landing || !feed){ return; } // not the social page shell

    if(!s){
      // social core failed to load → show landing (logged-out clean state), never spin
      showLanding(); 
      return;
    }

    if(s.isLoggedIn()){
      showFeed();
      loadMe().then(function(){
        renderComposerIdentity();
        loadFeed(true);
        loadSidebar();
        detectMedia();
      });
    } else {
      showLanding();
    }
  }

  function showLanding(){
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
    return s.getMe().then(function(r){
      STATE.me = (r.ok && r.data && (r.data.user||r.data)) || null;
      if(!STATE.me && r.loggedOut){ showLanding(); }
      return STATE.me;
    });
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
    s.getMediaCapability().then(function(r){
      STATE.mediaEnabled = !!(r.ok && r.data && r.data.enabled);
      // Photo button: if media disabled, show a soft "soon" tooltip instead of hiding (transparent)
      var photoBtn = document.querySelector('.sf-create-action[data-act="photo"]');
      if(photoBtn && !STATE.mediaEnabled){
        photoBtn.setAttribute('title','Photo uploads coming soon');
        photoBtn.style.opacity='0.55';
      }
    });
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
    var actions=document.querySelectorAll('.sf-create-action');

    if(postBtn && input){
      postBtn.addEventListener('click', submitPost);
      input.addEventListener('keydown', function(e){
        if((e.key==='Enter') && (e.metaKey||e.ctrlKey)){ e.preventDefault(); submitPost(); }
      });
    }

    // tag the action buttons (Check In / Photo / Plan)
    actions.forEach(function(btn){
      var label=(btn.textContent||'').toLowerCase();
      if(label.indexOf('check')>=0) btn.setAttribute('data-act','checkin');
      else if(label.indexOf('photo')>=0) btn.setAttribute('data-act','photo');
      else if(label.indexOf('plan')>=0) btn.setAttribute('data-act','plan');
      btn.addEventListener('click', function(){ onComposerAction(btn.getAttribute('data-act')); });
    });

    // tabs
    document.querySelectorAll('.sf-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        document.querySelectorAll('.sf-tab').forEach(function(t){ t.classList.remove('active'); });
        tab.classList.add('active');
        STATE.activeTab = tab.getAttribute('data-tab')||'all';
        loadFeed(true);
      });
    });
  }

  var pendingVenue = null; // for check-in / attach
  function onComposerAction(act){
    if(act==='checkin'){ openVenuePicker('checkin'); }
    else if(act==='photo'){
      if(!STATE.mediaEnabled){ toast('Photo uploads are coming soon.'); return; }
      openPhotoPicker();
    }
    else if(act==='plan'){ window.location.href='plan-with-friends.html'; }
  }

  function submitPost(){
    var input=$('sfCreateInput'); var postBtn=$('sfPostBtn');
    if(!input) return;
    var body=(input.value||'').trim();
    if(!body && !pendingVenue && !STATE.pendingImage){ input.focus(); return; }
    postBtn.disabled=true; var orig=postBtn.textContent; postBtn.textContent='Posting…';
    var payload={ body: body, audience: $('sfAudience') ? $('sfAudience').value : 'friends' };
    if(pendingVenue) payload.venue_id = pendingVenue.id;
    if(STATE.pendingImage) payload.image_url = STATE.pendingImage;
    social().createPost(payload).then(function(r){
      postBtn.disabled=false; postBtn.textContent=orig;
      if(r.ok){
        input.value=''; pendingVenue=null; STATE.pendingImage=null;
        clearComposerExtras();
        loadFeed(true);
        loadSidebar();
      } else if(r.loggedOut){ showLanding(); }
      else { postBtn.textContent='Try again'; setTimeout(function(){postBtn.textContent=orig;},1500); }
    });
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

  // ── Venue picker (for check-in / attach) ────────────────────────────
  function openVenuePicker(mode){
    var html='<div style="display:flex;gap:8px;align-items:center;background:#0c0c0c;border:1px solid rgba(212,175,55,.25);border-radius:10px;padding:8px;">'+
      '<i class="fas fa-location-dot" style="color:#D4AF37;"></i>'+
      '<input id="sfVenueSearch" placeholder="Search a venue to '+(mode==='checkin'?'check in':'attach')+'…" '+
        'style="flex:1;background:none;border:none;color:#fff;font-size:13px;outline:none;">'+
      '<button id="sfVenueCancel" style="background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:16px;">&times;</button>'+
      '</div><div id="sfVenueResults" style="margin-top:6px;"></div>';
    setComposerExtra(html);
    STATE.venueMode = mode;
    var inp=$('sfVenueSearch'); if(inp) inp.focus();
    var cancel=$('sfVenueCancel'); if(cancel) cancel.addEventListener('click', clearComposerExtras);
    if(inp){
      var t=null;
      inp.addEventListener('input', function(){
        clearTimeout(t);
        var q=inp.value.trim();
        if(q.length<2){ $('sfVenueResults').innerHTML=''; return; }
        t=setTimeout(function(){ searchVenues(q); }, 250);
      });
    }
  }

  function searchVenues(q){
    var box=$('sfVenueResults'); if(box) box.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;padding:6px;">Searching…</div>';
    // venue search endpoint (public)
    fetch((window.SL_CONFIG&&window.SL_CONFIG.API_BASE_URL||'/api')+'/venues/search?q='+encodeURIComponent(q)+'&limit=6')
      .then(function(r){ return r.ok?r.json():{venues:[]}; })
      .then(function(d){
        var list = d.venues || d.items || d.results || [];
        if(!box) return;
        if(!list.length){ box.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;padding:6px;">No venues found.</div>'; return; }
        box.innerHTML = list.map(function(v){
          return '<button class="sf-venue-result" data-id="'+esc(v.id)+'" data-name="'+esc(v.name)+'" '+
            'style="display:flex;width:100%;text-align:left;gap:8px;align-items:center;background:#141414;border:1px solid rgba(255,255,255,.05);border-radius:8px;padding:8px;margin-bottom:4px;cursor:pointer;color:#fff;">'+
            '<i class="fas fa-martini-glass" style="color:#D4AF37;font-size:12px;"></i>'+
            '<span style="font-size:13px;">'+esc(v.name)+(v.neighborhood?' <span style="color:rgba(255,255,255,.4);">· '+esc(v.neighborhood)+'</span>':'')+'</span>'+
            '</button>';
        }).join('');
        box.querySelectorAll('.sf-venue-result').forEach(function(b){
          b.addEventListener('click', function(){ pickVenue(b.getAttribute('data-id'), b.getAttribute('data-name')); });
        });
      })
      .catch(function(){ if(box) box.innerHTML='<div style="color:#f66;font-size:12px;padding:6px;">Search unavailable.</div>'; });
  }

  function pickVenue(id, name){
    if(STATE.venueMode==='checkin'){
      // immediate check-in
      social().checkIn(id, ($('sfCreateInput')&&$('sfCreateInput').value.trim())||null).then(function(r){
        if(r.ok){ if($('sfCreateInput')) $('sfCreateInput').value=''; clearComposerExtras(); loadFeed(true); loadSidebar(); toast('Checked in at '+name); }
        else if(r.loggedOut){ showLanding(); }
        else toast('Check-in failed.');
      });
    } else {
      pendingVenue={id:id,name:name};
      setComposerExtra('<div style="display:inline-flex;gap:6px;align-items:center;background:rgba(212,175,55,.12);border:1px solid rgba(212,175,55,.3);border-radius:20px;padding:5px 12px;font-size:12px;color:#D4AF37;">'+
        '<i class="fas fa-location-dot"></i> '+esc(name)+
        ' <button onclick="this.closest(\'#sfComposerExtra\').innerHTML=\'\'" style="background:none;border:none;color:#D4AF37;cursor:pointer;">&times;</button></div>');
    }
  }

  function openPhotoPicker(){
    var inp=document.createElement('input');
    inp.type='file'; inp.accept='image/*';
    inp.addEventListener('change', function(){
      var f=inp.files&&inp.files[0]; if(!f) return;
      setComposerExtra('<div style="color:rgba(255,255,255,.5);font-size:12px;">Uploading photo…</div>');
      social().uploadMedia(f,'post').then(function(r){
        if(r.ok&&r.url){ STATE.pendingImage=r.url;
          setComposerExtra('<div style="position:relative;display:inline-block;"><img src="'+esc(r.url)+'" style="max-height:120px;border-radius:8px;"><button onclick="window.__sfClearImg&&window.__sfClearImg()" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.7);border:none;color:#fff;border-radius:50%;width:24px;height:24px;cursor:pointer;">&times;</button></div>');
          window.__sfClearImg=function(){ STATE.pendingImage=null; clearComposerExtras(); };
        } else { setComposerExtra('<div style="color:#f66;font-size:12px;">'+esc(r.error||'Upload failed')+'</div>'); }
      });
    });
    inp.click();
  }

  // ── Feed ────────────────────────────────────────────────────────────
  function loadFeed(reset){
    var content=$('sfFeedContent'); if(!content) return;
    if(STATE.loadingFeed) return;
    STATE.loadingFeed=true;
    if(reset){ STATE.feed=[]; STATE.nextCursor=null; STATE.hasMore=false; content.innerHTML = skeletonFeed(); }
    var cursor = reset ? null : STATE.nextCursor;
    var timedOut=false;
    var guard=setTimeout(function(){ timedOut=true; if(!STATE.feed.length){ content.innerHTML=errorState('Feed is taking too long.', 'sfRetryFeed'); wireRetry(); } }, 13000);

    social().getFeed(cursor, 15).then(function(r){
      clearTimeout(guard);
      STATE.loadingFeed=false;
      if(timedOut && !r.ok) return;
      if(r.loggedOut){ showLanding(); return; }
      if(!r.ok){
        if(!STATE.feed.length){ content.innerHTML=errorState('Could not load your feed.', 'sfRetryFeed'); wireRetry(); }
        return;
      }
      var d=r.data||{};
      var items=d.items||[];
      // tab filter (client-side for friends/trending/nearby is best-effort; "all" default)
      STATE.feed = reset ? items : STATE.feed.concat(items);
      STATE.nextCursor = d.next_cursor || null;
      STATE.hasMore = !!d.has_more;
      renderFeed();
    });
  }

  function wireRetry(){
    var b=$('sfRetryFeed'); if(b) b.addEventListener('click', function(){ loadFeed(true); });
  }

  function renderFeed(){
    var content=$('sfFeedContent'); if(!content) return;
    if(!STATE.feed.length){ content.innerHTML=emptyFeed(); var c=$('sfEmptyCheckin'); if(c) c.addEventListener('click',function(){openVenuePicker('checkin');}); return; }
    var html = STATE.feed.map(renderCard).join('');
    html += STATE.hasMore
      ? '<button id="sfLoadMore" style="display:block;width:100%;background:#141414;border:1px solid rgba(212,175,55,.2);color:#D4AF37;padding:12px;border-radius:10px;font-weight:600;cursor:pointer;margin-top:8px;">Load more</button>'
      : '<div style="text-align:center;color:rgba(255,255,255,.3);font-size:12px;padding:16px;">You\'re all caught up</div>';
    content.innerHTML=html;
    var lm=$('sfLoadMore'); if(lm) lm.addEventListener('click', function(){ lm.textContent='Loading…'; loadFeed(false); });
    STATE.feed.forEach(function(x){ wireCard(x); });
  }

  function kindLabel(x){
    if(x.kind==='checkin') return 'checked in';
    if(x.kind==='review') return 'reviewed';
    if(x.kind==='list_share' || (x.ref_type==='list_share')) return 'shared a list';
    return '';
  }

  function renderCard(x){
    var name=x.display_name||x.username||'SceneLink user';
    var handle=x.username?'@'+x.username:'';
    var klabel=kindLabel(x);
    var venueHtml = (x.venue_id && x.venue_name)
      ? '<a href="explore.html?venue='+encodeURIComponent(x.venue_slug||x.venue_id)+'" style="color:#D4AF37;text-decoration:none;font-weight:600;">'+esc(x.venue_name)+'</a>'+(x.venue_neighborhood?' <span style="color:rgba(255,255,255,.4);">· '+esc(x.venue_neighborhood)+'</span>':'')
      : '';
    var body = x.body ? '<div style="color:rgba(255,255,255,.88);font-size:14px;margin-top:6px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;">'+esc(x.body)+'</div>' : '';
    var img = x.image_url ? '<img src="'+esc(x.image_url)+'" alt="" loading="lazy" style="width:100%;max-height:360px;object-fit:cover;border-radius:10px;margin-top:10px;">' : '';
    var rating = (x.kind==='review' && x.rating) ? '<div style="color:#D4AF37;font-size:13px;margin-top:4px;">'+stars(Number(x.rating))+'</div>' : '';
    var isPost = x.kind==='post';
    var canModerate = STATE.me && STATE.me.id !== x.user_id;

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
          '<div style="color:rgba(255,255,255,.35);font-size:11px;margin-top:8px;">'+timeAgo(x.created_at)+'</div>'+
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
      social().likePost(x.id).then(function(r){
        if(r.ok && r.data){
          var liked = r.data.liked!=null?r.data.liked:!x.liked_by_me;
          x.liked_by_me=liked; x.like_count=r.data.like_count!=null?r.data.like_count:x.like_count;
          if(icon) icon.className=(liked?'fas':'far')+' fa-heart';
          like.style.color=liked?'#D4AF37':'rgba(255,255,255,.6)';
          if(cnt) cnt.textContent=x.like_count;
        } else if(r.loggedOut){ showLanding(); }
      });
    });

    var ct=article.querySelector('.sf-comment-toggle');
    var box=article.querySelector('.sf-comments');
    if(ct && box) ct.addEventListener('click', function(){
      if(box.style.display!=='none'){ box.style.display='none'; return; }
      box.style.display='block';
      box.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;">Loading…</div>';
      social().getComments(x.id).then(function(r){
        var comments=(r.ok&&r.data&&(r.data.comments||r.data.items))||[];
        box.innerHTML=commentsHtml(comments);
        wireCommentSubmit(box,x,article);
      });
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
    return list+composer;
  }

  function wireCommentSubmit(box, x, article){
    var btn=box.querySelector('.sf-comment-submit'); var inp=box.querySelector('.sf-comment-input');
    if(!btn||!inp) return;
    function submit(){
      var body=(inp.value||'').trim(); if(!body) return;
      btn.disabled=true;
      social().commentPost(x.id, body).then(function(r){
        btn.disabled=false;
        if(r.ok){
          inp.value='';
          social().getComments(x.id).then(function(rr){
            var comments=(rr.ok&&rr.data&&(rr.data.comments||rr.data.items))||[];
            box.innerHTML=commentsHtml(comments); wireCommentSubmit(box,x,article);
            var cc=article.querySelector('.sf-comment-count'); if(cc) cc.textContent=comments.length;
          });
        } else if(r.loggedOut){ showLanding(); }
      });
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
    social().getSummary().then(function(r){
      if(!r.ok || !r.data) return;
      var d=r.data;
      setText('sfStatCheckins', d.checkins!=null?d.checkins:(d.posts!=null?'—':'—'));
      setText('sfStatReviews', d.reviews!=null?d.reviews:'—');
      setText('sfStatSaved', d.saved_venues!=null?d.saved_venues:'—');
      setText('sfStatScene', d.lists!=null?d.lists:'—');
      // also try to populate checkins from summary if present
      if(d.checkins==null){ setText('sfStatCheckins', d.posts!=null?d.posts:'—'); }
    });
  }
  function setText(id,v){ var el=$(id); if(el) el.textContent=String(v); }

  function loadFriendRequests(){
    social().getFriendRequests().then(function(r){
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
          social().acceptFriendRequest(fid).then(function(rr){ if(rr.ok){ row.remove(); loadStats(); loadSuggestions(); refreshBadges(); if(!reqCard.querySelectorAll('.sf-req').length) reqCard.remove(); } });
        });
        row.querySelector('.sf-decline').addEventListener('click', function(){
          social().declineFriendRequest(fid).then(function(rr){ if(rr.ok){ row.remove(); if(!reqCard.querySelectorAll('.sf-req').length) reqCard.remove(); } });
        });
      });
    });
  }

  function loadSuggestions(){
    var host=$('sfSuggestions'); if(!host) return;
    host.innerHTML='<div style="color:rgba(255,255,255,.3);font-size:12px;padding:8px 0;">Loading…</div>';
    social().getSuggestions(6).then(function(r){
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
          social().sendFriendRequest(id).then(function(rr){
            if(rr.ok){ btn.textContent='Requested'; btn.style.opacity='0.6'; }
            else if(rr.loggedOut){ showLanding(); }
            else { btn.disabled=false; btn.textContent='Add'; }
          });
        });
      });
    });
  }

  function loadTrending(){
    var host=$('sfTrending'); if(!host) return;
    host.innerHTML='<div style="color:rgba(255,255,255,.3);font-size:12px;padding:8px 0;">Loading…</div>';
    // real venues — trending = top venues endpoint (public)
    fetch((window.SL_CONFIG&&window.SL_CONFIG.API_BASE_URL||'/api')+'/venues?limit=5&sort=trending')
      .then(function(r){ return r.ok?r.json():{venues:[]}; })
      .then(function(d){
        var list=(d.venues||d.items||d.results||[]).slice(0,5);
        if(!list.length){ host.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;padding:8px 0;">Explore venues in Boston.</div>'; return; }
        host.innerHTML=list.map(function(v){
          return '<a href="explore.html?venue='+encodeURIComponent(v.slug||v.id)+'" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);text-decoration:none;">'+
            '<div style="width:36px;height:36px;border-radius:8px;background:rgba(212,175,55,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-fire" style="color:#D4AF37;font-size:13px;"></i></div>'+
            '<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(v.name)+'</div>'+
              (v.neighborhood?'<div style="font-size:11px;color:rgba(255,255,255,.4);">'+esc(v.neighborhood)+'</div>':'')+'</div></a>';
        }).join('');
      })
      .catch(function(){ host.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;padding:8px 0;">Explore venues in Boston.</div>'; });
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
    social().getConversations().then(function(r){
      var list=(r.ok&&r.data&&r.data.conversations)||[];
      var host=$('sfMsgList'); if(!host) return;
      if(!list.length){ host.innerHTML='<div style="color:rgba(255,255,255,.4);font-size:12px;">No conversations yet. <a href="messages.html" style="color:#D4AF37;">Start one</a>.</div>'; return; }
      host.innerHTML=list.slice(0,4).map(function(c){
        var name=c.other_display_name||c.display_name||c.title||'Conversation';
        var unread=c.unread_count||0;
        return '<a href="messages.html?c='+encodeURIComponent(c.id||c.conversation_id)+'" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);text-decoration:none;">'+
          avatarHtml(c.other_avatar_url||c.avatar_url,name,34)+
          '<div style="flex:1;min-width:0;"><div style="font-size:13px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(name)+'</div>'+
            '<div style="font-size:11px;color:rgba(255,255,255,.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(c.last_message_body||c.last_message||'')+'</div></div>'+
          (unread?'<span style="background:#D4AF37;color:#000;border-radius:10px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;padding:0 5px;">'+unread+'</span>':'')+
        '</a>';
      }).join('');
    });
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
    function close(){ ov.remove(); document.removeEventListener('keydown',onKey); }
    function onKey(e){ if(e.key==='Escape') close(); }
    document.addEventListener('keydown',onKey);
    ov.addEventListener('click', function(e){ if(e.target===ov) close(); });
    ov.querySelector('#sfReportCancel').addEventListener('click', close);
    ov.querySelectorAll('#sfReasons button').forEach(function(b){
      b.addEventListener('click', function(){
        var reason=b.getAttribute('data-r');
        social().reportContent(type,id,reason).then(function(r){ if(r.ok){ close(); toast('Report received.'); } else toast(r.error || 'Report could not be submitted. Please try again.'); });
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
      '<div style="color:#fff;font-weight:700;font-size:18px;margin-bottom:8px;">Your feed is just getting started</div>'+
      '<div style="color:rgba(255,255,255,.55);font-size:14px;line-height:1.6;max-width:340px;margin:0 auto 18px;">Add friends and check in at venues to see activity here. Share where you\'re headed tonight to kick things off.</div>'+
      '<button id="sfEmptyCheckin" style="background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;border:none;padding:11px 22px;border-radius:10px;font-weight:700;cursor:pointer;"><i class="fas fa-location-dot"></i> Check in somewhere</button>'+
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
    t.textContent=msg;
    t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid rgba(212,175,55,.3);color:#fff;padding:12px 20px;border-radius:10px;z-index:99999;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.5);';
    document.body.appendChild(t);
    setTimeout(function(){ t.style.transition='opacity .4s'; t.style.opacity='0'; setTimeout(function(){t.remove();},400); }, 2600);
  }
  function cssEsc(s){ return String(s).replace(/["\\]/g,'\\$&'); }

  // realtime badges — bump message preview / requests on unread change
  function refreshBadges(){
    var s=social(); if(!s) return;
    s.getSummary().then(function(r){ if(r.ok&&r.data){ /* header badges handled by integration script */ } });
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
    document.addEventListener('sl-auth-change', function(){ boot(); });
    // realtime: refresh message preview when unread changes
    var s=social();
    if(s && s.realtime && s.realtime.on){
      s.realtime.on(function(u){
        if(STATE.me){ loadMessagesPreview(); loadFriendRequests(); }
      });
    }
  });
})();
