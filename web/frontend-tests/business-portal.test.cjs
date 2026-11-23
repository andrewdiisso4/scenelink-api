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
        if(path.includes('/reviews'))return reply({reviews:[]});
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
    assert.deepEqual(write.body,{hours_display:'Fri 6–11'});
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
