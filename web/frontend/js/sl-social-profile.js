/* SceneLink social profile: persisted profiles, explicit friendship consent and earned activity only. */
(function () {
  'use strict';
  const host = document.getElementById('slSocialProfile');
  if (!host) return;
  const C = () => window.SLConnected;
  const E = value => C().esc(value);
  const $ = id => document.getElementById(id);
  const providers = {instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok',x:'X',youtube:'YouTube',linkedin:'LinkedIn',snapchat:'Snapchat'};
  const state = {epoch:0,session:null,user:null,own:false,public:null,busy:new Set(),search:0,query:'',searchItems:[],searchMore:false,friendSerial:0,friendItems:[],friendMore:false,friendsLoaded:false};
  const who = () => { const p = new URLSearchParams(location.search); return p.get('u') || p.get('user') || p.get('username'); };
  const valid = (epoch, session) => epoch === state.epoch && session === C().token();
  const name = u => u.display_name || u.username || 'SceneLink member';
  function status(id, text, kind) { const el = $(id); if (el) { el.textContent = text; el.dataset.kind = kind || ''; } }
  function errorText(e) { return e.status === 401 ? 'Your session changed or expired. Sign in again to continue.' : e.code === 'STALE_PROFILE' ? 'This profile changed in another session. Reload the saved profile before applying your draft again.' : e.message || 'This service is unavailable. Please retry.'; }
  function avatar(u, small) {
    const url = C().safeUrl(u.avatar_url, true), cl = 'slsp-avatar' + (small ? ' slsp-person-avatar' : '');
    return url ? '<img class="' + cl + '" src="' + E(url) + '" alt="" referrerpolicy="no-referrer">' : '<span class="' + cl + '" aria-hidden="true">' + E(name(u).trim().slice(0,1).toUpperCase()) + '</span>';
  }
  function action(kind, label, id, fid, extra) { return '<button type="button" data-action="' + E(kind) + '"' + (id ? ' data-id="' + E(id) + '"' : '') + (fid ? ' data-fid="' + E(fid) + '"' : '') + (extra || '') + '>' + E(label) + '</button>'; }
  function profileLink(u) { return '/profile?u=' + encodeURIComponent(u.id || u.username); }
  function relationshipActions(u, rel, message) {
    let out = '';
    if (rel && rel.status === 'accepted') out += action('remove','Remove friend',u.id, null, ' class="slsp-danger"');
    else if (rel && rel.status === 'pending' && rel.direction === 'incoming') out += action('accept','Accept request',u.id,rel.id) + action('decline','Decline',u.id,rel.id);
    else if (rel && rel.status === 'pending') out += '<span class="slsp-muted slsp-small">Request pending</span>' + action('remove','Cancel request',u.id);
    else out += action('request','Add friend',u.id);
    if (message) out += '<a class="slsp-button" href="/messages?to=' + encodeURIComponent(u.id) + '">Message</a>';
    return out;
  }
  function renderLinks(user) {
    const links = Array.isArray(user.social_links) ? user.social_links.filter(l => providers[l.provider] && C().safeUrl(l.url)) : [];
    return '<section class="slsp-card"><h2>Social links</h2><p class="slsp-muted slsp-small">External profile links added by this member. Not connected accounts or verified ownership.</p>' + (links.length ? '<div class="slsp-pills">' + links.map(l => '<a class="slsp-pill" href="' + E(C().safeUrl(l.url)) + '" target="_blank" rel="noopener noreferrer">' + E(providers[l.provider]) + ' ↗</a>').join('') + '</div>' : '<p class="slsp-empty">No social links shared.</p>') + '</section>';
  }
  function renderHero() {
    const u = state.user, p = state.public || {}, own = state.own;
    return '<section class="slsp-card slsp-hero">' + avatar(u) + '<div class="slsp-grow"><p class="slsp-kicker">' + (own ? 'Your SceneLink' : 'SceneLink member') + '</p><h1>' + E(name(u)) + '</h1><p class="slsp-muted">' + E(u.username ? '@' + u.username : 'Username not set') + '</p>' + ((own || p.can_view === true) && u.bio ? '<p class="slsp-bio">' + E(u.bio) + '</p>' : '') + ((own || p.can_view === true) && (u.neighborhood || u.city) ? '<p class="slsp-muted slsp-small">' + E([u.neighborhood,u.city].filter(Boolean).join(' · ')) + '</p>' : '') + '<div class="slsp-row">' + (own ? action('edit','Edit profile',null,null,' class="slsp-primary"') + '<a class="slsp-button" href="/messages">Open messages</a>' : C().token() ? relationshipActions(u,p.friendship_status,p.can_message === true) + action('block','Block',u.id) + action('report','Report',u.id) : '<button type="button" class="sl-auth-trigger slsp-primary">Sign in to connect</button>') + '</div>' + (!own && C().token() && p.can_message !== true ? '<p class="slsp-muted slsp-small slsp-actions">Messaging is unavailable under the current privacy settings.</p>' : '') + '</div></section>';
  }
  function editForm() {
    const u = state.user, links = Object.fromEntries((u.social_links || []).map(l => [l.provider,l.url]));
    return '<section class="slsp-card" id="slspEdit" hidden><div class="slsp-row slsp-end"><h2>Edit your profile</h2>' + action('cancel-edit','Cancel') + '</div><form id="slspEditForm" data-revision="' + E(u.profile_revision) + '"><div class="slsp-form-grid"><label>Display name<input name="display_name" maxlength="80" required value="' + E(u.display_name || '') + '"></label><label>Username<input name="username" minlength="3" maxlength="24" pattern="[a-z0-9_]{3,24}" required autocapitalize="none" value="' + E(u.username || '') + '"><small>3–24 lowercase letters, numbers or underscores.</small></label><label class="slsp-full">Bio<textarea name="bio" maxlength="500" rows="3">' + E(u.bio || '') + '</textarea></label><label>Neighborhood<input name="neighborhood" maxlength="80" value="' + E(u.neighborhood || '') + '"></label><label>City<input name="city" maxlength="80" value="' + E(u.city || '') + '"></label><div class="slsp-full"><h3>Profile photo</h3><div id="slspAvatarCapability"><p class="slsp-muted slsp-small">Checking upload availability…</p></div>' + (u.avatar_url ? '<label><input type="checkbox" name="remove_avatar">Remove my current photo when saving</label>' : '') + '</div></div><h3>Link your social profiles</h3><p class="slsp-notice">These are external profile links, not OAuth connections or verified accounts. Never enter passwords. Clear a URL to remove a link.</p><div class="slsp-form-grid">' + Object.entries(providers).map(([key,label]) => '<label>' + E(label) + ' URL<input name="social_' + key + '" type="url" maxlength="400" placeholder="https://…" value="' + E(links[key] || '') + '"></label>').join('') + '</div><p id="slspEditStatus" class="slsp-status" role="status"></p><div class="slsp-row"><button class="slsp-primary" type="submit">Save changes</button>' + action('reload-edit','Reload saved profile') + '</div></form></section>';
  }
  function setting(name, title, description, checked) { return '<label class="slsp-checkbox"><input type="checkbox" name="' + name + '"' + (checked ? ' checked' : '') + '>' + title + '<span>' + description + '</span></label>'; }
  function settingsPanel() {
    const u = state.user;
    return '<section class="slsp-card"><h2>Privacy & messaging</h2><p class="slsp-muted">You control how other members find and contact you.</p><form id="slspSettingsForm" data-revision="' + E(u.profile_revision) + '">' + setting('is_private','Private profile','Only accepted friends can see your shared profile details and activity.',u.is_private === true) + setting('discoverable','Appear in people search','Private profiles require an exact @username search by non-friends. Turning search off hides you from non-friends.',u.discoverable !== false) + '<label>Who can message you?<select name="allow_messages"><option value="friends"' + (u.allow_messages === 'friends' ? ' selected' : '') + '>Accepted friends</option><option value="everyone"' + (u.allow_messages === 'everyone' ? ' selected' : '') + '>Everyone</option><option value="none"' + (u.allow_messages === 'none' ? ' selected' : '') + '>No one</option></select><small>The server checks these permissions for new and existing conversations.</small></label>' + setting('show_achievements','Share earned achievements','Show earned badges to people who can view your profile. Private activity counters are never shared.',u.show_achievements === true) + setting('share_read_receipts','Share read receipts','Let conversation partners see messages you have actually opened. This does not share presence or typing status.',u.share_read_receipts === true) + '<p id="slspSettingsStatus" class="slsp-status" role="status"></p><div class="slsp-row"><button type="submit" class="slsp-primary">Save privacy settings</button>' + action('reload-settings','Reload saved settings') + '</div></form></section><section class="slsp-card"><h2>Blocked people</h2><p class="slsp-muted slsp-small">Unblocking does not restore an old friendship.</p><div id="slspBlocked"><p class="slsp-status">Not loaded yet.</p></div>' + action('blocked','Refresh blocked list') + '</section>';
  }
  function render() {
    state.search++;state.friendSerial++;state.query='';state.searchItems=[];state.searchMore=false;state.friendItems=[];state.friendMore=false;state.friendsLoaded=false;
    const u = state.user, own = state.own, p = state.public || {};
    host.innerHTML = renderHero() + '<p id="slspActionStatus" class="slsp-status" role="status"></p>' + (own ? editForm() + '<div class="slsp-tabs" role="tablist" aria-label="Your profile sections"><button type="button" id="slspTabProfile" role="tab" data-tab="profile" aria-controls="slspPanelProfile">Overview</button><button type="button" id="slspTabFriends" role="tab" data-tab="friends" aria-controls="slspPanelFriends">Friends & search</button><button type="button" id="slspTabSettings" role="tab" data-tab="settings" aria-controls="slspPanelSettings">Privacy & settings</button></div><section id="slspPanelProfile" role="tabpanel" aria-labelledby="slspTabProfile"><div class="slsp-grid"><section class="slsp-card"><div class="slsp-row slsp-end"><h2>Earned on SceneLink</h2>' + action('achievements','Refresh') + '</div><p class="slsp-muted slsp-small">From your saved venues, accepted friendships, shared posts and collaborative plans. Current milestones can change if activity is removed. Not proof of a real-world visit.</p><div id="slspAchievements"><p class="slsp-status">Loading recorded activity…</p></div></section><div>' + renderLinks(u) + '<section class="slsp-card"><h2>Your plans & discoveries</h2><p class="slsp-muted">Keep the next night out close.</p><div class="slsp-row"><a class="slsp-button" href="/my-lists">Saved lists</a><a class="slsp-button" href="/plan-with-friends">Plan with friends</a><a class="slsp-button" href="/social-feed">Social feed</a></div></section></div></div></section><section id="slspPanelFriends" role="tabpanel" aria-labelledby="slspTabFriends" hidden><section class="slsp-card"><h2>Find your people</h2><p class="slsp-muted">Search SceneLink usernames or names. Requests only become friendships when accepted.</p><form id="slspSearchForm" class="slsp-search"><label>Find a member<input id="slspSearchInput" name="q" type="search" minlength="2" maxlength="80" placeholder="Name or @username" autocomplete="off" required></label><button type="submit" class="slsp-primary">Search</button></form><div id="slspSearchResults" aria-live="polite"><p class="slsp-muted slsp-small">Use an exact @username to look for a private profile. Search visibility settings apply.</p></div></section><div class="slsp-grid"><section class="slsp-card"><div class="slsp-row slsp-end"><h2>Friend requests</h2>' + action('friends','Refresh') + '</div><div id="slspRequests"><p class="slsp-status">Loading requests…</p></div></section><section class="slsp-card"><h2>Your friends</h2><div id="slspFriends"><p class="slsp-status">Loading friends…</p></div></section></div></section><section id="slspPanelSettings" role="tabpanel" aria-labelledby="slspTabSettings" hidden>' + settingsPanel() + '</section>' : p.can_view !== true ? '<section class="slsp-card"><h2>This profile is private</h2><p class="slsp-muted">Connect as friends to see the details this member shares.</p></section>' : '<div class="slsp-grid">' + renderLinks(u) + '<section class="slsp-card"><h2>Earned achievements</h2><div id="slspPublicAchievements"></div></section></div>') + (!own ? '<section class="slsp-card" id="slspReport" hidden><h2>Report this member</h2><p class="slsp-muted slsp-small">A report sends information to SceneLink moderation. It does not automatically block a member or guarantee a moderation outcome.</p><form id="slspReportForm"><label>Reason<select name="reason"><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="hate_speech">Hate speech</option><option value="impersonation">Impersonation</option><option value="violence">Violence</option><option value="sexual_content">Sexual content</option><option value="self_harm">Self-harm concern</option><option value="other">Other</option></select></label><label>Additional details<textarea name="details" maxlength="1000" rows="3"></textarea></label><p id="slspReportStatus" class="slsp-status" role="status"></p><div class="slsp-row"><button type="submit">Submit report</button>' + action('cancel-report','Cancel') + '</div></form></section>' : '');
    if (own) { selectTab(location.hash.slice(1),false); loadAchievements(); }
    else if ($('slspPublicAchievements')) renderAchievements(p.achievements,$('slspPublicAchievements'),false);
  }
  function renderAchievements(data, target, own) {
    if (!data || data.source !== 'persisted_scenelink_activity') { target.innerHTML = '<p class="slsp-muted">' + (own ? 'Recorded achievements are unavailable.' : 'No achievements are shared with you.') + '</p>'; return; }
    const badges = (Array.isArray(data.badges) ? data.badges : []).filter(b => own || b.earned === true);
    let counts = '';
    if (own && data.source === 'persisted_scenelink_activity' && data.counts) counts = '<div class="slsp-count-grid">' + [['saved_venues','Saved venues'],['friends','Accepted friends'],['shared_posts','Shared posts'],['collaborative_plans','Collaborative plans']].map(([key,label]) => '<div class="slsp-count"><strong>' + E(data.counts[key] != null && data.counts[key] !== '' && Number.isFinite(Number(data.counts[key])) ? Math.max(0,Number(data.counts[key])) : '—') + '</strong>' + label + '</div>').join('') + '</div>';
    target.innerHTML = counts + (badges.length ? '<div class="slsp-badge-grid">' + badges.map(b => { const threshold = Math.max(1,Number(b.threshold)||1), progress = Math.max(0,Number(b.progress)||0); return '<article class="slsp-badge" data-earned="' + (b.earned === true) + '"><span class="slsp-earned">' + (b.earned === true ? 'Earned' : 'In progress') + '</span><h3>' + E(b.title) + '</h3><p>' + E(b.description) + '</p>' + (own ? '<progress value="' + Math.min(threshold,progress) + '" max="' + threshold + '" aria-label="' + E(b.title) + '"></progress><p>' + E(progress) + ' / ' + E(threshold) + '</p>' : '') + '</article>'; }).join('') + '</div>' : '<p class="slsp-empty">No earned achievements yet.</p>');
  }
  async function loadAchievements() {
    const epoch = state.epoch, session = C().token(), target = $('slspAchievements'); if (!target) return;
    try { const d = await C().request('/users/me/achievements'); if (valid(epoch,session) && target.isConnected) renderAchievements(d,target,true); }
    catch (e) { if (valid(epoch,session) && target.isConnected) target.innerHTML = '<p class="slsp-status" data-kind="error">' + E(errorText(e)) + '</p>' + action('achievements','Retry achievements'); }
  }
  function selectTab(tab, history) {
    if (!state.own) return;
    if(tab==='privacy')tab='settings';
    tab = ['profile','friends','settings'].includes(tab) ? tab : 'profile';
    host.querySelectorAll('[data-tab]').forEach(b => { const active = b.dataset.tab === tab; b.setAttribute('aria-selected',String(active)); b.tabIndex = active ? 0 : -1; });
    ['profile','friends','settings'].forEach(t => { const el = $('slspPanel' + t[0].toUpperCase() + t.slice(1)); if (el) el.hidden = t !== tab; });
    if (history) window.history.pushState(null,'',location.pathname + location.search + '#' + tab);
    if (tab === 'friends' && !state.friendsLoaded) loadFriends();
    if (tab === 'settings') loadBlocked();
  }
  function person(u, actions) { return '<li class="slsp-person">' + avatar(u,true) + '<div class="slsp-grow"><a href="' + E(profileLink(u)) + '"><strong>' + E(name(u)) + '</strong></a><p class="slsp-muted slsp-small">' + E(u.username ? '@' + u.username : '') + '</p></div><div class="slsp-row">' + actions + '</div></li>'; }
  function renderFriendList(error, more) {
    const target=$('slspFriends');if(!target)return;
    target.innerHTML=(state.friendItems.length?'<ul class="slsp-list">'+state.friendItems.map(u=>person(u,relationshipActions(u,{status:'accepted'},true))).join('')+'</ul>':'<p class="slsp-empty">'+(error?'Friends could not be loaded.':'No accepted friends yet. Search above to send a request.')+'</p>')+(error?'<p class="slsp-status" data-kind="error">'+E(errorText(error))+'</p>'+action(more?'friends-more':'friends','Retry friends'):state.friendMore?action('friends-more','Load more friends'):'');
  }
  async function loadFriends(more) {
    if(!state.own)return;const epoch=state.epoch,session=C().token(),serial=++state.friendSerial,offset=more?state.friendItems.length:0;
    if(!more){state.friendItems=[];state.friendMore=false;}
    const results=await Promise.allSettled([C().request('/friends?limit=50&offset='+offset),C().request('/friends/pending')]);
    if(!valid(epoch,session)||serial!==state.friendSerial||!$('slspFriends'))return;
    state.friendsLoaded=results.every(r=>r.status==='fulfilled');const f=results[0],p=results[1];
    if(f.status==='fulfilled'){state.friendItems=[...new Map([...state.friendItems,...(f.value.friends||[])].map(u=>[u.id,u])).values()];state.friendMore=f.value.has_more===true;renderFriendList();}else renderFriendList(f.reason,more);
    $('slspRequests').innerHTML=p.status==='fulfilled'?['incoming','outgoing'].map(direction=>'<h3>'+(direction==='incoming'?'Incoming':'Sent')+'</h3>'+((p.value[direction]||[]).length?'<ul class="slsp-list">'+p.value[direction].map(raw=>{const u=Object.assign({},raw,{id:raw.other_user_id});return person(u,relationshipActions(u,{id:raw.friendship_id,status:'pending',direction},false));}).join('')+'</ul>':'<p class="slsp-muted slsp-small">No '+direction+' requests.</p>')).join('<hr class="slsp-divider">')+((p.value.incoming||[]).length+(p.value.outgoing||[]).length>=500?'<p class="slsp-muted slsp-small">Showing up to 500 recent pending requests.</p>':''):'<p class="slsp-status" data-kind="error">'+E(errorText(p.reason))+'</p>'+action('friends','Retry requests');
  }
  function renderSearch(error, more) {
    const target=$('slspSearchResults');if(!target)return;
    target.innerHTML=(state.searchItems.length?'<ul class="slsp-list">'+state.searchItems.map(u=>person(u,relationshipActions(u,u.friendship_status,u.friendship_status&&u.friendship_status.status==='accepted'))).join('')+'</ul>':error?'':'<p class="slsp-empty">No visible matches. Try an exact @username; some members have chosen not to appear in search.</p>')+(error?'<p class="slsp-status" data-kind="error">'+E(errorText(error))+'</p>'+action(more?'search-more':'search','Retry search'):state.searchMore?action('search-more','Load more people'):'');
  }
  async function search(more) {
    const input=$('slspSearchInput'),target=$('slspSearchResults');if(!input||!target)return;
    const q=input.value.trim(),serial=++state.search,epoch=state.epoch,session=C().token();
    if(q.length<2){target.innerHTML='<p class="slsp-muted">Enter at least two characters.</p>';return;}
    if(!more||state.query!==q){state.searchItems=[];state.searchMore=false;more=false;}
    state.query=q;const offset=more?state.searchItems.length:0;
    if(!more)target.innerHTML='<p class="slsp-status">Searching members…</p>';
    else {const button=target.querySelector('[data-action=search-more]');if(button)button.disabled=true;}
    try{const d=await C().request('/users/search?q='+encodeURIComponent(q)+'&limit=20&offset='+offset);if(!valid(epoch,session)||serial!==state.search||input.value.trim()!==q)return;
      state.searchItems=[...new Map([...state.searchItems,...(Array.isArray(d.results)?d.results:[])].map(u=>[u.id,u])).values()];state.searchMore=d.has_more===true;renderSearch();
    }catch(e){if(valid(epoch,session)&&serial===state.search)renderSearch(e,more);}
  }
  async function loadBlocked() {
    const target = $('slspBlocked'); if (!target || state.busy.has('blocked')) return; state.busy.add('blocked');
    const epoch = state.epoch, session = C().token();
    try { const d = await C().request('/users/blocked'); if (!valid(epoch,session) || !target.isConnected) return; target.innerHTML = (d.blocked || []).length ? '<ul class="slsp-list">' + d.blocked.map(u => person(u,action('unblock','Unblock',u.id))).join('') + '</ul>' : '<p class="slsp-empty">No blocked people.</p>'; }
    catch(e) { if (valid(epoch,session) && target.isConnected) target.innerHTML = '<p class="slsp-status" data-kind="error">' + E(errorText(e)) + '</p>'; }
    finally {state.busy.delete('blocked');}
  }
  async function loadAvatarCapability() {
    const target=$('slspAvatarCapability'),epoch=state.epoch,session=C().token(); if(!target)return;
    try { const d=await C().request('/media/capability'); if(!valid(epoch,session)||!target.isConnected)return;
      if(d.enabled===true && d.contract==='server-upload-v1'){state.media=d;target.innerHTML='<label>Choose a photo<input id="slspAvatarFile" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPEG or WebP, up to 4 MB. Upload saves the photo immediately, separately from your profile draft.</small></label>'+action('upload-avatar','Upload photo')+'<p id="slspAvatarStatus" class="slsp-status" role="status"></p>';}
      else target.innerHTML='<p class="slsp-muted slsp-small">Photo uploads are not connected. No photo will be uploaded. Existing photos can be removed when saving.</p>';
    }catch(e){if(valid(epoch,session)&&target.isConnected)target.innerHTML='<p class="slsp-muted slsp-small">Photo upload availability could not be checked. You can still edit the rest of your profile.</p>';}
  }
  async function uploadAvatar(button) {
    if(state.busy.has('avatar')||state.busy.has('profile-mutation'))return;const input=$('slspAvatarFile'),file=input&&input.files[0];
    if(!file){status('slspAvatarStatus','Choose an image first.','error');return;}
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>Math.min(state.media.max_bytes||4194304,4194304)){status('slspAvatarStatus','Use a PNG, JPEG or WebP image up to 4 MB.','error');return;}
    const epoch=state.epoch,session=C().token(),beforeRevision=state.user.profile_revision;state.busy.add('avatar');state.busy.add('profile-mutation');button.disabled=true;status('slspAvatarStatus','Uploading photo…');
    try {const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(file);});
      if(!valid(epoch,session))return;const result=await C().request('/media/upload',{method:'POST',body:{kind:'avatar',data}});if(!valid(epoch,session))return;
      if(result.pending_review){status('slspAvatarStatus','The provider is reviewing this photo. It has not been attached to your profile.');return;}
      if(!result.asset)throw new Error('Upload did not return a saved photo. Reload your profile before retrying.');
      const read=await C().request('/users/me');if(!valid(epoch,session))return;if(!read.user||read.user.id!==state.user.id)throw new Error('The photo could not be read back from your account.');state.user=read.user;const onlyUpload=read.user.profile_revision===beforeRevision+1;if(onlyUpload)host.querySelectorAll('#slspEditForm,#slspSettingsForm').forEach(f=>{if(Number(f.dataset.revision)===beforeRevision)f.dataset.revision=read.user.profile_revision;});status('slspAvatarStatus',onlyUpload?'Photo saved and read back. Other profile edits are still unsaved.':'Photo saved and read back. Your account also changed elsewhere. Reload saved profile before applying other edits; your draft is unchanged.','success');const hero=host.querySelector('.slsp-hero');if(hero)hero.outerHTML=renderHero();
    }catch(e){if(valid(epoch,session))status('slspAvatarStatus',errorText(e)+' Check the saved profile before retrying an upload.','error');}
    finally{state.busy.delete('avatar');state.busy.delete('profile-mutation');if(button.isConnected)button.disabled=false;}
  }
  function hasUnsavedDraft(form) {
    return form && [...form.elements].some(el => {
      if (!el.name && el.type !== 'file') return false;
      if (el.type === 'file') return el.files && el.files.length > 0;
      if (el.type === 'checkbox' || el.type === 'radio') return el.checked !== el.defaultChecked;
      if (el.tagName === 'SELECT') return el.value !== ([...el.options].find(o => o.defaultSelected) || el.options[0]).value;
      return typeof el.defaultValue === 'string' && el.value !== el.defaultValue;
    });
  }
  function keepOtherDraft(settings, savedUser) {
    const form = $(settings ? 'slspEditForm' : 'slspSettingsForm');
    if (!hasUnsavedDraft(form)) return null;
    const fields = settings ? ['display_name','username','bio','neighborhood','city','avatar_url','social_links'] : ['is_private','discoverable','allow_messages','show_achievements','share_read_receipts'];
    const sameBase = fields.every(key => JSON.stringify(state.user[key] ?? null) === JSON.stringify(savedUser[key] ?? null));
    const safeRevision = sameBase && Number(form.dataset.revision) === state.user.profile_revision;
    // Keep the actual node, including a selected but not yet uploaded photo.
    // Never rebase a stale/conflicted draft over changed saved values.
    if (safeRevision) form.dataset.revision = savedUser.profile_revision;
    return {node:settings ? $('slspEdit') : form, settings:!settings, safeRevision};
  }
  function restoreOtherDraft(draft) {
    if (!draft) return;
    const replacement = $(draft.node.id);
    if (!replacement) return;
    replacement.replaceWith(draft.node);
    const sid = draft.settings ? 'slspSettingsStatus' : 'slspEditStatus';
    status(sid, draft.safeRevision ? 'Your draft is still unsaved.' : 'Your draft is still unsaved. Reload the saved profile before applying it because its revision is out of date.', draft.safeRevision ? '' : 'error');
  }
  async function saveProfile(form, settings) {
    const key = settings ? 'settings-save' : 'profile-save', sid = settings ? 'slspSettingsStatus' : 'slspEditStatus'; if (state.busy.has(key)||state.busy.has('profile-mutation')) return;
    const epoch = state.epoch, session = C().token(), payload = {revision:Number(form.dataset.revision)}, data = new FormData(form);
    if (settings) { ['is_private','discoverable','show_achievements','share_read_receipts'].forEach(k => payload[k] = data.has(k)); payload.allow_messages = data.get('allow_messages'); }
    else { ['display_name','username','bio','neighborhood','city'].forEach(k => payload[k] = String(data.get(k)||'').trim()); if(data.has('remove_avatar'))payload.avatar_url=null; payload.social_links = Object.keys(providers).map(provider => ({provider,url:String(data.get('social_' + provider)||'').trim()})).filter(l => l.url); }
    state.busy.add(key); state.busy.add('profile-mutation'); form.querySelectorAll('button').forEach(b => b.disabled=true); status(sid,'Saving…'); let saved = false;
    try {
      const result = await C().request(settings ? '/users/me/settings' : '/auth/profile',{method:settings ? 'PATCH' : 'PUT',body:payload}); saved = true;
      if (!valid(epoch,session)) return;
      if (!result.user || result.user.id !== state.user.id) throw new Error('The server did not return the saved profile. Reload to verify.');
      const read = await C().request('/users/me'); if (!valid(epoch,session)) return;
      if (!read.user || read.user.id !== state.user.id) throw new Error('The saved profile could not be read back. Reload to verify.');
      const draft = keepOtherDraft(settings,read.user);
      state.user = read.user; state.friendsLoaded = false; render(); restoreOtherDraft(draft); if (settings) selectTab('settings',false);
      status('slspActionStatus',settings ? 'Privacy settings saved and read back from your account.' : 'Profile saved and read back from your account.','success');
    } catch (e) { if (valid(epoch,session)) status(sid,saved ? 'The save was accepted, but readback failed. Reload the saved profile to verify before making another change.' : errorText(e),'error'); }
    finally {state.busy.delete(key); state.busy.delete('profile-mutation'); if(form.isConnected)form.querySelectorAll('button').forEach(b => b.disabled=false);}
  }
  async function friendAction(btn) {
    const kind = btn.dataset.action, id = btn.dataset.id, fid = btn.dataset.fid, key = 'person:' + id;
    if (!C().token()) { if(window.SLAuthUI)window.SLAuthUI.open('login'); return; }
    if (state.busy.has(key)) return;
    if (['remove','block','unblock'].includes(kind) && !window.confirm(kind === 'block' ? 'Block this member? This ends any friendship and prevents contact.' : kind === 'unblock' ? 'Unblock this member? This will not restore the friendship.' : 'Remove this friendship or cancel the pending request?')) return;
    const routes = {request:['POST','/friends/request',{user_id:id}],accept:['POST','/friends/accept',{friendship_id:fid}],decline:['POST','/friends/decline',{friendship_id:fid}],remove:['DELETE','/friends/'+encodeURIComponent(id)],block:['POST','/users/'+encodeURIComponent(id)+'/block'],unblock:['DELETE','/users/'+encodeURIComponent(id)+'/block']};
    const route = routes[kind]; if (!route) return;
    const epoch = state.epoch, session = C().token(); state.busy.add(key); btn.disabled=true; status('slspActionStatus','Saving your choice…');
    try { await C().request(route[1],{method:route[0],body:route[2]}); if (!valid(epoch,session))return;
      if (kind === 'block' && !state.own) { host.innerHTML = '<section class="slsp-card"><h1>Member blocked</h1><p>They can no longer contact you. You can manage blocked people in privacy settings.</p><a class="slsp-button" href="/profile#settings">Back to your profile</a></section>'; return; }
      if (state.own) { await loadFriends(); if(state.query)await search(); if(kind==='unblock')await loadBlocked(); loadAchievements(); }
      else { const d = await C().request('/users/'+encodeURIComponent(who())); if (!valid(epoch,session))return; state.public=d;state.user=d.user;render(); }
      if(valid(epoch,session))status('slspActionStatus',kind === 'request' ? 'Friend request saved. It is pending until the other person accepts.' : kind === 'accept' ? 'Friend request accepted.' : kind === 'decline' ? 'Request declined.' : kind === 'unblock' ? 'Member unblocked. No friendship was restored.' : 'Friendship or request removed.','success');
    } catch (e) { if(valid(epoch,session))status('slspActionStatus',errorText(e),'error'); }
    finally {state.busy.delete(key); if(btn.isConnected)btn.disabled=false;}
  }
  async function report(form) {
    if(state.busy.has('report'))return; const epoch=state.epoch,session=C().token(),data=new FormData(form),button=form.querySelector('button[type=submit]');state.busy.add('report');button.disabled=true;
    try { await C().request('/reports',{method:'POST',body:{target_type:'user',target_id:state.user.id,reason:data.get('reason'),details:data.get('details')}});if(valid(epoch,session))status('slspReportStatus','Report received by the service. No moderation outcome has been decided.','success'); }
    catch(e){if(valid(epoch,session))status('slspReportStatus',errorText(e),'error');}
    finally{state.busy.delete('report');if(button.isConnected)button.disabled=false;}
  }
  async function boot(force) {
    if (!C()) { host.innerHTML='<p class="slsp-status" data-kind="error">The profile service could not initialize. Reload this page.</p>';return; }
    const session=C().token(),identifier=who();if(!force&&state.session===session)return;
    state.session=session;state.epoch++;state.user=null;state.public=null;state.search++;state.query='';state.searchItems=[];state.searchMore=false;state.friendSerial++;state.friendItems=[];state.friendMore=false;state.friendsLoaded=false;state.busy.clear();
    const epoch=state.epoch;
    if(!session&&!identifier){host.innerHTML='<section class="slsp-card"><p class="slsp-kicker">Your people. Your plans.</p><h1>Your SceneLink profile</h1><p class="slsp-muted">Sign in to edit your profile, find friends and manage your privacy.</p><div class="slsp-row"><button type="button" class="sl-auth-trigger slsp-primary">Sign in / Create account</button><a class="slsp-button" href="/">Back to exploring</a></div></section>';return;}
    host.innerHTML='<p class="slsp-status" role="status">Loading profile…</p>';
    try { let d=await C().request(identifier?'/users/'+encodeURIComponent(identifier):'/users/me');if(!valid(epoch,session))return;state.own=!identifier||d.is_me===true;if(state.own&&identifier){d=await C().request('/users/me');if(!valid(epoch,session))return;}
      if(!d.user)throw new Error('Profile unavailable.');state.user=d.user;state.public=d;render();
    } catch(e){if(valid(epoch,session))host.innerHTML='<section class="slsp-card"><h1>Profile unavailable</h1><p class="slsp-status" data-kind="error">'+E(errorText(e))+'</p><div class="slsp-row">'+action('reload','Retry')+'<a class="slsp-button" href="/profile">Your profile</a></div></section>';}
  }
  host.addEventListener('click',async event=>{
    const btn=event.target.closest('button');if(!btn||!host.contains(btn))return;
    if(btn.dataset.tab){selectTab(btn.dataset.tab,true);return;}
    const kind=btn.dataset.action;
    if(['request','accept','decline','remove','block','unblock'].includes(kind)){friendAction(btn);return;}
    if(kind==='edit'){const el=$('slspEdit');el.hidden=false;el.querySelector('input').focus();loadAvatarCapability();}
    else if(kind==='cancel-edit'){$('slspEdit').hidden=true;const b=host.querySelector('[data-action=edit]');if(b)b.focus();}
    else if(kind==='reload-edit'||kind==='reload-settings'){if(window.confirm('Discard any unsaved draft and reload your saved profile?')){await boot(true);if(kind==='reload-settings')selectTab('settings',false);}}
    else if(kind==='upload-avatar')uploadAvatar(btn);
    else if(kind==='reload')boot(true);
    else if(kind==='achievements')loadAchievements();
    else if(kind==='friends')loadFriends();
    else if(kind==='friends-more')loadFriends(true);
    else if(kind==='search')search();
    else if(kind==='search-more')search(true);
    else if(kind==='blocked')loadBlocked();
    else if(kind==='report'){$('slspReport').hidden=false;$('slspReport').querySelector('select').focus();}
    else if(kind==='cancel-report'){$('slspReport').hidden=true;host.querySelector('[data-action=report]').focus();}
  });
  host.addEventListener('submit',event=>{const form=event.target;if(!['slspEditForm','slspSettingsForm','slspSearchForm','slspReportForm'].includes(form.id))return;event.preventDefault();if(form.id==='slspSearchForm')search();else if(form.id==='slspReportForm')report(form);else saveProfile(form,form.id==='slspSettingsForm');});
  host.addEventListener('input',event=>{if(event.target.id==='slspSearchInput'){state.search++;state.query='';const target=$('slspSearchResults');if(target)target.innerHTML='<p class="slsp-muted slsp-small">Press Search to find members.</p>';}});
  host.addEventListener('keydown',event=>{if(event.target.matches('[role=tab]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const tabs=[...host.querySelectorAll('[role=tab]')],i=tabs.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectTab(tabs[next].dataset.tab,true);tabs[next].focus();}if(event.key==='Escape'){const edit=$('slspEdit'),rep=$('slspReport');if(edit&&!edit.hidden){edit.hidden=true;host.querySelector('[data-action=edit]').focus();}else if(rep&&!rep.hidden){rep.hidden=true;host.querySelector('[data-action=report]').focus();}}});
  window.addEventListener('popstate',()=>selectTab(location.hash.slice(1),false));
  window.addEventListener('hashchange',()=>selectTab(location.hash.slice(1),false));
  ['sl-auth-change','sl-auth-changed'].forEach(type=>{window.addEventListener(type,()=>boot(false));document.addEventListener(type,()=>boot(false));});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot(false),{once:true});else boot(false);
})();
