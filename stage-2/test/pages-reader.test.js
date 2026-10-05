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
  }, (n) => n);
  assert.deepEqual(result, { ok: true, items: all });
  assert.deepEqual(asked, [[0, 200], [200, 200], [400, 200]]);
});

test('R9: a page that fails makes the whole read fail', async () => {
  let calls = 0;
  const result = await collectPages(async () => {
    calls += 1;
    return calls === 1 ? { ok: true, items: [1], hasMore: true } : { ok: false };
  }, (n) => n);
  assert.equal(result.ok, false);
});

test('R12 S2-046: a row repeated across pages, because another client wrote between page reads, appears once', async () => {
  // 201 payments, newest first; a new payment lands between the two page reads, so page two
  // starts with the row that was last on page one.
  const before = Array.from({ length: 201 }, (_, i) => ({ id: `p${200 - i}` }));
  const after = [{ id: 'p_new' }, ...before];
  const result = await collectPages(async (offset, limit) => {
    const rows = offset === 0 ? before : after;
    return { ok: true, items: rows.slice(offset, offset + limit), hasMore: offset + limit < rows.length };
  }, (row) => row.id);
  const ids = result.items.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, 'one per row');
  assert.equal(ids.length, 201);
});
