import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveHandle } from '../src/handlers/auth.js';
import { call, client, newKey, useServer, world } from './helpers.js';

const srv = useServer();
const signup = (email, password = 'correct horse', display_name = 'Dee') =>
  call(srv.base, 'POST', '/auth/signup', { json: { email, password, display_name } });
const login = (email, password = 'correct horse') =>
  call(srv.base, 'POST', '/auth/login', { json: { email, password } });
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label);

test('handle derivation: lowercase, replace, truncate', () => {
  assert.equal(deriveHandle('Dee.Ann+tag@example.com'), 'dee_ann_tag');
  assert.equal(deriveHandle(`${'a'.repeat(30)}@example.com`), 'a'.repeat(20));
  assert.equal(deriveHandle('Zoë@x'), 'zo_');
});

test('signup creates a zero-balance user who can be paid and asked at once', async () => {
  const w = await world(srv.base);
  const res = await signup('dee@example.com');
  assert.equal(res.status, 201);
  assert.deepEqual(Object.keys(res.body).sort(), ['display_name', 'token', 'user_id']);
  const dee = client(srv.base, res.body.token);
  const me = (await dee.get('/me')).body;
  assert.deepEqual([me.handle, me.balance, me.display_name], ['dee', 0, 'Dee']);
  assert.equal((await w.ada.post('/payments', { to_handle: 'dee', amount: 250 }, newKey())).status, 201);
  assert.equal((await w.ada.post('/requests', { payer_handle: 'dee', amount: 250 }, newKey())).status, 201);
  assert.equal(await dee.balance(), 250);
});

test('signup errors', async () => {
  await world(srv.base);
  expectError(await signup('ada@example.com'), 409, 'email_taken');
  expectError(await signup('ADA@example.com'), 409, 'email_taken', 'emails compare case-insensitively');
  expectError(await signup('ada@other.example'), 409, 'handle_taken');
  expectError(await login('ada@other.example'), 401, 'unauthenticated', 'no account was created');
  expectError(await signup('new@example.com', 'short77'), 422, 'validation_failed');
  for (const email of ['plain', '@example.com', 'a@', 'a@b@c']) {
    expectError(await signup(email), 422, 'validation_failed', email);
  }
  expectError(await call(srv.base, 'POST', '/auth/signup', { json: { email: 'x@y.z', password: 'correct horse' } }),
    422, 'validation_failed');
  expectError(await call(srv.base, 'POST', '/auth/signup', { json: { email: 5, password: 'correct horse', display_name: 'X' } }),
    400, 'malformed_request');
});

test('login: right password 200 with a new token each time, wrong password or email 401', async () => {
  await world(srv.base);
  const a = await login('ada@example.com');
  const b = await login('ada@example.com');
  assert.equal(a.status, 200);
  assert.equal(a.body.user_id, 'u_ada');
  assert.notEqual(a.body.token, b.body.token);
  assert.equal((await client(srv.base, a.body.token).get('/me')).status, 200);
  assert.equal((await client(srv.base, b.body.token).get('/me')).status, 200);
  expectError(await login('ada@example.com', 'wrong horse'), 401, 'unauthenticated');
  expectError(await login('nobody@example.com'), 401, 'unauthenticated');
});

test('a password is never stored or exported in plaintext', async () => {
  await world(srv.base);
  await signup('secret@example.com', 'my very secret words');
  const exported = JSON.stringify((await call(srv.base, 'GET', '/_test/export')).body);
  assert.ok(!exported.includes('my very secret words'));
  assert.ok(!exported.includes('correct horse'));
});

test('concurrent signups for one email create one account', async () => {
  await world(srv.base);
  const results = await Promise.all(Array.from({ length: 10 }, () => signup('race@example.com')));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, ...Array(9).fill(409)]);
});
