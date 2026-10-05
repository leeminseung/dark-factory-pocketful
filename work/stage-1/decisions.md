# Stage 1 — decisions

## Plan

- Task: Pocketful stage 1 (payments, requests, splits, feed, export/import, settlements), HTTP API only.
- Spec: /Users/mslee/dark-factory/dark-factory-wearedevs/pocketful/spec/stage-1.md; supplied checks: pocketful/test/stage_1/.
- Base revision: 6fb0742 (no earlier stage). Worktrees under /Users/mslee/dark-factory/band-work/worktrees/.
- No screens in this stage, so product-designer is not engaged and there is no screen review.
- Order: implementer builds stage-1/ in parallel with test-designer's requirement list -> coordinator checks the list
  -> test-designer writes acceptance suite -> rounds (test-designer acceptance check; reviewer round-1 review in round 1)
  -> final review with `--mode isolated` -> accept.
- Handoff sent 2026-10-06 to implementer and test-designer in 5 numbered parts (full spec pasted).

- List check (9071dcb): asked test-designer for 4 missing rows — decline/cancel unknown id 404; response amounts are JSON
  integers; idempotency order (401 and 400 malformed before claimed-key resolution); generated ids never collide with
  seeded/imported ids. Not yet in the list at 3e0b6ba; re-requested.
- Implementer revision for checking: 505958b (stage-1 content = f636c55); supplied checks pass (147) incl. isolated.
- Suite ready at 3e0b6ba (510 tests); command `work/acceptance/run.sh stage-1 1`. Test-designer's informal preview on
  f636c55: 10 failures (S1-059, S1-073, S1-070, S1-158, S1-058) forwarded to implementer before round 1.

- List complete at 190 rows (S1-187..S1-190 added in 2ef3db0); suite at 94de59b (553 tests).

## Rounds
- Round 1: product 09c3a2d (stage-1 = bf9d8e6), suite 94de59b. Acceptance 553/553 (work/reviews/acceptance-09c3a2d.md);
  round-1 review work/reviews/review-09c3a2d-round1.md (standards + spec briefs and raw files present). Failing ids: 0;
  reviewer blocking: R1. Decision: another round; sent R1 (blocking) and R2, R3, R5-R10 (non-blocking) to implementer; R4 ruled no change.

## Rulings
- R4 (pay with no body is 400): no change. §5: "400 | `malformed_request` | Unparseable body"; §7: the key is resolved
  "After the body has parsed as a JSON object". An empty body does not parse; §8's "optional, default `\"public\"`" qualifies
  the `visibility` field, not the body. Consistent with S1-059/S1-189 tests; supplied checks always send `{}` to pay.
- R3 (decline/cancel accept an unparseable body): §5 "Unparseable body" -> 400 applies to any non-empty body that does
  not parse; an absent/empty body stays 200 (§8 defines no body; supplied test_sample.py posts decline/cancel with none).

## Acceptance

## Open failures, risks, unfixed non-blocking findings

## Retro
