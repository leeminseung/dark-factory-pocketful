// Instants (stage 3 R14): read at the precision they were given, compared exactly, and shown in
// RFC 3339 in UTC with an explicit "+00:00" offset (§3.4).
//
// An instant is held as whole epoch milliseconds plus `frac`, the digits of its fraction beyond
// the millisecond with trailing zeros dropped ('' when it falls on a millisecond). Times the
// service stamps itself are whole milliseconds; times a client supplies keep every digit given.

/** Formats an instant, e.g. 2026-09-24T11:04:03.120+00:00, or …03.1205+00:00 with frac '5'. */
export const formatTimestamp = (ms, frac = '') => new Date(ms).toISOString().replace('Z', `${frac}+00:00`);

export const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// One rule for every instant the service reads (stage 3 R6): RFC 3339 §5.6 with an offset; the
// "T" and "Z" may be lowercase.
const RFC3339_PARTS =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([Zz])|([+-])(\d{2}):(\d{2}))$/;

/**
 * An RFC 3339 timestamp with an explicit offset as { ms, frac } (a real date and time), or null.
 * `ms` is the whole milliseconds; `frac` keeps every further digit given (R14).
 */
export function parseInstant(text) {
  const m = typeof text === 'string' && RFC3339_PARTS.exec(text);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const digits = m[7] ?? '';
  const ms = Number(digits.padEnd(3, '0').slice(0, 3));
  const frac = digits.slice(3).replace(/0+$/, '');
  const offsetMinutes = m[8] ? 0 : (m[9] === '-' ? -1 : 1) * (Number(m[10]) * 60 + Number(m[11]));
  // Date.UTC reads years 0-99 as 1900-1999, so the year is set on its own.
  const back = new Date(Date.UTC(2000, month - 1, day, hour, minute, second, ms));
  back.setUTCFullYear(year, month - 1, day);
  const local = back.getTime();
  const isReal = back.getUTCFullYear() === year && back.getUTCMonth() === month - 1
    && back.getUTCDate() === day && hour < 24 && minute < 60 && second < 60
    && Number(m[10] ?? 0) < 24 && Number(m[11] ?? 0) < 60;
  return isReal ? { ms: local - offsetMinutes * 60_000, frac } : null;
}

/** A stored fraction beyond the millisecond: digits without trailing zeros, '' when none. */
export const isFrac = (value) => typeof value === 'string' && /^(\d*[1-9])?$/.test(value);

/**
 * The one ordering of instants: a string key whose order is the instants' order and whose
 * equality is theirs: whole milliseconds, shifted to be positive and written at a fixed width,
 * then any fraction. The shift covers every instant RFC 3339 can write, offsets included.
 */
export const instantKey = (ms, frac = '') => String(ms + 1e15).padStart(16, '0') + (frac === '' ? '' : `.${frac}`);

/** A key after every instant. */
export const NEVER_KEY = '~';

/** Orders two keys, for Array.prototype.sort. */
export const compareKeys = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
