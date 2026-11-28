'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const discovery = require('../src/launch/discovery');

const PENDING = '00000000-0000-4000-8000-000000000001';
const PUBLISHED = '00000000-0000-4000-8000-000000000002';

async function fixture(t) {
    const pool = new PGlite();
    t.after(() => pool.close());
    const routes = new Map();
    const requireAdmin = () => { throw new Error('Fixture invokes only the guarded handler'); };
    const router = new Proxy({}, { get(_, method) {
        return (route, ...handlers) => routes.set(method + ' ' + route, handlers);
    } });
    const file = path.resolve(__dirname, '../src/routes/admin.js');
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        module: { exports: {} },
        console: { error() {} },
        require(name) {
            if (name === 'express') return { Router: () => router };
            if (name === '../config/database') return pool;
            if (name === '../middleware/auth') return { requireAdmin };
            throw new Error('Unexpected fixture dependency: ' + name);
        }
    }, { filename: file });
    const [guard, handler] = routes.get('patch /venues/:id');
    assert.equal(guard, requireAdmin, 'Venue updates must keep their existing admin guard');
    await pool.exec(`
        CREATE TABLE venues (
            id uuid PRIMARY KEY, name text, address text, city text, business_status text,
            is_active boolean, needs_manual_review boolean, featured boolean,
            trending boolean, spotlight boolean, updated_at timestamptz
        );
        INSERT INTO venues VALUES
            ('${PENDING}', 'Fictional pending intake', '1 Fiction Street', 'Boston', NULL,
             false, true, false, false, false, '2026-01-01'),
            ('${PUBLISHED}', 'Fictional published venue', '2 Fiction Street', 'Boston', NULL,
             true, false, false, false, false, '2026-01-01');
    `);
    return {
        async patch(id, body) {
            let status = 200, result;
            await handler({ params: { id }, body }, {
                status(code) { status = code; return this; },
                json(value) { result = JSON.parse(JSON.stringify(value)); }
            });
            return { status, body: result };
        },
        async row(id) {
            return (await pool.query('SELECT * FROM venues WHERE id=$1', [id])).rows[0];
        },
        async visibleIds() {
            const query = discovery.build({});
            const result = await pool.query(`SELECT v.id FROM venues v WHERE ${query.where} ORDER BY v.id`, query.values);
            return result.rows.map(row => row.id);
        }
    };
}

test('direct admin activation cannot publish an intake awaiting review', async t => {
    const f = await fixture(t);
    const before = await f.row(PENDING);
    assert.deepEqual(await f.visibleIds(), [PUBLISHED]);
    const result = await f.patch(PENDING, { is_active: true });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'venue_publication_requires_review');
    assert.match(result.body.error, /reviewed activation workflow/i);
    assert.deepEqual(await f.row(PENDING), before);
    assert.deepEqual(await f.visibleIds(), [PUBLISHED], 'Rejected activation must not make the intake discoverable');
});

test('blocked activation cannot partially apply accompanying venue flags', async t => {
    const f = await fixture(t);
    const before = await f.row(PENDING);
    const result = await f.patch(PENDING, { is_active: true, featured: true, trending: true, spotlight: true });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'venue_publication_requires_review');
    assert.deepEqual(await f.row(PENDING), before, 'The complete row must remain unchanged');
    assert.deepEqual(await f.visibleIds(), [PUBLISHED]);
});

test('activation accepts only JSON booleans and rejects coercible values without mutation', async t => {
    const f = await fixture(t);
    const before = await f.row(PENDING);
    for (const value of ['true', 'false', 'yes', 'no', '1', '0', 1, 0, null, [], {}, [true]]) {
        const result = await f.patch(PENDING, { is_active: value, featured: true });
        assert.equal(result.status, 400, 'Invalid is_active: ' + JSON.stringify(value));
        assert.equal(result.body.code, 'invalid_venue_activation');
        assert.deepEqual(await f.row(PENDING), before, 'Invalid activation must not alter any field');
    }
    assert.deepEqual(await f.visibleIds(), [PUBLISHED]);
});

test('admins can still withdraw an existing published venue', async t => {
    const f = await fixture(t);
    assert.deepEqual(await f.visibleIds(), [PUBLISHED]);
    const result = await f.patch(PUBLISHED, { is_active: false });
    assert.equal(result.status, 200);
    assert.equal(result.body.venue.is_active, false);
    assert.equal((await f.row(PUBLISHED)).is_active, false);
    assert.deepEqual(await f.visibleIds(), []);
});

test('featured and trending remain independently editable without publishing an intake', async t => {
    const f = await fixture(t);
    let result = await f.patch(PENDING, { featured: true });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.venue, {
        id: PENDING, name: 'Fictional pending intake', featured: true,
        trending: false, spotlight: false, is_active: false
    });
    result = await f.patch(PENDING, { featured: false, trending: true });
    assert.equal(result.status, 200);
    assert.equal(result.body.venue.featured, false);
    assert.equal(result.body.venue.trending, true);
    const stored = await f.row(PENDING);
    assert.equal(stored.is_active, false);
    assert.equal(stored.needs_manual_review, true);
    assert.deepEqual(await f.visibleIds(), [PUBLISHED]);
});

test('withdrawal can accompany supported flag updates', async t => {
    const f = await fixture(t);
    const result = await f.patch(PUBLISHED, { is_active: false, featured: true, trending: true });
    assert.equal(result.status, 200);
    const stored = await f.row(PUBLISHED);
    assert.equal(stored.is_active, false);
    assert.equal(stored.featured, true);
    assert.equal(stored.trending, true);
    assert.deepEqual(await f.visibleIds(), []);
});
