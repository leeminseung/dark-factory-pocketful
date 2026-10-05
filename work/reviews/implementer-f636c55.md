# Implementer self-check — stage 1, stage folder at f636c55

Clean worktree: `/Users/mslee/dark-factory/band-work/worktrees/impl-f636c55` (detached at f636c55).

## Own tests

`cd stage-1 && npm test` (node:test, in-process server): **50 tests, 50 pass, 0 fail.**
Files: `test/auth.test.js`, `test/payments.test.js`, `test/requests.test.js`,
`test/idempotency-splits.test.js`, `test/control-settlements.test.js`.

## Supplied checks

```
cd /Users/mslee/dark-factory/dark-factory-wearedevs
.venv/bin/python -m harness run --track pocketful --repo /Users/mslee/dark-factory/band-work/worktrees/impl-f636c55 --stage 1 --out /Users/mslee/dark-factory/band-work/checks/impl-f636c55
  stage 1: pass   (147 passed in 23.96s)
  stage 2: fail   (expected)
  claimed stage: 1

... --mode isolated --out /Users/mslee/dark-factory/band-work/checks/impl-f636c55-isolated
  stage 1: pass   (147 passed, 1 warning in 16.69s — PytestCacheWarning: read-only cache dir in the harness container)
  stage 2: fail   (expected)
  claimed stage: 1
```

Earlier run at 806f75d: 146/147; `test_only_the_payer_may_pay` expected 403 for a third party and got 404.
Fixed in 98f47a6, with regression tests in `test/requests.test.js`.

## Acceptance suite

Not run: the command and revision have not been sent yet.
