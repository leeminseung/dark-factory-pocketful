// The whole service state, held in memory, and the one gate through which money moves.
//
// JavaScript runs each request handler's synchronous part without interleaving, so a
// method here that checks and then mutates cannot be interrupted by another request.
// Every balance change goes through `movePayments`, which checks the §1 invariants for
// the whole batch before it applies any of it, and every request status change goes
// through `closeRequest`, so a request leaves `pending` once and moves money at most once.
import { randomBytes } from 'node:crypto';
import { insufficientFunds, requestNotPending } from './errors.js';

export class State {
  constructor({ currency, minorUnits }) {
    this.currency = currency;
    this.minorUnits = minorUnits;
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
    this.idempotency = new Map(); // scope -> { fingerprint, response }
    this.lastTimestampMs = 0;
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
    this.lastTimestampMs = Math.max(Date.now(), this.lastTimestampMs);
    return this.lastTimestampMs;
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
   * Records one payment per transfer and applies all of them, or none.
   * Fails with insufficient_funds when any wallet would end below zero after the
   * batch's incoming and outgoing transfers; balances are set once, from net totals,
   * so no wallet passes through a negative value. No wallet can exceed 2^53: balances are
   * never negative and the fixture's total is capped there (fixture.js).
   */
  movePayments(transfers, { requestId = null, settlementId = null, createdAt }) {
    const net = new Map();
    for (const t of transfers) {
      net.set(t.fromUserId, (net.get(t.fromUserId) ?? 0) - t.amount);
      net.set(t.toUserId, (net.get(t.toUserId) ?? 0) + t.amount);
    }
    for (const [userId, delta] of net) {
      const after = this.users.get(userId).balance + delta;
      if (after < 0) throw insufficientFunds();
    }
    for (const [userId, delta] of net) {
      const user = this.users.get(userId);
      const before = user.balance;
      this.remember(() => { user.balance = before; });
      user.balance += delta;
    }
    return transfers.map((t) => {
      const payment = {
        id: this.newId('p', (id) => this.paymentsById.has(id)),
        fromUserId: t.fromUserId,
        toUserId: t.toUserId,
        amount: t.amount,
        note: t.note,
        visibility: t.visibility,
        requestId,
        settlementId,
        createdAt,
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

  addPayment(payment) {
    this.payments.push(payment);
    this.paymentsById.set(payment.id, payment);
    this.remember(() => {
      this.payments.pop();
      this.paymentsById.delete(payment.id);
    });
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
