'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID, randomBytes} = require('node:crypto');
const {once} = require('node:events');
const express = require('express');
const jwt = require('jsonwebtoken');
const {PGlite} = require('@electric-sql/pglite');
const {makeAuth} = require('../src/launch/session');

test('comment withdrawal preserves ownership without disclosing an inaccessible parent post', async t => {
    const db = new PGlite();
    let server, failCount = false;
    t.after(async () => {
        if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
        await db.close();
    });
    await db.exec(`
        CREATE TABLE users (id uuid PRIMARY KEY, email text, username text, display_name text, avatar_url text,
            role text DEFAULT 'user', auth_version int DEFAULT 0, is_active boolean DEFAULT true,
            is_suspended boolean DEFAULT false, is_private boolean DEFAULT false, allow_messages text DEFAULT 'everyone',
            email_verified_at timestamptz DEFAULT now(), verified_email text);
        CREATE TABLE auth_revocations (token_hash text, expires_at timestamptz);
        CREATE TABLE venues (id uuid PRIMARY KEY, name text, slug text);
        CREATE TABLE user_blocks (blocker_id uuid, blocked_id uuid);
        CREATE TABLE friendships (user_a_id uuid, user_b_id uuid, status text);
        CREATE TABLE posts (id uuid PRIMARY KEY, user_id uuid REFERENCES users(id), body text, venue_id uuid,
            image_url text, thumb_url text, created_at timestamptz DEFAULT now(), audience text DEFAULT 'public',
            is_public boolean DEFAULT true, ref_type text, ref_id uuid, comment_count int DEFAULT 0, like_count int DEFAULT 0);
        CREATE TABLE post_likes (id uuid DEFAULT gen_random_uuid(), post_id uuid, user_id uuid);
        CREATE TABLE post_comments (id uuid PRIMARY KEY, post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
            user_id uuid REFERENCES users(id), body text, created_at timestamptz DEFAULT now());
        CREATE TABLE lists (id uuid, user_id uuid, is_public boolean);
        CREATE TABLE plans (id uuid, user_id uuid);
        CREATE TABLE plan_invites (plan_id uuid, invitee_id uuid, status text);
    `);
    const query = (sql, values) => {
        if (failCount && /^\s*UPDATE posts SET comment_count/i.test(sql)) throw Error('Fictional comment count failure');
        return db.query(sql, values);
    };
    const pool = {query, connect:async () => ({query, release(){}})};
    const auth = makeAuth({jwt, pool, secret:randomBytes(48).toString('hex')});
    const app = express(), router = express.Router();
    app.use(express.json());
    require('../src/launch/posts').install({router, pool, auth, write:(_req,_res,next) => next()});
    app.use('/api', router);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const author = randomUUID(), owner = randomUUID(), stranger = randomUUID();
    const tokens = {};
    for (const id of [author, owner, stranger]) {
        const email = id + '@example.invalid';
        await db.query('INSERT INTO users(id,email,verified_email,username,display_name) VALUES($1,$2,$2,$3,$3)', [id, email, 'fictional_' + id.slice(0,8)]);
        tokens[id] = auth.generateToken({id, role:'user', auth_version:0});
    }
    async function api(actor, method, path) {
        const response = await fetch(base + '/api' + path, {method,
            headers:actor ? {Authorization:'Bearer ' + tokens[actor]} : {}});
        return {status:response.status, body:await response.json(), cache:response.headers.get('cache-control')};
    }
    async function fixture() {
        await db.exec('DELETE FROM user_blocks');
        await db.query('UPDATE users SET is_private=false,is_active=true,is_suspended=false,email_verified_at=now(),verified_email=lower(email)');
        const post = randomUUID(), comment = randomUUID(), otherComment = randomUUID();
        await db.query("INSERT INTO posts(id,user_id,body,comment_count) VALUES($1,$2,'Fictional parent post',2)", [post, owner]);
        await db.query(`INSERT INTO post_comments(id,post_id,user_id,body) VALUES
            ($1,$2,$3,'Fictional author comment'),($4,$2,$5,'Fictional other comment')`, [comment, post, author, otherComment, stranger]);
        return {post, comment, otherComment, path:'/posts/' + post + '/comments/' + comment};
    }
    const savedCount = async post => (await db.query(`SELECT comment_count,
        (SELECT count(*)::int FROM post_comments WHERE post_id=$1) AS actual_count FROM posts WHERE id=$1`, [post])).rows[0];
    async function assertPrivateWithdrawal(entry) {
        assert.equal((await api(author, 'GET', '/posts/' + entry.post)).status, 404);
        const removed = await api(author, 'DELETE', entry.path);
        assert.equal(removed.status, 200);
        assert.deepEqual(removed.body, {removed:true, id:entry.comment});
        assert.match(removed.cache, /no-store/);
        assert.deepEqual(await savedCount(entry.post), {comment_count:1, actual_count:1});
    }

    await t.test('own comment can be withdrawn after a block in either direction', async () => {
        for (const [blocker, blocked] of [[author, owner], [owner, author]]) {
            const entry = await fixture();
            await db.query('INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2)', [blocker, blocked]);
            const publicBefore = await api(null, 'GET', '/posts/' + entry.post + '/comments');
            assert(publicBefore.body.comments.some(comment => comment.id === entry.comment));
            await assertPrivateWithdrawal(entry);
            const publicAfter = await api(null, 'GET', '/posts/' + entry.post + '/comments');
            assert(!publicAfter.body.comments.some(comment => comment.id === entry.comment));
        }
    });

    await t.test('own withdrawal survives private-profile, audience and inactive-author transitions', async () => {
        for (const change of ['profile', 'audience', 'inactive']) {
            const entry = await fixture();
            if (change === 'profile') await db.query('UPDATE users SET is_private=true WHERE id=$1', [owner]);
            if (change === 'audience') await db.query("UPDATE posts SET audience='private',is_public=false WHERE id=$1", [entry.post]);
            if (change === 'inactive') await db.query('UPDATE users SET is_active=false WHERE id=$1', [owner]);
            await assertPrivateWithdrawal(entry);
        }
    });

    await t.test('visible authors and post owners retain the existing count response', async () => {
        for (const actor of [author, owner]) {
            const entry = await fixture();
            const removed = await api(actor, 'DELETE', entry.path);
            assert.equal(removed.status, 200);
            assert.deepEqual(removed.body, {removed:true, id:entry.comment, comment_count:1});
            assert.deepEqual(await savedCount(entry.post), {comment_count:1, actual_count:1});
        }
    });

    await t.test('strangers and mismatched post/comment IDs cannot remove another comment', async () => {
        const entry = await fixture(), differentPost = randomUUID();
        assert.equal((await api(stranger, 'DELETE', entry.path)).status, 404);
        await db.query('UPDATE users SET is_private=true WHERE id=$1', [owner]);
        assert.equal((await api(stranger, 'DELETE', entry.path)).status, 404);
        await db.query("INSERT INTO posts(id,user_id,body) VALUES($1,$2,'Different fictional post')", [differentPost, author]);
        assert.equal((await api(author, 'DELETE', '/posts/' + differentPost + '/comments/' + entry.comment)).status, 404);
        assert.equal((await api(null, 'DELETE', entry.path)).status, 401);
        assert.deepEqual(await savedCount(entry.post), {comment_count:2, actual_count:2});
    });

    await t.test('current verification and documented-fixture participation policies stay enforced', async () => {
        const entry = await fixture();
        await db.query('UPDATE users SET email_verified_at=NULL WHERE id=$1', [author]);
        assert.equal((await api(author, 'DELETE', entry.path)).status, 403);
        await db.query("UPDATE users SET email='reviewer@scenelink.app',verified_email='reviewer@scenelink.app',email_verified_at=now() WHERE id=$1", [author]);
        assert.equal((await api(author, 'DELETE', entry.path)).status, 403);
        await db.query('UPDATE users SET email=$2,verified_email=$2 WHERE id=$1', [author, author + '@example.invalid']);
        assert.deepEqual(await savedCount(entry.post), {comment_count:2, actual_count:2});
    });

    await t.test('count failure rolls back the removal', async () => {
        const entry = await fixture();
        failCount = true;
        let failed;
        try { failed = await api(author, 'DELETE', entry.path); }
        finally { failCount = false; }
        assert.equal(failed.status, 500);
        assert.equal(failed.body.removed, undefined);
        assert.deepEqual(await savedCount(entry.post), {comment_count:2, actual_count:2});
    });
});
