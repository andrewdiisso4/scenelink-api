'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID, randomBytes} = require('node:crypto');
const {once} = require('node:events');
const express = require('express');
const jwt = require('jsonwebtoken');
const {PGlite} = require('@electric-sql/pglite');
const {makeAuth} = require('../src/launch/session');

test('review writes validate their contract and commit the review with its aggregate', async t => {
    // Actual HTTP, JWT middleware and route SQL on fictional embedded PostgreSQL.
    // Native multi-connection ordering is covered by review-integrity-integration.cjs.
    const db = new PGlite();
    let server, failAggregate = false;
    t.after(async () => {
        if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
        await db.close();
    });
    await db.exec(`
        CREATE TABLE users (id uuid PRIMARY KEY, email text, role text DEFAULT 'user', auth_version int DEFAULT 0,
            is_active boolean DEFAULT true, is_suspended boolean DEFAULT false, is_private boolean DEFAULT false,
            allow_messages text DEFAULT 'everyone', email_verified_at timestamptz DEFAULT now(), verified_email text);
        CREATE TABLE auth_revocations (token_hash text, expires_at timestamptz);
        CREATE TABLE venues (id uuid PRIMARY KEY, name text, is_active boolean DEFAULT true, business_status text,
            rating decimal(3,2) DEFAULT 0, review_count int DEFAULT 0, updated_at timestamptz DEFAULT now());
        CREATE TABLE reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
            venue_id uuid NOT NULL REFERENCES venues(id), rating decimal(3,2) NOT NULL, content text,
            created_at timestamptz DEFAULT now());
    `);
    const writes = [];
    const query = (sql, values) => {
        if (/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql)) writes.push(sql);
        if (failAggregate && /^\s*UPDATE venues SET/i.test(sql)) throw Error('Fictional aggregate failure');
        return db.query(sql, values);
    };
    const pool = {query, connect:async () => ({query, release(){}})};
    const auth = makeAuth({jwt, pool, secret:randomBytes(48).toString('hex')});
    for (const [path, exports] of [['../src/config/database', pool], ['../src/middleware/auth', auth]]) {
        const id = require.resolve(path), previous = require.cache[id];
        require.cache[id] = {id, filename:id, loaded:true, exports};
        t.after(() => { if (previous) require.cache[id] = previous; else delete require.cache[id]; });
    }
    const routerId = require.resolve('../src/routes/reviews'), previousRouter = require.cache[routerId];
    delete require.cache[routerId];
    t.after(() => { if (previousRouter) require.cache[routerId] = previousRouter; else delete require.cache[routerId]; });
    const app = express();
    app.use(express.json());
    app.use('/api/reviews', require('../src/routes/reviews'));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const author = randomUUID(), fixture = randomUUID();
    await db.query(`INSERT INTO users(id,email,verified_email) VALUES
        ($1,'review-author@example.invalid','review-author@example.invalid'),
        ($2,'reviewer@scenelink.app','reviewer@scenelink.app')`, [author, fixture]);
    const token = id => auth.generateToken({id, role:'user', auth_version:0});
    const tokens = {[author]:token(author), [fixture]:token(fixture)};
    async function submit(body, actor = author) {
        const response = await fetch(base + '/api/reviews', {method:'POST',
            headers:{'Content-Type':'application/json', ...(actor ? {Authorization:'Bearer ' + tokens[actor]} : {})},
            body:JSON.stringify(body)});
        return {status:response.status, body:await response.json(), cache:response.headers.get('cache-control')};
    }
    async function venue(active = true, status = null) {
        const id = randomUUID();
        await db.query("INSERT INTO venues(id,name,is_active,business_status) VALUES($1,'Fictional review venue',$2,$3)", [id, active, status]);
        return id;
    }
    const state = async id => (await db.query(`SELECT rating::text,review_count,
        (SELECT count(*)::int FROM reviews WHERE venue_id=$1) AS rows FROM venues WHERE id=$1`, [id])).rows[0];

    await t.test('rejects nonnumeric, nonfinite and out-of-range ratings before any write', async () => {
        const id = await venue();
        for (const rating of ['NaN', '4', true, [4], {}, null, 0, -1, 5.1]) {
            writes.length = 0;
            const result = await submit({venue_id:id, rating, content:'Fictional invalid review'});
            assert.equal(result.status, 400, 'rating must be a finite JSON number in range');
            assert.deepEqual(writes, []);
        }
        assert.deepEqual(await state(id), {rating:'0.00', review_count:0, rows:0});
    });

    await t.test('matches the 2000-character text limit and rejects nontext and null bytes', async () => {
        const id = await venue();
        for (const content of ['x'.repeat(2001), 'invalid\u0000text', 7, {text:'not a string'}]) {
            writes.length = 0;
            assert.equal((await submit({venue_id:id, rating:4, content})).status, 400);
            assert.deepEqual(writes, []);
        }
        const valid = await submit({venue_id:id, rating:4, content:'x'.repeat(2000)});
        assert.equal(valid.status, 201);
        assert.equal(valid.body.review.content.length, 2000);
    });

    await t.test('rejects inactive, closed and absent venues before inserting reviews', async () => {
        for (const [active, status] of [[false, null], [true, 'CLOSED_PERMANENTLY'],
            [true, 'temporarily_closed'], [true, 'permanently_closed']]) {
            const id = await venue(active, status);
            writes.length = 0;
            assert.equal((await submit({venue_id:id, rating:4})).status, 404);
            assert.deepEqual(writes, []);
            assert.deepEqual(await state(id), {rating:'0.00', review_count:0, rows:0});
        }
        assert.equal((await submit({venue_id:randomUUID(), rating:4})).status, 404);
    });

    await t.test('preserves fractional ratings, blank content and multiple reviews by one author', async () => {
        const id = await venue();
        const first = await submit({venue_id:id, rating:3.5});
        const second = await submit({venue_id:id, rating:4.5, content:null});
        assert.equal(first.status, 201); assert.equal(second.status, 201);
        assert.notEqual(first.body.review.id, second.body.review.id);
        assert.equal(first.body.review.content, ''); assert.equal(second.body.review.content, '');
        assert.match(first.cache, /no-store/);
        assert.deepEqual(await state(id), {rating:'4.00', review_count:2, rows:2});
    });

    await t.test('rolls back the review when the aggregate update fails', async () => {
        const id = await venue();
        assert.equal((await submit({venue_id:id, rating:4})).status, 201);
        const before = await state(id);
        failAggregate = true;
        let failed;
        try { failed = await submit({venue_id:id, rating:2, content:'Must roll back'}); }
        finally { failAggregate = false; }
        assert.equal(failed.status, 500);
        assert.equal(failed.body.review, undefined);
        assert.deepEqual(await state(id), before);
        assert.equal((await submit({venue_id:id, rating:2})).status, 201);
        assert.deepEqual(await state(id), {rating:'3.00', review_count:2, rows:2});
    });

    await t.test('keeps verified fixture exclusion and authentication ahead of writes', async () => {
        const id = await venue();
        writes.length = 0;
        assert.equal((await submit({venue_id:id, rating:4}, fixture)).status, 403);
        assert.equal((await submit({venue_id:id, rating:4}, null)).status, 401);
        assert.deepEqual(writes, []);
    });

    await t.test('limits repeated writes per authenticated author without blocking another author', async () => {
        const limited = randomUUID(), other = randomUUID(), id = await venue();
        for (const actor of [limited, other]) {
            const email = actor + '@example.invalid';
            await db.query('INSERT INTO users(id,email,verified_email) VALUES($1,$2,$2)', [actor, email]);
            tokens[actor] = token(actor);
        }
        writes.length = 0;
        for (let attempt = 0; attempt < 91; attempt++) {
            const result = await submit({venue_id:id, rating:'NaN'}, limited);
            assert.equal(result.status, attempt < 90 ? 400 : 429);
        }
        assert.deepEqual(writes, []);
        assert.equal((await submit({venue_id:id, rating:4}, other)).status, 201);
    });
});
