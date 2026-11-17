'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const root=path.resolve(__dirname,'../frontend');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const photos=JSON.parse(read('images/venues/licensed-photos.json'));
// Exercise the actual private renderer without exposing a production test hook or making API calls.
function setup(){
 const dom=new JSDOM('<body></body>',{url:'https://scenelink.test',runScripts:'outside-only'}),w=dom.window;
 w.eval(read('js/sl-connected-api.js'));
 const src=read('js/ai-concierge-v5.js');
 w.eval(src.slice(src.indexOf('    function safeAttr(s)'),src.indexOf('    function eventCard(e)'))+'\nwindow.renderFixture=venueCard;');
 return {w,dom};
}
for(const [id,p] of Object.entries(photos))test('concierge attributed card '+p.name,()=>{
 const {w}=setup();try{
 const v={id,name:p.name,address:p.address,city:p.city,lat:p.lat,lng:p.lng,image_url:'/assets/img/placeholder-venue.svg'};
 w.document.body.innerHTML=w.renderFixture(v);
 const card=w.document.querySelector('.slc-venue-card'),figure=card.querySelector('figure.sl-licensed-photo');
 assert(figure);assert.equal(card.style.display,'block');assert.equal(figure.querySelector('img').getAttribute('src'),p.url);
 for(const x of [p.author,p.license,p.date])assert(figure.textContent.includes(x));
 for(const action of card.querySelectorAll('[data-sl-venue-image]'))assert.equal(action.dataset.slVenueImage,v.image_url,'licensed image never leaks into unattributed saved metadata');
 figure.querySelector('img').dispatchEvent(new w.Event('error'));
 assert(!card.querySelector('figcaption'),'failed photo must not retain attribution');
 figure.querySelector('img').dispatchEvent(new w.Event('error'));assert.equal(w.getComputedStyle(figure.querySelector('img')).display,'none');
 w.document.body.innerHTML=w.renderFixture({...v,address:'wrong address'});
 assert(!w.document.querySelector('figure.sl-licensed-photo'));assert(!w.document.body.innerHTML.includes(p.url));
 }finally{w.close();}
});
test('concierge works without optional licensed helper',()=>{
 const {w}=setup();try{delete w.SLVenueData.licensedPhotoMarkup;w.document.body.innerHTML=w.renderFixture({id:'other',name:'<img id="unsafe">',image_url:'/assets/img/placeholder-venue.svg'});assert(w.document.querySelector('.slc-venue-card'));assert(!w.document.querySelector('#unsafe'));}finally{w.close();}
});

test('concierge attribution links do not open venue details',async t=>{
 const dom=new JSDOM('<body></body>',{url:'https://scenelink.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window; t.after(()=>w.close());
 const [id,p]=Object.entries(photos)[0];const v={id,...p,metrics_status:'unverified'};let opened=0;
 w.SLVenueDetail={open:()=>opened++};w.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/suggestions')?{suggestions:[]}:{ok:true,response:'Fixture',venues:[v],events:[]}));
 w.eval(read('js/sl-connected-api.js'));w.eval(read('js/ai-concierge-v5.js'));await new Promise(r=>setTimeout(r,0));w.SLConcierge.draft('fixture');
 const input=w.document.querySelector('.slc-input');input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 for(let n=0;n<50&&!w.document.querySelector('.slc-venue-card');n++)await new Promise(r=>setTimeout(r,20));
 const card=w.document.querySelector('.slc-venue-card');assert(card);const link=card.querySelector('figcaption a');assert(link);
 link.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(opened,0);
 card.querySelector('.slc-venue-name').click();assert.equal(opened,1);
});
