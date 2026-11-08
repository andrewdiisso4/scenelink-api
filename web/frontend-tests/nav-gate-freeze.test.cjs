const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm');
const candidate=fs.readFileSync(require('path').join(__dirname,'../frontend/js/sl-nav-gate.js'),'utf8');
const baseline=fs.readFileSync(require('path').join(__dirname,'fixtures/nav-gate-before-freeze.js'),'utf8');
function harness(source){
 let user={display_name:'Known user'}, name='Known user',src='data:avatar',writes=0,observer=null,active=false,records=[],timers=[],events={};
 const inside={nodeType:1,closest:()=>existing},outside={nodeType:1,closest:()=>null};
 const nm={get textContent(){return name},set textContent(v){name=v;writes++;if(active)records.push({target:inside,type:'childList'})}};
 const avatar={get src(){return src},set src(v){src=v},getAttribute:()=>src,setAttribute:(k,v)=>{src=v}};
 const existing={querySelector:s=>s==='.sl-ud-name'?nm:s==='.sl-ud-avatar'?avatar:null};
 const context={document:{body:outside,readyState:'complete',querySelectorAll:()=>[],getElementById:()=>existing},localStorage:{getItem:()=>null},SLAuth:{isLoggedIn:()=>true,getUser:()=>user},SL_AVATAR:{local:()=> 'data:avatar'},MutationObserver:function(cb){observer=cb;this.observe=()=>active=true;this.disconnect=()=>active=false;},setTimeout:(cb,delay)=>{const t={cb,delay};timers.push(t);return t},clearTimeout:t=>{timers=timers.filter(x=>x!==t)},setInterval:()=>1,clearInterval(){},addEventListener:(n,cb)=>{events[n]=cb}};
 context.window=context;vm.runInNewContext(source,context);
 return {events,get name(){return name},get writes(){return writes},setUser:u=>user=u,mutate:()=>records.push({target:outside,type:'childList'}),deliver(){if(records.length){const batch=records;records=[];observer(batch)}},runTimers(){const q=timers.filter(x=>x.delay===0);timers=timers.filter(x=>x.delay!==0);q.forEach(t=>t.cb());return q.length},get pending(){return records.length},get scheduled(){return timers.filter(x=>x.delay===0).length}};
}
test('regression proves baseline MutationObserver never settles for logged-in user',()=>{const h=harness(baseline);h.mutate();for(let i=0;i<1000;i++)h.deliver();assert(h.pending>0);assert(h.writes>=1000)});
test('same-name logged-in mutation burst coalesces to one task and settles',()=>{const h=harness(candidate);for(let i=0;i<1000;i++){h.mutate();h.deliver()}assert.equal(h.scheduled,1);assert.equal(h.runTimers(),1);h.deliver();assert.equal(h.pending,0);assert.equal(h.scheduled,0);assert.equal(h.writes,0)});
test('canonical auth name change updates once without self-trigger loop',()=>{const h=harness(candidate);h.setUser({display_name:'Changed name'});h.events['sl-auth-changed']();h.events['sl-auth-ready']();assert.equal(h.scheduled,1);h.runTimers();h.deliver();assert.equal(h.name,'Changed name');assert.equal(h.writes,1);assert.equal(h.pending,0);assert.equal(h.scheduled,0)});
test('malicious display name remains literal text and markup encoder escapes all delimiters',()=>{const h=harness(candidate);const input='"><img src=x onerror=alert(1)>&\'';h.setUser({display_name:input});h.events['sl-auth-changed']();h.runTimers();h.deliver();assert.equal(h.name,input);assert.equal(h.writes,1);let code=candidate.slice(candidate.indexOf('  function escapeHtml'),candidate.indexOf('  function applyGate'));const c={};vm.createContext(c);vm.runInContext(code,c);assert.equal(c.escapeHtml(input),'&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&amp;&#39;');assert(candidate.includes("escapeHtml(avatar)"));});
test('active bundle contains exactly repaired nav-gate module',()=>{const s=fs.readFileSync(require('path').join(__dirname,'../frontend/js/sl-bundle-7d.js'),'utf8'),m='/* === js/sl-nav-gate.js === */',a=s.indexOf(m)+m.length,b=s.indexOf('/* === js/',a);assert.equal(s.slice(a,b).trim(),candidate.trim())});

