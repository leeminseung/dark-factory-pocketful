# Implementer self-checks — 7ca43e7 (stage 4, first revision for checking)

Worktree: /Users/mslee/dark-factory/band-work/worktrees/impl-7ca43e7 (detached at 7ca43e7).

## Commits (stage-4/)

| Commit | Serves | What |
|---|---|---|
| 4abf327 | — | stage-4/ copied from 0eaae4d:stage-3 with `git archive`, unchanged |
| 6e27f54 | Batch corrections (restructure) | State.correctPayment → correctPayments(items): one gate for a list of corrections; behaviour-neutral, 169/169 |
| a31216b | S4-003..S4-015, S4-034, S4-036..S4-038, S4-041 | Refunds: route, refund_of on every payment, the order of checks, refunded total per payment, available-funds debit, captures and refunds immutable, corrections not below refunds, records, export and import, replay rule; refunds.test.js |
| d8a55d1 | S4-016..S4-033, S4-035..S4-037, S4-039, S4-040 | Correction batches: route (operator, idempotent), shape, item checks in input order, completeness, one effective instant per settlement, combined funds and history, shared recorded_at, correction_batch_id, records, export and import, replay rule; batches.test.js, scale.test.js |
| 7ca43e7 | — | RUN.md and package description name stage 4; work/stage-4/notes.md |

stage-1/ to stage-3/ are unchanged.

## Commands and results

| Command | Result |
|---|---|
| `npm test` in stage-1/ to stage-4/ | 85/85, 124/124, 169/169, 185/185 |
| `harness run --track pocketful --repo <wt> --stage 4 --out checks/impl-7ca43e7-s4` | stages 1–4 pass; claimed stage: 4 |
| `harness run … --all --out checks/impl-7ca43e7-all` | stage-1/ to stage-4/ each claim their own stage |
| `harness run … --stage 4 --mode isolated` ×4 (checks/impl-7ca43e7-iso1..4) | 4/4: claimed stage: 4 |
| `ACCEPTANCE_OUT=checks/impl-7ca43e7-acceptance work/acceptance/run.sh <wt>/stage-4 4 -q` (preview: suite as committed at 7d3ca63, not yet announced) | junit: tests 1143, failures 0, errors 0, skipped 0 |
| `stage-4/test/screen_checks.py` | 27/27 PASS, exit 0 |

## Not done

- Nothing in the stage-4 specification is left unbuilt.
- The formal acceptance run waits for the suite revision and command from the coordinator.
