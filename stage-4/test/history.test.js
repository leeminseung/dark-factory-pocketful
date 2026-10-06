// Stage 3: GET /me as of an instant, GET /statement and its snapshots.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, fixture, newKey, user, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));
const q = (params) => `?${new URLSearchParams(params)}`;
const seeded = (id, from, to, amount, created_at) => ({ id, from_user_id: from, to_user_id: to, amount, note: id, created_at });

// ada opens at 10000 + 500 - 200 = 10300 and holds 10000 after the two seeded payments.
const history = () => fixture({ payments: [
  seeded('p_a', 'u_ada', 'u_bob', 500, '2025-01-01T10:00:00+00:00'),
  seeded('p_b', 'u_bob', 'u_ada', 200, '2025-02-01T10:00:00+00:00'),
  seeded('p_c', 'u_bob', 'u_cy', 50, '2025-01-15T10:00:00+00:00'),
] });

test('S3 /me: no temporal parameters keeps the stage-2 shape', async () => {
  const w = await world(srv.base);
  const body = (await w.ada.get('/me')).body;
  assert.ok(!('as_of' in body) && !('known_at' in body));
  assert.equal(body.balance, 10_000);
});

test('S3 /me as_of: the balance as it stood, inclusive at the instant, echoed exactly', async () => {
  const w = await world(srv.base, history());
  const at = async (as_of) => (await w.ada.get(`/me${q({ as_of })}`)).body;
  assert.equal((await at('2024-12-31T00:00:00+00:00')).balance, 10_300, 'before anything moved: the opening balance');
  assert.equal((await at('2025-01-01T10:00:00+00:00')).balance, 9_800, 'a payment at exactly as_of has happened');
  assert.equal((await at('2025-01-01T09:59:59.999+00:00')).balance, 10_300);
  assert.equal((await at('2025-01-01T12:00:00+02:00')).balance, 9_800, 'offsets are honoured');
  assert.equal((await at('2025-02-01T10:00:00.0001+00:00')).balance, 10_000);
  const future = '2099-01-01T00:00:00.5+00:00';
  const body = await at(future);
  assert.deepEqual([body.balance, body.total, body.available, body.held, body.as_of], [10_000, 10_000, 10_000, 0, future]);
  for (const bad of ['2025-01-01T10:00:00', '2025-01-01', '', 'yesterday', '2025-01-01T10:00:00 00:00']) {
    expectError(await w.ada.get(`/me${q({ as_of: bad })}`), 422, 'validation_failed', bad);
  }
});

test('S3 /me known_at: a payment recorded after known_at contributes nothing', async () => {
  const w = await world(srv.base);
  const before = new Date(Date.now() - 1).toISOString();
  await w.ada.post('/payments', { to_handle: 'bob', amount: 100 }, newKey());
  const body = (await w.ada.get(`/me${q({ known_at: before })}`)).body;
  assert.deepEqual([body.balance, body.known_at], [10_000, before]);
  assert.ok(!('as_of' in body));
  assert.equal((await w.ada.get('/me')).body.balance, 9_900);
  expectError(await w.ada.get(`/me${q({ known_at: '' })}`), 422, 'validation_failed');
});

test('S3 statement: only own payments, oldest first, a half-open window, and arithmetic that closes', async () => {
  const w = await world(srv.base, history());
  const all = (await w.bob.get('/statement')).body;
  // bob opens at 2500 - 500 + 200 + 50 = 2250.
  assert.deepEqual(all.entries.map((e) => [e.payment.payment_id, e.delta, e.balance_after]),
    [['p_a', 500, 2_750], ['p_c', -50, 2_700], ['p_b', -200, 2_500]]);
  assert.equal(all.opening_balance, 2_250);
  assert.equal(all.closing_balance, 2_500);
  assert.ok(typeof all.snapshot === 'string' && all.snapshot.length > 0);
  const ada = (await w.ada.get('/statement')).body;
  assert.deepEqual(ada.entries.map((e) => e.payment.payment_id), ['p_a', 'p_b'], 'a public payment between others is not on it');
  const window = (await w.bob.get(`/statement${q({ from: '2025-01-15T10:00:00+00:00', to: '2025-02-01T10:00:00+00:00' })}`)).body;
  assert.deepEqual(window.entries.map((e) => e.payment.payment_id), ['p_c'], 'from is included, to is not');
  assert.deepEqual([window.opening_balance, window.closing_balance], [2_750, 2_700]);
  const e = window.entries[0];
  assert.deepEqual([e.revision, e.effective_at, e.recorded_at], [1, '2025-01-15T10:00:00.000+00:00', '2025-01-15T10:00:00.000+00:00']);
  expectError(await w.bob.get(`/statement${q({ from: '2025-02-01T00:00:00Z', to: '2025-01-01T00:00:00Z' })}`), 422, 'validation_failed');
  for (const [name, value] of [['from', '2025-01-01'], ['to', ''], ['known_at', 'now']]) {
    expectError(await w.bob.get(`/statement${q({ [name]: value })}`), 422, 'validation_failed', name);
  }
});