// Small DOM model for real mount/remove/listener paths. Every text/markup mutation
// records childList notifications; draining is capped to detect runaway callbacks.
function transitionHarness(){
 let logged=true,user={display_name:'First user'},dropdown=null,records=[],timers=[],observer,observing=false,mounts=0,unmounts=0,logoutCalls=0;
 const events={},docEvents={};
 const record=target=>{if(observing)records.push({type:'childList',target})};
 const classes=initial=>{const set=new Set(initial||[]);return{contains:k=>set.has(k),add:k=>set.add(k),remove:k=>set.delete(k),toggle:k=>{if(set.has(k)){set.delete(k);return false;}set.add(k);return true;}}};
 const outside={nodeType:1,closest:()=>null};
 const anchor={...outside,classList:classes(['nav-right']),appendChild(node){dropdown=node;mounts++;record(outside);}};
 function makeWrap(){
  const wrap={nodeType:1,id:'',classList:classes(),_html:'',closest:()=>wrap,contains:node=>node===wrap||node===trigger,remove(){if(dropdown===wrap){dropdown=null;unmounts++;record(outside)}},querySelector(selector){return selector==='.sl-ud-name'?name:selector==='.sl-ud-avatar'?avatar:selector==='.sl-ud-trigger'?trigger:selector==='[data-sl-logout]'?logout:selector==='[data-sl-admin-link]'&&wrap._html.includes('data-sl-admin-link')?{}:null;}};
  const makeControl=()=>({events:{},attrs:{},addEventListener(n,cb){this.events[n]=cb},setAttribute(k,v){this.attrs[k]=v},fire(n,e={}){return this.events[n]?.(e)}});
  const trigger=makeControl(),logout=makeControl();let txt='',src='';
  const name={get textContent(){return txt},set textContent(v){txt=v;record(wrap)}};
  const avatar={get src(){return src},set src(v){src=v},getAttribute:()=>src,setAttribute:(k,v)=>{src=v}};
  Object.defineProperty(wrap,'innerHTML',{get:()=>wrap._html,set:v=>{wrap._html=v;txt=(v.match(/class="sl-ud-name">([^<]*)<\//)||[])[1]||'';src=(v.match(/class="sl-ud-avatar" src="([^"]*)"/)||[])[1]||'';record(wrap)}});
  return wrap;
 }
 const document={body:outside,readyState:'complete',querySelectorAll:()=>[],getElementById:id=>id==='sl-user-dropdown'?dropdown:null,querySelector:s=>s==='.nav-right'?anchor:null,createElement:()=>makeWrap(),addEventListener:(n,cb)=>(docEvents[n]??=[]).push(cb)};
 const context={document,location:{href:'/explore'},localStorage:{getItem:()=>null,removeItem(){}},SLAuth:{isLoggedIn:()=>logged,getUser:()=>user,logout(){logoutCalls++;logged=false;user=null;return Promise.resolve({ok:true})}},SL_AVATAR:{local:()=> 'data:avatar'},MutationObserver:function(cb){observer=cb;this.observe=()=>observing=true;this.disconnect=()=>observing=false;},setTimeout:(cb,delay)=>{const t={cb,delay};timers.push(t);return t},clearTimeout:t=>{timers=timers.filter(x=>x!==t)},setInterval:()=>1,clearInterval(){},CustomEvent:function(type){this.type=type},addEventListener:(n,cb)=>(events[n]??=[]).push(cb),dispatchEvent:e=>(events[e.type]||[]).forEach(cb=>cb(e))};context.window=context;
 vm.runInNewContext(candidate,context);
 function drain(){let turns=0;while((records.length||timers.some(t=>t.delay===0))&&turns<100){turns++;if(records.length){const r=records;records=[];observer(r)}const q=timers.filter(t=>t.delay===0);timers=timers.filter(t=>t.delay!==0);q.forEach(t=>t.cb())}assert(turns<100,'DOM/observer queue failed to settle');return turns;}
 drain();
 return{context,docEvents,get dropdown(){return dropdown},get mounts(){return mounts},get unmounts(){return unmounts},get logoutCalls(){return logoutCalls},auth(inState,event='sl-auth-changed'){logged=inState;user=inState?{display_name:'Returned user'}:null;context.dispatchEvent({type:event});return drain()},emit:event=>{context.dispatchEvent({type:event});return drain()},drain};
}
test('hotfix logout/login transition removes then remounts exactly one dropdown',()=>{const h=transitionHarness();assert(h.dropdown);assert.equal(h.mounts,1);h.auth(false);assert.equal(h.dropdown,null);assert.equal(h.unmounts,1);h.auth(true);assert(h.dropdown);assert.equal(h.mounts,2);assert.equal(h.dropdown.querySelector('.sl-ud-name').textContent,'Returned user')});
test('hotfix repeated mount/unmount stays finite across 50 auth cycles',()=>{const h=transitionHarness();for(let i=0;i<50;i++){h.auth(false);assert.equal(h.dropdown,null);h.auth(true);assert(h.dropdown)}assert.equal(h.mounts,51);assert.equal(h.unmounts,50)});
test('legacy colon auth/login/logout events retain finite navigation updates',()=>{const h=transitionHarness();h.auth(false,'sl:logout');assert.equal(h.dropdown,null);h.auth(true,'sl:login-success');assert(h.dropdown);h.auth(false,'sl:auth-changed');assert.equal(h.dropdown,null);h.auth(true,'sl:auth-changed');assert(h.dropdown);h.emit('sl:login-success');assert.equal(h.mounts,3)});
test('dropdown preserves navigation destinations, open/close behavior and delegates logout once',async()=>{const h=transitionHarness(),wrap=h.dropdown;for(const href of ['profile.html','messages.html','my-lists.html','plan-with-friends.html','social-feed.html'])assert(wrap.innerHTML.includes('href="'+href+'"'));const trigger=wrap.querySelector('.sl-ud-trigger');let stopped=0;trigger.fire('click',{stopPropagation:()=>stopped++});assert(wrap.classList.contains('open'));assert.equal(trigger.attrs['aria-expanded'],'true');h.docEvents.keydown.forEach(cb=>cb({key:'Escape'}));assert(!wrap.classList.contains('open'));assert.equal(trigger.attrs['aria-expanded'],'false');let prevented=0;wrap.querySelector('[data-sl-logout]').fire('click',{preventDefault:()=>prevented++});await new Promise(resolve=>setImmediate(resolve));h.drain();assert.equal(h.logoutCalls,1);assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(h.context.location.href,'index.html');assert.equal(h.dropdown,null)});
