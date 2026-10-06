# Implementer self-check — stage 3 (no screens changed), revision e6ee3d8

Clean worktree `/Users/mslee/dark-factory/band-work/worktrees/impl-e6ee3d8`.

## Commits

| Commit | What |
|---|---|
| 9c315d2 | stage-3/ = accepted stage-2/ (048a821), unchanged |
| 5bd5613 | revisions, opening balances, seeded created_at (future → 422), closed_at; feed ordered by created_at; stage-1/2/3 export generations |
| 3f59c7f | src/ledger.js; GET /me as_of / known_at; GET /statement with snapshots; nonnegative-history check on reset/import |
| 7d115a2 | corrections (8th idempotent path) and GET /payments/{id}/revisions; correction replay rule |
| a48307c | closed_at in authorization views; historical holds tests |
| e6ee3d8 | work/stage-3/notes.md, RUN.md |

## Results

- `cd stage-3 && npm test`: **150 / 150 pass** (new: ledger, history, corrections, holds-history tests).
- Supplied `--stage 3`: stage 1 pass (147), stage 2 pass (35), stage 3 pass (6), stage 4 fail (expected), **claimed stage 3**.
- Supplied `--all`: stage-1/ claimed 1; stage-2/ claimed 2; stage-3/ claimed 3 (upgrade sources stage-1 and stage-2 built).
- `stage-3/test/screen_checks.py`: 27 / 27 PASS.
- Earlier-stage acceptance on the stage-3 build, `run.sh <wt>/stage-3 2` (suite 3891982): 858 tests, **1 failure**:
  `stage_1/test_model_fixture.py::test_fixture_fields_outside_the_format_are_ignored` — the fixture gives a payment
  `created_at: "not-a-time"`. In stage 1 that field was outside the format (S1-025, ignored); stage 3 defines it
  ("Seeded payments may supply `created_at`"), so the build refuses an invalid value with 422 (§5 "A field of the
  correct JSON type with an invalid format … gives 422"). Raised to coordinator for a ruling.
