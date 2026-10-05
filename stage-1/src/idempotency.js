// Idempotent write paths (§7).
//
// A key belongs to one user on one method and path (route plus decoded parameters). The first successful use stores
// the request's canonical body and its 201 response; a replay with the same body gets
// that response again as 200, and a different body is 409. A failed attempt stores
// nothing, so its key stays usable.
import { idempotencyKeyReuse } from './errors.js';

/** Text already in canonical form, waiting on the work stack of canonicalJson. */
class Literal {
  constructor(text) {
    this.text = text;
  }
}

/**
 * The same JSON value gives the same text: object keys are sorted, whitespace dropped.
 * Iterative, so a body nested 100000 levels deep cannot overflow the call stack.
 */
export function canonicalJson(root) {
  const out = [];
  const pending = [root]; // a stack: JSON values still to write, and Literal text
  const pushInOrder = (parts) => {
    for (let i = parts.length - 1; i >= 0; i -= 1) pending.push(parts[i]);
  };
  while (pending.length > 0) {
    const item = pending.pop();
    if (item instanceof Literal) {
      out.push(item.text);
    } else if (Array.isArray(item)) {
      const parts = [new Literal('[')];
      item.forEach((element, i) => {
        if (i > 0) parts.push(new Literal(','));
        parts.push(element);
      });
      parts.push(new Literal(']'));
      pushInOrder(parts);
    } else if (item !== null && typeof item === 'object') {
      const parts = [new Literal('{')];
      Object.keys(item).sort().forEach((key, i) => {
        parts.push(new Literal(`${i > 0 ? ',' : ''}${JSON.stringify(key)}:`), item[key]);
      });
      parts.push(new Literal('}'));
      pushInOrder(parts);
    } else {
      out.push(JSON.stringify(item));
    }
  }
  return out.join('');
}

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
  const responseBody = operation();
  if (responseBody instanceof Promise) throw new Error('idempotent operations must be synchronous');
  state.saveIdempotencyRecord(scope, { fingerprint, response: { status: 201, body: responseBody } });
  return { status: 201, body: responseBody };
}
