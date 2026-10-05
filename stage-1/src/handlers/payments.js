// POST /payments and GET /activity (§4 feed contract, §8).
import { selfPayment } from '../errors.js';
import { counterparty } from './handles.js';
import { paginate, paging } from '../paging.js';
import { amount, note, requiredString, visibility } from '../validate.js';
import { paymentView } from '../views.js';

/** The feed contract: public, or the caller sent or received it. Nothing else. */
export const canSeePayment = (payment, userId) =>
  payment.visibility === 'public' || payment.fromUserId === userId || payment.toUserId === userId;

/** Idempotent: returns the 201 body. */
export function createPayment({ state, user, body }) {
  const toHandle = requiredString(body, 'to_handle');
  const transfer = {
    amount: amount(body),
    note: note(body),
    visibility: visibility(body),
    fromUserId: user.id,
  };
  transfer.toUserId = counterparty(state, user, toHandle, selfPayment).id;
  const [payment] = state.movePayments([transfer], { createdAt: state.nextTimestamp() });
  return paymentView(state, payment);
}

export function activity({ state, user, query }) {
  const page = paging(query);
  const visible = state.payments.filter((p) => canSeePayment(p, user.id)).reverse();
  const { items, hasMore } = paginate(visible, page);
  return { status: 200, body: { payments: items.map((p) => paymentView(state, p)), has_more: hasMore } };
}
