// Response timestamps: RFC 3339 in UTC with an explicit "+00:00" offset (§3.4).

/** Formats epoch milliseconds, e.g. 2026-09-24T11:04:03.120+00:00. */
export const formatTimestamp = (ms) => new Date(ms).toISOString().replace('Z', '+00:00');

export const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const RFC3339_PARTS =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:(Z)|([+-])(\d{2}):(\d{2}))$/;

/** Epoch ms of an RFC 3339 timestamp with an explicit offset, or null if it is not one (a real date and time). */
export function parseTimestamp(text) {
  const m = typeof text === 'string' && RFC3339_PARTS.exec(text);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const ms = Number(((m[7] ?? '') + '000').slice(0, 3));
  const offsetMinutes = m[8] ? 0 : (m[9] === '-' ? -1 : 1) * (Number(m[10]) * 60 + Number(m[11]));
  // Date.UTC reads years 0-99 as 1900-1999, so the year is set on its own.
  const back = new Date(Date.UTC(2000, month - 1, day, hour, minute, second, ms));
  back.setUTCFullYear(year, month - 1, day);
  const local = back.getTime();
  const isReal = back.getUTCFullYear() === year && back.getUTCMonth() === month - 1
    && back.getUTCDate() === day && hour < 24 && minute < 60 && second < 60
    && Number(m[10] ?? 0) < 24 && Number(m[11] ?? 0) < 60;
  return isReal ? local - offsetMinutes * 60_000 : null;
}

/**
 * A query instant (stage 3 as_of, known_at, from, to): an RFC 3339 instant with an offset, kept
 * to sub-millisecond precision as the two whole milliseconds around it. `floor` serves inclusive
 * bounds (a payment at or before the instant) and `ceil` half-open ones (at or after it), so a
 * fraction beyond milliseconds is never rounded the wrong way. Null when it is not an instant.
 */
export function parseInstant(text) {
  const floor = parseTimestamp(text);
  if (floor === null) return null;
  const fraction = RFC3339_PARTS.exec(text)[7] ?? '';
  const beyondMs = /[1-9]/.test(fraction.slice(3));
  return { floor, ceil: beyondMs ? floor + 1 : floor };
}
