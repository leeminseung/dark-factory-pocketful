# Implementer self-check — stage 2 with screens, stage folder at 65a2726

Clean worktree `/Users/mslee/dark-factory/band-work/worktrees/impl-65a2726`; acceptance suite cd1c47b (in tree).

## Commits since 960fd83

| Commit | What |
|---|---|
| 1a25c1f | restructure: equal-split rule in src/shared/shares.js (101/101 before/after) |
| 4e74eea | the screens per work/design.md: front door, wallet, requests, split, reserved; fonts, OFL, inline icons |
| f5cb6f8 | fix: a seeded authorization without status is 422 (acceptance change21) |
| 65a2726 | fix: retry key follows the body sent (edit-and-restore is unchanged) |
| 0f6da7e | notes |

## Results

- `cd stage-2 && npm test`: **102 tests, 102 pass, 0 fail.**
- Supplied `--all`:
  - stage-1/: stage 1 pass (147), claimed stage 1 (unchanged accepted folder).
  - stage-2/: stage 1 pass (147), stage 2 pass (35), stage 3 fail (expected), **claimed stage 2**.
- Acceptance `work/acceptance/run.sh <worktree>/stage-2 2` (cd1c47b): junit **858 tests, 0 failures,
  4 errors**, 854 passed (268 s). The 4 errors are setup errors of the `auths` fixture in test_ui.py:
  `test_authorization_list`, `test_capture_from_screen`, `test_void_from_screen`,
  `test_authorization_error_on_refused_capture_and_void`. The fixture has bob (balance 2500)
  authorise 2000 and then 900 more for ada; the second gets `409 insufficient_funds`, which §2 requires
  ("Held funds cannot fund new ... authorizations"; available 500 < 900). Reported to coordinator.
- The same flows checked by hand in a browser with a consistent fixture: capture prefilled with the
  remaining amount, exceeds → authorization-error, partial → captured with authorization-captured,
  release → voided, capture of a hold voided elsewhere → authorization-error and the stale button gone.

## Earlier run on f5cb6f8 (before the identity fix)

858 tests: 2 failures (`test_uncertain_retry_survives_edit_and_restore`, fixed in 65a2726;
`test_refresh_waits_for_a_slow_write`, which passed locally and passes at 65a2726) and the same 4 errors.
