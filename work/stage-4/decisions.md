# Stage 4 — decisions

## Plan

- Task: Pocketful stage 4 — refunds (refund_of, cumulative limit, invalid target, available-funds debit), corrections
  updated for refunds, operator correction batches (settlement completeness, identical effective instants, error
  precedence, combined affordability), stage-1..3 export import.
- Requirements: pocketful/spec/stage-1.md..stage-4.md (read-only); supplied checks: pocketful/test/stage_1..stage_4.
- Base: stage 3 accepted at 0eaae4deeb353716ecb846b24319749daf5b5d85; `stage-4/` starts from its `stage-3/`.
- No new or changed screens: product-designer gives one non-blocking regression review in round 1.
- Order: implementer builds while test-designer writes the list -> coordinator checks the list -> suite ready ->
  rounds (acceptance; round 1 also reviewer round-1 review and screen regression review) -> final review
  (`--all --mode isolated`, stage check run more than once) -> accept.
- Handoff sent to implementer, test-designer and product-designer in 3 numbered parts (full stage-4 spec; carry-forward
  in part 2).
- List check (4044345, 37 rows): asked for S4-038..S4-041 — concurrent refunds within the limit; correction_batch_id
  on revisions (null otherwise; survives import); refund_exceeds_payment inside a batch; refunds in history.
- Suite ready 3fa4459 (1133 tests, 83 new); command `work/acceptance/run.sh stage-4 4`; sent to implementer.
  S4-038..S4-041 not yet added (crossed); re-requested.
- List complete at 41 rows (S4-038..S4-041 in 4723697); suite 16f6bb0.

## Rounds
- Round 1 started: product 16fff73 (stage folders = 7ca43e7), suite 16f6bb0; acceptance, reviewer round-1 review,
  product-designer non-blocking regression review.

## Rulings

## Acceptance

## Open failures, risks, unfixed non-blocking findings

## Retro