test('S3 statement: ties order by payment id; pagination never changes the balances', async () => {
  const at = '2025-05-05T05:05:05+00:00';
  const fx = fixture({ users: [user('ada', 1_000), user('bob', 30)], payments: ['p_3', 'p_1', 'p_2'].map((id) => seeded(id, 'u_ada', 'u_bob', 10, at)) });
  const w = await world(srv.base, fx);
  const full = (await w.ada.get('/statement')).body;
  assert.deepEqual(full.entries.map((e) => e.payment.payment_id), ['p_1', 'p_2', 'p_3']);
  const second = (await w.ada.get(`/statement${q({ limit: 1, offset: 1 })}`)).body;
  assert.deepEqual([second.entries.map((e) => e.balance_after), second.opening_balance, second.closing_balance, second.has_more],
    [[1_010], 1_030, 1_000, true]);
  const last = (await w.ada.get(`/statement${q({ limit: 2, offset: 2 })}`)).body;
  assert.deepEqual([last.entries.length, last.has_more], [1, false]);
  const beyond = (await w.ada.get(`/statement${q({ offset: 99 })}`)).body;
  assert.deepEqual([beyond.entries, beyond.has_more], [[], false]);
});

test('S3 snapshots: a token pages its frozen result; only limit and offset may come with it', async () => {
  const w = await world(srv.base, history());
  const first = (await w.ada.get(`/statement${q({ limit: 1 })}`)).body;
  await w.ada.post('/payments', { to_handle: 'bob', amount: 7 }, newKey());
  const page2 = (await w.ada.get(`/statement${q({ snapshot: first.snapshot, limit: 1, offset: 1 })}`)).body;
  assert.deepEqual([page2.entries.map((e) => e.payment.payment_id), page2.has_more, page2.closing_balance, page2.snapshot],
    [['p_b'], false, first.closing_balance, first.snapshot], 'the payment made since is not in the frozen statement');
  for (const name of ['from', 'to', 'known_at']) {
    expectError(await w.ada.get(`/statement${q({ snapshot: first.snapshot, [name]: '2025-01-01T00:00:00Z' })}`), 422, 'validation_failed', name);
  }
  expectError(await w.ada.get(`/statement${q({ snapshot: 'snap_nope' })}`), 404, 'not_found');
  expectError(await w.bob.get(`/statement${q({ snapshot: first.snapshot })}`), 404, 'not_found', "another user's token");
  await world(srv.base, history());
  const login = await call(srv.base, 'POST', '/auth/login', { json: { email: 'ada@example.com', password: 'correct horse' } });
  expectError(await call(srv.base, 'GET', `/statement${q({ snapshot: first.snapshot })}`, { token: login.body.token }), 404, 'not_found', 'a token from before reset');
});

test('S3 fixture: seeded history must be nonnegative at every point, not only at the opening', async () => {
  // bob opens at 2500 - 3000 + 3000 = 2500 but, in time order, sends 3000 before he receives it.
  const fx = fixture({ payments: [
    seeded('p_1', 'u_bob', 'u_ada', 3_000, '2025-01-01T00:00:00Z'),
    seeded('p_2', 'u_ada', 'u_bob', 3_000, '2025-02-01T00:00:00Z'),
  ] });
  expectError(await call(srv.base, 'POST', '/_test/reset', { json: fx }), 422, 'validation_failed');
});

test('R1 R12: a snapshot pages the same result after a payment, a correction and a hold lifecycle', async () => {
  const w = await world(srv.base, history());
  const first = (await w.ada.get(`/statement${q({ limit: 10 })}`)).body;
  const p = (await w.ada.post('/payments', { to_handle: 'bob', amount: 7 }, newKey())).body;
  await w.ada.post('/payments/p_a/corrections', { expected_revision: 1, amount: 400, effective_at: '2025-01-01T10:00:00+00:00', reason: 'fix' }, newKey());
  await w.ada.post(`/payments/${p.payment_id}/corrections`, { expected_revision: 1, amount: 5, effective_at: p.created_at, reason: 'fix' }, newKey());
  const a = (await w.ada.post('/authorizations', { to_handle: 'bob', amount: 30 }, newKey())).body;
  await w.bob.post(`/authorizations/${a.authorization_id}/capture`, { amount: 10 }, newKey());
  const again = (await w.ada.get(`/statement${q({ snapshot: first.snapshot, limit: 10 })}`)).body;
  assert.deepEqual(again, first);
  const fresh = (await w.ada.get('/statement')).body;
  assert.notDeepEqual(fresh.entries, first.entries, 'a new read sees the changes');
});

