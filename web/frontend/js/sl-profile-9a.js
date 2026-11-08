/**
 * SceneLink — Phase 9A Public Profile (js/sl-profile-9a.js)
 *
 * Adds PUBLIC profile viewing to profile.html via ?u=<username-or-id>.
 *   - Loads SL.social.getProfile(idOrUsername) → { user, is_me, friendship_status }
 *   - Renders into existing DOM (profileDisplayName, profileAvatarImg, bio, stats, tabs)
 *   - Action row: Add Friend / Requested / Respond / Friends + Message + Report/Block
 *   - Loads the user's public posts into the Activity tab
 *
 * When NO ?u= param (or ?u= resolves to self) it bows out so the existing
 * own-profile scripts (profile-social.js, sl-profile-real-data.js) run normally.
 *
 * Requires: js/sl-social-core.js (window.SL.social)
 */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var who = params.get('u') || params.get('user') || params.get('username');
  if (!who) return; // own profile → existing scripts handle it

  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn); else fn(); }
  function social(){ return (window.SL && window.SL.social) || null; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function $(id){ return document.getElementById(id); }
  function initial(n){ return (String(n||'S').trim().charAt(0)||'S').toUpperCase(); }
  function timeAgo(iso){ if(!iso) return ''; var s=Math.floor((Date.now()-new Date(iso).getTime())/1000); if(s<60) return s+'s'; if(s<3600) return Math.floor(s/60)+'m'; if(s<86400) return Math.floor(s/3600)+'h'; if(s<604800) return Math.floor(s/86400)+'d'; return new Date(iso).toLocaleDateString(); }
  function toast(msg){ if(window.SLToast) return window.SLToast(msg,2600); var t=document.createElement('div'); t.textContent=msg; t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid rgba(212,175,55,.3);color:#fff;padding:12px 20px;border-radius:10px;z-index:99999;font-size:14px;'; document.body.appendChild(t); setTimeout(function(){t.remove();},2600); }

  var TARGET = null;

  ready(function(){
    var tries=0;
    (function wait(){
      if(social()){ load(); return; }
      if(tries++<40){ setTimeout(wait,100); return; }
      // social core failed — show graceful error
      var name=$('profileDisplayName'); if(name) name.textContent='Profile unavailable';
    })();
  });

  function load(){
    var s=social();
    // Mark body authed-ish so the requires-auth CSS doesn't hide the public profile
    document.body.classList.add('sl-authed');

    s.getProfile(who).then(function(r){
      if(r.notFound){ renderNotFound(); return; }
      if(!r.ok || !r.data || !r.data.user){ renderNotFound(); return; }
      var d=r.data;
      // If this is actually me, hand back to own-profile flow (strip param, reload clean)
      if(d.is_me){ window.location.replace('profile.html'); return; }
      TARGET = d.user;
      renderProfile(d.user);
      renderActions(d.user, d.friendship_status, s.isLoggedIn(), d.can_message);
      if(d.can_view === false){
        var privateFeed=$('profileActivityFeed');
        if(privateFeed) privateFeed.textContent='This profile is private. Connect as friends to see shared activity.';
      } else loadActivity(d.user.id);
    });
  }

  function renderProfile(u){
    var name=u.display_name||u.username||'SceneLink user';
    if($('profileDisplayName')) $('profileDisplayName').textContent=name;
    if($('profileEmailEl')) $('profileEmailEl').textContent = u.username ? '@'+u.username : '';
    if($('profileBioEl')) $('profileBioEl').textContent = u.bio || (u.neighborhood ? '📍 '+u.neighborhood : ' ');
    var img=$('profileAvatarImg');
    if(img){
      if(u.avatar_url){ img.src=u.avatar_url; }
      else { img.removeAttribute('src'); var ph=document.createElement('div'); ph.className='profile-avatar'; ph.style.cssText='display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;font-weight:800;font-size:42px;'; ph.textContent=initial(name); img.replaceWith(ph); }
    }
    // Hide level/verified gamification on public profiles (avoid implying fake data)
    var lvl=$('profileLevelBadge'); if(lvl && lvl.closest('[id*="Level"],.profile-level-badge,.profile-level')) { }
    // Stats: map real counts into stat slots if present
    setStat('checkins', u.checkin_count);
    setStat('reviews', u.review_count);
    setStat('posts', u.post_count);
    setStat('friends', u.friend_count);
    // generic stat elements by id
    [['profileStatCheckins',u.checkin_count],['profileStatReviews',u.review_count],['profileStatPosts',u.post_count],['profileStatFriends',u.friend_count]].forEach(function(p){ var el=$(p[0]); if(el) el.textContent=String(p[1]||0); });
    document.title = name + ' — SceneLink';
    // hide edit/settings own-actions, achievements widget
    var own=$('profileOwnActionsRow'); if(own) own.style.display='none';
  }

  function setStat(label, val){
    // best-effort: find a stat with matching label text
    var stats=document.querySelectorAll('.profile-stat, .stat, [class*="stat"]');
    stats.forEach(function(s){
      var t=(s.textContent||'').toLowerCase();
      if(t.indexOf(label)>=0){
        var num=s.querySelector('.stat-value,.profile-stat-value,strong,b,.value');
        if(num) num.textContent=String(val||0);
      }
    });
  }

  function renderActions(u, fs, loggedIn, canMessage){
    var row=$('profileActionsRow');
    if(!row) return;
    row.style.display='flex';
    row.innerHTML='';

    if(!loggedIn){
      row.innerHTML='<button class="btn-profile-action primary sl-auth-trigger"><i class="fas fa-user-plus"></i> Log in to connect</button>';
      return;
    }

    var friendBtn=document.createElement('button');
    friendBtn.className='btn-profile-action primary';
    var status=(fs&&fs.status)||'none';
    var dir=(fs&&fs.direction)||'';

    function setFriendBtn(){
      if(status==='accepted'){ friendBtn.innerHTML='<i class="fas fa-user-check"></i> Friends'; friendBtn.classList.remove('primary'); }
      else if(status==='pending' && dir==='outgoing'){ friendBtn.innerHTML='<i class="fas fa-clock"></i> Requested'; friendBtn.disabled=true; friendBtn.style.opacity='0.7'; }
      else if(status==='pending' && dir==='incoming'){ friendBtn.innerHTML='<i class="fas fa-user-plus"></i> Accept request'; }
      else { friendBtn.innerHTML='<i class="fas fa-user-plus"></i> Add Friend'; friendBtn.classList.add('primary'); }
    }
    setFriendBtn();

    friendBtn.addEventListener('click', function(){
      var s=social();
      if(status==='accepted'){
        if(!confirm('Remove '+ (u.display_name||u.username) +' from friends?')) return;
        s.removeFriend(u.id).then(function(r){ if(r.ok){ status='none'; dir=''; setFriendBtn(); toast('Removed'); } });
      } else if(status==='pending' && dir==='incoming'){
        s.acceptFriendRequest(fs.id).then(function(r){ if(r.ok){ status='accepted'; setFriendBtn(); toast('You are now friends'); } });
      } else if(status==='none' || status==='declined' || !status){
        friendBtn.disabled=true; friendBtn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
        s.sendFriendRequest(u.id).then(function(r){ friendBtn.disabled=false; if(r.ok){ status='pending'; dir='outgoing'; setFriendBtn(); } else if(r.loggedOut){ var a=document.querySelector('.sl-auth-trigger'); if(a)a.click(); } else { setFriendBtn(); toast(r.error||'Could not send request'); } });
      }
    });
    row.appendChild(friendBtn);

    // Message
    var msgBtn=document.createElement('button');
    msgBtn.className='btn-profile-action';
    msgBtn.innerHTML='<i class="far fa-paper-plane"></i> Message';
    msgBtn.addEventListener('click', function(){ window.location.href='messages.html?user='+encodeURIComponent(u.username||u.id); });
    if(canMessage) row.appendChild(msgBtn);

    // Overflow: report / block
    var moreBtn=document.createElement('button');
    moreBtn.className='btn-profile-action';
    moreBtn.setAttribute('aria-label','More options');
    moreBtn.innerHTML='<i class="fas fa-ellipsis"></i>';
    moreBtn.addEventListener('click', function(e){ e.stopPropagation(); openMoreMenu(u, moreBtn); });
    row.appendChild(moreBtn);
  }

  function openMoreMenu(u, anchor){
    var existing=document.getElementById('slProfMore'); if(existing){ existing.remove(); return; }
    var menu=document.createElement('div'); menu.id='slProfMore';
    menu.style.cssText='position:absolute;background:#141414;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:6px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.5);min-width:160px;';
    menu.innerHTML='<button data-act="report" style="display:block;width:100%;text-align:left;background:none;border:none;color:#fff;padding:10px 14px;cursor:pointer;font-size:14px;border-radius:8px;"><i class="fas fa-flag" style="width:18px;color:#D4AF37;"></i> Report</button>'+
      '<button data-act="block" style="display:block;width:100%;text-align:left;background:none;border:none;color:#f66;padding:10px 14px;cursor:pointer;font-size:14px;border-radius:8px;"><i class="fas fa-ban" style="width:18px;"></i> Block</button>';
    document.body.appendChild(menu);
    var rect=anchor.getBoundingClientRect();
    menu.style.top=(rect.bottom+window.scrollY+6)+'px';
    menu.style.left=(rect.left+window.scrollX-100)+'px';
    function close(){ menu.remove(); document.removeEventListener('click',close); document.removeEventListener('keydown',onKey); }
    function onKey(e){ if(e.key==='Escape') close(); }
    setTimeout(function(){ document.addEventListener('click',close); document.addEventListener('keydown',onKey); },0);
    menu.querySelector('[data-act="report"]').addEventListener('click', function(){ close(); openReport(u); });
    menu.querySelector('[data-act="block"]').addEventListener('click', function(){
      close();
      if(!confirm('Block '+(u.display_name||u.username)+'? They won\'t be able to message you or see your activity.')) return;
      social().blockUser(u.id).then(function(r){ if(r.ok){ toast('Blocked'); setTimeout(function(){ window.location.href='social-feed.html'; },800); } else toast(r.error||'Could not block'); });
    });
  }

  function openReport(u){
    var reasons=[['spam','Spam'],['harassment','Harassment'],['hate_speech','Hate speech'],['violence','Violence'],['sexual_content','Sexual content'],['other','Other']];
    var ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML='<div style="background:#141414;border:1px solid rgba(212,175,55,.2);border-radius:16px;padding:24px;max-width:380px;width:100%;"><h3 style="color:#fff;margin:0 0 16px;font-size:18px;">Report '+esc(u.display_name||u.username)+'</h3><div id="slRepR">'+reasons.map(function(r){return '<button data-r="'+r[0]+'" style="display:block;width:100%;text-align:left;background:#0c0c0c;border:1px solid rgba(255,255,255,.06);color:#fff;border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;font-size:14px;">'+r[1]+'</button>';}).join('')+'</div><button id="slRepCancel" style="width:100%;background:none;border:none;color:rgba(255,255,255,.5);padding:8px;cursor:pointer;">Cancel</button></div>';
    document.body.appendChild(ov);
    function close(){ ov.remove(); document.removeEventListener('keydown',onKey); }
    function onKey(e){ if(e.key==='Escape') close(); }
    document.addEventListener('keydown',onKey);
    ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
    ov.querySelector('#slRepCancel').addEventListener('click',close);
    ov.querySelectorAll('#slRepR button').forEach(function(b){ b.addEventListener('click',function(){ social().reportUser(u.id, b.getAttribute('data-r')).then(function(r){ if(r.ok){ close(); toast('Report received.'); } else toast(r.error || 'Report could not be submitted. Please try again.'); }); }); });
  }

  function loadActivity(userId){
    var feed=$('profileActivityFeed'); if(!feed) return;
    var loading=$('profileActivityLoading'); if(loading) loading.style.display='none';
    feed.innerHTML='<div style="text-align:center;padding:32px;color:rgba(255,255,255,.4);"><i class="fas fa-spinner fa-spin"></i></div>';
    social().getUserPosts(userId).then(function(r){
      var posts=(r.ok&&r.data&&(r.data.posts||r.data.items))||[];
      if(!posts.length){ feed.innerHTML='<div style="text-align:center;padding:48px 20px;color:rgba(255,255,255,.45);"><i class="fas fa-feather" style="font-size:28px;color:#D4AF37;margin-bottom:10px;display:block;"></i>No public posts yet.</div>'; return; }
      feed.innerHTML=posts.map(function(p){
        var venue=p.venue_name?' <span style="color:#D4AF37;">at '+esc(p.venue_name)+'</span>':'';
        var img=p.image_url?'<img src="'+esc(p.image_url)+'" loading="lazy" style="width:100%;max-height:300px;object-fit:cover;border-radius:10px;margin-top:8px;">':'';
        return '<div style="background:#141414;border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:14px;margin-bottom:10px;">'+
          (p.body?'<div style="color:rgba(255,255,255,.88);font-size:14px;line-height:1.5;white-space:pre-wrap;">'+esc(p.body)+venue+'</div>':'<div style="color:rgba(255,255,255,.6);font-size:14px;">'+venue+'</div>')+
          img+
          '<div style="display:flex;gap:16px;color:rgba(255,255,255,.4);font-size:12px;margin-top:8px;"><span><i class="far fa-heart"></i> '+(p.like_count||0)+'</span><span><i class="far fa-comment"></i> '+(p.comment_count||0)+'</span><span style="margin-left:auto;">'+timeAgo(p.created_at)+'</span></div>'+
        '</div>';
      }).join('');
    });
  }

  function renderNotFound(){
    document.body.classList.add('sl-authed');
    if($('profileDisplayName')) $('profileDisplayName').textContent='User not found';
    if($('profileEmailEl')) $('profileEmailEl').textContent='';
    if($('profileBioEl')) $('profileBioEl').innerHTML='<span style="color:rgba(255,255,255,.5);">This profile doesn\'t exist or is unavailable. <a href="social-feed.html" style="color:#D4AF37;">Back to Social</a></span>';
    var own=$('profileOwnActionsRow'); if(own) own.style.display='none';
    var row=$('profileActionsRow'); if(row) row.style.display='none';
    var feed=$('profileActivityFeed'); if(feed) feed.innerHTML='';
    var loading=$('profileActivityLoading'); if(loading) loading.style.display='none';
  }
})();

