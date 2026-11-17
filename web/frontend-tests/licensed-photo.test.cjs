'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom');const root=path.resolve(__dirname,'../frontend');
const registry=JSON.parse(fs.readFileSync(path.join(root,'images/venues/licensed-photos.json')));
function harness(venue){
 const dom=new JSDOM('<body></body>',{url:'https://scenelink.test/explore',runScripts:'outside-only'}),w=dom.window;
 w.AbortController=AbortController;const calls=[];
 w.fetch=async url=>{calls.push(url);assert(url.startsWith('/api/venues/'),'no provider or external call');return{ok:true,status:200,json:async()=>url.includes('/reviews')?{reviews:[]}:venue};};
 for(const n of ['sl-connected-api','sl-venue-detail'])w.eval(fs.readFileSync(path.join(root,'js/'+n+'.js'),'utf8'));
 return {dom,w,calls};
}
for(const [id,photo] of Object.entries(registry)){
 const v={id,name:photo.name,address:photo.address,city:photo.city,lat:photo.lat,lng:photo.lng};
 test(photo.name+': exact reviewed identity shows same-origin whole photo with linked rights/date',async()=>{
  const h=harness(v);try{
   await h.w.SLVenueDetail.open(id);const img=h.w.document.querySelector('.sl-vd-image'),credit=h.w.document.querySelector('.sl-photo-credit');
   assert.equal(img.getAttribute('src'),photo.url);assert.equal(img.style.objectFit,'contain');assert.equal(img.style.height,'auto');
   for(const value of [photo.author,photo.title,photo.date,photo.license,photo.changes])assert(credit.textContent.includes(value));
   assert(credit.querySelector('a[href="'+photo.licenseUrl+'"]'));assert.equal(credit.querySelector('a').getAttribute('href'),photo.source);
   assert(h.calls.every(u=>!u.includes('/photo')));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,photo.url))).digest('hex'),photo.sha256);
   img.dispatchEvent(new h.w.Event('error'));assert.equal(img.getAttribute('src'),'/assets/img/placeholder-venue.svg');assert(!h.w.document.querySelector('.sl-photo-credit'),'no incorrect credit on fallback');
  }finally{h.w.close();}
 });
 test(photo.name+': identity drift and duplicate IDs fail closed; cards are unchanged',()=>{
  const h=harness(v);try{
   assert(h.w.SLVenueData.licensedPhoto(v));
   for(const change of [{id:'duplicate-id'},{name:'Other business'},{address:'Other address'},{city:'Other city'},{lat:v.lat+0.001},{lng:null},{is_active:false}])assert.equal(h.w.SLVenueData.licensedPhoto({...v,...change}),null);
   const normalized=h.w.SLVenueData.normalize({...v,thumbnail_url:'/api/photo?name=fixture'});assert.equal(normalized.thumbnail_url,'/api/photo?name=fixture','pilot does not publish uncredited card photos');
  }finally{h.w.close();}
 });
}
test('unreviewed union oyster identity is not silently mapped',()=>{const h=harness({});try{assert.equal(h.w.SLVenueData.licensedPhoto({id:'union-oyster-house',name:'Union Oyster House'}),null);}finally{h.w.close();}});
