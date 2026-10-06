// The whole service state, held in memory, and the one gate through which money moves.
//
// JavaScript runs each request handler's synchronous part without interleaving, so a
// method here that checks and then mutates cannot be interrupted by another request.
// Every balance change goes through `movePayments`, which checks the §1 invariants for
// the whole batch before it applies any of it, and every request status change goes
// through `closeRequest`, so a request leaves `pending` once and moves money at most once.
//
// Stage 2 holds: an open authorization reserves its remaining amount on the payer's wallet.
// `available = total − held` must never be negative, so the two ways it can fall — money
// leaving (movePayments) and a new hold (openAuthorization) — both check `availableOf`.
// Authorization closes go through `closeAuthorization`, which keeps the set of
// open (holding) authorizations exact; `expireDue` closes those whose time has come.
import { randomBytes } from 'node:crypto';
import {
  authorizationExpired, authorizationNotOpen, captureExceedsAuthorization, historicalOverdraft,
  insufficientFunds, refundExceedsPayment, requestNotPending,
} from './errors.js';
import { currentRevision, firstOverdraft } from './ledger.js';
import {
  DEFAULT_AUTHORIZATION_TTL_SECONDS, MAX_CLOCK_MS, TERMINAL_STATUSES, expiryOf, isDue, isWithinRefundCap, remainingOf,
} from './model.js';

export class State {
  constructor({ currency, minorUnits, authorizationTtlSeconds = DEFAULT_AUTHORIZATION_TTL_SECONDS }) {
    this.currency = currency;
    this.minorUnits = minorUnits;
    this.authorizationTtlSeconds = authorizationTtlSeconds;
    this.users = new Map(); // id -> user
    this.userIdByEmail = new Map(); // lowercased email -> id
    this.userIdByHandle = new Map(); // handle -> id
    this.operatorIds = new Set();
    this.tokens = new Map(); // bearer token -> user id
    this.payments = []; // creation order, oldest first
    this.paymentsById = new Map();
    this.requests = []; // creation order, oldest first
    this.requestsById = new Map();
    this.splits = new Map(); // id -> split
    this.settlements = new Map(); // id -> settlement
    this.authorizations = []; // creation order, oldest first
    this.authorizationsById = new Map();
    this.openAuthorizations = new Set(); // the authorizations that hold funds
    this.idempotency = new Map(); // scope -> { fingerprint, response }
    this.snapshots = new Map(); // statement snapshot token -> frozen statement (stage 3; until reset)
    this.refundedBy = new Map(); // payment id -> total refunded of it (stage 4; follows the payments)
    this.correctionBatchIds = new Set(); // ids of the correction batches recorded (stage 4; follows the revisions)
    this.lastTimestampMs = 0;
    this.timestampFloorMs = 0; // the earliest the next record may be stamped (see nextTimestamp)
    this.paymentSequence = 0; // payments created so far through the API; orders their ids
    this.recordSequence = 0; // revisions recorded so far, numbered in recording order (snapshots)
    this.journal = null; // undo steps of the running transaction, newest last
  }

  /**
   * Runs `operation` so that it changes everything or nothing: if it throws anything,
   * an ApiError or an unexpected error, every change it made to this State is undone.
   * A failed write therefore never leaves money moved or a key recorded.
   */
  transaction(operation) {
    const outer = this.journal;
    this.journal = [];
    try {
      const result = operation();
      if (outer) outer.push(...this.journal);
      return result;
    } catch (err) {
      for (const undo of this.journal.reverse()) undo();
      throw err;
    } finally {
      this.journal = outer ?? null;
    }
  }

  /** Records how to undo a change, when a transaction is running. */
  remember(undo) {
    if (this.journal) this.journal.push(undo);
  }

  /** A creation time that never runs backwards, so creation order and created_at agree. */
  nextTimestamp() {
    const before = this.lastTimestampMs;
    this.remember(() => { this.lastTimestampMs = before; });
    this.lastTimestampMs = Math.max(Date.now(), this.lastTimestampMs, this.timestampFloorMs);
    return this.lastTimestampMs;
  }

