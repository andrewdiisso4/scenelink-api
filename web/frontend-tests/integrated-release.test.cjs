'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../frontend');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('integrated My Lists retains official branding and accessible footer around server-owned contents', () => {
  const dom = new JSDOM(read('my-lists.html'));
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('main#slConnectedLists').length, 1);
    assert(doc.querySelector('header .sl-brand-wordmark'));
    assert(doc.querySelector('footer [data-sl-newsletter] label'));
    assert.equal(doc.documentElement.dataset.slDesign, 'unified');
    assert(!doc.body.hasAttribute('data-sl-requires-auth'));
    assert(!doc.querySelector('#listsApp, #listsLoggedOut'));
    const scripts = [...doc.scripts].map(s => s.getAttribute('src') || '');
    assert.equal(scripts.filter(s => /\/sl-connected-lists\.js\?/.test(s)).length, 1);
    assert(scripts.findIndex(s => /\/sl-connected-api\.js\?/.test(s)) < scripts.findIndex(s => /\/sl-connected-lists\.js\?/.test(s)));
  } finally { dom.window.close(); }
});

test('integrated cache contains both design resources and the paired list runtime', () => {
  const sw = read('sw.js');
  const shell = sw.match(/const SHELL_URLS = \[([\s\S]*?)\];/)[1];
  for (const asset of [
    '/js/sl-connected-lists.js?v=connected-20261109-2',
    '/css/sl-design-system.css?v=connected-20261109-2',
    '/images/brand/scenelink-wordmark.png',
    '/images/brand/scenelink-full.png',
  ]) assert(shell.includes("'" + asset + "'"), asset);
  const finalizer = fs.readFileSync(path.resolve(root, '../frontend-tools/finalize.py'), 'utf8');
  assert(finalizer.includes("'sl-connected-lists'"));
  assert(finalizer.includes("'requires_paired_backend':True"));
  assert(finalizer.includes("'status':'local_candidate_not_deployed'"));
});
