// Stage 3: payment corrections, revisions and their effect on history.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, fixture, newKey, user, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));
const q = (params) => `?${new URLSearchParams(params)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const me = async (client, params) => (await client.get(`/me${params ? q(params) : ''}`)).body;
const correct = (client, paymentId, body, key = newKey()) => client.post(`/payments/${paymentId}/corrections`, body, key);
const body = (payment, over = {}) => ({ expected_revision: 1, amount: 60, effective_at: payment.created_at, reason: 'corrected amount', ...over });

async function paid(w, from = 'ada', to = 'bob', amount = 100, extra = {}) {
  const res = await w[from].post('/payments', { to_handle: to, amount, ...extra }, newKey());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('S3 correction: a new revision moves the difference between the same two wallets; the original stays', async () => {
  const w = await world(srv.base);
  const p = await paid(w, 'ada', 'bob', 100, { note: 'dinner', visibility: 'private' });
  const res = await correct(w.ada, p.payment_id, body(p));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const r = res.body;
  assert.deepEqual([r.payment_id, r.revision, r.amount, r.effective_at, r.reason], [p.payment_id, 2, 60, p.created_at, 'corrected amount']);
  assert.ok(Date.parse(r.recorded_at) > Date.parse(p.created_at), 'recorded later than revision 1');
  assert.deepEqual([(await me(w.ada)).balance, (await me(w.bob)).balance], [9_940, 2_560]);
  const feed = (await w.ada.get('/activity')).body.payments;
  assert.deepEqual([feed.length, feed[0].amount, feed[0].visibility], [1, 100, 'private'], 'the feed shows the original payment');
  const revs = (await w.bob.get(`/payments/${p.payment_id}/revisions`)).body.revisions;
  assert.deepEqual(revs.map((x) => [x.revision, x.amount, x.reason]), [[1, 100, ''], [2, 60, 'corrected amount']]);
  const st = (await w.ada.get('/statement')).body.entries;
  assert.deepEqual(st.map((e) => [e.payment.amount, e.delta, e.revision]), [[60, -60, 2]], 'no correction counted alongside the revision it replaces');
});

test('S3 correction: replays, key reuse, stale revisions', async () => {
  const w = await world(srv.base);
  const p = await paid(w);
  const key = newKey();
  const first = await correct(w.ada, p.payment_id, body(p), key);
  assert.equal(first.status, 201);
  const second = await correct(w.ada, p.payment_id, body(p, { expected_revision: 2, amount: 70, reason: 'again' }));
  assert.equal(second.status, 201);
  const replay = await correct(w.ada, p.payment_id, body(p), key);
  assert.deepEqual([replay.status, replay.body], [200, first.body], 'the original revision, even after a newer one');
  expectError(await correct(w.ada, p.payment_id, body(p, { amount: 61 }), key), 409, 'idempotency_key_reuse');
  expectError(await correct(w.ada, p.payment_id, body(p, { expected_revision: 2 })), 409, 'stale_revision');
  expectError(await w.ada.post(`/payments/${p.payment_id}/corrections`, body(p)), 400, 'missing_idempotency_key');
  assert.equal((await me(w.ada)).balance, 9_930);
});

test('S3 correction: who may correct what', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  const p = await paid(w);
  expectError(await correct(w.bob, p.payment_id, body(p)), 403, 'forbidden', 'the receiver');
  expectError(await correct(w.cy, p.payment_id, body(p)), 403, 'forbidden', 'a third party');
  expectError(await correct(w.ada, 'p_nope', body(p)), 404, 'not_found');
  expectError(await call(srv.base, 'POST', `/payments/${p.payment_id}/corrections`, { json: body(p), key: newKey() }), 401, 'unauthenticated');
  const st = (await w.ada.post('/settlements', { transfers: [{ from_handle: 'ada', to_handle: 'bob', amount: 5 }] }, newKey())).body;
  expectError(await correct(w.ada, st.payments[0].payment_id, body(st.payments[0], { amount: 1 })), 422, 'linked_payment_immutable');
  const a = (await w.ada.post('/authorizations', { to_handle: 'bob', amount: 50 }, newKey())).body;
  const capture = (await w.bob.post(`/authorizations/${a.authorization_id}/capture`, {}, newKey())).body;
  expectError(await correct(w.ada, capture.payment_id, body(capture, { amount: 1 })), 422, 'linked_payment_immutable');
  expectError(await w.cy.get(`/payments/${p.payment_id}/revisions`), 404, 'not_found', 'a third party, although public');
  expectError(await call(srv.base, 'GET', `/payments/${p.payment_id}/revisions`), 401, 'unauthenticated');
});

test('S3 correction: every invalid field is 422', async () => {
  const w = await world(srv.base);
  const p = await paid(w);
  const future = new Date(Date.now() + 60_000).toISOString();
  const bad = [
    { expected_revision: 0 }, { expected_revision: 1.5 }, { expected_revision: '1' }, { expected_revision: null },
    { amount: -1 }, { amount: 1_000_000_001 }, { amount: 1.5 }, { amount: '60' },
    { effective_at: future }, { effective_at: '2026-01-01T10:00:00' }, { effective_at: '2026-01-01' }, { effective_at: '' }, { effective_at: 5 },
    { reason: '' }, { reason: 'x'.repeat(201) }, { reason: 7 }, { reason: null },
  ];
  for (const over of bad) expectError(await correct(w.ada, p.payment_id, body(p, over)), 422, 'validation_failed', JSON.stringify(over));
  for (const name of ['expected_revision', 'amount', 'effective_at', 'reason']) {
    const { [name]: _, ...rest } = body(p);
    expectError(await correct(w.ada, p.payment_id, rest), 422, 'validation_failed', `missing ${name}`);
  }
  assert.equal((await me(w.ada)).balance, 9_900);
});

test('S3 correction: the debited wallet must afford it now (increase: sender; decrease: receiver)', async () => {
  const w = await world(srv.base);
  const p = await paid(w, 'cy', 'bob', 400); // cy: 100 left
  expectError(await correct(w.cy, p.payment_id, body(p, { amount: 501 })), 409, 'insufficient_funds');
  const back = await paid(w, 'bob', 'ada', 2_900); // bob spends everything
  expectError(await correct(w.cy, p.payment_id, body(p, { amount: 0 })), 409, 'insufficient_funds', 'the receiver no longer has it');
  assert.deepEqual([(await me(w.cy)).balance, (await me(w.bob)).balance], [100, 0]);
  assert.ok(back.payment_id);
});

test('S3 correction: a correction that makes a past balance negative is historical_overdraft and changes nothing', async () => {
  const w = await world(srv.base, fixture({ users: [user('ada', 10_000), user('bob', 0), user('cy', 1_000)] }));
  const p1 = await paid(w, 'ada', 'bob', 100);
  await sleep(5);
  await paid(w, 'bob', 'cy', 100); // bob back to 0
  await sleep(5);
  await paid(w, 'cy', 'bob', 200); // bob 200 now
  const before = (await w.bob.get('/statement')).body;
  expectError(await correct(w.ada, p1.payment_id, body(p1, { amount: 0 })), 409, 'historical_overdraft');
  assert.deepEqual([(await me(w.bob)).balance, (await w.bob.get(`/payments/${p1.payment_id}/revisions`)).body.revisions.length], [200, 1]);
  const after = (await w.bob.get('/statement')).body;
  assert.deepEqual(after.entries, before.entries);
});

test('S3 correction: a past hold counts — a correction that leaves available negative then is refused', async () => {
  const w = await world(srv.base, fixture({ users: [user('ada', 10_000), user('bob', 0), user('cy', 0)] }));
  const p1 = await paid(w, 'ada', 'bob', 100);
  await sleep(5);
  const hold = (await w.bob.post('/authorizations', { to_handle: 'cy', amount: 100 }, newKey())).body; // bob: available 0
  await sleep(5);
  await w.bob.post(`/authorizations/${hold.authorization_id}/void`);
  await paid(w, 'ada', 'bob', 500);
  expectError(await correct(w.ada, p1.payment_id, body(p1, { amount: 0 })), 409, 'historical_overdraft');
  assert.equal((await me(w.bob)).balance, 600);
});

test('S3 known_at and effective_at: corrections change history only from when they are known, at their effective time', async () => {
  const w = await world(srv.base, fixture({ payments: [
    { id: 'p_old', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 500, note: '', created_at: '2025-03-01T00:00:00Z' },
  ] }));
  const beforeCorrection = new Date().toISOString();
  await sleep(5);
  const p = { payment_id: 'p_old', created_at: '2025-03-01T00:00:00Z' };
  const res = await correct(w.ada, 'p_old', body(p, { amount: 0, effective_at: '2025-01-01T00:00:00Z', reason: 'never happened' }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const window = { from: '2025-02-01T00:00:00Z', to: '2025-04-01T00:00:00Z' };
  const known = (await w.ada.get(`/statement${q({ ...window, known_at: beforeCorrection })}`)).body;
  assert.deepEqual(known.entries.map((e) => [e.payment.payment_id, e.payment.amount, e.revision]), [['p_old', 500, 1]]);
  assert.equal(known.known_at, beforeCorrection);
  const now = (await w.ada.get(`/statement${q(window)}`)).body;
  assert.deepEqual(now.entries, [], 'the correction moved it out of the window, to 2025-01-01');
  const all = (await w.ada.get('/statement')).body.entries;
  assert.deepEqual(all.map((e) => [e.delta, e.revision, e.effective_at]), [[0, 2, '2025-01-01T00:00:00.000+00:00']], 'a zero revision is an entry with zero delta');
  const asOf = { as_of: '2025-03-15T00:00:00Z' };
  assert.equal((await me(w.ada, { ...asOf, known_at: beforeCorrection })).balance, 10_000);
  assert.equal((await me(w.ada, asOf)).balance, 10_500);
  const totals = await Promise.all(['ada', 'bob', 'cy'].map(async (h) => (await me(w[h], asOf)).total));
  assert.equal(totals.reduce((a, b) => a + b), 13_000, 'every historical view keeps the seeded total');
});

test('S3 correction: concurrent corrections from the same revision cannot both succeed', async () => {
  const w = await world(srv.base);
  const p = await paid(w);
  const out = await Promise.all(Array.from({ length: 10 }, (_, i) => correct(w.ada, p.payment_id, body(p, { amount: 50 + i }))));
  assert.equal(out.filter((r) => r.status === 201).length, 1);
  assert.ok(out.filter((r) => r.status !== 201).every((r) => r.body.error.code === 'stale_revision'));
});

test('S3 correction: revisions and correction replays survive export and import; edited ones are refused', async () => {
  const w = await world(srv.base);
  const p = await paid(w);
  const key = newKey();
  const receipt = (await correct(w.ada, p.payment_id, body(p), key)).body;
  const snapshot = (await call(srv.base, 'GET', '/_test/export')).body;
  await call(srv.base, 'POST', '/_test/reset', { json: fixture() });
  assert.equal((await call(srv.base, 'POST', '/_test/import', { json: snapshot })).status, 204);
  const replay = await correct(w.ada, p.payment_id, body(p), key);
  assert.deepEqual([replay.status, replay.body], [200, receipt]);
  const s = snapshot.state;
  const editRev = (over) => ({ ...snapshot, state: { ...s, payments: s.payments.map((x) => ({ ...x, revisions: x.revisions.map((r, i) => (i === 1 ? { ...r, ...over } : r)) })) } });
  const editReceipt = (over) => ({ ...snapshot, state: { ...s, idempotency: s.idempotency.map((rec) => (rec.scope.includes('/corrections') ? { ...rec, response: { ...rec.response, body: { ...rec.response.body, ...over } } } : rec)) } });
  const bad = {
    'correction reason edited': editRev({ reason: 'other' }),
    'correction reason emptied': editRev({ reason: '' }),
    'correction recorded before revision 1': editRev({ recorded_at_ms: 0 }),
    'correction effective after it was recorded': editRev({ effective_at_ms: s.last_timestamp_ms + 10 }),
    'correction receipt amount edited': editReceipt({ amount: 61 }),
    'correction receipt reason edited': editReceipt({ reason: 'x' }),
  };
  for (const [label, envelope] of Object.entries(bad)) {
    expectError(await call(srv.base, 'POST', '/_test/import', { json: envelope }), 422, 'validation_failed', label);
  }
});
