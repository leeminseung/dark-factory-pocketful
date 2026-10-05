// The screens read whole lists by following has_more (public/assets/lib/api.js), run in Node.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectPages } from '../public/assets/lib/api.js';

test('R9: every page is read until has_more is false, in order', async () => {
  const all = Array.from({ length: 450 }, (_, i) => i);
  const asked = [];
  const result = await collectPages(async (offset, limit) => {
    asked.push([offset, limit]);
    return { ok: true, items: all.slice(offset, offset + limit), hasMore: offset + limit < all.length };
  });
  assert.deepEqual(result, { ok: true, items: all });
  assert.deepEqual(asked, [[0, 200], [200, 200], [400, 200]]);
});

test('R9: a page that fails makes the whole read fail', async () => {
  let calls = 0;
  const result = await collectPages(async () => {
    calls += 1;
    return calls === 1 ? { ok: true, items: [1], hasMore: true } : { ok: false };
  });
  assert.equal(result.ok, false);
});
