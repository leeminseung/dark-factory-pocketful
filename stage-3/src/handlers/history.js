// GET /me (stage 1, 2; stage 3 as_of / known_at) and GET /statement (stage 3).
import { randomBytes } from 'node:crypto';
import { formatTimestamp } from '../clock.js';
import { invalid, notFound } from '../errors.js';
import { moneyAt, statement as statementOf } from '../ledger.js';
import { paginate, paging, queryInstant } from '../paging.js';
import { meView, paymentView } from '../views.js';

/**
 * GET /me. Without temporal parameters: the current values. With as_of and/or known_at: all four
 * money fields describe that one view, and each supplied instant is echoed exactly as given.
 * Omitted, as_of is the instant the request began and known_at is everything known then.
 */
export function me({ state, user, query, now }) {
  const asOf = queryInstant(query, 'as_of');
  const knownAt = queryInstant(query, 'known_at');
  const body = meView(state, user);
  if (!asOf && !knownAt) return { status: 200, body };
  const money = moneyAt(state, user.id, asOf ? asOf.floor : now, knownAt ? knownAt.floor : undefined);
  return {
    status: 200,
    body: {
      ...body, ...money,
      ...(asOf && { as_of: asOf.text }),
      ...(knownAt && { known_at: knownAt.text }),
    },
  };
}

/** One statement entry as the API shows it: the payment at its selected revision. */
function entryView(state, entry) {
  return {
    payment: paymentView(state, { ...entry.payment, amount: entry.rev.amount }),
    delta: entry.delta,
    balance_after: entry.balanceAfter,
    revision: entry.rev.revision,
    effective_at: formatTimestamp(entry.rev.effectiveAt),
    recorded_at: formatTimestamp(entry.rev.recordedAt),
  };
}

/** The response for one page of a frozen statement. */
function pageOf(snapshot, token, page) {
  const { items, hasMore } = paginate(snapshot.entries, page);
  return {
    status: 200,
    body: {
      opening_balance: snapshot.opening,
      entries: items,
      closing_balance: snapshot.closing,
      has_more: hasMore,
      snapshot: token,
      ...(snapshot.knownAt !== null && { known_at: snapshot.knownAt }),
    },
  };
}

/**
 * GET /statement. A first read computes the whole window, freezes it under a new snapshot token
 * and returns a page of it; GET /statement?snapshot=… pages that frozen result, whatever has
 * happened since. Opening, closing and every balance_after describe the whole window.
 */
export function statement({ state, user, query, now }) {
  const page = paging(query);
  const token = query.get('snapshot');
  if (token !== null) {
    for (const name of ['from', 'to', 'known_at']) {
      if (query.has(name)) throw invalid(`${name} cannot accompany a snapshot`);
    }
    const snapshot = state.snapshots.get(token);
    if (!snapshot || snapshot.userId !== user.id) throw notFound('no such statement snapshot');
    return pageOf(snapshot, token, page);
  }
  const from = queryInstant(query, 'from');
  const to = queryInstant(query, 'to');
  const knownAt = queryInstant(query, 'known_at');
  // [from, to): a payment at from counts, one at to does not. The default `to` is now, taken to
  // cover the read's own millisecond, so a payment already made in it is on the statement.
  const fromMs = from ? from.ceil : null;
  const toMs = to ? to.ceil : now + 1;
  if (fromMs !== null && fromMs > toMs) throw invalid('from must not be after to');
  const result = statementOf(state, user.id, { from: fromMs, to: toMs, knownAt: knownAt ? knownAt.floor : undefined });
  const snapshot = {
    userId: user.id,
    opening: result.opening,
    closing: result.closing,
    entries: result.entries.map((entry) => entryView(state, entry)),
    knownAt: knownAt ? knownAt.text : null,
  };
  const newToken = `snap_${randomBytes(18).toString('base64url')}`;
  state.addSnapshot(newToken, snapshot);
  return pageOf(snapshot, newToken, page);
}
