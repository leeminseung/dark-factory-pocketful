# Acceptance check — stage 4, round 1

- Product revision: 16fff7308f5aba7ab638887d83476a04c2a40bb9 (stage folders as at 7ca43e7)
- Suite revision: 16f6bb0 (`work/acceptance/`)
- Command: `work/acceptance/run.sh <worktree>/stage-4 4`, from a detached worktree of 16fff73. The
  runner also started the worktree's stage-1/, stage-2/ and stage-3/ for the import tests.
- Rows covered: stage 1, 190 / 190; stage 2, 164 / 164; stage 3, 72 / 72; stage 4, 41 / 41
- Suites run: stages 1–4 against stage-4/. stage-1/..stage-3/ are unchanged since they were
  accepted, so they were not rechecked.

## Previous round

None: this is stage 4's round 1.

## Counts

| Suite | Tests | Passed | Failed | Errors |
|---|---|---|---|---|
| stages 1–4 | 1143 | 1143 | 0 | 0 |

Supplied checks, `--stage 4 --mode isolated`, run three times on the worktree. Each run: stage 1
35/35, stage 2 147/147, stage 3 6/6 and stage 4 5/5 passing, `claimed stage: 4`.

## Failures

None. No blocking findings from the acceptance suite.
