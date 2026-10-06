// The ledger's history (stage 3): balances, holds and statements as they stood at an instant,
// as far as the service knew at another.
//
// Every question here is asked of a book { users: Map, payments: [], authorizations: [] }: the
// live State, or the records of a reset or import being judged. Times are epoch ms.
//   as of T   (effective time) — what had happened by T;
//   known at K (recorded time) — using only what the service had recorded by K.
// For each payment the selected revision is its latest one recorded at or before K; a payment
// with none contributes nothing. Selected revisions apply at their effective time.

const NEVER = Number.POSITIVE_INFINITY;

/** The payment's latest revision recorded at or before `knownAt`, or null. */
export function selectedRevision(payment, knownAt = NEVER) {
  let chosen = null;
  for (const rev of payment.revisions) if (rev.recordedAt <= knownAt) chosen = rev;
  return chosen;
}

/** The latest revision: the payment as it stands now. */
export const currentRevision = (payment) => payment.revisions.at(-1);

/** The user's money movements under `knownAt`: { payment, rev, time, delta }, in no order. */
export function movements(book, userId, knownAt = NEVER) {
  const out = [];
  for (const payment of book.payments) {
    const sign = payment.fromUserId === userId ? -1 : payment.toUserId === userId ? 1 : 0;
    if (sign === 0) continue;
    const rev = selectedRevision(payment, knownAt);
    if (rev) out.push({ payment, rev, time: rev.effectiveAt, delta: sign * rev.amount });
  }
  return out;
}

/** Statement order: effective time, then payment id (stage 3). */
const byTimeThenId = (a, b) => a.time - b.time || (a.payment.id < b.payment.id ? -1 : a.payment.id > b.payment.id ? 1 : 0);

/** The user's total (balance) after every movement effective at or before `asOf`. */
export function balanceAt(book, userId, asOf, knownAt = NEVER) {
  let total = book.users.get(userId).openingBalance;
  for (const m of movements(book, userId, knownAt)) if (m.time <= asOf) total += m.delta;
  return total;
}

/**
 * An authorization that closed at or before its creation, with no capture, never held anything
 * (a fixture's closed one, model.js seededClosedAt).
 */
const neverHeld = (a) => a.closedAt !== null && a.closedAt <= a.createdAt && a.paymentIds.length === 0;

/**
 * What one authorization held at `t`, as known at `knownAt`. A hold starts at creation; each
 * capture reduces it at its time; it ends at its closing event (final capture, void) once that is
 * known, and at expires_at in any case, the deadline being known from creation on. One closed at
 * or before its creation (a fixture's closed one) never held anything.
 */
export function authorizationHoldAt(book, authorization, t, knownAt = NEVER) {
  const a = authorization;
  if (neverHeld(a)) return 0;
  if (a.createdAt > t || a.createdAt > knownAt) return 0;
  const closingKnown = a.closedAt !== null && a.closedAt <= knownAt ? a.closedAt : NEVER;
  if (Math.min(closingKnown, a.expiresAt) <= t) return 0;
  let captured = 0;
  for (const id of a.paymentIds) {
    const capture = book.paymentsById.get(id);
    if (capture.createdAt <= t && capture.createdAt <= knownAt) captured += capture.revisions[0].amount;
  }
  return Math.max(0, a.amount - captured);
}

/**
 * The user's held total at `t` as known at `knownAt` (history). The current held total is
 * State.heldBy: the remainders of the open authorizations, which this equals at now.
 */
export function heldAt(book, userId, t, knownAt = NEVER) {
  let held = 0;
  for (const a of book.authorizations) if (a.fromUserId === userId) held += authorizationHoldAt(book, a, t, knownAt);
  return held;
}

/** All four money fields of GET /me for one view: total = balance, available = total − held. */
export function moneyAt(book, userId, asOf, knownAt = NEVER) {
  const total = balanceAt(book, userId, asOf, knownAt);
  const held = heldAt(book, userId, asOf, knownAt);
  return { balance: total, total, available: total - held, held };
}

/**
 * The statement for [from, to) as known at `knownAt` (from null = the wallet's opening): the
 * opening balance just before `from`, entries oldest first with the balance after each, and the
 * closing balance just before `to`.
 */
export function statement(book, userId, { from, to, knownAt = NEVER }) {
  const all = movements(book, userId, knownAt).sort(byTimeThenId);
  let opening = book.users.get(userId).openingBalance;
  const entries = [];
  for (const m of all) {
    if (from !== null && m.time < from) opening += m.delta;
    else if (m.time < to) entries.push(m);
  }
  let running = opening;
  const withBalances = entries.map((m) => {
    running += m.delta;
    return { ...m, balanceAfter: running };
  });
  return { opening, entries: withBalances, closing: running };
}

/** One authorization's effect on the payer's held total, as (time, change) events, all known. */
function holdEvents(book, a) {
  if (neverHeld(a)) return [];
  const events = [{ time: a.createdAt, held: a.amount }];
  const close = Math.min(a.closedAt ?? NEVER, a.expiresAt);
  let captured = 0;
  for (const id of a.paymentIds) {
    const capture = book.paymentsById.get(id);
    if (capture.createdAt > close) continue;
    captured += capture.revisions[0].amount;
    events.push({ time: capture.createdAt, held: -capture.revisions[0].amount });
  }
  if (close !== NEVER) events.push({ time: close, held: -Math.max(0, a.amount - captured) });
  return events;
}

/**
 * The first instant at which the user's history, under the latest revisions, has a negative
 * total or available, or null if none does. Every effective time of a movement and every hold
 * event is a boundary, and each boundary counts every change at that instant together. One sorted
 * pass with running sums (stage 3 R2): `payments` may be the user's payments only, when known.
 */
export function firstOverdraft(book, userId, payments = book.payments) {
  const opening = book.users.get(userId).openingBalance;
  if (opening < 0) return { at: null, what: 'total' };
  const events = movements({ ...book, payments }, userId).map((m) => ({ time: m.time, total: m.delta, held: 0 }));
  for (const a of book.authorizations) {
    if (a.fromUserId === userId) for (const e of holdEvents(book, a)) events.push({ time: e.time, total: 0, held: e.held });
  }
  events.sort((x, y) => x.time - y.time);
  let total = opening;
  let held = 0;
  for (let i = 0; i < events.length;) {
    const at = events[i].time;
    for (; i < events.length && events[i].time === at; i += 1) {
      total += events[i].total;
      held += events[i].held;
    }
    if (total < 0) return { at, what: 'total' };
    if (total - held < 0) return { at, what: 'available' };
  }
  return null;
}
