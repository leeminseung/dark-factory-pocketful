// §2 limits on reset: 10 s for POST /_test/reset, 5 s for a request that overlaps it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RESET_LIMIT_MS, call, fixture, user, useServer } from './helpers.js';

const srv = useServer();

test('R16: a 2000-user reset is fast, and a login during it is not held up', async () => {
  await call(srv.base, 'POST', '/_test/reset', { json: fixture() });
  const big = fixture({ users: [user('ada', 1), ...Array.from({ length: 1999 }, (_, i) => user(`u${i}`, 1))] });
  const started = Date.now();
  const resetting = call(srv.base, 'POST', '/_test/reset', { json: big });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const loginStarted = Date.now();
  const login = await call(srv.base, 'POST', '/auth/login', { json: { email: 'ada@example.com', password: 'correct horse' } });
  const loginMs = Date.now() - loginStarted;
  assert.equal((await resetting).status, 204);
  const resetMs = Date.now() - started;
  assert.equal(login.status, 200);
  assert.ok(resetMs < RESET_LIMIT_MS, `reset took ${resetMs} ms`);
  // Not held up: well inside the 5 s limit, and nowhere near the reset's own duration.
  assert.ok(loginMs < 1_000, `login took ${loginMs} ms`);
  const late = await call(srv.base, 'POST', '/auth/login', { json: { email: 'u1998@example.com', password: 'correct horse' } });
  assert.equal(late.status, 200, 'every seeded user can log in');
  const wrong = await call(srv.base, 'POST', '/auth/login', { json: { email: 'u5@example.com', password: 'wrong horse' } });
  assert.equal(wrong.status, 401);
});

test('S1-013 F3: 3000 users with distinct passwords reset fast; first login upgrades the hash', async () => {
  const users = Array.from({ length: 3000 }, (_, i) => user(`d${i}`, 1, { password: `pw-${i}-distinct` }));
  const started = Date.now();
  const res = await call(srv.base, 'POST', '/_test/reset', { json: fixture({ users }) });
  const resetMs = Date.now() - started;
  assert.equal(res.status, 204);
  assert.ok(resetMs < RESET_LIMIT_MS, `reset took ${resetMs} ms`);
  const last = users.at(-1);
  const hashOf = async (id) => (await call(srv.base, 'GET', '/_test/export')).body.state.users.find((u) => u.id === id).password_hash;
  const seededHash = await hashOf(last.id);
  assert.equal((await call(srv.base, 'POST', '/auth/login', { json: { email: last.email, password: last.password } })).status, 200);
  assert.equal((await call(srv.base, 'POST', '/auth/login', { json: { email: last.email, password: users[0].password } })).status, 401);
  const upgraded = await hashOf(last.id);
  assert.notEqual(upgraded, seededHash);
  assert.match(upgraded, /^scrypt\$16384\$/, 'full strength after the first login');
  assert.equal((await call(srv.base, 'POST', '/auth/login', { json: { email: last.email, password: last.password } })).status, 200);
});
