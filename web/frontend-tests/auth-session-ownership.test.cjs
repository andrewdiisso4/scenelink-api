const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Only fictional responses are used. The fixture has no network implementation.
const source=()=>fs.readFileSync(path.join(__dirname,'../frontend/js/sl-auth-core.js'),'utf8');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture(){
  const values=new Map(),listeners=new Map(),requests=[],events=[],apiTokens=[],timers=new Map();let timer=0,location='/profile.html';
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),clear:()=>values.clear()};
  const w={localStorage:storage,console:{log(){}},SLApi:{setToken:t=>apiTokens.push(t)},
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    dispatchEvent(e){if(e.type==='sl-auth-changed')events.push(e.detail);for(const fn of listeners.get(e.type)||[])fn(e);},
    location:{get href(){return location;},set href(v){location=v;}},
    CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail;}},
    setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
    setInterval(){throw Error('Unexpected interval');},clearInterval(){},alert(){throw Error('Unexpected alert');},AbortController,
    fetch(url,options){const d=deferred();requests.push({url,options,respond(body,status=200){d.resolve({ok:status>=200&&status<300,status,json:async()=>body});}});return d.promise;}
  };
  w.window=w;vm.runInNewContext(source(),w);
  function external(token,user){
    const oldValue=storage.getItem('sl_jwt_token');
    if(token)storage.setItem('sl_jwt_token',token);else storage.removeItem('sl_jwt_token');
    if(user)storage.setItem('sl_user_cache',JSON.stringify({user}));else storage.removeItem('sl_user_cache');
    w.dispatchEvent({type:'storage',key:'sl_jwt_token',oldValue,newValue:token});
  }
  function reply(index,id){requests[index].respond({token:'fictional-'+id,user:{id,display_name:id}});}
  return {w,storage,requests,events,apiTokens,external,reply,timers,get location(){return location;}};
}
const methods={
  password:w=>w.SLAuth.login('a@example.invalid','fictional-password'),
  signup:w=>w.SLAuth.signup({email:'a@example.invalid',password:'fictional-password',display_name:'A',username:'fictional_a'}),
  google:w=>w.SLAuth.loginWithGoogle('fictional-provider-token'),
  apple:w=>w.SLAuth.loginWithApple({id_token:'fictional-provider-token'})
};
function outcome(p){return p.then(value=>({value}),error=>({error}));}
function superseded(result){assert.equal(result.error?.code,'AUTH_SUPERSEDED');}

