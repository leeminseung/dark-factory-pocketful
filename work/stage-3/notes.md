# Stage 3 — implementer notes

The stage-1 and stage-2 notes still apply to everything stage 3 did not change.

## Design decisions

- **One ledger module answers every historical question** (src/ledger.js):
  - balance as of an instant;
  - holds as of an instant;
  - statements;
  - the first overdraft in a history.

  It is asked of a "book" (users, payments, authorizations): the live State, or the records of a
  reset or import being judged. So `/me`, `/statement`, corrections and the reset/import validator
  all use the same rules.
- **Revisions are stored, balances are kept current.** Each payment carries its revisions;
  revision 1 is the payment as made. A wallet's current balance is still kept as a number, and
  checkRecords requires it to equal its opening balance plus its payments at their latest revisions.
  Historical views are recomputed from the revisions on every read; nothing historical is cached.
- **Opening balance** is stored per user: the seeded balance minus the net of the seeded payments
  (new accounts 0). Stage-1 and stage-2 exports, where every payment is still revision 1, derive it
  the same way.
- **Corrections** go through one gate, `State.correctPayment`, inside the request's transaction:
  1. insufficient_funds when the debited wallet cannot afford the difference now;
  2. otherwise historical_overdraft, when either party's total or available would be negative at any
     boundary under the latest revisions;
  3. any refusal is undone by the transaction.

  A correction's recorded time is the service clock, at least 1 ms after the payment's previous
  revision.
- **One instant rule** (R6, R10; clock.js):
  - every instant the service reads is RFC 3339 with an offset, and "T"/"Z" may be lowercase;
  - every instant is truncated to the millisecond, stored or queried, so one instant names one
    millisecond everywhere. Truncation keeps "at exactly that instant" inclusive for clients that
    send microseconds.
- **The statement's default `to`** is "now", taken as the end of the read's own millisecond. A
  payment already made in that millisecond is on the statement; an explicit `to` stays strictly
  exclusive.
- **`from` after `to` is 422**: in such a window, opening + deltas = closing (statement rule 3) could
  not hold.
- **Snapshots are a window and a watermark** (R1). A snapshot stores its owner, from, to, the known_at it
  echoes, and the watermark min(known_at, the read's instant). Each page recomputes the window from
  the payments' revisions, which never change once recorded. `State.freezeReadAt` stamps everything
  recorded after the read strictly later, so no later revision falls under the watermark. Memory per
  snapshot is constant.
- **Clock-bound residual:** at the clock's fixed bound (MAX_CLOCK_MS) the clock cannot move past a
  read. A write stamped at the bound in the same millisecond as a later snapshot read would join
  that snapshot. Reaching this needs a state imported with its clock at 9899-12-30.
- **Snapshots are exported and imported** (R3, ruling f9a6a09): "Tokens last until reset", and import
  is not a reset. Import checks each one: a known owner; a valid window with from ≤ to; a watermark
  not after the clock; an echo, when present, at or after the watermark. A stage-1 or stage-2 export
  has none.
- **closed_at:**
  - a final capture closes at its capture payment;
  - a void closes at its own time;
  - an expiry closes at expires_at, whenever the sweep notices it.
- **closed_at for older records:**
  - A fixture's closed authorization counts as closed at the reset (or at expiry, if that came first),
    so it never held anything.
  - A stage-2 export does not record when a void happened. A voided authorization from one counts as
    closed at its last capture, or at its creation if it had none: the earliest time it can have
    closed.
- **Export generations.** A stage-3 export carries opening_balance, revisions and closed_at. One with
  none of them, and no correction replay, is read as stage-2 (or stage-1), with the three derived. An
  export with only some of them is 422.
- **Older receipts.** A stage-1 receipt has no authorization_id and a stage-2 one no closed_at. A
  stored receipt lacking such a field matches when the record's value is null. Every other field must
  equal the receipt rebuilt from the records.

## Unfixed non-blocking findings

- R5: a voided authorization from a stage-2 export gets the earliest closed_at it can have (its last
  capture, or its creation), because a stage-2 export does not record when a void happened. Its past
  held is understated from then until the real void.
- R11: 7d115a2 also changed the statement's default `to` (to cover the read's own millisecond)
  without naming the cause. Cause: with `to` = the read's instant exclusive, a payment stamped in
  that same millisecond was left out of a statement read just after it. It is covered by
  corrections.test.js 'a correction that makes a past balance negative', whose before/after
  statements depend on it.
