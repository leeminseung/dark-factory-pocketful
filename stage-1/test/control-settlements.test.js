import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, client, fixture, newKey, user, useServer, world } from './helpers.js';

const srv = useServer();
const expectError = (res, status, code, label) =>
  assert.deepEqual([res.status, res.body?.error?.code], [status, code], label ?? JSON.stringify(res.body));
const reset = (json) => call(srv.base, 'POST', '/_test/reset', { json });
const exportState = async () => (await call(srv.base, 'GET', '/_test/export')).body;
const importState = (json) => call(srv.base, 'POST', '/_test/import', { json });

test('health is 200 ok without a token', async () => {
  assert.deepEqual(await call(srv.base, 'GET', '/health'), { status: 200, body: { status: 'ok' } });
});

test('a rejected fixture is 422 or 400 and changes nothing', async () => {
  const w = await world(srv.base);
  await w.ada.post('/payments', { to_handle: 'bob', amount: 1 }, newKey());
  const broken = [
    fixture({ users: [user('ada', -1), user('bob', 100)] }),
    fixture({ minor_units: 1 }),
    fixture({ users: [user('ADA', 1)] }),
    fixture({ users: [user('ada', 1), user('ada', 2, { id: 'u_other', email: 'o@x.y' })] }),
    fixture({ users: [user('ada', 1.5)] }),
    fixture({ payments: [{ id: 'p', from_user_id: 'u_ada', to_user_id: 'u_zed', amount: 1 }] }),
    fixture({ requests: [{ id: 'r', requester_id: 'u_ada', payer_id: 'u_bob', amount: 1, status: 'open' }] }),
    fixture({ settlement_operator_ids: ['u_nobody'] }),
  ];
  for (const fx of broken) {
    expectError(await reset(fx), 422, 'validation_failed', JSON.stringify(fx).slice(0, 120));
  }
  expectError(await reset(fixture({ users: 'nope' })), 400, 'malformed_request');
  expectError(await call(srv.base, 'POST', '/_test/reset', { raw: '{bad' }), 400, 'malformed_request');
  assert.equal(await w.ada.balance(), 9_999);
});

test('reset replaces everything, tokens included, and supports other currencies', async () => {
  const w = await world(srv.base);
  await w.ada.post('/payments', { to_handle: 'bob', amount: 1 }, newKey());
  assert.equal((await reset(fixture({ currency: 'JPY', minor_units: 0 }))).status, 204);
  expectError(await w.ada.get('/me'), 401, 'unauthenticated');
  const fresh = await world(srv.base, fixture({ currency: 'BHD', minor_units: 3 }));
  const me = (await fresh.ada.get('/me')).body;
  assert.deepEqual([me.balance, me.currency, me.minor_units], [10_000, 'BHD', 3]);
  assert.deepEqual((await fresh.ada.get('/activity')).body.payments, []);
});

