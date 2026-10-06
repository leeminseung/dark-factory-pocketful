# Stage 4 — final review of 236d7f8

- **Revision:** 236d7f8c54fcc22429f66dce3ef11eca54970904 (stage folders = 8e2cb2a). stage-1/..stage-3/ are
  unchanged since 0eaae4d.
- **Round-1 revision:** 16fff73 (report: work/reviews/review-16fff73-round1.md).
- **Requirements:**
  - spec stage-4.md, which builds on stages 1-3;
  - work/stage-4/requirements.md (S4-001..S4-041, D4-1..D4-7);
  - rulings in work/stage-4/decisions.md: R5/R7 no change; R6 no change (D4-6).
- **Latest acceptance report:** work/reviews/acceptance-236d7f8.md. The suite at 16f6bb0 passes 1143/1143, with 0
  failing ids.
- **Design report:** work/reviews/design-236d7f8.md: D13 fixed, no regressions.
- **Case memory:** work/case-memory.md. Its cases were written out in the probe brief.
- **Worktree:** /Users/mslee/dark-factory/band-work/worktrees/reviewer-236d7f8, with `work/` deleted. It has since
  been removed.

## Verdict: CHANGES NEEDED — blocking count 1

| Source | Count |
|---|---|
| Open blocking R findings: R8 | 1 |
| Failing requirement ids in the latest acceptance report | 0 |
| Stage folders failing the supplied checks | 0 |
| **Total** | **1** |

## Supplied checks

```
cd /Users/mslee/dark-factory/dark-factory-wearedevs && .venv/bin/python -m harness run --track pocketful \
  --repo /Users/mslee/dark-factory/band-work/worktrees/reviewer-236d7f8 --all --mode isolated \
  --out /Users/mslee/dark-factory/band-work/checks/reviewer-236d7f8-final-isolated
```

| Folder | Result |
|---|---|
| `stage-1/` | stage 1 pass, stage 2 fail; claims 1 |
| `stage-2/` | stages 1-2 pass, stage 3 fail; claims 2 |
| `stage-3/` | stages 1-3 pass, stage 4 fail; claims 3 |
| `stage-4/` | stages 1-4 pass; claims 4 |

Stage 4 alone was then run three more times in isolated mode (out dirs reviewer-236d7f8-s4-isolated-1..3):

```
--stage 4 --mode isolated
```

All three passed, so stage 4 passed 4 of 4 isolated runs.

## Passes run

| Pass | Brief | Raw answer |
|---|---|---|
| fix-commit (16fff73..236d7f8) | work/reviews/review-236d7f8-fixes-brief.md | work/reviews/review-236d7f8-fixes-raw.md |
| black-box probe | work/reviews/review-236d7f8-probe-brief.md | work/reviews/review-236d7f8-probe-raw.md |

How the passes were run:
- **Starting the subagents:** each subagent was told in one line to read a byte-identical, read-only copy of its brief
  in /tmp. The briefs are 62 KB and 207 KB.
- **Ports:** the fix-commit pass was confined to ports 47000-47999.
- **Probe targets:** four containers, each limited to 2 CPU and 2 GiB. All four have since been removed.

  | Build | Container | Port | Use |
  |---|---|---|---|
  | stage-4 | `pocketful-reviewer-236d7f8-s4` | 50138 | under test |
  | stage-3 | `pocketful-reviewer-236d7f8-s3` | 50136 | real older-stage exports |
  | stage-2 | `pocketful-reviewer-236d7f8-s2` | 50134 | real older-stage exports |
  | stage-1 | `pocketful-reviewer-236d7f8-s1` | 50133 | real older-stage exports |

- **Probe scope:** HTTP plus headless Chromium for the screens, because the D13 change touched the feed.

**Raw findings:** 5 in total.
- The fix-commit pass reported 2, both non-blocking.
- The probe reported F1, O1 and one minor note.

**Verification:**
- I reproduced F1 myself on the stage-4 build, using a `/settlements` receipt. It is worse than reported: see R8.
- All 5 raw findings became findings, R8-R12. None was dismissed.

## Status of round-1 findings and D13

| Finding | Status | Evidence |
|---|---|---|
| R1 (blocking): import checked the refund cap only against the final revision | **fixed** | bd9a285 adds one predicate (`model.js` `isWithinRefundCap`), used live and on import in recording order, with a regression test. An interleaved history (refunds, corrections, a settlement refund, a batch) round-trips to a byte-identical export. |
| R2: the gate relied on its callers | **fixed** | 8866d95. The gate checks immutability, the expected revision, the refund floor and whole settlements itself, and the precedence is unchanged (fix-commit pass). The remainder is R9. |
| R3: no test after a `historical_overdraft` refusal | **fixed** | fa7abb4 tests balances, statements and key reuse. |
| R4: batch ids had no undo step | **fixed** | 30caaa0, with a unit test that fails without the fix. |
| R5, R7 | ruled no change | — |
| R6 | ruled no change (D4-6) | — |
| D13: refund rows looked like payments | **fixed** | 57f172b. Every required `data-testid` and text rule is unchanged (fix-commit pass, probe, design report), with no 375 px overflow (probe). |

