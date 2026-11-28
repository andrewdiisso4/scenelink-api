'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID, randomBytes} = require('node:crypto');
const {once} = require('node:events');
const {PGlite} = require('@electric-sql/pglite');

test('mounted review routes exclude documented fixtures while preserving real users and admin inventory', async t => {
    // Exercise the real server's canonical-router/legacy-review mount order,
    // JWT middleware and SQL with a disposable embedded PostgreSQL database.
    // No startup workers, external database, mail transport or telemetry run.
    const db = new PGlite();
    let server;
    t.after(async () => {
        if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
        await db.close();
    });
    await db.exec(`
        CREATE TABLE users (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, username text, display_name text,
            avatar_url text, neighborhood text, role text DEFAULT 'user', oauth_provider text,
            is_active boolean DEFAULT true, is_suspended boolean DEFAULT false,
            auth_version int DEFAULT 0, is_private boolean DEFAULT false, allow_messages text DEFAULT 'everyone',
            email_verified_at timestamptz, verified_email text,
            created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
        );
        CREATE TABLE venues (id uuid PRIMARY KEY, name text, rating numeric DEFAULT 0,
            review_count int DEFAULT 0, updated_at timestamptz DEFAULT '2026-01-01');
        CREATE TABLE reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id),
            venue_id uuid REFERENCES venues(id), rating int, content text, created_at timestamptz DEFAULT now());
        CREATE TABLE auth_revocations (token_hash text PRIMARY KEY, expires_at timestamptz);
        CREATE TABLE user_blocks (blocker_id uuid, blocked_id uuid);
        CREATE TABLE friendships (user_a_id uuid, user_b_id uuid, status text);
        CREATE TABLE checkins (user_id uuid);
        CREATE TABLE favorites (user_id uuid);
    `);
    const writes = [];
    const query = (sql, values) => {
        if (/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql)) writes.push(sql);
        return db.query(sql, values);
    };
    function substitute(path, exports) {
        const id = require.resolve(path), old = require.cache[id];
        require.cache[id] = {id, filename:id, loaded:true, exports};
        t.after(() => { if (old) require.cache[id] = old; else delete require.cache[id]; });
    }
    substitute('../src/config/database', {query, connect:async () => ({query, release(){}})});
    substitute('../src/services/mailer', {
        isReady:() => false, isReadyFor:() => false,
        sendMail:async () => { throw Error('Mail must never run in the review policy test'); }
    });
    substitute('../src/sentry', {init(){}, attachRequestHandlers(){}, attachErrorHandler(){}});
    substitute('dotenv', {config:() => ({})});
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
    const app = require('../src/server');
    await require('../src/routes/business').initialize();
    await db.exec(`ALTER TABLE business_users ADD COLUMN auth_version int NOT NULL DEFAULT 0;
        CREATE TABLE business_auth_revocations (token_hash text PRIMARY KEY, expires_at timestamptz)`);
    const auth = require('../src/middleware/auth');
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    async function api(actor, method, path, body, status = 200) {
        const response = await fetch(base + '/api' + path, {method,
            headers:{'Content-Type':'application/json', ...(actor ? {Authorization:'Bearer ' + actor.token} : {})},
            body:body === undefined ? undefined : JSON.stringify(body)});
        const data = await response.json();
        assert.equal(response.status, status, method + ' ' + path + ': ' + JSON.stringify(data));
        return data;
    }
    async function account(email, role = 'user') {
        const user = (await db.query(`INSERT INTO users(email,username,display_name,role,email_verified_at,verified_email)
            VALUES($1::text,$2,'QA demo real-person name',$3,NOW(),lower($1::text)) RETURNING id,role,auth_version`,
            [email,'review_' + randomBytes(6).toString('hex'),role])).rows[0];
        return {...user, token:auth.generateToken(user)};
    }
    const fixtures = [];
    for (const email of ['DeMo@SceneLink.App','reviewer@scenelink.app','reviewer-friend@scenelink.app',
        'seed_reviewer_local@scenelink.app','SEED_REVIEWER_CASE@SCENELINK.APP',
        'qa9a_a_1700000000000@scenelink.test','qa9e_b_1700000000000@scenelink.test']) {
        fixtures.push(await account(email));
    }
    const real = [];
    for (const email of ['ordinary@example.invalid','seedXreviewerYlocal@scenelink.app',
        'seed_reviewer_local@scenelinkXapp','reviewer+local@scenelink.app','ordinary@scenelink.test',
        'qa9a_c_1700000000000@scenelink.test','qa9e_a_1700000000000x@scenelink.test',
        'qa9a_a_1700000000000@example.invalid']) real.push(await account(email));
    const venue = randomUUID(), otherVenue = randomUUID();
    await db.query("INSERT INTO venues(id,name) VALUES($1,'Local review policy venue'),($2,'Other venue')",[venue,otherVenue]);
    const venueState = async () => (await db.query('SELECT rating,review_count,updated_at FROM venues WHERE id=$1',[venue])).rows[0];
    const reviewIds = [];

    await t.test('verified documented fixtures are rejected before any review or venue write', async () => {
        const before = await venueState();
        for (const fixture of fixtures) {
            writes.length = 0;
            const response = await api(fixture,'POST','/reviews',{venue_id:venue,rating:1,content:'Must not persist'},403);
            assert.equal(response.error,'Social participation unavailable');
            assert.deepEqual(writes,[],'Rejection must occur before a review insert or rating update');
        }
        assert.equal((await db.query('SELECT count(*)::int n FROM reviews')).rows[0].n,0);
        assert.deepEqual(await venueState(),before);
    });

    await t.test('similar real addresses can publish reviews and update their venue rating', async () => {
        for (const actor of real) {
            const response = await api(actor,'POST','/reviews',{venue_id:venue,rating:4,content:'A real review'},201);
            reviewIds.push(response.review.id);
            assert.equal(response.review.rating,4);
            assert.equal(response.review.content,'A real review');
        }
        const state = await venueState();
        assert.equal(state.review_count,real.length);
        assert.equal(Number(state.rating),4);
        assert.equal((await db.query('SELECT count(*)::int n FROM reviews')).rows[0].n,real.length);
    });

    await t.test('owner review reads exclude historical fixtures and retain similar real authors', async () => {
        // Historical rows exist only in this disposable test database. Reads
        // must not delete them or rewrite cached aggregate ratings.
        for (const fixture of fixtures) await db.query(
            "INSERT INTO reviews(user_id,venue_id,rating,content) VALUES($1,$2,1,'Historical fixture review')",[fixture.id,venue]);
        await db.query("INSERT INTO reviews(user_id,venue_id,rating,content) VALUES($1,$2,5,'Other venue review')",[real[0].id,otherVenue]);
        const ownerId = randomUUID();
        await db.query(`INSERT INTO business_users(id,email,password_hash,venue_name,venue_id,status)
            VALUES($1,'owner@example.invalid','unused-local-hash','Local review policy venue',$2,'active')`,[ownerId,venue]);
        const owner = {token:auth.generateBusinessToken({id:ownerId,auth_version:0})};
        const before = await venueState();
        writes.length = 0;
        const response = await api(owner,'GET','/business/reviews');
        assert.equal(response.linked,true);
        assert.deepEqual(response.reviews.map(row => row.id).sort(),reviewIds.slice().sort());
        const publicReviews = await api(null,'GET','/reviews?venue_id=' + venue);
        assert.deepEqual(publicReviews.reviews.map(row => row.id).sort(),reviewIds.slice().sort());
        assert.deepEqual(writes,[]);
        assert.deepEqual(await venueState(),before);
        assert.equal((await db.query('SELECT count(*)::int n FROM reviews WHERE venue_id=$1',[venue])).rows[0].n,real.length + fixtures.length);
    });

    await t.test('admin inventory keeps documented fixtures and ordinary users visible', async () => {
        const admin = await account('admin@example.invalid','admin');
        const inventory = await api(admin,'GET','/admin/users?limit=100');
        assert.deepEqual(inventory.users.map(user => user.id).sort(),[...fixtures,...real,admin].map(user => user.id).sort());
        assert.equal(inventory.total,fixtures.length + real.length + 1);
    });
});
