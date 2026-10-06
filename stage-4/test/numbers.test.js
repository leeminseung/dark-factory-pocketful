// Exact JSON numbers (§4): a value the parser would round is not taken as the integer it rounds to.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalJson, parseJson } from '../src/json.js';
import { call, fixture, newKey, user, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));

test('R13 S1-099: amounts that only round to an integer are 422 on every amount field', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  const raw = (path, body) => call(srv.base, 'POST', path, { token: w.ada.token, key: newKey(), raw: body });
  for (const n of ['1.0000000000000001', '1000000000.0000000001', '100.00000000000000001e0', '9007199254740993']) {
    expectError(await raw('/payments', `{"to_handle":"bob","amount":${n}}`), 422, 'validation_failed', `payments ${n}`);
    expectError(await raw('/requests', `{"payer_handle":"bob","amount":${n}}`), 422, 'validation_failed', `requests ${n}`);
    expectError(await raw('/splits', `{"participant_handles":["bob"],"amount":${n}}`), 422, 'validation_failed', `splits ${n}`);
    expectError(await raw('/settlements', `{"transfers":[{"from_handle":"bob","to_handle":"cy","amount":${n}}]}`),
      422, 'validation_failed', `settlements ${n}`);
  }
  assert.equal(await w.ada.balance(), 10_000);
  for (const n of ['1000', '1000.0', '1e3', '1.0E3', '10000e-1', '1000.000']) {
    const res = await raw('/payments', `{"to_handle":"bob","amount":${n}}`);
    assert.deepEqual([res.status, res.body.amount], [201, 1000], n);
  }
});

test('R14: a fixture balance above 2^53 is 422, and 2^53 itself is accepted exactly', async () => {
  const w = await world(srv.base);
  const body = (balance) => JSON.stringify(fixture({ users: [user('ada', 0), user('bob', 0)] }))
    .replace('"balance":0', `"balance":${balance}`);
  expectError(await call(srv.base, 'POST', '/_test/reset', { raw: body('9007199254740993') }), 422, 'validation_failed');
  assert.equal(await w.ada.balance(), 10_000, 'nothing changed');
  assert.equal((await call(srv.base, 'POST', '/_test/reset', { raw: body('9007199254740992') })).status, 204);
  const login = await call(srv.base, 'POST', '/auth/login', { json: { email: 'ada@example.com', password: 'correct horse' } });
  assert.equal((await call(srv.base, 'GET', '/me', { token: login.body.token })).body.balance, 2 ** 53);
});

test('parseJson keeps exact numbers, marks rounded ones, and canonical text keeps them apart', () => {
  assert.deepEqual(parseJson('{"a":1e3,"b":-0,"c":1.5}'), { a: 1000, b: -0, c: 1.5 });
  const inexact = parseJson('{"a":1.0000000000000001,"s":"1.0000000000000001"}');
  assert.equal(typeof inexact.a, 'object');
  assert.equal(inexact.s, '1.0000000000000001');
  assert.notEqual(canonicalJson(inexact), canonicalJson({ a: 1, s: '1.0000000000000001' }));
});
