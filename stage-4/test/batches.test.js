// Stage 4: operator correction batches.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asStage3Export, call, fixture, newKey, user, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));
const operatorFixture = (over = {}) => fixture({ settlement_operator_ids: ['u_cy'], ...over });
const pay = async (client, to, amount) => {
  const res = await client.post('/payments', { to_handle: to, amount }, newKey());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};
const item = (p, over = {}) => ({
  payment_id: p.payment_id, expected_revision: 1, amount: p.amount, effective_at: p.created_at, reason: 'batch', ...over,
});
const batch = (client, corrections, key = newKey()) => client.post('/correction-batches', { corrections }, key);
const balances = async (w) => Promise.all(['ada', 'bob', 'cy'].map(async (h) => (await w[h].get('/me')).body.balance));
const revisionsOf = async (client, p) => (await client.get(`/payments/${p.payment_id}/revisions`)).body.revisions;
const exportState = async () => (await call(srv.base, 'GET', '/_test/export')).body;
const importState = (json) => call(srv.base, 'POST', '/_test/import', { json });

test('S4 batches: an operator corrects several payments at one recorded instant, in input order; replays are 200', async () => {
  const w = await world(srv.base, operatorFixture());
  const p1 = await pay(w.ada, 'bob', 100);
  const p2 = await pay(w.bob, 'ada', 300);
  const single = (await w.ada.post(`/payments/${p1.payment_id}/corrections`, {
    expected_revision: 1, amount: 120, effective_at: p1.created_at, reason: 'single',
  }, newKey())).body;
  assert.equal(single.correction_batch_id, null, 'a single correction belongs to no batch');
  const key = newKey();
  const body = [item(p2, { amount: 250, effective_at: p2.created_at.replace('+00:00', 'Z') }), item(p1, { expected_revision: 2, amount: 80 })];
  const res = await batch(w.cy, body, key);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const b = res.body;
  assert.match(b.correction_batch_id, /^cb_/);
  assert.deepEqual(b.revisions.map((r) => [r.payment_id, r.revision, r.amount, r.recorded_at, r.correction_batch_id]), [
    [p2.payment_id, 2, 250, b.recorded_at, b.correction_batch_id],
    [p1.payment_id, 3, 80, b.recorded_at, b.correction_batch_id],
  ]);
  assert.ok(Date.parse(b.recorded_at) > Date.parse(single.recorded_at), 'strictly after each payment\'s previous revision');
  assert.equal(b.revisions[0].effective_at, p2.created_at);
  assert.deepEqual(await balances(w), [10_000 - 80 + 250, 2_500 + 80 - 250, 500]);
  assert.deepEqual((await revisionsOf(w.ada, p1)).map((r) => r.correction_batch_id), [null, null, b.correction_batch_id]);
  const replay = await batch(w.cy, body, key);
  assert.deepEqual([replay.status, replay.body], [200, b]);
  expectError(await batch(w.cy, [body[0]], key), 409, 'idempotency_key_reuse');
  assert.equal((await w.ada.get('/activity')).body.payments.find((p) => p.payment_id === p1.payment_id).amount, 100,
    'the original payment is unchanged');
  const extra = await w.cy.post('/correction-batches', { corrections: [{ ...item(p2, { expected_revision: 2, amount: 260 }), color: 'red' }], note: 1 }, newKey());
  assert.equal(extra.status, 201, 'unknown fields are ignored');
});

test('S4 batches: operators only, a key is required, and the batch has 1 to 32 distinct objects', async () => {
  const w = await world(srv.base, operatorFixture());
  const p = await pay(w.ada, 'bob', 100);
  expectError(await call(srv.base, 'POST', '/correction-batches', { json: { corrections: [item(p)] }, key: newKey() }), 401, 'unauthenticated');
  expectError(await batch(w.ada, [item(p)]), 403, 'forbidden', 'the payment\'s own sender is no operator');
  expectError(await w.cy.post('/correction-batches', { corrections: [item(p)] }), 400, 'missing_idempotency_key');
  const many = await Promise.all(Array.from({ length: 33 }, () => pay(w.ada, 'bob', 1)));
  const shapes = {
    'no corrections': undefined,
    'not an array': { payment_id: p.payment_id },
    empty: [],
    '33 items': many.map((x) => item(x)),
    'not an object': [item(p), 5],
    'duplicate payment_id': [item(p), item(p, { amount: 5 })],
  };
  for (const [label, corrections] of Object.entries(shapes)) {
    expectError(await batch(w.cy, corrections), 422, 'validation_failed', label);
  }
  assert.equal((await batch(w.cy, many.slice(0, 32).map((x) => item(x, { amount: 2 })))).status, 201, '32 items');
});

