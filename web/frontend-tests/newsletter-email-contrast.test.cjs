'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
process.env.EMAIL_PROVIDER='disabled';
process.env.APP_BASE_URL='https://scenelink.app';
const {newsletterConfirmEmail}=require('../../src/services/mailer');
const luminance=hex=>hex.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('Outlook fallback and inline contrast protect every newsletter link',()=>{
  const token='T'.repeat(43);
  const {html,text}=newsletterConfirmEmail(token);
  const {window}=new JSDOM(html);
  const doc=window.document;
  const links=[...doc.querySelectorAll('a')];
  assert.equal(links.length,5);
  for(const link of links) {
    const fg=link.style.color.match(/\d+/g).map(d=>Number(d).toString(16).padStart(2,'0')).join('');
    const bg=link.closest('[bgcolor]').getAttribute('bgcolor');
    assert(contrast(fg,bg)>=4.5);
    assert.equal(link.querySelector('font').getAttribute('color').toLowerCase(),'#'+fg);
  }
  const [confirm,leave]=links;
  assert.equal(leave.style.textDecoration,'underline');
  assert.equal(confirm.style.fontSize,'16px');
  assert.match(leave.parentElement.style.fontSize,/15px/);
  for(const [link,mode] of [[confirm,'confirm'],[leave,'unsubscribe']]) {
    const url=new URL(link.href);
    assert.equal(url.origin,'https://scenelink.app');
    assert.equal(url.pathname,'/newsletter-email.html');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(url.hash.slice(1))),{mode,token});
    assert(text.includes(url.href));
  }
  assert(doc.querySelector('meta[name=viewport]'));
  assert(!html.includes('example.invalid'));
  window.close();
});
