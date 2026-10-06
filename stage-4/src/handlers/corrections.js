// Payment corrections (stage 3), operator correction batches (stage 4) and revision history.
import { instantKey, parseInstant } from '../clock.js';
import { forbidden, invalid, notFound } from '../errors.js';
import { MAX_BATCH_CORRECTIONS, MIN_TIMESTAMP_MS, isIntegralNumber, isReason, isRecordAmount } from '../model.js';
import { isPlainObject } from '../validate.js';
import { correctionBatchView, revisionView } from '../views.js';

/**
 * A correction's terms: every field required, every invalid one 422 (stage 3 "Invalid input is
 * 422 validation_failed"): expected_revision a positive integer, amount an integer 0..1000000000
 * (zero reverses the payment), effective_at an RFC 3339 instant not later than now, reason a
 * string of 1..200 characters.
 */
function correctionTerms(body, now) {
  const { expected_revision: expected, amount, effective_at: effectiveText, reason } = body;
  if (!isIntegralNumber(expected) || expected < 1) throw invalid('expected_revision must be a positive integer');
  if (!isRecordAmount(amount)) throw invalid('amount must be an integer from 0 to 1000000000');
  const effective = parseInstant(effectiveText);
  if (effective === null || effective.ms < MIN_TIMESTAMP_MS) throw invalid('effective_at must be an RFC 3339 instant with an offset');
  if (instantKey(effective.ms, effective.frac) > instantKey(now)) throw invalid('effective_at must not be later than now');
  if (!isReason(reason)) throw invalid('reason must be a string of 1 to 200 characters');
  return { expected, amount, effectiveAt: effective.ms, effectiveFrac: effective.frac, reason };
}

/** Idempotent: only the original sender corrects; returns the 201 body, the new revision. */
export function createCorrection({ state, user, body, params, now }) {
  // Settlement members, captures and refunds are out of reach of a single correction (the gate).
  const { items: [{ payment }], revisions: [revision] } = state.correctPayments([body], {
    kind: 'single',
    readItem: (entry) => {
      const terms = correctionTerms(entry, now);
      const target = state.paymentsById.get(params.id);
      if (!target) throw notFound('no such payment');
      if (target.fromUserId !== user.id) throw forbidden('only the payment\'s sender may correct it');
      return { payment: target, ...terms };
    },
  });
  return revisionView(payment, revision);
}

/** A batch's corrections: an array of 1..32 objects whose payment_ids are distinct. */
function batchEntries(body) {
  const entries = body.corrections;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_BATCH_CORRECTIONS
    || !entries.every(isPlainObject)) {
    throw invalid(`corrections must be an array of 1 to ${MAX_BATCH_CORRECTIONS} objects`);
  }
  const ids = entries.map((entry) => entry.payment_id).filter((id) => typeof id === 'string');
  if (new Set(ids).size !== ids.length) throw invalid('corrections must name distinct payment_ids');
  return entries;
}

/** One batch item's fields and payment; the gate then applies the correction rules to it. */
function batchItem(state, entry, now) {
  if (typeof entry.payment_id !== 'string') throw invalid('payment_id must be a string');
  const terms = correctionTerms(entry, now);
  const payment = state.paymentsById.get(entry.payment_id);
  if (!payment) throw notFound(`no such payment ${entry.payment_id}`);
  return { payment, ...terms };
}

/**
 * POST /correction-batches (stage 4), idempotent; the caller is already known to be an operator.
 * Errors in the stated order: the batch's shape, then (in State.correctPayments) each item in input
 * order, settlement completeness, current available funds, then history.
 */
export function createCorrectionBatch({ state, body, now }) {
  const { batchId, items, revisions } = state.correctPayments(batchEntries(body), {
    kind: 'batch', readItem: (entry) => batchItem(state, entry, now),
  });
  return correctionBatchView(batchId, items.map(({ payment }, i) => ({ payment, rev: revisions[i] })));
}

/** GET /payments/{id}/revisions: the two parties only; anyone else gets 404, even for a public payment. */
export function listRevisions({ state, user, params }) {
  const payment = state.paymentsById.get(params.id);
  if (!payment || (payment.fromUserId !== user.id && payment.toUserId !== user.id)) throw notFound('no such payment');
  return { status: 200, body: { revisions: payment.revisions.map((rev) => revisionView(payment, rev)) } };
}
