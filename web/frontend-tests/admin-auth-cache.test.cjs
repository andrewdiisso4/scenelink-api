'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const frontend = path.join(__dirname, '../frontend');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');
const origin = 'https://scenelink.test';
const marker = 'connected-20261124-admin-access';
const controller = read('admin.html').match(/src="([^"]*js\/sl-admin-portal\.js[^"]*)"/)[1];

test('the admin-only hotfix has a new immutable script key and declares its existing backend compatibility', () => {
  assert.equal(controller, 'js/sl-admin-portal.js?v=' + marker);
  const metadata = JSON.parse(read('version.json'));
  assert.equal(metadata.admin_auth_hotfix.id, marker);
  assert.equal(metadata.admin_auth_hotfix.frontend_base, 'db579dbca96d57edcca5a36cb3d009c1724f2262');
  assert.equal(metadata.admin_auth_hotfix.compatible_backend, '7b11bc0cd4edd0b1f7ebb8b6af3f3df096b79b7a');
  assert.equal(metadata.admin_auth_hotfix.requires_paired_backend, false);
  // The shared shell is unchanged; only the updated admin controller gets a new key.
  assert.equal(metadata.sw_version, 'sl-connected-20261119-been-with-friends');
});

test('the existing service worker fetches the new admin URL even with the old immutable controller cached', async () => {
  const listeners = {};
  const oldURL = origin + '/js/sl-admin-portal.js?v=connected-20261119-been-with-friends';
  const newURL = new URL(controller, origin + '/admin.html').href;
  const cached = new Map([[oldURL, new Response('old-controller')]]);
  let fetched = 0;
  vm.runInNewContext(read('sw.js'), {
    URL, Response,
    self: {location:{origin},addEventListener:(name,handler)=>{listeners[name]=handler;}},
    caches: {open:async()=>({
      match:async request=>cached.get(request.url),
      put:async(request,response)=>{cached.set(request.url,response);},
    })},
    fetch:async request=>{
      assert.equal(request.url,newURL);fetched++;
      return new Response('hotfix-controller');
    },
  });
  let completion;
  listeners.fetch({request:new Request(newURL),respondWith:promise=>{completion=promise;}});
  assert.equal(await (await completion).text(),'hotfix-controller');
  assert.equal(fetched,1);
  assert.equal(await cached.get(oldURL).text(),'old-controller');
  assert.equal(await cached.get(newURL).text(),'hotfix-controller');
});

test('an online admin reload receives current HTML before selecting the newly versioned controller', async () => {
  const listeners = {};
  let fetched = 0;
  vm.runInNewContext(read('sw.js'), {
    URL,
    self:{location:{origin},addEventListener:(name,handler)=>{listeners[name]=handler;}},
    caches:{match:async()=>assert.fail('online navigation must not reuse cached admin HTML')},
    fetch:async request=>{
      assert.equal(request.url,origin+'/admin.html');fetched++;
      return new Response(read('admin.html'));
    },
  });
  let completion;
  listeners.fetch({
    request:{url:origin+'/admin.html',method:'GET',mode:'navigate',headers:{get:()=>''}},
    respondWith:promise=>{completion=promise;},
  });
  assert.match(await (await completion).text(),new RegExp('sl-admin-portal\\.js\\?v='+marker));
  assert.equal(fetched,1);
});
