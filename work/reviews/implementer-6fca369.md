# Implementer self-check — stage 1 round 2, stage folder at 6fca369

Clean worktree `/Users/mslee/dark-factory/band-work/worktrees/impl-6fca369` (acceptance suite there at 94de59b).

## Round-1 findings → commits (one defect or restructuring per commit)

| Finding | Commit | Kind | Failing test first |
|---|---|---|---|
| R9 | 6015aee | tests: splits replay/409/concurrent, requests same-key concurrent, concurrent pays (one key / many keys), pay racing decline+cancel, concurrent decline/cancel, settlements same-key concurrent | — (pins current behaviour) |
| R7 (part) | 2947d77 | restructure: model rules into `src/model.js` | 67/67 before and after |
| R1 BLOCKING | b82da36 | fix: import validates records with the model.js rules (ids ≤ 64, email form, notes, parties, amounts, …) | `control-settlements.test.js` "R1 S1-158 …" |
| R2 | 1299036 | fix: key scope = user, method, route pattern, decoded params, key | `idempotency-splits.test.js` "R2 S1-088 …" |
| R3 | b6b6c26 | fix: decline/cancel — absent/empty body 200, non-empty unparseable 400 (ruling R3) | `robustness.test.js` "R3: …" |
| R5 | 0fc7141 | restructure: `State.closeRequest` is the only status change | R9 tests, 69/69 |
| R6 | 8e4d4dc | restructure: `handlers/handles.js` (userWithHandle, counterparty) | 69/69 |
| R7 | 7d084dc | restructure: splitView/settlementView in views.js; camelCase split/settlement records; import checks them | new split export/import test |
| R8 | 6fca369 | fix: `defineRoutes` refuses async idempotent handlers at startup | `routes.test.js` |
| R4 | — | ruled no change | — |
| R10 | — | history kept as is; this round follows one-defect-per-commit | — |

## Results

- `cd stage-1 && npm test`: **72 tests, 72 pass, 0 fail.**
- Supplied `--stage 1`: stage 1 pass (147 passed), stage 2 fail (expected), claimed stage 1.
- Supplied `--stage 1 --mode isolated`: stage 1 pass (147 passed, 1 harness cache warning), claimed stage 1.
- Acceptance `work/acceptance/run.sh <worktree>/stage-1 1` (suite 94de59b): pytest exit 0;
  junit **553 tests, 0 failures, 0 errors, 0 skipped**. Logs: `/Users/mslee/dark-factory/band-work/checks/acc-impl-6fca369/`.
