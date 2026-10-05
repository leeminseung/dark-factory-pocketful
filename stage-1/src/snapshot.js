// GET /_test/export and POST /_test/import (§10): the whole State as one JSON value.
//
// The state format is this service's own. Import checks every part of it before
// building a new State, so a defective snapshot is 422 and the live state stays as it was.
import { invalid } from './errors.js';
import { isPasswordHash } from './passwords.js';
import { State } from './state.js';
import { MINOR_UNITS, REQUEST_STATUSES } from './fixture.js';
import { HANDLE_PATTERN, VISIBILITIES, isIntegralNumber, isPlainObject } from './validate.js';

export const TRACK = 'pocketful';
export const FORMAT_VERSION = 1;

/** A complete, detached copy of `state`; later writes do not reach it. */
export function exportState(state) {
  const snapshot = {
    currency: state.currency,
    minor_units: state.minorUnits,
    last_timestamp_ms: state.lastTimestampMs,
    users: [...state.users.values()].map((u) => ({
      id: u.id, email: u.email, password_hash: u.passwordHash, display_name: u.displayName,
      handle: u.handle, balance: u.balance,
    })),
    operator_ids: [...state.operatorIds],
    tokens: [...state.tokens].map(([token, userId]) => ({ token, user_id: userId })),
    payments: state.payments.map((p) => ({
      id: p.id, from_user_id: p.fromUserId, to_user_id: p.toUserId, amount: p.amount,
      note: p.note, visibility: p.visibility, request_id: p.requestId,
      settlement_id: p.settlementId, created_at_ms: p.createdAt,
    })),
    requests: state.requests.map((r) => ({
      id: r.id, requester_id: r.requesterId, payer_id: r.payerId, amount: r.amount,
      note: r.note, status: r.status, payment_id: r.paymentId, created_at_ms: r.createdAt,
    })),
    splits: state.splits,
    settlements: state.settlements,
    idempotency: [...state.idempotency].map(([scope, record]) => ({ scope, ...record })),
  };
  // A JSON round trip detaches every nested object from the live state.
  return { track: TRACK, format_version: FORMAT_VERSION, state: JSON.parse(JSON.stringify(snapshot)) };
}

function check(condition, message) {
  if (!condition) throw invalid(`invalid state: ${message}`);
}

const isString = (v) => typeof v === 'string';
const isOptionalString = (v) => v === null || isString(v);
const isCount = (v) => isIntegralNumber(v) && v >= 0;
const isList = (v, item) => Array.isArray(v) && v.every(item);

function readList(state, name, item) {
  const list = state[name];
  check(Array.isArray(list) && list.every(isPlainObject), `${name} must be an array of objects`);
  list.forEach((entry, i) => item(entry, `${name}[${i}]`));
  return list;
}

/** Validates an export envelope and builds the State it describes; throws 422 on any defect. */
export function importState(envelope) {
  check(envelope.track === TRACK, `track must be "${TRACK}"`);
  check(envelope.format_version === FORMAT_VERSION, `format_version must be ${FORMAT_VERSION}`);
  const s = envelope.state;
  check(isPlainObject(s), 'state must be an object');
  check(isString(s.currency) && s.currency !== '', 'currency');
  check(MINOR_UNITS.includes(s.minor_units), 'minor_units');
  check(isCount(s.last_timestamp_ms), 'last_timestamp_ms');

  const state = new State({ currency: s.currency, minorUnits: s.minor_units });
  state.lastTimestampMs = s.last_timestamp_ms;

  readList(s, 'users', (u, at) => {
    check(isString(u.id) && isString(u.email) && isString(u.display_name), `${at} fields`);
    check(isString(u.handle) && HANDLE_PATTERN.test(u.handle), `${at}.handle`);
    check(isCount(u.balance), `${at}.balance`);
    check(isPasswordHash(u.password_hash), `${at}.password_hash`);
    check(!state.users.has(u.id) && !state.userByEmail(u.email) && !state.userByHandle(u.handle),
      `${at} duplicates another user`);
    state.addUser({
      id: u.id, email: u.email, passwordHash: u.password_hash, displayName: u.display_name,
      handle: u.handle, balance: u.balance,
    });
  });
  const isUser = (id) => state.users.has(id);

  check(isList(s.operator_ids, isUser), 'operator_ids');
  for (const id of s.operator_ids) state.operatorIds.add(id);

  readList(s, 'tokens', (t, at) => {
    check(isString(t.token) && isUser(t.user_id), at);
    state.tokens.set(t.token, t.user_id);
  });

  readList(s, 'payments', (p, at) => {
    check(isString(p.id) && !state.paymentsById.has(p.id), `${at}.id`);
    check(isUser(p.from_user_id) && isUser(p.to_user_id), `${at} parties`);
    check(isCount(p.amount) && isString(p.note) && VISIBILITIES.includes(p.visibility), `${at} fields`);
    check(isOptionalString(p.request_id) && isOptionalString(p.settlement_id), `${at} links`);
    check(isCount(p.created_at_ms), `${at}.created_at_ms`);
    state.addPayment({
      id: p.id, fromUserId: p.from_user_id, toUserId: p.to_user_id, amount: p.amount,
      note: p.note, visibility: p.visibility, requestId: p.request_id,
      settlementId: p.settlement_id, createdAt: p.created_at_ms,
    });
  });

  readList(s, 'requests', (r, at) => {
    check(isString(r.id) && !state.requestsById.has(r.id), `${at}.id`);
    check(isUser(r.requester_id) && isUser(r.payer_id), `${at} parties`);
    check(isCount(r.amount) && isString(r.note) && REQUEST_STATUSES.includes(r.status), `${at} fields`);
    check(isOptionalString(r.payment_id) && isCount(r.created_at_ms), `${at} fields`);
    state.addRequest({
      id: r.id, requesterId: r.requester_id, payerId: r.payer_id, amount: r.amount,
      note: r.note, status: r.status, paymentId: r.payment_id, createdAt: r.created_at_ms,
    });
  });

  state.splits = readList(s, 'splits', (sp, at) => check(isString(sp.id), `${at}.id`));
  state.settlements = readList(s, 'settlements', (st, at) =>
    check(isString(st.id) && isList(st.payment_ids, isString), at));

  readList(s, 'idempotency', (rec, at) => {
    check(isString(rec.scope) && isString(rec.fingerprint), at);
    check(isPlainObject(rec.response) && isPlainObject(rec.response.body), `${at}.response`);
    state.saveIdempotencyRecord(rec.scope, { fingerprint: rec.fingerprint, response: rec.response });
  });
  return state;
}
