// Stage 2: holds, authorizations, captures, voids and expiry.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RFC3339 } from '../src/clock.js';
import { call, fixture, newKey, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));
const me = async (client) => (await client.get('/me')).body;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();
const anHourAgo = () => new Date(Date.now() - 3_600_000).toISOString();

async function authorize(w, from = 'ada', to = 'bob', amount = 2000, extra = {}) {
  const res = await w[from].post('/authorizations', { to_handle: to, amount, ...extra }, newKey());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('a hold reserves money without moving it; /me shows total, available and held', async () => {
  const w = await world(srv.base);
  const a = await authorize(w, 'ada', 'bob', 2000, { note: 'deposit', visibility: 'private' });
  assert.equal(a.status, 'open');
  assert.deepEqual([a.amount, a.captured_amount, a.remaining_amount, a.payment_id, a.payment_ids], [2000, 0, 2000, null, []]);
  assert.deepEqual([a.from_handle, a.to_handle, a.note, a.visibility, a.currency], ['ada', 'bob', 'deposit', 'private', 'EUR']);
  assert.match(a.expires_at, RFC3339);
  assert.equal(Date.parse(a.expires_at) - Date.parse(a.created_at), 600_000, 'default lifetime 600 s');
  const m = await me(w.ada);
  assert.deepEqual([m.balance, m.total, m.available, m.held], [10_000, 10_000, 8_000, 2_000]);
  assert.equal((await me(w.bob)).balance, 2_500, 'the receiver gets nothing yet');
  assert.deepEqual((await w.bob.get('/activity')).body.payments, [], 'an open hold is not a feed item');
});

test('insufficient_funds is judged against available on payments, request pay, settlements and holds', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  await authorize(w, 'cy', 'bob', 400); // cy: total 500, available 100
  expectError(await w.cy.post('/payments', { to_handle: 'bob', amount: 101 }, newKey()), 409, 'insufficient_funds');
  expectError(await w.cy.post('/authorizations', { to_handle: 'bob', amount: 101 }, newKey()), 409, 'insufficient_funds');
  const rq = (await w.bob.post('/requests', { payer_handle: 'cy', amount: 101, note: '' }, newKey())).body;
  expectError(await w.cy.post(`/requests/${rq.request_id}/pay`, {}, newKey()), 409, 'insufficient_funds');
  expectError(await w.ada.post('/settlements', { transfers: [{ from_handle: 'cy', to_handle: 'bob', amount: 101 }] }, newKey()),
    409, 'insufficient_funds');
  assert.equal((await w.cy.post('/payments', { to_handle: 'bob', amount: 100 }, newKey())).status, 201);
  assert.deepEqual([(await me(w.cy)).total, (await me(w.cy)).available], [400, 0]);
});

test('authorization validation', async () => {
  const w = await world(srv.base);
  const post = (body, key = newKey()) => w.ada.post('/authorizations', { to_handle: 'bob', amount: 10, ...body }, key);
  for (const amount of [0, -1, 1.5, '10', true, 1_000_000_001]) expectError(await post({ amount }), 422, 'validation_failed', String(amount));
  expectError(await post({ to_handle: 'ada' }), 422, 'self_payment');
  expectError(await post({ to_handle: 'nobody' }), 404, 'not_found');
  expectError(await post({ note: 'x'.repeat(201) }), 422, 'validation_failed');
  expectError(await post({ visibility: 'secret' }), 422, 'validation_failed');
  expectError(await w.ada.post('/authorizations', { to_handle: 'bob', amount: 10 }), 400, 'missing_idempotency_key');
  expectError(await w.ada.post('/authorizations/a_x/capture', {}), 400, 'missing_idempotency_key');
  const key = newKey();
  const first = await post({}, key);
  assert.deepEqual([(await post({}, key)).status, (await post({}, key)).body], [200, first.body]);
  expectError(await post({ amount: 11 }, key), 409, 'idempotency_key_reuse');
  assert.equal((await me(w.ada)).held, 10, 'the replay held nothing more');
});

