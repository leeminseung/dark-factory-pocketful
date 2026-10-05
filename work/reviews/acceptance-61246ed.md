# Acceptance check — stage 2, round 3

- Product revision: 61246ed1618b9bc97c95923d955a1daadba50732 (stage folders as at 7c61450)
- Suite revision: ba66344 (`work/acceptance/`)
- Commands, from a detached worktree of 61246ed:
  - `work/acceptance/run.sh <wt>/stage-2 2`, which also starts `<wt>/stage-1` for the upgrade tests;
  - `work/acceptance/run.sh <wt>/stage-1 1`. stage-1/ changed after it was accepted, in 3c0ba8f (R14).
- Rows covered: stage 1, 190 / 190; stage 2, 164 / 164 (not-testable rows as before)

## Status of the previous round's failing ids

| Id | Round 2 (8c3360d) | Round 3 (61246ed) |
|---|---|---|
| S2-102 | failing (F1: `expires_at` clamped near the TTL bound) | **fixed**: at the maximum TTL, `expires_at` is exactly `created_at` + TTL, also at the clock bound |
| S1-158 / S2-158 | — | **newly failing** (F2 below: some edited idempotency receipts are still accepted; the stage-1 folder too) |

## Counts

| Folder / suites | Tests | Passed | Failed | Errors |
|---|---|---|---|---|
| stage-2, suites 1–2 | 858 | 858 | 0 | 0 |
| stage-1, suite 1 | 554 | 554 | 0 | 0 |

## Probes beyond the suite

These ran through the HTTP API, and the browser for R12, against containers of this build's
stage-2/ and stage-1/ (`--cpus 2 --memory 2g`). The import probes edit an export this build
produced.

| Area | Result |
|---|---|
| R10/R11 / S2-102 TTL bound | Reset with `authorization_ttl_seconds` 3155760000 is 204, and 3155760001 is 422 on reset and on import. At that TTL, `expires_at − created_at` is exactly 3155760000000 ms. An export taken at the bound and imported 3 s later is 204. |
| Clock bound | Import accepts `last_timestamp_ms` up to 250246540799999 (**9899-12-30T23:59:59.999Z**) and refuses one more ms with 422. At that clock, a payment is 201 (created 9899-12-30T23:59:59.999), and an authorisation with the maximum TTL is 201 with `expires_at` `9999-12-31T23:59:59.999+00:00`, exactly `created_at` + TTL. Its export re-imports. **Note:** ruling 2abb370 names MAX_CLOCK 9899-12-31T23:59:59.999Z, but 9899-12-31T23:59:59.999 + 3155760000 s is 10000-01-01T23:59:59.999, one day past RFC 3339's range, because 9900 is not a leap year. The service's bound is one day earlier and is the one that works. decisions.md/notes.md should record 9899-12-30T23:59:59.999Z. |
| R12 list paging | Each list held 205 items. On `/`, `/requests` and `/authorizations`, 1 or 3 new rows were written between the reads at `offset=0` and `offset=200`. Every list showed 205 items, all unique, with no duplicates. The rows written mid-read appear on the next refresh. No failure. |
| R13 partial stage-2 state | Removing `state.authorizations`, `state.authorization_ttl_seconds`, the payments' `authorization_id`, an authorisation's `payment_ids`, or its `captured_amount` gives 422 each time. A real stage-1 export imports (suite: `test_stage1_*`, `test_stage1_import_gets_default_ttl`). No failure. |
| R14 edited receipts | 57 edits to stored responses across all 7 idempotent routes on stage-2 and all 5 on stage-1. Each route had its id field changed to a missing record, and its amount, `created_at`, note, status and stored HTTP status changed. **51 are refused with 422. 6 are accepted (F2).** Unedited exports import, and every route replays with 200 afterwards. |
| R16 / R18 clock and timestamps | An imported authorisation with `created_at_ms` after its `expires_at_ms` is 422. Seeded `expires_at` values 1969-12-31T23:59:59Z and 0001-01-01T00:00:00Z are accepted and served as `expired`, and 9999-12-31T23:59:59Z is accepted as `open`, all in RFC 3339 form. No failure. |

## Failures

### F2 — S1-158, S2-158: some edited idempotency receipts are accepted, and replays then return the edited body

- **S1-158** "missing fields, wrong track/version or an invalid state give 422 `validation_failed` without changing the destination."
- **S2-158** "invalid states (incl. ... contradictory capture links) are 422".
- **S1-161** "Preserve ... all completed idempotent request bodies and original responses". The replay should be the original response.
- **Sent:** an export of this build with one field of one stored response edited, to `POST /_test/import`.

| Folder | Route | Edit to the stored response body | Expected | Actual |
|---|---|---|---|---|
| stage-2 | `POST /requests` | `status` `pending` → `declined` | 422 | 204 |
| stage-2 | `POST /splits` | `note` `n` → `nx` | 422 | 204 |
| stage-2 | `POST /authorizations` | `note` → `nx` | 422 | 204 |
| stage-2 | `POST /authorizations` | `status` `open` → `declined` (not an authorisation status) | 422 | 204 |
| stage-1 | `POST /requests` | `status` `pending` → `declined` | 422 | 204 |
| stage-1 | `POST /splits` | `note` → `nx` | 422 | 204 |

- **Consequence**, after importing such an export on both folders:
  - a split replay returns `note: "EDITED"`, while its requests say `dinner`;
  - a request replay returns `status: "declined"` for a request that was created pending and is still listed `pending`;
  - on stage-2, an authorisation replay returns `status: "declined"`, which is not one of the four statuses, and `note: "EDITED"`, while the list shows `open` / `deposit`.
- **Refused correctly (422):** the same kinds of edit to ids, amounts, `created_at` and the stored HTTP status on every route; note edits on payments, requests, pay and settlements; status edits on pay and settlements.

## Failing requirement ids

S1-158 and S2-158 (F2, from probes; both suites pass). Each is a blocking finding, on stage-2/
and on stage-1/.
