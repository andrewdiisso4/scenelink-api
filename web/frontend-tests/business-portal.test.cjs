'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '../frontend');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const owner = {id:'owner-fixture',role:'business',status:'active',venue_id:'venue-fixture',tier:'starter',
    email:'owner@example.test',venue_name:'Fixture Café',
    venue:{id:'venue-fixture',name:'Fixture Café',is_active:true,hours_display:'Tue–Sat 5–10',city:'Quincy'}};
const reply = (data,status=200) => ({ok:status>=200 && status<300,status,json:async()=>data});
async function mount(t, {handle,storage={},page='business.html',url='/business'}={}) {
    const w = new JSDOM(fs.readFileSync(path.join(root,page)), {url:'https://fixture.test'+url,runScripts:'outside-only'}).window;
    t.after(()=>w.close());
    w.TextEncoder=TextEncoder;
    Object.entries(storage).forEach(([k,v])=>w.localStorage.setItem(k,v));
    const calls=[];
    w.fetch=async (path,opts={})=>{
        const c={path,method:opts.method||'GET',token:opts.headers?.Authorization,body:opts.body?JSON.parse(opts.body):null};
        calls.push(c);
        const intercepted=handle?.(c);
        if(intercepted!==undefined)return intercepted;
        if(path==='/api/business/me')return reply({user:owner});
        if(path.includes('/listings/'))return reply({ok:true,venue_id:owner.venue_id,window_days:Number(new URL(path,w.location).searchParams.get('days')),metrics:['view','save','plan_add','website_click'],counts:{view:12,save:0,plan_add:3,website_click:2},total:17});
        if(path.includes('/venues'))return reply({venues:[{...owner.venue,is_primary:true}]});
        if(path.includes('/photos'))return reply({photos:[]});
        if(path.includes('/reviews'))return reply({reviews:[],venue_id:owner.venue_id});
        if(path.includes('/promos'))return reply({promos:[]});
        throw Error('Unexpected request '+path);
    };
    for(const sc of w.document.scripts) {
        if(!sc.src && (!sc.type || sc.type==='text/javascript')) w.eval(sc.textContent);
        if(sc.src && /\/sl-(?:business-access|business-app|reset-password)\.js/.test(sc.src)) {
            w.eval(fs.readFileSync(path.join(root,new URL(sc.src).pathname),'utf8'));
        }
    }
    await tick();
    const el=id=>w.document.getElementById(id);
    async function submit(id,fields) {
        Object.entries(fields||{}).forEach(([key,val])=>el(key).value=val);
        el(id).requestSubmit(); await tick();
    }
    return {w,el,calls,submit};
}
test('claim acknowledgement keeps pending owners out and preserves password whitespace',async t=>{
    const h=await mount(t,{handle:c=>c.path.endsWith('/claim')?reply({ok:true,pending_review:true,user:{status:'pending'}},202):undefined});
    h.el('bizClaimBtn').click();
    await h.submit('bzFormClaim',{bzClaimName:'Fixture Café',bzClaimEmail:owner.email,bzClaimPass:' password '});
    assert.equal(h.calls.length,1);
    assert.equal(h.calls[0].body.password,' password ');
    assert.match(h.el('bizAccessStatus').textContent,/awaiting ownership review/i);
    assert.equal(h.el('bizDashboard').classList.contains('active'),false);
    assert.equal(h.w.localStorage.getItem('sl_biz_token'),null);
});
test('approved login verifies the business session, opens the owned venue and reads measured counts',async t=>{
    const h=await mount(t,{storage:{sl_jwt_token:'consumer-fixture'},handle:c=>c.path.endsWith('/login')?reply({token:'owner-token',user:owner}):undefined});
    h.el('bizLoginBtn').click();
    await h.submit('bzFormLogin',{bzEmail:owner.email,bzPass:' password '});
    assert.equal(h.calls[0].body.password,' password ');
    assert.equal(h.calls[1].path,'/api/business/me');
    assert(h.calls.slice(1).every(c=>c.token==='Bearer owner-token'));
    assert(h.el('bizDashboard').classList.contains('active'));
    assert.equal(h.el('bdEditHours').value,owner.venue.hours_display);
    assert.equal(h.el('bdViewListing').getAttribute('href'),'/explore?venue=venue-fixture');
    assert.deepEqual(['bdStatViews','bdStatSaves','bdStatPlans','bdStatClicks'].map(id=>h.el(id).textContent),['12','0','3','2']);
    h.w.setAnalyticsRange(null,'quarter'); await tick();
    assert(h.calls.some(c=>c.path.endsWith('/analytics?days=90')));
});
test('cached display data cannot open the dashboard; invalid credentials and transient outages differ',async t=>{
    const stale={sl_biz_user:'{"venueName":"STALE"}',sl_business:'{"venueName":"STALE"}'};
    const naked=await mount(t,{storage:stale});
    assert(!naked.el('bizDashboard').classList.contains('active'));assert.equal(naked.calls.length,0);
    const denied=await mount(t,{storage:{...stale,sl_biz_token:'expired'},handle:()=>reply({error:'expired'},401)});
    assert(!denied.el('bizDashboard').classList.contains('active'));
    assert.equal(denied.w.localStorage.getItem('sl_biz_token'),null);assert.equal(denied.calls.length,1);
    let down=true;
    const h=await mount(t,{storage:{...stale,sl_biz_token:'fixture'},handle:c=>down?reply({},503):undefined});
    assert.equal(h.w.localStorage.getItem('sl_biz_token'),'fixture');assert(!h.el('bizRetry').hidden);
    assert(!h.el('bizDashboard').classList.contains('active'));down=false;h.el('bizRetry').click();await tick();
    assert(h.el('bizDashboard').classList.contains('active'));
});
test('a late account check cannot open the dashboard after the session changes',async t=>{
    let resolve;const waiting=new Promise(r=>resolve=r);
    const h=await mount(t,{storage:{sl_biz_token:'old'},handle:c=>waiting});
    h.w.localStorage.setItem('sl_biz_token','next');
    resolve(reply({user:owner}));await tick();
    assert(!h.el('bizDashboard').classList.contains('active'));assert.equal(h.calls.length,1);
});
test('forgot password distinguishes accepted, unavailable and offline responses',async t=>{
    for(const result of [503,429,'offline',202]) {
        const h=await mount(t,{handle:()=>result==='offline'?Promise.reject(Error('Offline')):reply({ok:result===202},result)});
        h.el('bizLoginBtn').click();h.el('bzForgotLink').click();
        await h.submit('bzFormForgot',{bzForgotEmail:owner.email});
        assert.equal(h.el('bzForgotSuccess').style.display==='block',result===202);
        if(result!==202)assert(h.el('bzForgotError').textContent);
    }
});
test('emailed business recovery URL scrubs its fragment and updates only the business password',async t=>{
    const token='a'.repeat(64);
    const h=await mount(t,{page:'business-reset-password.html',url:'/business-reset-password.html#token='+token,handle:()=>reply({ok:true})});
    assert.equal(h.w.location.hash,'');assert.equal(h.calls.length,0);
    await h.submit('resetForm',{newPassword:'new password',confirmPassword:'new password'});
    assert.equal(h.calls[0].path,'/api/business/reset-password');assert.equal(h.calls[0].body.token,token);
    assert.equal(h.el('resetForm').hidden,true);
});
test('only changed listing fields are saved; a mismatched confirmation preserves the draft',async t=>{
    let confirm=false;
    const h=await mount(t,{storage:{sl_biz_token:'fixture'},handle:c=>c.method==='PATCH'
        ?reply({ok:true,venue:{...owner.venue,hours_display:confirm?'Fri 6–11':'old hours'}}):undefined});
    h.el('bdEditHours').value='Fri 6–11';h.el('bdSaveListing').click();await tick();
    const write=h.calls.find(c=>c.method==='PATCH');
    assert.equal(write.path,'/api/business/venue?venue_id=venue-fixture');
    assert.deepEqual(write.body,{hours_display:'Fri 6–11',expected_active_venue_id:owner.venue_id});
    assert.match(h.w.document.body.textContent,/did not confirm/);assert.equal(h.el('bdEditHours').value,'Fri 6–11');
    confirm=true;h.el('bdSaveListing').click();await tick();h.el('bdSaveListing').click();await tick();
    assert.equal(h.calls.filter(c=>c.method==='PATCH').length,2);
    assert.match(h.w.document.body.textContent,/Listing changes saved/);
});
test('unavailable event tracking shows a retry state and never renders simulated metrics',async t=>{
    const h=await mount(t,{storage:{sl_biz_token:'fixture'},handle:c=>c.path.includes('/analytics?')?reply({},503):undefined});
    assert.equal(h.el('bdStatViews').textContent,'—');assert.match(h.el('bdStatsStatus').textContent,/unavailable/i);
    assert.equal(h.el('bdChartBars'),null);assert.equal(h.el('bdSources'),null);
});
test('owner gallery and promotion controls save to the selected venue and reload the records',async t=>{
    let photos=[],promos=[{id:'promo-fixture',title:'Dinner special',is_active:true}];
    const h=await mount(t,{storage:{sl_biz_token:'fixture'},handle:c=>{
        if(c.path.includes('/photos')) {
            if(c.method==='POST') { photos=[{id:'photo-fixture',...c.body}];return reply({ok:true,photo:photos[0]}); }
            return reply({photos});
        }
        if(c.path.includes('/promos')) {
            if(c.method==='PATCH'){promos=[{...promos[0],...c.body}];return reply({ok:true,promo:promos[0]});}
            return reply({promos});
        }
    }});
    h.el('bdAddPhoto').click();assert.equal(h.el('bdPhotoForm').hidden,false);
    await h.submit('bdPhotoForm',{bdPhotoURL:'https://images.example.test/patio.jpg',bdPhotoCaption:'Patio seating'});
    assert(h.calls.find(c=>c.method==='POST' && c.path==='/api/business/photos?venue_id=venue-fixture'));
    assert.equal(h.el('bdPhotosGrid').querySelector('img').alt,'Patio seating');assert(h.el('bdPhotoForm').hidden);
    h.el('bdPromoList').querySelector('.sl-promo-state').click();await tick();
    assert(h.calls.find(c=>c.method==='PATCH' && c.path==='/api/business/promos/promo-fixture?venue_id=venue-fixture'));
    assert.equal(h.el('bdPromoList').querySelector('.sl-promo-state').textContent,'Resume');
    h.el('bdPromoList').querySelector('.sl-promo-state').click();await tick();assert.equal(promos[0].is_active,true);
});
test('current collector metrics supply their own labels and a legacy response cannot assert measured zeros',async t=>{
    let older=false;
    const h=await mount(t,{storage:{sl_biz_token:'fixture'},handle:c=>c.path.includes('/analytics?')?
        reply({ok:true,venue_id:owner.venue_id,window_days:30,total:0,
            metrics:older?undefined:['save','checkin','review_post','booking_click'],
            counts:{save:0,checkin:0,review_post:0,booking_click:0}}):undefined});
    assert.equal(h.el('bdStatViews').previousElementSibling.textContent,'Save events');
    assert.equal(h.el('bdStatClicks').previousElementSibling.textContent,'Booking-link clicks');
    assert.equal(h.el('bdStatViews').textContent,'0');older=true;h.el('bdStatsRetry').click();await tick();
    assert.equal(h.el('bdStatViews').textContent,'—');assert.match(h.el('bdStatsStatus').textContent,/unavailable/);
});

