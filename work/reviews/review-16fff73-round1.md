# Stage 4 — round-1 review of 16fff73

- **Revision:** 16fff7308f5aba7ab638887d83476a04c2a40bb9 (stage folders = 7ca43e7). stage-1/..stage-3/ are unchanged
  since 0eaae4d.
- **Range:** `git diff 4abf327 16fff73 -- 'stage-*'`. Commit 4abf327 created `stage-4/` as a copy of the accepted
  `stage-3/`.
- **Worktree:** /Users/mslee/dark-factory/band-work/worktrees/reviewer-16fff73, with `work/` deleted.
- **Requirements:**
  - spec stage-4.md, which builds on stages 1-3;
  - work/stage-4/requirements.md (S4-001..S4-041, D4-1..D4-7);
  - work/stage-4/decisions.md, which has no rulings yet.
- **Case memory:** work/case-memory.md, read at the start of the stage.
- A round-1 review gives no verdict.

## Passes run

| Pass | Brief | Raw answer |
|---|---|---|
| standards | work/reviews/review-16fff73-standards-brief.md | work/reviews/review-16fff73-standards-raw.md |
| spec | work/reviews/review-16fff73-spec-brief.md | work/reviews/review-16fff73-spec-raw.md |

How they were run:
- **Starting the subagents:** each brief is about 62 KB, so each subagent was started with a one-line instruction to
  read a byte-identical, read-only copy of its brief in /tmp.
- **Ports:** each pass had its own port range, standards 47000-47499 and spec 47500-47999. They did not collide.
- **Test suite:** both passes ran `npm test`, 185/185 pass.

**Raw findings:** 7 in total.
- The standards pass reported 4.
- The spec pass reported 3.

**After verification:**
- 7 findings, R1-R7.
- I raised one to blocking, against the pass's proposal: standards #1, which became R1. The reason is under R1.
- None dismissed.

## Findings

### R1 — BLOCKING: import checks the refund cap only against the final revision, so it accepts a history in which a correction below the refunded amount was recorded after the refunds

- **Location:**
  - `stage-4/src/records.js:286-302` (`checkRefunds`) checks `total <= currentRevision(target).amount` once, against
    the last revision.
  - The live rule (`state.js:297-316` `requireRefundsWithin`, `corrections.js:40`) applies the cap at every step.
  - Source: standards #1, which proposed non-blocking.
- **Requirements:**
  - stage 4 "Refunds cumulatively may not exceed the payment's current corrected amount";
  - stage 4 "A correction cannot reduce a payment below its already-refunded amount";
  - stage 1 §10 "an invalid state give 422 `validation_failed` without changing the destination".
- **Evidence:**
  - From the code: no check compares a revision recorded after a refund with the refunds made up to that point.
  - The pass reproduced it:
    1. ada pays bob 1000, then corrects it to 300 and back to 1000.
    2. bob refunds 800.
    3. Live, a correction to 300 is refused with 422 `refund_exceeds_payment`.
    4. The export is edited so the two corrections are recorded after the refund (`recorded_at`, `seq`,
       `record_sequence` and the clock adjusted to match).
    5. `POST /_test/import` → **204**.
- **Why blocking:** the edited history records a correction that the stated rule forbids, so it is an invalid state.
  This is the case-memory class "Import an export whose records contradict each other … refuse with 422", which was
  blocking in stage 1 (S1-R12).
- **Fix direction:** one refund-cap predicate, used on the live path and on import. On import, check it in recording
  order (refunds and revisions interleaved by `seq`).

### R2 — non-blocking: the correction gate relies on its callers for three invariants

- **Location:** `state.js:241-284` `correctPayments`. The three checks live only in `corrections.js:37-41`:
  - captures and refunds are immutable;
  - a correction may not go below the refunded amount;
  - the expected revision must be current.
- **Source:** standards #2.
- **Principle 1:** "Every operation that changes the state they protect goes through one place that checks them."
- **Why non-blocking:** both callers check today.

### R3 — non-blocking: a batch refused with `historical_overdraft` is not tested for balances, statements or key reuse

- **Location:** `test/batches.test.js:150-153`.
- **Source:** standards #3.
- **Why non-blocking:** the behaviour was probed correct. Only the test is missing.
- **Principle 3.**

### R4 — non-blocking: `addPayment` adds correction batch ids with no undo step

- **Location:** `state.js:444`.
- **Source:** standards #4.
- **Why non-blocking:** current callers never pass a batch id inside a transaction.
- **Principle 1.**

### R5 — non-blocking: duplicate payment ids in a batch are reported before item errors

- **Location:** `corrections.js:63`.
- **Source:** spec N1.
- **Requirement:** stage 4 "corrections contains 1..32 objects with distinct payment_ids, else 422
  `validation_failed`" and "Error precedence is: item errors in input order, …".
- **Why non-blocking:** distinct ids reads as a rule about the batch's shape, and the stage-1 settlement precedent
  treats a malformed shape the same way.

### R6 — non-blocking: a non-string `payment_id` in a batch item gives 422, not 400

- **Location:** `corrections.js:69`.
- **Source:** spec N2.
- **Requirement:** stage 1 §5 "Reserve 400 `malformed_request` for … a field of the wrong type" versus stage 3
  "Invalid input is 422 `validation_failed`".
- **Why non-blocking:** it follows the correction endpoint's existing all-422 rule. The coordinator may rule.

### R7 — non-blocking: the "identical effective instants" rule for settlement members is checked after completeness

- **Location:** `corrections.js:89` and `:93`.
- **Source:** spec N3.
- **Requirement:** stage 4. The precedence list does not place this rule, so the current order is reasonable.

## Dismissed

None.

## Carry-forward

- **S3-RISK-1, confirmed closed.** Revision selection uses the recording sequence (`ledger.js:23`:
  `rev.seq <= upToSeq`, with the snapshot's `seq` taken from `state.recordSequence` in `history.js:102`). A write in
  the same millisecond as a snapshot can no longer join it, including at the clock bound.
- **S1-RISK-1:** `passwords.js` is untouched in the stage-4 diff. The risk stands as accepted.
- **Earlier unfixed non-blocking findings:** S3-R17, S3-R22, S3-R24, S3-R5, S3-R18, S2-R23 and S1-R17 are unchanged.
- **Stage-3 watch items:**
  - instants keep full precision (both passes);
  - same-millisecond order holds (spec pass);
  - the two new idempotent routes have replay rules (standards).
- **Performance, as measured by the standards pass:** with 20,000 payments, 50 concurrent 32-item batches answer
  within 796 ms at most; export/import of 9.6 MB takes 112/140 ms; memory is about 280 MB.

## Status of earlier R findings

This is the first review of stage 4. The stage-3 R findings are closed per review-744bfd4-recheck.md.

## Summary

- 1 blocking finding: R1.
- 6 non-blocking findings: R2-R7.
- No verdict at round 1.
