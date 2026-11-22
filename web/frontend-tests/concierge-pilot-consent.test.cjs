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
    w.SLAuth = { getToken: () => token };
    w.fetch = async (url, req = {}) => {
        const body = req.body && JSON.parse(req.body);
        calls.push({ url, body, token: req.headers?.Authorization });
        if (url.endsWith('/capabilities')) return opts.capability ? opts.capability() : reply({ ai_pilot: !opts.denied });
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
    return { w, token: v => { token = v; }, button, click, input, type, send, posts, calls, app: w.SLConcierge };
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
