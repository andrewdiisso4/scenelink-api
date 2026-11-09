/* Persisted private planning, not local-storage plans or reservations. */
(function () {
  'use strict';
  const host = document.getElementById('slConnectedPlans'); if (!host) return;
  const C = window.SLConnected, E = C.esc, enc = encodeURIComponent;
  let generation=0, searchGeneration=0, selected=null, detail=null, friends=[], rooms=[], pendingId=null, pendingBody=null, notice='', loadMore=false, busy=false;
  const drafts=new Map();let createDraft={name:'',description:'',date:''},friendsMore=false,friendsOffset=0,friendsBusy=false;
  let managed=null, operationSerial=0, accountSession=C.token();
  const params=new URL(location.href).searchParams, initialVenue=params.get('venue_id');
  let requestedRoom=params.get('room_id');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedRoom||''))requestedRoom=null;else requestedRoom=requestedRoom.toLowerCase();
  function auth() { if(C.token())return true; if(window.SLAuthUI)window.SLAuthUI.open('login'); return false; }
  const button=(act,text,attrs,secondary)=>'<button type="button" data-act="'+act+'" '+(attrs||'')+' class="'+(secondary?'sl-secondary':'')+'">'+E(text)+'</button>';
  function skeleton() {
    host.innerHTML='<h1>Plan with friends</h1><p class="sl-muted">Private plans, real invitations and shared venue votes.</p><div class="sl-notice">A group decision or SceneLink RSVP is <strong>not a reservation</strong>. In-site reservations are not connected yet. Choosing a venue does not submit a booking request.</div><p id="slPlanStatus" role="status" tabindex="-1"></p><div id="slPlanContent"></div>';
  }
  function status(text) { notice=text||''; const el=document.getElementById('slPlanStatus');if(el)el.textContent=notice; }
  function memberLabel(member) {return E(member.display_name||member.username||'Member')+' <span class="sl-label">'+E(member.status==='accepted'?'Joined':member.status==='pending'?'Invited — awaiting response':member.status)+'</span>';}
  const dateValue=r=>typeof r.event_date==='string'?r.event_date.slice(0,10):'';
  function validOwnerDetails(r,id) {
    if(!r||r.id!==id||r.is_owner!==true||!Number.isInteger(r.revision)||r.revision<1||typeof r.name!=='string'||!r.name.trim()||r.name.length>100||typeof r.description!=='string'||r.description.length>1000||!['planning','confirmed','cancelled'].includes(r.state)||!Array.isArray(r.members)||!Array.isArray(r.options))return false;
    if(r.event_date===null)return true;
    if(typeof r.event_date!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z)?$/.test(r.event_date))return false;
    const day=dateValue(r),date=new Date(day+'T12:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day&&Number(day.slice(0,4))>=2020&&Number(day.slice(0,4))<=2100;
  }
  const currentAccount=session=>session===C.token();
  const currentView=(seq,session)=>seq===generation&&currentAccount(session);
  const draftValues=d=>({name:d.name.trim(),description:d.description.trim(),event_date:d.event_date||null});
  function newDraft(r) {
    const d={id:r.id,revision:r.revision,name:r.name||'',description:r.description||'',event_date:dateValue(r),saving:false,needsReview:false,message:''};
    d.original=JSON.stringify(draftValues(d));return d;
  }
  function renderEditor(r) {
    const d=drafts.get(r.id);if(!d||r.is_owner!==true)return '';
    if(d.revision!==r.revision)d.needsReview=true;
    const closed=r.state!=='planning',disabled=d.saving?' disabled':'';
    const conflict=d.needsReview?'<p class="sl-notice">Your draft is kept below. Review the currently saved name, date and notes above before choosing how to continue.</p>':'';
    const review=d.needsReview&&Number.isInteger(r.revision)?button('rebase-edit','Use this version and keep my draft','data-room="'+E(r.id)+'"'+disabled,true):'';
    return '<section class="sl-panel" aria-labelledby="slRoomEditTitle"><h3 id="slRoomEditTitle">Edit plan details</h3>'+conflict+(closed?'<p class="sl-notice">This plan is no longer in planning. Your draft is kept. Reopen planning before saving changes.</p>':'')+'<form id="slEditRoom" data-room="'+E(r.id)+'"><label for="slEditName">Plan name</label><input id="slEditName" name="name" maxlength="100" required value="'+E(d.name)+'"'+disabled+'><label for="slEditDate">Date (optional)</label><input id="slEditDate" name="event_date" type="date" value="'+E(d.event_date)+'"'+disabled+'><label for="slEditDescription">Notes (optional)</label><textarea id="slEditDescription" name="description" maxlength="1000"'+disabled+'>'+E(d.description)+'</textarea><p id="slRoomEditStatus" role="status" tabindex="-1">'+E(d.message)+'</p><div class="sl-row"><button type="submit"'+(d.saving||d.needsReview||closed?' disabled':'')+'>Save plan details</button>'+review+button('reload-edit','Reload saved details','data-room="'+E(r.id)+'"'+disabled,true)+button('cancel-edit','Cancel editing','data-room="'+E(r.id)+'"'+disabled,true)+'</div></form></section>';
  }
  function redrawRoom(id,focus) {
    const box=document.getElementById('slRoomDetail');
    if(!box||selected!==id||!detail||detail.id!==id)return;
    box.innerHTML=renderRoom(detail);
    const el=focus&&box.querySelector(focus);if(el)el.focus();
  }
  async function openManagement(id,seq,session) {
    const data=await C.request('/rooms/'+enc(id)+'/manage-members');
    if(!currentView(seq,session))return;
    if(!Array.isArray(data.members)||!Number.isInteger(data.revision)||data.revision<1||data.members.some(m=>!m||typeof m.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.id)||!['pending','accepted'].includes(m.status)||typeof m.restricted!=='boolean'||typeof m.display_name!=='string'))throw new Error('Owner management response incomplete.');
    managed={id,revision:data.revision,members:data.members};detail=null;
    const head=rooms.find(r=>r.id===id&&r.is_owner===true&&r.revision===data.revision),box=document.getElementById('slRoomDetail');if(!box)return;
    box.innerHTML='<section class="sl-panel"><h2>Manage unavailable plan</h2><p>Regular plan details are currently restricted. You can remove a member or cancel this plan. Restricted member identities, venues and votes stay hidden.</p>'+(head?'<p>Your plan: '+E(head.name)+' · '+E(head.state==='confirmed'?'Venue selected — not booked':head.state)+'</p>':'')+'<h3>Members and invitations</h3><ul>'+data.members.map(m=>'<li>'+E(m.restricted?'Unavailable member':m.display_name||'Member')+' <span class="sl-label">'+E(m.status==='accepted'?'Joined':'Invited')+'</span> '+button('remove-managed-member','Remove from plan','data-room="'+E(id)+'" data-user="'+E(m.id)+'"',true)+'</li>').join('')+'</ul><p class="sl-muted">Removing a member ends their access and removes their votes. It does not unblock the account or restore a friendship.</p><div class="sl-row">'+button('refresh-room','Try opening plan','data-room="'+E(id)+'"',true)+button('refresh-management','Refresh management','data-room="'+E(id)+'"',true)+(head&&head.state==='cancelled'?'<span>Plan cancelled.</span>':button('cancel-managed-room','Cancel plan','data-room="'+E(id)+'"',true))+'</div><p class="sl-muted">Cancelling a SceneLink plan does not cancel a venue reservation or ticket.</p></section>';
  }
  async function reloadDraft(id) {
    const d=drafts.get(id);if(!d||d.saving||busy)return;
    if(JSON.stringify(draftValues(d))!==d.original&&!window.confirm('Replace your unsaved draft with the currently saved plan details?'))return;
    const session=C.token(),op=++operationSerial;let loaded=false;busy=true;d.saving=true;d.message='Loading saved details…';redrawRoom(id);
    try {
      const data=await C.request('/rooms/'+enc(id));
      if(!currentAccount(session)||drafts.get(id)!==d)return;
      if(!validOwnerDetails(data.room,id))throw new Error('Saved plan response incomplete.');
      const replacement=newDraft(data.room);replacement.message='Loaded saved details. Your previous draft was replaced.';drafts.set(id,replacement);
      loaded=true;if(selected===id)detail=data.room;
    } catch(e) {if(currentAccount(session)&&drafts.get(id)===d){d.message='Saved details could not be loaded. Your draft is unchanged.';}}
    finally {if(currentAccount(session)&&op===operationSerial){busy=false;d.saving=false;redrawRoom(id,loaded?'#slEditName':'#slRoomEditStatus');}}
  }
  async function saveDraft(form) {
    const id=form.dataset.room,d=drafts.get(id);if(!d||d.saving||busy||!detail||detail.id!==id||detail.is_owner!==true)return;
    d.name=form.elements.name.value;d.description=form.elements.description.value;d.event_date=form.elements.event_date.value;
    const values=draftValues(d);
    if(!values.name){d.message='Enter a plan name.';redrawRoom(id,'#slEditName');return;}
    if(d.needsReview||detail.state!=='planning'){d.message='Review the saved plan before saving this draft.';redrawRoom(id,'#slRoomEditStatus');return;}
    const session=C.token(),op=++operationSerial;busy=true;d.saving=true;d.message='Saving plan details…';redrawRoom(id);
    let confirmed=false;
    try {
      const saved=await mutate('/rooms/'+enc(id)+'/details','PUT',{...values,revision:d.revision});
      if(!currentAccount(session)||drafts.get(id)!==d)return;
      if(!Number.isInteger(saved.revision)||saved.revision<1)throw new Error('The saved revision was not confirmed.');
      confirmed=true;
      const read=await C.request('/rooms/'+enc(id));
      if(!currentAccount(session)||drafts.get(id)!==d)return;
      const r=read.room;
      if(!validOwnerDetails(r,id)||r.revision<saved.revision)throw new Error('Saved details could not be read back.');
      if(JSON.stringify({name:r.name,description:r.description||'',event_date:dateValue(r)||null})!==JSON.stringify(values)){
        d.needsReview=true;d.message='Your change was saved, but the plan changed again. Your draft is kept. Review the saved details above.';
        if(selected===id){detail=r;redrawRoom(id,'#slRoomEditStatus');}return;
      }
      drafts.delete(id);status('Plan details saved and read back for '+r.name+'.');await load();
      if(selected===id){const edit=host.querySelector('[data-act="edit-room"]');if(edit)edit.focus();}
    } catch(e) {
      if(!currentAccount(session)||drafts.get(id)!==d)return;
      if(confirmed){d.needsReview=true;d.message='The change was confirmed, but saved details could not be read back. Your draft is kept. Reload saved details before saving again.';}
      else if(e.status===409||e.status===428){d.needsReview=true;d.message='This plan changed elsewhere. Your draft is kept. Review the saved details before saving again.';if(selected===id)await openRoom(id);}
      else {d.message=e.status===401?'Your session ended. Sign in again to continue. Your draft has not been sent again.':e.message||'Plan details could not be saved. Your draft is kept.';if(!e.status||e.status===408)d.needsReview=true;}
    } finally {
      if(currentAccount(session)&&op===operationSerial){busy=false;d.saving=false;if(drafts.get(id)===d)redrawRoom(id,'#slRoomEditStatus');}
    }
  }
  function renderRoom(r) {
    const planning=r.state==='planning', owner=r.is_owner, options=r.options||[];
    const accepted=(r.members||[]).filter(m=>m.status==='accepted');
    let html='<section class="sl-panel"><div class="sl-row sl-between"><h2>'+E(r.name)+'</h2>'+button('refresh-room','Refresh','',true)+'</div><p>'+E(r.description||'')+'</p><p>'+E(r.event_date?String(r.event_date).slice(0,10):'Date not chosen')+' · '+E(r.state==='confirmed'?'Venue selected — not booked':r.state)+'</p><p class="sl-muted">Owner: '+E(r.owner_name||'Plan owner')+'. '+accepted.length+' accepted member'+(accepted.length===1?'':'s')+' besides the owner.</p>';
    if(owner&&planning&&validOwnerDetails(r,r.id))html+='<p>'+button('edit-room','Edit plan details','data-room="'+E(r.id)+'"',true)+'</p>';
    html+=renderEditor(r);
    html+='<h3>Members and invitations</h3><ul>'+(r.members||[]).map(m=>'<li>'+memberLabel(m)+(owner&&['accepted','pending'].includes(m.status)?' '+button('remove-member','Remove','data-user="'+E(m.id)+'"',true):'')+'</li>').join('')+'</ul>';
    if(owner&&planning)html+='<form id="slInviteFriend"><label for="slRoomFriend">Invite an accepted friend</label><select id="slRoomFriend" required><option value="">Choose a friend</option>'+friends.filter(f=>!(r.members||[]).some(m=>m.id===f.id&&['accepted','pending'].includes(m.status))).map(f=>'<option value="'+E(f.id)+'">'+E(f.display_name||f.username)+' (@'+E(f.username)+')</option>').join('')+'</select><p class="sl-muted">Invitations stay pending until your friend accepts. No email or external message is sent.</p><button type="submit">Send in-app invitation</button>'+(friendsMore?button('more-friends','Load more friends','',true):'')+'</form>';
    html+='<h3>Venue options</h3>'+(!options.length?'<p>No venues shortlisted yet. Search to add a real venue.</p>':'');
    html+=options.map(o=>'<article class="sl-item"><div class="sl-row sl-between"><h3>'+E(o.name)+'</h3>'+button('venue-detail','Details','data-venue="'+E(o.venue_id)+'"',true)+'</div><p class="sl-muted">'+E([o.type,o.neighborhood].filter(Boolean).join(' · '))+'</p>'+(r.selected_venue_id===o.venue_id?'<p class="sl-notice">Selected by your group. <strong>Not a venue booking.</strong></p>':'')+'<p>'+Number(o.yes_count||0)+' yes · '+Number(o.maybe_count||0)+' maybe · '+Number(o.no_count||0)+' no — votes from members</p>'+
      (planning&&o.is_active?'<div class="sl-row">'+['yes','maybe','no'].map(choice=>'<button type="button" class="sl-secondary" data-act="vote" data-venue="'+E(o.venue_id)+'" data-choice="'+choice+'" aria-pressed="'+(o.my_vote===choice)+'">'+choice[0].toUpperCase()+choice.slice(1)+'</button>').join('')+(o.my_vote?button('vote','Clear vote','data-venue="'+E(o.venue_id)+'" data-choice="clear"',true):'')+(owner?button('decide','Select for the group','data-venue="'+E(o.venue_id)+'"')+button('remove-option','Remove option','data-venue="'+E(o.venue_id)+'"',true):'')+'</div>':(!o.is_active?'<p>Venue unavailable for new votes.</p>':''))+'</article>').join('');
    if(planning)html+='<form id="slVenueSearchForm"><label for="slPlanVenueSearch">Search the venue directory</label><div class="sl-row"><input id="slPlanVenueSearch" type="search" minlength="2" maxlength="160" placeholder="Venue, city or neighborhood" required><button type="submit">Search venues</button></div></form><div id="slPlanVenueResults" aria-live="polite"></div>';
    if(initialVenue&&planning&&!options.some(o=>o.venue_id===initialVenue))html+='<p>'+button('add-option','Add the venue you selected','data-venue="'+E(initialVenue)+'"')+'</p>';
    html+='<div class="sl-row">'+(owner?(planning?button('cancel-room','Cancel plan','',true):button('reopen-room','Reopen planning','',true)):button('leave-room','Leave plan','',true))+'<a href="/messages">Open Messages</a></div><p class="sl-muted">Messages are separate conversations, not an invented group chat.</p></section>';
    return html;
  }
  async function load(append) {
    const create=document.getElementById('slCreateRoom');if(create&&accountSession===C.token())createDraft={name:create.querySelector('#slRoomName').value,description:create.querySelector('#slRoomDescription').value,date:create.querySelector('#slRoomDate').value};
    const seq=++generation; detail=null;managed=null;
    if(!C.token()){rooms=[];friends=[];selected=null;skeleton();document.getElementById('slPlanContent').innerHTML='<section class="sl-panel"><h2>Make plans together</h2><p>Sign in to create a plan, find friends and respond to invitations. You can keep browsing without signing in.</p>'+button('login','Sign in / Sign up')+' <a href="/explore">Browse venues</a></section>';return;}
    if(requestedRoom){selected=requestedRoom;requestedRoom=null;}
    if(!append){rooms=[];skeleton();document.getElementById('slPlanStatus').textContent='Loading your account plans…';}
    try {
      const [r,f,inv,requests] = await Promise.all([C.request('/rooms?limit=30&offset='+(append?rooms.length:0)),C.request('/friends?limit=100'),C.request('/rooms/invitations'),C.request('/friends/pending')]);
      if(seq!==generation)return;
      if(!Array.isArray(r.rooms)||!Array.isArray(f.friends)||!Array.isArray(inv.invitations))throw new Error('The planning service returned an incomplete response.');
      rooms=append?rooms.concat(r.rooms.filter(x=>!rooms.some(old=>old.id===x.id))):r.rooms; friends=f.friends;friendsOffset=f.friends.length;friendsMore=f.has_more===true; loadMore=!!r.has_more;
      const content=document.getElementById('slPlanContent');
      content.innerHTML='<div class="sl-columns"><div><section class="sl-panel"><h2>Your plans</h2>'+rooms.map(x=>'<p>'+button('open-room',x.name,'data-room="'+E(x.id)+'"',x.id!==selected)+' <small>'+E(x.state==='confirmed'?'Venue selected':x.state)+'</small></p>').join('')+(!rooms.length?'<p>No private plans yet.</p>':'')+(loadMore?button('more-rooms','Load more plans','',true):'')+'</section><section class="sl-panel"><h2>Create a private plan</h2><form id="slCreateRoom"><label for="slRoomName">Plan name</label><input id="slRoomName" required maxlength="100" placeholder="Friday dinner"><label for="slRoomDate">Date (optional)</label><input id="slRoomDate" type="date"><label for="slRoomDescription">Notes (optional)</label><textarea id="slRoomDescription" maxlength="1000"></textarea><p><button type="submit">Create plan</button></p></form></section><section class="sl-panel"><h2>Plan invitations</h2>'+(inv.invitations.length?inv.invitations.map(x=>'<article class="sl-item"><strong>'+E(x.name)+'</strong><p>From '+E(x.owner_name)+'</p><div class="sl-row">'+button('accept-invite','Accept','data-room="'+E(x.id)+'"')+button('decline-invite','Decline','data-room="'+E(x.id)+'"',true)+'</div></article>').join(''):'<p>No pending invitations.</p>')+'</section></div><div><div id="slRoomDetail"><section class="sl-panel"><h2>Choose a plan</h2><p>Create or open a plan to invite friends, shortlist venues and vote together.</p></section></div><section class="sl-panel"><h2>Friends</h2><form id="slFriendSearchForm"><label for="slFriendSearch">Find a person by name or username</label><input type="search" id="slFriendSearch" minlength="2" maxlength="80" required autocomplete="off"><p><button type="submit">Find people</button></p></form><div id="slFriendResults" aria-live="polite"></div><h3>Friend requests</h3>'+renderRequests(requests)+'<h3>Accepted friends</h3>'+(friends.length?'<ul id="slAcceptedFriends">'+friends.map(x=>'<li><a href="/profile?user='+enc(x.username||x.id)+'">'+E(x.display_name||x.username)+'</a> (@'+E(x.username)+')</li>').join('')+'</ul>':'<ul id="slAcceptedFriends"></ul><p>No accepted friends yet. Search above and choose the person before sending a request.</p>')+(friendsMore?button('more-friends','Load more friends','',true):'')+'</section><section class="sl-panel"><h2>Previous itineraries</h2><p>Existing saved itineraries have not been deleted. They are separate from these new private group plans.</p>'+button('legacy','Load saved itineraries','',true)+'<div id="slLegacyPlans"></div></section></div></div>';
      const create=document.getElementById('slCreateRoom');create.querySelector('#slRoomName').value=createDraft.name;create.querySelector('#slRoomDescription').value=createDraft.description;create.querySelector('#slRoomDate').value=createDraft.date;status(notice);
      const invitation=inv.invitations.find(x=>x.id===selected);
      if(invitation){document.getElementById('slRoomDetail').innerHTML='<section class="sl-panel"><h2>Private plan invitation</h2><p>'+E(invitation.name)+'</p><p>From '+E(invitation.owner_name)+'</p><p>Accept to join and view this private plan. Opening this link does not join automatically.</p><div class="sl-row">'+button('accept-invite','Accept','data-room="'+E(invitation.id)+'"')+button('decline-invite','Decline','data-room="'+E(invitation.id)+'"',true)+'</div></section>';}
      else if(selected)await openRoom(selected);
    }catch(e){if(seq!==generation)return;status(e.message);document.getElementById('slPlanContent').innerHTML='<section class="sl-panel"><h2>Planning unavailable</h2><p>Your saved plans have not been replaced with local or sample data.</p>'+button('reload','Retry')+'</section>';}
  }
  function renderRequests(data){const incoming=data.incoming||[],outgoing=data.outgoing||[];return incoming.map(x=>'<article class="sl-item"><strong>'+E(x.display_name||x.username)+'</strong> (@'+E(x.username)+')<div class="sl-row">'+button('accept-friend','Accept request','data-friendship="'+E(x.friendship_id)+'"')+button('decline-friend','Decline','data-friendship="'+E(x.friendship_id)+'"',true)+'</div></article>').join('')+outgoing.map(x=>'<p>Request pending: '+E(x.display_name||x.username)+'</p>').join('')+(!incoming.length&&!outgoing.length?'<p>No pending friend requests.</p>':'');}
  async function openRoom(id) {
    selected=id;detail=null;managed=null;const seq=++generation,session=C.token(),box=document.getElementById('slRoomDetail');if(!box)return;
    box.textContent='Loading selected plan…';
    try {
      const data=await C.request('/rooms/'+enc(id));if(!currentView(seq,session))return;
      if(!data.room||data.room.id!==id)throw new Error('Plan response incomplete.');detail=data.room;box.innerHTML=renderRoom(detail);
    } catch(e) {
      if(!currentView(seq,session))return;
      if(e.status===403||e.status===404){
        try{await openManagement(id,seq,session);return;}catch(_){if(!currentView(seq,session))return;}
      }
      detail=null;managed=null;box.innerHTML='<section class="sl-panel"><h2>Plan unavailable</h2><p>'+E(e.message)+'</p>'+button('refresh-room','Retry','data-room="'+E(id)+'"',true)+'</section>';
    }
  }
  async function perform(buttonEl,fn,message){if(busy)return;busy=true;const epoch=C.token(),op=++operationSerial;buttonEl.disabled=true;try{const r=await fn();if(r && r.ok===false)throw new Error(r.error||'Change not saved');if(epoch!==C.token())return;status(message);await load();}catch(e){if(epoch!==C.token())return;status(e.message);if(e.status===409||e.status===428){if(selected)await openRoom(selected);}if(e.status===401)auth();}finally{if(op===operationSerial&&epoch===C.token()){busy=false;if(buttonEl.isConnected)buttonEl.disabled=false;}}}
  const mutate=(path,method,body)=>C.once(method+path,async()=>{const d=await C.request(path,{method,body});if(d.ok!==true)throw new Error('The service did not confirm this change. Refresh before retrying.');return d;});
  host.addEventListener('click',async e=>{
    const b=e.target.closest('button[data-act]');if(!b)return;const session=C.token();const act=b.dataset.act,rid=b.dataset.room||selected,vid=b.dataset.venue;
    if(act==='login'){auth();return;} if(act==='reload'){await load();return;}if(act==='more-rooms'){await load(true);return;}
    if(act==='more-friends'){if(friendsBusy)return;friendsBusy=true;const session=C.token();b.disabled=true;try{const data=await C.request('/friends?limit=100&offset='+friendsOffset);if(!currentAccount(session))return;if(!Array.isArray(data.friends))throw new Error('Friends response incomplete.');friends=[...new Map([...friends,...data.friends].map(f=>[f.id,f])).values()];friendsOffset+=data.friends.length;friendsMore=data.has_more===true;const select=document.getElementById('slRoomFriend');if(select&&detail){const old=select.value;select.innerHTML='<option value="">Choose a friend</option>'+friends.filter(f=>!(detail.members||[]).some(m=>m.id===f.id&&['accepted','pending'].includes(m.status))).map(f=>'<option value="'+E(f.id)+'">'+E(f.display_name||f.username)+' (@'+E(f.username)+')</option>').join('');select.value=old;}const list=document.getElementById('slAcceptedFriends');if(list)list.innerHTML=friends.map(f=>'<li><a href="/profile?user='+enc(f.username||f.id)+'">'+E(f.display_name||f.username)+'</a> (@'+E(f.username)+')</li>').join('');if(!friendsMore)host.querySelectorAll('[data-act="more-friends"]').forEach(el=>el.remove());status('Additional friends loaded for invitations.');}catch(error){if(currentAccount(session))status(error.message);}finally{if(currentAccount(session)){friendsBusy=false;if(b.isConnected)b.disabled=false;}}return;}if(act==='open-room'||act==='refresh-room'){await openRoom(rid);return;}
    if(act==='refresh-management'){
      const seq=++generation,session=C.token();detail=null;managed=null;
      try{await openManagement(rid,seq,session);}catch(e){if(currentView(seq,session)){const box=document.getElementById('slRoomDetail');if(box)box.innerHTML='<section class="sl-panel"><h2>Owner management unavailable</h2><p>Refresh the plan to check your current access.</p>'+button('refresh-room','Retry','data-room="'+E(rid)+'"',true)+'</section>';}}return;
    }
    if(act==='edit-room'){if(validOwnerDetails(detail,rid)&&detail.state==='planning'){if(!drafts.has(rid))drafts.set(rid,newDraft(detail));redrawRoom(rid,'#slEditName');}return;}
    if(act==='cancel-edit'){if(drafts.get(rid)?.saving)return;drafts.delete(rid);redrawRoom(rid,'[data-act="edit-room"]');return;}
    if(act==='reload-edit'){await reloadDraft(rid);return;}
    if(act==='rebase-edit'){
      const d=drafts.get(rid);if(d&&!d.saving&&detail&&detail.id===rid&&detail.is_owner===true&&Number.isInteger(detail.revision)){d.revision=detail.revision;d.needsReview=false;d.message='Your draft is kept against the saved version shown above. Save when ready.';redrawRoom(rid,'#slEditName');}return;
    }
    if(act==='venue-detail'){window.SLVenueDetail.open(vid);return;}
    if(act==='legacy'){const target=document.getElementById('slLegacyPlans');b.disabled=true;try{const d=await C.request('/plans');if(!currentAccount(session)||!target?.isConnected)return;const list=d.plans||[];target.innerHTML=list.length?list.map(p=>'<article class="sl-item"><strong>'+E(p.name||p.title)+'</strong><p>'+E(p.plan_date||'Date not provided')+' · Saved itinerary, not a reservation.</p></article>').join(''):'<p>No previous itineraries.</p>';}catch(err){if(currentAccount(session)&&target?.isConnected)status(err.message);}finally{if(b.isConnected)b.disabled=false;}return;}
    if(!auth())return;
    if(act==='request-friend'){await perform(b,async()=>{const d=await C.request('/friends/request',{method:'POST',body:{user_id:b.dataset.user}});if(!['pending','accepted'].includes(d.status))throw new Error('Friend request not confirmed');},'Friend relationship saved. Pending requests require the other person to accept.');return;}
    if(act==='accept-friend'||act==='decline-friend'){await perform(b,async()=>{const d=await C.request('/friends/'+(act==='accept-friend'?'accept':'decline'),{method:'POST',body:{friendship_id:b.dataset.friendship}});if(d.status!==(act==='accept-friend'?'accepted':'declined'))throw new Error('Response not confirmed');},act==='accept-friend'?'Friend request accepted. You can now invite this friend.':'Friend request declined.');return;}
    if(act==='accept-invite'||act==='decline-invite'){if(act==='accept-invite')selected=rid;else if(selected===rid)selected=null;await perform(b,()=>mutate('/rooms/'+enc(rid)+'/invitation','PUT',{response:act==='accept-invite'?'accepted':'declined'}),act==='accept-invite'?'Invitation accepted. You joined the private plan.':'Invitation declined.');return;}
    if(act==='remove-managed-member'||act==='cancel-managed-room'){
      if(!managed||managed.id!==rid){status('Refresh owner management before making this change.');return;}
      const path='/rooms/'+enc(rid);
      if(act==='remove-managed-member')await perform(b,()=>mutate(path+'/members/'+enc(b.dataset.user),'DELETE'),'Member removed from the plan. Their votes and access were removed; no friendship was restored.');
      else await perform(b,()=>mutate(path+'/state','PUT',{state:'cancelled',revision:managed.revision}),'Plan cancelled. This does not cancel any venue reservation or ticket.');
      return;
    }
    if(!detail||detail.id!==rid){status('Refresh the selected plan first.');return;}
    const path='/rooms/'+enc(rid);
    if(act==='add-option')await perform(b,()=>mutate(path+'/options/'+enc(vid),'PUT',{}),'Venue added to this plan.');
    if(act==='vote')await perform(b,()=>mutate(path+'/options/'+enc(vid)+'/vote','PUT',{choice:b.dataset.choice==='clear'?null:b.dataset.choice}),'Your vote was saved to this plan.');
    if(act==='decide')await perform(b,()=>mutate(path+'/decision','PUT',{venue_id:vid,revision:detail.revision}),'Group venue selected. No reservation has been made.');
    if(act==='remove-option')await perform(b,()=>mutate(path+'/options/'+enc(vid),'DELETE',{revision:detail.revision}),'Venue option removed.');
    if(act==='remove-member')await perform(b,()=>mutate(path+'/members/'+enc(b.dataset.user),'DELETE'),'Member or invitation removed.');
    if(act==='cancel-room'||act==='reopen-room')await perform(b,()=>mutate(path+'/state','PUT',{state:act==='cancel-room'?'cancelled':'planning',revision:detail.revision}),act==='cancel-room'?'Plan cancelled. This does not cancel any external booking.':'Plan reopened.');
    if(act==='leave-room')await perform(b,async()=>{const me=await C.request('/users/me');if(!currentAccount(session))return;await mutate(path+'/members/'+enc(me.user.id),'DELETE');if(!currentAccount(session))return;drafts.delete(rid);if(selected===rid){selected=null;detail=null;generation++;}},'You left this plan.');
  });
  host.addEventListener('submit',async e=>{
    const form=e.target;if(!form.matches('form'))return;e.preventDefault();if(!auth())return;const session=C.token();const b=form.querySelector('button[type=submit]'),seq=++searchGeneration;
    if(form.id==='slEditRoom'){await saveDraft(form);return;}
    if(form.id==='slCreateRoom'){
      const view=generation;const body={name:form.querySelector('#slRoomName').value.trim(),description:form.querySelector('#slRoomDescription').value.trim(),event_date:form.querySelector('#slRoomDate').value||null};
      const signature=JSON.stringify(body);if(signature!==pendingBody){pendingId=crypto.randomUUID();pendingBody=signature;}body.client_id=pendingId;
      await perform(b,async()=>{const d=await C.request('/rooms',{method:'POST',body});if(!currentAccount(session))return;if(!d.room||!d.room.id)throw new Error('Plan creation was not confirmed');if(view===generation)selected=d.room.id;pendingId=null;pendingBody=null;if(form.isConnected&&form.querySelector('#slRoomName').value.trim()===body.name&&form.querySelector('#slRoomDescription').value.trim()===body.description&&(form.querySelector('#slRoomDate').value||null)===body.event_date){form.reset();createDraft={name:'',description:'',date:''};}},'Private plan saved. Invite friends when you are ready.');return;
    }
    if(form.id==='slInviteFriend'){await perform(b,()=>mutate('/rooms/'+enc(selected)+'/invitations','POST',{user_id:form.querySelector('select').value}),'Invitation saved in SceneLink. Awaiting your friend’s response.');return;}
    b.disabled=true;
    try{
      if(form.id==='slFriendSearchForm'){const q=form.querySelector('input').value.trim(),d=await C.request('/users/search?q='+enc(q)+'&limit=20');if(seq!==searchGeneration||!currentAccount(session))return;const users=d.results||[];document.getElementById('slFriendResults').innerHTML=users.length?users.map(u=>'<article class="sl-item"><strong>'+E(u.display_name||u.username)+'</strong> (@'+E(u.username)+') '+(friends.some(f=>f.id===u.id)||u.friendship_status?.status==='accepted'?'<span>Already friends</span>':u.friendship_status?.status==='pending'?u.friendship_status.direction==='incoming'?button('accept-friend','Accept request','data-friendship="'+E(u.friendship_status.id)+'"')+button('decline-friend','Decline','data-friendship="'+E(u.friendship_status.id)+'"',true):'<span>Friend request pending</span>':button('request-friend','Send friend request','data-user="'+E(u.id)+'"',true))+'</article>').join(''):'<p>No people match this search.</p>';}
      if(form.id==='slVenueSearchForm'){const q=form.querySelector('input').value.trim(),rid=selected,d=await window.SLVenueData.list({q,limit:20});if(seq!==searchGeneration||rid!==selected||!currentAccount(session))return;document.getElementById('slPlanVenueResults').innerHTML=d.venues.length?d.venues.map(v=>'<article class="sl-item"><strong>'+E(v.name)+'</strong><p>'+E([v.neighborhood,v.city,v.address].filter(Boolean).join(' · '))+'</p>'+button('add-option','Add to this plan','data-venue="'+E(v.id)+'"',true)+'</article>').join('')+(d.has_more?'<p>Showing 20 matches. Refine your search for more specific results.</p>':''):'<p>No venues match your search.</p>';}
    }catch(err){if(currentAccount(session))status(err.message);}finally{if(b.isConnected)b.disabled=false;}
  });
  host.addEventListener('input',e=>{
    const form=e.target.form;if(!form||form.id!=='slEditRoom')return;const d=drafts.get(form.dataset.room);if(!d||d.saving)return;
    d.name=form.elements.name.value;d.description=form.elements.description.value;d.event_date=form.elements.event_date.value;
  });
  function authChanged(){
    if(accountSession!==C.token()){accountSession=C.token();drafts.clear();managed=null;detail=null;selected=null;rooms=[];friends=[];pendingId=null;pendingBody=null;createDraft={name:'',description:'',date:''};friendsMore=false;friendsOffset=0;friendsBusy=false;operationSerial++;busy=false;skeleton();}
    ++searchGeneration;notice='';load();
  }
  ['sl-auth-changed','sl-auth-change','sl-auth-ready'].forEach(type=>{window.addEventListener(type,authChanged);document.addEventListener(type,authChanged);});
  window.addEventListener('storage',event=>{if(event.key===null||event.key==='sl_jwt_token')authChanged();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&C.token()&&!busy)load();});
  skeleton();load();
})();
