// The rules a complete set of service records must satisfy, and building a State from them.
//
// Both ways to replace the state — POST /_test/reset (fixture.js) and POST /_test/import
// (snapshot.js) — read their input into the same plain records, have checkRecords judge
// them, and only then build a State. So every value rule (model.js) and every rule between
// records is written once here, and a rejected input never touches the live state.
import { invalid } from './errors.js';
import {
  charCount, expiryOf, isAuthorizationStatus, isClockMs, isDue, remainingOf, isBalance, isEmail, isTtlSeconds, isHandle, isId, isMinorUnits, isNote, isRecordAmount, isRequestStatus,
  isTimestampMs, isTotalWithinLimit, isVisibility,
} from './model.js';
import { formatTimestamp } from './clock.js';
import { State } from './state.js';
import { canonicalJson, parseJson } from './json.js';
import { MAX_IDEMPOTENCY_KEY_CHARS, isPlainObject } from './validate.js';

/*
 * Records (camelCase, as State holds them):
 *   currency, minorUnits, lastTimestampMs
 *   users:        { id, email, displayName, handle, balance }   (+ passwordHash once hashed)
 *   operatorIds:  [userId]
 *   tokens:       [{ token, userId }]
 *   authorizationTtlSeconds
 *   payments:     { id, fromUserId, toUserId, amount, note, visibility, requestId, settlementId,
 *                   authorizationId, createdAt }
 *   requests:     { id, requesterId, payerId, amount, note, status, paymentId, seeded, createdAt }
 *                 (seeded: came from a fixture, which may say `paid` without naming a payment)
 *   splits:       { id, requesterId, amount, note, shares: [{ handle, amount }], requestIds, createdAt }
 *   settlements:  { id, committedAt, paymentIds }
 *   authorizations: { id, fromUserId, toUserId, amount, capturedAmount, note, visibility, status,
 *                   expiresAt, paymentIds, seeded, createdAt }
 *                 (seeded: came from a fixture, whose `captured` ones name no payment)
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
  check(isClockMs(r.lastTimestampMs), 'last timestamp is out of range');
  check(isTtlSeconds(r.authorizationTtlSeconds), 'authorization_ttl_seconds must be a whole number of seconds from 1 to 3155760000');

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
    check(isOptionalId(p.requestId) && isOptionalId(p.settlementId) && isOptionalId(p.authorizationId),
      `${at} links are invalid`);
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

  r.authorizations.forEach((a, i) => {
    const at = `authorizations[${i}]`;
    check(isId(a.id), `${at}.id must be 1 to 64 characters`);
    parties(a.fromUserId, a.toUserId, at);
    check(isRecordAmount(a.amount) && a.amount >= 1, `${at}.amount is out of range`);
    check(isRecordAmount(a.capturedAmount) && a.capturedAmount <= a.amount, `${at}.captured amount is out of range`);
    check(isNote(a.note), `${at}.note is invalid`);
    check(isVisibility(a.visibility), `${at}.visibility is invalid`);
    check(isAuthorizationStatus(a.status), `${at}.status is invalid`);
    check(isTimestampMs(a.expiresAt) && isTimestampMs(a.createdAt), `${at} timestamps are invalid`);
    check(isList(a.paymentIds, (id) => paymentIds.has(id)), `${at}.payment_ids are invalid`);
    check(typeof a.seeded === 'boolean', `${at}.seeded must be a boolean`);
  });
  requireUnique(r.authorizations.map((a) => a.id), 'authorization id');

  checkTimes(r);
  checkLinks(r);
  checkHolds(r);
  checkReplays(r);
}

/**
 * Times agree with the clock and the lifetime: the clock never runs backwards, so no record was
 * created after last_timestamp_ms; an authorization created through the API expires exactly
 * created_at + ttl (stage 2). Seeded ones carry their own expires_at, in the past or future.
 */
function checkTimes(r) {
  const created = [
    ...r.payments.map((p) => p.createdAt), ...r.requests.map((q) => q.createdAt), ...r.splits.map((sp) => sp.createdAt),
    ...r.settlements.map((st) => st.committedAt), ...r.authorizations.map((a) => a.createdAt),
  ];
  check(created.every((t) => t <= r.lastTimestampMs), 'a record was created after the clock');
  for (const a of r.authorizations) {
    check(a.seeded || a.expiresAt === expiryOf(a.createdAt, r.authorizationTtlSeconds),
      `authorization ${a.id} does not expire at created_at + authorization_ttl_seconds`);
  }
}

