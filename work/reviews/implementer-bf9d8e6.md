# Implementer self-check — stage 1, stage folder at bf9d8e6

Clean worktree: `/Users/mslee/dark-factory/band-work/worktrees/impl-bf9d8e6` (detached at bf9d8e6;
acceptance suite there is at 94de59b).

## Fixes in bf9d8e6 (preview findings)

| Row | Cause | Fix |
|---|---|---|
| S1-059, S1-157, S1-189 | empty POST body was read as `{}` | empty body is 400 `malformed_request` before claimed-key resolution; decline/cancel ignore bodies |
| S1-073 | `canonicalJson` recursed per nesting level → stack overflow → 500 | iterative |
| S1-070 | Node gives headers as latin1, so the key length counted UTF-8 bytes | decode as UTF-8, count characters |
| S1-158 | import accepted any non-negative integer balance | balance and total ≤ 2^53; record amounts ≤ 1e9 |
| S1-058 | Node's 16 KB header limit sent an empty 431 | limit 1 MiB; `clientError` hook writes the §5 body |

Regression tests: `stage-1/test/robustness.test.js` (8 of its 9 failed before the fix; the 9th, S1-190, passed already).

## Own tests

`cd stage-1 && npm test`: **59 tests, 59 pass, 0 fail.**

## Supplied checks

```
.venv/bin/python -m harness run --track pocketful --repo <worktree> --stage 1 --out .../checks/impl-bf9d8e6
  stage 1: pass (147 passed in 22.59s); stage 2: fail (expected); claimed stage: 1
... --mode isolated --out .../checks/impl-bf9d8e6-isolated
  stage 1: pass (147 passed, 1 warning — harness pytest cache on a read-only fs); stage 2: fail (expected); claimed stage: 1
```

## Acceptance suite (94de59b)

`ACCEPTANCE_OUT=/Users/mslee/dark-factory/band-work/checks/acc-impl-bf9d8e6 work/acceptance/run.sh <worktree>/stage-1 1`
→ pytest exit 0; junit: **553 tests, 0 failures, 0 errors, 0 skipped** (127 s).

Before the fixes, the same suite at the earlier revision (505958b, run from the main tree) failed 19:
the 5 preview defects, plus `test_response_amounts_are_integers` (a test arithmetic error since corrected
in the suite: it expects 8000 and the service returns 8000).
