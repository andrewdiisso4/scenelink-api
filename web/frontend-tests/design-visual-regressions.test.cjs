'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../frontend');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('official wordmark clears legacy image height caps and chips cannot shrink below their labels',()=>{
  const css=read('css/sl-design-system.css');
  assert.match(css,/img\.sl-brand-wordmark\s*\{[^}]*content:\s*normal\s*!important/s,'official PNG must not be replaced by legacy CSS content:url');
  assert.match(css,/img\.sl-brand-wordmark\s*\{[^}]*max-height:\s*none\s*!important/s);
  assert.match(css,/\.sl-map-chips > \.sl-chip-btn\s*\{[^}]*flex:\s*0 0 auto\s*!important[^}]*min-width:\s*max-content\s*!important/s);
  assert.equal((css.match(/:is\(#mainHeader, header, \.sl-explore-header\) img\.sl-brand-wordmark/g)||[]).length,2,'desktop and mobile official image rules must outrank the legacy ID selector');
  assert.match(css,/\.tv2-search-icon \{[^}]*z-index: 1; pointer-events: none;/);
  assert.match(css,/body :where\(input:not\(\[type="checkbox"\]\)/,'field exclusions must not inflate specificity above compound-search overrides');
});
test('Concierge search action is in normal flow, not over the ordinary Search button',()=>{
  const d=new JSDOM('<div class="sl-map-searchbar"><input id="slSearchInput"><button id="slSearchBtn">Search</button></div>',{url:'https://scenelink.test/explore',runScripts:'outside-only'});
  try {
    d.window.setTimeout=()=>1;d.window.eval(read('js/sl-search-ai-bridge.js'));d.window.document.dispatchEvent(new d.window.Event('DOMContentLoaded'));
    const parent=d.window.document.querySelector('.sl-map-searchbar'),button=parent.querySelector('.sl-search-ai-btn'),input=parent.querySelector('input');
    assert(parent.classList.contains('sl-search-ai-host'));assert(button);assert.equal(button.style.position,'static');assert.equal(button.style.width,'44px');
    assert.equal(input.style.paddingRight,'');assert.equal(parent.querySelector('#slSearchBtn').textContent,'Search');
    assert.equal(parent.querySelectorAll('.sl-search-ai-btn').length,1);
  } finally {d.window.close();}
});
test('critical icons have one font-independent visual even after repeated recovery passes',()=>{
  const d=new JSDOM('<i class="fas fa-search"></i><i class="fas fa-bars"></i><i class="fas fa-magic sl-phase8d-icon-fallback">✦</i>',{url:'https://scenelink.test/',runScripts:'outside-only'});
  const jobs=[];
  try {
    d.window.setTimeout=(fn,delay)=>{jobs.push({fn,delay});return jobs.length;};
    d.window.eval(read('js/sl-phase8d-recovery.js'));d.window.document.dispatchEvent(new d.window.Event('DOMContentLoaded'));
    jobs.filter(j=>j.delay===1200||j.delay===5000).forEach(j=>j.fn());
    for(const icon of d.window.document.querySelectorAll('i')){
      assert(icon.classList.contains('sl-icon-svg'));assert.equal(icon.querySelectorAll('svg').length,1);assert.equal(icon.textContent,'');assert.equal(icon.getAttribute('aria-hidden'),'true');
    }
    assert.match(read('css/sl-design-system.css'),/\.sl-icon-svg::after\s*\{ content: none !important; display: none !important;/);
  } finally {jobs.filter(j=>j.delay===20000).forEach(j=>j.fn());d.window.close();}
});
test('newsletter arrow uses a decorative SVG rather than an unavailable text glyph',()=>{
  for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
    const d=new JSDOM(read(file));
    try {for(const button of d.window.document.querySelectorAll('[data-sl-newsletter] button[type="submit"]')){
      assert(button.querySelector('svg.sl-newsletter-arrow[aria-hidden="true"]'),file);assert(!button.textContent.includes('↗'),file);
    }} finally {d.window.close();}
  }
});
for(const file of ['messages.html','my-lists.html','social-feed.html']) test(`${file} keeps Concierge lazy and loads its styles only after intentional activation`,()=>{
  const html=read(file);
  assert(!/<script[^>]*src=["'][^"']*ai-concierge-v5\.js/.test(html),'no eager widget script');
  assert(html.includes('sl-phase8d-recovery.js'),'intentional Ask AI entry retains the existing lazy script-and-style owner');
  const d=new JSDOM(html,{url:`https://scenelink.test/${file}`,runScripts:'outside-only'}),cleanup=[];
  try {
    const w=d.window,doc=w.document,asked=[];
    w.setTimeout=(fn,delay)=>{if(delay===20000)cleanup.push(fn);return 1;};
    w.eval(read('js/sl-phase8d-recovery.js'));
    doc.dispatchEvent(new w.Event('DOMContentLoaded'));
    assert.equal(doc.querySelectorAll('.sl-concierge-fab,.sl-concierge-panel').length,0);
    assert.equal(doc.querySelectorAll('script[src*="ai-concierge-v5.js"]').length,0);
    assert.equal(doc.querySelectorAll('link[href*="ai-concierge"]').length,0);
    const trigger=doc.querySelector('[data-ai-concierge-nav][data-sl-concierge]');
    assert(trigger,'the existing Ask AI entry remains available');
    trigger.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
    const script=doc.querySelector('script[src*="ai-concierge-v5.js"]');
    assert(script,'intentional Ask AI activation loads the widget');
    for(const name of ['ai-concierge.css','ai-concierge-v5.css']) {
      const style=doc.querySelector(`link[rel="stylesheet"][href*="${name}"]`);
      assert(style,`activation includes ${name}`);
      assert(style.compareDocumentPosition(script)&w.Node.DOCUMENT_POSITION_FOLLOWING,'styles are inserted before the widget script');
    }
    w.SLConcierge={ask:q=>asked.push(q)};
    script.dispatchEvent(new w.Event('load'));
    assert.deepEqual(asked,[trigger.getAttribute('data-sl-concierge')]);
  } finally {cleanup.forEach(fn=>fn());d.window.close();}
});
