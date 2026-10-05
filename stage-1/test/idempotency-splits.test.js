import assert from 'node:assert/strict';
import { test } from 'node:test';
import { equalShares } from '../src/handlers/splits.js';
import { canonicalJson } from '../src/idempotency.js';
import { call, fixture, newKey, user, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));

test('canonical JSON ignores key order and whitespace, not values', () => {
  assert.equal(canonicalJson({ b: [1, { y: 2, x: 1 }], a: 'x' }), canonicalJson({ a: 'x', b: [1, { x: 1, y: 2 }] }));
  assert.notEqual(canonicalJson({}), canonicalJson({ visibility: 'public' }));
  assert.equal(canonicalJson(JSON.parse('{"amount":1e3}')), canonicalJson({ amount: 1000 }));
});

test('every idempotent path needs a key; empty is 400, over 255 characters is 422', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  const rq = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 1 }, newKey())).body.request_id;
  const paths = [
    ['/payments', { to_handle: 'bob', amount: 10 }],
    ['/requests', { payer_handle: 'bob', amount: 10 }],
    [`/requests/${rq}/pay`, {}],
    ['/splits', { amount: 10, participant_handles: ['ada', 'bob'] }],
    ['/settlements', { transfers: [{ from_handle: 'ada', to_handle: 'bob', amount: 1 }] }],
  ];
  for (const [path, body] of paths) {
    expectError(await w.ada.post(path, body), 400, 'missing_idempotency_key', path);
    expectError(await w.ada.post(path, body, ''), 400, 'missing_idempotency_key', path);
    expectError(await w.ada.post(path, body, 'k'.repeat(256)), 422, 'validation_failed', path);
  }
  assert.equal((await w.ada.post('/payments', { to_handle: 'bob', amount: 1 }, 'k'.repeat(255))).status, 201);
  assert.equal(await w.ada.balance(), 9_999);
});

test('replay is 200 with the same body; changed body is 409, even when now invalid', async () => {
  const w = await world(srv.base);
  const key = newKey();
  const first = await w.ada.post('/payments', { to_handle: 'bob', amount: 100, note: 'n' }, key);
  const raw = await call(srv.base, 'POST', '/payments', {
    token: w.ada.token, key, raw: ' { "note" : "n", "amount": 1e2, "to_handle":"bob" } ',
  });
  assert.deepEqual([raw.status, raw.body], [200, first.body]);
  expectError(await w.ada.post('/payments', { to_handle: 'bob', amount: 200, note: 'n' }, key), 409, 'idempotency_key_reuse');
  expectError(await w.ada.post('/payments', { to_handle: 'bob', amount: -5 }, key), 409, 'idempotency_key_reuse');
  expectError(await w.ada.post('/payments', { to_handle: 'nobody', amount: 100, note: 'n' }, key), 409, 'idempotency_key_reuse');
  assert.equal(await w.ada.balance(), 9_900);
});

test('keys are per user and per path; a failed attempt leaves the key unused', async () => {
  const w = await world(srv.base);
  assert.equal((await w.ada.post('/payments', { to_handle: 'bob', amount: 10 }, 'same')).status, 201);
  assert.equal((await w.bob.post('/payments', { to_handle: 'cy', amount: 10 }, 'same')).status, 201);
  assert.equal((await w.ada.post('/requests', { to_handle: 'bob', amount: 10, payer_handle: 'bob' }, 'same')).status, 201);
  expectError(await w.cy.post('/payments', { to_handle: 'bob', amount: 9_999 }, 'k2'), 409, 'insufficient_funds');
  assert.equal((await w.cy.post('/payments', { to_handle: 'bob', amount: 1 }, 'k2')).status, 201);
});

test('replay after the resource changed returns the original response', async () => {
  const w = await world(srv.base);
  const key = newKey();
  const created = await w.bob.post('/requests', { payer_handle: 'ada', amount: 5, note: 'x' }, key);
  await w.bob.post(`/requests/${created.body.request_id}/cancel`);
  const replay = await w.bob.post('/requests', { payer_handle: 'ada', amount: 5, note: 'x' }, key);
  assert.deepEqual([replay.status, replay.body], [200, created.body]);
  assert.equal((await w.bob.get('/requests')).body.requests.length, 1);
});

test('concurrent identical requests: one 201, the rest 200 with the same body, money moves once', async () => {
  const w = await world(srv.base);
  const key = newKey();
  const out = await Promise.all(Array.from({ length: 30 }, () =>
    w.ada.post('/payments', { to_handle: 'bob', amount: 700 }, key)));
  assert.equal(out.filter((r) => r.status === 201).length, 1);
  assert.equal(out.filter((r) => r.status === 200).length, 29);
  assert.ok(out.every((r) => r.body.payment_id === out[0].body.payment_id));
  assert.equal(await w.ada.balance(), 9_300);
});

