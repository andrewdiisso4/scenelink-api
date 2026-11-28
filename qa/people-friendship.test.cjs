'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { once } = require('node:events');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PGlite } = require('@electric-sql/pglite');
const { makeAuth } = require('../src/launch/session');
const people = require('../src/launch/people');

test('canonical friendship routes preserve consent, message permissions and search privacy', async t => {
  // Actual HTTP handlers, JWT/database authentication and SQL on fictional rows.
  // PGlite has one backend; this test does not establish native lock concurrency.
  const db = new PGlite(); let server;
  t.after(async () => { if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); await db.close(); });
  await db.exec(`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, username text UNIQUE, display_name text,
      avatar_url text, neighborhood text, city text, bio text, created_at timestamptz DEFAULT NOW(),
      is_private boolean NOT NULL DEFAULT true, allow_messages text DEFAULT 'friends', discoverable boolean DEFAULT true,
      social_links jsonb DEFAULT '[]', show_achievements boolean DEFAULT false, is_active boolean DEFAULT true,
      is_suspended boolean DEFAULT false, role text DEFAULT 'user', auth_version int DEFAULT 0,
      email_verified_at timestamptz DEFAULT NOW(), verified_email text
    );
    CREATE TABLE friendships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_a_id uuid REFERENCES users, user_b_id uuid REFERENCES users,
      requester_id uuid REFERENCES users, status text CHECK(status IN ('pending','accepted','declined','blocked')),
      created_at timestamptz DEFAULT NOW(), updated_at timestamptz DEFAULT NOW(),
      CHECK(user_a_id < user_b_id), UNIQUE(user_a_id,user_b_id)
    );
    CREATE TABLE user_blocks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),blocker_id uuid REFERENCES users,blocked_id uuid REFERENCES users,reason text,created_at timestamptz DEFAULT NOW(),UNIQUE(blocker_id,blocked_id));
    CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,actor_id uuid,type text,ref_type text,ref_id uuid,data jsonb);
    CREATE TABLE auth_revocations(token_hash text PRIMARY KEY,expires_at timestamptz);
    CREATE TABLE lists(id uuid PRIMARY KEY,user_id uuid,is_public boolean DEFAULT false);
    CREATE TABLE list_members(list_id uuid,user_id uuid,status text,responded_at timestamptz);
    CREATE TABLE posts(id uuid PRIMARY KEY,user_id uuid,audience text,is_public boolean,ref_type text,ref_id uuid);
    CREATE TABLE plans(id uuid PRIMARY KEY,user_id uuid);
    CREATE TABLE plan_invites(plan_id uuid,invitee_id uuid,status text);
  `);
  const query = (text, values) => db.query(text, values);
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const auth = makeAuth({ jwt, pool, secret: randomBytes(48).toString('hex') });
  const app = express(), router = express.Router(); app.use(express.json());
  people.install({ router, pool, auth, write: (req, res, next) => next() }); app.use('/api', router);
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  async function account(label) {
    const id = randomUUID(), email = id + '@example.invalid';
    const user = (await db.query(`INSERT INTO users(id,email,verified_email,username,display_name,bio,city)
      VALUES($1,$2,$2,$3,$4,'Fictional private biography','Fictional private city') RETURNING *`, [id, email, 'fixture_' + label, 'Fictional ' + label])).rows[0];
    return { ...user, token: auth.generateToken(user) };
  }
  async function api(actor, method, route, body, expected = 200) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + actor.token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert.equal(response.status, expected, method + ' ' + route + ': ' + JSON.stringify(result));
    assert.match(response.headers.get('cache-control'), /no-store/); return result;
  }
  const search = (actor, q) => api(actor, 'GET', '/users/search?q=' + encodeURIComponent(q));
  const request = (actor, target) => api(actor, 'POST', '/friends/request', { user_id: target.id });

  await t.test('message capability agrees across profile, search and accepted roster for every privacy choice', async () => {
    const a = await account('capability_viewer'), b = await account('capability_peer');
    for (const status of [null, 'pending', 'accepted']) {
      if (status === 'pending') await request(a, b);
      if (status === 'accepted') { const pending = (await api(b, 'GET', '/friends/pending')).incoming[0]; await api(b, 'POST', '/friends/accept', { friendship_id: pending.friendship_id }); }
      for (const allow of ['none', 'friends', 'everyone']) {
        await db.query('UPDATE users SET allow_messages=$2 WHERE id=$1', [b.id, allow]);
        const expected = allow === 'everyone' || allow === 'friends' && status === 'accepted';
        assert.equal((await api(a, 'GET', '/users/' + b.id)).can_message, expected);
        const found = (await search(a, b.username)).results[0];
        assert.equal(found.can_message, expected, 'Search must expose the derived capability for ' + status + '/' + allow);
        assert.equal(found.allow_messages, undefined, 'Raw settings stay private');
        if (status === 'accepted') {
          const friend = (await api(a, 'GET', '/friends')).friends[0];
          assert.equal(friend.can_message, expected, 'Accepted friendship cannot override messages=none'); assert.equal(friend.allow_messages, undefined);
        }
      }
    }
  });
  await t.test('request and mutual request stay pending until the recipient accepts; retries do not duplicate notifications', async () => {
    const a = await account('consent_sender'), b = await account('consent_recipient'), stranger = await account('consent_stranger');
    const sent = await api(a, 'POST', '/friends/request', { user_id: b.id, requester_id: b.id, status: 'accepted' });
    assert.equal(sent.status, 'pending'); assert.equal(sent.direction, 'outgoing');
    const repeat = await request(a, b), mutual = await request(b, a);
    assert.equal(repeat.friendship_id, sent.friendship_id); assert.equal(mutual.friendship_id, sent.friendship_id); assert.equal(mutual.status, 'pending'); assert.equal(mutual.direction, 'incoming');
    assert.equal((await db.query("SELECT count(*)::int n FROM notifications WHERE ref_id=$1 AND type='friend_request'", [sent.friendship_id])).rows[0].n, 1);
    await api(a, 'POST', '/friends/accept', { friendship_id: sent.friendship_id }, 403);
    await api(a, 'POST', '/friends/decline', { friendship_id: sent.friendship_id }, 403);
    await api(stranger, 'POST', '/friends/accept', { friendship_id: sent.friendship_id }, 404);
    await api(b, 'DELETE', '/friends/' + a.id, undefined, 404);
    assert.equal((await api(a, 'GET', '/users/' + b.id)).can_view, false);
    const accepted = await api(b, 'POST', '/friends/accept', { friendship_id: sent.friendship_id }); assert.equal(accepted.status, 'accepted');
    await api(b, 'POST', '/friends/accept', { friendship_id: sent.friendship_id });
    assert.equal((await db.query("SELECT count(*)::int n FROM notifications WHERE ref_id=$1 AND type='friend_accepted'", [sent.friendship_id])).rows[0].n, 1);
    assert.equal((await api(a, 'GET', '/users/' + b.id)).can_view, true);
    assert.equal((await api(a, 'GET', '/friends')).friends[0].id, b.id);
    assert.deepEqual(await api(b, 'DELETE', '/friends/' + a.id), { removed: true, user_id: a.id });
    const after = await api(a, 'GET', '/users/' + b.id); assert.equal(after.can_view, false); assert.equal(after.can_message, false); assert.equal(after.user.bio, null); assert.equal(after.user.friend_count, null);
  });
  await t.test('only senders cancel; declines are idempotent and enforce the resend cooldown', async () => {
    const a = await account('cancel_sender'), b = await account('cancel_recipient');
    const sent = await request(a, b); assert.equal((await api(b, 'GET', '/friends/pending')).incoming[0].friendship_id, sent.friendship_id);
    await api(a, 'DELETE', '/friends/' + b.id); assert.deepEqual((await api(b, 'GET', '/friends/pending')).incoming, []);
    await api(b, 'POST', '/friends/accept', { friendship_id: sent.friendship_id }, 404);
    const next = await request(a, b); assert.notEqual(next.friendship_id, sent.friendship_id);
    const declined = await api(b, 'POST', '/friends/decline', { friendship_id: next.friendship_id }); assert.equal(declined.status, 'declined');
    await api(b, 'POST', '/friends/decline', { friendship_id: next.friendship_id });
    await api(b, 'POST', '/friends/accept', { friendship_id: next.friendship_id }, 409);
    await api(a, 'POST', '/friends/request', { user_id: b.id }, 429); await api(b, 'POST', '/friends/request', { user_id: a.id }, 429);
    assert.equal((await db.query('SELECT status FROM friendships WHERE id=$1', [next.friendship_id])).rows[0].status, 'declined');
  });
  await t.test('private discovery is exact-handle opt-in and both-direction blocking revokes visibility and shared lists', async () => {
    const a = await account('privacy_viewer'), b = await account('private_peer');
    await api(null, 'GET', '/users/search?q=fixture', undefined, 401);
    assert(!(await search(a, 'Fictional private')).results.some(u => u.id === b.id));
    const found = (await search(a, '@' + b.username)).results[0]; assert.equal(found.id, b.id);
    for (const key of ['email', 'bio', 'city', 'allow_messages']) assert.equal(found[key], undefined);
    assert.deepEqual((await search(a, '%%')).results, []);
    await db.query('UPDATE users SET discoverable=false WHERE id=$1', [b.id]); assert.equal((await search(a, b.username)).results.length, 0);
    const sent = await request(a, b); await api(b, 'POST', '/friends/accept', { friendship_id: sent.friendship_id });
    assert.equal((await search(a, b.username)).results[0].id, b.id);
    const list = randomUUID(); await db.query('INSERT INTO lists(id,user_id) VALUES($1,$2)', [list, a.id]); await db.query("INSERT INTO list_members VALUES($1,$2,'accepted',NULL)", [list, b.id]);
    await db.query('UPDATE users SET is_suspended=true WHERE id=$1', [b.id]); assert.equal((await search(a, b.username)).results.length, 0); assert.deepEqual((await api(a, 'GET', '/friends')).friends, []); await api(a, 'GET', '/users/' + b.id, undefined, 404);
    await db.query('UPDATE users SET is_suspended=false,discoverable=true WHERE id=$1', [b.id]);
    const blocked = await api(a, 'POST', '/users/' + b.id + '/block', {}, 201); assert.equal(blocked.blocked_id, b.id);
    assert.equal((await db.query('SELECT status FROM list_members WHERE list_id=$1', [list])).rows[0].status, 'removed');
    assert.equal((await db.query('SELECT count(*)::int n FROM notifications WHERE (user_id=$1 AND actor_id=$2) OR (user_id=$2 AND actor_id=$1)', [a.id, b.id])).rows[0].n, 0);
    for (const [actor, target] of [[a, b], [b, a]]) {
      assert.equal((await search(actor, target.username)).results.length, 0); await api(actor, 'GET', '/users/' + target.id, undefined, 404);
      await api(actor, 'POST', '/friends/request', { user_id: target.id }, 404); assert.deepEqual((await api(actor, 'GET', '/friends')).friends, []);
    }
    await api(b, 'POST', '/friends/accept', { friendship_id: sent.friendship_id }, 404);
    await api(b, 'POST', '/users/' + a.id + '/block', {}, 201); await api(a, 'DELETE', '/users/' + b.id + '/block');
    await api(a, 'GET', '/users/' + b.id, undefined, 404);
    await api(b, 'DELETE', '/users/' + a.id + '/block');
    const after = await api(a, 'GET', '/users/' + b.id); assert.equal(after.friendship_status.status, 'declined'); assert.equal(after.can_view, false); assert.equal(after.can_message, false);
    assert.equal((await db.query('SELECT status FROM list_members WHERE list_id=$1', [list])).rows[0].status, 'removed');
  });
});
