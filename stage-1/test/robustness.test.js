import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, fixture, newKey, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));
const nested = (depth) => '['.repeat(depth) + ']'.repeat(depth);

async function idempotentPaths(w) {
  const rq = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 1 }, newKey())).body.request_id;
  return [
    ['/payments', { to_handle: 'bob', amount: 10 }],
    ['/requests', { payer_handle: 'bob', amount: 10 }],
    [`/requests/${rq}/pay`, {}],
    ['/splits', { amount: 10, participant_handles: ['ada', 'bob'] }],
    ['/settlements', { transfers: [{ from_handle: 'bob', to_handle: 'cy', amount: 1 }] }],
  ];
}

test('S1-059 S1-189: an empty body is 400 before a claimed key is resolved, on all five paths', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  for (const [path, body] of await idempotentPaths(w)) {
    const key = newKey();
    assert.equal((await w.ada.post(path, body, key)).status, 201, path);
    for (const raw of ['', '{oops']) {
      expectError(await call(srv.base, 'POST', path, { token: w.ada.token, key, raw }),
        400, 'malformed_request', `${path} ${JSON.stringify(raw)}`);
    }
    expectError(await call(srv.base, 'POST', path, { json: body, key }), 401, 'unauthenticated', path);
    expectError(await call(srv.base, 'POST', path, { json: body, key, token: 'unknown' }), 401, 'unauthenticated', path);
  }
});

test('S1-059 S1-157: an empty body to reset, import, signup and login is 400', async () => {
  for (const path of ['/_test/reset', '/_test/import', '/auth/signup', '/auth/login']) {
    expectError(await call(srv.base, 'POST', path, { raw: '' }), 400, 'malformed_request', path);
  }
});

test('R3: decline and cancel accept no body, an empty one or a JSON object; an unparseable one is 400', async () => {
  const w = await world(srv.base);
  for (const action of ['decline', 'cancel']) {
    const actor = action === 'decline' ? w.ada : w.bob;
    for (const [raw, status] of [[undefined, 200], ['', 200], ['{"x": 1}', 200], ['{oops', 400], ['[1]', 400]]) {
      const rq = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 1 }, newKey())).body.request_id;
      const res = await call(srv.base, 'POST', `/requests/${rq}/${action}`, { token: actor.token, raw });
      assert.equal(res.status, status, `${action} ${JSON.stringify(raw)}`);
      if (status === 400) {
        assert.equal(res.body.error.code, 'malformed_request');
        assert.equal((await w.ada.get('/requests')).body.requests[0].status, 'pending', 'nothing changed');
      }
    }
  }
});

test('S1-073: a 100000-deep array in a body field is never a 5xx', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  for (const [path] of await idempotentPaths(w)) {
    const raw = `{"deep": ${nested(100_000)}, "to_handle": ${nested(100_000)}, "amount": 10}`;
    const res = await call(srv.base, 'POST', path, { token: w.ada.token, key: newKey(), raw });
    assert.ok(res.status < 500, `${path}: ${res.status}`);
  }
  const ignored = await call(srv.base, 'POST', '/payments', {
    token: w.ada.token, key: newKey(), raw: `{"deep": ${nested(100_000)}, "to_handle": "bob", "amount": 10}`,
  });
  assert.equal(ignored.status, 201, 'an unknown deep field is ignored');
});

test('S1-070: the Idempotency-Key length counts characters, not bytes', async () => {
  const w = await world(srv.base);
  const send = (key) => call(srv.base, 'POST', '/payments', {
    token: w.ada.token, json: { to_handle: 'bob', amount: 1 }, headers: { 'idempotency-key': key },
  });
  const accented = Buffer.from('é'.repeat(200), 'utf8').toString('latin1'); // sent as UTF-8 bytes
  assert.equal((await send(accented)).status, 201);
  assert.equal((await send(accented)).status, 200, 'the same key replays');
  const tooLong = Buffer.from('é'.repeat(256), 'utf8').toString('latin1');
  expectError(await send(tooLong), 422, 'validation_failed');
});

test('S1-158: an import with a balance or total above 2^53 is 422 and changes nothing', async () => {
  const w = await world(srv.base);
  const good = (await call(srv.base, 'GET', '/_test/export')).body;
  const edit = (users) => ({ ...good, state: { ...good.state, users } });
  const [ada, bob] = good.state.users;
  for (const users of [
    [{ ...ada, balance: 2 ** 55 + 1 }, ...good.state.users.slice(1)],
    [{ ...ada, balance: 2 ** 53 }, { ...bob, balance: 1 }],
  ]) {
    expectError(await call(srv.base, 'POST', '/_test/import', { json: edit(users) }), 422, 'validation_failed');
  }
  assert.equal(await w.ada.balance(), 10_000);
});

test('S1-058: a 64 KB header is served normally', async () => {
  const w = await world(srv.base);
  const res = await call(srv.base, 'GET', '/me', { token: w.ada.token, headers: { 'x-padding': 'a'.repeat(65_536) } });
  assert.equal(res.status, 200);
  assert.equal(res.body.handle, 'ada');
});

test('S1-058: a header beyond the server limit gets a status and the error body', async () => {
  const res = await fetch(`${srv.base}/health`, { headers: { 'x-padding': 'a'.repeat(2 * 1024 * 1024) } });
  assert.ok(res.status >= 400 && res.status < 500, String(res.status));
  assert.equal(typeof (await res.json()).error.code, 'string');
});

test('S1-190: generated ids never collide with seeded ids', async () => {
  const w = await world(srv.base, fixture({
    payments: [{ id: 'p_seed', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 1, note: '' }],
    requests: [{ id: 'rq_seed', requester_id: 'u_bob', payer_id: 'u_ada', amount: 1, note: '', status: 'pending' }],
  }));
  const ids = new Set(['p_seed', 'rq_seed']);
  for (let i = 0; i < 20; i += 1) {
    ids.add((await w.ada.post('/payments', { to_handle: 'bob', amount: 1 }, newKey())).body.payment_id);
    ids.add((await w.bob.post('/requests', { payer_handle: 'ada', amount: 1 }, newKey())).body.request_id);
  }
  assert.equal(ids.size, 42);
});
