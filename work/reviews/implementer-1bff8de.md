# Implementer self-check — stage 1 round 4, stage folder at 1bff8de

Finding: S1-013 (F3, work/reviews/acceptance-824d084.md) — a reset of 900+ users with distinct
passwords exceeded 10 s.

## Fix

1bff8de — a reset hashes its fixture as one batch at the largest scrypt N (16384 down to 256) whose
distinct passwords fit a 4 s budget on two workers, using a cost measured at startup. Login replaces
a below-full-strength seeded hash with an N=16384 one. Signup is unchanged. The trade-off is in
work/stage-1/notes.md. Regression test: `test/reset-load.test.js` "S1-013 F3" (3000 distinct: 38 s before).

## Results (clean worktree /Users/mslee/dark-factory/band-work/worktrees/impl-1bff8de)

- `cd stage-1 && npm test`: **84 tests, 84 pass, 0 fail.**
- Supplied `--stage 1`: stage 1 pass (147 passed), stage 2 fail (expected), claimed stage 1.
- Supplied `--stage 1 --mode isolated`: stage 1 pass (147 passed, 1 harness cache warning), claimed stage 1.
- Acceptance `work/acceptance/run.sh <worktree>/stage-1 1` at **eb4c27d**: pytest exit 0; junit
  **554 tests, 0 failures, 0 errors, 0 skipped** (includes `test_reset_of_1000_users_with_distinct_passwords_within_10_seconds`).

## Container probe (`--cpus 2 --memory 2g`)

| Distinct-password users | Reset |
|---|---|
| 800 | 204 in 2.46 s |
| 1000 | 204 in 3.02 s |
| 2000 | 204 in 3.02 s |
| 5000 | 204 in 3.78 s |
| 10000 | 204 in 3.93 s |

- A login 0.5 s into a 3000-user reset: 200 in 0.03 s.
- A seeded user's first login (which also upgrades the hash): 200 in 0.03 s; second login 0.03 s.
- Residual: beyond about 20000 distinct passwords even N=256 exceeds the 4 s hashing budget.
