'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const frontend = path.join(__dirname, '../frontend');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');
const origin = 'https://scenelink.test';
const marker = 'connected-20261124-release-audit';
const controller = read('admin.html').match(/src="([^"]*js\/sl-admin-portal\.js[^"]*)"/)[1];

test('the reconciled admin asset keeps a unique cache key, hotfix provenance and the paired release contract', () => {
  assert.equal(controller, 'js/sl-admin-portal.js?v=' + marker);
  const metadata = JSON.parse(read('version.json'));
  assert.equal(metadata.admin_controller_cache_key, marker);
  assert.equal(metadata.admin_auth_hotfix.id, 'connected-20261124-admin-access');
  assert.equal(metadata.admin_auth_hotfix.source_frontend_base, 'db579dbca96d57edcca5a36cb3d009c1724f2262');
  assert.equal(metadata.admin_auth_hotfix.source_commit, '252da477e254e48416eb764b144e78e6544ed583');
  assert.equal(metadata.admin_auth_hotfix.merged_main_commit, '0741fc91105ce886984c9888b64b6f7a90864ff6');
  assert.equal(metadata.admin_auth_hotfix.pull_request, 40);
  assert.equal(metadata.requires_paired_backend, true);
  assert.equal(metadata.rollout_order, 'paired_backend_then_frontend');
  assert.equal(metadata.required_migration, '016_private_list_invitations.sql');
  // The shared shell is unchanged; only the updated admin controller gets a new key.
  assert.equal(metadata.sw_version, 'sl-connected-20261123-release-acceptance');
});

test('the candidate service worker fetches the new admin URL despite prior production and candidate controllers being cached', async () => {
  const listeners = {};
  const priorMarkers = ['connected-20261124-admin-reconciled', 'connected-20261119-been-with-friends', 'connected-20261124-admin-access', 'connected-20261123-release-acceptance'];
  const oldURLs = priorMarkers.map(value => origin + '/js/sl-admin-portal.js?v=' + value);
  const newURL = new URL(controller, origin + '/admin.html').href;
  const cached = new Map(oldURLs.map(url => [url, new Response('old-controller')]));
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
      return new Response('reconciled-controller');
    },
  });
  let completion;
  listeners.fetch({request:new Request(newURL),respondWith:promise=>{completion=promise;}});
  assert.equal(await (await completion).text(),'reconciled-controller');
  assert.equal(fetched,1);
  for (const oldURL of oldURLs) assert.equal(await cached.get(oldURL).text(),'old-controller');
  assert.equal(await cached.get(newURL).text(),'reconciled-controller');
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
