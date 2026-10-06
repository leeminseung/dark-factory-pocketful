// Stage 3: historical holds and closed_at.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asStage2Export, call, fixture, newKey, useServer, world } from './helpers.js';

const srv = useServer();
const q = (params) => `?${new URLSearchParams(params)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const iso = (ms) => new Date(ms).toISOString();
const money = async (client, params) => {
  const b = (await client.get(`/me${q(params)}`)).body;
  return [b.total, b.available, b.held];
};

test('S3 holds: as of an instant, a hold starts at creation, shrinks at a non-final capture and ends at its closing event', async () => {
  const w = await world(srv.base);
  const a = (await w.ada.post('/authorizations', { to_handle: 'bob', amount: 1_000 }, newKey())).body;
  const created = Date.parse(a.created_at);
  await sleep(5);
  const cap = (await w.bob.post(`/authorizations/${a.authorization_id}/capture`, { amount: 300, final: false }, newKey())).body;
  const captured = Date.parse(cap.created_at);
  await sleep(5);
  const voided = (await w.ada.post(`/authorizations/${a.authorization_id}/void`)).body;
  const closed = Date.parse(voided.closed_at);
  assert.ok(closed > captured && captured > created);
  assert.deepEqual(await money(w.ada, { as_of: iso(created - 1) }), [10_000, 10_000, 0]);
  assert.deepEqual(await money(w.ada, { as_of: iso(created) }), [10_000, 9_000, 1_000]);
  assert.deepEqual(await money(w.ada, { as_of: iso(captured) }), [9_700, 9_000, 700]);
  assert.deepEqual(await money(w.ada, { as_of: iso(closed) }), [9_700, 9_700, 0]);
  assert.deepEqual(await money(w.ada, { as_of: iso(closed), known_at: iso(closed - 1) }), [9_700, 9_000, 700], 'the void is not known yet');
  assert.deepEqual(await money(w.ada, { as_of: iso(captured), known_at: iso(created) }), [10_000, 9_000, 1_000], 'nor is the capture');
  const listed = (await w.ada.get('/authorizations')).body.authorizations[0];
  assert.equal(listed.closed_at, voided.closed_at);
});

test('S3 holds: expiry takes effect at expires_at, known from creation on, also for queries beyond now', async () => {
  const w = await world(srv.base, fixture({ authorization_ttl_seconds: 3600 }));
  const a = (await w.ada.post('/authorizations', { to_handle: 'bob', amount: 1_000 }, newKey())).body;
  assert.equal(a.closed_at, null);
  const expires = Date.parse(a.expires_at);
  assert.deepEqual(await money(w.ada, { as_of: iso(expires - 1) }), [10_000, 9_000, 1_000]);
  assert.deepEqual(await money(w.ada, { as_of: iso(expires), known_at: a.created_at }), [10_000, 10_000, 0]);
  assert.equal((await w.ada.get('/me')).body.held, 1_000, 'still open now');

  const short = await world(srv.base, fixture({ authorization_ttl_seconds: 1 }));
  const b = (await short.ada.post('/authorizations', { to_handle: 'bob', amount: 10 }, newKey())).body;
  await sleep(1_100);
  const listed = (await short.ada.get('/authorizations')).body.authorizations[0];
  assert.deepEqual([listed.status, listed.closed_at], ['expired', b.expires_at], 'closed at its deadline, not when noticed');
});

test('S3 holds: a seeded open hold starts at the reset, or at its own created_at', async () => {
  const inAnHour = new Date(Date.now() + 3_600_000).toISOString();
  const seed = (id, over = {}) => ({ id, from_user_id: 'u_ada', to_user_id: 'u_bob', amount: 100, note: '', visibility: 'public', status: 'open', expires_at: inAnHour, ...over });
  const resetAt = Date.now();
  const w = await world(srv.base, fixture({ authorizations: [seed('a_reset'), seed('a_2025', { created_at: '2025-06-01T00:00:00Z' })] }));
  assert.deepEqual(await money(w.ada, { as_of: '2025-05-01T00:00:00Z' }), [10_000, 10_000, 0]);
  assert.deepEqual(await money(w.ada, { as_of: '2025-07-01T00:00:00Z' }), [10_000, 9_900, 100]);
  assert.deepEqual(await money(w.ada, { as_of: iso(resetAt + 60_000) }), [10_000, 9_800, 200]);
});

test('S3 holds: a stage-2 export with authorization receipts imports and replays', async () => {
  const w = await world(srv.base);
  const key = newKey();
  const a = (await w.ada.post('/authorizations', { to_handle: 'bob', amount: 10 }, key)).body;
  const stage2 = asStage2Export((await call(srv.base, 'GET', '/_test/export')).body);
  // A stage-2 receipt had no closed_at.
  stage2.state.idempotency = stage2.state.idempotency.map((rec) => ({ ...rec, response: { ...rec.response, body: (({ closed_at, ...b }) => b)(rec.response.body) } }));
  await call(srv.base, 'POST', '/_test/reset', { json: fixture() });
  assert.equal((await call(srv.base, 'POST', '/_test/import', { json: stage2 })).status, 204);
  const replay = await w.ada.post('/authorizations', { to_handle: 'bob', amount: 10 }, key);
  assert.deepEqual([replay.status, replay.body.authorization_id], [200, a.authorization_id]);
});
