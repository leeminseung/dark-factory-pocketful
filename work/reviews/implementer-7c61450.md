# Implementer self-check — stage 2 round 3 (after final review of 8c3360d), revision 7c61450

Clean worktree `/Users/mslee/dark-factory/band-work/worktrees/impl-7c61450`; acceptance suite ba66344.

## Findings → commits (failing test or check first for each fix)

| Finding | Commit | What |
|---|---|---|
| R10 R11 / S2-102 (blocking) | 67e7084 | fixed constants: MAX_TTL_SECONDS 3155760000, MAX_CLOCK_MS = 9999-12-31T23:59:59.999Z − that; expires_at never clamped |
| R12 (blocking) | 210f93a | paged lists keep each row once, by id |
| R13 (blocking) | 9447014 | an export is stage-1 only with no stage-2 field anywhere |
| R14 (blocking) | e6cc2f5 | stored replays must describe their records (REPLAY_RULES), stage 2 |
| R14, **stage-1 folder** | 3c0ba8f | same rules in stage-1/ (no stage-2 routes) — **stage-1/ needs checking again** |
| R20 | 33a40db | stage-2/test/screen_checks.py: D1–D11 as regression checks (RUN.md command) |
| R15 (blocking) | 29f9edd | headline sizes to its length; fits 375 px up to 2^53−1 minor units in EUR/JPY/BHD |
| D12 | 237de55 | check added; the fix (align-items: center) landed in 29f9edd, not named there |
| R16 | 6ebeeac | no record after the clock; API authorizations expire at created_at + ttl |
| R17 | 58f286e | collection refusals worded by code (reservationRefusal) |
| — | 96fcb04 + 0a579c9 | test that every browser module loads (96fcb04 had a wrong count; fixed in 0a579c9) |
| R18 | 5d06617 | stored times cover 0000–9999; years < 100 parsed correctly |
| R21 | 59de453 | read timeout 6 s (past the 5 s service limit) |
| R22 | f1973f7 | restructure: no State.remainingOf middle man |
| R19, R23 | 7c61450 | notes (non-blocking, left with reasons) |

## Results

- `cd stage-2 && npm test`: **124 / 124 pass.** `cd stage-1 && npm test`: **85 / 85 pass.**
- `python3 stage-2/test/screen_checks.py`: **27 checks, all PASS** (D1–D12, R15 for EUR/JPY/BHD at 1e9 and 2^53−1).
- Supplied `--all`: stage-1/ stage 1 pass (147), claimed 1; stage-2/ stage 1 pass (147), stage 2 pass (35),
  stage 3 fail (expected), **claimed stage 2**.
- Acceptance ba66344: `run.sh <wt>/stage-2 2` → junit **858 / 0 failures / 0 errors**;
  `run.sh <wt>/stage-1 1` → junit **554 / 0 failures / 0 errors** (stage-1 folder re-checked after 3c0ba8f).
- Slow-write scenario with the 6 s timeout: 0/20 failures, slowest recovery 6.37 s (test waits 8 s).
