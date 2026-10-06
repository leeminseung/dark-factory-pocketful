# Implementer self-checks — 6ab31ff (stage-4 final review of 236d7f8: R8–R12)

Worktree: /Users/mslee/dark-factory/band-work/worktrees/impl-6ab31ff (detached at 6ab31ff).

## Commits

| Commit | Finding | What |
|---|---|---|
| 2ed059b | R8 (blocking), stage-1/ | The receipt scope user for /settlements must be an operator. No two receipts may name the same record (WRITTEN_RECORD). Test: receipt-scope.test.js. |
| ab50bce | R8, stage-2/ | The same fix and test. |
| 16945ed | R8, stage-3/ | The same fix and test. |
| 39179e1 | R8, stage-4/ | The same, plus /correction-batches: an operator only, and named by one receipt. Test: receipt-scope.test.js, with a batch case. |
| 39c4239 | R9 (restructure) | correctPayments(entries, { kind, readItem }) reads and checks each item once and makes the batch id; behaviour-neutral. |
| 7021490 | R10 (restructure) | checkRefunds names refundedIds, amountSoFar and refundedSoFar; behaviour-neutral. |
| 17d8fa5 | R12 | An imported snapshot token is 1..64 characters (stage-4/ only). Case added to history.test.js R3. |
| 6ab31ff | R8 residual, R11, R12 | Notes. |

Each fix began with a test that failed on the unfixed folder: R8's showed 204 in every folder, and R12's case imported.

## Commands and results

| Command | Result |
|---|---|
| `npm test` in stage-1/ to stage-4/ | 87/87, 126/126, 171/171, 191/191 |
| `harness run --track pocketful --repo <wt> --all --out checks/impl-6ab31ff-all` | each folder claims its own stage |
| `harness run … --stage 4 --mode isolated` ×4 (checks/impl-6ab31ff-iso1..4) | 4/4: claimed stage: 4 |
| Acceptance at 16f6bb0: `ACCEPTANCE_OUT=checks/impl-6ab31ff-acceptance-sN <suite-wt>/work/acceptance/run.sh <wt>/stage-N N -q` | stage-4: 1143/1143; stage-3: 1050/1050; stage-2: 858/858; stage-1: 554/554 (0 failures, 0 errors, 0 skipped each) |
| `stage-4/test/screen_checks.py` | 28/28 PASS, exit 0 |
