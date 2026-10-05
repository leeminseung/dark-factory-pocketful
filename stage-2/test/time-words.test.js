// Time words for people (public/assets/lib/time.js), run in Node.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { timeInSentence } from '../public/assets/lib/time.js';

test('D10: inside a sentence, today and yesterday are lower case; other days as everywhere else', () => {
  const now = new Date(2026, 9, 6, 12, 0);
  assert.equal(timeInSentence(new Date(2026, 9, 6, 6, 51).toISOString(), now), 'today, 06:51');
  assert.equal(timeInSentence(new Date(2026, 9, 5, 9, 10).toISOString(), now), 'yesterday, 09:10');
  assert.equal(timeInSentence(new Date(2026, 9, 9, 18, 0).toISOString(), now), '9 Oct, 18:00');
});