  /** The next recording number: every revision gets one, in the order it is recorded. */
  nextRecordSeq() {
    const before = this.recordSequence;
    this.remember(() => { this.recordSequence = before; });
    this.recordSequence += 1;
    return this.recordSequence;
  }

  /**
   * A payment id that sorts in creation order (stage 3: statement ties order by payment id, and
   * two payments can share a millisecond): a fixed-width base-36 sequence, then random characters.
   */
  newPaymentId() {
    const before = this.paymentSequence;
    this.remember(() => { this.paymentSequence = before; });
    for (;;) {
      this.paymentSequence += 1;
      const id = `p_${this.paymentSequence.toString(36).padStart(9, '0')}${randomBytes(3).toString('base64url')}`;
      if (!this.paymentsById.has(id)) return id;
    }
  }

  /** A fresh opaque id that collides with no existing id of that kind. */
  newId(prefix, taken) {
    for (;;) {
      const id = `${prefix}_${randomBytes(9).toString('base64url')}`;
      if (!taken(id)) return id;
    }
  }

  // ---- users and sessions ----------------------------------------------

  addUser(user) {
    this.users.set(user.id, user);
    this.userIdByEmail.set(user.email.toLowerCase(), user.id);
    this.userIdByHandle.set(user.handle, user.id);
    this.remember(() => {
      this.users.delete(user.id);
      this.userIdByEmail.delete(user.email.toLowerCase());
      this.userIdByHandle.delete(user.handle);
    });
  }

  userByEmail(email) {
    return this.users.get(this.userIdByEmail.get(email.toLowerCase()));
  }

  userByHandle(handle) {
    return this.users.get(this.userIdByHandle.get(handle));
  }

  issueToken(userId) {
    const token = randomBytes(32).toString('base64url');
    this.tokens.set(token, userId);
    this.remember(() => this.tokens.delete(token));
    return token;
  }

  userForToken(token) {
    return this.users.get(this.tokens.get(token));
  }

  isOperator(userId) {
    return this.operatorIds.has(userId);
  }

  // ---- the money gate ----------------------------------------------------

  /**
   * The one place a balance changes: applies the net change per wallet, or refuses with
   * insufficient_funds if any wallet's available would fall below zero. Balances are set once,
   * from net totals, so no wallet passes through a negative value.
   */
  shiftBalances(net) {
    for (const [userId, delta] of net) {
      if (this.availableOf(userId) + delta < 0) throw insufficientFunds();
    }
    for (const [userId, delta] of net) {
      const user = this.users.get(userId);
      const before = user.balance;
      this.remember(() => { user.balance = before; });
      user.balance += delta;
    }
  }

  /**
   * Records one payment per transfer and applies all of them, or none.
   * Fails with insufficient_funds when any wallet would end below zero after the
   * batch's incoming and outgoing transfers; balances are set once, from net totals,
   * so no wallet passes through a negative value. No wallet can exceed 2^53: balances are
   * never negative and the fixture's total is capped there (fixture.js).
   */
  movePayments(transfers, { requestId = null, settlementId = null, authorizationId = null, refundOf = null, createdAt }) {
    const net = new Map();
    for (const t of transfers) {
      net.set(t.fromUserId, (net.get(t.fromUserId) ?? 0) - t.amount);
      net.set(t.toUserId, (net.get(t.toUserId) ?? 0) + t.amount);
    }
    this.shiftBalances(net);
    return transfers.map((t) => {
      const payment = {
        id: this.newPaymentId(),
        fromUserId: t.fromUserId,
        toUserId: t.toUserId,
        amount: t.amount,
        note: t.note,
        visibility: t.visibility,
        requestId,
        settlementId,
        authorizationId,
        refundOf,
        createdAt,
        createdFrac: '', // the service stamps whole milliseconds (clock.js)
        // Stage 3: revision 1 is the payment as made; corrections append later revisions.
        revisions: [{
          revision: 1, amount: t.amount, effectiveAt: createdAt, effectiveFrac: '', recordedAt: createdAt, recordedFrac: '',
          reason: '', correctionBatchId: null, seq: this.nextRecordSeq(),
        }],
      };
      this.addPayment(payment);
      return payment;
    });
  }

