'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const script = readFileSync(require.resolve('../frontend/js/ai-concierge-v5.js'), 'utf8');
const reply = (obj, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => obj });

async function browser(t, opts = {}) {
    const dom = new JSDOM('<!doctype html><a data-ask-concierge="Public trigger text">Ask</a>', {
        url: opts.url || 'https://isolated.example/tonight', runScripts: 'outside-only'
    });
    t.after(() => dom.window.close());
    const w = dom.window;
    let token = opts.guest ? null : 'test-account-a';
    const calls = [];
    const notices = [];
    w.SLNotifications = { success: message => notices.push(message) };
    w.SLAuth = { getToken: () => token };
    w.fetch = async (url, req = {}) => {
        const body = req.body && JSON.parse(req.body);
        calls.push({ url, body, token: req.headers?.Authorization });
        if (url.endsWith('/capabilities')) return opts.capability ? opts.capability() : reply({ ai_pilot: !opts.denied });
        if (opts.request) return opts.request(url, req, body);
        if (!body) return reply({}, false);
        if (opts.post) return opts.post(body);
        return reply({ ok: true, response: 'Test response', source: body.ai ? 'openai' : 'rule-based' });
    };
    w.eval(script);
    await until(() => w.SLConcierge);
    const button = text => [...w.document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
    const click = text => { const b = button(text); assert.ok(b, text); b.click(); };
    const input = w.document.querySelector('.slc-input');
    const type = msg => { input.value = msg; input.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const send = () => w.document.querySelector('.slc-send').click();
    const posts = () => calls.filter(c => c.body);
    return { w, token: v => { token = v; }, button, click, input, type, send, posts, calls, notices, app: w.SLConcierge };
}
function pause(ms = 20) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function until(fn) {
    for (let i = 0; i < 110; i++) {
        if (fn()) return;
        await pause();
    }
    assert.fail('Timed out waiting for expected browser state');
}

test('opt in once, label model results, and disclose again before submitting a revision', async t => {
    const b = await browser(t);
    const message = 'Find dinner <img src=invalid> in Back Bay';
    let rawEvent = null;
    b.w.addEventListener('sl:concierge-ask', e => { rawEvent = e.detail; });
    b.app.open();
    b.type(message);
    b.send();
    await until(() => b.button('Use AI once'));
    const disclosure = b.w.document.querySelector('[aria-label="Choose how to answer this request"]');
    assert.match(disclosure.textContent, /OpenAI will receive/);
    assert.ok(disclosure.textContent.includes(message));
    assert.equal(disclosure.querySelector('img'), null);
    assert.equal(b.w.document.activeElement, b.button('Search directory'));
    assert.equal(b.posts().length, 0);
    b.click('Use AI once');
    await until(() => b.w.document.body.textContent.includes('AI-ranked SceneLink venues'));
    assert.deepEqual(b.posts().map(c => [c.token, c.body.ai, c.body.message]), [['Bearer test-account-a', true, message]]);
    assert.equal(rawEvent, null);
    assert.ok(b.calls.every(c => !c.url.includes(encodeURIComponent(message))));
    b.type('Different drinks');
    b.send();
    await until(() => b.button('Search directory'));
    assert.equal(b.posts().length, 1);
    b.click('Search directory');
    await until(() => b.posts().length === 2);
    assert.equal(b.posts()[1].body.ai, false);
});

test('editing, canceling, switching accounts, and closing revoke pending disclosure', async t => {
    const b = await browser(t);
    b.app.draft('Pending dinner');
    b.send();
    await until(() => b.button('Cancel'));
    const editedApproval = b.button('Use AI once');
    b.type('Edited dinner');
    editedApproval.click();
    assert.equal(b.input.value, 'Edited dinner');
    b.send();
    await until(() => b.button('Cancel'));
    b.click('Cancel');
    assert.equal(b.input.value, 'Edited dinner');
    b.send();
    await until(() => b.button('Cancel'));
    const closedApproval = b.button('Use AI once');
    b.app.close();
    b.app.open();
    closedApproval.click();
    b.type('Old account text');
    b.send();
    await until(() => b.button('Cancel'));
    const oldAccountApproval = b.button('Use AI once');
    b.token('test-account-b');
    b.w.dispatchEvent(new b.w.Event('sl:auth-changed'));
    oldAccountApproval.click();
    assert.equal(b.input.value, '');
    assert.doesNotMatch(b.w.document.body.textContent, /Old account text/);
    await pause();
    assert.equal(b.posts().length, 0);
});

test('a capability reply cannot open an obsolete prompt after a different entry point drafts text', async t => {
    let resolve;
    const b = await browser(t, { capability: () => new Promise(r => { resolve = r; }) });
    b.app.draft('Obsolete dinner');
    b.send();
    await until(() => resolve);
    b.w.document.querySelector('a').click();
    resolve(reply({ ai_pilot: true }));
    await pause();
    assert.equal(b.input.value, 'Public trigger text');
    assert.equal(b.button('Use AI once'), undefined);
    assert.equal(b.posts().length, 0);
});

test('cross-page quick actions draft only; guided dinner/drinks shortcut stays directory-only', async t => {
    const b = await browser(t, { url: 'https://isolated.example/tonight?ask=Secret+draft&keep=1#stay' });
    assert.equal(b.input.value, 'Secret draft');
    assert.equal(b.w.location.search, '?keep=1');
    assert.equal(b.w.location.hash, '#stay');
    b.app.ask('Dinner then drinks');
    await pause(350);
    assert.equal(b.posts().length, 0);
    assert.equal(b.input.value, 'Dinner then drinks');
    b.send();
    await until(() => b.posts().length >= 3);
    assert.equal(b.posts().length, 3);
    assert.ok(b.posts().every(c => c.body.ai === false));
    assert.equal(b.calls.some(c => c.url.endsWith('/capabilities')), false);
});

test('guests and non-pilot accounts use only the directory', async t => {
    for (const guest of [true, false]) {
        const b = await browser(t, { guest, denied: true });
        b.app.draft('Back Bay dinner');
        b.send();
        await until(() => b.posts().length);
        assert.equal(b.posts()[0].body.ai, false);
        assert.equal(b.button('Use AI once'), undefined);
        assert.equal(b.calls.some(c => c.url.endsWith('/capabilities')), !guest);
    }
});

test('an older backend without the capabilities route never opts in and still serves directory results', async t => {
    const b = await browser(t, { capability: () => reply({}, false) });
    b.app.draft('Find restaurants in Seaport');
    b.send();
    await until(() => b.w.document.body.textContent.includes('Test response'));
    assert.equal(b.button('Use AI once'), undefined);
    assert.deepEqual(b.posts().map(p => p.body.ai), [false]);
});

test('a previously confirmed reply finishing after close and reopen cannot change the reopened conversation', async t => {
    let oldResolve;
    const b = await browser(t, { post: () => new Promise(r => { oldResolve = r; }) });
    b.app.draft('Initial dinner');
    b.send();
    await until(() => b.button('Use AI once'));
    b.click('Use AI once');
    await until(() => oldResolve);
    b.app.close();
    b.app.open();
    oldResolve(reply({ ok: true, response: 'Old response marker', source: 'openai' }));
    await pause(700);
    assert.doesNotMatch(b.w.document.body.textContent, /Old response marker|AI-ranked SceneLink venues/);
});

test('a quick chip still requires a choice and model failure is labeled as directory results', async t => {
    const b = await browser(t, {
        post: () => reply({ ok: true, response: 'Safe directory result', source: 'rule-based' })
    });
    b.app.open();
    const chip = [...b.w.document.querySelectorAll('.slc-quick-actions .slc-chip')].find(b => !/^(plan my night|build my night|dinner then drinks)$/i.test(b.textContent.trim()));
    assert.ok(chip);
    const chipText = chip.textContent;
    chip.click();
    await until(() => b.button('Use AI once'));
    assert.equal(b.posts().length, 0);
    b.click('Use AI once');
    await until(() => b.w.document.body.textContent.includes('Safe directory result'));
    assert.equal(b.posts()[0].body.message, chipText);
    assert.equal(b.posts()[0].body.ai, true);
    assert.doesNotMatch(b.w.document.body.textContent, /AI-ranked SceneLink venues/);
    assert.match(b.w.document.body.textContent, /AI wasn’t used for these results/);
});

test('a typed edit needs fresh consent, and the envelope stays off directory requests and account changes', async t => {
    const envelope = 'IN_MEMORY_FIXTURE_ENVELOPE';
    const b = await browser(t, { post: body => reply({ ok: true,
        response: body.ai ? 'Model fixture result' : 'Directory fixture result',
        source: body.ai ? 'openai' : 'rule-based',
        ...(body.ai && body.message === 'Plan dinner then drinks in Seaport' ? { typed_plan: envelope } : {})
    }) });
    const send = async (message, choice) => {
        b.app.draft(message); b.send();
        await until(() => b.button(choice));
        const before = b.posts().length;
        b.click(choice); await until(() => b.posts().length === before + 1);
        return b.posts().at(-1);
    };
    await send('Plan dinner then drinks in Seaport', 'Use AI once');
    const optedIn = await send('Swap the drinks stop', 'Use AI once');
    assert.equal(optedIn.body.ai, true);
    assert.equal(optedIn.body.context.typedPlan, envelope);
    await send('Plan dinner then drinks in Seaport', 'Use AI once');
    const declined = await send('Swap the drinks stop', 'Search directory');
    assert.equal(declined.body.ai, false);
    assert.equal(declined.body.context.typedPlan, undefined);
    await send('Plan dinner then drinks in Seaport', 'Use AI once');
    b.token('test-account-b');
    b.w.dispatchEvent(new b.w.Event('sl:auth-changed'));
    const changed = await send('Swap the drinks stop', 'Use AI once');
    assert.equal(changed.token, 'Bearer test-account-b');
    assert.equal(changed.body.context.typedPlan, undefined);
    await send('Plan dinner then drinks in Seaport', 'Use AI once');
    b.app.close(); b.app.open();
    const reopened = await send('Swap the drinks stop', 'Use AI once');
    assert.equal(reopened.body.context.typedPlan, undefined);
});

async function exercisePlanSave(t, options) {
    const persisted = new Set(options.existingIds || []);
    const failed = new Set(options.failed || []);
    const ambiguous = new Set(options.ambiguous || []);
    const b = await browser(t, { request: async (url, req, body) => {
        if (url.endsWith('/concierge')) return reply({
            ok: true, source: 'openai', response: 'Suggestion only',
            itinerary: { title: 'Fixture Night', stops: [{ venueId: 'dinner', name: 'Fixture Dinner' }, { venueId: 'drinks', name: 'Fixture Drinks' }] },
            venues: [{ id: 'dinner', name: 'Fixture Dinner' }, { id: 'drinks', name: 'Fixture Drinks' }]
        });
        if (url.endsWith('/plans') && !req.method) return reply({ plans: options.existing ? [{ id: 'test-plan', name: 'Existing plan' }] : [] });
        if (url.endsWith('/plans') && req.method === 'POST') return reply({ plan: { id: 'test-plan' } });
        if (url.endsWith('/test-plan/venues')) {
            if (failed.has(body.venue_id)) return reply({}, false);
            persisted.add(body.venue_id);
            if (ambiguous.has(body.venue_id)) throw Error('Synthetic transport cutoff after commit');
            return reply({ success: true });
        }
        if (url.endsWith('/test-plan')) return options.readFail ? reply({}, false) : reply({
            plan: { id: 'test-plan', stops: [...persisted].map(venue_id => ({ venue_id })) }
        });
        return reply({}, false);
    }});
    b.app.open();
    b.type('Plan dinner and drinks in Seaport');
    b.send();
    await until(() => b.button('Use AI once'));
    b.click('Use AI once');
    await until(() => b.button('Save this plan'));
    b.click('Save this plan');
    if (options.existing) {
        await until(() => b.button('Existing plan'));
        b.click('Existing plan');
    }
    return { ...b, persisted };
}

test('Concierge save reports partial persistence and never claims withdrawn stop was saved', async t => {
    const b = await exercisePlanSave(t, { failed: ['drinks'] });
    await until(() => b.w.document.body.textContent.includes('Not saved: Fixture Drinks'));
    assert.match(b.w.document.body.textContent, /On your plan: Fixture Dinner/);
    assert.deepEqual([...b.persisted], ['dinner']);
    assert.deepEqual(b.notices, []);
    assert.equal(b.posts().filter(x => x.url.endsWith('/concierge')).length, 1);
});

test('Concierge existing-plan save can confirm both stops after an ambiguous transport', async t => {
    const b = await exercisePlanSave(t, { existing: true, existingIds: ['dinner'], ambiguous: ['drinks'] });
    await until(() => b.w.document.body.textContent.includes('All 2 stops are on your plan.'));
    assert.deepEqual([...b.persisted], ['dinner', 'drinks']);
    assert.deepEqual(b.notices, ['All requested stops are on your plan.']);
    assert.equal(b.posts().filter(x => x.url.endsWith('/concierge')).length, 1);
});

test('Concierge save without authoritative readback marks state unverified', async t => {
    const b = await exercisePlanSave(t, { readFail: true });
    await until(() => b.w.document.body.textContent.includes('Couldn’t verify which stops were saved.'));
    assert.doesNotMatch(b.w.document.body.textContent, /All 2 stops are/);
    assert.deepEqual(b.notices, []);
});

test('composed flow saves and reads back the revised two-stop plan with no extra model request', async t => {
    const ids = [], envelope = 'SYNTHETIC_INITIAL_PLAN_ENVELOPE';
    const b = await browser(t, { request: async (url, req, body) => {
        if (url.endsWith('/concierge')) {
            assert.equal(body.ai, true);
            const swap = body.message === 'Swap the drinks stop';
            if (swap) assert.equal(body.context.typedPlan, envelope);
            const items = [
                { venueId: 'dinner', role: 'dinner', name: 'Same Dinner' },
                { venueId: swap ? 'new-drinks' : 'old-drinks', role: 'drinks', name: swap ? 'New Drinks' : 'Old Drinks' }
            ];
            return reply({ ok: true, source: 'openai', response: 'Suggestion only',
                itinerary: { title: swap ? 'Revised Fixture Night' : 'Initial Fixture Night', stops: items },
                venues: items.map(i => ({ id: i.venueId, name: i.name })),
                typed_plan: swap ? 'SYNTHETIC_REVISED_ENVELOPE' : envelope });
        }
        if (url.endsWith('/plans') && !req.method) return reply({ plans: [] });
        if (url.endsWith('/plans') && req.method === 'POST') return reply({ plan: { id: 'composed-plan' } });
        if (url.endsWith('/composed-plan/venues')) { ids.push(body.venue_id); return reply({ success: true }); }
        if (url.endsWith('/composed-plan')) return reply({ plan: { id: 'composed-plan', stops: ids.map(venue_id => ({ venue_id })) } });
        return reply({}, false);
    } });
    async function approve(message, title) {
        b.app.draft(message); b.send();
        await until(() => b.button('Use AI once'));
        b.click('Use AI once');
        await until(() => b.w.document.body.textContent.includes(title));
    }
    await approve('Plan dinner then drinks in Seaport', 'Initial Fixture Night');
    await approve('Swap the drinks stop', 'Revised Fixture Night');
    const save = [...b.w.document.querySelectorAll('button')].filter(button => button.textContent.trim() === 'Save this plan').at(-1);
    assert.ok(save);
    save.click();
    await until(() => b.w.document.body.textContent.includes('All 2 stops are on “Revised Fixture Night”.'));
    assert.deepEqual(ids, ['dinner', 'new-drinks']);
    assert.equal(b.posts().filter(c => c.url.endsWith('/concierge')).length, 2);
    assert.equal(b.calls.filter(c => c.url.endsWith('/composed-plan') && !c.body).length, 1);
});
