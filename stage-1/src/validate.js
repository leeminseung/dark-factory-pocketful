// Reading request fields (§5, §7): which error a missing, mistyped or out-of-range field gets.
// What counts as valid is the model's decision (model.js).
import { invalid, malformed, missingIdempotencyKey } from './errors.js';
import {
  MAX_AMOUNT, MAX_NOTE_CHARS, VISIBILITIES, charCount, isIntegralNumber, isVisibility,
} from './model.js';

export const MAX_IDEMPOTENCY_KEY_CHARS = 255;

const has = (body, name) => Object.prototype.hasOwnProperty.call(body, name);

export const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A required string field: absent is 422, any other JSON type is 400. */
export function requiredString(body, name) {
  if (!has(body, name)) throw invalid(`${name} is required`);
  const value = body[name];
  if (typeof value !== 'string') throw malformed(`${name} must be a string`);
  return value;
}

/**
 * An amount: any non-integer, string or boolean is 422, as is a value outside min..max.
 * API amounts are 1..MAX_AMOUNT; seeded records allow 0 (a paid zero share).
 */
export function amount(body, name = 'amount', { min = 1, max = MAX_AMOUNT } = {}) {
  if (!has(body, name)) throw invalid(`${name} is required`);
  const value = body[name];
  if (!isIntegralNumber(value)) throw invalid(`${name} must be an integer`);
  if (value < min || value > max) throw invalid(`${name} must be ${min} to ${max}`);
  return value;
}

/** Optional note, default "": any non-string (null included) or more than 200 characters is 422. */
export function note(body) {
  if (!has(body, 'note')) return '';
  const value = body.note;
  if (typeof value !== 'string') throw invalid('note must be a string');
  if (charCount(value) > MAX_NOTE_CHARS) throw invalid(`note exceeds ${MAX_NOTE_CHARS} characters`);
  return value;
}

/** Optional visibility, default "public": anything but the two values is 422. */
export function visibility(body) {
  if (!has(body, 'visibility')) return 'public';
  const value = body.visibility;
  if (!isVisibility(value)) throw invalid(`visibility must be one of ${VISIBILITIES.join(', ')}`);
  return value;
}

/** The Idempotency-Key header: absent or empty is 400, longer than 255 characters is 422. */
export function idempotencyKey(headerValue) {
  if (headerValue === undefined || headerValue === '') throw missingIdempotencyKey();
  if (charCount(headerValue) > MAX_IDEMPOTENCY_KEY_CHARS) {
    throw invalid(`Idempotency-Key must be 1 to ${MAX_IDEMPOTENCY_KEY_CHARS} characters`);
  }
  return headerValue;
}

