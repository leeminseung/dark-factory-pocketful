// Resolving the handles a caller names (§4 "Users identify recipients by handle").
import { notFound } from '../errors.js';

/** The user with `handle`, or 404: a handle no user has, or one that cannot exist, is unknown. */
export function userWithHandle(state, handle) {
  const user = state.userByHandle(handle);
  if (!user) throw notFound(`no user has the handle ${JSON.stringify(handle)}`);
  return user;
}

/**
 * The other party to a payment or request from `self`: unknown is 404, and naming
 * oneself throws `selfError()` (self_payment or self_request).
 */
export function counterparty(state, self, handle, selfError) {
  const other = userWithHandle(state, handle);
  if (other.id === self.id) throw selfError();
  return other;
}
