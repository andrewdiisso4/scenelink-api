'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID, randomBytes} = require('node:crypto');
const {once} = require('node:events');
const express = require('express');
const {PGlite} = require('@electric-sql/pglite');
const {build} = require('../src/launch/discovery');

test('owner listing submission keeps public discovery closed and rolls back failed ownership links', async t => {
    // Real route/JWT/SQL checks against synthetic embedded PostgreSQL. This
    // single-backend fixture does not establish native row-lock concurrency.
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`CREATE TABLE venues (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text, name text, type text,
        cuisine text, description text, address text, neighborhood text, city text, state text,
        lat double precision, lng double precision, phone text, website text, price_level int,
        price_label text, cover_image_url text, image_url text, hours_display text, tags jsonb,
        reservation_url text, opentable_url text, resy_url text, rating numeric, review_count int,
        is_active boolean, is_claimed boolean, needs_manual_review boolean,
        business_status text, created_at timestamptz, updated_at timestamptz
    )`);
    let failedWrite = null;
    const query = async (sql, values) => {
        if ((failedWrite === 'primary' && sql.startsWith('UPDATE business_users SET venue_id=$1')) ||
            (failedWrite === 'additional' && sql.trimStart().startsWith('INSERT INTO business_venues'))) {
            throw Error('Synthetic ownership-link failure');
        }
        return db.query(sql, values);
    };
    const pool = {query, connect: async () => ({query, release(){}})};
    function substitute(path, exports) {
        const id = require.resolve(path), old = require.cache[id];
        require.cache[id] = {id, filename:id, loaded:true, exports};
        t.after(() => { if (old) require.cache[id]=old; else delete require.cache[id]; });
    }
    substitute('../src/config/database', pool);
    substitute('../src/services/mailer', {});
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET=oldSecret; });
    const router = require('../src/routes/business');
    await router.initialize();
    await db.exec(`ALTER TABLE business_users ADD COLUMN auth_version int NOT NULL DEFAULT 0;
        CREATE TABLE business_auth_revocations(token_hash text PRIMARY KEY,business_user_id uuid,expires_at timestamptz)`);
    const {generateBusinessToken} = require('../src/middleware/auth');
    const app = express(); app.use(express.json()); app.use('/api/business', router);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const base = 'http://127.0.0.1:' + server.address().port + '/api/business';
    async function owner(tier='enterprise', status='active') {
        const id = randomUUID();
        await db.query(`INSERT INTO business_users(id,email,password_hash,venue_name,status,tier)
            VALUES($1,$2,'unused-fixture-hash','Fictional owner',$3,$4)`, [id,id+'@example.invalid',status,tier]);
        return {id, token:generateBusinessToken({id,auth_version:0})};
    }
    async function api(account, path, method='GET', body) {
        const response = await fetch(base+path, {method, headers:{'Content-Type':'application/json',
            Authorization:'Bearer '+account.token}, body:body && JSON.stringify(body)});
        return {status:response.status, data:await response.json()};
    }
    async function publicIds() {
        const filters = build({});
        return (await db.query('SELECT v.id FROM venues v WHERE '+filters.where,filters.values)).rows.map(row=>row.id);
    }
    const account = await owner();
    let primary, additional;

    await t.test('both creation routes return pending records excluded from discovery', async () => {
        const created = await api(account, '/venue', 'POST', {name:'Fictional first venue',is_active:true,needs_manual_review:false});
        assert.equal(created.status,202); assert.equal(created.data.pending_review,true);
        primary = created.data.venue;
        assert.equal(primary.is_active,false); assert.equal(primary.needs_manual_review,true);
        assert.equal((await api(account,'/me')).data.user.venue_id,primary.id);
        const added = await api(account, '/venues/add', 'POST', {name:'Fictional additional venue',is_active:true});
        assert.equal(added.status,202); assert.equal(added.data.pending_review,true);
        additional = added.data.venue;
        assert.equal(additional.is_active,false); assert.equal(additional.needs_manual_review,true);
        assert.equal((await api(account,'/me')).data.user.venue_id,primary.id);
        const owned = (await api(account,'/venues')).data.venues;
        assert.deepEqual(new Set(owned.map(v=>v.id)),new Set([primary.id,additional.id]));
        assert(owned.every(v=>v.needs_manual_review === true && v.is_active === false));
        assert.deepEqual(await publicIds(),[]);
    });

    await t.test('pending records remain editable and switchable without becoming public', async () => {
        const edited = await api(account, '/venue?venue_id='+primary.id, 'PATCH', {hours_display:'Mon–Fri 4–9',is_active:true});
        assert.equal(edited.status,200); assert.equal(edited.data.venue.hours_display,'Mon–Fri 4–9');
        assert.equal(edited.data.venue.is_active,false); assert.equal(edited.data.venue.needs_manual_review,true);
        assert.equal((await api(account,'/venues/switch','POST',{venue_id:additional.id})).status,200);
        assert.equal((await api(account,'/me')).data.user.venue_id,additional.id);
        assert.equal((await api(account,'/venues/switch','POST',{venue_id:primary.id})).status,200);
        assert.equal((await api(account,'/me')).data.user.venue_id,primary.id);
        assert.equal((await api(account,'/venues/add','POST',{existing_venue_id:primary.id})).data.pending_review,true);
        assert.deepEqual(await publicIds(),[]);
    });

    await t.test('failed first or additional linking leaves no orphan venue', async () => {
        const unlinked = await owner();
        for (const [failure,path,name,target] of [
            ['primary','/venue','Fictional failed primary',unlinked],
            ['additional','/venues/add','Fictional failed additional',account],
            ['primary','/venues/add','Fictional failed add-first primary',unlinked]
        ]) {
            failedWrite=failure;
            let response;
            try { response=await api(target,path,'POST',{name}); }
            finally { failedWrite=null; }
            assert.equal(response.status,500);
            assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM venues WHERE name=$1',[name])).rows[0].n,0);
        }
        assert.equal((await api(unlinked,'/me')).data.user.venue_id,null);
        assert.equal((await api(unlinked,'/venues')).data.venues.length,0);
        assert.equal((await api(account,'/venues')).data.venues.length,2);
    });

    await t.test('an add-first submission establishes an editable pending primary that survives reload', async () => {
        const unlinked = await owner();
        const created = await api(unlinked,'/venues/add','POST',{name:'Fictional add-first primary'});
        assert.equal(created.status,202); assert.equal(created.data.pending_review,true);
        const venueId = created.data.venue.id;
        assert.equal((await api(unlinked,'/me')).data.user.venue_id,venueId);
        const edited = await api(unlinked,'/venue','PATCH',{hours_display:'Tue–Sun 5–10'});
        assert.equal(edited.status,200); assert.equal(edited.data.venue.is_active,false);
        const reloaded = (await api(unlinked,'/me')).data.user;
        assert.equal(reloaded.venue_id,venueId); assert.equal(reloaded.venue.hours_display,'Tue–Sun 5–10');
        assert.equal(reloaded.venue.is_active,false); assert.equal(reloaded.venue.needs_manual_review,true);
        const owned = (await api(unlinked,'/venues')).data.venues;
        assert.equal(owned.length,1); assert.equal(owned[0].is_primary,true);
        assert.equal((await db.query('SELECT is_primary FROM business_venues WHERE business_user_id=$1',[unlinked.id])).rows[0].is_primary,true);
        assert.deepEqual(await publicIds(),[]);
    });

    await t.test('repeat first submissions and cross-route venue limits cannot add extra records', async () => {
        const repeated = await api(account,'/venue','POST',{name:'Fictional repeated first'});
        assert.equal(repeated.status,409);
        assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM venues WHERE name='Fictional repeated first'")).rows[0].n,0);
        const single = await owner('starter');
        const first = await api(single,'/venues/add','POST',{name:'Fictional single-venue plan'});
        assert.equal(first.status,202);
        const repeatedInitial = await api(single,'/venue','POST',{name:'Fictional repeated add-first'});
        assert.equal(repeatedInitial.status,409);
        const overflow = await api(single,'/venues/add','POST',{name:'Fictional over limit'});
        assert.equal(overflow.status,403); assert.equal(overflow.data.current,1); assert.equal(overflow.data.max,1);
        const relinked = await api(single,'/venues/add','POST',{existing_venue_id:first.data.venue.id});
        assert.equal(relinked.status,200); assert.equal(relinked.data.venue.is_active,false);
        assert.equal((await api(single,'/venues')).data.venues.length,1);
    });

    await t.test('pending accounts and unrelated venues remain denied', async () => {
        const pending = await owner('starter','pending');
        assert.equal((await api(pending,'/venue','POST',{name:'Forbidden listing'})).status,401);
        const unrelated = await owner();
        assert.equal((await api(unrelated,'/venues/add','POST',{existing_venue_id:primary.id})).status,403);
        assert.equal((await api(unrelated,'/venue','POST',{name:'   '})).status,400);
    });

    await t.test('editing an existing published listing preserves its publication state', async () => {
        const publishedOwner = await owner('starter'), venueId=randomUUID();
        await db.query("INSERT INTO venues(id,name,is_active,needs_manual_review) VALUES($1,'Existing published fixture',true,false)",[venueId]);
        await db.query('UPDATE business_users SET venue_id=$1 WHERE id=$2',[venueId,publishedOwner.id]);
        const edited = await api(publishedOwner,'/venue','PATCH',{hours_display:'Sat–Sun 10–6'});
        assert.equal(edited.status,200); assert.equal(edited.data.venue.is_active,true);
        assert.equal(edited.data.venue.needs_manual_review,false);
        assert.deepEqual(await publicIds(),[venueId]);
    });
});
