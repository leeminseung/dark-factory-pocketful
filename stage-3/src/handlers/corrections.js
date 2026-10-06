// Payment corrections and revision history (stage 3).
import { parseTimestamp } from '../clock.js';
import { forbidden, invalid, linkedPaymentImmutable, notFound, staleRevision } from '../errors.js';
import { currentRevision } from '../ledger.js';
import { MIN_TIMESTAMP_MS, isIntegralNumber, isReason, isRecordAmount } from '../model.js';
import { revisionView } from '../views.js';

/**
 * A correction's body: every field required, every invalid one 422 (stage 3 "Invalid input is
 * 422 validation_failed"): expected_revision a positive integer, amount an integer 0..1000000000
 * (zero reverses the payment), effective_at an RFC 3339 instant not later than now, reason a
 * string of 1..200 characters.
 */
function correctionTerms(body, now) {
  const { expected_revision: expected, amount, effective_at: effectiveText, reason } = body;
  if (!isIntegralNumber(expected) || expected < 1) throw invalid('expected_revision must be a positive integer');
  if (!isRecordAmount(amount)) throw invalid('amount must be an integer from 0 to 1000000000');
  const effectiveAt = parseTimestamp(effectiveText);
  if (effectiveAt === null || effectiveAt < MIN_TIMESTAMP_MS) throw invalid('effective_at must be an RFC 3339 instant with an offset');
  if (effectiveAt > now) throw invalid('effective_at must not be later than now');
  if (!isReason(reason)) throw invalid('reason must be a string of 1 to 200 characters');
  return { expected, amount, effectiveAt, reason };
}

/** Idempotent: only the original sender corrects; returns the 201 body, the new revision. */
export function createCorrection({ state, user, body, params, now }) {
  const terms = correctionTerms(body, now);
  const payment = state.paymentsById.get(params.id);
  if (!payment) throw notFound('no such payment');
  if (payment.fromUserId !== user.id) throw forbidden('only the payment\'s sender may correct it');
  if (payment.settlementId !== null || payment.authorizationId !== null) throw linkedPaymentImmutable();
  if (terms.expected !== currentRevision(payment).revision) throw staleRevision();
  const revision = state.correctPayment(payment, terms);
  return revisionView(payment, revision);
}

/** GET /payments/{id}/revisions: the two parties only; anyone else gets 404, even for a public payment. */
export function listRevisions({ state, user, params }) {
  const payment = state.paymentsById.get(params.id);
  if (!payment || (payment.fromUserId !== user.id && payment.toUserId !== user.id)) throw notFound('no such payment');
  return { status: 200, body: { revisions: payment.revisions.map((rev) => revisionView(payment, rev)) } };
}
