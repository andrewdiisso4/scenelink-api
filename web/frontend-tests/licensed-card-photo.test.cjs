'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../frontend'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),registry=JSON.parse(read('images/venues/licensed-photos.json'));
const records=Object.entries(registry).map(([id,p])=>({id,...p,thumbnail_url:'/legacy.jpg'}));
function setup(html){const dom=new JSDOM(html,{url:'https://scenelink.test/explore.html',runScripts:'outside-only'});dom.window.eval(read('js/sl-connected-api.js'));return dom;}
for(const v of records)test(v.name+' shared markup retains full image, rights and historical context',()=>{
 const dom=setup('<body>');try{const w=dom.window,d=w.document;d.body.innerHTML=w.SLVenueData.licensedPhotoMarkup(v);const img=d.querySelector('img'),credit=d.querySelector('figcaption');assert.equal(img.getAttribute('src'),v.url);assert.equal(img.style.objectFit,'contain');assert.equal(img.style.height,'auto');for(const x of [v.date,v.author,v.title,v.changes,v.license])assert(credit.textContent.includes(x));assert.equal(credit.querySelector('a').href,v.source);assert(credit.querySelector(`a[href="${v.licenseUrl}"]`));assert.equal(w.SLVenueData.normalize(v).thumbnail_url,'/legacy.jpg');
 for(const drift of [{id:'duplicate-id'},{address:'elsewhere'},{city:'elsewhere'},{lat:v.lat+.001},{is_active:false}])assert.equal(w.SLVenueData.licensedPhotoMarkup({...v,...drift}),'');
 img.dispatchEvent(new w.Event('error'));assert.equal(img.getAttribute('src'),'/assets/img/placeholder-venue.svg');assert(!d.querySelector('figcaption'));img.dispatchEvent(new w.Event('error'));img.dispatchEvent(new w.Event('error'));assert.equal(d.querySelectorAll('figure span').length,1);
 }finally{dom.window.close();}
});
test('home and map right-panel opt in once, duplicates fail closed, attribution links do not select venues',async()=>{
 const list=[...records,{...records[0],id:'duplicate-id'}];
 const dom=setup('<div id="phase8TonightGrid"></div><div id="slRightPanel"><div id="slRightPanelCards"></div><span id="slRightPanelCount"></span></div>');const w=dom.window,d=w.document;try{
 w.SLVenueData.list=async()=>({venues:list});w.eval(read('js/sl-phase8-completion.js'));await new Promise(r=>setTimeout(r,20));assert.equal(d.querySelectorAll('#phase8TonightGrid figure').length,2);assert.equal(d.querySelectorAll('#phase8TonightGrid article').length,3);
 let selected=0;w.__slExploreData={getVenues:()=>list,getFiltered:()=>list,getStatus:()=>({total:3}),showVenue:()=>selected++};const later=[];w.setTimeout=f=>{later.push(f);return 1;};w.setInterval=()=>1;w.eval(read('js/sl-right-panel.js'));later.forEach(f=>f());assert.equal(d.querySelectorAll('#slRightPanelCards figure').length,2);assert.equal(d.querySelectorAll('#slRightPanelCards .sl-rp-card').length,3);d.querySelector('#slRightPanelCards figcaption a').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(selected,0);
 w.dispatchEvent(new w.Event('sl-venues-changed'));assert.equal(d.querySelectorAll('#slRightPanelCards figure').length,2);assert(!d.querySelector('img#slCardImg'));
 }finally{w.close();}
});
test('registry text is escaped, not markup',()=>{
 // Test the real helper against the same private registry with hostile metadata only.
 const dom=new JSDOM('<body>',{url:'https://scenelink.test',runScripts:'outside-only'});try{const source=read('js/sl-connected-api.js').replace('4300streetcar','<img id=credit-injection>');dom.window.eval(source);dom.window.document.body.innerHTML=dom.window.SLVenueData.licensedPhotoMarkup(records[0]);assert(!dom.window.document.querySelector('#credit-injection'));assert(dom.window.document.querySelector('figcaption').textContent.includes('<img id=credit-injection>'));}finally{dom.window.close();}
});