  /**
   * The one way out of `pending`: to exactly one of paid, declined or cancelled.
   * Paying moves the money through movePayments and links the payment; if that fails
   * (insufficient funds) the request stays pending. Returns the payment, or null.
   */
  closeRequest(request, status, { visibility } = {}) {
    if (!TERMINAL_STATUSES.includes(status)) throw new Error(`${status} is not a terminal status`);
    if (request.status !== 'pending') throw requestNotPending();
    this.remember(() => {
      request.status = 'pending';
      request.paymentId = null;
    });
    if (status !== 'paid') {
      request.status = status;
      return null;
    }
    const [payment] = this.movePayments([{
      fromUserId: request.payerId,
      toUserId: request.requesterId,
      amount: request.amount,
      note: request.note,
      visibility,
    }], { requestId: request.id, createdAt: this.nextTimestamp() });
    request.status = 'paid';
    request.paymentId = payment.id;
    return payment;
  }

  // ---- corrections (stage 3) --------------------------------------------

  /**
   * The one gate for corrections (stage 3, 4): appends one revision to each payment, all
   * recorded at one instant, strictly after every payment's previous revision, and moves each
   * difference between that payment's two wallets in the same step: an increase debits the
   * sender, a decrease the receiver. A single correction is a batch of one, with no batch id. Refused, judged on the combined effect of every revision:
   * 1. insufficient_funds when any debited wallet cannot afford it now (from available);
   * 2. otherwise historical_overdraft when, under the latest revisions, any party's total or
   *    available would be negative at some past boundary (one pass per party).
   * The caller has already checked each item (ids, immutability, revisions, refunds) and runs
   * this in a transaction, so a refusal leaves balances, revisions and everything else as they were.
   */
  correctPayments(items, { batchId = null } = {}) {
    const net = new Map();
    for (const { payment, amount } of items) {
      const delta = amount - currentRevision(payment).amount;
      net.set(payment.fromUserId, (net.get(payment.fromUserId) ?? 0) - delta);
      net.set(payment.toUserId, (net.get(payment.toUserId) ?? 0) + delta);
    }
    // Checked before anything changes, so the refusal precedes the clock and revision updates.
    this.shiftBalances(net);
    // Recorded times for one payment strictly increase, and the service clock follows.
    const recordedAt = Math.max(this.nextTimestamp(), ...items.map(({ payment }) => currentRevision(payment).recordedAt + 1));
    const clockBefore = this.lastTimestampMs;
    this.remember(() => { this.lastTimestampMs = clockBefore; });
    this.lastTimestampMs = recordedAt;
    const revisions = items.map(({ payment, amount, effectiveAt, effectiveFrac, reason }) => {
      const revision = {
        revision: currentRevision(payment).revision + 1, amount, effectiveAt, effectiveFrac, recordedAt, recordedFrac: '',
        reason, correctionBatchId: batchId, seq: this.nextRecordSeq(),
      };
      const revisionsBefore = payment.revisions;
      this.remember(() => { payment.revisions = revisionsBefore; });
      payment.revisions = [...payment.revisions, revision];
      return revision;
    });
    if (batchId !== null) this.noteCorrectionBatch(batchId);
    for (const userId of net.keys()) {
      if (firstOverdraft(this, userId) !== null) throw historicalOverdraft();
    }
    return revisions;
  }

  // ---- refunds (stage 4) -------------------------------------------------

