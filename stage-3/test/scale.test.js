// Stage 3 at size (§2: 5 s per request, 10 s for reset, up to 50 in flight).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, fixture, newKey, user, useServer, world } from './helpers.js';

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
    assert.ok(ms < 3_000, `reset took ${ms} ms`);
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
  assert.ok(slowest < 1_500, `slowest correction took ${slowest} ms (all 20: ${Date.now() - started} ms)`);
});
