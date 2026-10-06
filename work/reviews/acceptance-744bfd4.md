# Acceptance check — stage 3, round 3

- Product revision: 744bfd408a8737d6d1ada12ad6ee1b842c3199d9 (stage folders as at e03b834)
- Suite revision: cc78f4d (`work/acceptance/`)
- Command: `work/acceptance/run.sh <worktree>/stage-3 3`, from a detached worktree of 744bfd4. The
  runner also started the worktree's stage-1/ and stage-2/ for the import tests.
- Rows covered: stage 1, 190 / 190; stage 2, 164 / 164; stage 3, 72 / 72

## Status of the previous round's failing ids

| Id | Round 2 (e03c437) | Round 3 (744bfd4) |
|---|---|---|
| S3-043 / S3-009 | failing (F1: `effective_at` below the millisecond truncated) | **fixed**: instants keep their sub-millisecond digits and are compared exactly |

No newly failing ids.

## Counts

| Suite | Tests | Passed | Failed | Errors |
|---|---|---|---|---|
| stages 1–3 | 1050 | 1050 | 0 | 0 |

Supplied checks, `--stage 3 --mode isolated`, run three times on the worktree: each run gives
stage 1 35/35, stage 2 147/147 and stage 3 6/6 passing, and stage 4 failing, as expected.
`claimed stage: 3` each time.

## Probes beyond the suite

These ran through the HTTP API of a container of this build (`--cpus 2 --memory 2g`).

| Area | Result |
|---|---|
| R16 same-millisecond order | 40 sequential payments, three times: the statement's deltas follow creation order each time. After an import that set the clock 50 ms ahead (`last_timestamp_ms` = now + 50 ms), three payments all stamped `…51.638`, and the statement lists them in creation order (300, 200, 100). A burst of 200 concurrent payments (20 in flight) shares 76 distinct `created_at` values, and the statement is sorted by (`created_at`, id) throughout. No failure. |
| R13 clock under read load | After **58,764** `GET /statement` reads with 50 in flight over 15 s, a new payment's `created_at` is 2 ms *behind* the client's clock, not ahead. A new authorisation's `expires_at` is `created_at` + 600 s. `as_of` = the client's now includes the new payment. No failure. |
| R14 sub-millisecond instants | Checked: a seeded payment `created_at …06.0005Z`; `as_of` …0003/…0005; `to` …0003/…0005; `from` …0005/…0006; a seeded hold `created_at`/`expires_at` …0005; a correction `effective_at` …0007 checked at …0006/…0007; `known_at` …0006. Every result is exact: served values keep the digits (`…06.0005+00:00`, `…06.0007+00:00`), echoes are identical, inclusive `as_of` and the half-open window hold at 0.1 ms, a hold starts at .0005 and not .0004, and a correction that would cause a 0.7 ms overdraft gets 409 `historical_overdraft`. After an export/import round trip (with the new `created_at_frac`), the views are the same. Older-format exports also import with 204: a whole-millisecond state with corrections, holds and a snapshot, with every `_frac` field removed, still gives a closed statement and a working snapshot; so does a sub-millisecond seeded payment with its `_frac` removed. Removing `_frac` from a state that also holds a sub-millisecond *correction receipt* gives 422. That is correct: the receipt then no longer matches its record. No failure. |
| R15 edited watermark | An export with `last_timestamp_ms` and the snapshot's watermarks (`known_at_ms`, `to_ms`) moved 1 h ahead imports. A payment made afterwards still does not appear in the old snapshot, which now carries a `seq` watermark. No failure. |
| R23 | A seeded authorisation whose `created_at` is after its `expires_at` gets 422 `validation_failed`. |

## Failures

None.

## Failing requirement ids

None.