## New findings

### R8 — BLOCKING: import accepts an idempotency receipt moved into another user's scope; the rightful owner's retry then executes again

- **Source:** probe F1.
- **Location:** stage-4 import validation of `state.idempotency` scopes for `/settlements` and `/correction-batches`.
  The probe found the same gap in the stage-1, stage-2 and stage-3 builds. Refund receipts are already refused.
- **Requirements:**
  - stage 1 §10 "missing fields, wrong track/version or an invalid state give 422 `validation_failed` without changing
    the destination";
  - stage 1 §10 "Preserve … all completed idempotent request bodies and original responses";
  - stage 1 §7 "The operation takes effect only once."
- **Reproduced** on the stage-4 build:
  1. Reset with operator `u_op`.
  2. `op` posts a two-transfer settlement with key `sk1` → 201.
  3. Export, and change the `/settlements` receipt's scope user from `u_op` to `u_ada`, who is not an operator.
  4. Import → **204**.
  5. `op` repeats the identical request with `sk1` → **201**. The settlement executed a second time. With the
     unedited export, this request replays with 200.
- **The probe also showed:** with a `/correction-batches` receipt, the operator's identical retry gets 409
  `stale_revision`. The completed retry is lost.
- **Why blocking:**
  - It is an invalid state: a non-operator holds a receipt for an operator-only write.
  - A completed retry is lost, and money moves twice.
  - This is the case-memory class "Edit any single field of a stored idempotency receipt in an export … import must
    refuse it".
- **Fix direction:** on import, check every receipt's scope against the rules of its own route: who may call that path,
  and which records it names. This is the check already done for refund receipts. Apply it in `stage-4/`.

### R9 — non-blocking: the correction gate checks every item twice, and infers "in a batch" from `batchId !== null`

- **Location:** `corrections.js:32` and `:55`; `state.js` `correctPayments`.
- **Source:** fix-commit #1.
- **Principle 6.** The results are identical.

### R10 — non-blocking: `refunded` in `checkRefunds` has two meanings (set and running total)

- **Location:** `records.js` around lines 290-313.
- **Source:** fix-commit #2.
- **Smell:** Mysterious name.

### R11 — non-blocking, may need a ruling: an imported clock ahead of real time stamps new records in the future

- **Source:** probe O1.
- **Evidence:** importing `last_timestamp_ms` = now + 1 h (or + 1 year) gives 204. Afterwards:
  - new `created_at` / `recorded_at` values are in the future;
  - an `effective_at` 30 minutes ahead of real time is accepted.
- **Requirements:**
  - stage 3 "`created_at` … identifying when it moved money";
  - stage 4 "Effective times cannot be later than now".
- **Why non-blocking:**
  - It needs a tampered export.
  - The stage-2 ruling deliberately bounds the clock by a fixed constant, never by the current time.
  - No text calls a future clock invalid.

### R12 — non-blocking: a 300-character snapshot token imports and works

- **Source:** probe minor note.
- **Why non-blocking:** the 64-character limit is for IDs, and no length is stated for tokens.

## Carry-forward

- **S3-RISK-1:** closed, as confirmed in round 1.
- **S1-RISK-1:** password storage is unchanged. The risk stands as accepted.
- **S3-R17, S3-R22, S3-R24, S3-R5, S3-R18, S2-R23, S1-R17:** unchanged.
- **The stage-3 watch items hold** (probe):
  - sub-millisecond instants;
  - same-millisecond order over 30-40 loops;
  - memory is flat, at 108 MiB after 2000 snapshots;
  - the clock does not drift under reads.

## Found sound (from the passes)

- **Refunds:** every rule.
- **Batches:** every rule, including the error precedence and combined affordability.
- **Concurrency:** at most one of any set of conflicting corrections succeeds.
- **Exports:** real stage-1, stage-2 and stage-3 exports import. 71 of 73 edited-export cases are refused.
- **Limits:**
  - with 20k payments, reset takes 0.4 s, export 0.2 s and import 0.3 s;
  - 300 concurrent 32-item batches finish within 3.5 s at most;
  - a reset of 1,500 users takes 2.3 s, with a login during it answering in 0.03 s.
- **Stage-2 screens** are unbroken, including at 375 px.
