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
- Round 3 started: product eb6e37e (stage folders = 6ab31ff; stage-1..3 changed for R8), suite 16f6bb0 on all four
  folders; R8 probes incl. the operator-to-operator move gap.
- Round 3: product eb6e37e, suite 16f6bb0 on all four folders (1143/1050/858/554, 0 failed); supplied --stage 4 isolated
  2x pass; R8 probes: non-operator moves, cross-user copies and duplicate-key copies are 422 everywhere
  (work/reviews/acceptance-eb6e37e.md). Operator-to-operator and same-user key moves import (ruled not a failure).
  Failing ids 0 vs 1 -> re-review of eb6e37e.
- Re-review of eb6e37e: PASS, blocking 0 (work/reviews/review-eb6e37e-recheck.md, dad63f0). R8 fixed in all four
  folders; supplied --all --mode isolated: each folder claims its own stage; --stage 4 isolated 4/4.

## Rulings
- Receipt moved between two operators, or to another key of the same user (round 3): not a failure. §10 refuses "an
  invalid state"; the edited export describes a state the service itself could have produced (op2 executed it with key K),
  and no record links a settlement, batch or payment to its initiating key or operator, so it is valid and must import.
  A non-operator scope (impossible state) and two receipts naming one record (contradiction) are invalid and are 422 (R8).
  Recorded as risk S4-RISK-1.
- R6 (non-string payment_id in a batch -> 422): no change; D4-6 (accepted) allows 400 or 422 for wrong-type fields.
- R5, R7 (duplicate-id and same-instant checks' position): no change required; the stated precedence orders item errors,
  completeness, funds and history only, and does not place batch-shape or member-instant validation.
- R11 (imported clock ahead of real time stamps new records in the future): no change. Stage-2 ruling 2abb370 keeps clock
  bounds fixed, never relative to now; no sentence makes an imported future clock invalid. Non-blocking, recorded.
- R12 (300-character snapshot token imports): non-blocking; §3.4 bounds "IDs" at 64 characters; implementer may apply
  the same bound to tokens.

## Acceptance
- Accepted revision: eb6e37e3f5450d169b03ddabc7a0ef3ce11f7b37 (stage folders = 6ab31ff), status: passed.
- Reviewer report: work/reviews/review-eb6e37e-recheck.md; acceptance work/reviews/acceptance-eb6e37e.md; screens
  work/reviews/design-236d7f8.md.
- Requirement rows covered: stage 4 41/41; stage 3 72/72; stage 2 164/164; stage 1 190/190.
- stage-1/, stage-2/, stage-3/ changed after their acceptance for R8 only (2ed059b, ab50bce, 16945ed); each passes its
  acceptance suite and claims its own stage.

## Open failures, risks, unfixed non-blocking findings
- Open failures: none.
- S4-RISK-1 (ruled not a failure; next: implementer if a later stage records initiators): a receipt moved between two
  operators, or to another key of the same user, imports; the original retry then re-executes (settlements) or loses its
  replay (batches).
- S1-RISK-1 (carried). S3-RISK-1 closed.
- S4-R11 (no change): an imported clock ahead of real time stamps new records in the future.
- Carried non-blocking: S3-R17, S3-R22, S3-R24, S3-R5, S2-R23, S1-R17; history items.

## Retro
- Rejected/failed: (1) import checked the refund cap only against the final revision, so an edited history with a
  correction below the refunded amount imported (R1); (2) import never tied operator-route receipts to an operator, so a
  receipt moved to another user made a settlement run twice — present since stage 1 (R8).
- Caught by: R1 round-1 review (standards pass); R8 final-review probe.
- Slipped late: R8 passed every suite and the stage-2 receipt-edit standing tests, which edited fields but never the
  scope; D13 (refund rows indistinguishable) was caught only by the screen regression review.
- Rounds: 3 plus round-1 review, final review and re-review. Round 1 -> 2 on R1; final review rejected on R8; round 3
  (1 -> 0); re-review passed.
- Watch (test-designer): receipt-edit standing tests must also move scope (user, key) on every route.
- Watch (implementer): any import rule must be evaluated in recording order, the same predicate as the live path.
- Watch (product-designer): each new payment kind needs its own feed wording.
