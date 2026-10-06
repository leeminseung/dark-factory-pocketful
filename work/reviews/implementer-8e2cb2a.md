# Implementer self-checks — 8e2cb2a (stage 4, round-1 findings on 16fff73)

Checks ran on a worktree at 1c92c29. Its stage folders are identical to 8e2cb2a's: the commit after 1c92c29 changes only work/stage-4/notes.md.

## Commits

| Commit | Finding | What |
|---|---|---|
| bd9a285 | R1 (blocking), S4-007, S4-014 | The refund cap is one predicate, model.js isWithinRefundCap, used by the live path and by import. Import checks it after every refund and every revision of a refunded payment, in recording order. Test: refunds.test.js R1, the reviewer's case, was 204 and is now 422. |
| 30caaa0 | R4 | Batch ids go through State.noteCorrectionBatch, which journals its change. Test: state-unit.test.js R4. |
| 8866d95 | R2 | State.checkCorrection and State.checkSettlementsWhole: the gate checks immutability, the expected revision, the refund floor and whole settlements itself. Handlers still call checkCorrection per item, to keep input order. Test: state-unit.test.js R2 calls the gate directly. |
| fa7abb4 | R3, S4-028 | Test only: after a historical_overdraft refusal, balances, the statement and the key are unchanged. |
| 57f172b | D13, design.md §5.3 | Refund rows: "Refund received" / "Refund sent" / "Refund", and the return-arrow glyph. Required elements are unchanged. Check: screen_checks.py D13. |
| 1c92c29 | R5, R6, R7 | One note line each (no change, as ruled). |
| 8e2cb2a | — | Notes: the correction gate paragraph updated for R2. |

## Commands and results

| Command | Result |
|---|---|
| `npm test`, stage-1/ to stage-4/ | 85/85, 124/124, 169/169, 188/188 |
| `harness run --track pocketful --repo <wt> --all --out checks/impl-1c92c29-all` | each folder claims its own stage (stage-4/: 4) |
| `harness run … --stage 4 --mode isolated` ×4 (checks/impl-1c92c29-iso1..4) | 4/4: claimed stage: 4 |
| `ACCEPTANCE_OUT=checks/impl-1c92c29-acceptance <suite-16f6bb0>/work/acceptance/run.sh <wt>/stage-4 4 -q` | junit: tests 1143, failures 0, errors 0, skipped 0 |
| `stage-4/test/screen_checks.py` | 28/28 PASS, exit 0 |
