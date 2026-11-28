/* Reviewed events + persisted first-party RSVP. No ticket, capacity or reservation claims. */
(function () {
  'use strict';
  const C=window.SLConnected,E=C.esc,enc=encodeURIComponent;
  const statuses={going:'Going',interested:'Interested',not_going:'Not going'};
  async function update(event,status,audience){
    if(!Object.prototype.hasOwnProperty.call(statuses,status)||!['private','public'].includes(audience))throw new Error('Choose a valid RSVP and audience.');
    return C.once('event-rsvp:'+event.id,async()=>{const d=await C.request('/events/'+enc(event.id)+'/rsvp',{method:'PUT',body:{status,audience,revision:event.my_rsvp_revision||0}});
      if(!d.rsvp||d.my_rsvp!==status||d.rsvp_is_reservation!==false)throw new Error('RSVP confirmation was incomplete. Refresh before retrying.');return d;});
  }
  async function remove(id){return C.once('event-rsvp:'+id,async()=>{const d=await C.request('/events/'+enc(id)+'/rsvp',{method:'DELETE'});if(d.my_rsvp!==null||d.rsvp_is_reservation!==false)throw new Error('Removal was not confirmed. Refresh before retrying.');return d;});}
  window.SLEventRSVP={update,remove};
  const host=document.getElementById('slConnectedEvents');if(!host)return;
  const route=new URL(location.href),directIDs=route.searchParams.getAll('event');
  let direct=directIDs.length>0;
  const directID=directIDs.length===1&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(directIDs[0])?directIDs[0].toLowerCase():null;
  const reviewed=ev=>ev&&ev.source_review_status==='reviewed'&&ev.rsvp_is_reservation===false;
  const calendar=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  function rsvpOpen(ev){
    const fields=Object.fromEntries(calendar.formatToParts(new Date()).map(x=>[x.type,x.value]));
    return typeof ev.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(ev.date)&&ev.date>=fields.year+'-'+fields.month+'-'+fields.day;
  }
  let events=[],generation=0,hasMore=false,query='',date='',busy=new Set(),mineSerial=0,mineVisible=false;
  function status(text){const el=document.getElementById('slEventStatus');if(el)el.textContent=text;}
  function externalEventPage(ev,source){
    const b=ev.booking, href=b&&C.safeUrl(b.url), eventHref=C.safeUrl(ev.event_url);
    // Older backends may send any event_url. Only offer an external action when
    // it is the same URL as the source that was actually reviewed.
    return ev.source_review_status==='reviewed'&&ev.rsvp_is_reservation===false&&ev.booking_status==='not_booked'&&
      b?.status==='external_link'&&b.reservation_confirmed===false&&b.requires_external_confirmation===true&&
      href&&href===source&&href===eventHref?href:null;
  }
  function card(ev){
    const source=C.safeUrl(ev.source_url),open=rsvpOpen(ev),external=open?externalEventPage(ev,source):null;
    const count=ev.attending_count_source==='public_scenelink_rsvps'&&Number.isInteger(Number(ev.attending_count))?Number(ev.attending_count):null;
    return '<article class="sl-panel" data-event="'+E(ev.id)+'"><h2>'+E(ev.title)+'</h2><p>'+E([ev.date,ev.start_time,ev.venue_name].filter(Boolean).join(' · '))+'</p><p>'+E(ev.description||'Description not provided')+'</p><p>Price: '+E(ev.price||'Not provided')+'</p>'+
      (source?'<p><a href="'+E(source)+'" target="_blank" rel="noopener noreferrer">Event source (information) ↗</a>'+(ev.source_reviewed_at?' · reviewed '+E(String(ev.source_reviewed_at).slice(0,10)):'')+'</p>':'')+
      (count!==null?'<p class="sl-muted">'+count+' public SceneLink '+(count===1?'RSVP':'RSVPs')+' marked going. Not venue attendance or capacity.</p>':'')+
      '<div class="sl-notice">'+(ev.my_rsvp?'Your SceneLink RSVP: <strong>'+E(statuses[ev.my_rsvp]||ev.my_rsvp)+'</strong>. ':'')+'This does not reserve admission, book a table or buy a ticket.</div>'+
      (open?'<label><input type="checkbox" data-rsvp-public '+(ev.my_rsvp_audience==='public'?'checked':'')+'> Include my going RSVP in the public SceneLink count</label><p class="sl-muted">Private by default. A private profile is never included in the public count.</p><div class="sl-row">'+
      Object.keys(statuses).map(s=>'<button type="button" data-rsvp="'+s+'" aria-pressed="'+(ev.my_rsvp===s)+'" class="sl-secondary">'+statuses[s]+'</button>').join(''):'<p class="sl-muted">This event has passed or its date is unavailable. New RSVPs are closed.</p><div class="sl-row">')+
      (ev.my_rsvp?'<button type="button" data-remove-rsvp class="sl-secondary">Remove RSVP</button>':'')+'</div><p class="sl-row" style="margin-top:18px">'+
      (external?'<a class="sl-link-button sl-secondary" data-external-event-page href="'+E(external)+'" target="_blank" rel="noopener noreferrer">Open external event / ticket page ↗</a>':'')+
      (external?'<span>Check availability and complete any purchase on the external site. SceneLink does not receive a confirmation.</span>':'')+
      '<span>In-site tickets and reservations are unavailable. No booking request or payment has been submitted.</span>'+
      (ev.venue_id?'<button type="button" class="sl-secondary" data-event-venue="'+E(ev.venue_id)+'">Venue details</button>':'')+'</p></article>';
  }
  function render(){const grid=document.getElementById('eventsGrid');grid.innerHTML=events.length?events.map(card).join(''):'<div class="sl-panel"><h2>No reviewed events match</h2><p>There are no source-reviewed listings for these filters. We do not substitute demo events.</p><a href="/explore">Browse the venue directory</a></div>';const more=document.getElementById('slMoreEvents');more.hidden=!hasMore;more.disabled=false;}
  async function loadDirect(){
    const seq=++generation,grid=document.getElementById('eventsGrid');
    events=[];hasMore=false;document.getElementById('slMoreEvents').hidden=true;
    grid.innerHTML='';status('Loading reviewed event…');
    try{
      if(!directID)throw new Error('Invalid event link');
      const d=await C.request('/events/'+enc(directID));
      if(seq!==generation||!direct)return;
      if(!reviewed(d?.event)||d.event.id!==directID)throw new Error('Event not available');
      events=[d.event];render();status('');
    }catch(_){
      if(seq!==generation||!direct)return;
      status('Event unavailable.');
      grid.innerHTML='<div class="sl-panel"><h2>Event unavailable</h2><p>This link may be outdated or the event is no longer listed.</p><a href="/events">Browse reviewed events</a></div>';
    }
  }
  async function load(append){if(direct)return loadDirect();const seq=++generation;status('Loading reviewed events…');if(!append){events=[];document.getElementById('eventsGrid').innerHTML='';}try{const params=new URLSearchParams({limit:24,offset:append?events.length:0});if(query)params.set('q',query);if(date)params.set('date',date);const d=await C.request('/events?'+params);if(seq!==generation)return;if(!Array.isArray(d.events))throw new Error('Invalid events response.');const rows=d.events.filter(reviewed);events=append?events.concat(rows.filter(e=>!events.some(old=>old.id===e.id))):rows;hasMore=!!d.has_more;render();status(rows.length!==d.events.length?'Some listings are awaiting source review and are not displayed.':'');}catch(e){if(seq!==generation)return;status(e.message);document.getElementById('eventsGrid').innerHTML='<div class="sl-panel"><h2>Events unavailable</h2><p>No replacement or demo events are shown.</p><button type="button" data-retry-events>Retry</button></div>';}}
  async function mine(openLogin=true){
    mineVisible=true;const seq=++mineSerial,session=C.token(),panel=document.getElementById('slMyRSVPs');
    if(!session){panel.innerHTML='<section class="sl-panel"><h2>Your saved RSVPs</h2><p>Sign in to view your saved RSVPs.</p></section>';if(openLogin&&window.SLAuthUI)window.SLAuthUI.open('login');return;}
    panel.innerHTML='<section class="sl-panel" role="status">Loading your saved RSVPs…</section>';
    try{
      const d=await C.request('/events/rsvps/mine?limit=100');if(seq!==mineSerial||session!==C.token())return;
      if(!Array.isArray(d.rsvps))throw new Error('Saved RSVPs could not be loaded. Please retry.');
      panel.innerHTML='<section class="sl-panel"><h2>Your saved RSVPs</h2><p>Saved intent only. These are not tickets, reservations or verified attendance.</p>'+
        (d.rsvps.length?d.rsvps.map(r=>'<article class="sl-item"><strong>'+E(r.title||'Event no longer available')+'</strong><p>'+E(statuses[r.status]||r.status)+' · '+E(r.audience)+' · not a booking</p><button type="button" data-remove-own="'+E(r.event_id)+'" class="sl-secondary">Remove RSVP</button></article>').join(''):'<p>No saved RSVPs.</p>')+
        (d.has_more?'<p>Showing the first 100 RSVPs.</p>':'')+'</section>';
    }catch(e){if(seq!==mineSerial||session!==C.token())return;panel.innerHTML='<section class="sl-panel"><h2>Saved RSVPs unavailable</h2><p>'+E(e.message)+'</p><button type="button" data-show-rsvps>Retry saved RSVPs</button></section>';}
  }
  host.innerHTML='<h1>Boston events</h1><p class="sl-muted">Source-reviewed listings. Save your intent in SceneLink. In-site ticket purchase and reservations are not connected yet.</p><div class="sl-notice"><strong>RSVP is not a booking.</strong> No attendance, admission, table, price or availability is guaranteed by a SceneLink RSVP.</div><form id="slEventFilters" class="sl-panel"><label for="slEventQuery">Search events</label><input type="search" id="slEventQuery" maxlength="160" placeholder="Event or venue"><label for="slEventDate">Date (optional)</label><input type="date" id="slEventDate"><p class="sl-row"><button type="submit">Find events</button><button type="button" class="sl-secondary" data-show-rsvps>My RSVPs</button></p></form><p id="slEventStatus" role="status"></p><div id="slMyRSVPs"></div><div id="eventsGrid" class="sl-grid"></div><button type="button" id="slMoreEvents" hidden>Load more events</button>';
  host.addEventListener('submit',e=>{if(e.target.id!=='slEventFilters')return;e.preventDefault();if(direct){direct=false;route.searchParams.delete('event');try{history.replaceState(null,'',route.pathname+route.search+route.hash);}catch(_){}}query=document.getElementById('slEventQuery').value.trim();date=document.getElementById('slEventDate').value;load();});
  host.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.matches('[data-show-rsvps]')){await mine();return;}if(b.id==='slMoreEvents'){b.disabled=true;await load(true);return;}if(b.matches('[data-retry-events]')){await load();return;}if(b.dataset.eventVenue){window.SLVenueDetail.open(b.dataset.eventVenue);return;}
    if(!b.matches('[data-rsvp],[data-remove-rsvp],[data-remove-own]'))return;
    if(!C.token()){status('Sign in to save an RSVP.');if(window.SLAuthUI)window.SLAuthUI.open('login');return;}
    const cardEl=b.closest('[data-event]'),id=b.dataset.removeOwn||(cardEl&&cardEl.dataset.event),ev=events.find(x=>x.id===id);
    if(!id||busy.has(id)||(b.hasAttribute('data-rsvp')&&(!ev||!rsvpOpen(ev))))return;busy.add(id);const session=C.token(),buttons=Array.from((cardEl||b.parentElement).querySelectorAll('button'));buttons.forEach(x=>x.disabled=true);
    try{if(b.hasAttribute('data-rsvp'))await update(ev,b.dataset.rsvp,cardEl.querySelector('[data-rsvp-public]').checked?'public':'private');else await remove(id);if(session!==C.token())return;await load();if(session!==C.token())return;status(b.hasAttribute('data-rsvp')?'Your SceneLink RSVP was saved. No ticket or reservation was booked.':'Your SceneLink RSVP was removed. This does not cancel external tickets or reservations.');if(mineVisible)await mine(false);}
    catch(err){if(session!==C.token())return;if(err.status===409)await load();status(err.message);}finally{busy.delete(id);buttons.forEach(x=>{if(x.isConnected)x.disabled=false;});}
  });
  window.addEventListener('sl-auth-changed',()=>{++mineSerial;document.getElementById('slMyRSVPs').textContent='';load();if(mineVisible)mine(false);});
  window.addEventListener('sl-auth-ready',()=>{load();if(mineVisible)mine(false);});
  window.addEventListener('hashchange',()=>{if(window.location.hash==='#my-rsvps')mine(false);});
  load();
  if(window.location.hash==='#my-rsvps')mine(false);
})();
