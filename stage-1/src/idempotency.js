// Idempotent write paths (§7).
//
// A key belongs to one user on one method and path (route plus decoded parameters). The first successful use stores
// the request's canonical body and its 201 response; a replay with the same body gets
// that response again as 200, and a different body is 409. A failed attempt stores
// nothing, so its key stays usable.
import { idempotencyKeyReuse } from './errors.js';
import { canonicalJson } from './json.js';

/**
 * Resolves `key` before `operation` runs, then runs it and records its result.
 * `operation` must be synchronous: the lookup, the state change and the record are one
 * uninterrupted step, so concurrent identical requests produce exactly one 201.
 */
export function runIdempotent(state, { userId, method, route, params, key, body }, operation) {
  const scope = canonicalJson([userId, method, route, params, key]);
  const fingerprint = canonicalJson(body);
  const record = state.idempotencyRecord(scope);
  if (record) {
    if (record.fingerprint !== fingerprint) throw idempotencyKeyReuse();
    return { status: 200, body: record.response.body };
  }
  // routes.js refuses async handlers at startup; this catches a sync one that returns a Promise.
  const responseBody = operation();
  if (responseBody instanceof Promise) throw new Error('idempotent operations must be synchronous');
  state.saveIdempotencyRecord(scope, { fingerprint, response: { status: 201, body: responseBody } });
  return { status: 201, body: responseBody };
}
