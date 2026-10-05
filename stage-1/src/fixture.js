// POST /_test/reset fixtures (§3.3, §4, §11): validation and building a fresh State.
//
// The whole fixture is checked before anything is built, and the built State only
// replaces the live one once complete, so a rejected fixture changes nothing.
import { invalid, malformed } from './errors.js';
import { hashPassword } from './passwords.js';
import { State } from './state.js';
import {
  BALANCE_LIMIT, EMAIL_PATTERN, HANDLE_PATTERN, amount, charCount, isPlainObject, note, visibility,
} from './validate.js';

export const MINOR_UNITS = [0, 2, 3];
export const REQUEST_STATUSES = ['pending', 'paid', 'declined', 'cancelled'];
export const MAX_ID_CHARS = 64;
const has = (obj, name) => Object.prototype.hasOwnProperty.call(obj, name);

/** Reads a field of a fixture object: a wrong JSON type is 400, a missing one 422. */
function read(obj, name, type, where, fallback) {
  if (!has(obj, name) || obj[name] === undefined) {
    if (fallback !== undefined) return fallback;
    throw invalid(`${where}.${name} is required`);
  }
  const value = obj[name];
  const ok = {
    string: typeof value === 'string',
    array: Array.isArray(value),
    object: isPlainObject(value),
    number: typeof value === 'number',
  }[type];
  if (!ok) throw malformed(`${where}.${name} must be a ${type}`);
  return value;
}

function readId(obj, name, where) {
  const id = read(obj, name, 'string', where);
  if (id === '' || charCount(id) > MAX_ID_CHARS) throw invalid(`${where}.${name} must be 1 to 64 characters`);
  return id;
}

function readOptionalRef(obj, name, where) {
  if (!has(obj, name) || obj[name] === null) return null;
  return readId(obj, name, where);
}

function readUser(raw, where) {
  if (!isPlainObject(raw)) throw malformed(`${where} must be an object`);
  const user = {
    id: readId(raw, 'id', where),
    email: read(raw, 'email', 'string', where),
    password: read(raw, 'password', 'string', where),
    displayName: read(raw, 'display_name', 'string', where),
    handle: read(raw, 'handle', 'string', where),
    balance: amount(raw, 'balance', { min: 0, max: BALANCE_LIMIT }),
  };
  if (!EMAIL_PATTERN.test(user.email)) throw invalid(`${where}.email is not local@domain`);
  if (!HANDLE_PATTERN.test(user.handle)) throw invalid(`${where}.handle does not match ${HANDLE_PATTERN}`);
  return user;
}

function readParties(raw, fromName, toName, where, userIds) {
  const from = readId(raw, fromName, where);
  const to = readId(raw, toName, where);
  if (!userIds.has(from) || !userIds.has(to)) throw invalid(`${where} names an unknown user`);
  if (from === to) throw invalid(`${where} has the same user on both sides`);
  return [from, to];
}

function readPayment(raw, where, userIds) {
  if (!isPlainObject(raw)) throw malformed(`${where} must be an object`);
  const [fromUserId, toUserId] = readParties(raw, 'from_user_id', 'to_user_id', where, userIds);
  return {
    id: readId(raw, 'id', where), fromUserId, toUserId,
    amount: amount(raw, 'amount', { min: 0 }), note: note(raw), visibility: visibility(raw),
    requestId: readOptionalRef(raw, 'request_id', where), settlementId: null,
  };
}

function readRequest(raw, where, userIds) {
  if (!isPlainObject(raw)) throw malformed(`${where} must be an object`);
  const [requesterId, payerId] = readParties(raw, 'requester_id', 'payer_id', where, userIds);
  const status = has(raw, 'status') ? raw.status : 'pending';
  if (!REQUEST_STATUSES.includes(status)) throw invalid(`${where}.status is invalid`);
  return {
    id: readId(raw, 'id', where), requesterId, payerId,
    amount: amount(raw, 'amount', { min: 0 }), note: note(raw), status, paymentId: readOptionalRef(raw, 'payment_id', where),
  };
}

function requireUnique(values, what) {
  if (new Set(values).size !== values.length) throw invalid(`duplicate ${what} in fixture`);
}

/** Checks a fixture completely and returns its parsed parts; throws 400/422 on any defect. */
export function parseFixture(body) {
  const currency = read(body, 'currency', 'string', 'fixture');
  if (currency === '') throw invalid('fixture.currency is empty');
  const minorUnits = read(body, 'minor_units', 'number', 'fixture');
  if (!MINOR_UNITS.includes(minorUnits)) throw invalid('fixture.minor_units must be 0, 2 or 3');

  const users = read(body, 'users', 'array', 'fixture').map((u, i) => readUser(u, `users[${i}]`));
  requireUnique(users.map((u) => u.id), 'user id');
  requireUnique(users.map((u) => u.email.toLowerCase()), 'email');
  requireUnique(users.map((u) => u.handle), 'handle');
  if (users.reduce((sum, u) => sum + u.balance, 0) > BALANCE_LIMIT) {
    throw invalid('seeded balances exceed 2^53 in total');
  }
  const userIds = new Set(users.map((u) => u.id));

  const payments = read(body, 'payments', 'array', 'fixture', [])
    .map((p, i) => readPayment(p, `payments[${i}]`, userIds));
  requireUnique(payments.map((p) => p.id), 'payment id');
  const requests = read(body, 'requests', 'array', 'fixture', [])
    .map((r, i) => readRequest(r, `requests[${i}]`, userIds));
  requireUnique(requests.map((r) => r.id), 'request id');

  const operatorIds = read(body, 'settlement_operator_ids', 'array', 'fixture', []);
  for (const id of operatorIds) {
    if (typeof id !== 'string') throw malformed('settlement_operator_ids must hold strings');
    if (!userIds.has(id)) throw invalid(`settlement operator ${id} is not a seeded user`);
  }
  return { currency, minorUnits, users, payments, requests, operatorIds };
}

/** Builds a fresh State from a parsed fixture. Seeded balances are taken as already net. */
export async function buildState(fixture) {
  const state = new State({ currency: fixture.currency, minorUnits: fixture.minorUnits });
  const hashes = await Promise.all(fixture.users.map((u) => hashPassword(u.password)));
  fixture.users.forEach(({ password, ...user }, i) => state.addUser({ ...user, passwordHash: hashes[i] }));
  for (const id of fixture.operatorIds) state.operatorIds.add(id);
  const createdAt = state.nextTimestamp();
  for (const payment of fixture.payments) state.addPayment({ ...payment, createdAt });
  for (const request of fixture.requests) state.addRequest({ ...request, createdAt });
  return state;
}
