// R8 (stage-4 final review): an idempotency receipt belongs to the user who made the write.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, fixture, newKey, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));
/** The receipt with its scope's user replaced (scopes are canonical JSON arrays of plain values). */
const rescope = (rec, userId) => {
  const parts = JSON.parse(rec.scope);
  parts[0] = userId;
  return { ...rec, scope: JSON.stringify(parts) };
};

test('R8: a settlement receipt moved to a non-operator, or copied to another operator, is 422 on import', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_cy', 'u_bob'] }));
  const key = newKey();
  const body = { transfers: [{ from_handle: 'ada', to_handle: 'bob', amount: 10 }, { from_handle: 'bob', to_handle: 'ada', amount: 4 }] };
  const first = await w.cy.post('/settlements', body, key);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const exported = (await call(srv.base, 'GET', '/_test/export')).body;
  const s = exported.state;
  const receipt = s.idempotency.find((rec) => rec.scope.includes('"/settlements"'));
  const withReceipts = (idempotency) => ({ ...exported, state: { ...s, idempotency } });
  const others = s.idempotency.filter((rec) => rec !== receipt);
  expectError(await call(srv.base, 'POST', '/_test/import', { json: withReceipts([...others, rescope(receipt, 'u_ada')]) }),
    422, 'validation_failed', 'moved to ada, who is no operator');
  expectError(await call(srv.base, 'POST', '/_test/import', { json: withReceipts([...s.idempotency, rescope(receipt, 'u_bob')]) }),
    422, 'validation_failed', 'copied to bob: one settlement, two receipts');
  assert.equal((await call(srv.base, 'POST', '/_test/import', { json: exported })).status, 204);
  const replay = await w.cy.post('/settlements', body, key);
  assert.deepEqual([replay.status, replay.body], [200, first.body], 'the unedited export keeps the operator\'s replay');
});

test('R8: a payment receipt copied into another scope is 422 on import', async () => {
  const w = await world(srv.base);
  await w.ada.post('/payments', { to_handle: 'bob', amount: 10 }, newKey());
  const exported = (await call(srv.base, 'GET', '/_test/export')).body;
  const s = exported.state;
  const copy = rescope(s.idempotency[0], 'u_ada');
  const parts = JSON.parse(copy.scope);
  parts[4] = 'another-key';
  const envelope = { ...exported, state: { ...s, idempotency: [...s.idempotency, { ...copy, scope: JSON.stringify(parts) }] } };
  expectError(await call(srv.base, 'POST', '/_test/import', { json: envelope }), 422, 'validation_failed',
    'one payment, two receipts under two keys');
});