test('fifty clients draining wallets in a ring never go negative or lose money', async () => {
  const handles = Array.from({ length: 5 }, (_, i) => `r${i}`);
  const fx = fixture({ users: handles.map((h) => user(h, 1_000)) });
  const w = await world(srv.base, fx);
  const out = await Promise.all(Array.from({ length: 50 }, (_, i) => {
    const from = handles[i % 5];
    const to = handles[(i + 1) % 5];
    return w[from].post('/payments', { to_handle: to, amount: 300 + (i % 7) * 50 }, newKey());
  }));
  assert.ok(out.every((r) => r.status === 201 || r.status === 409), JSON.stringify(out.map((r) => r.status)));
  const balances = await Promise.all(handles.map((h) => w[h].balance()));
  assert.ok(balances.every((b) => b >= 0));
  assert.equal(balances.reduce((a, b) => a + b, 0), 5_000);
});

test('equal split rule matches the §9 table', () => {
  assert.deepEqual(equalShares(1000, 3), [334, 333, 333]);
  assert.deepEqual(equalShares(1, 3), [1, 0, 0]);
  assert.deepEqual(equalShares(10, 3), [4, 3, 3]);
  assert.deepEqual(equalShares(999, 3), [333, 333, 333]);
  assert.deepEqual(equalShares(5, 5), [1, 1, 1, 1, 1]);
  assert.deepEqual(equalShares(1_000_000_000, 7).reduce((a, b) => a + b), 1_000_000_000);
});

test('a split shares in handle order and requests from everyone but the caller', async () => {
  const w = await world(srv.base);
  const res = await w.ada.post('/splits', { amount: 1000, participant_handles: ['bob', 'ada', 'cy'], note: 'dinner' }, newKey());
  assert.equal(res.status, 201);
  const s = res.body;
  assert.deepEqual(s.shares, [{ handle: 'bob', amount: 334 }, { handle: 'ada', amount: 333 }, { handle: 'cy', amount: 333 }]);
  assert.deepEqual(s.requests.map((r) => [r.payer_handle, r.requester_handle, r.amount, r.status, r.note]),
    [['bob', 'ada', 334, 'pending', 'dinner'], ['cy', 'ada', 333, 'pending', 'dinner']]);
  assert.deepEqual([s.amount, s.currency, s.note], [1000, 'EUR', 'dinner']);
  assert.ok(s.split_id && s.created_at);
  assert.deepEqual((await w.ada.get('/activity')).body.payments, [], 'a split is not a feed item');
  for (const r of s.requests) {
    assert.equal((await w[r.payer_handle].post(`/requests/${r.request_id}/pay`, {}, newKey())).status, 201);
  }
  const total = (await Promise.all(['ada', 'bob', 'cy'].map((h) => w[h].balance()))).reduce((a, b) => a + b);
  assert.equal(total, 13_000);
});

test('split edge cases: caller omitted, caller alone, zero shares, no balance check', async () => {
  const w = await world(srv.base);
  const omitted = (await w.ada.post('/splits', { amount: 10, participant_handles: ['bob', 'cy'] }, newKey())).body;
  assert.deepEqual(omitted.shares.map((x) => x.amount), [5, 5]);
  assert.equal(omitted.requests.length, 2);
  const alone = await w.ada.post('/splits', { amount: 999, participant_handles: ['ada'] }, newKey());
  assert.deepEqual([alone.status, alone.body.requests, alone.body.shares], [201, [], [{ handle: 'ada', amount: 999 }]]);
  const zero = (await w.ada.post('/splits', { amount: 1, participant_handles: ['ada', 'bob', 'cy'] }, newKey())).body;
  assert.deepEqual(zero.requests.map((r) => r.amount), [0, 0]);
  assert.equal((await w.bob.post(`/requests/${zero.requests[0].request_id}/pay`, {}, newKey())).status, 201);
  assert.equal((await w.cy.post('/splits', { amount: 1_000_000_000, participant_handles: ['cy', 'ada'] }, newKey())).status, 201);
});

test('split validation', async () => {
  const w = await world(srv.base);
  const cases = [
    [{ amount: 100, participant_handles: [] }, 422, 'validation_failed'],
    [{ amount: 100, participant_handles: ['ada', 'ada'] }, 422, 'validation_failed'],
    [{ amount: 100, participant_handles: ['ada', 'nobody'] }, 404, 'not_found'],
    [{ amount: 100 }, 422, 'validation_failed'],
    [{ amount: 100, participant_handles: 'ada' }, 400, 'malformed_request'],
    [{ amount: 0, participant_handles: ['ada'] }, 422, 'validation_failed'],
    [{ amount: '100', participant_handles: ['ada'] }, 422, 'validation_failed'],
    [{ amount: 100, participant_handles: ['ada'], note: 'x'.repeat(201) }, 422, 'validation_failed'],
    [{ amount: 100, participant_handles: Array.from({ length: 1000 }, (_, i) => `h${i}`) }, 404, 'not_found'],
  ];
  for (const [body, status, code] of cases) {
    expectError(await w.ada.post('/splits', body, newKey()), status, code, JSON.stringify(body).slice(0, 80));
  }
  assert.deepEqual((await w.bob.get('/requests')).body.requests, []);
});
