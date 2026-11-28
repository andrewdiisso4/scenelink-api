'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID, randomBytes} = require('node:crypto');
const {once} = require('node:events');
const express = require('express');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');

test('owner claim, session, reporting, listing edit and emailed recovery use the business routes', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    const venueId = randomUUID(), second = randomUUID(), unrelated = randomUUID();
    await db.exec('CREATE TABLE venues(id uuid PRIMARY KEY, name text, type text, neighborhood text, city text, image_url text, cover_image_url text, is_active boolean, is_claimed boolean, needs_manual_review boolean, rating numeric, review_count integer, hours_display text, updated_at timestamptz)');
    await db.query("INSERT INTO venues(id,name) VALUES ($1,'Fixture Dining'),($2,'Fixture Annex'),($3,'Unrelated fixture')", [venueId,second,unrelated]);
    function substitute(path, exports) {
        const id = require.resolve(path), old = require.cache[id];
        require.cache[id] = {id,filename:id,loaded:true,exports};
        t.after(() => {if (old) require.cache[id]=old; else delete require.cache[id];});
    }
    let inboxLink;
    substitute('../src/config/database',{query:db.query.bind(db),connect:async()=>({query:db.query.bind(db),release(){}})});
    substitute('../src/services/mailer',{isReady:()=>true,passwordResetEmail:({resetUrl})=>({resetUrl}),
        sendMail:async message=>{inboxLink=message.resetUrl;return {ok:true};}});
    const oldSecret = process.env.JWT_SECRET, oldBase = process.env.APP_BASE_URL;
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    process.env.APP_BASE_URL = 'https://fixture.example.test';
    t.after(() => {
        if(oldSecret===undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET=oldSecret;
        if(oldBase===undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL=oldBase;
    });
    const router = require('../src/routes/business');
    await router.initialize();
    await db.exec('ALTER TABLE business_users ADD COLUMN auth_version int NOT NULL DEFAULT 0');
    await db.exec('CREATE TABLE business_auth_revocations(token_hash text PRIMARY KEY,business_user_id uuid,expires_at timestamptz)');
    const app = express(); app.use(express.json()); app.use('/api/business',router);
    if (process.env.SCENELINK_BROWSER_MODULE_ROOT) {
        app.use(express.static(path.join(__dirname,'../web/frontend')));
    }
    const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
    t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
    let token;
    async function api(path,method='GET',body,authenticated=true) {
        const headers = {'Content-Type':'application/json'};
        if (authenticated && token) headers.Authorization='Bearer '+token;
        const res = await fetch('http://127.0.0.1:'+server.address().port+'/api/business'+path,
            {method,headers,body:body&&JSON.stringify(body)});
        return {status:res.status,data:await res.json(),cache:res.headers.get('cache-control')};
    }
    const credentials = {email:'owner@example.test',password:' fixture password '};
    const claim=await api('/claim','POST',{...credentials,email:'  OWNER@example.test ',venue_name:'Fixture Dining'});
    assert.equal(claim.status,202);assert.equal(claim.data.pending_review,true);assert.equal(claim.data.token,undefined);
    assert.equal((await api('/login','POST',credentials)).status,403);
    assert.equal((await api('/login','POST',{...credentials,password:'incorrect'})).status,401);
    assert.equal((await api('/me')).status,401);

    // Separate review decision, only inside this disposable fixture.
    await db.query("UPDATE business_users SET status='active' WHERE id=$1",[claim.data.user.id]);
    await db.query('INSERT INTO business_venues(business_user_id,venue_id) VALUES ($1,$2)',[claim.data.user.id,second]);
    const login=await api('/login','POST',credentials);assert.equal(login.status,200);token=login.data.token;
    assert.equal((await api('/me')).data.user.venue_id,venueId);
    for (const path of ['/me','/venues','/venue','/photos','/promos','/analytics']) {
        const authenticated = await api(path);
        assert.equal(authenticated.cache,'private, no-store',path);
    }
    assert.equal((await api('/analytics')).status,503);
    assert.equal((await api('/venues')).status,200);
    assert.deepEqual((await api('/venues')).data.venues.map(v=>v.id),[venueId,second]);
    assert.equal((await api('/venue?venue_id='+second)).data.venue.id,second);
    assert.equal((await api('/venue?venue_id='+unrelated)).status,403);
    assert.equal((await api('/venue?venue_id='+unrelated,'PATCH',{hours_display:'Do not save'})).status,403);
    await db.exec('CREATE TABLE users(id uuid PRIMARY KEY, email text, display_name text, username text); CREATE TABLE reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, venue_id uuid, rating int, content text, created_at timestamptz DEFAULT now())');
    await db.query("INSERT INTO reviews(venue_id,rating,content) VALUES ($1,5,'Review for dining'),($2,4,'Review for annex')",[venueId,second]);
    const saved=await api('/venue?venue_id='+venueId,'PATCH',{hours_display:'Thu–Sun 4–10',expected_active_venue_id:venueId});
    assert.equal(saved.status,200);assert.equal(saved.data.venue.hours_display,'Thu–Sun 4–10');
    assert.equal((await api('/me')).data.user.venue.hours_display,'Thu–Sun 4–10');

    const photo=await api('/photos?venue_id='+venueId,'POST',{url:'https://fixture.example.test/cafe.jpg',caption:'Café'});
    assert.equal(photo.status,200);assert.equal((await api('/photos?venue_id='+venueId)).data.photos[0].id,photo.data.photo.id);
    assert.equal((await api('/photos?venue_id='+second)).data.photos.length,0);
    const promo=await api('/promos?venue_id='+venueId,'POST',{title:'Fixture dinner'});
    assert.equal(promo.status,200);
    const promoPath='/promos/'+promo.data.promo.id+'?venue_id='+venueId;
    assert.equal((await api(promoPath,'PATCH',{is_active:false})).data.promo.is_active,false);
    assert.equal((await api(promoPath,'PATCH',{is_active:true})).data.promo.is_active,true);
    assert.equal((await api('/promos?venue_id='+venueId)).data.promos[0].id,promo.data.promo.id);
    const report=id=>'/listings/'+id+'/analytics?days=30';
    assert.equal((await api(report(unrelated))).status,403);
    assert.equal((await api(report(venueId))).status,503);
    await db.exec('CREATE TABLE analytics_events(event text,properties jsonb,created_at timestamptz DEFAULT now())');
    for(const [event,id,days] of [['venue_save',venueId,1],['review_post',second,2],['venue_save',unrelated,1],
        ['venue_save',venueId,45],['page_view',venueId,1]]) {
        await db.query("INSERT INTO analytics_events VALUES ($1,jsonb_build_object('venue_id',$2::text),now()-make_interval(days=>$3))",[event,id,days]);
    }
    const r=await api(report(venueId));assert.equal(r.status,200);assert.equal(r.data.counts.save,1);assert.equal(r.data.total,1);
    assert.deepEqual(r.data.metrics,['save','checkin','review_post','booking_click']);
    const compat=await api('/analytics');
    assert.equal(compat.data.views,null);
    assert.equal(compat.data.engagement,null);
    assert.equal(compat.data.saves,1);
    assert.equal('view' in compat.data.counts,false);
    assert.equal((await api('/analytics?venue_id='+unrelated)).status,403);
    const annex=await api(report(second));assert.equal(annex.status,200);assert.equal(annex.data.counts.review_post,1);
    await db.exec('DROP TABLE analytics_events; CREATE TABLE analytics_events(action text,venue_id uuid,created_at timestamptz DEFAULT now())');
    const zero=await api(report(venueId));assert.equal(zero.status,200);assert.equal(zero.data.total,0);
    await db.query("INSERT INTO analytics_events(action,venue_id) VALUES ('view',$1)",[venueId]);
    assert.equal((await api(report(venueId))).data.counts.view,1);

    const switchTo = (venue_id, expected_active_venue_id) => api('/venues/switch','POST',{venue_id,expected_active_venue_id});
    assert.equal((await switchTo('not-a-location',venueId)).status,400);
    assert.equal((await switchTo(second,'not-a-location')).status,400);
    assert.equal((await switchTo(unrelated,venueId)).status,403);
    assert.equal((await api('/me')).data.user.venue_id,venueId);

    const switched=await switchTo(second,venueId);
    assert.equal(switched.status,200);
    assert.equal(switched.cache,'private, no-store');
    assert.deepEqual(switched.data,{ok:true,active_venue_id:second});
    const afterSwitch=(await api('/me')).data.user;
    assert.equal(afterSwitch.venue_id,second);
    assert.equal(afterSwitch.venue.hours_display,null);
    const reviews=await api('/reviews?venue_id='+venueId);
    assert.equal(reviews.status,200);
    assert.equal(reviews.cache,'private, no-store');
    assert.equal(reviews.data.venue_id,venueId);
    assert.deepEqual(reviews.data.reviews.map(row=>row.content),['Review for dining']);
    assert.deepEqual((await api('/reviews')).data.reviews.map(row=>row.content),['Review for annex']);
    assert.equal((await api('/photos')).data.photos.length,0);
    assert.equal((await switchTo(venueId,venueId)).status,409);
    assert.equal((await api('/me')).data.user.venue_id,second);
    assert.equal((await api('/venue?venue_id='+venueId,'PATCH',{hours_display:'Stale hours',expected_active_venue_id:venueId})).status,409);
    assert.equal((await api('/venue?venue_id='+venueId,'PATCH',{hours_display:'Mismatched location',expected_active_venue_id:second})).status,409);
    assert.equal((await api('/venue?venue_id='+venueId)).data.venue.hours_display,'Thu–Sun 4–10');
    assert.equal((await api('/venue?venue_id='+second)).data.venue.hours_display,null);

    const renameOther=await api('/venue?venue_id='+venueId,'PATCH',{name:'Renamed first location'});
    assert.equal(renameOther.status,200);
    const afterRename=(await api('/me')).data.user;
    assert.equal(afterRename.venue_name,'Fixture Annex');
    assert.equal(afterRename.venue_id,second);
    assert.equal((await switchTo(venueId,second)).status,200);
    if (process.env.SCENELINK_BROWSER_MODULE_ROOT) {
        await t.test('Chromium signs in, keeps a cancelled draft and persists the right hours after switching and reloading',
            async () => {
                const {chromium} = require(path.join(process.env.SCENELINK_BROWSER_MODULE_ROOT,'playwright'));
                const launch = process.env.SCENELINK_CHROMIUM_PATH ? {executablePath:process.env.SCENELINK_CHROMIUM_PATH} : {};
                const browser = await chromium.launch(launch);
                try {
                    const origin='http://127.0.0.1:'+server.address().port;
                    const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
                    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
                    const page=await context.newPage();page.setDefaultTimeout(10000);
                    const input=page.locator('#bdEditHours');
                    const showEdit=()=>page.locator('.bd-tab[data-panel=listing]').click();
                    const openSecond=async()=>{await page.selectOption('#bdVenueSelect',second);await page.click('#bdSwitchLocation');};
                    await page.goto(origin+'/business.html');
                    await page.click('#bizLoginBtn');
                    await page.fill('#bzEmail',credentials.email);
                    await page.fill('#bzPass',credentials.password);
                    await page.click('#bzLoginSubmit');
                    await page.locator('#bizDashboard.active').waitFor();
                    assert.equal(await page.locator('#bdVName').innerText(),'Renamed first location');
                    await showEdit();
                    assert.equal(await input.inputValue(),'Thu–Sun 4–10');
                    await input.fill('Keep this draft');
                    await openSecond();
                    await page.click('#bdKeepEditing');
                    assert.equal(await input.inputValue(),'Keep this draft');
                    await openSecond();
                    await Promise.all([page.waitForNavigation(),page.click('#bdDiscardAndSwitch')]);
                    await page.locator('#bizDashboard.active').waitFor();
                    assert.equal(await page.locator('#bdVName').innerText(),'Fixture Annex');
                    await showEdit();
                    assert.equal(await input.inputValue(),'');
                    await input.fill('Annex: Friday 5–9');
                    const [write] = await Promise.all([
                        page.waitForResponse(r=>r.request().method()==='PATCH' && new URL(r.url()).pathname==='/api/business/venue'),
                        page.click('#bdSaveListing')
                    ]);
                    assert.equal(write.status(),200);
                    assert.equal((await write.json()).venue.id,second);
                    await page.reload();
                    await page.locator('#bizDashboard.active').waitFor();
                    await showEdit();
                    assert.equal(await input.inputValue(),'Annex: Friday 5–9');
                    await page.selectOption('#bdVenueSelect',venueId);
                    await Promise.all([page.waitForNavigation(),page.click('#bdSwitchLocation')]);
                    await page.locator('#bizDashboard.active').waitFor();
                    await showEdit();
                    assert.equal(await input.inputValue(),'Thu–Sun 4–10');
                    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
                } finally {await browser.close();}
            });
    }
    const returnToFirst=(await api('/me')).data.user;
    assert.equal(returnToFirst.venue_id,venueId);
    assert.equal(returnToFirst.venue.hours_display,'Thu–Sun 4–10');
    assert.equal(returnToFirst.venue_name,'Renamed first location');
    assert.equal((await api('/photos')).data.photos[0].id,photo.data.photo.id);

    // With a different approved identity, even an existing listing and its photos/promos stay private.
    const primaryToken = token;
    const otherEmail = 'another-owner@example.test';
    await db.query("INSERT INTO business_users(email,password_hash,venue_name,venue_id,status) SELECT $1,password_hash,'Unrelated fixture',$2,'active' FROM business_users WHERE id=$3",
        [otherEmail,unrelated,claim.data.user.id]);
    const otherLogin=await api('/login','POST',{email:otherEmail,password:credentials.password});
    assert.equal(otherLogin.status,200);
    token=otherLogin.data.token;
    assert.equal((await api('/me')).data.user.venue_id,unrelated);
    assert.deepEqual((await api('/venues')).data.venues.map(v=>v.id),[unrelated]);
    for (const path of ['/venue','/photos','/promos','/reviews','/analytics']) assert.equal((await api(path+'?venue_id='+venueId)).status,403);
    assert.equal((await api('/venue?venue_id='+venueId,'PATCH',{hours_display:'Unauthorized edit'})).status,403);
    token=primaryToken;

    assert.equal((await api('/forgot-password','POST',{email:credentials.email})).status,202);
    const mailed=new URL(inboxLink);
    assert.equal(mailed.pathname,'/business-reset-password.html');assert.equal(mailed.search,'');
    const recovery=new URLSearchParams(mailed.hash.slice(1)).get('token');
    const reset={password:' new fixture password ',token:recovery};
    assert.equal((await api('/reset-password','POST',reset)).status,200);
    assert.equal((await api('/me')).status,401);
    assert.equal((await api('/reset-password','POST',reset)).status,400);
    const resumed=await api('/login','POST',{...credentials,password:reset.password});assert.equal(resumed.status,200);
    token=resumed.data.token;
    assert.equal((await api('/logout','POST',{})).status,200);assert.equal((await api('/me')).status,401);
});
