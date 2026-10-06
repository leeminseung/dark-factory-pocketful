// The rules a complete set of service records must satisfy, and building a State from them.
//
// Both ways to replace the state — POST /_test/reset (fixture.js) and POST /_test/import
// (snapshot.js) — read their input into the same plain records, have checkRecords judge
// them, and only then build a State. So every value rule (model.js) and every rule between
// records is written once here, and a rejected input never touches the live state.
import { invalid } from './errors.js';
import {
  charCount, isBalance, isEmail, isHandle, isId, isMinorUnits, isNote, isRecordAmount, isRequestStatus,
  isTimestampMs, isTotalWithinLimit, isVisibility,
} from './model.js';
import { paymentView, requestView, settlementView, splitView } from './views.js';
import { State } from './state.js';
import { canonicalJson, parseJson } from './json.js';
import { MAX_IDEMPOTENCY_KEY_CHARS, isPlainObject } from './validate.js';

/*
 * Records (camelCase, as State holds them):
 *   currency, minorUnits, lastTimestampMs
 *   users:        { id, email, displayName, handle, balance }   (+ passwordHash once hashed)
 *   operatorIds:  [userId]
 *   tokens:       [{ token, userId }]
 *   payments:     { id, fromUserId, toUserId, amount, note, visibility, requestId, settlementId, createdAt }
 *   requests:     { id, requesterId, payerId, amount, note, status, paymentId, seeded, createdAt }
 *                 (seeded: came from a fixture, which may say `paid` without naming a payment)
 *   splits:       { id, requesterId, amount, note, shares: [{ handle, amount }], requestIds, createdAt }
 *   settlements:  { id, committedAt, paymentIds }
 *   idempotency:  [{ scope, fingerprint, response }]
 */

function check(condition, message) {
  if (!condition) throw invalid(message);
}

const isOptionalId = (v) => v === null || isId(v);
const isList = (v, item) => Array.isArray(v) && v.every(item);

function requireUnique(values, what) {
  check(new Set(values).size === values.length, `duplicate ${what}`);
}

/** Throws 422 validation_failed at the first rule the records break. */
export function checkRecords(r) {
  check(typeof r.currency === 'string' && r.currency !== '', 'currency must be a non-empty string');
  check(isMinorUnits(r.minorUnits), 'minor_units must be 0, 2 or 3');
  check(isTimestampMs(r.lastTimestampMs), 'last timestamp is invalid');

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
  r.tokens.forEach((t, i) => check(typeof t.token === 'string' && t.token !== '' && isUser(t.userId), `tokens[${i}] is invalid`));
  requireUnique(r.tokens.map((t) => t.token), 'token');

  r.payments.forEach((p, i) => {
    const at = `payments[${i}]`;
    check(isId(p.id), `${at}.id must be 1 to 64 characters`);
    parties(p.fromUserId, p.toUserId, at);
    check(isRecordAmount(p.amount), `${at}.amount is out of range`);
    check(isNote(p.note), `${at}.note is invalid`);
    check(isVisibility(p.visibility), `${at}.visibility is invalid`);
    check(isOptionalId(p.requestId) && isOptionalId(p.settlementId), `${at} links are invalid`);
    check(isTimestampMs(p.createdAt), `${at} timestamp is invalid`);
  });
  requireUnique(r.payments.map((p) => p.id), 'payment id');

  r.requests.forEach((q, i) => {
    const at = `requests[${i}]`;
    check(isId(q.id), `${at}.id must be 1 to 64 characters`);
    parties(q.requesterId, q.payerId, at);
    check(isRecordAmount(q.amount), `${at}.amount is out of range`);
    check(isNote(q.note), `${at}.note is invalid`);
    check(isRequestStatus(q.status), `${at}.status is invalid`);
    check(isOptionalId(q.paymentId) && isTimestampMs(q.createdAt), `${at} fields are invalid`);
    check(typeof q.seeded === 'boolean', `${at}.seeded must be a boolean`);
  });
  requireUnique(r.requests.map((q) => q.id), 'request id');
  const requestIds = new Set(r.requests.map((q) => q.id));
  const paymentIds = new Set(r.payments.map((p) => p.id));

  const isShare = (sh) => isPlainObject(sh) && isHandle(sh.handle) && isRecordAmount(sh.amount);
  r.splits.forEach((sp, i) => {
    const at = `splits[${i}]`;
    check(isId(sp.id) && isUser(sp.requesterId), `${at} ids are invalid`);
    check(isRecordAmount(sp.amount) && isNote(sp.note) && isTimestampMs(sp.createdAt), `${at} fields are invalid`);
    check(isList(sp.shares, isShare) && isList(sp.requestIds, (id) => requestIds.has(id)), `${at} parts are invalid`);
  });
  requireUnique(r.splits.map((sp) => sp.id), 'split id');

  r.settlements.forEach((st, i) => {
    const at = `settlements[${i}]`;
    check(isId(st.id) && isTimestampMs(st.committedAt), `${at} fields are invalid`);
    check(isList(st.paymentIds, (id) => paymentIds.has(id)), `${at}.payment_ids are invalid`);
  });
  requireUnique(r.settlements.map((st) => st.id), 'settlement id');

  r.idempotency.forEach((rec, i) => {
    check(isIdempotencyScope(rec.scope, isUser), `idempotency[${i}].scope is invalid`);
    check(isCanonicalObjectText(rec.fingerprint), `idempotency[${i}].fingerprint is invalid`);
    check(isPlainObject(rec.response) && rec.response.status === 201 && isPlainObject(rec.response.body),
      `idempotency[${i}].response is invalid`);
  });
  requireUnique(r.idempotency.map((rec) => rec.scope), 'idempotency scope');

  checkLinks(r);
  checkReplays(r);
}