// Own-profile privacy controls: canonical server settings, never local-only preferences.
(function(){
  'use strict';
  var q=new URLSearchParams(location.search);
  if(q.get('u')||q.get('user')||q.get('username')) return;
  function mount(){
    var social=window.SL&&window.SL.social;
    if(!social||!social.isLoggedIn()||document.getElementById('slPrivacySettings')) return;
    social.getMe().then(function(r){
      if(!r.ok||!r.data||!r.data.user||document.getElementById('slPrivacySettings')) return;
      var u=r.data.user,section=document.createElement('section');section.id='slPrivacySettings';
      section.style.cssText='max-width:920px;margin:24px auto;padding:24px;background:#141414;border:1px solid rgba(212,175,55,.25);border-radius:14px;color:#fff';
      section.innerHTML='<h2 style="color:#D4AF37">Privacy</h2><form><label style="display:block;margin:16px 0"><input type="checkbox" name="privateProfile"> Private profile — only friends can see your profile activity</label><label>Who can message you? <select name="messages" style="padding:8px;background:#222;color:#fff;border:1px solid #D4AF37;border-radius:6px"><option value="everyone">Everyone</option><option value="friends">Friends</option><option value="none">No one</option></select></label><p><button type="submit" class="btn-profile-action primary">Save privacy settings</button></p><p role="status" aria-live="polite"></p></form>';
      var form=section.querySelector('form'),status=section.querySelector('[role="status"]'),button=form.querySelector('button');
      form.elements.privateProfile.checked=!!u.is_private;form.elements.messages.value=u.allow_messages||'friends';
      form.addEventListener('submit',function(e){e.preventDefault();button.disabled=true;status.textContent='Saving…';
        social.request('PATCH','/users/me/settings',{is_private:form.elements.privateProfile.checked,allow_messages:form.elements.messages.value}).then(function(result){
          button.disabled=false;status.textContent=result.ok?'Privacy settings saved.':(result.error||'Could not save. Please try again.');
        });
      });
      (document.querySelector('main')||document.body).appendChild(section);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();
  window.addEventListener('sl-auth-changed',mount);
})();
