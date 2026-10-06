# Acceptance check — stage 4, round 2

- Product revision: 236d7f8c54fcc22429f66dce3ef11eca54970904 (stage folders as at 8e2cb2a)
- Suite revision: 16f6bb0 (`work/acceptance/`)
- Command: `work/acceptance/run.sh <worktree>/stage-4 4`, from a detached worktree of 236d7f8. The
  runner also started the worktree's stage-1/..stage-3/ for the import tests.
- Rows covered: stage 1, 190 / 190; stage 2, 164 / 164; stage 3, 72 / 72; stage 4, 41 / 41

## Status of the previous round's failing ids

Round 1 (16fff73) had none. Still none.

## Counts

| Suite | Tests | Passed | Failed | Errors |
|---|---|---|---|---|
| stages 1–4 | 1143 | 1143 | 0 | 0 |

Supplied checks, `--stage 4 --mode isolated`, run three times on the worktree: stages 1, 2, 3 and 4
pass each time, with `claimed stage: 4`.

## Probes beyond the suite (R1, R2)

These ran through the HTTP API of a container of this build (`--cpus 2 --memory 2g`).

**R1, refund cap in recording order.** Each history: ada pays bob 1000, corrects it to *low* and
back to 1000, and bob refunds 800. The corrections are made by single correction or by batch.

| History | Expected | Actual |
|---|---|---|
| real order, low = 300 / 799 / 800, single and batch | 204 | 204 (all six) |
| edited so both corrections are recorded after the 800 refund, low = 300 and 799, single and batch. The `seq`, `recorded_at_ms`, the receipts' `recorded_at` and the clock were moved together. | 422 | 422 "refunded beyond its amount at recor[ding]…" (all four) |
| the same edit with low = 800 (exactly at the cap), single | 204 | 204. Revisions [1000, 800, 1000]; statement closing equals total. |
| the same edit with low = 800, batch | 204 | 422, but the message names the refund *receipt*, not the cap. That is my hand edit: moving the refund's `seq` ahead of two batch revisions no longer matches what the service issued. The same history made live (below) imports. Not counted. |
| live, real order: refund 800, then corrections to 800 and back to 1000, single and batch | 201, 201; export imports 204 | as expected; a further refund of 200 then fits (201) |
| live: correction to 799 after an 800 refund, single and batch | 422 `refund_exceeds_payment` | as expected |
| live: correction to exactly 800 (single, then batch); one more refund unit | 201; 422 `refund_exceeds_payment` | as expected; the export of that state imports (204) |

The live path and import agree at the cap: 799 is refused and 800 is accepted, both live and on
import, for single corrections and for batches.

**R2, gate and precedence (S4-026).** The suite's precedence tests all pass on this build:
- item errors in input order (`test_item_errors_in_input_order`);
- item errors before completeness, and completeness before funds;
- funds before history (`test_funds_before_history`);
- the refund cap as an item error (`test_refund_limit_is_an_item_error`, S4-040).

The gate keeps the stated order.

## Failures

None.

## Failing requirement ids

None.