/** JSON text of an object, already in the canonical form runIdempotent writes. */
function isCanonicalObjectText(text) {
  if (typeof text !== 'string') return false;
  try {
    const value = parseJson(text);
    return isPlainObject(value) && canonicalJson(value) === text;
  } catch {
    return false;
  }
}

/** A scope as runIdempotent writes it: [userId, method, route, params, key], canonical. */
function isIdempotencyScope(scope, isUser) {
  if (!isCanonicalArrayText(scope)) return false;
  const parts = JSON.parse(scope);
  if (parts.length !== 5) return false;
  const [userId, method, route, params, key] = parts;
  return isUser(userId) && typeof method === 'string' && typeof route === 'string'
    && isPlainObject(params) && Object.values(params).every((v) => typeof v === 'string')
    && typeof key === 'string' && key !== '' && charCount(key) <= MAX_IDEMPOTENCY_KEY_CHARS;
}

function isCanonicalArrayText(text) {
  if (typeof text !== 'string') return false;
  try {
    const value = parseJson(text);
    return Array.isArray(value) && canonicalJson(value) === text;
  } catch {
    return false;
  }
}

/**
 * Rules between records: every link names a record that links back, so a request can be
 * paid at most once (§1), a split's shares sum to its amount and match its requests (§8),
 * and a settlement and its members name each other with one commit time (§11).
 */
