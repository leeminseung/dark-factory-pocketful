// Stage 4: refunds.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asStage3Export, call, fixture, newKey, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));
const pay = async (client, to, amount, extra = {}) => {
  const res = await client.post('/payments', { to_handle: to, amount, ...extra }, newKey());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};
const refund = (client, payment, amount, key = newKey()) => client.post(`/payments/${payment.payment_id}/refunds`, { amount }, key);
const money = async (client) => {
  const b = (await client.get('/me')).body;
  return [b.total, b.available];
};
const exportState = async () => (await call(srv.base, 'GET', '/_test/export')).body;
const importState = (json) => call(srv.base, 'POST', '/_test/import', { json });

test('S4 refunds: a refund is a new payment back, linked by refund_of, with the original note and visibility', async () => {
  const w = await world(srv.base);
  const p = await pay(w.ada, 'bob', 1_000, { note: 'dinner', visibility: 'private' });
  assert.equal(p.refund_of, null, 'other payments carry refund_of null');
  const key = newKey();
  const res = await refund(w.bob, p, 200, key);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const r = res.body;
  assert.deepEqual(
    [r.from_handle, r.to_handle, r.amount, r.refund_of, r.request_id, r.authorization_id, r.settlement_id, r.note, r.visibility],
    ['bob', 'ada', 200, p.payment_id, null, null, null, 'dinner', 'private'],
  );
  assert.notEqual(r.payment_id, p.payment_id);
  assert.deepEqual(await money(w.ada), [9_200, 9_200]);
  assert.deepEqual(await money(w.bob), [3_300, 3_300]);
  const replay = await refund(w.bob, p, 200, key);
  assert.deepEqual([replay.status, replay.body], [200, r]);
  expectError(await refund(w.bob, p, 300, key), 409, 'idempotency_key_reuse');
  const feed = (await w.ada.get('/activity')).body.payments;
  assert.deepEqual(feed.map((x) => [x.payment_id, x.refund_of]), [[r.payment_id, p.payment_id], [p.payment_id, null]]);
  assert.equal((await w.ada.get(`/payments/${p.payment_id}/revisions`)).body.revisions.length, 1, 'the original is unchanged');
});

test('S4 refunds: who may refund what, and invalid amounts', async () => {
  const w = await world(srv.base);
  const p = await pay(w.ada, 'bob', 1_000);
  expectError(await w.bob.post('/payments/p_nope/refunds', { amount: 1 }, newKey()), 404, 'not_found');
  expectError(await refund(w.ada, p, 1), 403, 'forbidden', 'the sender');
  expectError(await refund(w.cy, p, 1), 403, 'forbidden', 'a third party');
  for (const amount of [0, -1, 1.5, '5', null, true, 1_000_000_001]) {
    expectError(await refund(w.bob, p, amount), 422, 'validation_failed', `amount ${JSON.stringify(amount)}`);
  }
  expectError(await w.bob.post(`/payments/${p.payment_id}/refunds`, {}, newKey()), 422, 'validation_failed', 'amount missing');
  expectError(await w.bob.post(`/payments/${p.payment_id}/refunds`, { amount: 1 }), 400, 'missing_idempotency_key');
  const r = (await refund(w.bob, p, 100)).body;
  expectError(await refund(w.ada, r, 10), 422, 'invalid_refund_target', 'the refund\'s receiver cannot refund a refund');
  expectError(await refund(w.bob, r, 10), 403, 'forbidden', 'nor can its sender');
  assert.deepEqual(await money(w.bob), [3_400, 3_400]);
});

