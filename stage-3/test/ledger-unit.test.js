// src/ledger.js: the one-pass overdraft check agrees with the boundary-by-boundary definition.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareKeys } from '../src/clock.js';
import { balanceAt, firstOverdraft, heldAt } from '../src/ledger.js';
import { closedKey, createdKey, effectiveKey, expiresKey } from '../src/model.js';

/** The definition: at each boundary, total = balance as of it, available = total − held as of it. */
function slowOverdraft(book, userId) {
  const times = new Set();
  for (const p of book.payments) {
    if (p.fromUserId === userId || p.toUserId === userId) times.add(effectiveKey(p.revisions.at(-1)));
  }
  for (const a of book.authorizations) {
    if (a.fromUserId !== userId) continue;
    [createdKey(a), expiresKey(a)].concat(a.closedAt === null ? [] : [closedKey(a)]).forEach((t) => times.add(t));
    a.paymentIds.forEach((id) => times.add(createdKey(book.paymentsById.get(id))));
  }
  for (const t of [...times].sort(compareKeys)) {
    const total = balanceAt(book, userId, t);
    if (total < 0) return { at: t, what: 'total' };
    if (total - heldAt(book, userId, t) < 0) return { at: t, what: 'available' };
  }
  return null;
}

/**
 * A random small history: payments with corrections; holds that capture (sometimes after they have
 * closed), void, expire, or close at or before their creation and so never hold (R21); and times
 * that share a millisecond with different fractions beyond it (R14).
 */
function randomBook(seed) {
  let x = seed;
  // The high bits: a power-of-two LCG's low bits repeat with a short period.
  const rnd = (n) => { x = (x * 1103515245 + 12345) % 2147483648; return Math.floor(x / 65536) % n; };
  const frac = () => ['', '', '5', '25'][rnd(4)];
  const users = new Map(['a', 'b', 'c'].map((id) => [id, { id, openingBalance: rnd(60) }]));
  const ids = [...users.keys()];
  const payments = [];
  for (let i = 0; i < 12; i += 1) {
    const from = ids[rnd(3)];
    const to = ids[(ids.indexOf(from) + 1 + rnd(2)) % 3];
    const t = rnd(20);
    const f = frac();
    const revisions = [{ revision: 1, amount: rnd(30), effectiveAt: t, effectiveFrac: f, recordedAt: t, recordedFrac: f, reason: '' }];
    if (rnd(3) === 0) {
      revisions.push({ revision: 2, amount: rnd(30), effectiveAt: rnd(20), effectiveFrac: frac(), recordedAt: 30, recordedFrac: '', reason: 'r' });
    }
    payments.push({ id: `p${i}`, fromUserId: from, toUserId: to, revisions, createdAt: t, createdFrac: f, authorizationId: null });
  }
  const authorizations = [];
  for (let i = 0; i < 4; i += 1) {
    const from = ids[rnd(3)];
    const createdAt = rnd(15);
    const createdFrac = frac();
    const amount = 1 + rnd(40);
    const expiresAt = createdAt + 1 + rnd(10);
    const a = {
      id: `a${i}`, fromUserId: from, toUserId: ids[(ids.indexOf(from) + 1) % 3], amount,
      createdAt, createdFrac, expiresAt, expiresFrac: frac(), closedAt: null, closedFrac: '', paymentIds: [],
    };
    if (rnd(2)) {
      // Up to two past expires_at: a capture the closed hold no longer covers.
      const t = createdAt + rnd(expiresAt - createdAt + 3);
      const f = t === createdAt ? createdFrac : frac(); // never before the hold
      const amt = 1 + rnd(amount);
      const p = { id: `c${i}`, fromUserId: a.fromUserId, toUserId: a.toUserId, createdAt: t, createdFrac: f, authorizationId: a.id,
        revisions: [{ revision: 1, amount: amt, effectiveAt: t, effectiveFrac: f, recordedAt: t, recordedFrac: f, reason: '' }] };
      payments.push(p);
      a.paymentIds.push(p.id);
    }
    const end = rnd(4);
    if (end === 1) {
      // A void: at or after the hold and its capture.
      const last = a.paymentIds.length ? payments.find((p) => p.id === a.paymentIds[0]) : a;
      const later = rnd(3);
      [a.closedAt, a.closedFrac] = later ? [last.createdAt + later, frac()] : [last.createdAt, last.createdFrac];
    }
    if (end === 2) [a.closedAt, a.closedFrac] = [expiresAt, a.expiresFrac];
    if (end === 3 && a.paymentIds.length === 0) [a.closedAt, a.closedFrac] = [createdAt - rnd(2), rnd(2) ? '' : createdFrac];
    authorizations.push(a);
  }
  return { users, payments, paymentsById: new Map(payments.map((p) => [p.id, p])), authorizations };
}

test('R2 R21: firstOverdraft equals the boundary-by-boundary definition on 2000 random histories', () => {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const book = randomBook(seed);
    for (const id of book.users.keys()) {
      assert.deepEqual(firstOverdraft(book, id), slowOverdraft(book, id), `seed ${seed} user ${id}`);
    }
  }
});