test('a default capture is final: it pays, releases the remainder and closes the hold', async () => {
  const w = await world(srv.base);
  const a = await authorize(w, 'ada', 'bob', 2000, { note: 'deposit', visibility: 'private' });
  const res = await w.bob.post(`/authorizations/${a.authorization_id}/capture`, { amount: 1500 }, newKey());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const p = res.body;
  assert.deepEqual([p.authorization_id, p.request_id, p.settlement_id, p.amount, p.note, p.visibility],
    [a.authorization_id, null, null, 1500, 'deposit', 'private']);
  assert.deepEqual([p.from_handle, p.to_handle], ['ada', 'bob']);
  const m = await me(w.ada);
  assert.deepEqual([m.total, m.available, m.held], [8_500, 8_500, 0]);
  assert.equal((await me(w.bob)).total, 4_000);
  const listed = (await w.ada.get('/authorizations')).body.authorizations[0];
  assert.deepEqual([listed.status, listed.captured_amount, listed.remaining_amount, listed.payment_id, listed.payment_ids],
    ['captured', 1500, 0, p.payment_id, [p.payment_id]]);
  assert.equal((await w.bob.get('/activity')).body.payments[0].payment_id, p.payment_id, 'the capture is a feed item');
  assert.deepEqual((await w.cy.get('/activity')).body.payments, [], 'with the ordinary visibility rule');
  expectError(await w.bob.post(`/authorizations/${a.authorization_id}/capture`, {}, newKey()), 409, 'authorization_not_open');
  const plain = (await w.ada.post('/payments', { to_handle: 'bob', amount: 1 }, newKey())).body;
  assert.equal(plain.authorization_id, null);
});

test('extended mode: non-final captures keep the remainder held; taking all of it closes', async () => {
  const w = await world(srv.base);
  const a = await authorize(w, 'ada', 'bob', 2000);
  const cap = (body) => w.bob.post(`/authorizations/${a.authorization_id}/capture`, body, newKey());
  const p1 = (await cap({ amount: 700, final: false })).body;
  let m = await me(w.ada);
  assert.deepEqual([m.total, m.held, m.available], [9_300, 1_300, 8_000]);
  expectError(await cap({ amount: 1301, final: false }), 422, 'capture_exceeds_authorization');
  const p2 = (await cap({ final: false })).body; // defaults to the remainder: closes
  assert.equal(p2.amount, 1300);
  const listed = (await w.ada.get('/authorizations')).body.authorizations[0];
  assert.deepEqual([listed.status, listed.captured_amount, listed.remaining_amount, listed.payment_id, listed.payment_ids],
    ['captured', 2000, 0, p2.payment_id, [p1.payment_id, p2.payment_id]]);
  m = await me(w.ada);
  assert.deepEqual([m.total, m.held, m.available], [8_000, 0, 8_000]);

  const b = await authorize(w, 'ada', 'bob', 1000);
  await w.bob.post(`/authorizations/${b.authorization_id}/capture`, { amount: 300, final: false }, newKey());
  const last = await w.bob.post(`/authorizations/${b.authorization_id}/capture`, { amount: 200 }, newKey());
  assert.equal(last.status, 201);
  m = await me(w.ada);
  assert.deepEqual([m.total, m.held], [7_500, 0], 'a final capture releases the 500 left');
});

test('capture rules: who, what, and the body is part of the key', async () => {
  const w = await world(srv.base);
  const a = await authorize(w, 'ada', 'bob', 2000);
  const path = `/authorizations/${a.authorization_id}/capture`;
  expectError(await w.ada.post(path, {}, newKey()), 403, 'forbidden');
  expectError(await w.cy.post(path, {}, newKey()), 403, 'forbidden');
  expectError(await w.bob.post('/authorizations/a_nope/capture', {}, newKey()), 404, 'not_found');
  for (const amount of [0, -1, 1.5, '5']) expectError(await w.bob.post(path, { amount }, newKey()), 422, 'validation_failed', String(amount));
  expectError(await w.bob.post(path, { amount: 2001 }, newKey()), 422, 'capture_exceeds_authorization');
  expectError(await w.bob.post(path, { final: 'yes' }, newKey()), 400, 'malformed_request');
  const key = newKey();
  const first = await w.bob.post(path, {}, key);
  assert.equal(first.status, 201);
  const replay = await w.bob.post(path, {}, key);
  assert.deepEqual([replay.status, replay.body], [200, first.body], 'a replay of a closed capture is 200, not 409');
  expectError(await w.bob.post(path, { amount: 2000 }, key), 409, 'idempotency_key_reuse');
  assert.equal((await me(w.bob)).total, 4_500, 'money moved once');
});