function checkLinks(r) {
  const users = new Map(r.users.map((u) => [u.id, u]));
  const payments = new Map(r.payments.map((p) => [p.id, p]));
  const requests = new Map(r.requests.map((q) => [q.id, q]));
  const settlements = new Map(r.settlements.map((st) => [st.id, st]));

  for (const p of r.payments) {
    if (p.requestId !== null) {
      const q = requests.get(p.requestId);
      check(q && q.status === 'paid' && q.paymentId === p.id && q.payerId === p.fromUserId
        && q.requesterId === p.toUserId && q.amount === p.amount, `payment ${p.id} names a request that is not paid by it`);
    }
    if (p.settlementId !== null) {
      const st = settlements.get(p.settlementId);
      check(st && st.paymentIds.includes(p.id) && st.committedAt === p.createdAt && p.requestId === null,
        `payment ${p.id} names a settlement it is not a member of`);
    }
  }
  for (const q of r.requests) {
    if (q.paymentId !== null) {
      check(q.status === 'paid' && payments.get(q.paymentId)?.requestId === q.id,
        `request ${q.id} names a payment that did not pay it`);
    } else {
      check(q.status !== 'paid' || q.seeded, `request ${q.id} is paid but names no payment`);
    }
  }
  for (const st of r.settlements) {
    check(st.paymentIds.length > 0 && new Set(st.paymentIds).size === st.paymentIds.length
      && st.paymentIds.every((id) => payments.get(id).settlementId === st.id),
      `settlement ${st.id} members do not name it`);
  }
  for (const sp of r.splits) {
    const requester = users.get(sp.requesterId);
    const total = sp.shares.reduce((sum, share) => sum + share.amount, 0);
    const handles = sp.shares.map((share) => share.handle);
    const others = sp.shares.filter((share) => share.handle !== requester.handle);
    const matches = others.length === sp.requestIds.length && others.every((share, i) => {
      const q = requests.get(sp.requestIds[i]);
      return q.requesterId === sp.requesterId && users.get(q.payerId).handle === share.handle
        && q.amount === share.amount;
    });
    check(sp.shares.length > 0 && total === sp.amount && new Set(handles).size === handles.length && matches,
      `split ${sp.id} shares do not match its amount and requests`);
  }
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

/*
 * Stored replays (stage-1 §7, §10): a completed idempotent write keeps its request body
 * (fingerprint) and its original response, which a replay hands back unchanged. So the stored
 * response must be exactly the receipt the service gave when the write happened: it is rebuilt
 * from the records with the same views the API uses, at its moment of creation (a request still
 * pending), and must equal it field for field.
 * One rule per idempotent route also ties the receipt to the scope's user and to the request body.
 */

/** Equal as JSON values. */
const sameReceipt = (stored, expected) => canonicalJson(stored) === canonicalJson(expected);

const REPLAY_RULES = {
  '/payments': ({ userId, body, receipt, records, view }) => {
    const p = records.payments.get(receipt.payment_id);
    return Boolean(p) && p.fromUserId === userId && p.requestId === null && p.settlementId === null
      && body.amount === p.amount
      && records.users.get(p.toUserId).handle === body.to_handle
      && sameReceipt(receipt, view.payment(p));
  },
  '/requests/:id/pay': ({ userId, params, receipt, records, view }) => {
    const p = records.payments.get(receipt.payment_id);
    return Boolean(p) && p.fromUserId === userId && p.requestId === params.id && sameReceipt(receipt, view.payment(p));
  },
  '/requests': ({ userId, body, receipt, records, view }) => {
    const q = records.requests.get(receipt.request_id);
    return Boolean(q) && q.requesterId === userId && body.amount === q.amount
      && records.users.get(q.payerId).handle === body.payer_handle
      && sameReceipt(receipt, view.request(q));
  },
  '/splits': ({ userId, body, receipt, records, view }) => {
    const sp = records.splits.get(receipt.split_id);
    return Boolean(sp) && sp.requesterId === userId && body.amount === sp.amount
      && sameReceipt(receipt, view.split(sp));
  },
  '/settlements': ({ userId, receipt, records, view }) => {
    const st = records.settlements.get(receipt.settlement_id);
    return records.operators.has(userId) && Boolean(st) && sameReceipt(receipt, view.settlement(st));
  },
};

/**
 * The record each kind of write made, as named by its receipt. Every write made its own record,
 * so no two receipts may name the same one: a receipt copied into another scope is not a write
 * that happened (stage-4 final review R8).
 */
const WRITTEN_RECORD = {
  '/payments': (receipt) => `payment ${receipt.payment_id}`,
  '/requests/:id/pay': (receipt) => `payment ${receipt.payment_id}`,
  '/requests': (receipt) => `request ${receipt.request_id}`,
  '/splits': (receipt) => `split ${receipt.split_id}`,
  '/settlements': (receipt) => `settlement ${receipt.settlement_id}`,
};

/** The receipts each kind of write returned when it happened, built with the API's own views. */
function creationViews(r, records) {
  const atCreation = {
    request: (q) => ({ ...q, status: 'pending', paymentId: null }),
  };
  // A state-shaped object over the records, as views.js reads it; requests as they were created.
  const shape = {
    currency: r.currency,
    users: records.users,
    paymentsById: records.payments,
    requestsById: new Map([...records.requests].map(([id, q]) => [id, atCreation.request(q)])),
  };
  return {
    payment: (p) => paymentView(shape, p),
    request: (q) => requestView(shape, atCreation.request(q)),
    split: (sp) => splitView(shape, sp),
    settlement: (st) => settlementView(shape, st),
  };
}

function checkReplays(r) {
  const index = (list) => new Map(list.map((x) => [x.id, x]));
  const records = {
    users: index(r.users), payments: index(r.payments), requests: index(r.requests),
    splits: index(r.splits), settlements: index(r.settlements), operators: new Set(r.operatorIds),
  };
  const view = creationViews(r, records);
  const written = [];
  r.idempotency.forEach((rec, i) => {
    const [userId, , route, params] = JSON.parse(rec.scope);
    const rule = REPLAY_RULES[route];
    const ok = rule && rule({ userId, params, body: JSON.parse(rec.fingerprint), receipt: rec.response.body, records, view });
    check(ok, `idempotency[${i}] is not the receipt the service gave for that write`);
    written.push(WRITTEN_RECORD[route](rec.response.body));
  });
  requireUnique(written, 'record named by a receipt');
}
