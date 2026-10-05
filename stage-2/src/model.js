// The model's rules (§3.4, §4, §6, §8, §9): what a valid id, email, handle, amount, note,
// visibility, status, balance and authorization is. Every reader of outside data — API bodies
// (validate.js), reset fixtures (fixture.js) and imported state (snapshot.js) — asks here.

export const MAX_ID_CHARS = 64;
export const HANDLE_PATTERN = /^[a-z0-9_]{1,20}$/;
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/; // local@domain
export const MAX_AMOUNT = 1_000_000_000;
/** No balance, and so no total of balances, lies outside ±2^53. */
export const BALANCE_LIMIT = 2 ** 53;
export const MAX_NOTE_CHARS = 200;
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

/** Characters, not UTF-16 units or bytes: an emoji counts once. */
export const charCount = (text) => [...text].length;

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
/** A lifetime for new authorizations: a positive whole number of seconds whose expiry stays formattable. */
export const isTtlSeconds = (value) => isIntegerIn(value, 1, Math.floor(MAX_TIMESTAMP_MS / 1000));
export const isMinorUnits = (value) => MINOR_UNITS.includes(value);
export const isTotalWithinLimit = (balances) =>
  balances.reduce((sum, balance) => sum + balance, 0) <= BALANCE_LIMIT;