test('void: payer only, repeat is 200, closed ones are 409, captures survive a void', async () => {
  const w = await world(srv.base);
  const a = await authorize(w, 'ada', 'bob', 2000);
  expectError(await w.bob.post(`/authorizations/${a.authorization_id}/void`), 403, 'forbidden');
  expectError(await w.cy.post(`/authorizations/${a.authorization_id}/void`), 403, 'forbidden');
  expectError(await w.ada.post('/authorizations/a_nope/void'), 404, 'not_found');
  await w.bob.post(`/authorizations/${a.authorization_id}/capture`, { amount: 500, final: false }, newKey());
  const voided = await w.ada.post(`/authorizations/${a.authorization_id}/void`);
  assert.deepEqual([voided.status, voided.body.status, voided.body.captured_amount, voided.body.remaining_amount, voided.body.payment_ids.length],
    [200, 'voided', 500, 0, 1]);
  assert.deepEqual([(await me(w.ada)).total, (await me(w.ada)).held], [9_500, 0]);
  assert.equal((await w.ada.post(`/authorizations/${a.authorization_id}/void`)).status, 200);
  expectError(await w.bob.post(`/authorizations/${a.authorization_id}/capture`, {}, newKey()), 409, 'authorization_not_open');
  const b = await authorize(w, 'ada', 'bob', 100);
  await w.bob.post(`/authorizations/${b.authorization_id}/capture`, {}, newKey());
  expectError(await w.ada.post(`/authorizations/${b.authorization_id}/void`), 409, 'authorization_not_open');
});

test('expiry happens on its own: reads and writes see it with no request at the deadline', async () => {
  const w = await world(srv.base, fixture({ authorization_ttl_seconds: 1 }));
  const a = await authorize(w, 'ada', 'bob', 2000);
  assert.equal(Date.parse(a.expires_at) - Date.parse(a.created_at), 1_000);
  assert.equal((await me(w.ada)).held, 2000);
  await sleep(1_100);
  const m = await me(w.ada);
  assert.deepEqual([m.available, m.held], [10_000, 0]);
  const listed = (await w.ada.get('/authorizations?status=expired')).body.authorizations;
  assert.deepEqual(listed.map((x) => [x.authorization_id, x.status, x.remaining_amount]), [[a.authorization_id, 'expired', 0]]);
  assert.deepEqual((await w.ada.get('/authorizations?status=open')).body.authorizations, []);
  expectError(await w.bob.post(`/authorizations/${a.authorization_id}/capture`, {}, newKey()), 409, 'authorization_expired');
  expectError(await w.ada.post(`/authorizations/${a.authorization_id}/void`), 409, 'authorization_not_open');
});

test('listing: only the two parties, filtered by direction and status, newest first, paged', async () => {
  const w = await world(srv.base);
  const a1 = await authorize(w, 'ada', 'bob', 1);
  const a2 = await authorize(w, 'bob', 'ada', 2);
  const a3 = await authorize(w, 'ada', 'cy', 3);
  const ids = async (who, q = '') => (await w[who].get(`/authorizations${q}`)).body.authorizations.map((x) => x.authorization_id);
  assert.deepEqual(await ids('ada'), [a3.authorization_id, a2.authorization_id, a1.authorization_id]);
  assert.deepEqual(await ids('ada', '?direction=outgoing'), [a3.authorization_id, a1.authorization_id]);
  assert.deepEqual(await ids('ada', '?direction=incoming'), [a2.authorization_id]);
  assert.deepEqual(await ids('cy'), [a3.authorization_id]);
  await w.ada.post(`/authorizations/${a1.authorization_id}/void`);
  assert.deepEqual(await ids('ada', '?status=voided'), [a1.authorization_id]);
  const page = (await w.ada.get('/authorizations?limit=2')).body;
  assert.deepEqual([page.authorizations.length, page.has_more], [2, true]);
  for (const q of ['direction=both', 'status=pending', 'limit=0', 'offset=-1', 'limit=1e1']) {
    expectError(await w.ada.get(`/authorizations?${q}`), 422, 'validation_failed', q);
  }
});

test('seeded authorizations: open ones hold from reset, expired ones hold nothing', async () => {
  const seed = (over) => ({ id: 'a_1', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 2000, note: 'deposit',
    visibility: 'public', status: 'open', expires_at: inAnHour(), ...over });
  const w = await world(srv.base, fixture({ authorizations: [seed(), seed({ id: 'a_2', expires_at: anHourAgo(), amount: 5000 }),
    seed({ id: 'a_3', status: 'captured', amount: 300 })] }));
  const m = await me(w.ada);
  assert.deepEqual([m.total, m.available, m.held], [10_000, 8_000, 2_000]);
  const listed = (await w.ada.get('/authorizations')).body.authorizations;
  assert.deepEqual(listed.map((x) => [x.authorization_id, x.status]), [['a_3', 'captured'], ['a_2', 'expired'], ['a_1', 'open']]);
  const cap = await w.bob.post('/authorizations/a_1/capture', { amount: 500 }, newKey());
  assert.equal(cap.status, 201);
  assert.deepEqual([(await me(w.ada)).total, (await me(w.ada)).held], [9_500, 0]);
});

