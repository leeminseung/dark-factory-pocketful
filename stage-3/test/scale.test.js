// Stage 3 at size (§2: 5 s per request, 10 s for reset, up to 50 in flight).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REQUEST_LIMIT_MS, RESET_LIMIT_MS, call, fixture, newKey, user, useServer, world } from './helpers.js';

const srv = useServer();

/** A fixture with `count` seeded payments, in time order, among `people` users who all stay solvent. */
function busyFixture(count, people = 50) {
  const users = Array.from({ length: people }, (_, i) => user(`u${i}`, 1_000_000));
  const start = Date.UTC(2025, 0, 1);
  const payments = Array.from({ length: count }, (_, i) => ({
    id: `p_${String(i).padStart(6, '0')}`,
    from_user_id: `u_u${i % people}`,
    to_user_id: `u_u${(i + 1) % people}`,
    amount: 1 + (i % 7),
    note: '',
    created_at: new Date(start + i * 60_000).toISOString(),
  }));
  return fixture({ users, payments });
}

for (const people of [50, 2]) {
  test(`R2: a reset with 20000 seeded payments among ${people} users stays well inside 10 s`, async () => {
    const started = Date.now();
    const res = await call(srv.base, 'POST', '/_test/reset', { json: busyFixture(20_000, people) });
    const ms = Date.now() - started;
    assert.equal(res.status, 204, JSON.stringify(res.body));
    assert.ok(ms < RESET_LIMIT_MS, `reset took ${ms} ms`);
  });
}

test('R2: with 5000 payments, 20 concurrent corrections each answer well inside 5 s', async () => {
  const w = await world(srv.base, busyFixture(5_000, 2));
  // u0 sent every even-numbered payment to u1; correct twenty of them by one unit each.
  const targets = Array.from({ length: 20 }, (_, i) => `p_${String(i * 2).padStart(6, '0')}`);
  const started = Date.now();
  const out = await Promise.all(targets.map(async (id) => {
    const t0 = Date.now();
    const revs = (await w.u0.get(`/payments/${id}/revisions`)).body.revisions;
    const res = await w.u0.post(`/payments/${id}/corrections`, {
      expected_revision: 1, amount: revs[0].amount + 1, effective_at: revs[0].effective_at, reason: 'load',
    }, newKey());
    return { status: res.status, ms: Date.now() - t0 };
  }));
  assert.ok(out.every((r) => r.status === 201), JSON.stringify(out.map((r) => r.status)));
  const slowest = Math.max(...out.map((r) => r.ms));
  assert.ok(slowest < REQUEST_LIMIT_MS, `slowest correction took ${slowest} ms (all 20: ${Date.now() - started} ms)`);
});

test('R1: a statement snapshot is a few fields, not a copy of the statement', async () => {
  const { store } = await import('../src/state.js');
  const w = await world(srv.base, busyFixture(5_000, 2));
  for (let i = 0; i < 20; i += 1) assert.equal((await w.u0.get('/statement?limit=1')).status, 200);
  const sizes = [...store.current.snapshots.values()].map((s) => JSON.stringify(s).length);
  assert.equal(sizes.length, 20);
  assert.ok(Math.max(...sizes) < 400, `largest snapshot record is ${Math.max(...sizes)} bytes`);
});
