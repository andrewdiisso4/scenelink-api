'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),source=fs.readFileSync(path.resolve(__dirname,'../frontend/js/sl-connected-plans.js'),'utf8');
const rid='a0000000-abcd-4000-8000-000000000001',other='b0000000-abcd-4000-8000-000000000001',member='c0000000-abcd-4000-8000-000000000001';
const tick=()=>new Promise(r=>setTimeout(r,20)),defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const error=(message,status,code)=>Object.assign(new Error(message),{status,code});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const room=(id=rid,name='Friday dinner')=>({id,name,description:'Meet by the entrance',event_date:'2026-11-14',revision:3,state:'planning',is_owner:true,owner_name:'Fictional owner',members:[],options:[]});
async function harness(t,config={}){
 const d=new JSDOM('<!doctype html><main id="slConnectedPlans"></main>',{url:'https://scenelink.test/plan-with-friends?room_id='+rid,runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;t.after(()=>w.close());
 const state={rooms:[room(),room(other,'Saturday music')],restricted:false,owner:true,manageMembers:[{id:member,status:'accepted',restricted:true,display_name:'MUST_NOT_SHOW_PRIVATE_IDENTITY'}],...config.state};
 let session='FICTIONAL_A',confirm=true;const calls=[];
 const request=async(p,opts={})=>{
  const call={path:p,method:opts.method||'GET',body:opts.body?JSON.parse(JSON.stringify(opts.body)):undefined,session};calls.push(call);
  if(config.intercept){const result=config.intercept(call,state,calls);if(result!==undefined)return await result;}
  if(p.startsWith('/rooms?'))return{rooms:state.rooms.filter(x=>state.owner||!state.restricted).map(r=>({id:r.id,name:r.name,state:r.state,event_date:r.event_date,revision:r.revision,is_owner:state.owner,access_restricted:state.restricted})),has_more:false};
  if(p==='/rooms/invitations')return{invitations:[]};if(p.startsWith('/friends?'))return{friends:[]};if(p==='/friends/pending')return{incoming:[],outgoing:[]};
  const match=/^\/rooms\/([^/]+)(.*)$/.exec(p);if(!match)throw error('Unexpected path '+p,500);const r=state.rooms.find(x=>x.id===match[1]),suffix=match[2];if(!r)throw error('Plan unavailable',404);
  if(suffix==='/manage-members'){if(!state.owner)throw error('Plan unavailable',404);return{members:structuredClone(state.manageMembers),revision:r.revision};}
  if(!suffix){if(state.restricted)throw error('Plan unavailable',404);return{room:{...structuredClone(r),is_owner:state.owner}};}
  if(suffix==='/details'){
   if(!state.owner)throw error('Plan unavailable',404);if(r.state!=='planning')throw error('Reopen planning first',409,'ROOM_CLOSED');
   if(opts.body.revision!==r.revision)throw error('This plan changed',409,'STALE_ROOM');Object.assign(r,{name:opts.body.name,description:opts.body.description,event_date:opts.body.event_date,revision:r.revision+1});return{ok:true,revision:r.revision};
  }
  if(suffix==='/members/'+member&&opts.method==='DELETE'){if(!state.owner)throw error('Plan unavailable',404);state.restricted=false;state.manageMembers=[];r.revision++;return{ok:true};}
  if(suffix==='/state'){if(!state.owner)throw error('Plan unavailable',404);if(opts.body.revision!==r.revision)throw error('This plan changed',409);r.state=opts.body.state;r.revision++;return{ok:true,revision:r.revision};}
  throw error('Unexpected path '+p,500);
 };
 w.SLConnected={token:()=>session,esc,request,once:(key,fn)=>fn()};w.confirm=()=>confirm;
 w.eval(source);await tick();
 const el=selector=>w.document.querySelector(selector),click=async selector=>{const target=el(selector);assert(target,'Missing '+selector);target.click();await tick();};
 const input=(field,value)=>{const form=el('#slEditRoom');assert(form);form.elements[field].value=value;form.elements[field].dispatchEvent(new w.Event('input',{bubbles:true}));};
 const submit=()=>{const form=el('#slEditRoom');assert(form);form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 return{w,state,calls,el,click,input,submit,setConfirm:v=>confirm=v,change:async value=>{session=value;w.dispatchEvent(new w.CustomEvent('sl-auth-changed'));await tick();}};
}
test('owner can edit existing plan details and server readback survives refresh',async t=>{
 const h=await harness(t);await h.click('[data-act=edit-room]');h.input('name','  Friday with friends  ');h.input('description','Dinner and catch up');h.input('event_date','2026-11-15');h.submit();await tick();
 const writes=h.calls.filter(x=>x.path.endsWith('/details'));assert.equal(writes.length,1);assert.equal(writes[0].method,'PUT');assert.deepEqual(writes[0].body,{name:'Friday with friends',description:'Dinner and catch up',event_date:'2026-11-15',revision:3});
 assert(!h.el('#slEditRoom'));assert.match(h.el('#slPlanStatus').textContent,/saved and read back/);assert.match(h.el('#slRoomDetail').textContent,/Friday with friends/);assert.match(h.el('#slRoomDetail').textContent,/2026-11-15/);assert.equal(h.w.document.activeElement.dataset.act,'edit-room');
 await h.click('[data-act=refresh-room]');assert.match(h.el('#slRoomDetail').textContent,/Dinner and catch up/);
});
test('optional date can be cleared without creating another plan',async t=>{const h=await harness(t);await h.click('[data-act=edit-room]');h.input('event_date','');h.submit();await tick();assert.equal(h.state.rooms[0].event_date,null);assert.equal(h.calls.filter(x=>x.method==='POST'&&x.path==='/rooms').length,0);assert.match(h.el('#slRoomDetail').textContent,/Date not chosen/);});
test('non-owner sees no edit form and closed plans cannot silently save a retained draft',async t=>{
 const h=await harness(t,{state:{owner:false}});assert(!h.el('[data-act=edit-room]'));assert(!h.el('#slEditRoom'));
 const a=await harness(t);await a.click('[data-act=edit-room]');a.input('name','Private draft');a.state.rooms[0].state='confirmed';a.state.rooms[0].revision++;await a.click('[data-act=refresh-room]');assert.equal(a.el('#slEditRoom input[name=name]').value,'Private draft');assert(a.el('#slEditRoom button[type=submit]').disabled);assert.match(a.el('#slRoomDetail').textContent,/no longer in planning/);a.submit();await tick();assert.equal(a.calls.filter(x=>x.path.endsWith('/details')).length,0);
});
test('Cancel editing discards only the local draft and restores keyboard focus',async t=>{const h=await harness(t);await h.click('[data-act=edit-room]');h.input('name','Unsaved dinner');await h.click('[data-act=cancel-edit]');assert(!h.el('#slEditRoom'));assert.equal(h.state.rooms[0].name,'Friday dinner');assert.equal(h.calls.filter(x=>x.method!=='GET').length,0);assert.equal(h.w.document.activeElement.dataset.act,'edit-room');});
test('drafts remain private in memory across refresh and switching between plans',async t=>{
 const h=await harness(t);await h.click('[data-act=edit-room]');h.input('description','Unsaved dinner note');await h.click('[data-act=refresh-room]');assert.equal(h.el('#slEditRoom textarea').value,'Unsaved dinner note');
 await h.click('[data-act=open-room][data-room="'+other+'"]');assert(!h.el('#slEditRoom'));await h.click('[data-act=open-room][data-room="'+rid+'"]');assert.equal(h.el('#slEditRoom textarea').value,'Unsaved dinner note');assert.equal(h.w.localStorage.length,0);assert.equal(h.w.sessionStorage.length,0);
});
test('stale revision keeps the draft, displays latest details and requires explicit review before retry',async t=>{
 let conflict=true;const h=await harness(t,{intercept:(c,s)=>{if(c.path.endsWith('/details')&&conflict){conflict=false;s.rooms[0].name='Changed elsewhere';s.rooms[0].revision++;throw error('This plan changed',409,'STALE_ROOM');}}});await h.click('[data-act=edit-room]');h.input('name','My draft');h.submit();await tick();
 assert.equal(h.el('#slEditName').value,'My draft');assert.match(h.el('#slRoomDetail').textContent,/Changed elsewhere/);assert.match(h.el('#slRoomEditStatus').textContent,/draft is kept/);assert(h.el('#slEditRoom button[type=submit]').disabled);assert.equal(h.calls.filter(x=>x.path.endsWith('/details')).length,1);
 await h.click('[data-act=rebase-edit]');assert.equal(h.calls.filter(x=>x.path.endsWith('/details')).length,1);assert.equal(h.el('#slEditName').value,'My draft');h.submit();await tick();assert.equal(h.calls.filter(x=>x.path.endsWith('/details'))[1].body.revision,4);assert.equal(h.state.rooms[0].name,'My draft');
});
test('background refresh notices a newer revision without overwriting the draft',async t=>{const h=await harness(t);await h.click('[data-act=edit-room]');h.input('name','My draft');h.state.rooms[0].description='New saved note';h.state.rooms[0].revision++;h.w.document.dispatchEvent(new h.w.Event('visibilitychange'));await tick();assert.equal(h.el('#slEditName').value,'My draft');assert.match(h.el('#slRoomDetail').textContent,/New saved note/);assert(h.el('#slEditRoom button[type=submit]').disabled);});
test('reload saved details requires intentional draft replacement and restores input focus',async t=>{
 const h=await harness(t);await h.click('[data-act=edit-room]');h.input('name','Unsaved draft');h.state.rooms[0].name='Latest saved';h.state.rooms[0].revision++;h.setConfirm(false);const before=h.calls.length;await h.click('[data-act=reload-edit]');assert.equal(h.calls.length,before);assert.equal(h.el('#slEditName').value,'Unsaved draft');
 h.setConfirm(true);await h.click('[data-act=reload-edit]');assert.equal(h.el('#slEditName').value,'Latest saved');assert(!h.el('#slEditRoom button[type=submit]').disabled);assert.equal(h.w.document.activeElement.id,'slEditName');
});
test('failed reload preserves unsaved values instead of replacing them with empty defaults',async t=>{let fail=false;const h=await harness(t,{intercept:c=>{if(fail&&c.path==='/rooms/'+rid)throw error('Temporary outage',503);}});await h.click('[data-act=edit-room]');h.input('description','Keep this note');fail=true;await h.click('[data-act=reload-edit]');assert.equal(h.el('#slEditDescription').value,'Keep this note');assert.match(h.el('#slRoomEditStatus').textContent,/draft is unchanged/);});
test('confirmed write followed by failed readback keeps draft and never claims readback success',async t=>{
 let written=false;const h=await harness(t,{intercept:c=>{if(c.path.endsWith('/details'))written=true;else if(written&&c.path==='/rooms/'+rid)throw error('Readback unavailable',503);}});await h.click('[data-act=edit-room]');h.input('name','Committed dinner');h.submit();await tick();assert.equal(h.state.rooms[0].name,'Committed dinner');assert.equal(h.el('#slEditName').value,'Committed dinner');assert.match(h.el('#slRoomEditStatus').textContent,/change was confirmed/);assert(!h.el('#slPlanStatus').textContent.includes('saved and read back'));assert(h.el('#slEditRoom button[type=submit]').disabled);assert.equal(h.calls.filter(x=>x.path.endsWith('/details')).length,1);
});
test('a newer different readback is displayed for review without erasing the submitted draft',async t=>{
 let written=false;const h=await harness(t,{intercept:(c,s)=>{if(c.path.endsWith('/details'))written=true;else if(written&&c.path==='/rooms/'+rid){s.rooms[0].name='Another current update';s.rooms[0].revision++;written=false;}}});await h.click('[data-act=edit-room]');h.input('name','My submitted draft');h.submit();await tick();assert.equal(h.el('#slEditName').value,'My submitted draft');assert.match(h.el('#slRoomDetail').textContent,/Another current update/);assert.match(h.el('#slRoomEditStatus').textContent,/changed again/);assert(h.el('#slEditRoom button[type=submit]').disabled);
});
test('duplicate submissions issue one mutation while the first response is pending',async t=>{
 const pending=defer();const h=await harness(t,{intercept:(c,s)=>{if(c.path.endsWith('/details')){Object.assign(s.rooms[0],c.body,{revision:4});return pending.promise;}}});await h.click('[data-act=edit-room]');h.input('name','One saved plan');h.submit();h.submit();await tick();assert.equal(h.calls.filter(x=>x.path.endsWith('/details')).length,1);pending.resolve({ok:true,revision:4});await tick();assert(!h.el('#slEditRoom'));
});
test('unconfirmed server response never claims save success or discards the draft',async t=>{const h=await harness(t,{intercept:c=>c.path.endsWith('/details')?{ok:false,error:'Not saved'}:undefined});await h.click('[data-act=edit-room]');h.input('name','Keep my name');h.submit();await tick();assert.equal(h.el('#slEditName').value,'Keep my name');assert.equal(h.state.rooms[0].name,'Friday dinner');assert(!h.el('#slPlanStatus').textContent.includes('saved'));});
test('account change clears drafts and drops delayed old-account save completions',async t=>{
 const pending=defer();const h=await harness(t,{intercept:c=>c.path.endsWith('/details')?pending.promise:undefined});await h.click('[data-act=edit-room]');h.input('name','A_PRIVATE_DRAFT');h.submit();await tick();h.state.rooms[0].name='Account B saved plan';await h.change('FICTIONAL_B');assert(!h.w.document.body.textContent.includes('A_PRIVATE_DRAFT'));pending.resolve({ok:true,revision:4});await tick();await h.click('[data-act=open-room][data-room="'+rid+'"]');await h.click('[data-act=edit-room]');assert.equal(h.el('#slEditName').value,'Account B saved plan');assert(!h.w.document.body.textContent.includes('A_PRIVATE_DRAFT'));
});
test('owner can recover a restricted plan without rendering restricted identity or private details',async t=>{
 const h=await harness(t,{state:{restricted:true}});assert.match(h.el('#slRoomDetail').textContent,/Manage unavailable plan/);assert.match(h.el('#slRoomDetail').textContent,/Unavailable member/);assert(!h.el('#slRoomDetail').textContent.includes('MUST_NOT_SHOW'));assert(!h.el('#slRoomDetail').textContent.includes('Meet by the entrance'));assert(!h.el('#slEditRoom'));assert(h.calls.some(c=>c.path.endsWith('/manage-members')));
 await h.click('[data-act=remove-managed-member]');assert.equal(h.calls.filter(c=>c.method==='DELETE').length,1);assert.match(h.el('#slRoomDetail').textContent,/Meet by the entrance/);assert(!h.el('[data-act=remove-managed-member]'));assert.match(h.el('#slPlanStatus').textContent,/votes and access were removed/);
});
test('restricted-plan cancellation uses management revision and does not imply external cancellation',async t=>{const h=await harness(t,{state:{restricted:true}});await h.click('[data-act=cancel-managed-room]');const c=h.calls.find(c=>c.path.endsWith('/state'));assert.deepEqual(c.body,{state:'cancelled',revision:3});assert.equal(h.state.rooms[0].state,'cancelled');assert.match(h.el('#slPlanStatus').textContent,/does not cancel any venue reservation or ticket/);assert(!h.el('[data-act=cancel-managed-room]'));});
test('stale management revision refreshes safe management without an automatic cancellation retry',async t=>{const h=await harness(t,{state:{restricted:true}});h.state.rooms[0].revision++;await h.click('[data-act=cancel-managed-room]');assert.equal(h.calls.filter(c=>c.path.endsWith('/state')).length,1);assert.equal(h.state.rooms[0].state,'planning');assert.match(h.el('#slRoomDetail').textContent,/Manage unavailable plan/);await h.click('[data-act=cancel-managed-room]');assert.equal(h.state.rooms[0].state,'cancelled');assert.equal(h.calls.filter(c=>c.path.endsWith('/state'))[1].body.revision,4);});
test('non-owner and failed owner-management requests never show recovery controls or roster data',async t=>{
 const h=await harness(t,{state:{restricted:true,owner:false}});assert.match(h.el('#slRoomDetail').textContent,/Plan unavailable/);assert(!h.el('[data-act=remove-managed-member]'));assert(!h.el('[data-act=cancel-managed-room]'));assert(!h.w.document.body.textContent.includes('MUST_NOT_SHOW'));
 const a=await harness(t,{state:{restricted:true},intercept:c=>{if(c.path.endsWith('/manage-members'))throw error('Outage',503);}});assert.match(a.el('#slRoomDetail').textContent,/Plan unavailable/);assert(!a.el('[data-act=cancel-managed-room]'));
});
test('late management responses cannot replace another selected room or another account',async t=>{
 const pending=defer();const h=await harness(t,{state:{restricted:true},intercept:(c,s)=>{if(c.path.endsWith('/manage-members'))return pending.promise;if(c.path==='/rooms/'+other)return{room:{...s.rooms[1]}};}});await h.click('[data-act=open-room][data-room="'+other+'"]');pending.resolve({members:[{id:member,display_name:'OLD_PRIVATE_MEMBER',status:'accepted',restricted:false}],revision:3});await tick();assert.match(h.el('#slRoomDetail').textContent,/Saturday music/);assert(!h.w.document.body.textContent.includes('OLD_PRIVATE_MEMBER'));
 const second=defer();const a=await harness(t,{state:{restricted:true},intercept:c=>c.path.endsWith('/manage-members')?second.promise:undefined});a.state.restricted=false;await a.change('FICTIONAL_B');second.resolve({members:[{id:member,display_name:'OLD_PRIVATE_MEMBER',status:'accepted',restricted:false}],revision:3});await tick();assert(!a.w.document.body.textContent.includes('OLD_PRIVATE_MEMBER'));
});
test('plan editor and management labels escape stored text rather than executing it',async t=>{const h=await harness(t,{state:{rooms:[room(rid,'<img src=x onerror=alert(1)>')]}});await h.click('[data-act=edit-room]');assert.equal(h.el('#slEditName').value,'<img src=x onerror=alert(1)>');assert(!h.el('#slRoomDetail img'));const a=await harness(t,{state:{restricted:true,manageMembers:[{id:member,display_name:'<script>alert(1)</script>',status:'accepted',restricted:false}]}});assert(!a.el('#slRoomDetail script'));assert.match(a.el('#slRoomDetail').textContent,/<script>alert\(1\)<\/script>/);});

test('management does not label stale list metadata as the current plan state',async t=>{const h=await harness(t,{state:{restricted:true},intercept:(c,s)=>{if(c.path.endsWith('/manage-members')){s.rooms[0].revision++;return{members:[],revision:s.rooms[0].revision};}}});assert.match(h.el('#slRoomDetail').textContent,/Manage unavailable plan/);assert(!h.el('#slRoomDetail').textContent.includes('Your plan: Friday dinner'));});

for(const [label,change] of [
 ['missing details',()=>({id:rid,is_owner:true,revision:4})],
 ['blank name',r=>({...r,name:' '})],
 ['missing description',r=>({...r,description:undefined})],
 ['negative revision',r=>({...r,revision:-1})],
 ['invalid date',r=>({...r,event_date:'2026-02-30'})],
 ['unknown state',r=>({...r,state:'invented'})],
 ['missing options',r=>({...r,options:undefined})],
 ['missing members',r=>({...r,members:undefined})]
])test('malformed reload ('+label+') preserves an unsaved draft',async t=>{
 let malformed=false;const h=await harness(t,{intercept:(c,s)=>malformed&&c.path==='/rooms/'+rid?{room:change({...s.rooms[0]})}:undefined});await h.click('[data-act=edit-room]');h.input('name','Do not erase my draft');h.input('description','Keep my private note');malformed=true;await h.click('[data-act=reload-edit]');assert.equal(h.el('#slEditName').value,'Do not erase my draft');assert.equal(h.el('#slEditDescription').value,'Keep my private note');assert.match(h.el('#slRoomEditStatus').textContent,/draft is unchanged/);assert(!h.el('#slRoomEditStatus').textContent.includes('previous draft was replaced'));
});
test('malformed readback after a confirmed edit preserves the draft without false success',async t=>{let wrote=false;const h=await harness(t,{intercept:c=>{if(c.path.endsWith('/details'))wrote=true;else if(wrote&&c.path==='/rooms/'+rid)return{room:{id:rid,is_owner:true,revision:4}};}});await h.click('[data-act=edit-room]');h.input('name','Confirmed draft');h.submit();await tick();assert.equal(h.el('#slEditName').value,'Confirmed draft');assert.match(h.el('#slRoomEditStatus').textContent,/could not be read back/);assert(!h.el('#slPlanStatus').textContent.includes('saved and read back'));});
test('management roster without an explicit restricted flag is rejected instead of showing identity',async t=>{const h=await harness(t,{state:{restricted:true,manageMembers:[{id:member,status:'accepted',display_name:'MUST_NOT_SHOW_PRIVATE_IDENTITY'}]}});assert.match(h.el('#slRoomDetail').textContent,/Plan unavailable/);assert(!h.w.document.body.textContent.includes('MUST_NOT_SHOW'));assert(!h.el('[data-act=remove-managed-member]'));});
