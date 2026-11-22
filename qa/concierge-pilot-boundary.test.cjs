'use strict';
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const id = 'a1000000-0000-4000-8000-000000000001';
const outsider = 'b2000000-0000-4000-8000-000000000002';
const opts = { userId: id, optedIn: true };
const enabled = {
    CONCIERGE_AI_PILOT_ENABLED: 'true',
    CONCIERGE_AI_PILOT_USER_IDS: id,
    OPENAI_API_KEY: 'synthetic-not-a-real-key'
};
const source = readFileSync(require.resolve('../src/routes/conciergeAI.js'), 'utf8');

function fixture(env, status = 200, { withdrawn = false, plan = false } = {}) {
    const seen = { calls: [], errorBodyReads: 0, queries: 0, sql: [] };
    const dependencies = {
        '../config/database': { query: async (sql, params) => {
            seen.queries++;
            seen.sql.push({ sql, params });
            if (withdrawn && seen.queries === 2) return { rows: [] };
            return { rows: [{ id, name: seen.queries === 1 ? 'Original venue' : 'Canonical venue' }] };
        }},
        '../services/concierge-intent': {},
        '../services/concierge-constraints': {},
        '../services/concierge-conversation': {},
        '../services/concierge-typed-plan': { modeFor: () => null },
        '../services/concierge-query-constraints': {
            venueTypeSQL: () => null, exclusionSQL: () => ({ conditions: [], values: [] })
        },
        '../services/venue-helpers': { publicVenue: row => row, availableVenueSQL: () => 'true' },
        '../services/venue-duplicate-discovery': { visibleDiscoveryVenueSQL: () => 'true' },
        '../services/venue-facts': {}
    };
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module, process: { env }, setTimeout, clearTimeout, AbortController,
        require: (path) => {
            assert.ok(Object.hasOwn(dependencies, path), path);
            return dependencies[path];
        },
        fetch: async (url, req) => {
            seen.calls.push({ url, body: JSON.parse(req.body) });
            return { status, ok: status === 200,
                json: async () => ({ output_text: JSON.stringify({
                    reply: 'A table is guaranteed', intent: 'greeting',
                    recommendedVenues: [{ venueId: outsider, whyItFits: 'invented' }, { venueId: id }],
                    recommendedPlan: plan ? { title: 'MODEL TITLE', summary: 'MODEL SUMMARY', stops: [
                        { venueId: id, name: 'Wrong name', bestTime: 'Guaranteed at nine' }, { venueId: id }
                    ] } : null,
                    quickReplies: ['model wrote this']
                }) }),
                text: async () => { seen.errorBodyReads++; return 'synthetic prompt echo'; } };
        }
    });
    return { ...module.exports, seen };
}
const call = (subject, access, filters = {}) => subject.runAIConcierge({
    access, message: 'Synthetic Boston dinner',
    context: { privateSave: 'never send this fixture secret' },
    history: [{ role: 'user', content: 'earlier raw consent canary' }],
    resolvedRequest: { filters }
});

test('provider key alone, other accounts, absent opt-in, and malformed allowlists fail closed', async () => {
    const tooMany = Array(21).fill(id).join(',');
    for (const [env, access] of [
        [{ OPENAI_API_KEY: enabled.OPENAI_API_KEY }, opts],
        [{ ...enabled, OPENAI_API_KEY: '   ' }, opts],
        [{ ...enabled, CONCIERGE_AI_PILOT_USER_IDS: '' }, opts],
        [{ ...enabled, CONCIERGE_AI_PILOT_USER_IDS: id + ',invalid' }, opts],
        [{ ...enabled, CONCIERGE_AI_PILOT_USER_IDS: tooMany }, opts],
        [enabled, undefined],
        [enabled, { userId: outsider, optedIn: true }],
        [enabled, { userId: id, optedIn: 'true' }],
        [enabled, { userId: id }]
    ]) {
        const subject = fixture(env);
        assert.equal(subject.isEnabled(access), false);
        await assert.rejects(call(subject, access), /pilot is not available/);
        assert.equal(subject.seen.calls.length, 0);
        assert.equal(subject.seen.queries, 0);
    }
});

