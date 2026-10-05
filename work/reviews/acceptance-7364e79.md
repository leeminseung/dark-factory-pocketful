# Acceptance check — stage 2, round 1

- Product revision: 7364e7968b2338e587bf7653d132bfc511f60954 (stage-2/ as at 65a2726)
- Suite revision: ba66344. That is 47edfcf plus two test fixes:
  - f48344d: the `auths` fixture of test_ui.py. bob's first hold was 2000, so his second (900)
    went over his 2500 and was correctly refused (S2-081 "Held funds cannot fund new payments,
    authorizations"). The first hold is now 1500.
  - ba66344: test_capture_from_screen now expects bob's total after both captures (1.23 + 12.50).
- Command: `work/acceptance/run.sh <worktree>/stage-2 2`, from a detached worktree of 7364e79.
  The runner also started the worktree's stage-1/ for the upgrade tests.
- Rows covered: stage 1, 190 / 190; stage 2, 164 / 164. Not testable: S1-008, S1-014, S1-015,
  S2-008, S2-011, S2-014, S2-015, S2-024, S2-069, S2-076.
- Suites run: stage 1 and stage 2.

## Previous round

None: this is stage 2's round 1. In the preview on the stage-2 API work, the one failure was a
seeded authorisation with no `status` (S2-167); it passes now.

## Counts

| Suite | Tests | Passed | Failed | Errors |
|---|---|---|---|---|
| stage 1 | 554 | 554 | 0 | 0 |
| stage 2 | 304 | 304 | 0 | 0 |
| total | 858 | 858 | 0 | 0 |

## Failures

None. No blocking findings from the acceptance suite.
