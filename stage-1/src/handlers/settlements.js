// POST /settlements (§11): an operator's batch of transfers, committed all together or not at all.
import { invalid, selfPayment } from '../errors.js';
import { counterparty, userWithHandle } from './handles.js';
import { amount, isPlainObject, note, visibility } from '../validate.js';
import { formatTimestamp } from '../clock.js';
import { paymentView } from '../views.js';

export const MAX_TRANSFERS = 32;

function transferList(body) {
  const transfers = body.transfers;
  if (!Array.isArray(transfers) || transfers.length < 1 || transfers.length > MAX_TRANSFERS) {
    throw invalid(`transfers must be an array of 1 to ${MAX_TRANSFERS} objects`);
  }
  return transfers;
}

/** Inside the batch a missing or wrongly typed handle is 422 validation_failed, not 400. */
function entryHandle(entry, name, at) {
  const handle = entry[name];
  if (typeof handle !== 'string') throw invalid(`${at}.${name} must be a string`);
  return handle;
}

/** One entry, checked with the ordinary payment rules; the first defective entry decides the error. */
function readTransfer(state, entry, at) {
  if (!isPlainObject(entry)) throw invalid(`${at} must be an object`);
  const transfer = { amount: amount(entry), note: note(entry), visibility: visibility(entry) };
  const from = userWithHandle(state, entryHandle(entry, 'from_handle', at));
  const to = counterparty(state, from, entryHandle(entry, 'to_handle', at), selfPayment);
  return { ...transfer, fromUserId: from.id, toUserId: to.id };
}

/** Idempotent: returns the 201 body. The caller is already known to be an operator. */
export function createSettlement({ state, body }) {
  const transfers = transferList(body).map((entry, i) => readTransfer(state, entry, `transfers[${i}]`));
  const settlementId = state.newId('st', (id) => state.settlements.some((s) => s.id === id));
  const committedAt = state.nextTimestamp();
  const payments = state.movePayments(transfers, { settlementId, createdAt: committedAt });
  state.settlements.push({ id: settlementId, committed_at_ms: committedAt, payment_ids: payments.map((p) => p.id) });
  return {
    settlement_id: settlementId,
    committed_at: formatTimestamp(committedAt),
    payments: payments.map((p) => paymentView(state, p)),
  };
}
