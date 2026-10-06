# Acceptance check — stage 3, round 2

- Product revision: e03c4371ebe434f0ebdc65d6b35c175d02c36417 (stage-3/ as at 123af1b)
- Suite revision: cc78f4d (`work/acceptance/`)
- Command: `work/acceptance/run.sh <worktree>/stage-3 3`, from a detached worktree of e03c437. The
  runner also started the worktree's stage-1/ and stage-2/ for the import tests.
- Rows covered: stage 1, 190 / 190; stage 2, 164 / 164; stage 3, 72 / 72

## Status of the previous round's failing ids

Round 1 (6a17d63) had none. The suite still has none. The probes give one new failing id:
S3-043 (F1 below).

## Counts

| Suite | Tests | Passed | Failed | Errors |
|---|---|---|---|---|
| stages 1–3 | 1050 | 1050 | 0 | 0 |

## Probes beyond the suite

These ran through the HTTP API of a container of this build (`--cpus 2 --memory 2g`). Memory is
the container's usage from `docker stats`.

| Area | Result |
|---|---|
| R1 memory | Reset with 2 users and 5000 seeded payments: 30 MiB. After 300 first `GET /statement?limit=1` reads: 40.5 MiB. After 300 more first reads with `limit=200` and distinct `known_at`: 39.4 MiB. After all the probes below: 79.7 MiB. Memory no longer grows with each read. |
| R1 exactness | 15 trials: a first read (limit 50) taken while three threads kept paying in the same milliseconds. Its snapshot was paged at once and again 0.3 s later. The first 50 entries equal the first read, the opening and closing balances equal it, the arithmetic closes, and both pagings are identical. **0 mismatches.** After a correction, a capture and a void that followed a snapshot, its page is unchanged. |
| R2 load | Over 5000 payments: 20 and 50 concurrent corrections all return within 0.04 s at most, with 2 users and with 100 users. Reset with 20000 seeded payments (100 users) takes 0.15 s, and with 2 users 0.13 s; import of the 20000-payment export takes 0.19 s. All well under 5 s / 10 s. |
| R3 snapshots across import | A snapshot taken before an unchanged export, then imported after a reset, pages identically, with the same opening and closing balances. Another user's token is still 404. Edited snapshot records are refused with 422: an empty token, an unknown owner, a garbage `from_ms` or `known_at_text`, a non-integer or out-of-range `to_ms` / `known_at_ms` / `from_ms` (10^20, −10^20, 1.5, "x"), and a duplicated record. `to_ms` or `known_at_ms` set to −1 (1969-12-31T23:59:59.999Z) imports, because a query could legitimately ask for that window. Not counted. |
| R6 lowercase | `2026-09-24t13:20:00z`, `…T…z` and `…t…+00:00` are accepted for `as_of` (echoed exactly), `known_at` and `from`. A lowercase `effective_at` is accepted in a correction (201). No failure. |
| R10 sub-millisecond | **F1 below.** |

## Failures

### F1 — S3-043 (and S3-009): an `effective_at` below the millisecond is truncated, so a correction counts before it took effect

- **S3-043** "Then apply selected revisions according to their **effective** times. `as_of` retains its inclusive meaning".
- **S3-009** "the balance after every payment of theirs with `created_at` at or before `as_of`, and before every payment after it."
- **S3-027** "effective time is an RFC 3339 instant": sub-millisecond digits are valid RFC 3339.
- **Case memory:** "fractions below a millisecond ... digits below the millisecond truncated, so a record counted as existing before it happened".
- **Sent:**
  1. ada pays bob 100, and corrects it to 90. ada pays bob 50, as payment q.
  2. ada corrects q to 40 with `effective_at` `2026-10-06T01:01:21.3435Z`, 0.5 ms after q's
     original instant. Returns 201.
- **Expected:**
  - At `as_of` `…21.343Z` and `…21.3434Z`, both before `.3435`, q's selected revision has not yet
    taken effect, so ada's balance excludes q: 9910.
  - At `…21.3435Z` it counts: 9870.
  - The revision reports the `effective_at` it was given.
- **Actual:**
  - All three `as_of` values return **9870**, so the correction counts at `.343` and `.3434`.
  - The revision's `effective_at` is served as `2026-10-06T01:01:21.343+00:00`. The record now says
    it took effect 0.5 ms earlier than it was told.
- **Note:** the truncation is consistent between stored and queried instants, as R10 asked. But a
  consistent truncation on both sides still places the correction before its effective time.
  Keeping the full precision of `effective_at` (and of query instants) would satisfy both rules.
  Rounding up would not, because `as_of=.3435` must then still count it. This was R10, non-blocking
  in the round-1 review. Under the acceptance rules it is a stated rule failing under a stated
  input, so I count it as blocking. The coordinator may rule otherwise.

## Failing requirement ids

S3-043 (with S3-009), F1, from probes; the suite passes.