test('S4 batches: item errors come in input order, with the ordinary correction rules', async () => {
  const w = await world(srv.base, operatorFixture());
  const p = await pay(w.ada, 'bob', 100);
  const q = await pay(w.bob, 'ada', 100);
  const a = (await w.ada.post('/authorizations', { to_handle: 'bob', amount: 50 }, newKey())).body;
  const capture = (await w.bob.post(`/authorizations/${a.authorization_id}/capture`, {}, newKey())).body;
  const refund = (await w.bob.post(`/payments/${p.payment_id}/refunds`, { amount: 60 }, newKey())).body;
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const cases = [
    [[item(q), item(p, { payment_id: 'p_ghost' })], 404, 'not_found'],
    [[item(q, { expected_revision: 2 }), item(p, { amount: -1 })], 409, 'stale_revision'],
    [[item(q, { amount: -1 }), item(p, { payment_id: 'p_ghost' })], 422, 'validation_failed'],
    [[item(q, { reason: '' })], 422, 'validation_failed'],
    [[item(q, { effective_at: future })], 422, 'validation_failed'],
    [[item(q, { effective_at: '2026-01-01' })], 422, 'validation_failed'],
    [[item(q, { payment_id: 7 })], 422, 'validation_failed'],
    [[item(q), item(capture)], 422, 'linked_payment_immutable'],
    [[item(refund), item(q, { payment_id: 'p_ghost' })], 422, 'linked_payment_immutable'],
    [[item(p, { amount: 59 }), item(q, { expected_revision: 3 })], 422, 'refund_exceeds_payment'],
  ];
  for (const [corrections, status, code] of cases) {
    expectError(await batch(w.cy, corrections), status, code, JSON.stringify(corrections.map((c) => c.payment_id)));
  }
  assert.deepEqual((await revisionsOf(w.ada, p)).length, 1, 'nothing was recorded');
  assert.equal((await batch(w.cy, [item(p, { amount: 60 })])).status, 201, 'down to exactly the refunded amount');
});

test('S4 batches: a settlement is corrected whole, at one effective instant; its members stay out of single corrections', async () => {
  const w = await world(srv.base, operatorFixture());
  const transfers = [{ from_handle: 'ada', to_handle: 'bob', amount: 100 }, { from_handle: 'bob', to_handle: 'ada', amount: 40 }];
  const settlementKey = newKey();
  const st = (await w.cy.post('/settlements', { transfers }, settlementKey)).body;
  const [m1, m2] = st.payments;
  const other = await pay(w.ada, 'cy', 10);
  expectError(await w.ada.post(`/payments/${m1.payment_id}/corrections`, {
    expected_revision: 1, amount: 0, effective_at: m1.created_at, reason: 'x',
  }, newKey()), 422, 'linked_payment_immutable', 'a member is out of reach of a single correction');
  expectError(await batch(w.cy, [item(m1, { amount: 0 }), item(other)]), 422, 'incomplete_settlement');
  expectError(await batch(w.cy, [item(m1, { amount: 0 }), item(other, { payment_id: 'p_ghost' })]), 404, 'not_found',
    'item errors come before completeness');
  const earlier = new Date(Date.parse(m2.created_at) - 1000).toISOString();
  expectError(await batch(w.cy, [item(m1, { amount: 0 }), item(m2, { amount: 0, effective_at: earlier })]), 422, 'validation_failed',
    'members at different instants');
  // The same instant, spelt in +02:00.
  const inPlusTwo = new Date(Date.parse(m2.created_at) + 2 * 3_600_000).toISOString().replace('Z', '+02:00');
  assert.equal(Date.parse(inPlusTwo), Date.parse(m2.created_at));
  const res = await batch(w.cy, [item(m2, { amount: 0, effective_at: inPlusTwo }), item(m1, { amount: 0 })]);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(await balances(w), [10_000 - 10, 2_500, 510]);
  const again = await w.cy.post('/settlements', { transfers }, settlementKey);
  assert.deepEqual([again.status, again.body], [200, st], 'the settlement retry returns its original body');
});

