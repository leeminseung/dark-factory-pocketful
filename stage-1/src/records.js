// The rules a complete set of service records must satisfy, and building a State from them.
//
// Both ways to replace the state — POST /_test/reset (fixture.js) and POST /_test/import
// (snapshot.js) — read their input into the same plain records, have checkRecords judge
// them, and only then build a State. So every value rule (model.js) and every rule between
// records is written once here, and a rejected input never touches the live state.
import { invalid } from './errors.js';
import {
  isBalance, isEmail, isHandle, isId, isMinorUnits, isNote, isRecordAmount, isRequestStatus,
  isTotalWithinLimit, isVisibility, isIntegralNumber,
} from './model.js';
import { State } from './state.js';
import { isPlainObject } from './validate.js';

/*
 * Records (camelCase, as State holds them):
 *   currency, minorUnits, lastTimestampMs
 *   users:        { id, email, displayName, handle, balance }   (+ passwordHash once hashed)
 *   operatorIds:  [userId]
 *   tokens:       [{ token, userId }]
 *   payments:     { id, fromUserId, toUserId, amount, note, visibility, requestId, settlementId, createdAt }
 *   requests:     { id, requesterId, payerId, amount, note, status, paymentId, createdAt }
 *   splits:       { id, requesterId, amount, note, shares: [{ handle, amount }], requestIds, createdAt }
 *   settlements:  { id, committedAt, paymentIds }
 *   idempotency:  [{ scope, fingerprint, response }]
 */

function check(condition, message) {
  if (!condition) throw invalid(message);
}

const isCount = (v) => isIntegralNumber(v) && v >= 0;
const isOptionalId = (v) => v === null || isId(v);
const isList = (v, item) => Array.isArray(v) && v.every(item);

function requireUnique(values, what) {
  check(new Set(values).size === values.length, `duplicate ${what}`);
}

/** Throws 422 validation_failed at the first rule the records break. */
export function checkRecords(r) {
  check(typeof r.currency === 'string' && r.currency !== '', 'currency must be a non-empty string');
  check(isMinorUnits(r.minorUnits), 'minor_units must be 0, 2 or 3');
  check(isCount(r.lastTimestampMs), 'last timestamp is invalid');

  r.users.forEach((u, i) => {
    check(isId(u.id), `users[${i}].id must be 1 to 64 characters`);
    check(isEmail(u.email), `users[${i}].email is not local@domain`);
    check(typeof u.displayName === 'string', `users[${i}].display_name must be a string`);
    check(isHandle(u.handle), `users[${i}].handle is not a valid handle`);
    check(isBalance(u.balance), `users[${i}].balance must be an integer from 0 to 2^53`);
  });
  requireUnique(r.users.map((u) => u.id), 'user id');
  requireUnique(r.users.map((u) => u.email.toLowerCase()), 'email');
  requireUnique(r.users.map((u) => u.handle), 'handle');
  check(isTotalWithinLimit(r.users.map((u) => u.balance)), 'balances exceed 2^53 in total');
  const userIds = new Set(r.users.map((u) => u.id));
  const isUser = (id) => userIds.has(id);
  const parties = (a, b, at) => check(isUser(a) && isUser(b) && a !== b, `${at} needs two different known users`);

  check(r.operatorIds.every(isUser), 'a settlement operator is not a known user');
  r.tokens.forEach((t, i) => check(typeof t.token === 'string' && isUser(t.userId), `tokens[${i}] is invalid`));

  r.payments.forEach((p, i) => {
    const at = `payments[${i}]`;
    check(isId(p.id), `${at}.id must be 1 to 64 characters`);
    parties(p.fromUserId, p.toUserId, at);
    check(isRecordAmount(p.amount), `${at}.amount is out of range`);
    check(isNote(p.note), `${at}.note is invalid`);
    check(isVisibility(p.visibility), `${at}.visibility is invalid`);
    check(isOptionalId(p.requestId) && isOptionalId(p.settlementId), `${at} links are invalid`);
    check(isCount(p.createdAt), `${at} timestamp is invalid`);
  });
  requireUnique(r.payments.map((p) => p.id), 'payment id');

  r.requests.forEach((q, i) => {
    const at = `requests[${i}]`;
    check(isId(q.id), `${at}.id must be 1 to 64 characters`);
    parties(q.requesterId, q.payerId, at);
    check(isRecordAmount(q.amount), `${at}.amount is out of range`);
    check(isNote(q.note), `${at}.note is invalid`);
    check(isRequestStatus(q.status), `${at}.status is invalid`);
    check(isOptionalId(q.paymentId) && isCount(q.createdAt), `${at} fields are invalid`);
  });
  requireUnique(r.requests.map((q) => q.id), 'request id');
  const requestIds = new Set(r.requests.map((q) => q.id));
  const paymentIds = new Set(r.payments.map((p) => p.id));

  const isShare = (sh) => isPlainObject(sh) && isHandle(sh.handle) && isRecordAmount(sh.amount);
  r.splits.forEach((sp, i) => {
    const at = `splits[${i}]`;
    check(isId(sp.id) && isUser(sp.requesterId), `${at} ids are invalid`);
    check(isRecordAmount(sp.amount) && isNote(sp.note) && isCount(sp.createdAt), `${at} fields are invalid`);
    check(isList(sp.shares, isShare) && isList(sp.requestIds, (id) => requestIds.has(id)), `${at} parts are invalid`);
  });
  requireUnique(r.splits.map((sp) => sp.id), 'split id');

  r.settlements.forEach((st, i) => {
    const at = `settlements[${i}]`;
    check(isId(st.id) && isCount(st.committedAt), `${at} fields are invalid`);
    check(isList(st.paymentIds, (id) => paymentIds.has(id)), `${at}.payment_ids are invalid`);
  });
  requireUnique(r.settlements.map((st) => st.id), 'settlement id');

  r.idempotency.forEach((rec, i) => {
    check(typeof rec.scope === 'string' && typeof rec.fingerprint === 'string', `idempotency[${i}] is invalid`);
    check(isPlainObject(rec.response) && isPlainObject(rec.response.body), `idempotency[${i}].response is invalid`);
  });
}

/** Builds a State from records that passed checkRecords; every user must have a passwordHash. */
export function stateFromRecords(r) {
  const state = new State({ currency: r.currency, minorUnits: r.minorUnits });
  state.lastTimestampMs = r.lastTimestampMs;
  for (const u of r.users) {
    state.addUser({
      id: u.id, email: u.email, passwordHash: u.passwordHash, displayName: u.displayName,
      handle: u.handle, balance: u.balance,
    });
  }
  for (const id of r.operatorIds) state.operatorIds.add(id);
  for (const { token, userId } of r.tokens) state.tokens.set(token, userId);
  for (const payment of r.payments) state.addPayment({ ...payment });
  for (const request of r.requests) state.addRequest({ ...request });
  for (const split of r.splits) state.addSplit({ ...split });
  for (const settlement of r.settlements) state.addSettlement({ ...settlement });
  for (const { scope, fingerprint, response } of r.idempotency) {
    state.saveIdempotencyRecord(scope, { fingerprint, response });
  }
  return state;
}