test('allowed opted-in pilot calls only the mocked transport, with storage disabled', async () => {
    const subject = fixture(enabled);
    const result = await call(subject, opts);
    assert.equal(result.source, 'openai');
    assert.equal(subject.seen.calls.length, 1);
    const { url, body } = subject.seen.calls[0];
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(body.store, false);
    assert.ok(JSON.stringify(body.input).includes('Synthetic Boston dinner'));
    assert.ok(!JSON.stringify(body.input).includes('never send this fixture secret'));
    assert.ok(!JSON.stringify(body.input).includes('earlier raw consent canary'));
    assert.equal(body.input.length, 1);
});

test('provider rejection forwards status only and never reads an echoed prompt', async () => {
    const subject = fixture(enabled, 429);
    await assert.rejects(call(subject, opts), err => err.status === 429
        && err.message === 'OpenAI 429' && !Object.hasOwn(err, 'snippet'));
    assert.equal(subject.seen.calls.length, 1);
    assert.equal(subject.seen.errorBodyReads, 0);
});


test('ranked output uses fresh exact candidates and no model-written claims', async () => {
    const subject = fixture(enabled, 200, { plan: true });
    const result = await call(subject, opts, { neighborhoods: ['Fenway'], isPlan: true });
    assert.equal(subject.seen.queries, 2);
    assert.match(subject.seen.sql[1].sql, /neighborhood = ANY/);
    assert.match(subject.seen.sql[1].sql, /id = ANY/);
    assert.equal(JSON.stringify(subject.seen.sql[1].params), JSON.stringify([['Fenway'], [id]]));
    assert.equal(result.candidates[0].name, 'Canonical venue');
    assert.equal(result.recommendedPlan.stops.length, 1);
    assert.equal(result.recommendedPlan.stops[0].venueId, id);
    assert.equal(result.recommendedVenues.length, 1);
    assert.equal(result.intent, 'plan_night');
    assert.doesNotMatch(JSON.stringify(result), /guaranteed|wrong name|model title|model summary|model wrote|invented/i);
});

test('withdrawal before reread refuses the planned recommendation', async () => {
    const subject = fixture(enabled, 200, { plan: true, withdrawn: true });
    await assert.rejects(call(subject, opts, { isPlan: true }), /changed before display/);
    assert.equal(subject.seen.queries, 2);
    assert.equal(subject.seen.calls.length, 1);
});

test('capabilities uses authenticated server identity and is private and non-cacheable', () => {
    const route = readFileSync(require.resolve('../src/routes/concierge.js'), 'utf8');
    let capability;
    const optionalAuth = () => {};
    const { isEnabled } = fixture(enabled);
    vm.runInNewContext(route, {
        module: { exports: {} },
        require: name => {
            if (name === 'express') return { Router: () => ({
                post() {},
                get(url, ...handlers) { if (url === '/capabilities') capability = handlers; }
            }) };
            if (name === '../middleware/auth') return { optionalAuth };
            if (name === './conciergeAI') return { isEnabled };
            return {};
        }
    });
    assert.equal(capability[0], optionalAuth);
    for (const [user, expected] of [[{ id }, true], [{ id: outsider }, false], [null, false]]) {
        const observed = {};
        capability[1]({ user, query: { userId: id }, body: { userId: id, ai: true } }, {
            setHeader(name, value) { observed[name] = value; },
            vary(name) { observed.vary = name; },
            json(value) { observed.enabled = value.ai_pilot; }
        });
        assert.deepEqual(observed, { 'Cache-Control': 'private, no-store', vary: 'Authorization', enabled: expected });
    }
});