test('S4 batches: completeness before funds, current funds on the combined effect, then history; a refusal changes nothing', async () => {
  const w = await world(srv.base, operatorFixture({ users: [user('ada', 1_000), user('bob', 0), user('cy', 0)] }));
  const p1 = await pay(w.ada, 'bob', 300);
  const p2 = await pay(w.ada, 'bob', 300);
  const transfers = [{ from_handle: 'ada', to_handle: 'cy', amount: 10 }, { from_handle: 'cy', to_handle: 'ada', amount: 10 }];
  const [m1] = (await w.cy.post('/settlements', { transfers }, newKey())).body.payments;
  // ada holds 400: raising both payments by 201 needs 402 at once, though each alone fits.
  const key = newKey();
  expectError(await batch(w.cy, [item(p1, { amount: 501 }), item(p2, { amount: 501 })], key), 409, 'insufficient_funds');
  expectError(await batch(w.cy, [item(p1, { amount: 9_999 }), item(m1)]), 422, 'incomplete_settlement', 'before funds');
  assert.deepEqual(await balances(w), [400, 600, 0]);
  assert.equal((await revisionsOf(w.ada, p1)).length, 1);
  // An increase and a decrease between the same wallets offset each other.
  assert.equal((await batch(w.cy, [item(p1, { amount: 900 }), item(p2, { amount: 0 })], key)).status, 201, 'the failed key stays free');
  assert.deepEqual(await balances(w), [100, 900, 0]);

  // bob forwarded 600 to cy; reversing his income 'before' it would overdraw him in the past.
  await pay(w.bob, 'cy', 600);
  await pay(w.ada, 'bob', 100);
  expectError(await batch(w.cy, [item(p1, { expected_revision: 2, amount: 300 })]), 409, 'insufficient_funds', 'now');
  // bob opens at 0, receives 500 on Jan 1, forwards it on Jan 2 and gets it back on Jan 3.
  const seeded = (id, from, to, day) => ({ id, from_user_id: from, to_user_id: to, amount: 500, note: '', created_at: `2025-01-0${day}T00:00:00Z` });
  const hist = await world(srv.base, operatorFixture({
    users: [user('ada', 500), user('bob', 500), user('cy', 0)],
    payments: [seeded('p_in', 'u_ada', 'u_bob', 1), seeded('p_out', 'u_bob', 'u_cy', 2), seeded('p_back', 'u_cy', 'u_bob', 3)],
  }));
  const income = { payment_id: 'p_in', amount: 500, created_at: '2025-01-01T00:00:00Z' };
  const before = { balances: await balances(hist), statement: (await hist.bob.get('/statement?limit=10')).body };
  const histKey = newKey();
  expectError(await batch(hist.cy, [item(income, { effective_at: '2025-01-02T12:00:00Z' })], histKey), 409, 'historical_overdraft');
  // R3: the refusal changed nothing, and its key is still free.
  assert.equal((await revisionsOf(hist.ada, income)).length, 1);
  assert.deepEqual(await balances(hist), before.balances);
  const after = (await hist.bob.get('/statement?limit=10')).body;
  assert.deepEqual({ ...after, snapshot: null }, { ...before.statement, snapshot: null }, 'the statement is as it was');
  const fine = await batch(hist.cy, [item(income, { effective_at: '2025-01-01T12:00:00Z' })], histKey);
  assert.equal(fine.status, 201, 'the refused key is a first use');
  assert.equal(fine.body.revisions[0].effective_at, '2025-01-01T12:00:00.000+00:00');
});

test('S4 batches: earlier snapshots keep paging their frozen entries; new statements show the batch', async () => {
  const w = await world(srv.base, operatorFixture());
  const p = await pay(w.ada, 'bob', 100);
  const first = (await w.ada.get('/statement?limit=10')).body;
  assert.equal((await batch(w.cy, [item(p, { amount: 70 })])).status, 201);
  const again = (await w.ada.get(`/statement?snapshot=${first.snapshot}&limit=10`)).body;
  assert.deepEqual(again, first);
  const fresh = (await w.ada.get('/statement?limit=10')).body;
  assert.deepEqual(fresh.entries.map((e) => [e.delta, e.revision]), [[-70, 2]]);
});

