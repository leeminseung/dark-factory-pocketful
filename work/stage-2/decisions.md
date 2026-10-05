# Stage 2 — decisions

## Plan

- Task: Pocketful stage 2 — wallet screens (/, /requests, /split, /signup, /login, /authorizations) and payment
  authorizations (holds, captures incl. extended mode, void, expiry), stage-1 export upgrade, competing clients.
- Requirements: pocketful/spec/stage-1.md and stage-2.md (read-only); supplied checks: pocketful/test/stage_1/ and stage_2/.
- Base: stage 1 accepted at 56fce5868ae6942324cb86d3a6ccc9372dadccf4; `stage-2/` starts from its `stage-1/`.
- Seats engaged: implementer, test-designer, product-designer (screens added), reviewer (round-1 review, final review).
- Order: implementer builds the API parts first while test-designer writes the list and product-designer writes
  work/design.md -> coordinator checks the list -> design direction to implementer -> screens -> suite ready ->
  rounds (acceptance + screen review of every screen in round 1 + reviewer round-1 review) -> final review
  (`--all --mode isolated`) -> accept, final screenshots by product-designer.
- Handoff sent 2026-10-06 to implementer, test-designer and product-designer in 5 numbered parts (full stage-2 spec
  pasted; carry-forward S1-RISK-1, S1-R17, S1-R19/R21 and watch items in part 4).
- List check (6a7fcaf, 160 rows): asked test-designer for 4 rows — void unknown id 404; GET /authorizations query
  errors; seeded authorization validation (reset and import, 422 changing nothing); upgrade import carries ttl (stage-1
  export -> 600 and empty list; stage-2 export keeps ttl).
- Design direction work/design.md (1af11a0) sent to implementer with summary; screens may start.
- Suite ready cd1c47b; list complete at 164 rows (S2-165..S2-168 in 7c802f1); suite now 47edfcf (858 tests: 554
  stage-1 + 304 stage-2). Command `work/acceptance/run.sh stage-2 2`. Validity check recorded in the list.

## Rounds
- Round 1 started: product 7364e79 (stage-2 = 65a2726); suite 47edfcf (test-designer to fix the `auths` fixture setup
  that over-authorizes bob, 4 setup errors); acceptance check, full screen review, reviewer round-1 review requested.

## Rulings

## Acceptance

## Open failures, risks, unfixed non-blocking findings

## Retro
