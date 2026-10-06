// The JSON shape of each resource in responses (§6, §8, §11), in one place.
import { formatTimestamp } from './clock.js';
import { remainingOf } from './model.js';

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
    authorization_id: payment.authorizationId,
    refund_of: payment.refundOf,
    created_at: formatTimestamp(payment.createdAt, payment.createdFrac),
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
    total: user.balance,
    available: state.availableOf(user.id),
    held: state.heldBy(user.id),
    currency: state.currency,
    minor_units: state.minorUnits,
  };
}

/** A split as POST /splits returns it: every share, and the requests it created. */
export function splitView(state, split) {
  return {
    split_id: split.id,
    amount: split.amount,
    currency: state.currency,
    note: split.note,
    shares: split.shares.map(({ handle, amount }) => ({ handle, amount })),
    requests: split.requestIds.map((id) => requestView(state, state.requestsById.get(id))),
    created_at: formatTimestamp(split.createdAt),
  };
}

/** A settlement as POST /settlements returns it: its member payments in input order. */
export function settlementView(state, settlement) {
  return {
    settlement_id: settlement.id,
    committed_at: formatTimestamp(settlement.committedAt),
    payments: settlement.paymentIds.map((id) => paymentView(state, state.paymentsById.get(id))),
  };
}

export function authorizationView(state, authorization) {
  const from = state.users.get(authorization.fromUserId);
  const to = state.users.get(authorization.toUserId);
  return {
    authorization_id: authorization.id,
    from_user_id: from.id,
    from_handle: from.handle,
    to_user_id: to.id,
    to_handle: to.handle,
    amount: authorization.amount,
    captured_amount: authorization.capturedAmount,
    remaining_amount: remainingOf(authorization),
    currency: state.currency,
    note: authorization.note,
    visibility: authorization.visibility,
    status: authorization.status,
    expires_at: formatTimestamp(authorization.expiresAt, authorization.expiresFrac),
    payment_id: authorization.paymentIds.at(-1) ?? null,
    payment_ids: [...authorization.paymentIds],
    created_at: formatTimestamp(authorization.createdAt, authorization.createdFrac),
    closed_at: authorization.closedAt === null ? null : formatTimestamp(authorization.closedAt, authorization.closedFrac),
  };
}

/** One revision of a payment (stage 3): the correction receipt, and each row of GET …/revisions. */
export const revisionView = (payment, rev) => ({
  payment_id: payment.id,
  revision: rev.revision,
  amount: rev.amount,
  effective_at: formatTimestamp(rev.effectiveAt, rev.effectiveFrac),
  recorded_at: formatTimestamp(rev.recordedAt, rev.recordedFrac),
  reason: rev.reason,
  correction_batch_id: rev.correctionBatchId,
});

/** The 201 body of a correction batch (stage 4): its id, its recording instant, its revisions in input order. */
export const correctionBatchView = (batchId, items) => ({
  correction_batch_id: batchId,
  recorded_at: formatTimestamp(items[0].rev.recordedAt, items[0].rev.recordedFrac),
  revisions: items.map(({ payment, rev }) => revisionView(payment, rev)),
});

export const sessionView = (user, token) => ({
  user_id: user.id,
  display_name: user.displayName,
  token,
});