test('a new listing is confirmed as pending, stays editable and has no public listing link',async t=>{
    let user={...owner,venue_id:null,venue:null};
    const pending={...owner.venue,id:'pending-fixture',name:'Pending fixture',is_active:false,needs_manual_review:true};
    const h=await mount(t,{storage:{sl_biz_token:'fixture'},handle:c=>{
        if(c.path==='/api/business/me')return reply({user});
        if(c.path==='/api/business/venues')return reply({venues:user.venue?[{...user.venue,is_primary:true}]:[]});
        if(c.path==='/api/business/venue' && c.method==='POST') {
            user={...user,venue_id:pending.id,venue_name:pending.name,venue:pending};
            return reply({ok:true,pending_review:true,venue:pending},202);
        }
        if(c.method==='PATCH') {user.venue={...pending,...c.body};return reply({ok:true,venue:user.venue});}
    }});
    assert.match(h.el('bdCreateListingBtn').textContent,/submit listing for review/i);
    h.el('bdEditName').value=pending.name;h.el('bdCreateListingBtn').click();await tick();await tick();
    assert.equal(h.el('bdCreateListingBtn'),null);
    assert.match(h.el('bdVRating').textContent,/Pending review.*Not publicly visible/);
    assert(h.el('bdViewListing').hidden);assert.equal(h.el('bdSaveListing').disabled,false);
    h.el('bdEditHours').value='Monday 4–9';h.el('bdSaveListing').click();await tick();
    assert.equal(h.calls.find(c=>c.method==='PATCH').path,'/api/business/venue?venue_id=pending-fixture');
    assert.match(h.el('bdVRating').textContent,/Pending review/);assert(h.el('bdViewListing').hidden);
});