test('export/import restores accounts, tokens, records and retries; import replaces', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  const payKey = newKey();
  const payment = (await w.ada.post('/payments', { to_handle: 'bob', amount: 300 }, payKey)).body;
  const request = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 40 }, newKey())).body;
  const failedKey = newKey();
  expectError(await w.cy.post('/payments', { to_handle: 'bob', amount: 9_999 }, failedKey), 409, 'insufficient_funds');
  const stKey = newKey();
  const stBody = { transfers: [{ from_handle: 'bob', to_handle: 'cy', amount: 5 }] };
  const settlement = (await w.ada.post('/settlements', stBody, stKey)).body;
  const snapshot = await exportState();
  assert.equal(snapshot.track, 'pocketful');
  assert.equal(snapshot.format_version, 1);
  await w.ada.post('/payments', { to_handle: 'cy', amount: 1 }, newKey()); // not in the snapshot

  await world(srv.base, fixture({ users: [user('zed', 7)] }));
  assert.equal((await importState(snapshot)).status, 204);
  assert.equal((await importState(snapshot)).status, 204, 'importing twice duplicates nothing');

  assert.equal(await w.ada.balance(), 10_000 - 300);
  assert.equal(await w.cy.balance(), 505);
  const login = await call(srv.base, 'POST', '/auth/login', { json: { email: 'bob@example.com', password: 'correct horse' } });
  assert.equal(login.status, 200);
  expectError(await call(srv.base, 'POST', '/auth/login', { json: { email: 'zed@example.com', password: 'correct horse' } }),
    401, 'unauthenticated', 'import removes the previous data');
  const replay = await w.ada.post('/payments', { to_handle: 'bob', amount: 300 }, payKey);
  assert.deepEqual([replay.status, replay.body], [200, payment]);
  const stReplay = await w.ada.post('/settlements', stBody, stKey);
  assert.deepEqual([stReplay.status, stReplay.body], [200, settlement]);
  assert.equal((await w.cy.post('/payments', { to_handle: 'bob', amount: 1 }, failedKey)).status, 201);
  const feed = (await w.ada.get('/activity')).body.payments;
  assert.equal(feed.filter((p) => p.payment_id === payment.payment_id).length, 1);
  assert.deepEqual(feed.find((p) => p.payment_id === payment.payment_id), payment);
  const listed = (await w.ada.get('/requests')).body.requests;
  assert.deepEqual(listed, [request]);
});

test('a defective import is 422 (or 400 for bad JSON) and changes nothing', async () => {
  const w = await world(srv.base);
  const good = await exportState();
  const bad = [
    {}, { ...good, track: 'other' }, { ...good, format_version: 2 }, { track: 'pocketful', format_version: 1 },
    { ...good, state: { ...good.state, users: 'x' } },
    { ...good, state: { ...good.state, users: [{ ...good.state.users[0], password_hash: 'plain' }] } },
    { ...good, state: { ...good.state, tokens: [{ token: 't', user_id: 'u_nobody' }] } },
    { ...good, state: { ...good.state, payments: [{ id: 'p' }] } },
  ];
  for (const envelope of bad) {
    expectError(await importState(envelope), 422, 'validation_failed', JSON.stringify(envelope).slice(0, 80));
  }
  expectError(await call(srv.base, 'POST', '/_test/import', { raw: '{oops' }), 400, 'malformed_request');
  assert.equal(await w.ada.balance(), 10_000);
});

test('settlements: operator only, atomic, net affordability, ordered receipts', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_cy'] }));
  const batch = { transfers: [
    { from_handle: 'bob', to_handle: 'ada', amount: 3_000, note: 'net' },
    { from_handle: 'ada', to_handle: 'bob', amount: 1_000, visibility: 'private', colour: 'x' },
  ] };
  expectError(await call(srv.base, 'POST', '/settlements', { json: batch, key: newKey() }), 401, 'unauthenticated');
  expectError(await w.ada.post('/settlements', batch, newKey()), 403, 'forbidden');

  // bob holds 2500 and sends 3000, but receives 1000 in the same batch: affordable net.
  const res = await w.cy.post('/settlements', batch, newKey());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const s = res.body;
  assert.deepEqual(s.payments.map((p) => [p.from_handle, p.to_handle, p.amount, p.note, p.visibility]),
    [['bob', 'ada', 3_000, 'net', 'public'], ['ada', 'bob', 1_000, '', 'private']]);
  assert.ok(s.payments.every((p) => p.settlement_id === s.settlement_id && p.request_id === null && p.created_at === s.committed_at));
  assert.equal(await w.ada.balance(), 12_000);
  assert.equal(await w.bob.balance(), 500);
  const cyFeed = (await w.cy.get('/activity')).body.payments.map((p) => p.payment_id);
  assert.deepEqual(cyFeed, [s.payments[0].payment_id], 'the operator sees no private member');
  assert.deepEqual((await w.cy.get('/requests')).body.requests, []);
});

