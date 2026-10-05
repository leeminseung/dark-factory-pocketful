// State-level guarantees that no HTTP input can reach directly.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { State } from '../src/state.js';
import { runIdempotent } from '../src/idempotency.js';

function twoUsers() {
  const state = new State({ currency: 'EUR', minorUnits: 2 });
  state.addUser({ id: 'u_a', email: 'a@x.y', passwordHash: 'h', displayName: 'A', handle: 'a', balance: 100 });
  state.addUser({ id: 'u_b', email: 'b@x.y', passwordHash: 'h', displayName: 'B', handle: 'b', balance: 0 });
  return state;
}
const transfer = { fromUserId: 'u_a', toUserId: 'u_b', amount: 40, note: '', visibility: 'public' };

test('a write that fails after moving money leaves no trace, and no idempotency record', () => {
  const state = twoUsers();
  const request = { id: 'rq', requesterId: 'u_b', payerId: 'u_a', amount: 10, note: '', status: 'pending', paymentId: null, createdAt: 1 };
  state.addRequest(request);
  const failing = () => {
    state.movePayments([transfer], { createdAt: state.nextTimestamp() });
    state.closeRequest(request, 'paid', { visibility: 'public' });
    state.addSplit({ id: 'sp' });
    state.addSettlement({ id: 'st' });
    state.issueToken('u_a');
    throw new Error('response could not be rendered');
  };
  const ctx = { userId: 'u_a', method: 'POST', route: '/payments', params: {}, key: 'k', body: {} };
  assert.throws(() => state.transaction(() => runIdempotent(state, ctx, failing)), /could not be rendered/);
  assert.deepEqual([state.users.get('u_a').balance, state.users.get('u_b').balance], [100, 0]);
  assert.deepEqual([state.payments.length, state.paymentsById.size], [0, 0]);
  assert.deepEqual([request.status, request.paymentId], ['pending', null]);
  assert.deepEqual([state.splits.size, state.settlements.size, state.tokens.size, state.idempotency.size], [0, 0, 0, 0]);
  const ok = state.transaction(() => runIdempotent(state, ctx, () => {
    state.movePayments([transfer], { createdAt: state.nextTimestamp() });
    return { done: true };
  }));
  assert.equal(ok.status, 201);
  assert.equal(state.users.get('u_a').balance, 60);
  assert.equal(state.idempotency.size, 1);
});

test('R22: closeRequest accepts only the three terminal statuses', () => {
  const state = twoUsers();
  const request = { id: 'rq', requesterId: 'u_b', payerId: 'u_a', amount: 10, note: '', status: 'pending', paymentId: null, createdAt: 1 };
  state.addRequest(request);
  for (const status of ['pending', 'open', undefined]) {
    assert.throws(() => state.closeRequest(request, status), /terminal status/, String(status));
    assert.equal(request.status, 'pending');
  }
  state.closeRequest(request, 'declined');
  assert.equal(request.status, 'declined');
});

test('R23: a sync handler that returns a Promise is refused, and its changes are undone', () => {
  const state = twoUsers();
  const ctx = { userId: 'u_a', method: 'POST', route: '/payments', params: {}, key: 'k', body: {} };
  const sneaky = () => {
    state.movePayments([transfer], { createdAt: state.nextTimestamp() });
    return Promise.resolve({});
  };
  assert.throws(() => state.transaction(() => runIdempotent(state, ctx, sneaky)), /must be synchronous/);
  assert.equal(state.users.get('u_a').balance, 100);
  assert.equal(state.idempotency.size, 0);
});