test('R3 S3 "Tokens last until reset": snapshots survive export and import, still bound to their owner', async () => {
  const w = await world(srv.base, history());
  const first = (await w.ada.get(`/statement${q({ limit: 1, known_at: '2099-01-01T00:00:00+00:00' })}`)).body;
  await w.ada.post('/payments', { to_handle: 'bob', amount: 7 }, newKey());
  const exported = (await call(srv.base, 'GET', '/_test/export')).body;
  await call(srv.base, 'POST', '/_test/reset', { json: fixture() });
  assert.equal((await call(srv.base, 'POST', '/_test/import', { json: exported })).status, 204);
  const page = (await w.ada.get(`/statement${q({ snapshot: first.snapshot, limit: 1 })}`)).body;
  assert.deepEqual(page, first);
  expectError(await w.bob.get(`/statement${q({ snapshot: first.snapshot })}`), 404, 'not_found');
  const s = exported.state;
  const edit = (over) => ({ ...exported, state: { ...s, snapshots: s.snapshots.map((x) => ({ ...x, ...over })) } });
  const bad = {
    'unknown owner': edit({ user_id: 'u_ghost' }),
    'window inverted': edit({ from_ms: s.snapshots[0].to_ms + 1 }),
    'watermark after the clock': edit({ known_at_ms: s.last_timestamp_ms + 1 }),
    'echo not an instant': edit({ known_at_text: 'tomorrow' }),
    'echo before the watermark': edit({ known_at_text: '2000-01-01T00:00:00Z' }),
    'empty token': edit({ token: '' }),
    'token longer than an id (R12)': edit({ token: `snap_${'x'.repeat(60)}` }),
    'duplicate token': { ...exported, state: { ...s, snapshots: [...s.snapshots, s.snapshots[0]] } },
    'snapshots missing': { ...exported, state: (({ snapshots, ...rest }) => rest)(s) },
  };
  for (const [label, envelope] of Object.entries(bad)) {
    expectError(await call(srv.base, 'POST', '/_test/import', { json: envelope }), 422, 'validation_failed', label);
  }
});

test('R14: holds, known_at and snapshots keep sub-millisecond instants, through export and import too', async () => {
  const w = await world(srv.base, fixture({
    payments: [
      { id: 'p_ms', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 5, note: '', created_at: '2025-01-01T00:00:00.0005Z' },
    ],
    authorizations: [{
      id: 'a_ms', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 300, status: 'open',
      created_at: '2025-01-01T00:00:00.0002Z', expires_at: '2099-01-01T00:00:00.12345Z',
    }],
  }));
  const money = async (params) => {
    const b = (await w.ada.get(`/me${q(params)}`)).body;
    return [b.total, b.held];
  };
  assert.deepEqual(await money({ as_of: '2025-01-01T00:00:00.0001Z' }), [10_005, 0]);
  assert.deepEqual(await money({ as_of: '2025-01-01T00:00:00.0002Z' }), [10_005, 300], 'the hold starts at .0002');
  assert.deepEqual(await money({ as_of: '2099-01-01T00:00:00.12344Z' }), [10_000, 300]);
  assert.deepEqual(await money({ as_of: '2099-01-01T00:00:00.12345Z' }), [10_000, 0], 'and ends at expires_at, to the digit');
  assert.deepEqual(await money({ as_of: '2026-01-01T00:00:00Z', known_at: '2025-01-01T00:00:00.0004Z' }), [10_005, 300],
    'a payment seeded at .0005 is not known at .0004');
  const window = { from: '2025-01-01T00:00:00.0005Z', to: '2025-01-01T00:00:00.00051Z' };
  const first = (await w.ada.get(`/statement${q(window)}`)).body;
  assert.deepEqual(first.entries.map((e) => [e.payment.payment_id, e.effective_at]), [['p_ms', '2025-01-01T00:00:00.0005+00:00']]);
  const auth = (await w.ada.get('/authorizations')).body.authorizations[0];
  assert.deepEqual([auth.created_at, auth.expires_at], ['2025-01-01T00:00:00.0002+00:00', '2099-01-01T00:00:00.12345+00:00']);

  const key = newKey();
  const fix = { expected_revision: 1, amount: 4, effective_at: '2025-01-01T00:00:00.000500000Z', reason: 'r' };
  const corrected = (await w.ada.post('/payments/p_ms/corrections', fix, key)).body;
  assert.equal(corrected.effective_at, '2025-01-01T00:00:00.0005+00:00');

  const exported = (await call(srv.base, 'GET', '/_test/export')).body;
  await call(srv.base, 'POST', '/_test/reset', { json: fixture() });
  assert.equal((await call(srv.base, 'POST', '/_test/import', { json: exported })).status, 204);
  assert.deepEqual((await w.ada.post('/payments/p_ms/corrections', fix, key)).body, corrected, 'the replay matches after import');
  assert.deepEqual((await w.ada.get('/authorizations')).body.authorizations[0], auth);
  assert.equal((await w.ada.get('/activity')).body.payments[0].created_at, '2025-01-01T00:00:00.0005+00:00');
  assert.deepEqual((await w.ada.get(`/statement${q({ snapshot: first.snapshot })}`)).body, first);
  assert.deepEqual(await money({ as_of: '2099-01-01T00:00:00.12344Z' }), [10_001, 300]);

  const s = exported.state;
  const withPayment = (over) => ({ ...exported, state: { ...s, payments: s.payments.map((p) => ({ ...p, ...over })) } });
  for (const frac of ['50', 5, 'x', null]) {
    expectError(await call(srv.base, 'POST', '/_test/import', { json: withPayment({ created_at_frac: frac }) }), 422, 'validation_failed',
      `created_at_frac ${JSON.stringify(frac)}`);
  }
  expectError(await call(srv.base, 'POST', '/_test/import', { json: withPayment({ created_at_frac: '4' }) }), 422, 'validation_failed',
    'revision 1 must keep the payment\'s own instant');
});