test('S4 refunds: refunds total at most the current corrected amount, and a correction cannot go below them', async () => {
  const w = await world(srv.base);
  const p = await pay(w.ada, 'bob', 1_000);
  assert.equal((await refund(w.bob, p, 600)).status, 201);
  expectError(await refund(w.bob, p, 401), 422, 'refund_exceeds_payment');
  assert.equal((await refund(w.bob, p, 400)).status, 201, 'exactly the amount');
  expectError(await refund(w.bob, p, 1), 422, 'refund_exceeds_payment');
  const q = await pay(w.ada, 'bob', 1_000);
  assert.equal((await refund(w.bob, q, 300)).status, 201);
  const correct = (amount, expected) => w.ada.post(`/payments/${q.payment_id}/corrections`, {
    expected_revision: expected, amount, effective_at: q.created_at, reason: 'fix',
  }, newKey());
  expectError(await correct(299, 1), 422, 'refund_exceeds_payment', 'below what was refunded');
  assert.equal((await correct(500, 1)).status, 201, 'down to above the refunds');
  expectError(await refund(w.bob, q, 201), 422, 'refund_exceeds_payment', 'against the corrected amount');
  assert.equal((await refund(w.bob, q, 200)).status, 201);
  assert.equal((await correct(500, 2)).status, 201, 'exactly the refunded amount is fine');
});

test('S4 refunds: the receiver pays from available funds, or 409 and nothing changes', async () => {
  const w = await world(srv.base, fixture({ users: [
    { id: 'u_ada', email: 'ada@example.com', password: 'correct horse', display_name: 'Ada', handle: 'ada', balance: 10_000 },
    { id: 'u_bob', email: 'bob@example.com', password: 'correct horse', display_name: 'Bob', handle: 'bob', balance: 0 },
    { id: 'u_cy', email: 'cy@example.com', password: 'correct horse', display_name: 'Cy', handle: 'cy', balance: 0 },
  ] }));
  const p = await pay(w.ada, 'bob', 1_000);
  assert.equal((await w.bob.post('/authorizations', { to_handle: 'cy', amount: 900 }, newKey())).status, 201);
  const key = newKey();
  expectError(await refund(w.bob, p, 101, key), 409, 'insufficient_funds', 'only 100 is available');
  assert.deepEqual(await money(w.bob), [1_000, 100]);
  assert.equal((await w.ada.get('/activity')).body.payments.length, 1, 'no refund was recorded');
  assert.equal((await refund(w.bob, p, 100, key)).status, 201, 'the failed key stays free');
  assert.deepEqual(await money(w.bob), [900, 0]);
});

test('S4 refunds: captures, request payments and settlement members can be refunded; nothing reopens', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_cy'] }));
  const a = (await w.ada.post('/authorizations', { to_handle: 'bob', amount: 500 }, newKey())).body;
  const capture = (await w.bob.post(`/authorizations/${a.authorization_id}/capture`, { amount: 300 }, newKey())).body;
  const cr = await refund(w.bob, capture, 300);
  assert.deepEqual([cr.status, cr.body.authorization_id, cr.body.refund_of], [201, null, capture.payment_id]);
  const auth = (await w.ada.get('/authorizations')).body.authorizations[0];
  assert.deepEqual([auth.status, auth.captured_amount, auth.remaining_amount], ['captured', 300, 0], 'no hold comes back');
  assert.deepEqual(await money(w.ada), [10_000, 10_000]);

  const request = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 200 }, newKey())).body;
  const paid = (await w.ada.post(`/requests/${request.request_id}/pay`, {}, newKey())).body;
  const rr = await refund(w.bob, paid, 200);
  assert.deepEqual([rr.status, rr.body.request_id], [201, null]);
  const listed = (await w.bob.get('/requests')).body.requests.find((x) => x.request_id === request.request_id);
  assert.equal(listed.status, 'paid', 'the request stays paid');

  const settlementKey = newKey();
  const transfers = [{ from_handle: 'ada', to_handle: 'bob', amount: 50 }, { from_handle: 'bob', to_handle: 'ada', amount: 20 }];
  const st = (await w.cy.post('/settlements', { transfers }, settlementKey)).body;
  const member = st.payments[0];
  const sr = await refund(w.bob, member, 50);
  assert.deepEqual([sr.status, sr.body.settlement_id], [201, null], 'the refund joins no settlement');
  const again = await w.cy.post('/settlements', { transfers }, settlementKey);
  assert.deepEqual([again.status, again.body], [200, st], 'the settlement retry is unchanged');

  for (const target of [capture, cr.body, sr.body]) {
    const owner = target.from_handle === 'bob' ? w.bob : w.ada;
    expectError(await owner.post(`/payments/${target.payment_id}/corrections`, {
      expected_revision: 1, amount: 1, effective_at: target.created_at, reason: 'x',
    }, newKey()), 422, 'linked_payment_immutable', `${target.payment_id} cannot be corrected`);
  }
});

