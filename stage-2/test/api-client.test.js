// The browser's API client (public/assets/lib/api.js), run in Node with a stubbed fetch.
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { api, READ_TIMEOUT_MS } = await import('../public/assets/lib/api.js');

test('S2-068 S2-071: a read that never answers is abandoned and asked again', async () => {
  let calls = 0;
  globalThis.fetch = (url, { signal }) => {
    calls += 1;
    if (calls === 1) {
      // The first answer is lost: it never arrives, until the client gives up on it.
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    return Promise.resolve(new Response(JSON.stringify({ balance: 8500 }), { status: 200 }));
  };
  const started = Date.now();
  const res = await api('GET', '/me');
  assert.deepEqual([res.ok, res.body.balance, calls], [true, 8500, 2]);
  assert.ok(Date.now() - started >= READ_TIMEOUT_MS && Date.now() - started < READ_TIMEOUT_MS + 1000);
});

test('R21: a read is abandoned only after the service\'s own 5 s answer limit, so a slow answer is never asked twice', () => {
  assert.ok(READ_TIMEOUT_MS > 5000, `READ_TIMEOUT_MS is ${READ_TIMEOUT_MS}`);
});

test('a write is never retried by the client: a lost answer stays unknown', async () => {
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    return Promise.reject(new Error('connection reset'));
  };
  const res = await api('POST', '/payments', { body: {}, key: 'k' });
  assert.deepEqual([res.unknown, calls], [true, 1]);
});
