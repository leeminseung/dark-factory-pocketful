// POST /payments/{id}/refunds (stage 4): the receiver sends money back, linked to the payment.
import { forbidden, invalidRefundTarget, notFound } from '../errors.js';
import { amount } from '../validate.js';
import { paymentView } from '../views.js';

/**
 * Idempotent: returns the 201 body, the refund payment. Checked in order: the payment exists
 * (404), the caller is its receiver (403), it is not itself a refund (422 invalid_refund_target),
 * the amount (422 validation_failed); then State.refundPayment: refunds within its current amount
 * (422 refund_exceeds_payment) and the receiver's available funds (409 insufficient_funds).
 */
export function createRefund({ state, user, body, params }) {
  const target = state.paymentsById.get(params.id);
  if (!target) throw notFound('no such payment');
  if (target.toUserId !== user.id) throw forbidden('only the payment\'s receiver may refund it');
  if (target.refundOf !== null) throw invalidRefundTarget();
  const refund = state.refundPayment(target, amount(body));
  return paymentView(state, refund);
}
