// The browser's retry identity (public/assets/lib/ui.js), run in Node: the module touches no DOM at load.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RetryIdentity } from '../public/assets/lib/ui.js';

test('S2-039 S2-040 S2-074: the key follows the body that is sent, not the edits in between', () => {
  const identity = new RetryIdentity();
  const a = JSON.stringify({ to_handle: 'bob', amount: 1500 });
  const b = JSON.stringify({ to_handle: 'bob', amount: 1600 });
  const first = identity.current(a);
  assert.equal(identity.current(a), first, 'resubmitting the unchanged form replays');
  assert.ok(identity.matches(a));
  assert.ok(!identity.matches(b), 'an edited form is not the pending one');
  assert.equal(identity.current(a), first, 'edited and changed back is unchanged: same key');
  const second = identity.current(b);
  assert.notEqual(second, first, 'a changed form is a new payment');
  assert.notEqual(identity.current(a), first, 'once a different body was sent, going back is new too');
});