test('an older publish-on-create response cannot be presented as a pending-review success',async t=>{
    const h=await mount(t,{storage:{sl_biz_token:'fixture'},handle:c=>{
        if(c.path==='/api/business/me')return reply({user:{...owner,venue_id:null,venue:null}});
        if(c.path==='/api/business/venues')return reply({venues:[]});
        if(c.path==='/api/business/venue' && c.method==='POST')return reply({ok:true,venue:owner.venue});
    }});
    h.el('bdEditName').value='Draft fixture';h.el('bdCreateListingBtn').click();await tick();
    assert.match(h.w.document.body.textContent,/review status was not confirmed/i);
    assert(h.el('bdCreateListingBtn'));assert.equal(h.el('bdEditName').value,'Draft fixture');
    assert(h.el('bdViewListing').hidden);
});

test('adding the first venue refreshes the owner account so its pending listing can be edited immediately',async t=>{
    let user={...owner,tier:'enterprise',venue_id:null,venue:null};
    const pending={...owner.venue,id:'add-first-fixture',name:'Pending first addition',is_active:false,needs_manual_review:true};
    const h=await mount(t,{storage:{sl_biz_token:'fixture'},handle:c=>{
        if(c.path==='/api/business/me')return reply({user});
        if(c.path==='/api/business/venues')return reply({venues:user.venue?[{...user.venue,is_primary:true}]:[]});
        if(c.path==='/api/business/venues/add' && c.method==='POST') {
            user={...user,venue_id:pending.id,venue_name:pending.name,venue:pending};
            return reply({ok:true,pending_review:true,venue:pending},202);
        }
    }});
    const answers=[pending.name,'','Boston','restaurant'];
    h.w.prompt=()=>answers.shift();
    h.el('bdAddVenueBtn').click();await tick();await tick();
    assert(h.calls.filter(c=>c.path==='/api/business/me').length>=2);
    assert.equal(h.el('bdCreateListingBtn'),null);
    assert.equal(h.el('bdSaveListing').disabled,false);
    assert.equal(h.el('bdEditName').value,pending.name);
    assert.match(h.el('bdVRating').textContent,/Pending review/);
    assert(h.el('bdViewListing').hidden);
});

