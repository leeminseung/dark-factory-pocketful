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

function randomBook(seed) {
  let x = seed;
  const rnd = (n) => { x = (x * 1103515245 + 12345) % 2147483648; return x % n; };
  const users = new Map(['a', 'b', 'c'].map((id) => [id, { id, openingBalance: rnd(60) }]));
  const ids = [...users.keys()];
  const payments = [];
  for (let i = 0; i < 12; i += 1) {
    const from = ids[rnd(3)];
    const to = ids[(ids.indexOf(from) + 1 + rnd(2)) % 3];
    const t = rnd(20);
    const revisions = [{ revision: 1, amount: rnd(30), effectiveAt: t, recordedAt: t, reason: '' }];
    if (rnd(3) === 0) revisions.push({ revision: 2, amount: rnd(30), effectiveAt: rnd(20), recordedAt: 30, reason: 'r' });
    payments.push({ id: `p${i}`, fromUserId: from, toUserId: to, revisions, createdAt: t, authorizationId: null });
  }
  const authorizations = [];
  for (let i = 0; i < 4; i += 1) {
    const from = ids[rnd(3)];
    const createdAt = rnd(15);
    const amount = 1 + rnd(40);
    const expiresAt = createdAt + 1 + rnd(10);
    const a = { id: `a${i}`, fromUserId: from, toUserId: ids[(ids.indexOf(from) + 1) % 3], amount, createdAt, expiresAt, closedAt: null, paymentIds: [] };
    if (rnd(2)) {
      const t = createdAt + rnd(expiresAt - createdAt);
      const amt = 1 + rnd(amount);
      const p = { id: `c${i}`, fromUserId: a.fromUserId, toUserId: a.toUserId, createdAt: t, authorizationId: a.id,
        revisions: [{ revision: 1, amount: amt, effectiveAt: t, recordedAt: t, reason: '' }] };
      payments.push(p);
      a.paymentIds.push(p.id);
    }
    const end = rnd(3);
    if (end === 1) a.closedAt = Math.max(createdAt, ...a.paymentIds.map((id) => payments.find((p) => p.id === id).createdAt)) + rnd(3);
    if (end === 2) a.closedAt = expiresAt;
    authorizations.push(a);
  }
  return { users, payments, paymentsById: new Map(payments.map((p) => [p.id, p])), authorizations };
}

test('R2: firstOverdraft equals the boundary-by-boundary definition on 500 random histories', () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const book = randomBook(seed);
    for (const id of book.users.keys()) {
      assert.deepEqual(firstOverdraft(book, id), slowOverdraft(book, id), `seed ${seed} user ${id}`);
    }
  }
});
