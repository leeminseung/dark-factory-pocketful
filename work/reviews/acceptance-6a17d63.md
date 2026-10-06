# Acceptance check — stage 3, round 1

- Product revision: 6a17d6376e898493fd05d0fd102f0296275799e3 (stage-3/ as at e6ee3d8)
- Suite revision: cc78f4d. That is 3891982, plus these test fixes:
  - 9f9e0d5: ruling 0d4fc1d. The S1-025 test now uses fixture fields that no stage defines
    (`joined_on`, `booked_on`) instead of `created_at`.
  - cc78f4d, my own test defects found in the first run and in the implementer's preview:
    - `test_increase_debits_the_sender` expected bob at 3500; 2500 + 1500 = 4000.
    - `test_historical_overdraft` compared whole statements, including the `snapshot` token,
      which always differs. It also relied on three API payments having distinct instants: made
      milliseconds apart they can share one instant, and their combined effect hides the
      overdraft. It is now built from seeded payments at T1 < T2 < T3.
    - `test_unaffordable_now` and `test_overdraft_through_a_hold` relied on the same
      distinct-instant assumption, and now wait 20 ms between the writes (D3-4).
    - the `s3.py` helper `pay_rec` crashed on a non-string `created_at` before sending.
    - the S1-025 fixture's seeded payment gave bob a −1 opening balance. Stage 3 rightly refuses
      that ("Seeded history is consistent and nonnegative"), so bob now holds the 1 he received.
- Command: `work/acceptance/run.sh <worktree>/stage-3 3`, from a detached worktree of 6a17d63. The
  runner also started the worktree's stage-1/ and stage-2/ for the import tests.
- Rows covered: stage 1, 190 / 190; stage 2, 164 / 164; stage 3, 72 / 72 (not testable: S3-024
  and the earlier stages' rows)
- Suites run: stages 1, 2 and 3 against stage-3/. stage-1/ and stage-2/ are unchanged since they
  were accepted, so they were not rechecked.

## Previous round

None: this is stage 3's round 1.

## Counts

| Suite | Tests | Passed | Failed | Errors |
|---|---|---|---|---|
| stage 1 | 554 | 554 | 0 | 0 |
| stage 2 | 304 | 304 | 0 | 0 |
| stage 3 | 192 | 192 | 0 | 0 |
| total | 1050 | 1050 | 0 | 0 |

The first run, with the suite before cc78f4d, had 5 failures. All 5 were the test defects listed
above. None was a product failure.

## Failures

None. No blocking findings from the acceptance suite.
