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
- **Query instants keep sub-millisecond precision** (clock.js `parseInstant`). An inclusive bound
  (`as_of`, `known_at`) uses the millisecond at or before the instant. A half-open bound (`from`,
  `to`) uses the millisecond at or after it. Stored times are whole milliseconds, so neither rounds
  the wrong way.
- **The statement's default `to`** is "now", taken as the end of the read's own millisecond. A
  payment already made in that millisecond is on the statement; an explicit `to` stays strictly
  exclusive.
- **`from` after `to` is 422**: in such a window, opening + deltas = closing (statement rule 3) could
  not hold.
- **Snapshots are frozen results.** A first read stores the whole computed window (opening, closing,
  every entry as shown), and snapshot reads only page it. A frozen result is the only way to honour
  "freezes … at that read" when `known_at` is in the future.
- **Snapshots are not exported.** An import replaces the state, so tokens from before an import are
  404, like tokens from before a reset. §10's list of what to preserve has no snapshots, and a frozen
  read cannot be checked against the records it came from.
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

(none yet)
