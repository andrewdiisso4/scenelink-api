const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boundedTransport } = require('../src/services/event-provider-control');
const url = 'https://app.ticketmaster.com/discovery/v2/events.json?apikey=fictional';
const response = (status, headers = {}) => ({ status, ok: status === 200,
  headers: { get: key => headers[key] ?? null }, body: { cancel: async () => {} } });

test('transient failures retry within three attempts and charge each attempt', async () => {
  let calls=0,reservations=0; const delays=[];
  const get=boundedTransport({reserve:async()=>reservations++,pause:async ms=>delays.push(ms),fetchImpl:async(_url,init)=>{
    assert.equal(init.redirect,'error');assert.equal(init.method,'GET');assert.ok(init.signal);
    return response(++calls===3?200:503);
  }});
  assert.equal((await get(url)).status,200);assert.equal(calls,3);assert.equal(reservations,3);
  assert.deepEqual(delays,[550,500,550,1000,550]);
});
test('Retry-After short delay honored; long/date/invalid value not retried early', async () => {
  for(const after of ['60','garbage','Sun, 01 Nov 2026 12:01:00 GMT']) {
    let calls=0;
    const get=boundedTransport({reserve:async()=>{},pause:async()=>{},now:()=>Date.parse('2026-11-01T12:00:00Z'),fetchImpl:async()=>{calls++;return response(429,{'retry-after':after});}});
    assert.equal((await get(url)).status,429);assert.equal(calls,1);
  }
  const delays=[];let count=0;
  const get=boundedTransport({reserve:async()=>{},pause:async ms=>delays.push(ms),fetchImpl:async()=>++count===1?response(429,{'retry-after':'1'}):response(200)});
  assert.equal((await get(url)).status,200);assert.deepEqual(delays,[550,1000,550]);
});
test('exhausted local/provider budgets stop calls, auth errors do not retry', async () => {
  const denied=boundedTransport({reserve:async()=>{throw Error('budget');},fetchImpl:()=>assert.fail('network')});
  await assert.rejects(denied(url),/budget/);
  let calls=0;const get=boundedTransport({reserve:async()=>{},pause:async()=>{},fetchImpl:async()=>{calls++;return response(200,{'rate-limit-available':'0'});}});
  await get(url);await assert.rejects(get(url),/quota/);assert.equal(calls,1);
  let authCalls=0;const auth=boundedTransport({reserve:async()=>{},pause:async()=>{},fetchImpl:async()=>{authCalls++;return response(401);}});
  assert.equal((await auth(url)).status,401);assert.equal(authCalls,1);
});
test('network errors bounded and redacted; unsafe hosts fail before quota or fetch', async () => {
  let count=0;
  const get=boundedTransport({reserve:async()=>{},pause:async()=>{},fetchImpl:async()=>{count++;throw Error(url);}});
  await assert.rejects(get(url),e=>!e.message.includes('apikey'));assert.equal(count,3);
  await assert.rejects(get('https://other.invalid/events'),/Unsupported/);assert.equal(count,3);
});

test('only official GET search and detail endpoints can consume quota', async () => {
  let reserves=0, calls=0;
  const get=boundedTransport({reserve:async()=>reserves++,pause:async()=>{},fetchImpl:async()=>{calls++;return response(200);}});
  for (const url of ['https://app.ticketmaster.com/discovery/v2/events-elsewhere.json',
    'https://app.ticketmaster.com/discovery/v2/events.json#unexpected',
    'https://user:pass@app.ticketmaster.com/discovery/v2/events.json',
    'http://app.ticketmaster.com/discovery/v2/events.json']) await assert.rejects(get(url), /Unsupported/);
  await assert.rejects(get('https://app.ticketmaster.com/discovery/v2/events.json', {method:'POST'}), /Unsupported/);
  assert.equal(reserves,0); assert.equal(calls,0);
  await get('https://app.ticketmaster.com/discovery/v2/events/Fictional_123.json');
  assert.equal(reserves,1); assert.equal(calls,1);
});
