# Implementer self-checks — e03b834 (stage 3, fixes for the final review of e03c437)

Worktree: /Users/mslee/dark-factory/band-work/worktrees/impl-e03b834 (detached at e03b834).

## Commits since e03c437 (stage 3)

| Commit | Finding | What |
|---|---|---|
| a365d73 | R16 (blocking), S3-008 | Payment ids begin with a fixed-width base-36 creation sequence, continued after import. After a reset or import whose seeded payments sit on the clock's millisecond, the next record is stamped 1 ms later. Test: ordering.test.js. |
| 59e453e | R13 (blocking), S2-099 | Reads never move the clock. A snapshot's watermark is a recording number: every revision gets the next number as it is recorded. freezeReadAt removed. |
| 88c458a | R15 (blocking) | Test only: an edited export cannot add a payment to an old snapshot. The fix came with R13, since a watermark is now a recording number that must not exceed record_sequence. |
| 0a6dc6f | R14 (blocking), S3-043, S3-009 | Instants keep the precision they were given. See "R14" below. Also brings the notes' snapshot paragraph up to date with R13. |
| 4612041 | R23 | A seeded authorization given a created_at after its expires_at is 422. This applies to a supplied created_at only; without one, a hold counts from the reset (S2-092). |
| 4405742 | R20 (restructure) | The uppercase-only RFC3339 pattern is removed from clock.js. Tests use helpers.js RESPONSE_TIMESTAMP (§3.4 output form). |
| b016789 | R19 | The 1 s bound on a login during a reset is back in reset-load.test.js. |
| cba0a4d | R21 | The random-history generator now makes never-held holds, captures after close and sub-ms ties. It uses the LCG's high bits and runs 2000 histories. Mutation-checked: dropping either branch of holdEvents fails the test. |
| e03b834 | R17, R18, R22, R24 | Notes on why each is left as it is (work/stage-3/notes.md). R5 is already there. |

## R14

- **Representation.** A time is held as whole ms plus a companion `…Frac`: the digits beyond the millisecond, with trailing zeros dropped.
- **Which times.** Seeded payment created_at; seeded authorization created_at and expires_at, and the closed_at derived from them; revision effective_at; the recorded_at of a seeded revision 1; the query parameters as_of, known_at, from and to; and snapshot windows.
- **Comparison.** Every comparison uses clock.js instantKey, a string key whose order and equality are the instants' own. The ledger, the record validator, expiry and the feed's sort all use it.
- **Output.** Responses echo each fraction. The export has `…_frac` beside every `…_ms`. Older exports have none and are read as whole milliseconds.
- **Service times.** Times the service stamps itself are whole ms. "Now" is that whole millisecond, so an effective_at a fraction past it is 422.
- **Stage 2 unchanged.** stage-2/ is not changed (notes.md): its only comparison of a supplied instant is against "now", which is itself known only to the ms.
- **Tests** (history.test.js):
  - .0005 seeded vs as_of .0003 / .0005;
  - half-open from/to at sub-ms bounds;
  - a correction at .3435 vs as_of .3434;
  - a correction to .0007 refused with 409 historical_overdraft (it returned 201 before);
  - holds and expires_at to the digit;
  - known_at;
  - snapshot, authorization, feed and replay through export and import;
  - malformed `_frac` refused with 422.

  The first two tests failed before the fix: actual 10000 vs expected 10005, and 201 vs 409.

## Commands and results

| Command | Result |
|---|---|
| `npm test` in stage-1/, stage-2/, stage-3/ | 85/85, 124/124, 169/169 |
| `harness run --track pocketful --repo <wt> --all --out checks/impl-e03b834-all` | stage-1/: 1; stage-2/: 1, 2; stage-3/: 1, 2, 3 pass. Stage 4 fails (not built). Each folder claims its own stage. |
| `harness run … --stage 3 --mode isolated` ×4 (checks/impl-e03b834-iso1..4) | 4/4: stages 1, 2, 3 pass (stage 4 not built) |
| `ACCEPTANCE_OUT=checks/impl-e03b834-acceptance work/acceptance/run.sh <wt>/stage-3 3 -q`, suite cc78f4d | junit: tests 1050, failures 0, errors 0, skipped 0 |
| `stage-3/test/screen_checks.py` | 27/27 PASS, exit 0 |
| stage-3 `npm test` three runs in a row with the R19 bound | 169/169 each |

## Not done

- R17: signed self-contained snapshot tokens. Left; reason in notes.md.
- R22: leap seconds stay refused with 422; reason in notes.md.
- R24, R18, R5: notes only.
