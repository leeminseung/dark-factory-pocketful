// GET /_test/export and POST /_test/import (§10): the whole State as one JSON value.
//
// The state format is this service's own. Import checks every part of it before
// building a new State: it reads the state into records and has records.js judge them with
// the same rules reset uses, so a defective snapshot is 422 and the live state stays as it was.
import { invalid } from './errors.js';
import { isPasswordHash } from './passwords.js';
import { DEFAULT_AUTHORIZATION_TTL_SECONDS } from './model.js';
import { checkRecords, stateFromRecords } from './records.js';
import { isPlainObject } from './validate.js';

export const TRACK = 'pocketful';
export const FORMAT_VERSION = 1;

/** A complete, detached copy of `state`; later writes do not reach it. */
export function exportState(state) {
  const snapshot = {
    currency: state.currency,
    minor_units: state.minorUnits,
    last_timestamp_ms: state.lastTimestampMs,
    authorization_ttl_seconds: state.authorizationTtlSeconds,
    users: [...state.users.values()].map((u) => ({
      id: u.id, email: u.email, password_hash: u.passwordHash, display_name: u.displayName,
      handle: u.handle, balance: u.balance,
    })),
    operator_ids: [...state.operatorIds],
    tokens: [...state.tokens].map(([token, userId]) => ({ token, user_id: userId })),
    payments: state.payments.map((p) => ({
      id: p.id, from_user_id: p.fromUserId, to_user_id: p.toUserId, amount: p.amount,
      note: p.note, visibility: p.visibility, request_id: p.requestId,
      settlement_id: p.settlementId, authorization_id: p.authorizationId, created_at_ms: p.createdAt,
    })),
    authorizations: state.authorizations.map((a) => ({
      id: a.id, from_user_id: a.fromUserId, to_user_id: a.toUserId, amount: a.amount,
      captured_amount: a.capturedAmount, note: a.note, visibility: a.visibility, status: a.status,
      expires_at_ms: a.expiresAt, payment_ids: a.paymentIds, seeded: a.seeded, created_at_ms: a.createdAt,
    })),
    requests: state.requests.map((r) => ({
      id: r.id, requester_id: r.requesterId, payer_id: r.payerId, amount: r.amount,
      note: r.note, status: r.status, payment_id: r.paymentId, seeded: r.seeded,
      created_at_ms: r.createdAt,
    })),
    splits: [...state.splits.values()].map((sp) => ({
      id: sp.id, requester_id: sp.requesterId, amount: sp.amount, note: sp.note,
      shares: sp.shares, request_ids: sp.requestIds, created_at_ms: sp.createdAt,
    })),
    settlements: [...state.settlements.values()].map((st) => ({
      id: st.id, committed_at_ms: st.committedAt, payment_ids: st.paymentIds,
    })),
    idempotency: [...state.idempotency].map(([scope, record]) => ({ scope, ...record })),
  };
  // A JSON round trip detaches every nested object from the live state.
  return { track: TRACK, format_version: FORMAT_VERSION, state: JSON.parse(JSON.stringify(snapshot)) };
}

const list = (s, name) => {
  const value = s[name];
  if (!Array.isArray(value) || !value.every(isPlainObject)) {
    throw invalid(`invalid state: ${name} must be an array of objects`);
  }
  return value;
};

const has = (obj, name) => Object.prototype.hasOwnProperty.call(obj, name);

/** True when `state` has none of the fields stage 2 added. */
function isStage1State(state) {
  const payments = Array.isArray(state.payments) ? state.payments : [];
  const records = Array.isArray(state.idempotency) ? state.idempotency : [];
  return !has(state, 'authorizations') && !has(state, 'authorization_ttl_seconds')
    && !payments.some((p) => isPlainObject(p) && has(p, 'authorization_id'))
    && !records.some((rec) => isPlainObject(rec) && typeof rec.scope === 'string' && rec.scope.includes('"/authorizations'));
}

/** Validates an export envelope and builds the State it describes; throws 422 on any defect. */
export function importState(envelope) {
  if (envelope.track !== TRACK) throw invalid(`track must be "${TRACK}"`);
  if (envelope.format_version !== FORMAT_VERSION) throw invalid(`format_version must be ${FORMAT_VERSION}`);
  const s = envelope.state;
  if (!isPlainObject(s)) throw invalid('state must be an object');
  if (!Array.isArray(s.operator_ids)) throw invalid('invalid state: operator_ids must be an array');
  const users = list(s, 'users');
  users.forEach((u, i) => {
    if (!isPasswordHash(u.password_hash)) throw invalid(`invalid state: users[${i}].password_hash`);
  });
  // A stage-1 export carries no stage-2 field anywhere: it imports as a state with no
  // authorizations, the default lifetime, and payments that came from no authorization (stage 2
  // "Existing clients after an upgrade"). Anything with a stage-2 field is a stage-2 export and
  // must carry all of them, so removing one is an invalid state, not a stage-1 export.
  const fromStage1 = isStage1State(s);
  const records = {
    currency: s.currency,
    minorUnits: s.minor_units,
    lastTimestampMs: s.last_timestamp_ms,
    authorizationTtlSeconds: fromStage1 ? DEFAULT_AUTHORIZATION_TTL_SECONDS : s.authorization_ttl_seconds,
    users: users.map((u) => ({
      id: u.id, email: u.email, passwordHash: u.password_hash, displayName: u.display_name,
      handle: u.handle, balance: u.balance,
    })),
    operatorIds: s.operator_ids,
    tokens: list(s, 'tokens').map((t) => ({ token: t.token, userId: t.user_id })),
    payments: list(s, 'payments').map((p) => ({
      id: p.id, fromUserId: p.from_user_id, toUserId: p.to_user_id, amount: p.amount,
      note: p.note, visibility: p.visibility, requestId: p.request_id,
      settlementId: p.settlement_id, authorizationId: fromStage1 ? null : p.authorization_id,
      createdAt: p.created_at_ms,
    })),
    authorizations: fromStage1 ? [] : list(s, 'authorizations').map((a) => ({
      id: a.id, fromUserId: a.from_user_id, toUserId: a.to_user_id, amount: a.amount,
      capturedAmount: a.captured_amount, note: a.note, visibility: a.visibility, status: a.status,
      expiresAt: a.expires_at_ms, paymentIds: a.payment_ids, seeded: a.seeded, createdAt: a.created_at_ms,
    })),
    requests: list(s, 'requests').map((r) => ({
      id: r.id, requesterId: r.requester_id, payerId: r.payer_id, amount: r.amount,
      note: r.note, status: r.status, paymentId: r.payment_id, seeded: r.seeded,
      createdAt: r.created_at_ms,
    })),
    splits: list(s, 'splits').map((sp) => ({
      id: sp.id, requesterId: sp.requester_id, amount: sp.amount, note: sp.note,
      shares: sp.shares, requestIds: sp.request_ids, createdAt: sp.created_at_ms,
    })),
    settlements: list(s, 'settlements').map((st) => ({
      id: st.id, committedAt: st.committed_at_ms, paymentIds: st.payment_ids,
    })),
    idempotency: list(s, 'idempotency').map((rec) => ({
      scope: rec.scope, fingerprint: rec.fingerprint, response: rec.response,
    })),
  };
  checkRecords(records);
  return stateFromRecords(records);
}