test('S4 batches: concurrent batches sharing an expected revision cannot both succeed', async () => {
  const w = await world(srv.base, operatorFixture());
  const p = await pay(w.ada, 'bob', 100);
  const q = await pay(w.ada, 'bob', 100);
  const out = await Promise.all([
    batch(w.cy, [item(p, { amount: 50 }), item(q, { amount: 50 })]),
    batch(w.cy, [item(q, { amount: 60 })]),
    w.ada.post(`/payments/${q.payment_id}/corrections`, { expected_revision: 1, amount: 70, effective_at: q.created_at, reason: 'r' }, newKey()),
  ]);
  assert.equal(out.filter((r) => r.status === 201).length, 1, JSON.stringify(out.map((r) => r.status)));
  assert.ok(out.filter((r) => r.status !== 201).every((r) => r.body.error.code === 'stale_revision'));
});

test('S4 batches: batches and their receipts survive export and import; edited ones are 422; a stage-3 export imports', async () => {
  const w = await world(srv.base, operatorFixture());
  const transfers = [{ from_handle: 'ada', to_handle: 'bob', amount: 100 }, { from_handle: 'bob', to_handle: 'ada', amount: 40 }];
  const [m1, m2] = (await w.cy.post('/settlements', { transfers }, newKey())).body.payments;
  const p = await pay(w.ada, 'bob', 100);
  const key = newKey();
  const body = [item(m1, { amount: 90 }), item(p, { amount: 80 }), item(m2, { amount: 40 })];
  const b = (await batch(w.cy, body, key)).body;
  const exported = await exportState();
  await call(srv.base, 'POST', '/_test/reset', { json: fixture() });
  assert.equal((await importState(exported)).status, 204);
  assert.deepEqual((await batch(w.cy, body, key)).body, b, 'the replay after import');
  assert.deepEqual((await revisionsOf(w.ada, p)).at(-1).correction_batch_id, b.correction_batch_id);

  const s = exported.state;
  const editRevision = (id, edit) => ({
    ...exported,
    state: { ...s, payments: s.payments.map((x) => (x.id === id ? { ...x, revisions: x.revisions.map((rev, i) => (i === 1 ? edit(rev) : rev)) } : x)) },
  });
  const bad = {
    'a member left out of its batch': editRevision(m2.payment_id, (rev) => ({ ...rev, correction_batch_id: 'cb_other' })),
    'a member corrected outside a batch': editRevision(m2.payment_id, (rev) => ({ ...rev, correction_batch_id: null })),
    'two recorded instants in one batch': editRevision(p.payment_id, (rev) => ({ ...rev, recorded_at_ms: rev.recorded_at_ms + 1 })),
    'members at two effective instants': editRevision(m2.payment_id, (rev) => ({ ...rev, effective_at_ms: rev.effective_at_ms - 1 })),
    'correction_batch_id missing': editRevision(p.payment_id, ({ correction_batch_id, ...rev }) => rev),
    'receipt with another amount': {
      ...exported,
      state: {
        ...s,
        idempotency: s.idempotency.map((rec) => (rec.scope.includes('correction-batches')
          ? { ...rec, response: { ...rec.response, body: { ...rec.response.body, revisions: rec.response.body.revisions.map((r, i) => (i ? r : { ...r, amount: 91 })) } } }
          : rec)),
      },
    },
  };
  for (const [label, envelope] of Object.entries(bad)) expectError(await importState(envelope), 422, 'validation_failed', label);

  const fresh = await world(srv.base, operatorFixture());
  const plain = await pay(fresh.ada, 'bob', 100);
  await fresh.ada.post(`/payments/${plain.payment_id}/corrections`, { expected_revision: 1, amount: 90, effective_at: plain.created_at, reason: 'r' }, newKey());
  const stage3 = asStage3Export(await exportState());
  assert.equal((await importState(stage3)).status, 204);
  assert.deepEqual((await revisionsOf(fresh.ada, plain)).map((r) => r.correction_batch_id), [null, null]);
  assert.equal((await batch(fresh.cy, [item(plain, { expected_revision: 2, amount: 50 })])).status, 201);
});
