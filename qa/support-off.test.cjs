const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const express = require('express');

test('Support endpoint stays off with a provider key and a stale or opting-in caller', async () => {
    const key = process.env.OPENAI_API_KEY;
    const fetchOriginal = global.fetch;
    let unexpectedOutbound = 0;
    process.env.OPENAI_API_KEY = 'test-key-that-must-never-be-used';
    global.fetch = async () => {
        unexpectedOutbound++;
        throw new Error('No provider or external request is allowed in this test');
    };
    const app = express();
    app.use(express.json());
    app.use('/api/support', require('../src/routes/support'));
    const server = app.listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        const base = 'http://127.0.0.1:' + server.address().port + '/api/support';
        for (const optIn of [undefined, true]) {
            const result = await fetchOriginal(base + '/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Test input', history: [{role:'user', content:'Test history'}], consent: optIn })
            });
            assert.equal(result.status, 503);
            assert.equal(result.headers.get('cache-control'), 'no-store');
            const body = await result.json();
            assert.equal(body.ok, false);
            assert.equal(body.code, 'SUPPORT_CHAT_DISABLED');
            assert.doesNotMatch(JSON.stringify(body), /Test input|Test history/);
        }
        const health = await fetchOriginal(base + '/health');
        assert.equal((await health.json()).configured, false);
        assert.equal(unexpectedOutbound, 0);
    } finally {
        global.fetch = fetchOriginal;
        if (key === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = key;
        await new Promise(resolve => server.close(resolve));
    }
});

test('Contact page offers the human support form and no dedicated AI chat entry', () => {
    const html = readFileSync(join(__dirname, '../web/frontend/contact.html'), 'utf8');
    assert.match(html, /href="#contactForm"/);
    assert.match(html, /<form id="contactForm" data-sl-contact="1">/);
    assert.match(html, /js\/contact-page\.js/);
    assert.doesNotMatch(html, /sl-contact-support-ai\.js|data-sl-contact-support|Ask AI Support|Try AI Support First|AI Support: instant/);
});
