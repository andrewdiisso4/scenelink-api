'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

function contactsHandler(query) {
  const routes = new Map();
  const requireAdmin = () => { throw new Error('Only the guarded handler is invoked by this fixture'); };
  const router = new Proxy({}, {get: (_, method) => (route, ...handlers) => routes.set(method + ' ' + route, handlers)});
  const file = path.join(__dirname, '../src/routes/admin.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module: {exports: {}}, console: {error() {}},
    require(name) {
      if (name === 'express') return {Router: () => router};
      if (name === '../middleware/auth') return {requireAdmin};
      // The unrelated events-table startup DDL is outside this isolated contacts fixture.
      if (name === '../config/database') return {query: (sql, values) => /^\s*CREATE\b/i.test(sql) ? Promise.resolve({rows: []}) : query(sql, values)};
      throw new Error('Unexpected fixture dependency: ' + name);
    }
  }, {filename: file});
  const [guard, handler] = routes.get('get /contacts');
  assert.equal(guard, requireAdmin, 'Contacts must retain the admin permission middleware');
  return async query => {
    let status = 200, body;
    await handler({query}, {status(code) { status = code; return this; }, json(value) { body = JSON.parse(JSON.stringify(value)); }});
    return {status, body};
  };
}

test('filtered contacts report the full matching count independently of the displayed limit', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE contact_messages (
      id text PRIMARY KEY, name text, email text, subject text, message text,
      source text, status text, created_at timestamptz
    );
    INSERT INTO contact_messages VALUES
      ('one','QA One','one@example.invalid','Question','Fictional message','site','new','2026-01-01'),
      ('two','QA Two','two@example.invalid','Question','Fictional message','site','new','2026-01-02'),
      ('three','QA Three','three@example.invalid','Question','Fictional message','site','read','2026-01-03');
  `);
  const read = contactsHandler((sql, values) => db.query(sql, values));
  const filtered = await read({status: 'new', limit: '1'});
  assert.equal(filtered.status, 200);
  assert.deepEqual(filtered.body.messages.map(row => row.id), ['two']);
  assert.equal(filtered.body.total, 2);
  const all = await read({limit: '2'});
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.messages.map(row => row.id), ['three', 'two']);
  assert.equal(all.body.total, 3);
  assert.deepEqual(await read({status: 'resolved'}), {status: 200, body: {messages: [], total: 0}});
});

test('a contacts list query failure is an error rather than a successful empty inbox', async () => {
  const read = contactsHandler(async () => { throw new Error('Contacts list unavailable'); });
  const result = await read({status: 'new'});
  assert.equal(result.status, 500);
  assert.match(result.body.error, /unavailable/);
  assert.equal(result.body.messages, undefined);
  assert.equal(result.body.total, undefined);
});

test('a contacts count query failure is an error rather than a fabricated zero total', async () => {
  const read = contactsHandler(async sql => {
    if (/SELECT COUNT\(\*\)/.test(sql)) throw new Error('Contacts count unavailable');
    return {rows: [{id: 'fictional-contact'}]};
  });
  const result = await read({status: 'new'});
  assert.equal(result.status, 500);
  assert.match(result.body.error, /unavailable/);
  assert.equal(result.body.messages, undefined);
  assert.equal(result.body.total, undefined);
});
