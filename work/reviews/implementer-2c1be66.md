# Implementer self-check — stage 2 round 4, revision 2c1be66

Finding: F2 (work/reviews/acceptance-61246ed.md), S1-158 / S2-158 / S1-161, both stage folders.

## Commits

| Commit | What |
|---|---|
| 4274ba8 | notes: clock bound is 9899-12-30T23:59:59.999Z (ruling corrected in f31fb10; value unchanged) |
| aa39fc1 | stage-2: each stored receipt is rebuilt from the records with views.js at creation and must equal the stored JSON; stage-1 receipts without authorization_id match when the record has none |
| 2c1be66 | stage-1: the same, stage-1 routes only — **stage-1/ needs checking again** |

Failing tests first: `replays-import.test.js` 'F2 …' cases in each folder (request status changed, split note /
share / request status changed, payment visibility, extra field, pay note, settlement member note; stage 2
also authorization note / status / captured, capture currency).

## Results (clean worktree /Users/mslee/dark-factory/band-work/worktrees/impl-2c1be66)

- npm test: stage-2 **124/124**, stage-1 **85/85**.
- screen_checks.py: **27/27 PASS**.
- Supplied `--all`: stage-1/ stage 1 pass (147), claimed 1; stage-2/ stage 1 pass (147), stage 2 pass (35), stage 3 fail
  (expected), **claimed stage 2**.
- Acceptance ba66344: stage-2 junit **858 / 0 / 0**; stage-1 junit **554 / 0 / 0**.
