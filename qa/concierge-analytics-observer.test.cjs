'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const analyticsWrites = require('../src/services/analytics-writes');
const { observeConciergeAnalytics } = require('./helpers/concierge-analytics-observer.cjs');

const BOB = '00000000-0000-4000-8000-000000000002';
const ALICE = '00000000-0000-4000-8000-000000000001';
const turn = () => new Promise(setImmediate);

function actualHandler(pool, model) {
    const file = require.resolve('../src/routes/concierge.js');
    const realRequire = createRequire(file);
    const loaded = { exports: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        module: loaded, console,
        require(name) {
            if (name === '../config/database') return pool;
            if (name === '../middleware/auth') return { optionalAuth: (_req, _res, next) => next() };
            if (name === '../middleware/rateLimits') return { aiLimiter: (_req, _res, next) => next() };
            if (name === './conciergeAI') return {
                isEnabled: access => model && access.userId === BOB && access.optedIn === true,
                runAIConcierge: async () => ({ source: 'openai', reply: 'Fictional catalog response',
                    candidates: [], recommendedVenues: [], recommendedPlan: null })
            };
            return realRequire(name);
        }
    }, { filename: file });
    return loaded.exports.stack.find(layer => layer.route?.path === '/' && layer.route.methods.post).route.stack.at(-1).handle;
}

for (const model of [false, true]) {
    test((model ? 'model' : 'directory') + ' response and INSERT can precede COMMIT; QA awaits the whole writer', async t => {
        const commit = Promise.withResolvers(), guestInsert = Promise.withResolvers();
        const inserted = [], committed = [], locks = []; let commitStarted = false, releases = 0;
        const row = values => ({ user_id: values[1], anon: values[2], properties: JSON.parse(values[4]) });
        const pool = {
            query(sql, values) {
                if (!/INSERT INTO analytics_events/.test(sql)) return Promise.resolve({ rows: [] });
                return guestInsert.promise.then(() => { committed.push(row(values)); return { rows: [], rowCount: 1 }; });
            },
            async connect() {
                let pendingRow;
                return {
                    query(sql, values) {
                        if (/FROM users WHERE id=\$1 FOR KEY SHARE/.test(sql)) {
                            locks.push(values[0]); return Promise.resolve({ rows: [{ id: values[0] }] });
                        }
                        if (/INSERT INTO analytics_events/.test(sql)) {
                            pendingRow = row(values); inserted.push(pendingRow);
                            return Promise.resolve({ rows: [], rowCount: 1 });
                        }
                        if (sql === 'COMMIT') {
                            commitStarted = true;
                            return commit.promise.then(() => { committed.push(pendingRow); return { rows: [] }; });
                        }
                        return Promise.resolve({ rows: [] });
                    },
                    release() { releases++; }
                };
            }
        };
        const originalQuery = pool.query, originalInsert = analyticsWrites.insert;
        const observer = observeConciergeAnalytics(pool);
        t.after(() => observer.restore());
        const handler = actualHandler(pool, model);
        const session = 'qa-controlled-analytics-order';
        for (const user of [{ id: BOB }, null]) {
            let response;
            await handler({ user, body: { message: 'Find restaurants', ai: model,
                session_id: session, user_id: ALICE, userId: ALICE } }, {
                setHeader() {}, status(code) { assert.equal(code, 200); return this; },
                json(value) { response = value; }
            });
            assert.equal(response.ok, true);
            assert.equal(response.source, model && user ? 'openai' : 'rule-based');
        }
        await turn();
        assert.equal(inserted.length, 1, 'The authenticated INSERT has already returned');
        assert.equal(commitStarted, true, 'The actual production writer is waiting for COMMIT');
        assert.deepEqual(locks, [BOB]);
        assert.deepEqual(committed, [], 'HTTP and INSERT completion do not establish committed analytics');
        let settled = false;
        const barrier = observer.settleSession(session).then(count => { settled = true; return count; });
        await turn();
        assert.equal(settled, false);
        guestInsert.resolve();
        await turn();
        assert.deepEqual(committed.map(row => [row.user_id, row.anon]), [[null, true]]);
        assert.equal(settled, false, 'The authenticated INSERT returned, but its COMMIT is still pending');
        commit.resolve();
        assert.equal(await barrier, 2);
        assert.equal(settled, true); assert.equal(releases, 1);
        assert.deepEqual(committed.map(row => [row.user_id, row.anon]), [[null, true], [BOB, false]]);
        assert(committed.every(row => !Object.hasOwn(row.properties, 'message') &&
            !Object.hasOwn(row.properties, 'history') && !Object.hasOwn(row.properties, 'context')));
        observer.restore();
        assert.equal(analyticsWrites.insert, originalInsert);
        assert.equal(pool.query, originalQuery, 'Observer must not replace pool queries');
    });
}

