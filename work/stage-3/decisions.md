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
- Round 1 started: product 6a17d63 (stage-3 = e6ee3d8); suite after test-designer's fix of the created_at stage-1 test;
  acceptance check, reviewer round-1 review, product-designer non-blocking regression review.
- Round 1: product 6a17d63, suite cc78f4d (1050/1050; work/reviews/acceptance-6a17d63.md). Screen regression review:
  no findings (work/reviews/design-6a17d63.md). Round-1 review work/reviews/review-6a17d63-round1.md (standards + spec
  briefs/raw present): R1, R2, R3 blocking; R4-R12 non-blocking. Count 0; reviewer blocking -> round 2; all sent.
- Round 2 started: product e03c437 (stage-3 = 123af1b), suite cc78f4d; acceptance + probes of R1-R3, R6, R10.

## Rulings
- Seeded payment `created_at: "not-a-time"` (stage-1 test test_fixture_fields_outside_the_format_are_ignored fails on
  the stage-3 build): 422 is correct from stage 3 on. Stage 3: "The requirements from stages 1 and 2 continue to apply,
  with the additions below" and "Seeded payments may supply `created_at`" — the field is now part of the fixture format,
  so S1-025's "unknown fields ... ignored" no longer covers it; §5 "A field of the correct JSON type with an invalid
  format ... gives 422"; S3-072 already requires 422. The stage-1 test must use a field no stage defines (test-designer).
- R3 (snapshot tokens lost on export/import): BLOCKING. Stage 3: "Tokens last until reset."; §10: "Existing receipts,
  tokens and retries must remain valid after import". Import is not reset, and the unqualified "tokens" covers snapshot
  tokens; snapshots are service state and must be exported and imported (owner/user binding kept).
- R4 (from later than to -> 422): no change. No sentence defines such a window, and statement rule 3 ("opening_balance
  plus all delta values ... must equal closing_balance") cannot hold for an inverted window, so it is "a stated rule ...
  violated" (§5) -> 422.
- R6 (lowercase t/z): non-blocking; implementer's choice, but one rule for every instant the service parses.

## Acceptance

## Open failures, risks, unfixed non-blocking findings

## Retro
