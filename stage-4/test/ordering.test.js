// R16: payments made one after another keep that order on a statement, even within one millisecond.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, newKey, useServer, world } from './helpers.js';
import { State } from '../src/state.js';
import { statement } from '../src/ledger.js';

const srv = useServer();

test('R16: with the clock stuck on one millisecond, payments keep creation order', () => {
  const realNow = Date.now;
  Date.now = () => 1_790_000_000_000;
  try {
    const state = new State({ currency: 'EUR', minorUnits: 2 });
    state.addUser({ id: 'u_a', email: 'a@x.y', passwordHash: 'h', displayName: 'A', handle: 'a', balance: 2_000, openingBalance: 2_000 });
    state.addUser({ id: 'u_b', email: 'b@x.y', passwordHash: 'h', displayName: 'B', handle: 'b', balance: 0, openingBalance: 0 });
    const amounts = Array.from({ length: 50 }, (_, i) => i + 1);
    for (const amount of amounts) {
      state.movePayments([{ fromUserId: 'u_a', toUserId: 'u_b', amount, note: '', visibility: 'public' }], { createdAt: state.nextTimestamp() });
    }
    const entries = statement(state, 'u_a', { from: null, to: Number.POSITIVE_INFINITY }).entries;
    assert.deepEqual(entries.map((e) => -e.delta), amounts);
  } finally {
    Date.now = realNow;
  }
});

test('R16: 200 back-to-back pairs of payments come out in creation order', async () => {
  const w = await world(srv.base, fixture());
  for (let i = 0; i < 200; i += 1) {
    await w.ada.post('/payments', { to_handle: 'bob', amount: 3 }, newKey());
    await w.ada.post('/payments', { to_handle: 'bob', amount: 2 }, newKey());
  }
  const deltas = [];
  let offset = 0;
  for (;;) {
    const page = (await w.ada.get(`/statement?limit=200&offset=${offset}`)).body;
    deltas.push(...page.entries.map((e) => e.delta));
    if (!page.has_more) break;
    offset += 200;
  }
  assert.deepEqual(deltas, Array.from({ length: 400 }, (_, i) => (i % 2 === 0 ? -3 : -2)));
});

test('R16: a payment made right after a reset is stamped after the seeded ones without created_at', async () => {
  for (let i = 0; i < 20; i += 1) {
    const w = await world(srv.base, fixture({ payments: [{ id: 'p_seed', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 1, note: '' }] }));
    const p = (await w.ada.post('/payments', { to_handle: 'bob', amount: 2 }, newKey())).body;
    const feed = (await w.ada.get('/activity')).body.payments;
    assert.ok(Date.parse(p.created_at) > Date.parse(feed.find((x) => x.payment_id === 'p_seed').created_at));
    const st = (await w.ada.get('/statement')).body.entries.map((e) => e.payment.payment_id);
    assert.deepEqual(st, ['p_seed', p.payment_id]);
  }
});
