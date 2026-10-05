// The browser's refusal wording (public/assets/lib/messages.js), run in Node. §5: the server's
// message "may use any wording", so no wording may depend on it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authRefusal, splitRefusal } from '../public/assets/lib/messages.js';

const refused = (code, message = 'any wording at all') => ({ refused: true, code, message });

test('R5: signup validation wording comes from what was typed, not from the message text', () => {
  assert.equal(authRefusal(refused('validation_failed'), { email: 'a@b.c', password: 'short' }),
    'Use a password of at least 8 characters.');
  assert.equal(authRefusal(refused('validation_failed', 'password is wrong'), { email: 'nope', password: 'long enough pw' }),
    'Enter an email like name@example.com.');
  assert.equal(authRefusal(refused('validation_failed'), { email: 'nope', password: 'short' }),
    'Enter an email like name@example.com.', 'the service checks the email first');
});

test('R5: split refusals are worded by code and by the list that was sent', () => {
  assert.equal(splitRefusal(refused('not_found'), { handles: ['ada', 'lin_02'] }),
    "Split not sent. One of these handles doesn't belong to anyone: ada, lin_02. Check the list.");
  assert.equal(splitRefusal(refused('not_found'), { handles: ['lin_02'] }),
    'Split not sent. No one has the handle lin_02. Check the list.');
  assert.equal(splitRefusal(refused('validation_failed'), { handles: ['ada', 'ada'] }),
    'Split not sent. Each handle can appear only once.');
  assert.equal(splitRefusal(refused('validation_failed'), { handles: [] }),
    'Split not sent. Add at least one handle.');
});
