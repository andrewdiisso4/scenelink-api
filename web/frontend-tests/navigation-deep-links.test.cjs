'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../frontend');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const source = read('js/smart-routing.js');
const bundle = read('js/sl-bundle-7d-ui.js');
const marker = '/* === js/smart-routing.js === */';
const start = bundle.indexOf(marker) + marker.length;
const end = bundle.indexOf('/* === js/', start);
const embedded = bundle.slice(start, end < 0 ? undefined : end).trim();
test('loaded UI bundle smart-router block exactly matches canonical source', () => assert.equal(embedded, source.trim()));
for (const [label, code] of [['canonical', source], ['loaded bundle block', embedded]]) {
  test(label + ' rewrites only exact same-origin aliases and preserves query/hash', async () => {
    const d = new JSDOM('<main></main>', { url: 'https://scenelink.test/', runScripts: 'outside-only' });
    const w = d.window;
    await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    const cases = [
      ['/explore?neighborhood=Back+Bay#map', '/explore.html?neighborhood=Back+Bay#map'],
      ['explore?neighborhood=North%20End&vibe=a%2Bb#results', '/explore.html?neighborhood=North%20End&vibe=a%2Bb#results'],
      ['https://scenelink.test/profile-v2.html?user=abc#photos', '/profile.html?user=abc#photos'],
      ['/profile?user=abc#social', '/profile.html?user=abc#social'],
      ['//scenelink.test/group-planning?room=123#votes', '/plan-with-friends.html?room=123#votes'],
      ['/my-lists?list=123#venues', '/my-lists.html?list=123#venues'],
      ['/lists?list=123#venues', '/my-lists.html?list=123#venues'],
      ['/social?user=abc#post-42', '/social-feed.html?user=abc#post-42'],
      ['/explore.html?neighborhood=Seaport#map', '/explore.html?neighborhood=Seaport#map'],
      ...['https://elsewhere.test/explore?neighborhood=Back+Bay#map', '//elsewhere.test/lists',
        'https://elsewhere.test/profile-v2.html?user=abc', 'https://elsewhere.test/group-planning',
        'https://elsewhere.test/social', 'https://scenelink.test.evil.test/explore',
        '/unrelated?next=explore', '/explore-more', '/nested/explore', '#social-feed', '#explore',
        'mailto:explore@example.test', 'tel:123', 'javascript:void(0)', '/unrelated', '/lists-v2.html',
        'http://scenelink.test/explore', 'https://user:pass@scenelink.test/explore'].map(href => [href, href])
    ];
    for (const [href] of cases) {
      const a = w.document.createElement('a'); a.setAttribute('href', href);
      a.textContent = 'Group planning'; a.title = 'Social Feed'; w.document.body.append(a);
    }
    w.eval(code + '\nwindow.smartRouter = new SmartRouter();');
    try {
      [...w.document.querySelectorAll('a')].forEach((a, i) => assert.equal(a.getAttribute('href'), cases[i][1], cases[i][0]));
      w.eval('smartRouter.updateAllNavigationLinks()');
      [...w.document.querySelectorAll('a')].forEach((a, i) => assert.equal(a.getAttribute('href'), cases[i][1], 'idempotent: ' + cases[i][0]));
      const supported = w.document.querySelector('a');
      w.eval('smartRouter.navigateTo = function () { window.testNavigations = (window.testNavigations || 0) + 1; }');
      for (const options of [{ctrlKey:true}, {metaKey:true}, {shiftKey:true}, {altKey:true}, {button:1}]) {
        const event = new w.MouseEvent('click', { bubbles:true, cancelable:true, ...options });
        supported.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
      }
      for (const attr of ['download','target']) {
        supported.setAttribute(attr, attr === 'target' ? '_blank' : '');
        const event = new w.MouseEvent('click', { bubbles:true, cancelable:true });
        supported.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
        supported.removeAttribute(attr);
      }
      supported.click(); assert.equal(w.testNavigations, 1);
      for (const a of [...w.document.querySelectorAll('a')].slice(9)) {
        assert.equal(w.smartRouter.shouldIntercept(a.getAttribute('href')), false, a.getAttribute('href'));
        // Avoid actual navigation while verifying router leaves these clicks alone.
        const event = new w.MouseEvent('click', { bubbles:true, cancelable:true });
        a.addEventListener('click', e => e.preventDefault(), { once:true });
        a.dispatchEvent(event);
      }
      assert.equal(w.testNavigations, 1);
      assert.equal(w.eval('smartRouter.shouldIntercept("//elsewhere.test/explore")'), false);
      assert.equal(w.eval('smartRouter.shouldIntercept("#photos")'), false);
    } finally { w.close(); }
  });
}
