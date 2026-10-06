// src/state.js: every change made inside a failed transaction is undone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { State } from '../src/state.js';

test('R4: a payment added in a failed transaction leaves no correction batch id or refund total behind', () => {
  const state = new State({ currency: 'EUR', minorUnits: 2 });
  const payment = {
    id: 'p_x', fromUserId: 'u_a', toUserId: 'u_b', amount: 5, refundOf: 'p_t', createdAt: 0, createdFrac: '',
    revisions: [
      { revision: 1, amount: 5, correctionBatchId: null },
      { revision: 2, amount: 4, correctionBatchId: 'cb_x' },
    ],
  };
  assert.throws(() => state.transaction(() => {
    state.addPayment(payment);
    throw new Error('refused');
  }), /refused/);
  assert.deepEqual([state.payments.length, state.correctionBatchIds.has('cb_x'), state.refundedBy.has('p_t')], [0, false, false]);
});
