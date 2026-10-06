# Stage 4 — re-review of eb6e37e

- **Revision:** eb6e37e3f5450d169b03ddabc7a0ef3ce11f7b37 (stage folders = 6ab31ff).
- **Changes outside stage-4/:** stage-1/, stage-2/ and stage-3/ changed for R8, in 2ed059b, ab50bce and 16945ed.
  Each adds a receipt-scope check to `src/records.js` and a `test/receipt-scope.test.js`.
- **Rejected revision:** 236d7f8. Its report is work/reviews/review-236d7f8-final.md: CHANGES NEEDED, blocking 1.
- **Latest acceptance report:** work/reviews/acceptance-eb6e37e.md. All four folders pass the suite at 16f6bb0, with
  0 failing ids.
- **Rulings applied** (work/stage-4/decisions.md):
  - R8 scope: a non-operator scope, and two receipts naming one record, are invalid. A move between two operators, or
    to another key of the same user, is valid; this is risk S4-RISK-1.
  - R11: no change.
  - R12: optional.
- **Worktree:** /Users/mslee/dark-factory/band-work/worktrees/reviewer-eb6e37e, with `work/` deleted. It has since
  been removed.

## Verdict: PASS — blocking count 0

| Source | Count |
|---|---|
| Open blocking R findings | 0 |
| Failing requirement ids in the latest acceptance report | 0 |
| Stage folders failing the supplied checks | 0 |

## Passes run

None.
- **Why none:** this is a re-review after a rejection, which runs no new discovery passes.
- **How I checked:** I verified R8 myself, over HTTP, against four containers built from eb6e37e:
  `pocketful-reviewer-eb6e37e-s1` to `-s4`. Each was limited to 2 CPU and 2 GiB, and all have since been removed.
- **Fix-commit pass:** not run, because this is a re-review.

## Supplied checks

Whole chain, isolated:

```
cd /Users/mslee/dark-factory/dark-factory-wearedevs && .venv/bin/python -m harness run --track pocketful \
  --repo /Users/mslee/dark-factory/band-work/worktrees/reviewer-eb6e37e --all --mode isolated \
  --out /Users/mslee/dark-factory/band-work/checks/reviewer-eb6e37e-recheck-isolated
```

| Folder | Result |
|---|---|
| `stage-1/` | stage 1 pass, stage 2 fail; claims 1 |
| `stage-2/` | stages 1-2 pass, stage 3 fail; claims 2 |
| `stage-3/` | stages 1-3 pass, stage 4 fail; claims 3 |
| `stage-4/` | stages 1-4 pass; claims 4 |

Stage 4 alone was then run three more times in isolated mode (out dirs reviewer-eb6e37e-s4-isolated-1..3):

```
--stage 4 --mode isolated
```

All three passed, so stage 4 passed 4 of 4 isolated runs.

The three earlier folders changed, and each still claims its own stage. The acceptance report records each folder
passing the suite at 16f6bb0.

## Status of the rejection reason

### R8 — import accepted a receipt moved into another user's scope: **fixed in all four folders**

Each folder was set up the same way:
1. Reset with operator `u_op`.
2. `op` settles with key `sk1` → 201.
3. `ada` pays bob with key `pk1` → 201.

Then edited exports were imported:

| Edited export | stage-1 | stage-2 | stage-3 | stage-4 |
|---|---|---|---|---|
| `/settlements` receipt moved to `u_ada` (non-operator) | 422 | 422 | 422 | 422 |
| `/payments` receipt moved to `u_cy` (not the payer) | 422 | 422 | 422 | 422 |
| `/payments` receipt copied to a second key (two receipts naming one record) | 422 | 422 | 422 | 422 |
| `/correction-batches` receipt moved to `u_ada` | — | — | — | 422 |
| Unchanged export | 204 | 204 | 204 | 204 |
| `op`'s settlement retry after the unchanged import | **200** replay | **200** | **200** | **200** |
| `op`'s batch retry after the unchanged import | — | — | — | **200** |

The settlement no longer executes twice, in any folder.

Commits: 2ed059b, ab50bce, 16945ed and 39179e1.

## Non-blocking findings

| R | Status |
|---|---|
| R9: the gate checked each item twice | **fixed.** The gate checks each item once and is told the kind of correction (39c4239, restructure). Stage 4 still passes its checks and the acceptance suite. |
| R10: one name with two meanings | **fixed.** The refunded set and the running totals are now named apart (7021490, restructure). |
| R11: an imported future clock | **ruled no change.** It stays non-blocking. |
| R12: a 300-character snapshot token | **fixed** in stage-4. Imported tokens are bounded at 1-64 characters (17d8fa5); a 300-character token now gets **422**, and the unchanged export gets 204. |

## Residual risk

S4-RISK-1 is recorded by ruling: a receipt moved between two operators, or to another key of the same user, still
imports. Nothing in the state can contradict such a move.

## Status of the round-1 findings

| Finding | Status |
|---|---|
| R1, R2, R3, R4, D13 | fixed, as reported at 236d7f8 |
| R5, R6, R7 | ruled no change |

## Carry-forward

- **S1-RISK-1:** `src/passwords.js` is unchanged in all four folders. The risk stands as accepted.
- **S3-RISK-1:** closed.
- **S4-RISK-1:** new; see above.
- **S3-R17, S3-R22, S3-R24, S3-R5, S3-R18, S2-R23, S1-R17:** unchanged.
