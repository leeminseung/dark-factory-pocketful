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
- Round 2: product e03c437, suite cc78f4d (1050/1050). Probes (work/reviews/acceptance-e03c437.md): R1, R2, R3, R6 hold;
  F1 fails S3-043/S3-009 — sub-millisecond effective_at truncated, so a correction effective at .3435 counts at as_of
  .3434 (blocking: "`as_of` retains its inclusive meaning"). Count 1 vs previous 0 -> did not fall -> loop stopped;
  final review on e03c437.
- Final review of e03c437: CHANGES NEEDED, blocking 7 (R13-R16 + S3-043, S3-009 + supplied stage-3 check intermittently
  failing test_a_statement_walks_the_balance_forward = R16); work/reviews/review-e03c437-final.md (fix-commit + probe
  briefs/raw listed). R1-R3, R6-R9 fixed; R10 regressed as R14; R5 open non-blocking. Sent R13-R24 to implementer;
  rounds continue from 3 without reviewer, compared with 7.
- Round 3 started: product 744bfd4 (stage folders = e03b834), suite cc78f4d; acceptance + probes of R13-R16, R23.
- Round 3: product 744bfd4, suite cc78f4d (1050/1050); supplied --stage 3 --mode isolated 3x pass; probes R13-R16,
  R23 hold (work/reviews/acceptance-744bfd4.md). Failing ids 0; no new non-blocking -> re-review of 744bfd4.
- Re-review of 744bfd4: PASS, blocking 0 (work/reviews/review-744bfd4-recheck.md, 52df22e). R13-R16, S3-043/S3-009
  fixed; supplied --all --mode isolated: stage-1/ claims 1, stage-2/ claims 2, stage-3/ passes 1-3, fails 4, claims 3;
  --stage 3 --mode isolated passed 5 of 5.

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
- Accepted revision: 744bfd408a8737d6d1ada12ad6ee1b842c3199d9 (stage folders = e03b834), status: passed.
- Reviewer report: work/reviews/review-744bfd4-recheck.md; acceptance work/reviews/acceptance-744bfd4.md; screens
  work/reviews/design-6a17d63.md (regression review; screen code unchanged since).
- Requirement rows covered: stage 3 72 of 72 (S3-024 not testable, S3-001 by earlier suites); stage 2 164/164; stage 1 190/190.
- stage-1/ and stage-2/ unchanged since 048a821.

## Open failures, risks, unfixed non-blocking findings
- Open failures: none.
- S1-RISK-1 (carried; next: reviewer if auth changes).
- S3-RISK-1 (implementer notes; next: implementer): at the fixed clock bound 9899-12-30 a same-millisecond write could
  join a later snapshot (now sequence-based watermark; recheck).
- S3-R17 (non-blocking; next: implementer): snapshot memory grows ~0.7-1.9 KB per first read until reset.
- S3-R22 (non-blocking; next: test-designer to watch): leap-second instants refused with 422.
- S3-R24 (non-blocking; next: implementer): GET /requests and GET /authorizations can repeat rows under writes.
- S3-R5 (non-blocking): a stage-2 export carries no void time; closed_at is inferred.
- S3-R18, S3-R11 (history), S2-R23 (kept), S1-R17 (kept).

## Retro
- Rejected/failed: (1) snapshot design — rendered copies grew memory without bound (R1), then the fix advanced the
  clock on each read (R13); (2) instants truncated to milliseconds placed sub-ms effective times early (R10 -> R14,
  S3-043/S3-009); (3) same-millisecond payments with random ids broke statement order, failing a supplied check
  intermittently (R16); plus an O(n^2) overdraft check (R2).
- Caught by: R1-R3 round-1 review; F1 round-2 probe; R13-R16 final-review probe and isolated supplied check.
- Slipped late: R16 passed the suite, the implementer's runs and three supplied runs; R13 came from a fix and passed
  everything until a 23k-read probe.
- Rounds: 3 plus round-1 review, final review and re-review. The loop stopped after round 2 (0 -> 1), restarted after
  the rejection (7 -> 0), and ended when the re-review passed.
- Watch (implementer): a read must never change state (clock, counters); any ordering by time needs a deterministic
  tie-break by creation order.
- Watch (test-designer): standing tests for same-millisecond ordering (bursts, loop runs), sub-millisecond instants,
  and clock drift after many reads; run the supplied stage check several times in isolated mode each round.
- Watch (reviewer): run the supplied isolated check more than once at final review (intermittent failures).