test('fixture rules for stage 2 are 422 and change nothing', async () => {
  const w = await world(srv.base);
  const seed = (over) => ({ id: 'a_1', from_user_id: 'u_cy', to_user_id: 'u_bob', amount: 400, note: '',
    visibility: 'public', status: 'open', expires_at: inAnHour(), ...over });
  const reset = (fx) => call(srv.base, 'POST', '/_test/reset', { json: fx });
  const bad = {
    'holds over the balance': fixture({ authorizations: [seed(), seed({ id: 'a_2', amount: 101 })] }),
    'ttl 0': fixture({ authorization_ttl_seconds: 0 }),
    'ttl negative': fixture({ authorization_ttl_seconds: -5 }),
    'ttl fractional': fixture({ authorization_ttl_seconds: 1.5 }),
    'ttl string': fixture({ authorization_ttl_seconds: '600' }),
    'expires_at without offset': fixture({ authorizations: [seed({ expires_at: '2026-09-24T13:20:00' })] }),
    'expires_at not a date': fixture({ authorizations: [seed({ expires_at: '2026-02-30T13:20:00+00:00' })] }),
    'unknown status': fixture({ authorizations: [seed({ status: 'pending' })] }),
    'missing status': fixture({ authorizations: [(({ status, ...rest }) => rest)(seed())] }),
    'missing expires_at': fixture({ authorizations: [(({ expires_at, ...rest }) => rest)(seed())] }),
    'self authorization': fixture({ authorizations: [seed({ to_user_id: 'u_cy' })] }),
    'zero amount': fixture({ authorizations: [seed({ amount: 0 })] }),
  };
  for (const [label, fx] of Object.entries(bad)) expectError(await reset(fx), 422, 'validation_failed', label);
  assert.equal((await me(w.ada)).total, 10_000);
  // An expired open hold over the balance holds nothing, so it is accepted.
  assert.equal((await reset(fixture({ authorizations: [seed({ amount: 900, expires_at: anHourAgo() })] }))).status, 204);
});

test('export and import keep holds, partial captures and capture retries', async () => {
  const w = await world(srv.base);
  const a = await authorize(w, 'ada', 'bob', 2000);
  const key = newKey();
  const p1 = (await w.bob.post(`/authorizations/${a.authorization_id}/capture`, { amount: 600, final: false }, key)).body;
  const snapshot = (await call(srv.base, 'GET', '/_test/export')).body;
  await call(srv.base, 'POST', '/_test/reset', { json: fixture() });
  assert.equal((await call(srv.base, 'POST', '/_test/import', { json: snapshot })).status, 204);
  assert.deepEqual([(await me(w.ada)).total, (await me(w.ada)).held], [9_400, 1_400]);
  const replay = await w.bob.post(`/authorizations/${a.authorization_id}/capture`, { amount: 600, final: false }, key);
  assert.deepEqual([replay.status, replay.body], [200, p1]);
  const s = snapshot.state;
  const edited = (over) => ({ ...snapshot, state: { ...s, ...over } });
  const auth = s.authorizations[0];
  const bad = {
    'capture total does not match its payments': edited({ authorizations: [{ ...auth, captured_amount: 700 }] }),
    'payment names no authorization': edited({ payments: s.payments.map((p) => ({ ...p, authorization_id: 'a_ghost' })) }),
    'capture payment unlinked': edited({ authorizations: [{ ...auth, payment_ids: [] }] }),
    'hold above balance': edited({ authorizations: [{ ...auth, amount: 20_000 }] }),
    'expires_at out of range': edited({ authorizations: [{ ...auth, expires_at_ms: 1e20 }] }),
    'missing ttl in a stage-2 export': edited({ authorization_ttl_seconds: undefined }),
    'payment without authorization_id in a stage-2 export': edited({ payments: s.payments.map(({ authorization_id, ...p }) => p) }),
  };
  for (const [label, envelope] of Object.entries(bad)) {
    expectError(await call(srv.base, 'POST', '/_test/import', { json: envelope }), 422, 'validation_failed', label);
  }
});

