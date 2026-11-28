'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../frontend');
for (const [file,label] of [['social-feed','Feed'],['messages','Inbox'],['profile','My profile']]) {
 test(file+' has one shared social workspace with working same-site destinations',t=>{
  const dom=new JSDOM(fs.readFileSync(path.join(root,file+'.html'),'utf8'));
  t.after(()=>dom.window.close());
  const doc=dom.window.document,navs=doc.querySelectorAll('nav[aria-label="Social workspace"]');
  assert.equal(navs.length,1);assert.equal(doc.querySelectorAll('main').length,1);
  assert.deepEqual([...navs[0].querySelectorAll('a')].map(a=>a.getAttribute('href')),['/social-feed','/messages','/profile#friends','/profile']);
  assert.deepEqual([...navs[0].querySelectorAll('[aria-current=page]')].map(a=>a.textContent),[label]);
  assert(doc.querySelector('link[href^="/css/sl-social-workspace.css?"]'));
 });
}