  /** What has been refunded of `payment` so far. */
  refundedOf(payment) {
    return this.refundedBy.get(payment.id) ?? 0;
  }

  /**
   * Refunds stay within the payment's current corrected amount (stage 4): refused with
   * refund_exceeds_payment when `refunded` (the refunds so far plus any new one) is above `amount`.
   */
  requireRefundsWithin(refunded, amount) {
    if (!isWithinRefundCap(refunded, amount)) throw refundExceedsPayment();
  }

  /**
   * Refunds `amount` of `target` (the caller is its receiver; it is not a refund): a new payment
   * back from receiver to sender, from the receiver's available funds, linked by refund_of, with
   * the target's note and visibility. It reopens nothing and joins no settlement.
   */
  refundPayment(target, amount) {
    this.requireRefundsWithin(this.refundedOf(target) + amount, currentRevision(target).amount);
    const [refund] = this.movePayments([{
      fromUserId: target.toUserId,
      toUserId: target.fromUserId,
      amount,
      note: target.note,
      visibility: target.visibility,
    }], { refundOf: target.id, createdAt: this.nextTimestamp() });
    return refund;
  }

  // ---- holds and authorizations ----------------------------------------

  /** The sum of the user's open holds now (ledger.js heldAt answers the same question for any instant). */
  heldBy(userId) {
    let held = 0;
    for (const a of this.openAuthorizations) if (a.fromUserId === userId) held += remainingOf(a);
    return held;
  }

  /** What the user can spend: total − held. */
  availableOf(userId) {
    return this.users.get(userId).balance - this.heldBy(userId);
  }

  /** Closes every open authorization whose expires_at is at or before `now`, releasing its remainder. */
  expireDue(now) {
    for (const a of this.openAuthorizations) {
      // Expiry takes effect at expires_at, whenever the sweep notices it (stage 3).
      if (isDue(a, now)) this.closeAuthorization(a, 'expired', a.expiresAt, a.expiresFrac);
    }
  }

  /**
   * The one place an authorization closes: captured, voided or expired, at `closedAt` (the
   * event's time, with its fraction beyond the millisecond). Keeps the set of holds in step and
   * records closed_at (stage 3).
   */
  closeAuthorization(authorization, status, closedAt, closedFrac = '') {
    const before = { status: authorization.status, closedAt: authorization.closedAt, closedFrac: authorization.closedFrac };
    this.remember(() => {
      Object.assign(authorization, before);
      if (before.status === 'open') this.openAuthorizations.add(authorization);
    });
    authorization.status = status;
    authorization.closedAt = closedAt;
    authorization.closedFrac = closedFrac;
    this.openAuthorizations.delete(authorization);
  }

  /** Places a hold of `amount` on the payer; refused when it exceeds what they can spend. */
  openAuthorization({ fromUserId, toUserId, amount, note, visibility }) {
    if (this.availableOf(fromUserId) < amount) throw insufficientFunds();
    const createdAt = this.nextTimestamp();
    const authorization = {
      id: this.newId('a', (id) => this.authorizationsById.has(id)),
      fromUserId, toUserId, amount, note, visibility,
      capturedAmount: 0,
      status: 'open',
      expiresAt: expiryOf(createdAt, this.authorizationTtlSeconds),
      expiresFrac: '',
      paymentIds: [],
      seeded: false,
      createdAt,
      createdFrac: '',
      closedAt: null,
      closedFrac: '',
    };
    this.addAuthorization(authorization);
    return authorization;
  }

  /** Refuses any move out of a closed authorization: expired first, then any other closed state. */
  requireOpen(authorization) {
    if (authorization.status === 'expired') throw authorizationExpired();
    if (authorization.status !== 'open') throw authorizationNotOpen();
  }

