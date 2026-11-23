'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

test('mounted admin Users SQL binds list and count against a disposable database', async t => {
    const pool = new PGlite();
    t.after(() => pool.close());
    const routes = new Map();
    const requireAdmin = () => { throw new Error('Fixture invokes only the guarded handler'); };
    const router = new Proxy({}, { get(_, method) {
        return (route, ...handlers) => routes.set(method + ' ' + route, handlers);
    } });
    const dir = path.resolve(__dirname, '../src/routes');
    const file = path.join(dir, 'admin.js');
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        module: { exports: {} },
        console: { error() {} },
        require(name) {
            if (name === 'express') return { Router: () => router };
            if (name === '../config/database') return pool;
            if (name === '../middleware/auth') return { requireAdmin };
            if (name === '../launch/official-event-stage' || name === '../launch/shared') return {};
            throw new Error('Unexpected fixture dependency: ' + name);
        }
    }, { filename: file });
    const [guard, handler] = routes.get('get /users');
    assert.equal(guard, requireAdmin, 'Users route must keep its existing permission middleware');
    await pool.exec(`
        CREATE TABLE users (
            id text PRIMARY KEY, email text, display_name text, username text, avatar_url text,
            neighborhood text, role text, oauth_provider text, is_active boolean,
            created_at timestamptz, updated_at timestamptz
        );
        CREATE TABLE checkins (user_id text);
        CREATE TABLE favorites (user_id text);
        INSERT INTO users (id,email,display_name,username,created_at) VALUES
            ('a','target@example.test','Alpha','alpha','2026-01-01'),
            ('b','bravo@example.test','TARGET in name','bravo','2026-01-01'),
            ('c','charlie@example.test','Charlie','my-target','2026-01-01'),
            ('d','delta@example.test','Delta','delta','2026-02-01');
        INSERT INTO checkins VALUES ('b');
        INSERT INTO favorites VALUES ('b'),('b');
    `);
    async function users(query) {
        let status = 200, body;
        await handler({ query }, {
            status(code) { status = code; return this; },
            json(value) { body = JSON.parse(JSON.stringify(value)); }
        });
        assert.equal(status, 200, JSON.stringify(body));
        return body;
    }
    const first = await users({ search: '  TaRgEt  ', page: '1', limit: '2' });
    assert.deepEqual(first.users.map(row => row.id), ['c','b']);
    assert.equal(first.search_supported,true);
    assert.deepEqual([first.total,first.page,first.limit,first.pages],[3,1,2,2]);
    assert.equal(Number(first.users[1].checkin_count),1);
    assert.equal(Number(first.users[1].favorite_count),2);
    const second = await users({ search: 'target', page: '2', limit: '2' });
    assert.deepEqual(second.users.map(row => row.id), ['a']);
    assert.deepEqual([second.total,second.page,second.limit,second.pages],[3,2,2,2]);
    assert.deepEqual(await users({ search: 'no matches' }),{users:[],total:0,search_supported:true,page:1,limit:50,pages:0});
    const unfiltered = await users({ search: '  ', page: '0', limit: '-5' });
    assert.deepEqual(unfiltered.users.map(row => row.id), ['d','c','b','a']);
    assert.deepEqual([unfiltered.total,unfiltered.page,unfiltered.limit,unfiltered.pages],[4,1,50,1]);
    const capped = await users({ page: '9007199254740991', limit: '1000' });
    assert.deepEqual([capped.page,capped.limit,capped.total],[1,100,4]);
});
