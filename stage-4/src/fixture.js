// POST /_test/reset fixtures (§3.3, §4, §11): reading a fixture into records.
//
// This module decides only what is fixture-specific: field names, defaults, and that a
// wrong JSON type is 400 (§5). Every value rule and every rule between records is
// records.js's checkRecords, shared with import. The whole fixture is judged before
// anything is built, so a rejected fixture changes nothing.
import { invalid, malformed } from './errors.js';
import { hashSeededPasswords } from './passwords.js';
import { instantKey, parseInstant } from './clock.js';
import { DEFAULT_AUTHORIZATION_TTL_SECONDS, seededClosedAt } from './model.js';
import { assignRecordSequence, checkRecords, openingBalances, stateFromRecords } from './records.js';
import { isPlainObject } from './validate.js';

const has = (obj, name) => Object.prototype.hasOwnProperty.call(obj, name);

const TYPES = {
  string: (v) => typeof v === 'string',
  array: Array.isArray,
  number: (v) => typeof v === 'number',
  any: () => true,
};

/** A fixture field: missing is 422 unless it has a default, a wrong JSON type is 400. */
function read(obj, name, type, where, fallback) {
  if (!has(obj, name) || obj[name] === undefined) {
    if (fallback !== undefined) return fallback;
    throw invalid(`${where}.${name} is required`);
  }
  if (!TYPES[type](obj[name])) throw malformed(`${where}.${name} must be a ${type}`);
  return obj[name];
}

function object(raw, where) {
  if (!isPlainObject(raw)) throw malformed(`${where} must be an object`);
  return raw;
}

// Amounts, balances, notes and visibilities are not type-checked here: §5 makes a wrongly
// typed amount, note or visibility 422, which checkRecords gives.
const readUser = (raw, where) => ({
  id: read(object(raw, where), 'id', 'string', where),
  email: read(raw, 'email', 'string', where),
  password: read(raw, 'password', 'string', where),
  displayName: read(raw, 'display_name', 'string', where),
  handle: read(raw, 'handle', 'string', where),
  balance: read(raw, 'balance', 'any', where),
});

// The fixture format has no link fields (§4): seeded records start unlinked.
/**
 * A seeded time as { ms, frac } (clock.js), at the precision given (R14): an RFC 3339 instant with
 * an offset; when optional (stage 3 created_at) it defaults to the reset time.
 */
function readTime(raw, name, where, fallback) {
  if (!has(raw, name) && fallback !== undefined) return fallback;
  const instant = parseInstant(read(raw, name, 'string', where));
  if (instant === null) throw invalid(`${where}.${name} is not an RFC 3339 timestamp with an offset`);
  return instant;
}

/** A seeded payment: created_at when supplied (never after the reset; checkRecords), else the reset time. */
function readPayment(raw, where, resetAt) {
  const created = readTime(object(raw, where), 'created_at', where, { ms: resetAt, frac: '' });
  const amount = read(raw, 'amount', 'any', where);
  return {
    id: read(raw, 'id', 'string', where),
    fromUserId: read(raw, 'from_user_id', 'string', where),
    toUserId: read(raw, 'to_user_id', 'string', where),
    amount,
    note: read(raw, 'note', 'any', where, ''),
    visibility: read(raw, 'visibility', 'any', where, 'public'),
    requestId: null,
    settlementId: null,
    authorizationId: null,
    createdAt: created.ms,
    createdFrac: created.frac,
    revisions: [{
      revision: 1, amount, effectiveAt: created.ms, effectiveFrac: created.frac, recordedAt: created.ms, recordedFrac: created.frac, reason: '',
    }],
  };
}


const readRequest = (raw, where, createdAt) => ({
  id: read(object(raw, where), 'id', 'string', where),
  requesterId: read(raw, 'requester_id', 'string', where),
  payerId: read(raw, 'payer_id', 'string', where),
  amount: read(raw, 'amount', 'any', where),
  note: read(raw, 'note', 'any', where, ''),
  status: read(raw, 'status', 'any', where, 'pending'),
  paymentId: null,
  seeded: true,
  createdAt,
});

/** A seeded authorization holds from its own absolute expires_at; a seeded `captured` one counts as fully captured. */
function readAuthorization(raw, where, resetAt) {
  // Seeded open holds start at the reset unless created_at is supplied (stage 3); closed ones
  // keep no lifecycle and count as closed at their creation (or at expiry, if that came first).
  const created = readTime(object(raw, where), 'created_at', where, { ms: resetAt, frac: '' });
  const expires = readTime(raw, 'expires_at', where);
  // One given its own created_at must not be created after it expires (stage 3 "Seeded history is
  // consistent"). Without one it counts from the reset, which may well be after its expires_at.
  if (has(raw, 'created_at') && instantKey(created.ms, created.frac) > instantKey(expires.ms, expires.frac)) {
    throw invalid(`${where}.created_at is after its expires_at`);
  }
  const amount = read(raw, 'amount', 'any', where);
  const status = read(raw, 'status', 'any', where); // required: the fixture format gives no default
  const times = { expiresAt: expires.ms, expiresFrac: expires.frac, createdAt: created.ms, createdFrac: created.frac };
  return {
    id: read(raw, 'id', 'string', where),
    fromUserId: read(raw, 'from_user_id', 'string', where),
    toUserId: read(raw, 'to_user_id', 'string', where),
    amount,
    capturedAmount: status === 'captured' ? amount : 0,
    note: read(raw, 'note', 'any', where, ''),
    visibility: read(raw, 'visibility', 'any', where, 'public'),
    status,
    paymentIds: [],
    seeded: true,
    ...times,
    ...seededClosedAt({ status, ...times }),
  };
}

/** Reads and judges a fixture; returns its records, users still holding plaintext passwords. */
export function parseFixture(body) {
  // Seeded payments and requests all get the reset time; a later entry counts as newer.
  const now = Date.now();
  const operatorIds = read(body, 'settlement_operator_ids', 'array', 'fixture', []);
  if (!operatorIds.every((id) => typeof id === 'string')) {
    throw malformed('settlement_operator_ids must hold strings');
  }
  const records = {
    currency: read(body, 'currency', 'string', 'fixture'),
    minorUnits: read(body, 'minor_units', 'number', 'fixture'),
    lastTimestampMs: now,
    authorizationTtlSeconds: read(body, 'authorization_ttl_seconds', 'any', 'fixture', DEFAULT_AUTHORIZATION_TTL_SECONDS),
    users: read(body, 'users', 'array', 'fixture').map((u, i) => readUser(u, `users[${i}]`)),
    operatorIds,
    tokens: [],
    payments: read(body, 'payments', 'array', 'fixture', []).map((p, i) => readPayment(p, `payments[${i}]`, now)),
    requests: read(body, 'requests', 'array', 'fixture', []).map((r, i) => readRequest(r, `requests[${i}]`, now)),
    splits: [],
    settlements: [],
    authorizations: read(body, 'authorizations', 'array', 'fixture', [])
      .map((a, i) => readAuthorization(a, `authorizations[${i}]`, now)),
    idempotency: [],
    snapshots: [],
  };
  records.users = openingBalances(records.users, records.payments);
  records.recordSequence = assignRecordSequence(records.payments);
  checkRecords(records);
  return records;
}

/** Builds a fresh State from parsed fixture records. Seeded balances are taken as already net. */
export async function buildState(records) {
  const hashes = await hashSeededPasswords(records.users.map((u) => u.password));
  const users = records.users.map(({ password, ...user }, i) => ({ ...user, passwordHash: hashes[i] }));
  return stateFromRecords({ ...records, users });
}
