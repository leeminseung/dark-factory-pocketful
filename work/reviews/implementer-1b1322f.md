# Implementer self-check — stage 2 round 2, stage folder at 1b1322f

Clean worktree `/Users/mslee/dark-factory/band-work/worktrees/impl-1b1322f`; acceptance suite ba66344.

## Findings → commits (one purpose each; failing test or probe first)

| Finding | Commit | Kind | Failing first |
|---|---|---|---|
| R1 (blocking) | e8c58a8 | fix: after a confirmed answer any edit starts a new key; restored form keeps it only while unknown | retry-identity.test.js |
| R2 (blocking) | 6d54b0d | fix: ttl judged from now so expires_at stays RFC 3339; expiryOf caps | authorizations.test.js 'R2' |
| R6 | 7a23195 | restructure: isDue / remainingOf in model.js | — (105/105) |
| R7 | 6a5b501 | comment | — |
| R4 | c193cf2 | restructure: shared rules (limits, charCount, deriveHandle) | — (105/105) |
| — | 026ea9a | restructure: shared modules in public/assets/shared (server imports them) | — |
| R5 | 814ec2d | fix: refusal wording by code and what was sent, never message text | messages.test.js |
| R3 | bcd65b4 | tests: authorize/capture/void halfway failures | (pass: journal already covers) |
| R3 | 3f358f2 + 8afb994 | LatestRead class + tests; 8afb994 restores stale-failure behaviour that 3f358f2 changed (its "no behaviour change" label was wrong) | latest-read.test.js |
| R9 | 5ce266a | fix: follow has_more on every list | pages-reader.test.js |
| D1 | dbe870b | header one shape at 375 | probe: 91.5 → 68 px |
| D2 | edba912 | handles never break; amount under title ≤600 px | probe |
| D3 | dd889f6 | list routes 760 px column | probe: 1056 → 760 |
| D4 | 4803823 | min 16 px hatch; empty track at 0 | probe: 0 → 16 px |
| D5 | 73922a5 | 48 px section gap; text action aligned | probe: 0 → 48 |
| D6 | 7fbfbd4 | 44 px hit boxes for action links | probe: 24/30/21 → 44 |
| D7 | 0205e13 | SVG hatch swatch (4 lines) | probe + screenshot |
| D8 | 1ab1b7a | Refresh turns its own glyph only | probe: 2 → 1 icon |
| D9 | 470dd16 | strip "Loading…" at final height | probe |
| D10 | b2562df | "Collect by today", "went back to you" | time-words.test.js + probe |
| D11 | ba13bbc | success lines cleared when the next action starts | probe |
| — | 1b1322f | fix: a read that gets no answer in 3 s is retried once (writes never) | api-client.test.js; slow-write loop 3/15 → 0/20 |
| R8 | — | history; noted in notes.md | — |

Probe script: work/reviews/implementer-screen-probe.py (all 14 checks PASS at 1b1322f).

## Results

- `cd stage-2 && npm test`: **116 tests, 116 pass, 0 fail.**
- Supplied `--all`: stage-1/ stage 1 pass (147), claimed 1; stage-2/ stage 1 pass (147), stage 2 pass (35),
  stage 3 fail (expected), **claimed stage 2**.
- Acceptance `work/acceptance/run.sh <worktree>/stage-2 2` (ba66344): junit **858 tests, 0 failures, 0 errors, 0 skipped**.
- At 1e0da10 (before the read retry) the same suite had 1 failure, test_refresh_waits_for_a_slow_write: its
  `unroute` can strand the GET sent right after the delayed write; fixed on the app side in 1b1322f.
