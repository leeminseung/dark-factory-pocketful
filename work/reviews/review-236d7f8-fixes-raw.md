Review of range 16fff73..236d7f8 (stage-4): 5 commits (R1, R4, R2, R3, D13). I found no blocking findings. I wrote nothing to any file and made no commits. I started one service on port 47311 (PID 16616) and killed it by its PID.

## Findings

**1. The correction gate checks every item twice (non-blocking, readability/smell).**
- Location: `stage-4/src/handlers/corrections.js` lines 32 and 55 (`state.checkCorrection(...)`), and `stage-4/src/state.js` `correctPayments`, first line (`for (const item of items) this.checkCorrection(...)`).
- Principle: "Another developer can find and change any one rule quickly, and each name says what the thing is for." The rule lives in one function, so this is not "Duplicated code". But the R2 commit message and the comments say the second call "is then a no-op". That is only true because nothing changes between the two calls.
- Evidence: the handlers must keep calling `checkCorrection` per item so that item errors stay in input order among the field checks. The gate then calls it again. Separately, `inBatch` is inferred from `batchId !== null`, so the gate ties "which immutability rule applies" to whether there is a batch id.
- Why not blocking: the results are identical and the precedence is unchanged. I confirmed it by reading the code and by running the batch-incomplete, batch-below-refund and single-correction-below-refund probes.

**2. `refunded` in `checkRefunds` has two meanings (non-blocking, "Mysterious name").**
- Location: `stage-4/src/records.js` `checkRefunds`, around lines 290-313.
- Principle: "each name says what the thing is for."
- Evidence: the first loop does `refunded.set(target.id, 0)` so that `refunded` acts as the set of refunded targets. The replay loop then uses the same map as the running total.
- Why not blocking: the logic is correct, and every own export I tried imported.

## Checked and found sound

- **Test suite:** `npm test` gives 188/188 pass.
- **R1, refund cap at import, in recording order** (`model.js` `isWithinRefundCap`, used by `State.requireRefundsWithin` and `records.js` `checkRefunds`): this matches the live rule. Live refunds compare against the current revision, and live corrections compare against the refunds so far, so the cap holds after every `seq` step. A refund that comes before any revision of its target is refused (`amount.has`).
  - Live probe with the history interleaved:
    1. pay 1000, refund 300, correct to 600, refund 200;
    2. correct to 499, refused 422 `refund_exceeds_payment`; correct to 500, accepted;
    3. settle two transfers and refund one member;
    4. a batch that takes a member below its refund: 422 `refund_exceeds_payment`; a partial-settlement batch: 422 `incomplete_settlement`;
    5. a whole batch including the ordinary payment: 201; a further refund up to the cap: 201; one more refund of 1: 422.
  - Result: export, then import gives 204 and a byte-identical re-export. The batch replay after import is 200 with the identical body. A statement snapshot taken before export pages the same entries after import. Refunding past the cap after import is still 422.
  - Edited exports that lower a revision below the refunds were 422. These edits also break the balances, so they don't single out the cap rule; the R1 regression test does single it out.
- **R2, gate precedence:**
  - Single correction: field validation, then 404, then 403, then `checkCorrection` (immutable, then stale, then refund floor). Same order as before.
  - Batch: item errors in input order, then completeness before same-instant, then `insufficient_funds`, then `historical_overdraft`. Same order as before.
  - `checkSettlementsWhole` now runs after `newId`, which has no observable effect. The R2 unit test calls the gate directly for all seven refusal kinds and checks that nothing is recorded.
- **R4, rollback of batch ids:** `noteCorrectionBatch` journals its change. Outside a transaction (import) `remember` does nothing. The unit test fails without the fix.
- **R3:** test-only commit. A batch refused with `historical_overdraft` leaves balances, statements and revisions unchanged, and its key is reusable (201).
- **D13, refund feed row** (`public/assets/screens/wallet.js`, `lib/ui.js`):
  - Only the meta word and the plate glyph change (`returnArrow` exists in `icons.js`; the new `data-glyph` attribute is allowed).
  - `activity-item-{id}` keeps `data-visibility`. `activity-parties-{id}` still contains both handles ("X paid Y"). `activity-amount-{id}` is still the exact formatted amount. `activity-note-{id}` is still the exact note, present even when empty.
  - `activity-list` order and `empty-activity` are untouched.
- **Commits:** each has one purpose, names its cause, and comes with a regression test or check (R1 refunds.test.js, R2 and R4 state-unit.test.js, D13 screen_checks.py). No commit is labelled as a restructure while changing behaviour.

Worktree: /Users/mslee/dark-factory/band-work/worktrees/reviewer-236d7f8/stage-4
