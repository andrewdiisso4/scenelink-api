/**
 * SceneLink — Phase 9A Cross-App Social Integration (js/sl-social-integration-9a.js)
 *
 * Adds, on EVERY page, when logged in:
 *   - Header notification bell (+ unread badge) → opens notifications drawer
 *   - Header messages icon (+ unread badge) → links to messages.html
 *   - Header profile avatar → links to profile.html
 * Driven by SL.social.realtime (SSE) with polling fallback. Badges live-update.
 *
 * Logged out: injects nothing extra (the existing "Log in / Sign up" CTA stays).
 *
 * MUST be defensive: never break the header, nav, or any page if social fails.
 * Requires: js/sl-social-core.js
 */
(function () {
  'use strict';
  if (window.__slSocialIntegration9a) return;
  window.__slSocialIntegration9a = true;

  function social(){ return (window.SL && window.SL.social) || null; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function timeAgo(iso){ if(!iso) return ''; var s=Math.floor((Date.now()-new Date(iso).getTime())/1000); if(s<60) return s+'s'; if(s<3600) return Math.floor(s/60)+'m'; if(s<86400) return Math.floor(s/3600)+'h'; if(s<604800) return Math.floor(s/86400)+'d'; return new Date(iso).toLocaleDateString(); }

  function actionsHost(){
    return document.querySelector('.sl-phase8-actions') ||
           document.querySelector('.nav-right') ||
           document.querySelector('header .nav-actions') || null;
  }

  function injectStyles(){
    if(document.getElementById('sl-social-int-css')) return;
    var st=document.createElement('style'); st.id='sl-social-int-css';
    st.textContent =
      '.sl-hdr-icon{position:relative;background:none;border:none;color:#fff;cursor:pointer;width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:18px;transition:background .15s;text-decoration:none;}'+
      '.sl-hdr-icon:hover{background:rgba(212,175,55,.12);color:#D4AF37;}'+
      '.sl-hdr-badge{position:absolute;top:4px;right:4px;min-width:16px;height:16px;background:#D4AF37;color:#000;border-radius:8px;font-size:10px;font-weight:800;display:none;align-items:center;justify-content:center;padding:0 4px;line-height:1;}'+
      '.sl-hdr-badge.show{display:flex;}'+
      '.sl-hdr-avatar{width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid rgba(212,175,55,.4);cursor:pointer;background:#1a1a1a;}'+
      '.sl-notif-drawer{position:fixed;top:0;right:0;width:380px;max-width:92vw;height:100vh;background:#0e0e0e;border-left:1px solid rgba(212,175,55,.15);z-index:100000;transform:translateX(100%);transition:transform .25s ease;display:flex;flex-direction:column;}'+
      '.sl-notif-drawer.open{transform:translateX(0);}'+
      '.sl-notif-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;opacity:0;pointer-events:none;transition:opacity .25s;}'+
      '.sl-notif-backdrop.open{opacity:1;pointer-events:auto;}'+
      '.sl-notif-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.06);}'+
      '.sl-notif-list{flex:1;overflow-y:auto;padding:8px;}'+
      '.sl-notif-item{display:flex;gap:10px;padding:12px;border-radius:10px;text-decoration:none;color:#fff;}'+
      '.sl-notif-item.unread{background:rgba(212,175,55,.06);}'+
      '.sl-notif-item:hover{background:rgba(255,255,255,.04);}'+
      '@media(max-width:600px){.sl-hdr-icon{width:38px;height:38px;font-size:17px;}}';
    document.head.appendChild(st);
  }

  var els = {};

  function build(){
    var host = actionsHost();
    if(!host || document.getElementById('slHdrSocial')) return;
    injectStyles();

    var wrap=document.createElement('div');
    wrap.id='slHdrSocial';
    wrap.style.cssText='display:inline-flex;align-items:center;gap:4px;';

    // Messages
    var msg=document.createElement('a');
    msg.className='sl-hdr-icon'; msg.href='messages.html'; msg.setAttribute('aria-label','Messages');
    msg.innerHTML='<i class="far fa-paper-plane"></i><span class="sl-hdr-badge" id="slMsgBadge"></span>';

    // Notifications
    var bell=document.createElement('button');
    bell.className='sl-hdr-icon'; bell.type='button'; bell.setAttribute('aria-label','Notifications');
    bell.innerHTML='<i class="far fa-bell"></i><span class="sl-hdr-badge" id="slNotifBadge"></span>';
    bell.addEventListener('click', toggleDrawer);

    // Avatar
    var av=document.createElement('a');
    av.href='profile.html'; av.setAttribute('aria-label','Profile');
    av.style.cssText='display:inline-flex;align-items:center;margin-left:4px;';
    av.innerHTML='<span class="sl-hdr-avatar" id="slHdrAvatar" style="display:inline-flex;align-items:center;justify-content:center;color:#000;background:linear-gradient(135deg,#D4AF37,#b8860b);font-weight:800;font-size:14px;">·</span>';

    wrap.appendChild(msg); wrap.appendChild(bell); wrap.appendChild(av);

    // Insert before the login button if present, else prepend
    var loginBtn = host.querySelector('.sl-auth-trigger');
    if(loginBtn) host.insertBefore(wrap, loginBtn);
    else host.insertBefore(wrap, host.firstChild);

    els.msgBadge=document.getElementById('slMsgBadge');
    els.notifBadge=document.getElementById('slNotifBadge');
    els.avatar=document.getElementById('slHdrAvatar');

    // hide the "log in/sign up" button when authed (it's redundant)
    if(loginBtn) loginBtn.style.display='none';

    // load avatar + initial badges
    social().getMe().then(function(r){
      var u=(r.ok&&r.data&&(r.data.user||r.data))||null;
      if(u && els.avatar){
        var name=u.display_name||u.username||'You';
        if(u.avatar_url){ els.avatar.outerHTML='<img class="sl-hdr-avatar" id="slHdrAvatar" src="'+esc(u.avatar_url)+'" alt="'+esc(name)+'">'; }
        else { els.avatar.textContent=(name.charAt(0)||'·').toUpperCase(); }
      }
    });
  }

  function setBadge(el, n){
    if(!el) return;
    if(n>0){ el.textContent = n>9?'9+':String(n); el.classList.add('show'); }
    else { el.classList.remove('show'); }
  }

  function applyUnread(u){
    setBadge(els.notifBadge, (u&&u.notifications)||0);
    setBadge(els.msgBadge, (u&&u.messages)||0);
  }

  // ── Notifications drawer ──
  var drawer, backdrop;
  function ensureDrawer(){
    if(drawer) return;
    backdrop=document.createElement('div'); backdrop.className='sl-notif-backdrop';
    drawer=document.createElement('div'); drawer.className='sl-notif-drawer';
    drawer.innerHTML='<div class="sl-notif-head"><strong style="font-size:17px;color:#fff;">Notifications</strong>'+
      '<div><button id="slNotifReadAll" style="background:none;border:none;color:#D4AF37;cursor:pointer;font-size:13px;margin-right:8px;">Mark all read</button>'+
      '<button id="slNotifClose" style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:20px;">&times;</button></div></div>'+
      '<div class="sl-notif-list" id="slNotifList"></div>';
    document.body.appendChild(backdrop); document.body.appendChild(drawer);
    backdrop.addEventListener('click', closeDrawer);
    drawer.querySelector('#slNotifClose').addEventListener('click', closeDrawer);
    drawer.querySelector('#slNotifReadAll').addEventListener('click', function(){
      social().markAllNotificationsRead().then(function(){ loadNotifs(); applyUnread({notifications:0, messages:(social().realtime.current()||{}).messages||0}); });
    });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape' && drawer.classList.contains('open')) closeDrawer(); });
  }
  function toggleDrawer(){ ensureDrawer(); if(drawer.classList.contains('open')) closeDrawer(); else openDrawer(); }
  function openDrawer(){ ensureDrawer(); drawer.classList.add('open'); backdrop.classList.add('open'); loadNotifs(); }
  function closeDrawer(){ if(drawer){ drawer.classList.remove('open'); backdrop.classList.remove('open'); } }

  function loadNotifs(){
    var list=document.getElementById('slNotifList'); if(!list) return;
    list.innerHTML='<div style="text-align:center;padding:32px;color:rgba(255,255,255,.4);"><i class="fas fa-spinner fa-spin"></i></div>';
    social().getNotifications().then(function(r){
      var items=(r.ok&&r.data&&(r.data.notifications||r.data.items))||[];
      if(!items.length){ list.innerHTML='<div style="text-align:center;padding:48px 20px;color:rgba(255,255,255,.4);"><i class="far fa-bell" style="font-size:28px;color:#D4AF37;margin-bottom:10px;display:block;"></i>No notifications yet.</div>'; return; }
      list.innerHTML=items.map(function(n){
        var unread = !n.read_at;
        var href = notifHref(n);
        return '<a class="sl-notif-item '+(unread?'unread':'')+'" href="'+esc(href)+'" data-id="'+esc(n.id)+'">'+
          '<div style="width:36px;height:36px;border-radius:50%;background:rgba(212,175,55,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="'+notifIcon(n)+'" style="color:#D4AF37;font-size:14px;"></i></div>'+
          '<div style="flex:1;min-width:0;"><div style="font-size:13px;line-height:1.4;">'+esc(notifText(n))+'</div>'+
          '<div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:3px;">'+timeAgo(n.created_at)+'</div></div>'+
          (unread?'<span style="width:8px;height:8px;border-radius:50%;background:#D4AF37;flex-shrink:0;align-self:center;"></span>':'')+
        '</a>';
      }).join('');
      list.querySelectorAll('.sl-notif-item').forEach(function(a){
        a.addEventListener('click', function(){ var id=a.getAttribute('data-id'); social().markNotificationRead(id); });
      });
    });
  }
  function notifText(n){
    if(n.message) return n.message;
    var actor=n.actor_display_name||n.actor_username||'Someone';
    switch(n.type){
      case 'friend_request': return actor+' sent you a friend request';
      case 'friend_accept': return actor+' accepted your friend request';
      case 'post_like': return actor+' liked your post';
      case 'post_comment': return actor+' commented on your post';
      case 'message': return actor+' sent you a message';
      case 'check_in': case 'checkin': return actor+' checked in';
      default: return actor+' interacted with you';
    }
  }
  function notifIcon(n){
    switch(n.type){
      case 'friend_request': case 'friend_accept': return 'fas fa-user-plus';
      case 'post_like': return 'fas fa-heart';
      case 'post_comment': return 'fas fa-comment';
      case 'message': return 'fas fa-paper-plane';
      default: return 'fas fa-bell';
    }
  }
  function notifHref(n){
    var d=n.data||{};
    if(n.type==='message') return 'messages.html';
    if(n.type==='friend_request'||n.type==='friend_accept') return d.username?('profile.html?u='+encodeURIComponent(d.username)):'social-feed.html';
    return 'social-feed.html';
  }

  // ── Boot ──
  function boot(){
    var s=social();
    if(!s){ return; }
    if(!s.isLoggedIn()){ teardown(); return; }
    build();
    if(s.realtime && s.realtime.on){
      s.realtime.on(applyUnread);
      s.realtime.start && s.realtime.start();
    } else {
      // one-off fetch
      Promise.all([s.getUnreadNotifications(), s.getUnreadMessages()]).then(function(r){
        applyUnread({ notifications:(r[0].ok&&r[0].data&&r[0].data.unread)||0, messages:(r[1].ok&&r[1].data&&r[1].data.unread)||0 });
      });
    }
  }
  function teardown(){
    var w=document.getElementById('slHdrSocial'); if(w) w.remove();
  }

  function start(){
    var tries=0;
    (function w(){
      if(social()){ boot(); return; }
      if(tries++<40) setTimeout(w,100);
    })();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
  document.addEventListener('sl-auth-change', function(){ var w=document.getElementById('slHdrSocial'); if(w) w.remove(); window.__slSocialIntegration9a=false; window.__slSocialIntegration9a=true; start(); });
})();
