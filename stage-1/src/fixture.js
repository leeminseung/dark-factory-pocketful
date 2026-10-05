// POST /_test/reset fixtures (§3.3, §4, §11): reading a fixture into records.
//
// This module decides only what is fixture-specific: field names, defaults, and that a
// wrong JSON type is 400 (§5). Every value rule and every rule between records is
// records.js's checkRecords, shared with import. The whole fixture is judged before
// anything is built, so a rejected fixture changes nothing.
import { invalid, malformed } from './errors.js';
import { hashPasswords } from './passwords.js';
import { checkRecords, stateFromRecords } from './records.js';
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
const readPayment = (raw, where, createdAt) => ({
  id: read(object(raw, where), 'id', 'string', where),
  fromUserId: read(raw, 'from_user_id', 'string', where),
  toUserId: read(raw, 'to_user_id', 'string', where),
  amount: read(raw, 'amount', 'any', where),
  note: read(raw, 'note', 'any', where, ''),
  visibility: read(raw, 'visibility', 'any', where, 'public'),
  requestId: null,
  settlementId: null,
  createdAt,
});

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
    users: read(body, 'users', 'array', 'fixture').map((u, i) => readUser(u, `users[${i}]`)),
    operatorIds,
    tokens: [],
    payments: read(body, 'payments', 'array', 'fixture', []).map((p, i) => readPayment(p, `payments[${i}]`, now)),
    requests: read(body, 'requests', 'array', 'fixture', []).map((r, i) => readRequest(r, `requests[${i}]`, now)),
    splits: [],
    settlements: [],
    idempotency: [],
  };
  checkRecords(records);
  return records;
}

/** Builds a fresh State from parsed fixture records. Seeded balances are taken as already net. */
export async function buildState(records) {
  const hashes = await hashPasswords(records.users.map((u) => u.password));
  const users = records.users.map(({ password, ...user }, i) => ({ ...user, passwordHash: hashes[i] }));
  return stateFromRecords({ ...records, users });
}
