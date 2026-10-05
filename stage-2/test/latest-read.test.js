// Latest refresh wins (stage 2): the screens' read ordering (public/assets/lib/ui.js), run in Node.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LatestRead } from '../public/assets/lib/ui.js';

test('S2-071 R3: a read that arrives after a later one has been applied is dropped', () => {
  const reads = new LatestRead();
  const early = reads.begin();
  const late = reads.begin();
  assert.equal(reads.accept(late), true, 'the later refresh lands first');
  assert.equal(reads.accept(early), false, 'the delayed earlier read must not overwrite it');
  assert.equal(reads.isLatest(late), true);
});

test('S2-071: reads that arrive in order are all applied, and only the last is the latest', () => {
  const reads = new LatestRead();
  const first = reads.begin();
  const second = reads.begin();
  assert.equal(reads.isLatest(first), false);
  assert.equal(reads.accept(first), true);
  assert.equal(reads.accept(second), true);
  assert.equal(reads.isLatest(second), true);
});