test('R6: lowercase t and z are RFC 3339 too, for every instant the service reads', async () => {
  const w = await world(srv.base, fixture({ payments: [
    { id: 'p_lc', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 5, note: '', created_at: '2025-01-01t00:00:00z' },
  ] }));
  assert.equal((await w.ada.get(`/me${q({ as_of: '2025-01-01t00:00:00z' })}`)).status, 200);
  const st = (await w.ada.get(`/statement${q({ from: '2025-01-01t00:00:00z', to: '2025-01-02t00:00:00z' })}`)).body;
  assert.deepEqual(st.entries.map((e) => e.payment.payment_id), ['p_lc']);
  const corrected = await w.ada.post('/payments/p_lc/corrections', { expected_revision: 1, amount: 4, effective_at: '2025-01-01t00:00:00z', reason: 'r' }, newKey());
  assert.equal(corrected.status, 201, JSON.stringify(corrected.body));
});

test('R14 S3-043 S3-009: instants compare at the precision they were given', async () => {
  const w = await world(srv.base, fixture({
    users: [user('ada', 10_000), user('bob', 2_500), user('cy', 500)],
    payments: [
      { id: 'p_ms', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 5, note: '', created_at: '2025-01-01T00:00:00.0005Z' },
    ],
  }));
  const bal = async (as_of) => (await w.ada.get(`/me${q({ as_of })}`)).body.balance;
  assert.equal(await bal('2025-01-01T00:00:00.0003Z'), 10_005, 'not yet at .0003');
  assert.equal(await bal('2025-01-01T00:00:00.0005Z'), 10_000, 'at exactly .0005 it has happened');
  assert.equal(await bal('2025-01-01T00:00:00.00050000Z'), 10_000);
  const feed = (await w.ada.get('/activity')).body.payments;
  assert.equal(feed[0].created_at, '2025-01-01T00:00:00.0005+00:00', 'given back at its own precision');
  const ids = async (from, to) => (await w.ada.get(`/statement${q({ from, to })}`)).body.entries.map((e) => e.payment.payment_id);
  assert.deepEqual(await ids('2025-01-01T00:00:00.0004Z', '2025-01-01T00:00:00.0005Z'), [], 'to is exclusive at full precision');
  assert.deepEqual(await ids('2025-01-01T00:00:00.0005Z', '2025-01-01T00:00:00.0006Z'), ['p_ms']);
  assert.deepEqual(await ids('2025-01-01T00:00:00.00051Z', '2025-01-02T00:00:00Z'), [], 'from is inclusive at full precision');
  const corrected = await w.ada.post('/payments/p_ms/corrections', { expected_revision: 1, amount: 6, effective_at: '2025-01-01T00:00:00.3435Z', reason: 'r' }, newKey());
  assert.equal(corrected.status, 201, JSON.stringify(corrected.body));
  assert.equal(corrected.body.effective_at, '2025-01-01T00:00:00.3435+00:00');
  assert.equal(await bal('2025-01-01T00:00:00.3434Z'), 10_005, 'the correction counts from .3435, not .3434');
  assert.equal(await bal('2025-01-01T00:00:00.3435Z'), 9_999);
});