test('the multi-venue table shows pending status and treats submitted venue names as text',async t=>{
    const name='<img src=x onerror="window.ownerNameExecuted=true"> & Fictional';
    const pending={...owner.venue,name,is_active:false,needs_manual_review:true,is_primary:true};
    const h=await mount(t,{storage:{sl_biz_token:'fixture'},handle:c=>{
        if(c.path==='/api/business/me')return reply({user:{...owner,tier:'enterprise',venue:pending}});
        if(c.path==='/api/business/venues')return reply({venues:[pending]});
    }});
    await h.w.loadEnterpriseVenues();
    assert.match(h.el('mvVenuesTbody').textContent,/Pending review/);
    assert(h.el('mvVenuesTbody').textContent.includes(name));
    assert.equal(h.el('mvVenuesTbody').querySelector('img'),null);
    assert.equal(h.w.ownerNameExecuted,undefined);
    assert(h.el('bdVenueSelect').options[0].textContent.includes(name));
});

const annex={id:'venue-annex',name:'Fixture Annex',city:'Boston'};
async function mountGroup(t,switchHandler) {
    return mount(t,{storage:{sl_biz_token:'owner-token'},handle:c=>{
        if(c.path==='/api/business/me')return reply({user:{...owner,tier:'enterprise'}});
        if(c.path==='/api/business/venues')return reply({venues:[{...owner.venue,is_primary:true},annex]});
        if(c.path==='/api/business/venues/switch')return switchHandler(c);
    }});
}
function selectAnnex(h) {
    h.el('bdVenueSelect').value=annex.id;
    h.el('bdVenueSelect').dispatchEvent(new h.w.Event('change',{bubbles:true}));
}
test('location selection does not switch until requested and keeps a dirty listing on cancel or failed switch',async t=>{
    let allow;const pending=new Promise(resolve=>{allow=resolve;});
    const h=await mountGroup(t,()=>pending);
    assert.equal(h.el('bdVenueSwitcher').hidden,false);
    assert.equal(h.el('bdCurrentLocation').textContent,'Now managing Fixture Café');
    assert.equal(h.el('bdVenueSelect').value,owner.venue_id);
    assert.equal(h.el('bdSwitchLocation').disabled,true);
    h.el('bdEditHours').value='New unsaved hours';
    selectAnnex(h);
    assert.equal(h.calls.filter(c=>c.path.endsWith('/venues/switch')).length,0);
    h.el('bdSwitchLocation').click();
    assert.equal(h.el('bdSwitchConfirmation').hidden,false);
    assert.equal(h.w.document.activeElement,h.el('bdKeepEditing'));
    h.el('bdKeepEditing').click();
    assert.equal(h.el('bdSwitchConfirmation').hidden,true);
    assert.equal(h.el('bdVenueSelect').value,owner.venue_id);
    assert.equal(h.el('bdEditHours').value,'New unsaved hours');
    assert.equal(h.calls.filter(c=>c.path.endsWith('/venues/switch')).length,0);
    selectAnnex(h);h.el('bdSwitchLocation').click();h.el('bdDiscardAndSwitch').click();
    assert.equal(h.el('bdVenueSelect').disabled,true);
    assert.equal(h.el('panel-listing').hasAttribute('inert'),true);
    const sends=h.calls.filter(c=>c.path.endsWith('/venues/switch'));
    assert.equal(sends.length,1);
    assert.deepEqual(sends[0].body,{venue_id:annex.id,expected_active_venue_id:owner.venue_id});
    allow(reply({error:'Unavailable'},503));
    await tick();
    assert.equal(h.el('panel-listing').hasAttribute('inert'),false);
    assert.equal(h.el('bdVenueSelect').value,owner.venue_id);
    assert.equal(h.el('bdEditHours').value,'New unsaved hours');
    assert.equal(h.el('bdSaveListing').disabled,false);
    assert.match(h.el('bdSwitchStatus').textContent,/edits have been kept/i);
});
test('stale cross-tab location and legacy reporting refresh cannot overwrite a draft or relabel its dashboard',async t=>{
    const h=await mountGroup(t,()=>reply({error:'stale'},409));
    h.el('bdEditName').value='Unsaved rename';
    selectAnnex(h);
    await h.w.loadEnterpriseVenues();
    assert.equal(h.el('bdVenueSelect').value,annex.id);
    assert.equal(h.el('bdEditName').value,'Unsaved rename');
    h.el('bdSwitchLocation').click();h.el('bdDiscardAndSwitch').click();await tick();
    assert.match(h.el('bdSwitchStatus').textContent,/changed in another tab/i);
    assert.equal(h.el('bdEditName').value,'Unsaved rename');
    assert.equal(h.el('bdCurrentLocation').textContent,'Now managing Fixture Café');
    assert.equal(h.el('bdSwitchLocation').disabled,true);
    assert.equal(h.el('bdSaveListing').disabled,true);
});


test('an old owner tab cannot save after the location changes and preserves the draft', async t => {
    const h=await mount(t,{storage:{sl_biz_token:'fixture'},handle:c=>c.method==='PATCH'?reply({error:'Location changed'},409):undefined});
    h.el('bdEditHours').value='Unsent hours';
    h.el('bdSaveListing').click();
    await tick();
    assert.equal(h.el('bdEditHours').value,'Unsent hours');
    assert.equal(h.el('bdSaveListing').disabled,true);
    assert.match(h.el('bdSwitchStatus').textContent,/changed in another tab/);
    assert.equal(h.calls.filter(c=>c.method==='PATCH').length,1);
});

test('owner reviews send the displayed venue and reject results for a different venue', async t => {
    const h=await mount(t,{storage:{sl_biz_token:'fixture'},handle:c=>c.path.includes('/reviews')?
        reply({reviews:[{rating:4,content:'Another location review'}],venue_id:'venue-other'}):undefined});
    assert(h.calls.some(c=>c.path==='/api/business/reviews?venue_id='+owner.venue_id));
    assert.match(h.el('bdReviewsList').textContent,/Reviews unavailable/);
    assert.doesNotMatch(h.el('bdReviewsList').textContent,/Another location review/);
});
