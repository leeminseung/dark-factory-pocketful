// §2 limits on reset: 10 s for POST /_test/reset, 5 s for a request that overlaps it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, fixture, user, useServer } from './helpers.js';

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
  assert.ok(resetMs < 2_000, `reset took ${resetMs} ms`);
  assert.ok(loginMs < 1_000, `login took ${loginMs} ms`);
  const late = await call(srv.base, 'POST', '/auth/login', { json: { email: 'u1998@example.com', password: 'correct horse' } });
  assert.equal(late.status, 200, 'every seeded user can log in');
  const wrong = await call(srv.base, 'POST', '/auth/login', { json: { email: 'u5@example.com', password: 'wrong horse' } });
  assert.equal(wrong.status, 401);
});
