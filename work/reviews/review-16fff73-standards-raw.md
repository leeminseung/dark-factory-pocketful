## Standards review of 16fff73 (stage 4): findings

I found no blocking findings. There are four non-blocking findings, listed most important first.

### 1. The refund rules are written twice, and the import copy only checks the final state (it accepts an impossible history)
- **Location:**
  - `stage-4/src/records.js:286-302` (`checkRefunds`).
  - The same rules on the live path are at `stage-4/src/state.js:297-316` (`requireRefundsWithin`, `refundPayment`) and `stage-4/src/handlers/corrections.js:40`.
- **Principle:** engineering-principles, Principles §2: "**One place per decision.** Each format, rule, limit and storage choice lives in one module behind a small interface, so that changing the rule changes one place. … A rule spread over several places, or written twice, is a finding." Smell (code-smells.md): "Duplicated code | The same logic, or the same rule, written in more than one place."
- **Requirement:** stage 4, "Refunds and corrected history": "Refunds cumulatively may not exceed the payment's current corrected amount" and "A correction cannot reduce a payment below its already-refunded amount".
- **Evidence:**
  - The live path enforces the cap at every step, through `requireRefundsWithin`.
  - `checkRefunds` writes the rule again inline as `total <= currentRevision(...).amount`, and checks it only against the last revision. It never checks a revision recorded after a refund against the refunds made up to that point.
  - The refund shape (direction, note, visibility, no other links) is also written twice: once built in `refundPayment`, once checked in `checkRefunds`.
  - Reproduced on port 47231:
    1. ada pays bob 1000.
    2. ada corrects it to 300, then back to 1000.
    3. bob refunds 800.
    4. Live, a further correction to 300 gives 422 `refund_exceeds_payment`, which is correct.
    5. I then edited the export so that the two corrections were recorded after the refund: recorded_at_ms set to t+1 and t+2, seq set to 5 and 6, `record_sequence` 6, `last_timestamp_ms` raised to match, receipts' recorded_at updated.
    6. The edited history says a correction to 300 was recorded while 800 had been refunded. `POST /_test/import` returned **204**.
- **Blocking?** No. The service accepts all of its own exports, and stage 1 §10 asks only for 422 on an "invalid state", so I can't point to a stated requirement that fails. Still, it shows the two copies of the rule have already drifted apart.
- **Fix:** keep one refund-cap predicate and use it on both the live path and the import path, checking it in recording order.

### 2. The correction gate relies on its callers for three correction invariants
- **Location:** `stage-4/src/state.js:241-284` (`correctPayments`). The checks themselves are in `stage-4/src/handlers/corrections.js:37-41` (`checkAgainstPayment`).
- **Principle:** Principles §1: "Every operation that changes the state they protect goes through one place that checks them and applies the whole change or none of it. A second path to that state, or one that skips the check, is a finding."
- **Evidence:**
  - `correctPayments` is the only code that changes a payment's amount. Its own comment says "The caller has already checked each item (ids, immutability, revisions, refunds)".
  - Three invariants are therefore checked only in the handler:
    - captures and refunds stay immutable;
    - a correction may not go below the refunded amount;
    - the expected revision must be current.
  - Both current callers (`createCorrection`, `batchItem`) do check them, so behaviour today is correct. A third caller of the gate would skip all three.
- **Blocking?** No. Both routes enforce the rules today: 185/185 tests pass, and my probes behaved correctly.

### 3. A batch refused with `historical_overdraft` has no test for balances or the reusable key
- **Location:** `stage-4/test/batches.test.js:150-153`.
- **Principle:** Principles §3: "For every operation that changes state, decide and test what happens … when it stops halfway. An operation without defined, tested behaviour in these cases is a finding."
- **Evidence:**
  - `insufficient_funds` is raised before anything changes. `historical_overdraft` is raised after `shiftBalances`, the clock update and the appended revisions, so it is the only refusal where the undo journal does real work.
  - The test checks only that the revision count stays 1. It doesn't check balances, the idempotency key afterwards, or statements.
  - Probe on port 47231 with a two-item batch refused 409 `historical_overdraft`:
    - balances and available for ada, bob and cy were unchanged;
    - bob's statement still showed revision 1 for every payment;
    - the same key with a different body then succeeded with 201.
  - So the behaviour is correct; only the test is missing.