test('settlement failures: shape, entry order, funds; nothing commits and the key stays free', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  const t = (from_handle, to_handle, amount, extra = {}) => ({ from_handle, to_handle, amount, ...extra });
  const cases = [
    [{}, 422, 'validation_failed'],
    [{ transfers: [] }, 422, 'validation_failed'],
    [{ transfers: 'x' }, 422, 'validation_failed'],
    [{ transfers: Array.from({ length: 33 }, () => t('ada', 'bob', 1)) }, 422, 'validation_failed'],
    [{ transfers: [7] }, 422, 'validation_failed'],
    [{ transfers: [t('ada', 'nobody', 1), t('ada', 'ada', 1)] }, 404, 'not_found'],
    [{ transfers: [t('ada', 'ada', 1), t('ada', 'nobody', 1)] }, 422, 'self_payment'],
    [{ transfers: [t('ada', 'bob', 0), t('ada', 'nobody', 1)] }, 422, 'validation_failed'],
    [{ transfers: [t('cy', 'bob', 600), t('ada', 'nobody', 1)] }, 404, 'not_found'],
    [{ transfers: [t('ada', 'bob', 5, { note: null })] }, 422, 'validation_failed'],
    [{ transfers: [t('ada', 'bob', 5, { visibility: 'secret' })] }, 422, 'validation_failed'],
    [{ transfers: [t('cy', 'bob', 400), t('cy', 'ada', 101)] }, 409, 'insufficient_funds'],
  ];
  const key = newKey();
  for (const [body, status, code] of cases) {
    expectError(await w.ada.post('/settlements', body, key), status, code, JSON.stringify(body).slice(0, 100));
  }
  assert.deepEqual(await Promise.all(['ada', 'bob', 'cy'].map((h) => w[h].balance())), [10_000, 2_500, 500]);
  assert.deepEqual((await w.ada.get('/activity')).body.payments, []);
  assert.equal((await w.ada.post('/settlements', { transfers: [t('cy', 'bob', 500)] }, key)).status, 201);
  assert.equal(await w.cy.balance(), 0);
});

test('concurrent settlements over shared wallets keep every balance nonnegative', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  const out = await Promise.all(Array.from({ length: 20 }, () => w.ada.post('/settlements', {
    transfers: [{ from_handle: 'cy', to_handle: 'bob', amount: 200 }, { from_handle: 'bob', to_handle: 'ada', amount: 100 }],
  }, newKey())));
  assert.equal(out.filter((r) => r.status === 201).length, 2);
  assert.equal(out.filter((r) => r.status === 409).length, 18);
  const balances = await Promise.all(['ada', 'bob', 'cy'].map((h) => w[h].balance()));
  assert.deepEqual(balances, [10_200, 2_700, 100]);
});

test('an operator id from import keeps its permission', async () => {
  await world(srv.base, fixture({ settlement_operator_ids: ['u_bob'] }));
  const snapshot = await exportState();
  await reset(fixture());
  await importState(snapshot);
  const login = await call(srv.base, 'POST', '/auth/login', { json: { email: 'bob@example.com', password: 'correct horse' } });
  const bob = client(srv.base, login.body.token);
  assert.equal((await bob.post('/settlements', { transfers: [{ from_handle: 'ada', to_handle: 'cy', amount: 1 }] }, newKey())).status, 201);
});

