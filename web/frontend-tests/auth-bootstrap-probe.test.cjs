'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, '../frontend/js', name), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const userA = {id:'fictional-A',display_name:'Cached A'};
const userB = {id:'fictional-B',display_name:'Current B'};

// Evaluate the actual API/auth source modules in their deployed order. All
// transport responses and timers are controlled; no network or backend runs.
function fixture({signedIn = true} = {}) {
  const values = new Map(), listeners = new Map(), requests = [], events = [], timers = new Map();
  let timerId = 0;
  const storage = {
    getItem:key => values.get(key) ?? null,
    setItem:(key,value) => values.set(key,String(value)),
    removeItem:key => values.delete(key)
  };
  if (signedIn) {
    storage.setItem('sl_jwt_token','fictional-session-A');
    storage.setItem('sl_user_cache',JSON.stringify({user:userA}));
  }
  const w = {
    localStorage:storage,console:{log(){}},AbortController,location:{href:'/profile'},
    CustomEvent:class { constructor(type,options) { this.type=type;this.detail=options?.detail; } },
    addEventListener(type,listener) {
      if (!listeners.has(type)) listeners.set(type,new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type,listener) { listeners.get(type)?.delete(listener); },
    dispatchEvent(event) {
      events.push(event);
      for (const listener of listeners.get(event.type) || []) listener(event);
    },
    setTimeout(fn,ms) { const id=++timerId;timers.set(id,{fn,ms});return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url,options) {
      const pending=Promise.withResolvers();
      requests.push({url,options,
        respond(body,status=200) {
          pending.resolve({ok:status>=200&&status<300,status,
            json:async()=>body,text:async()=>JSON.stringify(body)});
        },
        reject() { pending.reject(new TypeError('Fictional network interruption')); },
        unreadable() {
          const fail=async()=>{throw new SyntaxError('Fictional unreadable body');};
          pending.resolve({ok:true,status:200,json:fail,text:fail});
        }
      });
      return pending.promise;
    }
  };
  w.window=w;
  const context=vm.createContext(w);
  for (const name of ['sl-api.js','sl-auth-core.js']) vm.runInContext(source(name),context,{filename:name});
  for (const [id,timer] of [...timers]) if (timer.ms===0) { timers.delete(id);timer.fn(); }
  const probes=requests.filter(request=>request.url==='/api/auth/me');
  function external(token,user) {
    const oldValue=storage.getItem('sl_jwt_token');
    if (token) storage.setItem('sl_jwt_token',token); else storage.removeItem('sl_jwt_token');
    if (user) storage.setItem('sl_user_cache',JSON.stringify({user})); else storage.removeItem('sl_user_cache');
    w.dispatchEvent({type:'storage',key:'sl_jwt_token',oldValue,newValue:token});
  }
  function loginB() {
    const pending=w.SLAuth.login('b@example.invalid','fictional-password');
    const request=requests.find(request=>request.url==='/api/auth/login');
    return {pending,reply:()=>request.respond({token:'fictional-session-B',user:userB})};
  }
  return {w,storage,requests,events,probes,external,loginB,
    ready:()=>events.filter(event=>event.type==='sl-auth-ready'),
    changes:()=>events.filter(event=>event.type==='sl-auth-changed')};
}

test('signed-out bootstrap does not probe or announce an account',()=>{
  const f=fixture({signedIn:false});
  assert.equal(f.requests.length,0);
  assert.equal(f.w.SLAuth.user(),null);
  assert.equal(f.ready().length,0);
});

test('one current bootstrap refresh preserves the legacy account-ready contract',async()=>{
  const f=fixture(),fresh={...userA,display_name:'Confirmed A'};
  for (const probe of f.probes) {
    assert.equal(probe.options.headers.Authorization,'Bearer fictional-session-A');
    probe.respond({user:fresh});
  }
  await settle();
  assert.equal(f.w.SLAuth.token(),'fictional-session-A');
  assert.equal(f.w.SLAuth.user().display_name,'Confirmed A');
  assert.equal(f.w.SL_USER.display_name,'Confirmed A');
  assert.equal(f.ready().length,1);
  assert.equal(f.ready()[0].detail.user.id,userA.id);
  assert.equal(f.probes.length,1,'The canonical auth core owns startup validation');
});

for (const outcome of [429,500,503,'network','unreadable','malformed']) {
  test('bootstrap '+outcome+' does not erase the current session or announce unconfirmed identity',async()=>{
    const f=fixture();
    for (const probe of f.probes) {
      if (outcome==='network') probe.reject();
      else if (outcome==='unreadable') probe.unreadable();
      else probe.respond(outcome==='malformed'?{}:{error:'Fictional temporary failure'},typeof outcome==='number'?outcome:200);
    }
    await settle();
    assert.equal(f.w.SLAuth.token(),'fictional-session-A');
    assert.equal(f.w.SLAuth.user().id,userA.id);
    assert.equal(JSON.parse(f.storage.getItem('sl_user_cache')).user.id,userA.id);
    assert.equal(f.w.SL_USER,undefined);
    assert.equal(f.ready().length,0);
    assert.equal(f.changes().length,0);
  });
}

for (const status of [401,403]) {
  test('current bootstrap '+status+' still clears the invalid session and cache',async()=>{
    const f=fixture();
    for (const probe of f.probes) probe.respond({error:'Fictional invalid session'},status);
    await settle();
    assert.equal(f.w.SLAuth.token(),'');
    assert.equal(f.w.SLAuth.user(),null);
    assert.equal(f.storage.getItem('sl_user_cache'),null);
    assert.equal(f.ready().length,0);
    assert.equal(f.changes().length,1);
    assert.equal(f.changes()[0].detail.authed,false);
  });
}

for (const status of [200,401,403]) {
  test('older bootstrap '+status+' cannot replace or clear a newer successful login',async()=>{
    const f=fixture(),login=f.loginB();
    login.reply();await login.pending;
    const changes=f.changes().length;
    for (const probe of f.probes) probe.respond(status===200?{user:userA}:{error:'Fictional old session'},status);
    await settle();
    assert.equal(f.w.SLAuth.token(),'fictional-session-B');
    assert.equal(f.w.SLAuth.user().id,userB.id);
    assert.equal(JSON.parse(f.storage.getItem('sl_user_cache')).user.id,userB.id);
    assert.equal(f.w.SL_USER,undefined,'Old identity is not published to legacy consumers');
    assert.equal(f.ready().length,0);
    assert.equal(f.changes().length,changes);
  });
}

test('a bootstrap failure during a pending login cannot supersede that login',async()=>{
  const f=fixture(),login=f.loginB();
  const outcome=login.pending.then(value=>({value}),error=>({error}));
  for (const probe of f.probes) probe.respond({error:'Fictional old session'},401);
  await settle();
  assert.equal(f.w.SLAuth.token(),'fictional-session-A');
  login.reply();
  const result=await outcome;
  assert.equal(result.error,undefined);
  assert.equal(result.value.id,userB.id);
  assert.equal(f.w.SLAuth.token(),'fictional-session-B');
  assert.equal(f.ready().length,0);
});

for (const status of [200,401]) {
  test('bootstrap '+status+' remains stale after a cross-tab switch away and back',async()=>{
    const f=fixture();
    f.external('fictional-session-B',userB);
    f.external('fictional-session-A',{...userA,display_name:'Newer A'});
    const changes=f.changes().length;
    for (const probe of f.probes) probe.respond(status===200?{user:userA}:{error:'Fictional old session'},status);
    await settle();
    assert.equal(f.w.SLAuth.token(),'fictional-session-A');
    assert.equal(f.w.SLAuth.user().display_name,'Newer A');
    assert.equal(f.w.SL_USER,undefined);
    assert.equal(f.ready().length,0);
    assert.equal(f.changes().length,changes);
  });
}
