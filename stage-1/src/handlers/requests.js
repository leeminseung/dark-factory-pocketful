// Money requests (§4, §8): create, pay, decline, cancel, list.
import { forbidden, notFound, requestNotPending, selfRequest } from '../errors.js';
import { paginate, paging, queryChoice } from '../paging.js';
import { REQUEST_STATUSES } from '../fixture.js';
import { amount, note, requiredString, visibility } from '../validate.js';
import { paymentView, requestView } from '../views.js';

const DIRECTIONS = ['incoming', 'outgoing'];

/** Adds a pending request from `requester` to `payer`; the payer's balance is not checked. */
export function addPendingRequest(state, { requester, payer, amount: value, note: text, createdAt }) {
  const request = {
    id: state.newId('rq', (id) => state.requestsById.has(id)),
    requesterId: requester.id,
    payerId: payer.id,
    amount: value,
    note: text,
    status: 'pending',
    paymentId: null,
    createdAt,
  };
  state.addRequest(request);
  return request;
}

/** Idempotent: returns the 201 body. */
export function createRequest({ state, user, body }) {
  const payerHandle = requiredString(body, 'payer_handle');
  const value = amount(body);
  const text = note(body);
  const payer = state.userByHandle(payerHandle);
  if (!payer) throw notFound(`no user has the handle ${JSON.stringify(payerHandle)}`);
  if (payer.id === user.id) throw selfRequest();
  const request = addPendingRequest(state, {
    requester: user, payer, amount: value, note: text, createdAt: state.nextTimestamp(),
  });
  return requestView(state, request);
}

/**
 * The request `id` as seen by `user`. Requests are visible only to their two parties,
 * so a request between two other people is 404, as is an unknown one.
 */
function visibleRequest(state, user, id) {
  const request = state.requestsById.get(id);
  if (!request || (request.payerId !== user.id && request.requesterId !== user.id)) {
    throw notFound('no such request');
  }
  return request;
}

function requireRole(request, userId, role) {
  const roleId = role === 'payer' ? request.payerId : request.requesterId;
  if (roleId !== userId) throw forbidden(`only the request's ${role} may do this`);
}

/** Idempotent: returns the 201 body, the new payment. */
export function payRequest({ state, user, body, params }) {
  const chosenVisibility = visibility(body);
  const request = visibleRequest(state, user, params.id);
  requireRole(request, user.id, 'payer');
  if (request.status !== 'pending') throw requestNotPending();
  const [payment] = state.movePayments([{
    fromUserId: request.payerId,
    toUserId: request.requesterId,
    amount: request.amount,
    note: request.note,
    visibility: chosenVisibility,
  }], { requestId: request.id, createdAt: state.nextTimestamp() });
  request.status = 'paid';
  request.paymentId = payment.id;
  return paymentView(state, payment);
}

/** Moves a pending request to `status`; repeating the same move is a no-op, not an error. */
function settleRequest(status, role) {
  return ({ state, user, params }) => {
    const request = visibleRequest(state, user, params.id);
    requireRole(request, user.id, role);
    if (request.status !== status) {
      if (request.status !== 'pending') throw requestNotPending();
      request.status = status;
    }
    return { status: 200, body: requestView(state, request) };
  };
}

export const declineRequest = settleRequest('declined', 'payer');
export const cancelRequest = settleRequest('cancelled', 'requester');

export function listRequests({ state, user, query }) {
  const direction = queryChoice(query, 'direction', DIRECTIONS);
  const status = queryChoice(query, 'status', REQUEST_STATUSES);
  const page = paging(query);
  const isIncoming = (r) => r.payerId === user.id;
  const isOutgoing = (r) => r.requesterId === user.id;
  const inDirection = {
    incoming: isIncoming,
    outgoing: isOutgoing,
    both: (r) => isIncoming(r) || isOutgoing(r),
  }[direction ?? 'both'];
  const matches = state.requests
    .filter((r) => inDirection(r) && (status === null || r.status === status))
    .reverse();
  const { items, hasMore } = paginate(matches, page);
  return { status: 200, body: { requests: items.map((r) => requestView(state, r)), has_more: hasMore } };
}