test('R1 S1-158: an import that breaks a model rule reset enforces is 422 and changes nothing', async () => {
  const w = await world(srv.base, fixture({
    payments: [{ id: 'p_1', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 5, note: 'n' }],
    requests: [{ id: 'rq_1', requester_id: 'u_bob', payer_id: 'u_ada', amount: 5, note: 'n', status: 'pending' }],
  }));
  const good = await exportState();
  const long = 'u'.repeat(100);
  const s = good.state;
  const withUser = (over) => ({ ...good, state: { ...s, users: [{ ...s.users[0], ...over }, ...s.users.slice(1)] } });
  const withPayment = (over) => ({ ...good, state: { ...s, payments: [{ ...s.payments[0], ...over }] } });
  const withRequest = (over) => ({ ...good, state: { ...s, requests: [{ ...s.requests[0], ...over }] } });
  const bad = {
    'user id over 64 characters': withUser({ id: long }),
    'empty user id': withUser({ id: '' }),
    'email not local@domain': withUser({ email: 'x' }),
    'payment id over 64 characters': withPayment({ id: 'p'.repeat(65) }),
    'payment note over 200 characters': withPayment({ note: 'x'.repeat(201) }),
    'payment to itself': withPayment({ to_user_id: 'u_ada' }),
    'request id empty': withRequest({ id: '' }),
    'request note over 200 characters': withRequest({ note: 'x'.repeat(201) }),
    'request from itself': withRequest({ payer_id: 'u_bob' }),
  };
  for (const [label, envelope] of Object.entries(bad)) {
    expectError(await importState(envelope), 422, 'validation_failed', label);
  }
  assert.equal(await w.ada.balance(), 10_000);
  assert.equal((await importState(good)).status, 204, 'the unchanged export is still accepted');
});

test('a split and its replay survive export and import', async () => {
  const w = await world(srv.base);
  const key = newKey();
  const body = { amount: 10, participant_handles: ['ada', 'bob', 'cy'], note: 's' };
  const split = (await w.ada.post('/splits', body, key)).body;
  const snapshot = await exportState();
  await reset(fixture());
  assert.equal((await importState(snapshot)).status, 204);
  const replay = await w.ada.post('/splits', body, key);
  assert.deepEqual([replay.status, replay.body], [200, split]);
  const broken = { ...snapshot, state: { ...snapshot.state, splits: [{ ...snapshot.state.splits[0], request_ids: ['rq_none'] }] } };
  expectError(await importState(broken), 422, 'validation_failed');
});

test('R15 S1-025: link fields outside the fixture format are ignored by reset', async () => {
  const w = await world(srv.base, fixture({
    payments: [{ id: 'p_1', from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 5, note: '', request_id: 7 }],
    requests: [
      { id: 'rq_1', requester_id: 'u_bob', payer_id: 'u_ada', amount: 5, note: '', status: 'pending', payment_id: 5 },
      { id: 'rq_2', requester_id: 'u_bob', payer_id: 'u_ada', amount: 5, note: '', status: 'declined', payment_id: 'p_1' },
    ],
  }));
  const listed = (await w.ada.get('/requests')).body.requests;
  assert.deepEqual(listed.map((r) => [r.request_id, r.payment_id]), [['rq_2', null], ['rq_1', null]]);
  assert.equal((await w.ada.get('/activity')).body.payments[0].request_id, null);
});

test('R11 S1-158 S1-024: an import with a timestamp that has no RFC 3339 form is 422', async () => {
  const w = await world(srv.base, fixture({ settlement_operator_ids: ['u_ada'] }));
  await w.ada.post('/payments', { to_handle: 'bob', amount: 5 }, newKey());
  await w.ada.post('/splits', { amount: 2, participant_handles: ['ada', 'bob'], note: '' }, newKey());
  await w.ada.post('/settlements', { transfers: [{ from_handle: 'bob', to_handle: 'cy', amount: 1 }] }, newKey());
  const good = await exportState();
  const s = good.state;
  const edit = (name, i, over) => ({ ...good, state: { ...s, [name]: s[name].map((x, j) => (j === i ? { ...x, ...over } : x)) } });
  const bad = {
    'last_timestamp_ms 1e20': { ...good, state: { ...s, last_timestamp_ms: 1e20 } },
    'last_timestamp_ms year 10000': { ...good, state: { ...s, last_timestamp_ms: 253402300800000 } },
    'payment created 1e20': edit('payments', 0, { created_at_ms: 1e20 }),
    'payment created year 10000': edit('payments', 0, { created_at_ms: 253402300800000 }),
    'payment created 8.64e15': edit('payments', 0, { created_at_ms: 8.64e15 }),
    'request created 1e20': edit('requests', 0, { created_at_ms: 1e20 }),
    'split created 1e20': edit('splits', 0, { created_at_ms: 1e20 }),
    'settlement committed 1e20': edit('settlements', 0, { committed_at_ms: 1e20 }),
  };
  for (const [label, envelope] of Object.entries(bad)) {
    expectError(await importState(envelope), 422, 'validation_failed', label);
  }
  assert.equal((await w.ada.post('/payments', { to_handle: 'bob', amount: 1 }, newKey())).status, 201, 'still serving');
  assert.equal((await w.bob.get('/activity')).status, 200);
});

