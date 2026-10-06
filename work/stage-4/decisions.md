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

## Rounds

## Rulings

## Acceptance

## Open failures, risks, unfixed non-blocking findings

## Retro
