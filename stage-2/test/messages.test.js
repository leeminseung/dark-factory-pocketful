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

test('R17: a refused collection is worded for people, by code', async () => {
  const { reservationRefusal } = await import('../public/assets/lib/messages.js');
  const money = { minorUnits: 2, currency: 'EUR' };
  const ctx = { money, amount: 0, remaining: 2000 };
  assert.equal(reservationRefusal(refused('validation_failed', 'Amount must be 1 to 1.7976931348623157e+308'), ctx),
    'Enter an amount from 0.01 EUR to 20.00 EUR.');
  assert.equal(reservationRefusal(refused('capture_exceeds_authorization'), { ...ctx, amount: 2500 }),
    "Couldn't collect 25.00 EUR. Only 20.00 EUR is left to collect.");
  assert.equal(reservationRefusal(refused('authorization_expired'), ctx),
    "This reservation has expired, so it can't be collected. The list has been updated.");
  assert.equal(reservationRefusal(refused('authorization_not_open'), ctx),
    'This reservation is no longer open. The list has been updated.');
});