  /**
   * Captures `amount` (default: the remainder) as a payment from payer to receiver. A final
   * capture, or one that takes the whole remainder, closes the authorization and releases
   * what is left in the same step; otherwise the remainder stays held.
   */
  captureAuthorization(authorization, { amount = null, final = true }) {
    this.requireOpen(authorization);
    const remaining = remainingOf(authorization);
    const captured = amount ?? remaining;
    if (captured > remaining) throw captureExceedsAuthorization();
    const before = { capturedAmount: authorization.capturedAmount, paymentIds: authorization.paymentIds };
    this.remember(() => Object.assign(authorization, before));
    const at = this.nextTimestamp();
    authorization.capturedAmount += captured;
    authorization.paymentIds = [...authorization.paymentIds];
    if (final || captured === remaining) this.closeAuthorization(authorization, 'captured', at);
    // The hold no longer covers the captured part, so the payer's available is unchanged by it.
    const [payment] = this.movePayments([{
      fromUserId: authorization.fromUserId,
      toUserId: authorization.toUserId,
      amount: captured,
      note: authorization.note,
      visibility: authorization.visibility,
    }], { authorizationId: authorization.id, createdAt: at });
    authorization.paymentIds.push(payment.id);
    return payment;
  }

  /** Releases the remainder. Voiding a voided authorization is a no-op; captured or expired is 409. */
  voidAuthorization(authorization) {
    if (authorization.status === 'voided') return;
    if (authorization.status !== 'open') throw authorizationNotOpen();
    this.closeAuthorization(authorization, 'voided', this.nextTimestamp());
  }

  addAuthorization(authorization) {
    this.authorizations.push(authorization);
    this.authorizationsById.set(authorization.id, authorization);
    if (authorization.status === 'open') this.openAuthorizations.add(authorization);
    this.remember(() => {
      this.authorizations.pop();
      this.authorizationsById.delete(authorization.id);
      this.openAuthorizations.delete(authorization);
    });
  }

  /** Adds a payment, keeping the refund totals and the correction batch ids in step with it. */
  addPayment(payment) {
    this.payments.push(payment);
    this.paymentsById.set(payment.id, payment);
    this.remember(() => {
      this.payments.pop();
      this.paymentsById.delete(payment.id);
    });
    if (payment.refundOf !== null) {
      const before = this.refundedBy.get(payment.refundOf);
      this.refundedBy.set(payment.refundOf, (before ?? 0) + payment.amount);
      this.remember(() => (before === undefined ? this.refundedBy.delete(payment.refundOf) : this.refundedBy.set(payment.refundOf, before)));
    }
    for (const rev of payment.revisions) if (rev.correctionBatchId !== null) this.noteCorrectionBatch(rev.correctionBatchId);
  }

  /** Records that a correction batch id is in use, undoably. */
  noteCorrectionBatch(batchId) {
    if (this.correctionBatchIds.has(batchId)) return;
    this.correctionBatchIds.add(batchId);
    this.remember(() => this.correctionBatchIds.delete(batchId));
  }

  addRequest(request) {
    this.requests.push(request);
    this.requestsById.set(request.id, request);
    this.remember(() => {
      this.requests.pop();
      this.requestsById.delete(request.id);
    });
  }

  addSplit(split) {
    this.splits.set(split.id, split);
    this.remember(() => this.splits.delete(split.id));
  }

  addSettlement(settlement) {
    this.settlements.set(settlement.id, settlement);
    this.remember(() => this.settlements.delete(settlement.id));
  }

  // ---- statement snapshots (stage 3) ------------------------------------

  addSnapshot(token, snapshot) {
    this.snapshots.set(token, snapshot);
    this.remember(() => this.snapshots.delete(token));
  }

  // ---- idempotency records ---------------------------------------------

  idempotencyRecord(scope) {
    return this.idempotency.get(scope);
  }

  saveIdempotencyRecord(scope, record) {
    this.idempotency.set(scope, record);
    this.remember(() => this.idempotency.delete(scope));
  }
}

/** The single swappable reference to the live state; reset and import replace it whole. */
export const store = { current: new State({ currency: 'EUR', minorUnits: 2 }) };