for(const [name,start] of Object.entries(methods)){
  test(name+': delayed sign-in cannot undo logout',async()=>{
    const f=fixture(),pending=outcome(start(f.w));await f.w.SLAuth.logout({reload:false});
    const events=f.events.length;f.reply(0,'A');superseded(await pending);
    assert.equal(f.w.SLAuth.token(),'');assert.equal(f.w.SLAuth.user(),null);assert.equal(f.storage.getItem('sl_user_cache'),null);
    assert.equal(f.events.length,events);assert.deepEqual(f.apiTokens,[]);
  });
  test(name+': late response cannot replace a newer successful login',async()=>{
    const f=fixture(),old=outcome(start(f.w)),latest=f.w.SLAuth.login('b@example.invalid','fictional-password');
    f.reply(1,'B');await latest;const events=f.events.length;f.reply(0,'A');superseded(await old);
    assert.equal(f.w.SLAuth.token(),'fictional-B');assert.equal(f.w.SLAuth.user().id,'B');assert.equal(JSON.parse(f.storage.getItem('sl_user_cache')).user.id,'B');
    assert.equal(f.events.length,events);assert.deepEqual(f.apiTokens,['fictional-B']);
  });
  test(name+': current response still authenticates normally',async()=>{
    const f=fixture(),pending=start(f.w);f.reply(0,'A');assert.equal((await pending).id,'A');
    assert.equal(f.w.SLAuth.token(),'fictional-A');assert.equal(f.w.SLAuth.user().id,'A');assert.equal(f.events.length,1);
  });
}
test('newer failed attempt does not permit an older account response to win',async()=>{
  const f=fixture(),old=outcome(methods.password(f.w)),latest=outcome(methods.google(f.w));
  f.requests[1].respond({error:'Provider unavailable'},503);assert.equal((await latest).error.status,503);
  f.reply(0,'A');superseded(await old);assert.equal(f.w.SLAuth.token(),'');assert.equal(f.events.length,0);
});
test('cross-tab account switch invalidates an outstanding sign-in',async()=>{
  const f=fixture(),pending=outcome(methods.password(f.w));f.external('fictional-B',{id:'B'});f.reply(0,'A');superseded(await pending);
  assert.equal(f.w.SLAuth.token(),'fictional-B');assert.equal(f.w.SLAuth.user().id,'B');
});
test('cross-tab switch away and back still invalidates an outstanding sign-in',async()=>{
  const f=fixture();f.external('fictional-A',{id:'A'});const pending=outcome(methods.google(f.w));
  f.external('fictional-B',{id:'B'});f.external('fictional-A',{id:'A'});f.reply(0,'C');superseded(await pending);
  assert.equal(f.w.SLAuth.token(),'fictional-A');assert.equal(f.w.SLAuth.user().id,'A');
});
test('storage.clear invalidates pending sign-in and clears cached user state',async()=>{
  const f=fixture();f.external('fictional-A',{id:'A'});const pending=outcome(methods.password(f.w));
  f.storage.clear();f.w.dispatchEvent({type:'storage',key:null});assert.equal(f.w.SLAuth.user(),null);
  f.reply(0,'B');superseded(await pending);assert.equal(f.w.SLAuth.token(),'');
});
test('signed-out currentUser never returns a lingering profile cache',()=>{
  const f=fixture();f.storage.setItem('sl_user_cache',JSON.stringify({user:{id:'A'}}));assert.equal(f.w.SLAuth.user(),null);
});
for(const status of [200,401,403])test('refresh '+status+' from before an account switch cannot affect the current session',async()=>{
  const f=fixture();f.external('fictional-A',{id:'A'});const pending=f.w.SLAuth.refresh();
  f.external('fictional-B',{id:'B'});f.external('fictional-A',{id:'A',display_name:'Fresh A'});const events=f.events.length;
  f.requests[0].respond(status===200?{user:{id:'A',display_name:'Stale A'}}:{error:'Expired old request'},status);await pending;
  assert.equal(f.w.SLAuth.token(),'fictional-A');assert.equal(f.w.SLAuth.user().display_name,'Fresh A');assert.equal(f.events.length,events);
});
test('pending login owns the session ahead of a previous refresh failure',async()=>{
  const f=fixture();f.external('fictional-A',{id:'A'});const refresh=f.w.SLAuth.refresh(),login=methods.password(f.w);
  f.requests[0].respond({error:'Expired old request'},401);await refresh;f.reply(1,'B');assert.equal((await login).id,'B');assert.equal(f.w.SLAuth.token(),'fictional-B');
});
test('delayed logout completion does not navigate away from a newer login',async()=>{
  const f=fixture();f.external('fictional-A',{id:'A'});const logout=f.w.SLAuth.logout(),login=methods.password(f.w);
  f.reply(1,'B');await login;f.requests[0].respond({revoked:true});await logout;
  assert.equal(f.w.SLAuth.token(),'fictional-B');assert.equal(f.location,'/profile.html');assert.equal(f.timers.size,0);
});
test('ordinary logout still revokes its bearer, clears local data and redirects',async()=>{
  const f=fixture();f.external('fictional-A',{id:'A'});const pending=f.w.SLAuth.logout();assert.equal(f.w.SLAuth.token(),'');
  assert.equal(f.requests[0].options.headers.Authorization,'Bearer fictional-A');f.requests[0].respond({revoked:true});assert.equal((await pending).revoked,true);assert.equal(f.location,'/');assert.equal(f.timers.size,0);
});
