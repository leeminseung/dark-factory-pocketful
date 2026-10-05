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

## Rounds

## Rulings

## Acceptance

## Open failures, risks, unfixed non-blocking findings

## Retro
