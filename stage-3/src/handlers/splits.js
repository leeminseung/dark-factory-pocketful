// POST /splits (§8) and the equal-split rule (§9).
import { invalid, malformed } from '../errors.js';
import { amount, note } from '../validate.js';
import { splitView } from '../views.js';
import { equalShares } from '../../public/assets/shared/shares.js';
import { userWithHandle } from './handles.js';
import { addPendingRequest } from './requests.js';

export { equalShares };

function participantHandles(body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'participant_handles')) {
    throw invalid('participant_handles is required');
  }
  const handles = body.participant_handles;
  if (!Array.isArray(handles) || !handles.every((h) => typeof h === 'string')) {
    throw malformed('participant_handles must be an array of strings');
  }
  if (handles.length === 0) throw invalid('participant_handles is empty');
  if (new Set(handles).size !== handles.length) throw invalid('participant_handles has a duplicate');
  return handles;
}

/** Idempotent: returns the 201 body. No balance is checked. */
export function createSplit({ state, user, body }) {
  const total = amount(body);
  const handles = participantHandles(body);
  const text = note(body);
  const participants = handles.map((handle) => userWithHandle(state, handle));
  const shares = equalShares(total, participants.length);
  const createdAt = state.nextTimestamp();
  const requests = participants
    .map((payer, i) => ({ payer, share: shares[i] }))
    .filter(({ payer }) => payer.id !== user.id)
    .map(({ payer, share }) =>
      addPendingRequest(state, { requester: user, payer, amount: share, note: text, createdAt }));
  const split = {
    id: state.newId('sp', (id) => state.splits.has(id)),
    requesterId: user.id,
    amount: total,
    note: text,
    shares: handles.map((handle, i) => ({ handle, amount: shares[i] })),
    requestIds: requests.map((r) => r.id),
    createdAt,
  };
  state.addSplit(split);
  return splitView(state, split);
}