test('a stage-1 export imports: tokens, balances, pending requests and lost-response retries carry over', async () => {
  const w = await world(srv.base);
  const rq = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 100, note: '' }, newKey())).body;
  const key = newKey();
  const paid = (await w.ada.post('/payments', { to_handle: 'bob', amount: 300 }, key)).body;
  const stage2 = (await call(srv.base, 'GET', '/_test/export')).body;
  const { authorization_ttl_seconds, authorizations, ...rest } = stage2.state;
  const stage1 = { ...stage2, state: { ...rest, payments: rest.payments.map(({ authorization_id, ...p }) => p) } };
  await call(srv.base, 'POST', '/_test/reset', { json: fixture() });
  assert.equal((await call(srv.base, 'POST', '/_test/import', { json: stage1 })).status, 204);
  const m = await me(w.ada);
  assert.deepEqual([m.total, m.available, m.held], [9_700, 9_700, 0], 'the same token still works');
  const replay = await w.ada.post('/payments', { to_handle: 'bob', amount: 300 }, key);
  assert.deepEqual([replay.status, replay.body.payment_id], [200, paid.payment_id]);
  assert.equal((await w.ada.post(`/requests/${rq.request_id}/pay`, {}, newKey())).status, 201);
  assert.equal((await me(w.ada)).total, 9_600);
});

test('concurrent holds, captures and voids behave as if run one at a time', async () => {
  const w = await world(srv.base);
  const holds = await Promise.all(Array.from({ length: 20 }, () =>
    w.cy.post('/authorizations', { to_handle: 'bob', amount: 100 }, newKey())));
  assert.equal(holds.filter((r) => r.status === 201).length, 5, 'cy can hold 500 in all');
  assert.ok(holds.filter((r) => r.status !== 201).every((r) => r.body.error.code === 'insufficient_funds'));
  const a = await authorize(w, 'ada', 'bob', 1000);
  const key = newKey();
  const path = `/authorizations/${a.authorization_id}/capture`;
  const out = await Promise.all([
    ...Array.from({ length: 10 }, () => w.bob.post(path, {}, key)),
    w.ada.post(`/authorizations/${a.authorization_id}/void`),
  ]);
  const captured = out.slice(0, 10);
  const voided = out[10];
  if (voided.status === 200) {
    assert.ok(captured.every((r) => r.status === 409), 'void won: no capture');
    assert.equal((await me(w.bob)).total, 2_500);
  } else {
    assert.equal(captured.filter((r) => r.status === 201).length, 1);
    assert.equal(captured.filter((r) => r.status === 200).length, 9);
    assert.equal((await me(w.bob)).total, 3_500);
  }
  const totals = await Promise.all(['ada', 'bob', 'cy'].map(async (h) => (await me(w[h])).total));
  assert.equal(totals.reduce((x, y) => x + y), 13_000);
});

test('R10 R11 S2-102 S1-154 (ruling 2abb370): fixed bounds on the lifetime and the clock; expires_at is never clamped', async () => {
  const MAX_TTL = 3_155_760_000; // 100 years of 365.25 days
  const MAX_CLOCK = Date.UTC(9999, 11, 31, 23, 59, 59, 999) - MAX_TTL * 1000;
  const reset = (fx) => call(srv.base, 'POST', '/_test/reset', { json: fx });
  const importState = (json) => call(srv.base, 'POST', '/_test/import', { json });
  expectError(await reset(fixture({ authorization_ttl_seconds: MAX_TTL + 1 })), 422, 'validation_failed', 'one past the bound');

  const w = await world(srv.base, fixture({ authorization_ttl_seconds: MAX_TTL }));
  const a = await authorize(w, 'ada', 'bob', 10);
  assert.equal(Date.parse(a.expires_at) - Date.parse(a.created_at), MAX_TTL * 1000, 'expires_at is created_at plus the ttl');
  assert.match(a.expires_at, RFC3339);
  const snapshot = (await call(srv.base, 'GET', '/_test/export')).body;
  await sleep(1_100);
  assert.equal((await importState(snapshot)).status, 204, 'an export taken at the bound still imports later');

  const s = snapshot.state;
  expectError(await importState({ ...snapshot, state: { ...s, last_timestamp_ms: MAX_CLOCK + 1 } }), 422, 'validation_failed', 'clock one past its bound');
  expectError(await importState({ ...snapshot, state: { ...s, authorization_ttl_seconds: MAX_TTL + 1 } }), 422, 'validation_failed');
  assert.equal((await importState({ ...snapshot, state: { ...s, last_timestamp_ms: MAX_CLOCK } })).status, 204, 'clock at its bound');
  const latest = await authorize(w, 'ada', 'bob', 10);
  assert.equal(latest.created_at, new Date(MAX_CLOCK).toISOString().replace('Z', '+00:00'), 'the clock does not pass its bound');
  assert.equal(latest.expires_at, '9999-12-31T23:59:59.999+00:00', 'the latest creation plus the largest ttl is the last RFC 3339 instant');
  const atTheEnd = (await call(srv.base, 'GET', '/_test/export')).body;
  assert.equal((await importState(atTheEnd)).status, 204);
});
