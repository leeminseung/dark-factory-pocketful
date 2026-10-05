import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RFC3339 } from '../src/clock.js';
import { call, fixture, newKey, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));

test('GET /me shows the seeded user', async () => {
  const w = await world(srv.base);
  const me = await w.ada.get('/me');
  assert.deepEqual(me.body, {
    user_id: 'u_ada', display_name: 'Ada', handle: 'ada', balance: 10_000,
    total: 10_000, available: 10_000, held: 0, currency: 'EUR', minor_units: 2,
  });
});

test('a payment moves money atomically and returns the full receipt', async () => {
  const w = await world(srv.base);
  const res = await w.ada.post('/payments', { to_handle: 'bob', amount: 1500, note: 'dinner' }, newKey());
  assert.equal(res.status, 201);
  const p = res.body;
  assert.equal(p.from_user_id, 'u_ada');
  assert.equal(p.to_handle, 'bob');
  assert.equal(p.amount, 1500);
  assert.equal(p.currency, 'EUR');
  assert.equal(p.note, 'dinner');
  assert.equal(p.visibility, 'public');
  assert.equal(p.request_id, null);
  assert.equal(p.settlement_id, null);
  assert.match(p.created_at, RFC3339);
  assert.ok(p.payment_id.length <= 64);
  assert.equal(await w.ada.balance(), 8_500);
  assert.equal(await w.bob.balance(), 4_000);
});

test('integral JSON numbers are amounts: 1000.0 and 1e3', async () => {
  const w = await world(srv.base);
  for (const raw of ['1000.0', '1e3']) {
    const res = await call(srv.base, 'POST', '/payments', {
      token: w.ada.token, key: newKey(), raw: `{"to_handle":"bob","amount":${raw}}`,
    });
    assert.equal(res.status, 201, raw);
    assert.equal(res.body.amount, 1000);
  }
});

test('amount, note and visibility rules are 422', async () => {
  const w = await world(srv.base);
  const bad = [
    { amount: 0 }, { amount: -1 }, { amount: 1.5 }, { amount: '100' }, { amount: true },
    { amount: null }, { amount: 1_000_000_001 }, { amount: 100, note: null }, { amount: 100, note: 5 },
    { amount: 100, note: 'x'.repeat(201) }, { amount: 100, note: '😀'.repeat(201) },
    { amount: 100, visibility: 'Public' }, { amount: 100, visibility: '' }, { amount: 100, visibility: null },
  ];
  for (const fields of bad) {
    expectError(await w.ada.post('/payments', { to_handle: 'bob', ...fields }, newKey()),
      422, 'validation_failed', JSON.stringify(fields));
  }
  expectError(await w.ada.post('/payments', { amount: 10 }, newKey()), 422, 'validation_failed');
  assert.equal(await w.ada.balance(), 10_000);
});

test('the maximum amount is in range and fails on funds', async () => {
  const w = await world(srv.base);
  expectError(await w.ada.post('/payments', { to_handle: 'bob', amount: 1_000_000_000 }, newKey()),
    409, 'insufficient_funds');
});

test('a wrong JSON type on to_handle is 400; malformed JSON is 400', async () => {
  const w = await world(srv.base);
  expectError(await w.ada.post('/payments', { to_handle: 7, amount: 10 }, newKey()), 400, 'malformed_request');
  expectError(await call(srv.base, 'POST', '/payments', { token: w.ada.token, key: newKey(), raw: '{nope' }),
    400, 'malformed_request');
  expectError(await call(srv.base, 'POST', '/payments', { token: w.ada.token, key: newKey(), raw: '[1]' }),
    400, 'malformed_request');
});

test('notes survive verbatim; 200 emoji is fine', async () => {
  const w = await world(srv.base);
  for (const text of ['  café 😀 <b>&amp;</b> ñ  ', '😀'.repeat(200), 'x'.repeat(200), 'é']) {
    const res = await w.ada.post('/payments', { to_handle: 'bob', amount: 1, note: text }, newKey());
    assert.equal(res.status, 201);
    assert.equal(res.body.note, text);
  }
});

test('self payment, unknown handle, insufficient funds leave no trace', async () => {
  const w = await world(srv.base);
  expectError(await w.ada.post('/payments', { to_handle: 'ada', amount: 1 }, newKey()), 422, 'self_payment');
  expectError(await w.ada.post('/payments', { to_handle: 'nobody', amount: 1 }, newKey()), 404, 'not_found');
  expectError(await w.cy.post('/payments', { to_handle: 'bob', amount: 501 }, newKey()), 409, 'insufficient_funds');
  assert.equal(await w.cy.balance(), 500);
  assert.deepEqual((await w.cy.get('/activity')).body.payments, []);
  assert.equal((await w.cy.post('/payments', { to_handle: 'bob', amount: 500 }, newKey())).status, 201);
  assert.equal(await w.cy.balance(), 0);
});

test('feed: public to all, private only to its two parties, newest first, paged', async () => {
  const w = await world(srv.base);
  const pub = (await w.bob.post('/payments', { to_handle: 'cy', amount: 1 }, newKey())).body;
  const priv = (await w.ada.post('/payments', { to_handle: 'bob', amount: 2, visibility: 'private' }, newKey())).body;
  const ids = async (who, q = '') => (await w[who].get(`/activity${q}`)).body.payments.map((p) => p.payment_id);
  assert.deepEqual(await ids('cy'), [pub.payment_id]);
  assert.deepEqual(await ids('ada'), [priv.payment_id, pub.payment_id]);
  assert.deepEqual(await ids('bob'), [priv.payment_id, pub.payment_id]);
  const page = (await w.ada.get('/activity?limit=1')).body;
  assert.deepEqual([page.payments.length, page.has_more], [1, true]);
  assert.deepEqual(await ids('ada', '?limit=1&offset=1'), [pub.payment_id]);
  for (const q of ['limit=0', 'limit=201', 'offset=-1', 'offset=abc', 'limit=1e1']) {
    expectError(await w.ada.get(`/activity?${q}`), 422, 'validation_failed', q);
  }
  assert.equal((await w.ada.get('/activity?direction=both&status=open')).status, 200);
});

test('requests never appear in the feed; seeded private payments follow the contract', async () => {
  const w = await world(srv.base, fixture({
    payments: [{ id: 'p_1', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 500, note: 'coffee', visibility: 'private' }],
  }));
  await w.bob.post('/requests', { payer_handle: 'ada', amount: 5 }, newKey());
  assert.deepEqual((await w.cy.get('/activity')).body.payments, []);
  const seen = (await w.ada.get('/activity')).body.payments;
  assert.deepEqual(seen.map((p) => [p.payment_id, p.note]), [['p_1', 'coffee']]);
  assert.equal(await w.ada.balance(), 10_000, 'seeded payments are not replayed');
});

test('bearer token: missing, malformed or unknown is 401', async () => {
  await world(srv.base);
  for (const headers of [{}, { authorization: 'Token abc' }, { authorization: 'Bearer nope' }, { authorization: 'Bearer' }]) {
    expectError(await call(srv.base, 'GET', '/me', { headers }), 401, 'unauthenticated', JSON.stringify(headers));
  }
});

test('error responses are JSON with code and message; unknown paths are 404', async () => {
  const res = await fetch(`${srv.base}/nowhere`);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  const body = await res.json();
  assert.equal(body.error.code, 'not_found');
  assert.equal(typeof body.error.message, 'string');
});
