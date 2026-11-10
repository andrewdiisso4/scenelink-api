'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '../frontend');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = fs.readdirSync(root).filter(p => p.endsWith('.html'));
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
test('every page opts into one final shared theme and allows browser zoom', () => {
  for (const file of pages) {
    const d = new JSDOM(read(file)), doc = d.window.document;
    assert.equal(doc.documentElement.dataset.slDesign, 'unified', file);
    const styles = [...doc.head.querySelectorAll('link[rel="stylesheet"]')];
    assert(styles.at(-1).getAttribute('href').startsWith('/css/sl-design-system.css?'), file);
    assert(!/user-scalable=no|maximum-scale=1(?:\.0)?(?:[,"\s]|$)/.test(doc.querySelector('meta[name="viewport"]')?.content || ''), file);
    d.window.close();
  }
});
test('both official logo assets remain byte-identical to supplied originals', () => {
  for (const [file, sha] of Object.entries({
    'images/brand/scenelink-wordmark.png': 'ce9440f4db1bcae546fe04121d9c25d5ec7d81da2933c174bfa210d1fb95d6e7',
    'images/brand/scenelink-full.png': 'ba80587846e74ea44b79fcdf4c04795dc38cdedf990d3ed8f3b1765c46daddab'
  })) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), sha);
  let count = 0;
  for (const file of pages) {
    const d = new JSDOM(read(file));
    for (const img of d.window.document.querySelectorAll('.sl-brand-wordmark,.sl-brand-fullmark')) {
      assert(img.alt, file); assert(img.closest('a'), file); count++;
      assert(fs.existsSync(path.join(root, img.getAttribute('src'))), file);
    }
    d.window.close();
  }
  assert(count >= 30);
});
test('newsletter has explicit accessible labels and feedback; social icons do not depend on fonts', () => {
  for (const file of pages) {
    const d = new JSDOM(read(file)), doc = d.window.document;
    for (const form of doc.querySelectorAll('[data-sl-newsletter]')) {
      const email = form.querySelector('input[type="email"]');
      assert(email?.id, file); assert(doc.querySelector('label[for="' + email.id + '"]'), file);
      assert.equal(email.autocomplete, 'email'); assert.equal(email.required, true);
      assert(form.querySelector('[data-sl-form-status][role="status"][aria-live="polite"]'), file);
      assert(form.querySelector('a[href="/privacy"]'), file);
    }
    for (const link of doc.querySelectorAll('.footer-social-icons a')) {
      assert(link.getAttribute('aria-label'), file);
      assert(link.querySelector('svg[aria-hidden="true"] path'), file);
      assert(!link.querySelector('i'), file);
      assert(link.rel.includes('noopener'), file);
    }
    d.window.close();
  }
});
test('theme defines visible focus, reduced motion, touch sizing and AA text contrast', () => {
  const css = read('css/sl-design-system.css');
  for (const text of [':focus-visible', 'outline: 3px', 'prefers-reduced-motion', 'forced-colors: active', 'min-height: 44px !important', 'font-size: 16px !important']) assert(css.includes(text));
  function light(hex) {const rgb = hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
  for (const [fg,bg] of [['f5f6f7','191e23'],['b9c1ca','191e23'],['18150d','e3bc54'],['f3d783','302a1b']]) {
    const values=[light(fg),light(bg)].sort((a,b)=>b-a);assert((values[0]+.05)/(values[1]+.05)>=4.5, fg+' on '+bg);
  }
});
async function harness(fetch) {
  const html = read('index.html').match(/<form[^>]*data-sl-newsletter="1"[\s\S]*?<\/form>/)[0];
  const dom = new JSDOM(html, {url:'https://scenelink.test/',runScripts:'outside-only'});
  dom.window.fetch = fetch;
  dom.window.eval(read('js/sl-phase8-completion.js')); await tick();
  const form = dom.window.document.querySelector('form'), input=form.querySelector('input'), button=form.querySelector('button');
  return {dom,form,input,button,submit(){form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));}};
}
const reply = (data,ok=true) => ({ok,status:ok?200:503,text:async()=>JSON.stringify(data)});
test('newsletter deduplicates repeated submissions and only confirms explicit API success', async () => {
  let finish,calls=0;
  const h=await harness(()=>{calls++;return new Promise(resolve=>finish=resolve);});
  try {
    h.input.value='fixture@example.invalid';h.submit();h.submit();
    assert.equal(calls,1);assert(h.button.disabled);assert.equal(h.form.getAttribute('aria-busy'),'true');
    finish(reply({ok:true}));await tick();
    assert.match(h.form.textContent,/You're on the SceneLink email list/);assert(!h.form.textContent.includes('inbox'));
    assert.equal(h.input.value,'');assert(!h.button.disabled);assert(!h.form.hasAttribute('aria-busy'));
  } finally {h.dom.window.close();}
});
test('newsletter preserves email on failure, permits retry, and retains newer edits during success', async () => {
  let fail=true,finish;
  const h=await harness(()=>fail?Promise.resolve(reply({error:'Service unavailable'},false)):new Promise(resolve=>finish=resolve));
  try {
    h.input.value='first@example.invalid';h.submit();await tick();
    assert.equal(h.input.value,'first@example.invalid');assert(!h.button.disabled);assert.match(h.form.textContent,/Service unavailable/);
    fail=false;h.submit();h.input.value='second@example.invalid';finish(reply({ok:true}));await tick();
    assert.equal(h.input.value,'second@example.invalid');
  } finally {h.dom.window.close();}
});
test('newsletter rejects invalid input and a malformed success payload never reports subscribed', async () => {
  let calls=0;const h=await harness(async()=>{calls++;return reply({});});
  try {
    h.input.value='invalid';h.submit();await tick();assert.equal(calls,0);
    h.input.value='fixture@example.invalid';h.submit();await tick();
    assert.equal(calls,1);assert.match(h.form.textContent,/not confirmed/);assert.equal(h.input.value,'fixture@example.invalid');
  } finally {h.dom.window.close();}
});
for (const order of [['sl-newsletter','sl-phase8-completion'],['sl-phase8-completion','sl-newsletter']]) {
  test('footer newsletter has one first-party request owner: '+order.join(' then '), async () => {
    const html = read('events.html').match(/<form[^>]*data-sl-newsletter="1"[\s\S]*?<\/form>/)[0];
    const dom = new JSDOM(html,{url:'https://scenelink.test/events',runScripts:'outside-only'}), calls=[];
    try {
      dom.window.fetch = async(url,options)=>{calls.push({url,options});return reply({ok:true});};
      for(const file of order)dom.window.eval(read('js/'+file+'.js'));
      await tick();const form=dom.window.document.querySelector('form'),input=form.querySelector('input');
      input.value='fixture@example.invalid';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick();
      assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/newsletter/subscribe');
      assert(!input.disabled);assert.match(form.textContent,/You're on the SceneLink email list/);
    } finally {dom.window.close();}
  });
}
