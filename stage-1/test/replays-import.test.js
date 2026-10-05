// R14 (stage-1 §10, found in the stage-2 final review): a stored replay must describe the record it answered for.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, fixture, newKey, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));

test('R14: an import whose stored replays contradict the records is 422', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  await w.ada.post('/payments', { to_handle: 'bob', amount: 10 }, newKey());
  const rq = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 20, note: '' }, newKey())).body;
  await w.ada.post(`/requests/${rq.request_id}/pay`, {}, newKey());
  await w.ada.post('/splits', { amount: 30, participant_handles: ['ada', 'bob'], note: '' }, newKey());
  await w.ada.post('/settlements', { transfers: [{ from_handle: 'bob', to_handle: 'cy', amount: 1 }] }, newKey());
  const good = (await call(srv.base, 'GET', '/_test/export')).body;
  const s = good.state;
  const routeOf = (rec) => JSON.parse(rec.scope)[2];
  const editReplay = (route, change) => ({
    ...good,
    state: { ...s, idempotency: s.idempotency.map((rec) => (routeOf(rec) === route ? { ...rec, ...change(rec) } : rec)) },
  });
  const body = (over) => (rec) => ({ response: { ...rec.response, body: { ...rec.response.body, ...over } } });
  const bad = {
    'payment receipt names no payment': editReplay('/payments', body({ payment_id: 'p_ghost' })),
    'payment receipt amount differs': editReplay('/payments', body({ amount: 999_999 })),
    'payment receipt timestamp out of range': editReplay('/payments', body({ created_at: '+010000-01-01T00:00:00.000+00:00' })),
    'pay receipt names another request': editReplay('/requests/:id/pay', body({ request_id: 'rq_other' })),
    'request receipt names another amount': editReplay('/requests', body({ amount: 21 })),
    'split receipt names no split': editReplay('/splits', body({ split_id: 'sp_ghost' })),
    'settlement receipt lists other payments': editReplay('/settlements', body({ payments: [] })),
    'fingerprint disagrees with its receipt': editReplay('/payments', (rec) => ({
      fingerprint: rec.fingerprint.replace(/"amount":\d+/, '"amount":11'),
    })),
    'replay under an unknown route': editReplay('/payments', (rec) => {
      const [u, m, , p, k] = JSON.parse(rec.scope);
      return { scope: JSON.stringify([u, m, '/nowhere', p, k]) };
    }),
  };
  for (const [label, envelope] of Object.entries(bad)) {
    expectError(await call(srv.base, 'POST', '/_test/import', { json: envelope }), 422, 'validation_failed', label);
  }
  assert.equal((await call(srv.base, 'POST', '/_test/import', { json: good })).status, 204, 'the unchanged export imports');
});
