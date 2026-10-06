// List query parameters (§5, §8): limit/offset paging and enumerated filters.
import { instantKey, parseInstant } from './clock.js';
import { invalid } from './errors.js';

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;

/** An integer query parameter is plain decimal digits only. */
function queryInteger(query, name, fallback) {
  const raw = query.get(name);
  if (raw === null) return fallback;
  if (!/^[0-9]+$/.test(raw)) throw invalid(`${name} must be a non-negative integer`);
  return Number(raw);
}

/** limit (1..200, default 50) and offset (0 or more, default 0). */
export function paging(query) {
  const limit = queryInteger(query, 'limit', DEFAULT_LIMIT);
  if (limit < 1 || limit > MAX_LIMIT) throw invalid(`limit must be 1 to ${MAX_LIMIT}`);
  // Any digit string is a valid offset; one past the end simply yields an empty page.
  const offset = queryInteger(query, 'offset', 0);
  return { limit, offset };
}

/** An optional enumerated query parameter: an unknown value is 422. */
export function queryChoice(query, name, choices) {
  const raw = query.get(name);
  if (raw === null) return null;
  if (!choices.includes(raw)) throw invalid(`${name} must be one of ${choices.join(', ')}`);
  return raw;
}

/** One page of `items` and whether more items follow it. */
export function paginate(items, { limit, offset }) {
  return { items: items.slice(offset, offset + limit), hasMore: items.length > offset + limit };
}

/**
 * An optional instant query parameter (stage 3 as_of, known_at, from, to): absent is null; present
 * it must be an RFC 3339 instant with an offset — a naive time, a bare date or an empty value is 422.
 * Returns { text, ms, frac, key } (see clock.js), at the precision given (R14).
 */
export function queryInstant(query, name) {
  const text = query.get(name);
  if (text === null) return null;
  const instant = parseInstant(text);
  if (!instant) throw invalid(`${name} must be an RFC 3339 instant with an offset`);
  return { text, ...instant, key: instantKey(instant.ms, instant.frac) };
}
