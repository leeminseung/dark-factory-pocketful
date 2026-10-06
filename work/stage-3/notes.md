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
- **One instant rule** (R6, R14; clock.js):
  - every instant the service reads is RFC 3339 with an offset, and "T"/"Z" may be lowercase;
  - every instant keeps the precision it was given (R14, replacing R10's truncation). A time is held
    as whole milliseconds plus its further digits (`…Frac`, trailing zeros dropped), and every
    comparison goes through one ordering key (clock.js instantKey) built from both. Rounding either
    way would misplace an instant near a millisecond edge, so neither is used.
  - times the service stamps itself (created_at of API writes, recorded_at of corrections, the clock)
    stay whole milliseconds. "Now" is that whole millisecond: an effective_at later than it, even by a
    fraction, is 422, and a seeded expires_at a fraction past it has not yet expired.
  - responses give back each instant at its own precision; the export carries each fraction as
    `…_frac` beside `…_ms`. An export without them (stage 1, stage 2, or before R14) has whole
    milliseconds.
  - stage-2/ is left as it is: there the only comparison of a supplied instant is a seeded expires_at
    against "now", which is itself known only to the millisecond (S2-097), so no stage-2 rule is broken.
- **The statement's default `to`** is "now", taken as the end of the read's own millisecond. A
  payment already made in that millisecond is on the statement; an explicit `to` stays strictly
  exclusive.
- **`from` after `to` is 422**: in such a window, opening + deltas = closing (statement rule 3) could
  not hold.
- **Snapshots are a window and a watermark** (R1, R13). A snapshot stores its owner, its window, the
  known_at it echoes, and a watermark: the recording number of the last revision recorded when it was
  read. Every revision gets the next recording number as it is recorded. Each page recomputes the
  window from the revisions numbered at or below the watermark, which never change once recorded, so
  reads move no clock and memory per snapshot is constant.
- **Snapshots are exported and imported** (R3, ruling f9a6a09): "Tokens last until reset", and import
  is not a reset. Import checks each one: a known owner; a valid window with from ≤ to; a watermark
  no greater than the revisions recorded; an echo, when present, that is its known_at. A stage-1 or stage-2 export
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