test('R14: a sub-millisecond effective time cannot hide a historical overdraft', async () => {
  // bob opens at 0, receives 100 at .0005 and sends it on at .0006; cy pays him 500 later, so he can
  // afford any correction now. Moving his income to .0007 would mean he sent 100 at .0006 he did not have.
  const w = await world(srv.base, fixture({
    users: [user('ada', 10_000), user('bob', 500), user('cy', 1_000)],
    payments: [
      { id: 'p_in', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 100, note: '', created_at: '2025-01-01T00:00:00.0005Z' },
      { id: 'p_out', from_user_id: 'u_bob', to_user_id: 'u_cy', amount: 100, note: '', created_at: '2025-01-01T00:00:00.0006Z' },
      { id: 'p_now', from_user_id: 'u_cy', to_user_id: 'u_bob', amount: 500, note: '', created_at: '2025-06-01T00:00:00Z' },
    ],
  }));
  const bad = await w.ada.post('/payments/p_in/corrections', { expected_revision: 1, amount: 100, effective_at: '2025-01-01T00:00:00.0007Z', reason: 'later' }, newKey());
  assert.deepEqual([bad.status, bad.body.error?.code], [409, 'historical_overdraft'], JSON.stringify(bad.body));
  const fine = await w.ada.post('/payments/p_in/corrections', { expected_revision: 1, amount: 100, effective_at: '2025-01-01T00:00:00.00055Z', reason: 'still before' }, newKey());
  assert.equal(fine.status, 201, JSON.stringify(fine.body));
});

test('R13: reading statements never moves the service clock', async () => {
  const w = await world(srv.base, history());
  const clock = async () => (await call(srv.base, 'GET', '/_test/export')).body.state.last_timestamp_ms;
  const before = await clock();
  for (let i = 0; i < 300; i += 1) await w.ada.get('/statement?limit=1');
  assert.equal(await clock(), before, 'reads leave last_timestamp_ms alone');
  const p = (await w.ada.post('/payments', { to_handle: 'bob', amount: 1 }, newKey())).body;
  assert.ok(Date.parse(p.created_at) <= Date.now(), `a new payment is not stamped in the future: ${p.created_at}`);
});

test('R15 S3 "Existing snapshots remain unchanged": an edited export cannot add a payment to an old snapshot', async () => {
  const w = await world(srv.base, history());
  const first = (await w.ada.get(`/statement${q({ limit: 10 })}`)).body;
  const exported = (await call(srv.base, 'GET', '/_test/export')).body;
  const s = exported.state;
  // A consistent extra payment, recorded at the clock, as an editor would add it.
  const t = s.last_timestamp_ms;
  const added = {
    id: 'p_added', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 1, note: '', visibility: 'public',
    request_id: null, settlement_id: null, authorization_id: null, refund_of: null, created_at_ms: t,
    revisions: [{ revision: 1, amount: 1, effective_at_ms: t, recorded_at_ms: t, reason: '', correction_batch_id: null, seq: s.record_sequence + 1 }],
  };
  const users = s.users.map((u) => ({ ...u, balance: u.balance + (u.id === 'u_ada' ? -1 : u.id === 'u_bob' ? 1 : 0) }));
  const withPayment = { ...exported, state: { ...s, users, payments: [...s.payments, added], record_sequence: s.record_sequence + 1 } };
  assert.equal((await call(srv.base, 'POST', '/_test/import', { json: withPayment })).status, 204);
  assert.deepEqual((await w.ada.get(`/statement${q({ snapshot: first.snapshot, limit: 10 })}`)).body, first);
  const bad = {
    'watermark beyond the recorded count': { ...exported, state: { ...s, snapshots: s.snapshots.map((x) => ({ ...x, seq: s.record_sequence + 1 })) } },
    'recording number reused': { ...exported, state: { ...s, payments: s.payments.map((p) => ({ ...p, revisions: p.revisions.map((r) => ({ ...r, seq: 1 })) })) } },
  };
  for (const [label, envelope] of Object.entries(bad)) {
    expectError(await call(srv.base, 'POST', '/_test/import', { json: envelope }), 422, 'validation_failed', label);
  }
});