test('S4 refunds: concurrent refunds never exceed the payment, and one key makes one refund', async () => {
  const w = await world(srv.base);
  const p = await pay(w.ada, 'bob', 1_000);
  const out = await Promise.all(Array.from({ length: 10 }, () => refund(w.bob, p, 200)));
  assert.equal(out.filter((r) => r.status === 201).length, 5);
  assert.ok(out.filter((r) => r.status !== 201).every((r) => r.body.error.code === 'refund_exceeds_payment'));
  const q = await pay(w.ada, 'bob', 1_000);
  const key = newKey();
  const same = await Promise.all(Array.from({ length: 10 }, () => refund(w.bob, q, 100, key)));
  assert.deepEqual(same.map((r) => r.status).sort(), [200, 200, 200, 200, 200, 200, 200, 200, 200, 201]);
  assert.ok(same.every((r) => r.body.payment_id === same[0].body.payment_id));
});

test('S4 refunds: refunds and their receipts survive export and import; a stage-3 export has none', async () => {
  const w = await world(srv.base);
  const p = await pay(w.ada, 'bob', 1_000);
  const key = newKey();
  const r = (await refund(w.bob, p, 400, key)).body;
  const exported = await exportState();
  await call(srv.base, 'POST', '/_test/reset', { json: fixture() });
  assert.equal((await importState(exported)).status, 204);
  assert.deepEqual((await refund(w.bob, p, 400, key)).body, r, 'the replay after import');
  expectError(await refund(w.bob, p, 601), 422, 'refund_exceeds_payment', 'the refunded total survives import');

  const s = exported.state;
  const refundRow = s.payments.find((x) => x.refund_of !== null);
  const original = s.payments.find((x) => x.id === p.payment_id);
  const editPayments = (edit) => ({ ...exported, state: { ...s, payments: s.payments.map((x) => edit(x) ?? x) } });
  const bad = {
    'refund of an unknown payment': editPayments((x) => (x === refundRow ? { ...x, refund_of: 'p_ghost' } : null)),
    'refund of itself': editPayments((x) => (x === refundRow ? { ...x, refund_of: x.id } : null)),
    'refund in the same direction': editPayments((x) => (x === refundRow ? { ...x, from_user_id: 'u_ada', to_user_id: 'u_bob' } : null)),
    'refund with another note': editPayments((x) => (x === refundRow ? { ...x, note: 'other' } : null)),
    'refund_of missing on one payment': editPayments((x) => (x === original ? (({ refund_of, ...rest }) => rest)(x) : null)),
    'refund_of not a string': editPayments((x) => (x === original ? { ...x, refund_of: 7 } : null)),
    'refunds above the payment': {
      ...exported,
      state: {
        ...s,
        payments: s.payments.map((x) => (x === original ? { ...x, amount: 300, revisions: x.revisions.map((rev) => ({ ...rev, amount: 300 })) } : x)),
        users: s.users.map((u) => ({ ...u, opening_balance: u.opening_balance + (u.id === 'u_ada' ? -700 : u.id === 'u_bob' ? 700 : 0) })),
      },
    },
    'receipt names another target': {
      ...exported,
      state: { ...s, idempotency: s.idempotency.map((rec) => ({ ...rec, response: { ...rec.response, body: { ...rec.response.body, refund_of: 'p_other' } } })) },
    },
  };
  for (const [label, envelope] of Object.entries(bad)) expectError(await importState(envelope), 422, 'validation_failed', label);

  // A stage-3 export: no refund_of anywhere; every payment imports as no refund.
  const fresh = await world(srv.base);
  const plain = await pay(fresh.ada, 'bob', 100);
  const stage3 = asStage3Export(await exportState());
  assert.ok(stage3.state.payments.every((x) => !('refund_of' in x)));
  assert.equal((await importState(stage3)).status, 204);
  assert.equal((await fresh.ada.get('/activity')).body.payments[0].refund_of, null);
  assert.equal((await refund(fresh.bob, plain, 100)).status, 201);
});
