# Stage 3 — re-review of 744bfd4

- **Revision:** 744bfd408a8737d6d1ada12ad6ee1b842c3199d9 (stage folders = e03b834). stage-1/ and stage-2/ are
  unchanged since 048a821.
- **Rejected revision:** e03c437. Its report is work/reviews/review-e03c437-final.md: CHANGES NEEDED, blocking 7.
- **Latest acceptance report:** work/reviews/acceptance-744bfd4.md. The suite at cc78f4d passes 1050/1050, with 0
  failing ids.
- **Rulings:** work/stage-3/decisions.md.
- **Worktree:** /Users/mslee/dark-factory/band-work/worktrees/reviewer-744bfd4, with `work/` deleted. It has since
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
- **How I checked:** I verified each rejection reason myself, over HTTP, against a container built from
  `stage-3/` at 744bfd4 (`pocketful-reviewer-744bfd4`, limited to 2 CPU and 2 GiB). It has since been removed.
- **Fix-commit pass:** not run, because this is a re-review. The fix commits are a365d73..cba0a4d.

## Supplied checks

Whole chain, isolated:

```
cd /Users/mslee/dark-factory/dark-factory-wearedevs && .venv/bin/python -m harness run --track pocketful \
  --repo /Users/mslee/dark-factory/band-work/worktrees/reviewer-744bfd4 --all --mode isolated \
  --out /Users/mslee/dark-factory/band-work/checks/reviewer-744bfd4-recheck-isolated
```

| Folder | Result |
|---|---|
| `stage-1/` | stage 1 pass, stage 2 fail; claims 1 |
| `stage-2/` | stages 1-2 pass, stage 3 fail; claims 2 |
| `stage-3/` | stages 1-3 **pass**, stage 4 fail (expected); claims 3 |

R16 was intermittent, so I also ran stage 3 alone in isolated mode four more times (out dirs
reviewer-744bfd4-s3-isolated-1..4), using `--stage 3 --mode isolated`. All four passed, so stage 3 passed 5 of 5
isolated runs.

## Status of each rejection reason

### R13 — statement reads advanced the clock: **fixed**

- **What changed:** 59e453e. Reads never move the clock any more; snapshots use a recording sequence number
  (`record_sequence`, held in each snapshot as `seq`).
- **Reproduced:**
  1. 50 threads read `GET /statement?limit=1` for 5 s, 22,777 reads in all.
  2. A payment made straight afterwards has `created_at` **−0.002 s** from real time. In the rejected revision the
     same test gave +17 s.

### R14 / S3-043 / S3-009 — instants were truncated to the millisecond: **fixed**

What changed: 0a6dc6f compares instants at the precision they were given.

| Check | Result |
|---|---|
| A payment seeded at `…00:00:00.0005Z` | served back as `…00:00:00.0005+00:00` |
| `as_of=…0003Z` | 995: the payment has not happened yet |
| `as_of=…0005Z` | 1000: inclusive |
| `to=…0006Z` | 1 entry |
| `from=…0006Z` | 0 entries |
| A correction moved to `effective_at …00.0007Z` | **409 `historical_overdraft`** (the 0.7 ms overdraft is no longer hidden) |

The acceptance report shows S3-043 and S3-009 passing.

### R15 — snapshot import accepted a watermark equal to the clock: **fixed**

- **What changed:** with R13, the watermark is now a sequence number.
- **Reproduced:** an export edited so that the snapshot's `seq` equals the state's `record_sequence` is refused with
  **422**.
- **Test:** 88c458a adds a test that an edited export cannot add a payment to an old snapshot.

### R16 — payments in the same millisecond came out in random order; the supplied check failed intermittently: **fixed**

- **What changed:** a365d73. Payments made one after another keep that order, even within one millisecond.
- **Reproduced:** 300 back-to-back pairs of 300 then 200, read over 3 statement pages: **0** pairs out of order.
- **Supplied check:** stage 3 passed 5 of 5 isolated runs (above).

## Non-blocking findings

| R | Status |
|---|---|
| R17: snapshot memory per first read | **left, with reasons in notes.md.** It stays non-blocking. |
| R18: a fix commit with no test of its own | **left** (history; noted). |
| R19: a loosened timing bound | **fixed.** The 1 s bound on a login during a reset is restored (b016789). |
| R20: a second, uppercase-only instant pattern | **fixed.** It was dropped (4405742). |
| R21: gaps in the random-history tests | **fixed.** The tests now cover never-held holds, captures after close and sub-millisecond ties (cba0a4d). |
| R22: leap seconds refused | **left, with reasons in notes.** |
| R23: a seeded authorization with `created_at` after `expires_at` | **fixed.** It is now 422; reproduced (4612041). |
| R24: API lists repeat rows across pages under writes | **left, with reasons in notes.** No paging-stability rule is stated for these lists. |
| R5: stage-2 voids have no void time | **left.** A stage-2 export cannot carry one. |

## Status of the round-1 findings

| R | Status |
|---|---|
| R1, R2, R3, R6, R7, R8, R9 | fixed, as reported at e03c437 |
| R10 | fixed through R14 |
| R12 | fixed through R19 and R21 |
| R4 | ruled no change |
| R11 | history |
| R5 | left |

## Carry-forward

- **S1-RISK-1:** password storage is unchanged; `stage-3/src/passwords.js` is identical to the accepted
  `stage-2/` copy. The risk stands as accepted.
- **S2-R23, S2-R19, S2-R8, S1-R19, S1-R21, S1-R17:** unchanged.