test('R12 S1-158 S1-003 S1-134 S1-182: an import whose records contradict each other is 422', async () => {
  const w = await world(srv.base, fixture({
    settlement_operator_ids: ['u_ada'],
    requests: [{ id: 'rq_seed', requester_id: 'u_bob', payer_id: 'u_ada', amount: 5, note: '', status: 'paid' }],
  }));
  const asked = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 7, note: '' }, newKey())).body;
  const payment = (await w.ada.post(`/requests/${asked.request_id}/pay`, {}, newKey())).body;
  const pending = (await w.bob.post('/requests', { payer_handle: 'ada', amount: 3, note: '' }, newKey())).body;
  await w.ada.post('/splits', { amount: 10, participant_handles: ['ada', 'bob', 'cy'], note: '' }, newKey());
  await w.ada.post('/settlements', { transfers: [{ from_handle: 'bob', to_handle: 'cy', amount: 1 },
    { from_handle: 'cy', to_handle: 'bob', amount: 1 }] }, newKey());
  const good = await exportState();
  const s = good.state;
  const change = (name, pick, over) => ({
    ...good, state: { ...s, [name]: s[name].map((x) => (pick(x) ? { ...x, ...over } : x)) },
  });
  const isPaid = (r) => r.id === asked.request_id;
  const isMember = (p) => p.settlement_id !== null;
  const bad = {
    'paid request set back to pending': change('requests', isPaid, { status: 'pending' }),
    'paid request without its payment': change('requests', isPaid, { payment_id: null }),
    'paid request naming no payment': change('requests', isPaid, { payment_id: 'p_ghost' }),
    'pending request carrying a payment': change('requests', (r) => r.id === pending.request_id, { payment_id: payment.payment_id }),
    'payment naming no request': change('payments', (p) => p.id === payment.payment_id, { request_id: 'rq_ghost' }),
    'split shares not summing to amount': change('splits', () => true, { shares: s.splits[0].shares.map((x, i) => (i === 0 ? { ...x, amount: 5 } : x)) }),
    'split naming an unrelated request': change('splits', () => true, { request_ids: [pending.request_id, s.splits[0].request_ids[1]] }),
    'payment naming no settlement': change('payments', isMember, { settlement_id: 'st_ghost' }),
    'settlement member unlinked': change('payments', (p) => p.id === s.settlements[0].payment_ids[0], { settlement_id: null }),
    'idempotency scope not JSON': change('idempotency', (r, i) => r === s.idempotency[0], { scope: 'not json' }),
    'idempotency fingerprint not JSON': change('idempotency', (r) => r === s.idempotency[0], { fingerprint: 'garbage' }),
    'idempotency response not 201': change('idempotency', (r) => r === s.idempotency[0], { response: { ...s.idempotency[0].response, status: 500 } }),
    'duplicate idempotency scope': { ...good, state: { ...s, idempotency: [...s.idempotency, s.idempotency[0]] } },
    'duplicate token': { ...good, state: { ...s, tokens: [...s.tokens, s.tokens[0]] } },
    'empty token': { ...good, state: { ...s, tokens: [...s.tokens, { token: '', user_id: 'u_ada' }] } },
  };
  for (const [label, envelope] of Object.entries(bad)) {
    expectError(await importState(envelope), 422, 'validation_failed', label);
  }
  assert.equal((await importState(good)).status, 204, 'the unchanged export, seeded paid request included, imports');
  expectError(await w.ada.post(`/requests/${asked.request_id}/pay`, {}, newKey()), 409, 'request_not_pending');
});
