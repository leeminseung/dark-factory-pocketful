// The JSON shape of each resource in responses (§8, §11), in one place.
import { formatTimestamp } from './clock.js';

export function paymentView(state, payment) {
  const from = state.users.get(payment.fromUserId);
  const to = state.users.get(payment.toUserId);
  return {
    payment_id: payment.id,
    from_user_id: from.id,
    from_handle: from.handle,
    to_user_id: to.id,
    to_handle: to.handle,
    amount: payment.amount,
    currency: state.currency,
    note: payment.note,
    visibility: payment.visibility,
    request_id: payment.requestId,
    settlement_id: payment.settlementId,
    created_at: formatTimestamp(payment.createdAt),
  };
}

export function requestView(state, request) {
  const requester = state.users.get(request.requesterId);
  const payer = state.users.get(request.payerId);
  return {
    request_id: request.id,
    requester_id: requester.id,
    requester_handle: requester.handle,
    payer_id: payer.id,
    payer_handle: payer.handle,
    amount: request.amount,
    currency: state.currency,
    note: request.note,
    status: request.status,
    payment_id: request.paymentId,
    created_at: formatTimestamp(request.createdAt),
  };
}

export function meView(state, user) {
  return {
    user_id: user.id,
    display_name: user.displayName,
    handle: user.handle,
    balance: user.balance,
    currency: state.currency,
    minor_units: state.minorUnits,
  };
}

export const sessionView = (user, token) => ({
  user_id: user.id,
  display_name: user.displayName,
  token,
});
