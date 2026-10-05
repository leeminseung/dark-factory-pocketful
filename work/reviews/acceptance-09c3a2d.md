# Acceptance check — round 1

- Product revision: 09c3a2d14b1aecf557e786eb2ff2cfa5f9001e2a (stage-1/ as at bf9d8e6)
- Suite revision: 94de59b (`work/acceptance/`, unchanged at the time of the run)
- Command: `work/acceptance/run.sh <worktree>/stage-1 1`, built from a detached worktree of 09c3a2d
- Rows covered: 190 / 190 (187 with tests; S1-008, S1-014, S1-015 not testable, reasons in the list)
- Suites run: stage 1 (the only stage so far)

## Counts

| Tests | Passed | Failed | Errors |
|---|---|---|---|
| 553 | 553 | 0 | 0 |

First healthy response 0.24 s after container start.

## Previous round

None: this is round 1. The informal preview on f636c55 had failed S1-058, S1-059, S1-070, S1-073,
S1-157, S1-158 and S1-189; every one of those tests passes on 09c3a2d.

## Failures

None. No blocking findings from the acceptance suite.
