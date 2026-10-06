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

/** A State with two funded users and one payment of each kind, ready for State.correctPayments. */
function bookWithPayments() {
  const state = new State({ currency: 'EUR', minorUnits: 2 });
  for (const id of ['u_a', 'u_b']) {
    state.addUser({ id, email: `${id}@example.com`, passwordHash: 'x', displayName: id, handle: id.slice(2), balance: 1_000, openingBalance: 1_000 });
  }
  const make = (id, links = {}) => {
    const payment = {
      id, fromUserId: 'u_a', toUserId: 'u_b', amount: 100, note: '', visibility: 'public',
      requestId: null, settlementId: null, authorizationId: null, refundOf: null, createdAt: 1_000, createdFrac: '', ...links,
      revisions: [{ revision: 1, amount: 100, effectiveAt: 1_000, effectiveFrac: '', recordedAt: 1_000, recordedFrac: '', reason: '', correctionBatchId: null, seq: 1 }],
    };
    state.addPayment(payment);
    return payment;
  };
  const p = {
    plain: make('p_plain'),
    capture: make('p_capture', { authorizationId: 'a_1' }),
    refund: make('p_refund', { refundOf: 'p_refunded', fromUserId: 'u_b', toUserId: 'u_a' }),
    refunded: make('p_refunded'),
    member: make('p_member', { settlementId: 'st_1' }),
    member2: make('p_member2', { settlementId: 'st_1' }),
  };
  state.refundedBy.set('p_refunded', 100);
  state.addSettlement({ id: 'st_1', committedAt: 1_000, paymentIds: ['p_member', 'p_member2'] });
  state.lastTimestampMs = 2_000;
  return { state, p };
}

const terms = (payment, over = {}) => ({ payment, expected: 1, amount: 100, effectiveAt: 1_000, effectiveFrac: '', reason: 'r', ...over });

test('R2: the correction gate itself refuses immutable payments, stale revisions, the refund floor and partial settlements', () => {
  const cases = [
    ['a capture', ({ p }) => [[terms(p.capture)], { kind: 'single' }], 'linked_payment_immutable'],
    ['a refund', ({ p }) => [[terms(p.refund)], { kind: 'batch' }], 'linked_payment_immutable'],
    ['a member alone', ({ p }) => [[terms(p.member)], { kind: 'single' }], 'linked_payment_immutable'],
    ['a stale revision', ({ p }) => [[terms(p.plain, { expected: 2 })], { kind: 'single' }], 'stale_revision'],
    ['below the refunds', ({ p }) => [[terms(p.refunded, { amount: 99 })], { kind: 'single' }], 'refund_exceeds_payment'],
    ['part of a settlement', ({ p }) => [[terms(p.member)], { kind: 'batch' }], 'incomplete_settlement'],
    ['a settlement at two instants', ({ p }) => [[terms(p.member), terms(p.member2, { effectiveAt: 999 })], { kind: 'batch' }], 'validation_failed'],
  ];
  for (const [label, args, code] of cases) {
    const book = bookWithPayments();
    const [items, options] = args(book);
    assert.throws(() => book.state.transaction(() => book.state.correctPayments(items, options)), (err) => err.code === code, label);
    assert.ok(book.state.payments.every((x) => x.revisions.length === 1), `${label}: nothing recorded`);
  }
  const book = bookWithPayments();
  const { batchId, revisions } = book.state.correctPayments([terms(book.p.member, { amount: 90 }), terms(book.p.member2, { amount: 90 })], { kind: 'batch' });
  assert.deepEqual(revisions.map((r) => [r.revision, r.amount, r.correctionBatchId]), [[2, 90, batchId], [2, 90, batchId]]);
});
