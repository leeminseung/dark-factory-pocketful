// The model's rules (§3.4, §4, §6, §8, §9): what a valid id, email, handle, amount, note,
// visibility, status, balance and authorization is. Every reader of outside data — API bodies
// (validate.js), reset fixtures (fixture.js) and imported state (snapshot.js) — asks here.

import { EMAIL_PATTERN, MAX_AMOUNT, MAX_NOTE_CHARS, charCount } from '../public/assets/shared/rules.js';

export { EMAIL_PATTERN, MAX_AMOUNT, MAX_NOTE_CHARS, charCount };
export const MAX_ID_CHARS = 64;
export const HANDLE_PATTERN = /^[a-z0-9_]{1,20}$/;
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
/** The first instant with an RFC 3339 form: 0000-01-01T00:00:00.000Z (negative epoch ms). */
export const MIN_TIMESTAMP_MS = new Date(Date.UTC(2000, 0, 1)).setUTCFullYear(0);


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
export const isTimestampMs = (value) => isIntegerIn(value, MIN_TIMESTAMP_MS, MAX_TIMESTAMP_MS);
export const isAuthorizationStatus = (value) => AUTHORIZATION_STATUSES.includes(value);
/**
 * Fixed bounds (ruling 2abb370), so that "expires_at is created_at plus the ttl", RFC 3339 output
 * and "accept an unchanged export" all hold at once, at any time:
 * - MAX_TTL_SECONDS: the longest authorization lifetime, 100 years of 365.25 days;
 * - MAX_CLOCK_MS: the latest creation time the service's clock may hold or stamp;
 * - MAX_CLOCK_MS + MAX_TTL_SECONDS * 1000 is exactly the last RFC 3339 instant, 9999-12-31T23:59:59.999Z.
 * Neither bound depends on the current time.
 */
export const MAX_TTL_SECONDS = 3_155_760_000;
export const MAX_CLOCK_MS = MAX_TIMESTAMP_MS - MAX_TTL_SECONDS * 1000;

/** When an authorization expires: created_at plus the lifetime, exactly (stage 2). */
export const expiryOf = (createdAt, ttlSeconds) => createdAt + ttlSeconds * 1000;

/** A lifetime for new authorizations: a positive whole number of seconds, at most MAX_TTL_SECONDS. */
export const isTtlSeconds = (value) => isIntegerIn(value, 1, MAX_TTL_SECONDS);

/** A creation time the service's clock may hold: at most MAX_CLOCK_MS. */
export const isClockMs = (value) => isIntegerIn(value, 0, MAX_CLOCK_MS);
/** An authorization whose expires_at is at or before `now` has expired (stage 2). */
export const isDue = (authorization, now) => authorization.expiresAt <= now;
/** What an authorization still holds: amount − captured while open, zero once closed. */
export const remainingOf = (authorization) =>
  (authorization.status === 'open' ? authorization.amount - authorization.capturedAmount : 0);
/** A correction's reason (stage 3): a string of 1 to 200 characters. */
export const isReason = (value) => typeof value === 'string' && charCount(value) >= 1 && charCount(value) <= MAX_NOTE_CHARS;
export const isMinorUnits = (value) => MINOR_UNITS.includes(value);
export const isTotalWithinLimit = (balances) =>
  balances.reduce((sum, balance) => sum + balance, 0) <= BALANCE_LIMIT;
