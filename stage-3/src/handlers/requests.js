// Money requests (§4, §8): create, pay, decline, cancel, list.
import { forbidden, notFound, selfRequest } from '../errors.js';
import { counterparty } from './handles.js';
import { paginate, paging, queryChoice } from '../paging.js';
import { REQUEST_STATUSES } from '../model.js';
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
    seeded: false,
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
  const payer = counterparty(state, user, payerHandle, selfRequest);
  const request = addPendingRequest(state, {
    requester: user, payer, amount: value, note: text, createdAt: state.nextTimestamp(),
  });
  return requestView(state, request);
}

/** The request `id`, or 404. Who may act on it is decided by requireRole: anyone else is 403. */
function findRequest(state, id) {
  const request = state.requestsById.get(id);
  if (!request) throw notFound('no such request');
  return request;
}

function requireRole(request, userId, role) {
  const roleId = role === 'payer' ? request.payerId : request.requesterId;
  if (roleId !== userId) throw forbidden(`only the request's ${role} may do this`);
}

/** Idempotent: returns the 201 body, the new payment. */
export function payRequest({ state, user, body, params }) {
  const chosenVisibility = visibility(body);
  const request = findRequest(state, params.id);
  requireRole(request, user.id, 'payer');
  const payment = state.closeRequest(request, 'paid', { visibility: chosenVisibility });
  return paymentView(state, payment);
}

/** Moves a pending request to `status`; repeating the same move is a no-op, not an error. */
function settleRequest(status, role) {
  return ({ state, user, params }) => {
    const request = findRequest(state, params.id);
    requireRole(request, user.id, role);
    if (request.status !== status) state.closeRequest(request, status);
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
