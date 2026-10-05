// Retries and concurrent writes for every state-changing endpoint (§1, §7).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, newKey, useServer, world } from './helpers.js';

const srv = useServer();
const statuses = (out) => out.map((r) => r.status).sort();
const times = (n, fn) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
const expectError = (res, status, code) => assert.deepEqual([res.status, res.body?.error?.code], [status, code]);

test('splits: replay is 200 with the same body, a changed body is 409, and nothing is created twice', async () => {
  const w = await world(srv.base);
  const key = newKey();
  const body = { amount: 1000, participant_handles: ['ada', 'bob', 'cy'], note: 'dinner' };
  const first = await w.ada.post('/splits', body, key);
  assert.equal(first.status, 201);
  const replay = await w.ada.post('/splits', body, key);
  assert.deepEqual([replay.status, replay.body], [200, first.body]);
  expectError(await w.ada.post('/splits', { ...body, amount: 999 }, key), 409, 'idempotency_key_reuse');
  assert.equal((await w.bob.get('/requests')).body.requests.length, 1);
});

test('splits: concurrent same-key requests make one split', async () => {
  const w = await world(srv.base);
  const key = newKey();
  const body = { amount: 30, participant_handles: ['ada', 'bob', 'cy'], note: '' };
  const out = await times(20, () => w.ada.post('/splits', body, key));
  assert.equal(out.filter((r) => r.status === 201).length, 1);
  assert.equal(out.filter((r) => r.status === 200).length, 19);
  assert.ok(out.every((r) => r.body.split_id === out[0].body.split_id));
  assert.equal((await w.ada.get('/requests')).body.requests.length, 2);
});

test('requests: concurrent same-key creates make one request', async () => {
  const w = await world(srv.base);
  const key = newKey();
  const out = await times(20, () => w.bob.post('/requests', { payer_handle: 'ada', amount: 5, note: 'n' }, key));
  assert.equal(out.filter((r) => r.status === 201).length, 1);
  assert.equal(out.filter((r) => r.status === 200).length, 19);
  assert.equal((await w.ada.get('/requests')).body.requests.length, 1);
});

test('pay: concurrent pays with different keys move money once', async () => {
  const w = await world(srv.base);
  const rq = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 700, note: '' }, newKey())).body;
  const out = await times(20, () => w.ada.post(`/requests/${rq.request_id}/pay`, {}, newKey()));
  assert.equal(out.filter((r) => r.status === 201).length, 1);
  assert.ok(out.filter((r) => r.status !== 201).every((r) => r.body.error.code === 'request_not_pending'));
  assert.equal(await w.ada.balance(), 9_300);
});

test('pay: concurrent pays with one key give one 201 and 200 replays', async () => {
  const w = await world(srv.base);
  const rq = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 700, note: '' }, newKey())).body;
  const key = newKey();
  const out = await times(20, () => w.ada.post(`/requests/${rq.request_id}/pay`, {}, key));
  assert.equal(out.filter((r) => r.status === 201).length, 1);
  assert.equal(out.filter((r) => r.status === 200).length, 19);
  assert.equal(await w.ada.balance(), 9_300);
});

test('pay racing decline and cancel: exactly one terminal state wins', async () => {
  for (let round = 0; round < 5; round += 1) {
    const w = await world(srv.base);
    const rq = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 100, note: '' }, newKey())).body.request_id;
    const out = await Promise.all([
      ...Array.from({ length: 5 }, () => w.ada.post(`/requests/${rq}/pay`, {}, newKey())),
      w.ada.post(`/requests/${rq}/decline`),
      w.bob.post(`/requests/${rq}/cancel`),
    ]);
    const winners = out.filter((r) => r.status === 200 || r.status === 201);
    assert.equal(winners.length, 1, JSON.stringify(statuses(out)));
    assert.ok(out.filter((r) => !winners.includes(r)).every((r) => r.body.error.code === 'request_not_pending'));
    const final = (await w.ada.get('/requests')).body.requests[0];
    const paid = final.status === 'paid';
    assert.equal(await w.ada.balance(), paid ? 9_900 : 10_000);
    assert.equal(final.payment_id !== null, paid);
  }
});

test('decline and cancel: concurrent repeats all answer 200 with the same terminal state', async () => {
  const w = await world(srv.base);
  const a = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 1, note: '' }, newKey())).body.request_id;
  const b = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 1, note: '' }, newKey())).body.request_id;
  const declines = await times(10, () => w.ada.post(`/requests/${a}/decline`));
  const cancels = await times(10, () => w.bob.post(`/requests/${b}/cancel`));
  assert.ok(declines.every((r) => r.status === 200 && r.body.status === 'declined'));
  assert.ok(cancels.every((r) => r.status === 200 && r.body.status === 'cancelled'));
});

test('settlements: concurrent same-key batches commit once', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  const key = newKey();
  const body = { transfers: [{ from_handle: 'bob', to_handle: 'cy', amount: 100 }] };
  const out = await times(20, () => w.ada.post('/settlements', body, key));
  assert.equal(out.filter((r) => r.status === 201).length, 1);
  assert.equal(out.filter((r) => r.status === 200).length, 19);
  assert.ok(out.every((r) => r.body.settlement_id === out[0].body.settlement_id));
  assert.equal(await w.cy.balance(), 600);
  expectError(await w.ada.post('/settlements', { transfers: [{ from_handle: 'bob', to_handle: 'cy', amount: 101 }] }, key),
    409, 'idempotency_key_reuse');
});
