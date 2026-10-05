// Payment authorizations (stage 2): authorise, capture, void, list.
import { forbidden, malformed, notFound, selfPayment } from '../errors.js';
import { AUTHORIZATION_STATUSES } from '../model.js';
import { paginate, paging, queryChoice } from '../paging.js';
import { amount, note, requiredString, visibility } from '../validate.js';
import { authorizationView, paymentView } from '../views.js';
import { counterparty } from './handles.js';

const DIRECTIONS = ['incoming', 'outgoing'];
const has = (body, name) => Object.prototype.hasOwnProperty.call(body, name);

/** Idempotent: places a hold for the receiver and returns the 201 body. */
export function createAuthorization({ state, user, body }) {
  const toHandle = requiredString(body, 'to_handle');
  const terms = { amount: amount(body), note: note(body), visibility: visibility(body) };
  const to = counterparty(state, user, toHandle, selfPayment);
  const authorization = state.openAuthorization({ ...terms, fromUserId: user.id, toUserId: to.id });
  return authorizationView(state, authorization);
}

/** The authorization `id`, or 404. Who may act on it is decided by requireParty: anyone else is 403. */
function findAuthorization(state, id) {
  const authorization = state.authorizationsById.get(id);
  if (!authorization) throw notFound('no such authorization');
  return authorization;
}

function requireParty(authorization, userId, party) {
  const partyId = party === 'receiver' ? authorization.toUserId : authorization.fromUserId;
  if (partyId !== userId) throw forbidden(`only the authorization's ${party} may do this`);
}

/** Capture terms: amount optional (default the remainder), final optional boolean (default true). */
function captureTerms(body) {
  // Above the remainder is capture_exceeds_authorization, judged against the authorization.
  const captured = has(body, 'amount') ? amount(body, 'amount', { max: Number.MAX_VALUE }) : null;
  if (has(body, 'final') && typeof body.final !== 'boolean') throw malformed('final must be a boolean');
  return { amount: captured, final: body.final ?? true };
}

/** Idempotent: only the receiver captures; returns the 201 body, the new payment. */
export function captureAuthorization({ state, user, body, params }) {
  const terms = captureTerms(body);
  const authorization = findAuthorization(state, params.id);
  requireParty(authorization, user.id, 'receiver');
  return paymentView(state, state.captureAuthorization(authorization, terms));
}

/** Only the payer voids; voiding twice is 200 with the current state. */
export function voidAuthorization({ state, user, params }) {
  const authorization = findAuthorization(state, params.id);
  requireParty(authorization, user.id, 'payer');
  state.voidAuthorization(authorization);
  return { status: 200, body: authorizationView(state, authorization) };
}

export function listAuthorizations({ state, user, query }) {
  const direction = queryChoice(query, 'direction', DIRECTIONS);
  const status = queryChoice(query, 'status', AUTHORIZATION_STATUSES);
  const page = paging(query);
  const isOutgoing = (a) => a.fromUserId === user.id;
  const isIncoming = (a) => a.toUserId === user.id;
  const inDirection = {
    incoming: isIncoming,
    outgoing: isOutgoing,
    both: (a) => isIncoming(a) || isOutgoing(a),
  }[direction ?? 'both'];
  const matches = state.authorizations
    .filter((a) => inDirection(a) && (status === null || a.status === status))
    .reverse();
  const { items, hasMore } = paginate(matches, page);
  return {
    status: 200,
    body: { authorizations: items.map((a) => authorizationView(state, a)), has_more: hasMore },
  };
}
