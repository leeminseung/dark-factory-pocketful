// Stage 3: payment timestamps, revisions and opening balances in the stored state.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asStage2Export, call, fixture, newKey, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));
const exportState = async () => (await call(srv.base, 'GET', '/_test/export')).body;
const importState = (json) => call(srv.base, 'POST', '/_test/import', { json });
const seededPayment = (id, over = {}) => ({ id, from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 500, note: '', ...over });

test('S3: seeded payments may carry created_at; omitted ones get the reset time; the feed orders by created_at', async () => {
  const w = await world(srv.base, fixture({ payments: [
    seededPayment('p_reset'),
    seededPayment('p_2025', { created_at: '2025-03-01T10:00:00+02:00' }),
  ] }));
  const api = (await w.ada.post('/payments', { to_handle: 'bob', amount: 1 }, newKey())).body;
  const feed = (await w.ada.get('/activity')).body.payments;
  assert.deepEqual(feed.map((p) => p.payment_id), [api.payment_id, 'p_reset', 'p_2025']);
  assert.equal(feed[2].created_at, '2025-03-01T08:00:00.000+00:00', 'the same instant, given back in UTC');
  assert.ok(Date.parse(feed[1].created_at) <= Date.parse(api.created_at));
});

test('S3: a seeded created_at in the future, or not an RFC 3339 instant with an offset, is a reset error', async () => {
  const w = await world(srv.base);
  const reset = (fx) => call(srv.base, 'POST', '/_test/reset', { json: fx });
  const future = new Date(Date.now() + 60_000).toISOString();
  for (const created_at of [future, '2026-01-01T10:00:00', '2026-01-01', '', 5]) {
    const res = await reset(fixture({ payments: [seededPayment('p_1', { created_at })] }));
    assert.ok([400, 422].includes(res.status) && res.status !== 204, `${created_at}: ${res.status}`);
    if (typeof created_at === 'string') expectError(res, 422, 'validation_failed', String(created_at));
  }
  assert.equal((await w.ada.get('/me')).body.balance, 10_000, 'nothing changed');
});

test('S3: opening balances are the seeded balances before the seeded payments, and an inconsistent seed is refused', async () => {
  await world(srv.base, fixture({ payments: [seededPayment('p_1', { amount: 2000, created_at: '2025-01-01T00:00:00Z' })] }));
  const users = Object.fromEntries((await exportState()).state.users.map((u) => [u.id, u]));
  assert.deepEqual([users.u_ada.opening_balance, users.u_ada.balance], [12_000, 10_000]);
  assert.deepEqual([users.u_bob.opening_balance, users.u_bob.balance], [500, 2_500]);
  // Cy holds 500 but is said to have received 600: the wallet would have opened below zero.
  expectError(await call(srv.base, 'POST', '/_test/reset', {
    json: fixture({ payments: [{ id: 'p_x', from_user_id: 'u_bob', to_user_id: 'u_cy', amount: 600, note: '' }] }),
  }), 422, 'validation_failed');
});

test('S3: payments carry revision 1 and authorizations closed_at through export and import', async () => {
  const w = await world(srv.base);
  await w.ada.post('/payments', { to_handle: 'bob', amount: 10 }, newKey());
  const a = (await w.ada.post('/authorizations', { to_handle: 'bob', amount: 100 }, newKey())).body;
  await w.bob.post(`/authorizations/${a.authorization_id}/capture`, { amount: 40 }, newKey());
  const snapshot = await exportState();
  const s = snapshot.state;
  for (const p of s.payments) {
    const { seq, ...rev } = p.revisions[0];
    assert.equal(p.revisions.length, 1);
    assert.deepEqual(rev, {
      revision: 1, amount: p.amount, effective_at_ms: p.created_at_ms, effective_at_frac: p.created_at_frac,
      recorded_at_ms: p.created_at_ms, recorded_at_frac: p.created_at_frac, reason: '', correction_batch_id: null,
    });
    assert.ok(Number.isInteger(seq) && seq >= 1 && seq <= s.record_sequence);
  }
  const capture = s.payments.find((p) => p.authorization_id === a.authorization_id);
  assert.equal(s.authorizations[0].closed_at_ms, capture.created_at_ms, 'a final capture closes at its payment');
  assert.equal((await importState(snapshot)).status, 204);
  const edit = (over) => ({ ...snapshot, state: { ...s, ...over } });
  const bad = {
    'revision renumbered': edit({ payments: s.payments.map((p) => ({ ...p, revisions: [{ ...p.revisions[0], revision: 2 }] })) }),
    'revision 1 amount differs': edit({ payments: s.payments.map((p) => ({ ...p, revisions: [{ ...p.revisions[0], amount: p.amount + 1 }] })) }),
    'revisions missing': edit({ payments: s.payments.map(({ revisions, ...p }) => ({ ...p, revisions: [] })) }),
    'opening balance edited': edit({ users: s.users.map((u) => ({ ...u, opening_balance: u.opening_balance + 1 })) }),
    'closed_at edited': edit({ authorizations: s.authorizations.map((x) => ({ ...x, closed_at_ms: x.closed_at_ms + 1 })) }),
    'open authorization with closed_at': edit({ authorizations: s.authorizations.map((x) => ({ ...x, status: 'open', closed_at_ms: x.closed_at_ms })) }),
    'only some stage-3 fields': edit({ users: s.users.map(({ opening_balance, ...u }) => u) }),
  };
  for (const [label, envelope] of Object.entries(bad)) expectError(await importState(envelope), 422, 'validation_failed', label);
});

test('S3: a stage-2 export imports, with revision 1, opening balances and closed_at derived', async () => {
  const w = await world(srv.base);
  await w.ada.post('/payments', { to_handle: 'bob', amount: 10 }, newKey());
  const a = (await w.ada.post('/authorizations', { to_handle: 'bob', amount: 100 }, newKey())).body;
  const v = (await w.ada.post('/authorizations', { to_handle: 'cy', amount: 50 }, newKey())).body;
  await w.bob.post(`/authorizations/${a.authorization_id}/capture`, { amount: 40, final: false }, newKey());
  await w.ada.post(`/authorizations/${v.authorization_id}/void`);
  const current = await exportState();
  const stage2 = asStage2Export(current);
  await call(srv.base, 'POST', '/_test/reset', { json: fixture() });
  assert.equal((await importState(stage2)).status, 204);
  const again = (await exportState()).state;
  assert.deepEqual(again.users.map((u) => u.opening_balance), current.state.users.map((u) => u.opening_balance));
  assert.deepEqual(again.payments.map((p) => p.revisions), current.state.payments.map((p) => p.revisions));
  const byId = Object.fromEntries(again.authorizations.map((x) => [x.id, x]));
  assert.equal(byId[a.authorization_id].closed_at_ms, null, 'still open');
  assert.ok(byId[v.authorization_id].closed_at_ms >= byId[v.authorization_id].created_at_ms);
  assert.equal((await w.ada.get('/me')).body.held, 60);
});