/** §2 stage 2: no user's unexpired open holds may exceed their total (available never negative). */
function checkHolds(r) {
  const now = Date.now();
  const held = new Map();
  for (const a of r.authorizations) {
    if (!isDue(a, now)) {
      held.set(a.fromUserId, (held.get(a.fromUserId) ?? 0) + remainingOf(a));
    }
  }
  for (const u of r.users) {
    check((held.get(u.id) ?? 0) <= u.balance, `holds on ${u.id} exceed its balance`);
  }
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

  const authorizations = new Map(r.authorizations.map((a) => [a.id, a]));
  for (const p of r.payments) {
    if (p.authorizationId !== null) {
      const a = authorizations.get(p.authorizationId);
      check(a && a.paymentIds.includes(p.id) && a.fromUserId === p.fromUserId && a.toUserId === p.toUserId
        && p.requestId === null && p.settlementId === null, `payment ${p.id} names an authorization it did not capture`);
    }
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
  for (const a of r.authorizations) {
    const captures = a.paymentIds.map((id) => payments.get(id));
    const sum = captures.reduce((total, p) => total + p.amount, 0);
    const unrecorded = a.seeded && captures.length === 0; // a fixture's captured one names no payment
    check(new Set(a.paymentIds).size === a.paymentIds.length
      && captures.every((p) => p.authorizationId === a.id)
      && (unrecorded || sum === a.capturedAmount),
      `authorization ${a.id} captures do not match its payments`);
    check(a.status !== 'open' || a.capturedAmount < a.amount, `authorization ${a.id} is open with nothing left`);
    check(a.status !== 'captured' || unrecorded || captures.length > 0, `authorization ${a.id} is captured without a payment`);
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
  const state = new State({
    currency: r.currency, minorUnits: r.minorUnits, authorizationTtlSeconds: r.authorizationTtlSeconds,
  });
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
  for (const a of r.authorizations) state.addAuthorization({ ...a, paymentIds: [...a.paymentIds] });
  for (const settlement of r.settlements) state.addSettlement({ ...settlement });
  for (const { scope, fingerprint, response } of r.idempotency) {
    state.saveIdempotencyRecord(scope, { fingerprint, response });
  }
  return state;
}

/*
 * Stored replays (stage-1 §7, §10): a completed idempotent write keeps its request body
 * (fingerprint) and its original response. Each must describe the record it answered for, or a
 * replay would hand out a receipt for something that does not exist. One rule per idempotent route.
 */
const sameText = (value, expected) => value === expected;
const isHandleOf = (users, id) => (handle) => users.get(id)?.handle === handle;

/** The receipt fields a payment response must share with the payment record. */
function describesPayment(view, p, users) {
  return Boolean(p) && view.payment_id === p.id && view.from_user_id === p.fromUserId
    && view.to_user_id === p.toUserId && view.amount === p.amount && view.note === p.note
    && view.visibility === p.visibility && view.request_id === p.requestId
    && view.settlement_id === p.settlementId
    && (!Object.prototype.hasOwnProperty.call(view, 'authorization_id') || view.authorization_id === p.authorizationId)
    && isHandleOf(users, p.fromUserId)(view.from_handle) && isHandleOf(users, p.toUserId)(view.to_handle)
    && sameText(view.created_at, formatTimestamp(p.createdAt));
}

function describesRequest(view, q) {
  return Boolean(q) && view.request_id === q.id && view.requester_id === q.requesterId
    && view.payer_id === q.payerId && view.amount === q.amount && view.note === q.note
    && sameText(view.created_at, formatTimestamp(q.createdAt));
}

const REPLAY_RULES = {
  '/payments': ({ userId, body, view, find, users }) => {
    const p = find.payment(view.payment_id);
    return describesPayment(view, p, users) && p.fromUserId === userId && p.requestId === null
      && p.settlementId === null && p.authorizationId === null
      && body.amount === p.amount && isHandleOf(users, p.toUserId)(body.to_handle);
  },
  '/requests/:id/pay': ({ userId, params, view, find, users }) => {
    const p = find.payment(view.payment_id);
    return describesPayment(view, p, users) && p.fromUserId === userId && p.requestId === params.id;
  },
  '/authorizations/:id/capture': ({ userId, params, body, view, find, users }) => {
    const p = find.payment(view.payment_id);
    return Boolean(find.authorization(params.id)) && describesPayment(view, p, users)
      && p.toUserId === userId && p.authorizationId === params.id
      && (body.amount === undefined || body.amount === p.amount);
  },
  '/requests': ({ userId, body, view, find, users }) => {
    const q = find.request(view.request_id);
    return describesRequest(view, q) && q.requesterId === userId
      && body.amount === q.amount && isHandleOf(users, q.payerId)(body.payer_handle);
  },
  '/splits': ({ userId, body, view, find }) => {
    const sp = find.split(view.split_id);
    return Boolean(sp) && sp.requesterId === userId && view.amount === sp.amount && body.amount === sp.amount
      && Array.isArray(view.requests) && canonicalJson(view.requests.map((q) => q?.request_id)) === canonicalJson(sp.requestIds)
      && view.requests.every((q) => describesRequest(q, find.request(q.request_id)))
      && sameText(view.created_at, formatTimestamp(sp.createdAt));
  },
  '/settlements': ({ view, find, users }) => {
    const st = find.settlement(view.settlement_id);
    return Boolean(st) && Array.isArray(view.payments)
      && canonicalJson(view.payments.map((p) => p?.payment_id)) === canonicalJson(st.paymentIds)
      && view.payments.every((p) => describesPayment(p, find.payment(p.payment_id), users))
      && sameText(view.committed_at, formatTimestamp(st.committedAt));
  },
  '/authorizations': ({ userId, body, view, find }) => {
    const a = find.authorization(view.authorization_id);
    return Boolean(a) && a.fromUserId === userId && view.amount === a.amount && body.amount === a.amount
      && view.to_user_id === a.toUserId && sameText(view.created_at, formatTimestamp(a.createdAt))
      && sameText(view.expires_at, formatTimestamp(a.expiresAt));
  },
};

function checkReplays(r) {
  const index = (list) => new Map(list.map((x) => [x.id, x]));
  const maps = {
    payment: index(r.payments), request: index(r.requests), split: index(r.splits),
    settlement: index(r.settlements), authorization: index(r.authorizations),
  };
  const find = Object.fromEntries(Object.entries(maps).map(([kind, map]) => [kind, (id) => map.get(id)]));
  const users = index(r.users);
  r.idempotency.forEach((rec, i) => {
    const [userId, , route, params] = JSON.parse(rec.scope);
    const rule = REPLAY_RULES[route];
    const ok = rule && rule({ userId, params, body: JSON.parse(rec.fingerprint), view: rec.response.body, find, users });
    check(ok, `idempotency[${i}] does not describe the record it answered for`);
  });
}
