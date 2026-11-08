/* SceneLink Phase 8C social connectivity layer — friends, feed, messages, notifications. */
(function(){
  'use strict';
  if (/social-feed/.test(location.pathname)) return; // Canonical Phase9 feed owns these controls.
  if (window.__SL_SOCIAL_NETWORK_BOOTED__) return;
  window.__SL_SOCIAL_NETWORK_BOOTED__ = true;
  var API='/api';
  function qs(s,r){return (r||document).querySelector(s);} function qsa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function token(){try{return localStorage.getItem('sl_jwt_token')||localStorage.getItem('sl_auth_token')||'';}catch(_){return '';}}
  function api(path,opts){opts=opts||{};var h=Object.assign({'Content-Type':'application/json','Accept':'application/json'},opts.headers||{});var t=token();if(t)h.Authorization='Bearer '+t;var b=opts.body;if(b&&typeof b!=='string')b=JSON.stringify(b);return fetch(API+path,{method:opts.method||'GET',headers:h,body:b,credentials:'omit'}).then(function(r){return r.text().then(function(txt){var d=null;try{d=txt?JSON.parse(txt):null;}catch(_){d={raw:txt};}if(!r.ok){var e=new Error((d&&d.error)||('HTTP '+r.status));e.status=r.status;e.data=d;throw e;}return d;});});}
  function venueUrl(item){return item.venue_slug?'/explore.html?venue='+encodeURIComponent(item.venue_slug):(item.venue_id?'/explore.html?venue_id='+encodeURIComponent(item.venue_id):'/explore.html');}
  function avatar(u){var src=u&&u.avatar_url;if(src)return '<img src="'+esc(src)+'" alt="" loading="lazy" decoding="async">';var n=(u&&(u.display_name||u.username))||'?';return esc(n.trim().split(/\s+/).slice(0,2).map(function(x){return x[0]||'';}).join('').toUpperCase()||'?');}
  function installBadges(){ if(!token()) return; api('/social/summary').then(function(s){
      var unread=(Number(s.unread_messages)||0)+(Number(s.unread_notifications)||0)+(Number(s.pending_friend_requests)||0); if(!unread)return;
      qsa('a[href*="profile"],a[href*="messages"],.nav-profile').slice(0,2).forEach(function(a){ if(a.querySelector('.sl-social-badge'))return; var b=document.createElement('span');b.className='sl-social-badge';b.textContent=unread>9?'9+':String(unread);a.style.position='relative';a.appendChild(b); });
    }).catch(function(){}); }
  function renderPost(item){
    var user={display_name:item.display_name,username:item.username,avatar_url:item.avatar_url};
    var venue=item.venue_name?'<a class="slsc-venue" href="'+esc(venueUrl(item))+'"><i class="fas fa-location-dot"></i> '+esc(item.venue_name)+(item.venue_neighborhood?' · '+esc(item.venue_neighborhood):'')+'</a>':'';
    var kind=item.kind||'post';
    var body=item.body|| (kind==='checkin'?'Checked in': kind==='review'?'Left a review':'');
    return '<article class="slsc-post" data-post-id="'+esc(item.id)+'"><div class="slsc-avatar">'+avatar(user)+'</div><div class="slsc-post-main"><div class="slsc-post-head"><strong>'+esc(item.display_name||item.username||'SceneLink user')+'</strong><span>@'+esc(item.username||'user')+'</span><span>'+esc(kind)+'</span></div>'+(body?'<p>'+esc(body)+'</p>':'')+venue+'<div class="slsc-actions"><button data-slsc-like="'+esc(item.id)+'"><i class="far fa-heart"></i> '+esc(item.like_count||0)+'</button><button data-slsc-comment="'+esc(item.id)+'"><i class="far fa-comment"></i> '+esc(item.comment_count||0)+'</button><a href="messages.html?user='+encodeURIComponent(item.username||'')+'"><i class="far fa-paper-plane"></i> Message</a></div></div></article>';
  }
  function renderSuggestion(u){return '<div class="slsc-suggestion"><div class="slsc-avatar small">'+avatar(u)+'</div><div><strong>'+esc(u.display_name||u.username)+'</strong><span>@'+esc(u.username||'user')+(u.neighborhood?' · '+esc(u.neighborhood):'')+'</span></div><button data-slsc-add-friend="'+esc(u.id)+'">Add</button></div>';}
  function bootSocialPage(){
    var social=qs('#socialFeed'), landing=qs('#socialLanding'); if(!social&&!/social-feed/.test(location.pathname)) return;
    if(!token()){ if(landing)landing.classList.remove('hidden'); if(social)social.classList.remove('active'); return; }
    if(landing) landing.classList.add('hidden'); if(social) social.classList.add('active');
    var feed=qs('#sfFeedContent'); if(feed){ feed.innerHTML='<div class="slsc-loading"><i class="fas fa-spinner fa-spin"></i> Loading real social feed…</div>'; api('/posts/feed?limit=30').then(function(d){var items=d.items||d.posts||[]; feed.innerHTML=items.length?items.map(renderPost).join(''):'<div class="slsc-empty"><h3>Your Scene is ready.</h3><p>Add friends, save venues, or create a post to start your feed.</p></div>';}).catch(function(e){feed.innerHTML='<div class="slsc-empty"><h3>Feed unavailable</h3><p>'+esc(e.message||'Try again')+'</p></div>';}); }
    var postBtn=qs('#sfPostBtn'), input=qs('#sfCreateInput'); if(postBtn&&input&&!postBtn.__slsc){ postBtn.__slsc=true; postBtn.addEventListener('click',function(){var body=input.value.trim();if(!body)return;postBtn.disabled=true;api('/posts',{method:'POST',body:{body:body}}).then(function(){input.value=''; bootSocialPage();}).catch(function(e){alert(e.message||'Could not post');}).finally(function(){postBtn.disabled=false;});}); }
    var sug=qs('#sfSuggestions'); if(sug){ api('/users/search?q=a&limit=5').then(function(d){var users=d.results||[]; sug.innerHTML=users.length?users.map(renderSuggestion).join(''):'<div class="slsc-empty small">Search people from the global search bar to add friends.</div>';}).catch(function(){sug.innerHTML='<div class="slsc-empty small">Friend suggestions unavailable.</div>';}); }
    var trending=qs('#sfTrending'); if(trending){ api('/venues/tonight?limit=5').then(function(d){var venues=d.venues||[]; trending.innerHTML=venues.map(function(v){return '<a class="slsc-trend" href="/explore.html?venue='+(v.slug?encodeURIComponent(v.slug):'')+'"><strong>'+esc(v.name)+'</strong><span>'+esc(v.neighborhood||'Boston')+'</span></a>';}).join('');}).catch(function(){}); }
    api('/social/summary').then(function(s){var map={sfStatCheckins:'posts',sfStatReviews:'plans',sfStatSaved:'saved_venues',sfStatScene:'lists'};Object.keys(map).forEach(function(id){var el=qs('#'+id);if(el)el.textContent=s[map[id]]||0;});}).catch(function(){});
  }
  function bindSocialActions(){ document.addEventListener('click',function(e){
      var like=e.target.closest('[data-slsc-like]'); if(like){ e.preventDefault(); var id=like.getAttribute('data-slsc-like'); api('/posts/'+encodeURIComponent(id)+'/like',{method:'POST'}).then(function(d){like.innerHTML='<i class="'+(d.liked?'fas':'far')+' fa-heart"></i> '+(d.like_count||0);}).catch(function(err){ if(err.status===401){var a=qs('.sl-auth-trigger'); if(a)a.click();} else alert(err.message||'Could not like');}); }
      var add=e.target.closest('[data-slsc-add-friend]'); if(add){ e.preventDefault(); add.disabled=true; api('/friends/request',{method:'POST',body:{user_id:add.getAttribute('data-slsc-add-friend')}}).then(function(){add.textContent='Sent';}).catch(function(err){add.disabled=false;alert(err.message||'Could not send request');}); }
    }); }
  function boot(){ installBadges(); bootSocialPage(); bindSocialActions(); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
