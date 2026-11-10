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
      '.sl-notif-drawer[hidden]{display:none;}'+
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

  var els = {}, epoch = 0, session = '', notificationSeq = 0, stopUnread = null, priorFocus = null, loginTrigger = null;
  function token(){
    try {
      if(window.SLAuth && window.SLAuth.getToken) return window.SLAuth.getToken() || '';
      if(window.SLApi && window.SLApi.getToken) return window.SLApi.getToken() || '';
      return localStorage.getItem('sl_jwt_token') || '';
    } catch (_) { return ''; }
  }
  function current(captured){ return captured === epoch && session === token() && social() && social().isLoggedIn(); }
  function resultOK(r){ return r && r.ok === true; }
  function confirmed(r){ return resultOK(r) && r.data && r.data.ok === true; }
  function drawerStatus(text){ var el=document.getElementById('slNotifStatus'); if(el) el.textContent=text || ''; }


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
    if(loginBtn){ loginTrigger={element:loginBtn,display:loginBtn.style.display}; loginBtn.style.display='none'; }

    // load avatar + initial badges
    var captured=epoch;
    social().getMe().then(function(r){
      if(!current(captured)) return;
      var u=(r.ok&&r.data&&(r.data.user||r.data))||null;
      if(u && els.avatar){
        var name=u.display_name||u.username||'You';
        if(u.avatar_url){ els.avatar.outerHTML='<img class="sl-hdr-avatar" id="slHdrAvatar" src="'+esc(u.avatar_url)+'" alt="'+esc(name)+'">'; els.avatar=document.getElementById('slHdrAvatar'); }
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
    drawer=document.createElement('div'); drawer.className='sl-notif-drawer'; drawer.hidden=true; drawer.setAttribute('role','dialog'); drawer.setAttribute('aria-modal','true'); drawer.setAttribute('aria-labelledby','slNotifTitle'); drawer.tabIndex=-1;
    drawer.innerHTML='<div class="sl-notif-head"><strong id="slNotifTitle" style="font-size:17px;color:#fff;">Notifications</strong>'+
      '<div><button id="slNotifReadAll" style="background:none;border:none;color:#D4AF37;cursor:pointer;font-size:13px;margin-right:8px;">Mark all read</button>'+
      '<button id="slNotifClose" aria-label="Close notifications" style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:20px;">&times;</button></div></div>'+
      '<p id="slNotifStatus" role="status" aria-live="polite"></p><div class="sl-notif-list" id="slNotifList"></div>';
    document.body.appendChild(backdrop); document.body.appendChild(drawer);
    backdrop.addEventListener('click', closeDrawer);
    drawer.querySelector('#slNotifClose').addEventListener('click', closeDrawer);
    drawer.querySelector('#slNotifReadAll').addEventListener('click', function(){
      var captured=epoch, button=this; button.disabled=true; drawerStatus('Marking notifications read…');
      social().markAllNotificationsRead().then(function(r){
        if(!current(captured)) return;
        if(!confirmed(r)) throw new Error('Read status was not confirmed');
        drawerStatus('Notifications marked read.'); setBadge(els.notifBadge,0); loadNotifs();
      }).catch(function(){ if(current(captured)) drawerStatus('Read status could not be saved. Please retry.'); })
        .finally(function(){ if(current(captured) && button.isConnected) button.disabled=false; });
    });
    drawer.addEventListener('keydown', function(e){
      if(e.key==='Escape'){ e.preventDefault(); closeDrawer(); }
      if(e.key==='Tab'){
        var controls=Array.from(drawer.querySelectorAll('button:not([disabled]),a[href]')), first=controls[0], last=controls[controls.length-1];
        if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
      }
    });
  }
  function toggleDrawer(){ ensureDrawer(); if(drawer.classList.contains('open')) closeDrawer(); else openDrawer(); }
  function openDrawer(){
    ensureDrawer(); priorFocus=document.activeElement; drawer.hidden=false; drawer.classList.add('open'); backdrop.classList.add('open');
    drawer.querySelector('#slNotifClose').focus(); loadNotifs();
  }
  function closeDrawer(){
    notificationSeq++;
    if(drawer){ drawer.classList.remove('open'); drawer.hidden=true; backdrop.classList.remove('open'); }
    if(priorFocus && priorFocus.isConnected) priorFocus.focus(); priorFocus=null;
  }
  function loadNotifs(){
    var list=document.getElementById('slNotifList'); if(!list) return;
    var captured=epoch, seq=++notificationSeq;
    list.innerHTML='<p role="status" style="text-align:center;padding:32px;">Loading notifications…</p>';
    social().getNotifications().then(function(r){
      if(!current(captured) || seq!==notificationSeq || !list.isConnected) return;
      var items=r && r.data && (r.data.notifications || r.data.items);
      if(!resultOK(r) || !Array.isArray(items)) throw new Error('Notifications unavailable');
      if(!items.length){ list.innerHTML='<p style="text-align:center;padding:48px 20px;">No notifications yet.</p>'; return; }
      list.innerHTML=items.map(function(n){
        var unread = !n.read_at, href = notifHref(n);
        return '<a class="sl-notif-item '+(unread?'unread':'')+'" href="'+esc(href)+'" data-id="'+esc(n.id)+'">'+
          '<div style="width:36px;height:36px;border-radius:50%;background:rgba(212,175,55,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="'+notifIcon(n)+'" style="color:#D4AF37;font-size:14px;"></i></div>'+
          '<div style="flex:1;min-width:0;"><div style="font-size:13px;line-height:1.4;">'+esc(notifText(n))+'</div>'+
          '<div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:3px;">'+esc(timeAgo(n.created_at))+'</div></div>'+
          (unread?'<span style="width:8px;height:8px;border-radius:50%;background:#D4AF37;flex-shrink:0;align-self:center;"></span>':'')+
        '</a>';
      }).join('');
      list.querySelectorAll('.sl-notif-item').forEach(function(a){
        a.addEventListener('click', function(){
          if(!current(captured)) return;
          social().markNotificationRead(a.getAttribute('data-id')).then(function(r){
            if(current(captured) && confirmed(r) && a.isConnected) a.classList.remove('unread');
          });
        });
      });
    }).catch(function(){
      if(!current(captured) || seq!==notificationSeq || !list.isConnected) return;
      list.innerHTML='<p role="status">Notifications could not be loaded. Your notifications have not been cleared.</p><button type="button" id="slNotifRetry">Retry notifications</button>';
      list.querySelector('#slNotifRetry').onclick=loadNotifs;
    });
  }
  function notifText(n){
    var actor=n.actor_display_name||n.actor_username||'Someone';
    switch(n.type){
      case 'friend_request': return actor+' sent you a friend request';
      case 'friend_accept': case 'friend_accepted': return actor+' accepted your friend request';
      case 'post_like': return actor+' liked your post';
      case 'post_comment': return actor+' commented on your post';
      case 'message': case 'new_message': return actor+' sent you a message';
      case 'list_invitation': return actor+' invited you to a list';
      case 'room_invitation': case 'plan_invite': return actor+' invited you to a private plan';
      case 'room_accepted': case 'plan_accept': return actor+' joined your plan';
      case 'room_declined': return actor+' declined your plan invitation';
      case 'room_confirmed': return 'Your group selected a venue. This is not a reservation.';
      case 'check_in': case 'checkin': return actor+' checked in';
      default: return n.message || (n.data && n.data.message) || actor+' interacted with you';
    }
  }
  function notifIcon(n){
    switch(n.type){
      case 'friend_request': case 'friend_accept': case 'friend_accepted': return 'fas fa-user-plus';
      case 'post_like': return 'fas fa-heart';
      case 'post_comment': return 'fas fa-comment';
      case 'message': case 'new_message': return 'fas fa-paper-plane';
      case 'list_invitation': return 'fas fa-list';
      case 'room_invitation': case 'room_accepted': case 'room_declined': case 'room_confirmed': case 'plan_invite': case 'plan_accept': return 'fas fa-calendar';
      default: return 'fas fa-bell';
    }
  }
  function notifHref(n){
    var d=n.data||{}, validId=function(v){ return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); };
    if(n.type==='list_invitation') return '/my-lists'+(n.ref_type==='list' && validId(n.ref_id)?'?list='+encodeURIComponent(n.ref_id):'');
    if(n.type==='message' || n.type==='new_message') return '/messages'+(n.ref_type==='conversation' && validId(n.ref_id)?'?conversation='+encodeURIComponent(n.ref_id):'');
    if(n.type==='friend_request' || n.type==='friend_accept' || n.type==='friend_accepted'){
      var actor=n.actor_username || (validId(n.actor_id)?n.actor_id:null) || d.username;
      return actor?'/profile?u='+encodeURIComponent(actor):'/profile#friends';
    }
    if(/^room_(invitation|accepted|declined|confirmed)$/.test(n.type)) return '/plan-with-friends'+(n.ref_type==='room' && validId(n.ref_id)?'?room_id='+encodeURIComponent(n.ref_id):'');
    if(n.type==='plan_invite' || n.type==='plan_accept') return '/plan-with-friends';
    return '/social-feed';
  }

  // ── Boot ──
  function boot(){
    var s=social(); if(!s) return;
    if(!s.isLoggedIn()){ teardown(); return; }
    if(session!==token()) teardown();
    session=token(); build();
    if(stopUnread) return;
    var captured=epoch;
    if(s.realtime && s.realtime.on){
      s.realtime.start && s.realtime.start();
      stopUnread=s.realtime.on(function(u){ if(current(captured)) applyUnread(u); }) || function(){};
    } else {
      stopUnread=function(){};
      Promise.all([s.getUnreadNotifications(), s.getUnreadMessages()]).then(function(r){
        if(current(captured) && resultOK(r[0]) && resultOK(r[1])) applyUnread({ notifications:r[0].data.unread||0, messages:r[1].data.unread||0 });
      });
    }
  }
  function teardown(){
    epoch++; notificationSeq++; session='';
    if(stopUnread){ stopUnread(); stopUnread=null; }
    var s=social(); if(s && s.realtime && s.realtime.stop) s.realtime.stop();
    var w=document.getElementById('slHdrSocial'); if(w) w.remove();
    if(drawer) drawer.remove(); if(backdrop) backdrop.remove(); drawer=null; backdrop=null; els={}; priorFocus=null;
    if(loginTrigger && loginTrigger.element.isConnected) loginTrigger.element.style.display=loginTrigger.display;
    loginTrigger=null;
  }

  function start(){
    var tries=0;
    (function w(){
      if(social()){ boot(); return; }
      if(tries++<40) setTimeout(w,100);
    })();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
  ['sl-auth-change','sl-auth-changed','sl-auth-ready'].forEach(function(type){
    window.addEventListener(type, start); document.addEventListener(type, start);
  });
})();
