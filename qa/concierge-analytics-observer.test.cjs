'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
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
    test((model ? 'model' : 'directory') + ' response can precede analytics commit; QA awaits every real completion', async t => {
        const pending = [], committed = [];
        const pool = { query(sql, values) {
            if (!/INSERT INTO analytics_events/.test(sql)) return Promise.resolve({ rows: [] });
            const gate = Promise.withResolvers();
            pending.push(gate);
            return gate.promise.then(() => {
                committed.push({ user_id: values[1], anon: values[2], properties: JSON.parse(values[4]) });
                return { rows: [] };
            });
        } };
        const original = pool.query;
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
        assert.equal(pending.length, 2);
        assert.deepEqual(committed, [], 'HTTP completion alone cannot justify reading analytics');
        let settled = false;
        const barrier = observer.settleSession(session).then(count => { settled = true; return count; });
        // Scheduling checkpoints expose an incorrectly immediate/first-write-only
        // barrier without relying on elapsed time or arbitrary sleeps.
        await turn();
        assert.equal(settled, false);
        pending[0].resolve();
        await turn();
        assert.equal(committed.length, 1);
        assert.equal(settled, false, 'The second session write must also commit');
        pending[1].resolve();
        assert.equal(await barrier, 2);
        assert.equal(settled, true);
        assert.deepEqual(committed.map(row => [row.user_id, row.anon]), [[BOB, false], [null, true]]);
        assert(committed.every(row => !Object.hasOwn(row.properties, 'message') &&
            !Object.hasOwn(row.properties, 'history') && !Object.hasOwn(row.properties, 'context')));
        observer.restore();
        assert.equal(pool.query, original);
    });
}

test('analytics rejection still fails QA after the application catches it', async t => {
    const failed = Promise.withResolvers();
    const pool = { query() { return failed.promise; } };
    const observer = observeConciergeAnalytics(pool);
    t.after(() => observer.restore());
    const sql = 'INSERT INTO analytics_events (event,user_id,anon,session_id,properties) VALUES ($1,$2,$3,$4,$5)';
    const application = pool.query(sql, ['concierge_query', BOB, false, 'failed-session', '{}']).catch(() => {});
    const failure = new Error('Synthetic analytics insert rejection');
    const checked = assert.rejects(observer.settleSession('failed-session'), error =>
        error instanceof AggregateError && error.errors.length === 1 && error.errors[0] === failure);
    failed.reject(failure);
    await application;
    await checked;
});

test('observer preserves query identity and does not wait for unrelated events or sessions', async t => {
    const unrelated = Promise.withResolvers(), own = Promise.withResolvers();
    const pool = { query(_sql, values) { return values?.[3] === 'own-session' ? own.promise : unrelated.promise; } };
    const original = pool.query;
    const observer = observeConciergeAnalytics(pool);
    t.after(() => observer.restore());
    assert.equal(pool.query('SELECT 1'), unrelated.promise);
    assert.equal(pool.query('INSERT INTO analytics_events VALUES ($1,$2,$3,$4)', ['page_view', null, true, 'other-session']), unrelated.promise);
    assert.equal(pool.query('INSERT INTO analytics_events VALUES ($1,$2,$3,$4)', ['concierge_query', BOB, false, 'other-session']), unrelated.promise);
    assert.equal(pool.query('INSERT INTO analytics_events VALUES ($1,$2,$3,$4)', ['concierge_query', BOB, false, 'own-session']), own.promise);
    const barrier = observer.settleSession('own-session');
    own.resolve({ rows: [] });
    assert.equal(await barrier, 1);
    await assert.rejects(observer.settleSession('never-written'), /No Concierge analytics writes/);
    unrelated.resolve({ rows: [] });
    observer.restore();
    assert.equal(pool.query, original);
});
