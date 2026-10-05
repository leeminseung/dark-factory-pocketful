// The model's rules (§3.4, §4, §6, §8, §9): what a valid id, email, handle, amount, note,
// visibility, status, balance and authorization is. Every reader of outside data — API bodies
// (validate.js), reset fixtures (fixture.js) and imported state (snapshot.js) — asks here.

import { MAX_AMOUNT, MAX_NOTE_CHARS, charCount } from './shared/rules.js';

export { MAX_AMOUNT, MAX_NOTE_CHARS, charCount };
export const MAX_ID_CHARS = 64;
export const HANDLE_PATTERN = /^[a-z0-9_]{1,20}$/;
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/; // local@domain
/** No balance, and so no total of balances, lies outside ±2^53. */
export const BALANCE_LIMIT = 2 ** 53;
export const VISIBILITIES = ['public', 'private'];
export const REQUEST_STATUSES = ['pending', 'paid', 'declined', 'cancelled'];
/** A request leaves `pending` once, for exactly one of these (§4). */
export const TERMINAL_STATUSES = REQUEST_STATUSES.filter((status) => status !== 'pending');
export const MINOR_UNITS = [0, 2, 3];
/** Stage 2: an authorization is open, then exactly one of captured, voided or expired. */
export const AUTHORIZATION_STATUSES = ['open', 'captured', 'voided', 'expired'];
export const DEFAULT_AUTHORIZATION_TTL_SECONDS = 600;
/** The last instant with an RFC 3339 form (§3.4): 9999-12-31T23:59:59.999Z, as epoch ms. */
export const MAX_TIMESTAMP_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);


/** A JSON number with an integral value (1000, 1000.0 and 1e3 alike); never a string or boolean. */
export const isIntegralNumber = (value) => typeof value === 'number' && Number.isInteger(value);

const isIntegerIn = (value, min, max) => isIntegralNumber(value) && value >= min && value <= max;

export const isId = (value) =>
  typeof value === 'string' && value !== '' && charCount(value) <= MAX_ID_CHARS;
export const isEmail = (value) => typeof value === 'string' && EMAIL_PATTERN.test(value);
export const isHandle = (value) => typeof value === 'string' && HANDLE_PATTERN.test(value);
export const isBalance = (value) => isIntegerIn(value, 0, BALANCE_LIMIT);
/** A stored payment or request amount; 0 is legal there (a zero split share). */
export const isRecordAmount = (value) => isIntegerIn(value, 0, MAX_AMOUNT);
export const isNote = (value) => typeof value === 'string' && charCount(value) <= MAX_NOTE_CHARS;
export const isVisibility = (value) => VISIBILITIES.includes(value);
export const isRequestStatus = (value) => REQUEST_STATUSES.includes(value);
/** A stored time in epoch ms that formats as RFC 3339: 1970 to the end of year 9999. */
export const isTimestampMs = (value) => isIntegerIn(value, 0, MAX_TIMESTAMP_MS);
export const isAuthorizationStatus = (value) => AUTHORIZATION_STATUSES.includes(value);
/**
 * When an authorization created at `createdAt` (epoch ms) with lifetime `ttlSeconds` expires:
 * created_at plus the lifetime (stage 2), never past the last RFC 3339 instant. isTtlSeconds
 * refuses any lifetime that would reach that bound, so the cap only guards the year 9999.
 */
export const expiryOf = (createdAt, ttlSeconds) => Math.min(createdAt + ttlSeconds * 1000, MAX_TIMESTAMP_MS);

/**
 * A lifetime for new authorizations: a positive whole number of seconds whose expiry, counted
 * from `now`, still has an RFC 3339 form (stage-1 §3.4), so every expires_at the service writes
 * can be exported and imported back (stage-1 §10).
 */
export const isTtlSeconds = (value, now = Date.now()) =>
  isIntegerIn(value, 1, Math.floor((MAX_TIMESTAMP_MS - now) / 1000));
/** An authorization whose expires_at is at or before `now` has expired (stage 2). */
export const isDue = (authorization, now) => authorization.expiresAt <= now;
/** What an authorization still holds: amount − captured while open, zero once closed. */
export const remainingOf = (authorization) =>
  (authorization.status === 'open' ? authorization.amount - authorization.capturedAmount : 0);
export const isMinorUnits = (value) => MINOR_UNITS.includes(value);
export const isTotalWithinLimit = (balances) =>
  balances.reduce((sum, balance) => sum + balance, 0) <= BALANCE_LIMIT;
