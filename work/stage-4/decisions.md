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
- Round 1: product 16fff73, suite 16f6bb0 (1143/1143; supplied --stage 4 isolated 3x pass; work/reviews/acceptance-16fff73.md).
  Screen regression: D13 non-blocking (refund rows look like fresh payments; work/reviews/design-16fff73.md). Round-1
  review work/reviews/review-16fff73-round1.md (standards + spec briefs/raw present): R1 blocking, R2-R7 non-blocking;
  S3-RISK-1 confirmed closed. Count 0; reviewer blocking R1 -> round 2; all sent.
- Round 2 started: product 236d7f8 (stage folders = 8e2cb2a), suite 16f6bb0; acceptance + R1 probes; screen check of
  the D13 change.
- Round 2: product 236d7f8, suite 16f6bb0 (1143/1143; supplied --stage 4 isolated 3x pass; R1 probes hold;
  work/reviews/acceptance-236d7f8.md). D13 fixed, no new findings (work/reviews/design-236d7f8.md). Failing ids 0, no
  new non-blocking -> final review on 236d7f8.
- Final review of 236d7f8: CHANGES NEEDED, blocking 1 (R8: import accepts a receipt moved into another user's scope;
  owner's retry re-executes; present in stage-1..3 folders too); work/reviews/review-236d7f8-final.md (fix-commit +
  probe briefs/raw listed; supplied --all isolated pass; --stage 4 isolated 4/4). R1-R4, D13 fixed. Sent R8 (all stage
  folders) + R9-R12; rounds continue from 3 without reviewer, compared with 1.

## Rulings
- R6 (non-string payment_id in a batch -> 422): no change; D4-6 (accepted) allows 400 or 422 for wrong-type fields.
- R5, R7 (duplicate-id and same-instant checks' position): no change required; the stated precedence orders item errors,
  completeness, funds and history only, and does not place batch-shape or member-instant validation.
- R11 (imported clock ahead of real time stamps new records in the future): no change. Stage-2 ruling 2abb370 keeps clock
  bounds fixed, never relative to now; no sentence makes an imported future clock invalid. Non-blocking, recorded.
- R12 (300-character snapshot token imports): non-blocking; §3.4 bounds "IDs" at 64 characters; implementer may apply
  the same bound to tokens.

## Acceptance

## Open failures, risks, unfixed non-blocking findings

## Retro
