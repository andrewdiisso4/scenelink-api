/* Confirm venue saves with the server before reflecting success. */
(function(){
 'use strict';
 const C=window.SLConnected;
 function toast(message,kind){if(window.SLToast)window.SLToast(message,4000,kind||'info');}
 async function save(id,button){
   if(!id)return;
   if(!C.token()){if(window.SLAuthUI)window.SLAuthUI.open('login');return;}
   if(button)button.disabled=true;
   try{
     await C.once('favorite:'+id,async()=>{
       const existing=await C.request('/favorites');
       if(!Array.isArray(existing.favorites))throw new Error('Saved venues could not be checked. Please retry.');
       const saved=existing.favorites.some(v=>(v.venue_id||v.id)===id);
       const d=await C.request('/favorites/'+encodeURIComponent(id),{method:saved?'DELETE':'POST'});
       if(d.favorited!==!saved)throw new Error('The save change was not confirmed. Refresh before trying again.');
       if(!window._slSavedVenues)window._slSavedVenues={};
       if(d.favorited)window._slSavedVenues[id]={id:id};else delete window._slSavedVenues[id];
       if(button){button.classList.toggle('saved',d.favorited);button.classList.toggle('sl-saved',d.favorited);button.setAttribute('aria-pressed',String(d.favorited));const icon=button.querySelector('i');if(icon)icon.className=d.favorited?'fas fa-heart':'far fa-heart';}
       window.dispatchEvent(new CustomEvent('sl-lists-changed',{detail:{venue_id:id,favorited:d.favorited}}));
       toast(d.favorited?'Venue saved to your account.':'Venue removed from your saved list.','success');
     });
   }catch(e){toast(e.message,'error');}finally{if(button&&button.isConnected)button.disabled=false;}
 }
 window.SLVenueActions={save};
 document.addEventListener('click',e=>{
   const b=e.target.closest('[data-sl-action="save"],[data-sl-action="plan"],.sl-rp-save');if(!b)return;
   const card=b.closest('[data-sl-venue-id],[data-venue-id]');
   const id=b.dataset.slVenueId||b.dataset.venueId||b.dataset.id||(card&&(card.dataset.slVenueId||card.dataset.venueId));
   if(!id)return;
   e.preventDefault();e.stopImmediatePropagation();
   if(b.dataset.slAction==='plan')window.location.href='/plan-with-friends?venue_id='+encodeURIComponent(id);else save(id,b);
 },true);
})();