for (const phase of ['INSERT', 'COMMIT']) {
    test(phase + ' rejection still fails QA after the actual handler catches the write failure', async t => {
        const failed = Promise.withResolvers(), statements = []; let releases = 0;
        const pool = {
            query() { return Promise.resolve({ rows: [] }); },
            async connect() {
                return {
                    query(sql, values) {
                        statements.push(sql);
                        if (/FROM users WHERE id=\$1 FOR KEY SHARE/.test(sql)) return Promise.resolve({ rows: [{ id: values[0] }] });
                        if (phase === 'INSERT' && /INSERT INTO analytics_events/.test(sql) || phase === 'COMMIT' && sql === 'COMMIT') return failed.promise;
                        return Promise.resolve({ rows: [], rowCount: 1 });
                    },
                    release() { releases++; }
                };
            }
        };
        const observer = observeConciergeAnalytics(pool);
        t.after(() => observer.restore());
        let response;
        await actualHandler(pool, false)({ user: { id: BOB }, body: { message: 'Find restaurants', session_id: 'failed-session' } }, {
            setHeader() {}, status(code) { assert.equal(code, 200); return this; }, json(value) { response = value; }
        });
        assert.equal(response.ok, true);
        await turn();
        const failure = new Error('Synthetic analytics ' + phase + ' rejection');
        const checked = assert.rejects(observer.settleSession('failed-session'), error =>
            error instanceof AggregateError && error.errors.length === 1 && error.errors[0] === failure);
        failed.reject(failure);
        await checked;
        assert(statements.includes('ROLLBACK')); assert.equal(releases, 1);
    });
}

test('observer preserves writer promise and receiver; unrelated pools, events and sessions do not delay its barrier', async t => {
    const unrelated = Promise.withResolvers(), own = Promise.withResolvers();
    const pool = {}, otherPool = {}, productionInsert = analyticsWrites.insert;
    function original(writerPool, _sql, values) {
        assert.equal(this, analyticsWrites);
        return writerPool === pool && values?.[0] === 'concierge_query' && values?.[3] === 'own-session' ? own.promise : unrelated.promise;
    }
    analyticsWrites.insert = original;
    const observer = observeConciergeAnalytics(pool);
    t.after(() => { unrelated.resolve({ rows: [] }); observer.restore(); analyticsWrites.insert = productionInsert; });
    const sql = 'INSERT INTO analytics_events VALUES ($1,$2,$3,$4)';
    assert.equal(analyticsWrites.insert(pool, 'SELECT 1'), unrelated.promise);
    assert.equal(analyticsWrites.insert(pool, sql, ['page_view', null, true, 'own-session']), unrelated.promise);
    assert.equal(analyticsWrites.insert(otherPool, sql, ['concierge_query', BOB, false, 'own-session']), unrelated.promise);
    assert.equal(analyticsWrites.insert(pool, sql, ['concierge_query', BOB, false, 'other-session']), unrelated.promise);
    assert.equal(analyticsWrites.insert(pool, sql, ['concierge_query', BOB, false, 'own-session']), own.promise);
    let settled = false;
    const barrier = observer.settleSession('own-session').then(count => { settled = true; return count; });
    own.resolve({ rows: [] }); await turn();
    assert.equal(settled, true, 'Unrelated work is deliberately still pending');
    assert.equal(await barrier, 1);
    await assert.rejects(observer.settleSession('never-written'), /No Concierge analytics writes/);
    const wrapped = analyticsWrites.insert, replacement = () => unrelated.promise;
    analyticsWrites.insert = replacement; observer.restore();
    assert.equal(analyticsWrites.insert, replacement, 'Restoration must not overwrite another owner');
    analyticsWrites.insert = wrapped; observer.restore();
    assert.equal(analyticsWrites.insert, original);
});
