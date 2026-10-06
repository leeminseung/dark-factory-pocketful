import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, newKey, useServer, world } from './helpers.js';

const srv = useServer();

async function ask(w, from = 'bob', payer = 'ada', amount = 100, extra = {}) {
  const res = await w[from].post('/requests', { payer_handle: payer, amount, ...extra }, newKey());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('a request above the payer balance is created pending', async () => {
  const w = await world(srv.base);
  const rq = await ask(w, 'bob', 'ada', 999_999);
  assert.equal(rq.status, 'pending');
  assert.equal(rq.payment_id, null);
  assert.equal(rq.requester_handle, 'bob');
  assert.equal(rq.payer_handle, 'ada');
});

test('self request is 422 self_request, unknown payer 404', async () => {
  const w = await world(srv.base);
  let res = await w.bob.post('/requests', { payer_handle: 'bob', amount: 1 }, newKey());
  assert.deepEqual([res.status, res.body.error.code], [422, 'self_request']);
  res = await w.bob.post('/requests', { payer_handle: 'nobody', amount: 1 }, newKey());
  assert.deepEqual([res.status, res.body.error.code], [404, 'not_found']);
});

test('paying moves money once, marks the request paid and links the payment', async () => {
  const w = await world(srv.base);
  const rq = await ask(w, 'bob', 'ada', 1200);
  const key = newKey();
  const paid = await w.ada.post(`/requests/${rq.request_id}/pay`, { visibility: 'private' }, key);
  assert.equal(paid.status, 201);
  assert.equal(paid.body.request_id, rq.request_id);
  assert.equal(paid.body.visibility, 'private');
  const replay = await w.ada.post(`/requests/${rq.request_id}/pay`, { visibility: 'private' }, key);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body, paid.body);
  assert.equal(await w.ada.balance(), 10_000 - 1200);
  assert.equal(await w.bob.balance(), 2_500 + 1200);
  const listed = (await w.bob.get('/requests')).body.requests[0];
  assert.equal(listed.status, 'paid');
  assert.equal(listed.payment_id, paid.body.payment_id);
});

test('paying while short is 409 and the request stays payable later', async () => {
  const w = await world(srv.base);
  const rq = await ask(w, 'ada', 'cy', 1000);
  const key = newKey();
  let res = await w.cy.post(`/requests/${rq.request_id}/pay`, {}, key);
  assert.deepEqual([res.status, res.body.error.code], [409, 'insufficient_funds']);
  assert.equal(await w.cy.balance(), 500);
  await w.ada.post('/payments', { to_handle: 'cy', amount: 500 }, newKey());
  res = await w.cy.post(`/requests/${rq.request_id}/pay`, {}, key);
  assert.equal(res.status, 201);
  assert.equal(await w.cy.balance(), 0);
});

test('only the payer may pay: the requester and a third party are both 403', async () => {
  const w = await world(srv.base);
  const rq = await ask(w, 'bob', 'ada');
  for (const who of ['bob', 'cy']) {
    const res = await w[who].post(`/requests/${rq.request_id}/pay`, {}, newKey());
    assert.deepEqual([res.status, res.body.error.code], [403, 'forbidden'], who);
  }
});

test('decline needs the payer and cancel the requester; others are 403', async () => {
  const w = await world(srv.base);
  const rq = await ask(w, 'bob', 'ada');
  for (const [who, action] of [['bob', 'decline'], ['cy', 'decline'], ['ada', 'cancel'], ['cy', 'cancel']]) {
    const res = await w[who].post(`/requests/${rq.request_id}/${action}`);
    assert.deepEqual([res.status, res.body.error.code], [403, 'forbidden'], `${who} ${action}`);
  }
});

test('unknown request is 404 on pay, decline and cancel', async () => {
  const w = await world(srv.base);
  for (const action of ['pay', 'decline', 'cancel']) {
    const res = await w.ada.post(`/requests/rq_nope/${action}`, {}, newKey());
    assert.deepEqual([res.status, res.body.error.code], [404, 'not_found'], action);
  }
});

