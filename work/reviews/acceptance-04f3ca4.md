# Acceptance check — stage 2, round 4

- Product revision: 04f3ca4db90dc9780aa14ccb096b6f67f7e4a8ab (stage folders as at 2c1be66)
- Suite revision: ba66344 (`work/acceptance/`)
- Commands, from a detached worktree of 04f3ca4:
  - `work/acceptance/run.sh <wt>/stage-2 2`, which also starts `<wt>/stage-1` for the upgrade tests;
  - `work/acceptance/run.sh <wt>/stage-1 1`
- Rows covered: stage 1, 190 / 190; stage 2, 164 / 164 (not-testable rows as before)

## Status of the previous round's failing ids

| Id | Round 3 (61246ed) | Round 4 (04f3ca4) |
|---|---|---|
| S1-158 | failing (F2, both folders) | **fixed** |
| S2-158 | failing (F2) | **fixed** |

No newly failing ids.

## Counts

| Folder / suites | Tests | Passed | Failed | Errors |
|---|---|---|---|---|
| stage-2, suites 1–2 | 858 | 858 | 0 | 0 |
| stage-1, suite 1 | 554 | 554 | 0 | 0 |

## Probes beyond the suite

Containers of this build's stage-2/ and stage-1/ (`--cpus 2 --memory 2g`), HTTP API only.

### Edited receipts (repeat of F2, widened)

I made 106 edits to stored responses on all 7 idempotent routes in stage-2 and all 5 in stage-1.
Each edit changes one field:
- the id field, to a missing record;
- amount, `created_at`, note and status;
- the stored HTTP status;
- visibility, currency, from/to/requester/payer handles;
- `captured_amount`, `remaining_amount`, `payment_id` and `expires_at`;
- one split share amount, a split's first request note, and a settlement's first member note.

**All 106 are refused with 422.** The unedited exports import with 204, and every route replays
with 200.

The round-3 probes also still pass, 140 checks in all: the TTL and clock bounds (9899-12-30T23:59:59.999Z), the
partially removed stage-2 state, and the timestamp ranges.

### Legitimate later states still import and replay (S1-161, S2-158)

On both folders, each creation receipt and capture receipt below replays with 200 and the
**original** body: before the export, after reset plus import, and after a second import.

| State after the receipt | stage-2 | stage-1 |
|---|---|---|
| request later paid, declined, cancelled; the pay receipt | OK | OK |
| split whose first request was later paid | OK | OK |
| settlement with two members (one private) | OK | OK |
| direct payment | OK | OK |
| authorisation partly captured (final: false), and its capture | OK | — |
| authorisation fully captured, and its capture | OK | — |
| authorisation captured in two non-final parts up to the end, both captures | OK | — |
| authorisation voided; one partly captured and then voided, with its capture | OK | — |
| authorisation expired by the clock (ttl 2 s); one partly captured and then expired, with its capture | OK | — |

59 checks, all OK.

### Stage-1 export into stage-2, with replays

- A stage-1 export imports into stage-2 with 204. It holds a payment, a request later paid, a
  request later declined, a split, a settlement and a pay receipt.
- With the stage-1 tokens, all six replays on stage-2 return 200, and every stage-1 field equals
  the original.
- `/me` there shows total = available = 9983 with held 0.
- A new authorisation gets ttl 600.
- The upgraded state's own export re-imports with 204.

## Failures

None.

## Failing requirement ids

None.
