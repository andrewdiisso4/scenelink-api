'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID, randomBytes} = require('node:crypto');
const {once} = require('node:events');
const express = require('express');
const {PGlite} = require('@electric-sql/pglite');

test('owner claim, session, reporting, listing edit and emailed recovery use the business routes', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    const venueId = randomUUID(), second = randomUUID(), unrelated = randomUUID();
    await db.exec('CREATE TABLE venues(id uuid PRIMARY KEY, name text, type text, neighborhood text, hours_display text, updated_at timestamptz)');
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
    const saved=await api('/venue?venue_id='+venueId,'PATCH',{hours_display:'Thu–Sun 4–10'});
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
    assert.equal((await api('/photos')).data.photos.length,0);
    assert.equal((await switchTo(venueId,venueId)).status,409);
    assert.equal((await api('/me')).data.user.venue_id,second);

    const renameOther=await api('/venue?venue_id='+venueId,'PATCH',{name:'Renamed first location'});
    assert.equal(renameOther.status,200);
    const afterRename=(await api('/me')).data.user;
    assert.equal(afterRename.venue_name,'Fixture Annex');
    assert.equal(afterRename.venue_id,second);
    assert.equal((await switchTo(venueId,second)).status,200);
    const returnToFirst=(await api('/me')).data.user;
    assert.equal(returnToFirst.venue_id,venueId);
    assert.equal(returnToFirst.venue.hours_display,'Thu–Sun 4–10');
    assert.equal(returnToFirst.venue_name,'Renamed first location');
    assert.equal((await api('/photos')).data.photos[0].id,photo.data.photo.id);

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
