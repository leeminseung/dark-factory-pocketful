# Implementer self-check — stage 1 round 3, stage folder at 6e91768

Base: d0f71b1 (final review rejected; reports review-d0f71b1-final.md, acceptance-d0f71b1.md).
Clean worktree `/Users/mslee/dark-factory/band-work/worktrees/impl-6e91768` (acceptance suite 94de59b).

## Findings → commits (one purpose per commit; failing test first for each fix)

| Finding | Commit | Kind | Regression test (failed before) |
|---|---|---|---|
| — | 5be2e0e | restructure: JSON parse + canonical form into src/json.js (72/72 before/after) | — |
| R13, R14 | ef2b627 | fix: numbers JSON.parse would round to another integer become InexactNumber → 422 | test/numbers.test.js |
| R15 | 3e3fd38 | fix: reset ignores request payment_id / payment request_id | control-settlements "R15" |
| R20 | 7153b63 | restructure: records.js checkRecords shared by reset and import (76/76; one untested 400/422 ordering noted in message) | — |
| R11 / F1 | 459996a | fix: isTimestampMs (0..9999-12-31) on every stored time | control-settlements "R11" |
| R11 (no 5xx commits) | 667a5f0 | fix: State.transaction undo journal; every sync handler + its key record runs in one | test/state.test.js |
| R12 / F2 | 01d0aa6 | fix: cross-record rules (links both ways, split sums/requests, settlement membership, scope/fingerprint form, 201 responses, unique tokens/scopes; `seeded` flag for fixture paid requests) | control-settlements "R12" |
| R16 | 3a2e425 | fix: one scrypt per distinct password per reset, two at a time; per-user HMAC | test/reset-load.test.js (was 13.8 s) |
| R18 | 89f1880 | fix: fatal UTF-8 decoding → 400 | robustness "R18" |
| R22 | 1da4614 | fix: closeRequest only accepts terminal statuses | state.test.js "R22" |
| R23, R17, R19, R21 | 6e91768 | test + notes: Promise-returning handler is rolled back; unfixed items recorded | state.test.js "R23" |

## Results

- `cd stage-1 && npm test`: **83 tests, 83 pass, 0 fail.**
- Supplied `--stage 1`: stage 1 pass (147 passed), stage 2 fail (expected), claimed stage 1.
- Supplied `--stage 1 --mode isolated`: stage 1 pass (147 passed, 1 harness cache warning), claimed stage 1.
- Acceptance `work/acceptance/run.sh <worktree>/stage-1 1` (suite 94de59b): pytest exit 0; junit
  **553 tests, 0 failures, 0 errors, 0 skipped**.
- Container probe (`--cpus 2 --memory 2g`): reset of 1001 users (one password) 204 in 0.08 s;
  login during a 2000-user reset 200 in 0.05 s; reset of 300 users with distinct passwords 3.62 s.

## Known residual

Fixtures with roughly 800+ *distinct* passwords still exceed the 10 s reset limit (one scrypt each).
Recorded with its trade-off in work/stage-1/notes.md.