test('terminal states: repeat is 200, other terminal moves are 409', async () => {
  const w = await world(srv.base);
  const declined = await ask(w);
  assert.equal((await w.ada.post(`/requests/${declined.request_id}/decline`)).body.status, 'declined');
  assert.equal((await w.ada.post(`/requests/${declined.request_id}/decline`)).status, 200);
  assert.equal((await w.bob.post(`/requests/${declined.request_id}/cancel`)).status, 409);
  let res = await w.ada.post(`/requests/${declined.request_id}/pay`, {}, newKey());
  assert.deepEqual([res.status, res.body.error.code], [409, 'request_not_pending']);

  const cancelled = await ask(w);
  assert.equal((await w.bob.post(`/requests/${cancelled.request_id}/cancel`)).body.status, 'cancelled');
  assert.equal((await w.bob.post(`/requests/${cancelled.request_id}/cancel`)).status, 200);
  assert.equal((await w.ada.post(`/requests/${cancelled.request_id}/decline`)).status, 409);

  const paid = await ask(w);
  await w.ada.post(`/requests/${paid.request_id}/pay`, {}, newKey());
  res = await w.ada.post(`/requests/${paid.request_id}/decline`);
  assert.deepEqual([res.status, res.body.error.code], [409, 'request_not_pending']);
  res = await w.bob.post(`/requests/${paid.request_id}/cancel`);
  assert.deepEqual([res.status, res.body.error.code], [409, 'request_not_pending']);
});

test('a replayed pay outranks the paid status; {} and explicit public differ', async () => {
  const w = await world(srv.base);
  const rq = await ask(w);
  const key = newKey();
  const first = await w.ada.post(`/requests/${rq.request_id}/pay`, {}, key);
  const again = await w.ada.post(`/requests/${rq.request_id}/pay`, {}, key);
  assert.deepEqual([again.status, again.body], [200, first.body]);
  const reuse = await w.ada.post(`/requests/${rq.request_id}/pay`, { visibility: 'public' }, key);
  assert.deepEqual([reuse.status, reuse.body.error.code], [409, 'idempotency_key_reuse']);
});

test('listing: scoped to the parties, filtered, newest first, paged', async () => {
  const w = await world(srv.base);
  const a = await ask(w, 'bob', 'ada', 101);
  const b = await ask(w, 'ada', 'bob', 102);
  const c = await ask(w, 'bob', 'ada', 103);
  assert.deepEqual((await w.cy.get('/requests')).body, { requests: [], has_more: false });
  const all = (await w.ada.get('/requests')).body.requests.map((r) => r.request_id);
  assert.deepEqual(all, [c.request_id, b.request_id, a.request_id]);
  const incoming = (await w.ada.get('/requests?direction=incoming')).body.requests.map((r) => r.request_id);
  assert.deepEqual(incoming, [c.request_id, a.request_id]);
  const outgoing = (await w.ada.get('/requests?direction=outgoing')).body.requests.map((r) => r.request_id);
  assert.deepEqual(outgoing, [b.request_id]);
  await w.ada.post(`/requests/${a.request_id}/decline`);
  const declined = (await w.ada.get('/requests?status=declined')).body.requests.map((r) => r.request_id);
  assert.deepEqual(declined, [a.request_id]);
  const page1 = (await w.ada.get('/requests?limit=2')).body;
  assert.equal(page1.requests.length, 2);
  assert.equal(page1.has_more, true);
  const page2 = (await w.ada.get('/requests?limit=2&offset=2')).body;
  assert.deepEqual([page2.requests.length, page2.has_more], [1, false]);
  const far = (await w.ada.get('/requests?offset=99999999999999999999')).body;
  assert.deepEqual(far, { requests: [], has_more: false });
});

test('bad list parameters are 422; unknown parameters are ignored', async () => {
  const w = await world(srv.base);
  for (const q of ['direction=both', 'status=open', 'limit=0', 'limit=201', 'limit=-5', 'offset=-1',
    'offset=abc', 'limit=1e1', 'limit=4.0', 'limit=+4', 'limit=']) {
    const res = await w.ada.get(`/requests?${q}`);
    assert.deepEqual([res.status, res.body.error.code], [422, 'validation_failed'], q);
  }
  assert.equal((await w.ada.get('/requests?colour=blue&limit=200')).status, 200);
});

test('seeded requests keep their status and can be paid when pending', async () => {
  const w = await world(srv.base, fixture({
    requests: [
      { id: 'rq_seed', requester_id: 'u_bob', payer_id: 'u_ada', amount: 1200, note: 'taxi', status: 'pending' },
      { id: 'rq_done', requester_id: 'u_bob', payer_id: 'u_ada', amount: 5, note: '', status: 'declined' },
    ],
  }));
  assert.equal((await w.ada.post('/requests/rq_seed/pay', {}, newKey())).status, 201);
  const res = await w.ada.post('/requests/rq_done/pay', {}, newKey());
  assert.deepEqual([res.status, res.body.error.code], [409, 'request_not_pending']);
});
