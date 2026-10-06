# Stage 3 — decisions

## Plan

- Task: Pocketful stage 3 — payment timestamps, GET /me as_of/known_at (incl. historical holds), GET /statement
  with snapshots, payment corrections and revisions (effective vs recorded time), settlement/capture immutability,
  stage-1/stage-2 export import.
- Requirements: pocketful/spec/stage-1.md..stage-3.md (read-only); supplied checks: pocketful/test/stage_1..stage_3.
- Base: stage 2 accepted at 048a821c5d28d6ed2708e72a8be7154ae77ca392; `stage-3/` starts from its `stage-2/`.
- No new or changed screens: product-designer gives one non-blocking regression review in round 1.
- Order: implementer builds while test-designer writes the list -> coordinator checks the list -> suite ready ->
  rounds (acceptance; round 1 also reviewer round-1 review and screen regression review) -> final review
  (`--all --mode isolated`) -> accept.
- Handoff sent to implementer, test-designer and product-designer in 4 numbered parts (full stage-3 spec; carry-forward
  S1-RISK-1, S2-R23, S2-R19, S1-R17 and watch items in part 3).
- List check (52fafae, 67 rows): asked for 5 more — correction insufficient_funds against available; correction field
  wrong types (decision); seeded payment/authorization created_at format and future (reset and import); revisions on
  unknown payment 404; extreme query instants never 5xx / non-RFC 3339.
- Suite ready c9e81b1 (994 tests: 554 + 304 + 136); command `work/acceptance/run.sh stage-3 3`; sent to implementer.
  List-check rows not yet added; re-requested as S3-070..S3-074.
- List complete at 72 rows (S3-070..S3-074 in 5bf221d, D3-8); suite 3891982 (1050 tests).

## Rounds

## Rulings

## Acceptance

## Open failures, risks, unfixed non-blocking findings

## Retro