- **Blocking?** No. The behaviour is right; the test coverage is short.

### 4. `addPayment` records correction batch ids with no undo step
- **Location:** `stage-4/src/state.js:444`.
- **Principle:** Principles §1 ("applies the whole change or none of it"), and the file's own rule at `state.js:54-57` that every change made inside a transaction is undone.
- **Evidence:**
  - `this.correctionBatchIds.add(...)` has no `remember(...)` call. Next to it, `refundedBy` has one, and so does `correctPayments` at line 278.
  - Today, payments created inside a transaction always have `correctionBatchId: null`, so nothing leaks. Only import passes ids through here.
- **Blocking?** No. It can't happen under current callers.

## What I checked and found sound
- **Restructure commit 6e27f54 doesn't change behaviour.**
  - For one item, the net map has the same entries in the same order, the recorded time is the same expression, and the overdraft loop covers the same users in the same order.
  - I extracted 5bd4102 and 6e27f54 to /tmp with `git archive` (nothing written to the worktree). Both pass 169/169.
  - It is committed on its own, before the new behaviour in a31216b and d8a55d1. Each of those commits serves one purpose and its message names it.
- **Available funds have one gate.** Refunds, single corrections and batches all go through `shiftBalances`, which checks available funds. Batches are judged on their combined effect (tested at batches.test.js:136-145).
- **Historical total and available.** These are checked after every revision is applied, for every affected user, through `firstOverdraft`. Refunds are covered because they are ordinary payments in `movements`.
- **Which payments may be corrected.** This is decided in one place, `model.js:72-77` (`isImmutablePayment` and `isLinkedPayment`), and import uses the same predicates.
- **Error order.** It is shared between the single and batch routes through `correctionTerms` and `checkAgainstPayment`. Items are checked in input order, then settlement completeness, then funds, then history.
- **Instant comparison keeps full precision.** It goes through `instantKey`/`effectiveKey` on every path: the future check, the one-instant-per-settlement check, the import check and replay `sameInstant`.
- **Settlement completeness.** It is checked before funds (tested). Offset spellings of the same instant are accepted.
- **Replays and receipts.**
  - Replay rules exist for both new routes and rebuild the receipts through the shared view functions.
  - Older receipts match through `LATER_FIELDS`.
  - Replays work after import; edited receipts and edited batches are rejected with 422.
  - Original payment and settlement retries return their original bodies.
- **Concurrency.**
  - Every idempotent handler is synchronous and runs in one transaction, and the state is captured once per request.
  - Tested:
    - concurrent batches and a single correction sharing an expected revision (exactly one 201, the rest `stale_revision`);
    - 10 parallel refunds stay within the cap;
    - 10 identical refunds with one key give exactly one 201.
- **Atomic rollback.** Rejected batches leave balances, revisions, statements and the key unchanged (probe above).
- **Performance**, on port 47231 against 50 users:

  | History | Workload | Result |
  |---|---|---|
  | 5000 payments | 50 concurrent 32-item batches | slowest 306 ms, all 201 |
  | 20000 payments | 50 concurrent 32-item batches | slowest 796 ms, all 201 |
  | 20000 payments, after batches | export (9.6 MB) | 112 ms |
  | same | import | 140 ms |
  | same | memory (RSS) | about 280 MB |

  All are well inside 5 s per request, 10 s for reset and import, and 2 GiB.
- **Earlier exports.** Stage 1-3 exports import with no refunds and null batch ids (tested).
- **Test suite.** `npm test` at 16fff73 passes 185/185.

I started one service process (PID-tracked, port 47231) and stopped it by its PID. My scratch files are in `/tmp/reviewer-16fff73-load/`; I wrote nothing to the worktree. Its `git status` already shows deletions under `work/acceptance/` (outside `stage-*`), which I didn't cause or touch.
