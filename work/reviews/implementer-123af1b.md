# Implementer self-check — stage 3 round 2, revision 123af1b

Findings: work/reviews/review-6a17d63-round1.md (R1–R3 blocking; R4 ruled no change; R5–R12 non-blocking).

## Commits (failing test first for each fix; restructures behaviour-neutral)

| Finding | Commit | What |
|---|---|---|
| R2 (blocking) | ee300dc | overdraft check is one sorted pass with running sums; reset/import groups payments by user; randomized equivalence test |
| R1 (blocking) | 53f89d9 | snapshot = owner, window, watermark; pages recompute; State.freezeReadAt stamps later writes strictly after the read |
| R3 (blocking) | 74f6cbb | snapshots exported and imported, validated (owner, window, watermark, echo, unique tokens) |
| R7 | 1e759f5 | restructure: State.shiftBalances is the one balance gate (payments and corrections) |
| R8 | b4f1477 | restructure: ledger authorizationHoldAt vs State.heldBy |
| R9 | 92ba1d3 | restructure: isLinkedPayment, currentRevision, seededClosedAt, neverHeld |
| R6 | 31ecf4e | lowercase t/z in every instant (one pattern) |
| R10 | d408eb0 | every instant truncated to the millisecond, stored or queried |
| R12 | 1cbe752 | tests: same-instant boundary, refused-correction key, same-key concurrency; timing bounds at 80 % of the stated limits |
| R5, R11 | 123af1b | notes |
| R4 | — | ruled no change |

## Results (clean worktree /Users/mslee/dark-factory/band-work/worktrees/impl-123af1b)

- `cd stage-3 && npm test`: **161 / 161 pass**.
- Supplied `--all`: stage-1/ claimed 1; stage-2/ claimed 2; stage-3/ stages 1–3 pass, stage 4 fail (expected), **claimed 3**.
- Acceptance `run.sh <wt>/stage-3 3` at **cc78f4d**: junit **1050 / 0 failures / 0 errors / 0 skipped**.
- screen_checks.py: 27 / 27 PASS.
- Scale (test/scale.test.js): reset of 20000 seeded payments (2 or 50 users) and 20 concurrent corrections over
  5000 payments, all inside 80 % of the stated limits.
- Memory probe (local node, 5000 payments, 200 GET /statement): RSS 94 MB → 98 MB (was 123 → 684 MB).
