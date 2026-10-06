# Stage 3 — requirement list

Source: `pocketful/spec/stage-3.md` (read-only), building on `stage-1.md` and `stage-2.md`. One row
per testable requirement. Status values: open, tested, passing, failing, disputed, not testable
(with the reason). Tests are named `file::function` under `work/acceptance/tests/stage_3/`.

## Earlier rows this stage changes

All stage-1 and stage-2 rows still apply. The stage-1 and stage-2 suites run against every
stage-3 build. Their tests hold because they make no corrections and send no temporal parameters.

| Earlier row | Change in stage 3 | Covered by |
|---|---|---|
| S1-052, S2-092 | seeded payments (and seeded authorisations) may carry `created_at` | S3-004, S3-005, S3-065 |
| S1-084, S2-089 | an eighth idempotent write path: `POST /payments/{id}/corrections` | S3-025, S3-032, S3-069 |
| S1-095, S2-084 | `GET /me` takes `as_of` / `known_at`; without them it reports current corrected values | S3-008, S3-058 |
| S1-161, S2-158 | export/import also carries revisions, corrections and their receipts; stage-1 and stage-2 exports import | S3-056, S3-068 |
| S2-101, S2-121 | authorisations expose `closed_at` | S3-063 |
| S1-141 | `GET /activity` keeps the original payment; corrections are not feed items | S3-038 |

## Payment timestamps

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-001 | "The requirements from stages 1 and 2 continue to apply, with the additions below." | stage | | open |
| S3-002 | "Every payment's `created_at` is an RFC 3339 instant with an offset identifying when it moved money. Every endpoint returning a payment includes it." | timestamps | | open |
| S3-003 | "`GET /activity` retains its existing ordering by this field." | timestamps | | open |
| S3-004 | "Seeded payments may supply `created_at`; omission uses reset time, before subsequent API-created payments." | fixture | | open |
| S3-005 | "A seeded `created_at` in the future gives `422 validation_failed` from `POST /_test/reset`, with no state change." | fixture | | open |
| S3-006 | "A fixture's `balance` remains the balance after all seeded payments. Loading those payments must not change that balance." | fixture | | open |

## `GET /me` as of an instant

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-007 | "`as_of` is optional and is an RFC 3339 instant with an offset. Anything else — a naive local time, a bare date, an empty value — is 422 `validation_failed`." | as_of | | open |
| S3-008 | "Without temporal query parameters the response retains the existing money fields and reports current corrected values." | as_of | | open |
| S3-009 | "`balance` is the caller's balance as it stood at that instant: the balance after every payment of theirs with `created_at` at or before `as_of`, and before every payment after it. A payment made at exactly `as_of` counts as having happened." | as_of | | open |
| S3-010 | "An `as_of` at or after the latest payment returns the current balance." | as_of | | open |
| S3-011 | "An `as_of` before the earliest payment returns the opening balance — what the wallet held before anything moved." | as_of | | open |
| S3-012 | "The response carries `as_of` back, exactly as given." | as_of | | open |

## `GET /statement`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-013 | "Both `from` and `to` are optional; `from` defaults to the opening of the wallet and `to` to now." | statement | | open |
| S3-014 | "`limit` and `offset` behave exactly as in `GET /requests`." | statement | | open |
| S3-015 | "Returns the payments the caller sent or received in the half-open window `[from, to)`, **oldest first**, each with the caller's balance immediately after it" (shape: `opening_balance`, `entries[{payment, delta, balance_after}]`, `closing_balance`, `has_more`) | statement | | open |
| S3-016 | "Entries are ordered by `created_at` ascending, then payment `id` ascending for ties." (later: by selected `effective_at`, S3-044) | statement | | open |
| S3-017 | "`opening_balance` is the balance immediately before `from`. `closing_balance` is the balance immediately before `to`." | statement | | open |
| S3-018 | "`opening_balance` plus all `delta` values in the full window must equal `closing_balance`. A sent payment has a negative `delta`; a received payment has a positive `delta`." | statement | | open |
| S3-019 | "Pagination must not change an entry's `balance_after` or the window's opening and closing balances." | statement | | open |
| S3-020 | "Only payments sent or received by the caller appear in their statement, including when other payments are public." | statement | | open |
| S3-021 | `from` / `to` are instants: a value that is not an RFC 3339 instant with an offset is 422 `validation_failed` (§5; as for `as_of`, decision D3-1) | statement | | open |

## Effective time, recorded time and corrections

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-022 | "Revision 1 has `amount` as originally paid and `effective_at = recorded_at = created_at`. A seeded payment's supplied `created_at` is also its original recorded/effective time; omission uses reset time." | revisions | | open |
| S3-023 | "Opening balances equal seeded ending balances minus the net effect of original seeded payments. Corrections must not change those opening balances. New accounts open at zero." | revisions | | open |
| S3-024 | "Seeded history is consistent and nonnegative." | fixture | — | not testable: a promise about the fixtures the tests send, not a rule the service applies |
| S3-025 | "`POST /payments/{payment_id}/corrections` requires an idempotency key and the original sender. An authenticated non-sender gets 403 `forbidden`; unknown payment gets 404." | corrections | | open |
| S3-026 | "All fields are required." (`expected_revision`, `amount`, `effective_at`, `reason`) | corrections | | open |
| S3-027 | "Revision is a positive integer; amount is an integer 0..1000000000 (zero reverses the entire payment); reason is a string of 1..200 characters; effective time is an RFC 3339 instant not later than now. Invalid input is 422 `validation_failed`." | corrections | | open |
| S3-028 | "Correction changes neither parties nor visibility." | corrections | | open |
| S3-029 | "It appends an immutable revision, returning 201 with `payment_id`, `revision`, `amount`, `effective_at`, server-assigned `recorded_at`, and `reason`." | corrections | | open |
| S3-030 | "Recorded times for one payment strictly increase." | corrections | | open |
| S3-031 | "A stale expected revision gives 409 `stale_revision`." | corrections | | open |
| S3-032 | "Successful replay returns that original revision with 200 even after newer revisions. Different body with the same key is 409 `idempotency_key_reuse`." | corrections | | open |
| S3-033 | "The difference from the previous amount moves between the **same two wallets** in the same atomic step. Increasing the amount debits the original sender; decreasing it debits the original receiver." | corrections | | open |
| S3-034 | "A currently unaffordable debit gives 409 `insufficient_funds`." | corrections | | open |
| S3-035 | "Otherwise, if any user's corrected balance is negative at any effective-time boundary, return 409 `historical_overdraft`. Balances at a boundary include the combined effect of all movements at that instant." | corrections | | open |
| S3-036 | "Either failure preserves balances, revision history, statements and idempotency state." | corrections | | open |
| S3-037 | "The sum of balances must equal the seeded total in every historical view." | corrections | | open |
| S3-038 | "The original payment and every original idempotent response remain unchanged. `GET /activity` continues to display the original payment; correction records are not new feed payments." | corrections | | open |
| S3-039 | "`GET /payments/{payment_id}/revisions` returns `{"revisions": [...]}` in revision order, including revision 1 (`reason: ""`)." | revisions | | open |
| S3-040 | "Only the two parties can read it; a third party gets 404 even for a public payment. No token is 401." | revisions | | open |

## `known_at`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-041 | "`GET /me` and `GET /statement` accept optional `known_at`, an RFC 3339 instant with offset." "Invalid/empty instants are 422. Echo supplied `known_at` exactly." | known_at | | open |
| S3-042 | "For each payment, select its latest revision recorded **at or before** `known_at`; if none was yet recorded, that payment contributes nothing. Omission means everything known when the read begins." | known_at | | open |
| S3-043 | "Then apply selected revisions according to their **effective** times. `as_of` retains its inclusive meaning; a statement retains its half-open window. Both query instants may be in the future." | known_at | | open |
| S3-044 | "Statement ordering is now by selected `effective_at`, then payment id. Each entry ... adds the selected `revision`, `effective_at` and `recorded_at`. `payment.amount` is the selected amount for this statement. Zero-amount revisions still appear as entries with zero delta. No correction is counted alongside the revision it replaces. With no corrections and no `known_at`, previous behavior is unchanged." | statement | | open |

## Stable statement pagination

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-045 | "Every first `GET /statement` response additionally returns an opaque `snapshot` token. It freezes the caller's selected revisions, window, balances, entries and default `to` at that read." | snapshot | | open |
| S3-046 | "`GET /statement?snapshot=<token>&limit=...&offset=...` pages that exact result, even after payments or corrections." | snapshot | | open |
| S3-047 | "Only limit and offset may accompany a snapshot; supplying `from`, `to` or `known_at` with it gives 422 `validation_failed`." | snapshot | | open |
| S3-048 | "Unknown token, another user's token, or a token from before reset gives 404 `not_found`. Tokens last until reset." | snapshot | | open |
| S3-049 | "Paging changes neither balances nor entries; the final partial page and offsets beyond the end must report `has_more` correctly." | snapshot | | open |
| S3-050 | "Unrecognized query parameters remain ignored under stage 1's general rule." | snapshot | | open |
| S3-051 | "A correction may move a payment into or out of a statement window." | snapshot | | open |
| S3-052 | "Existing snapshots remain unchanged during concurrent payments or corrections. Concurrent corrections using the same expected revision cannot both succeed." | concurrency | | open |

## Settlement history and imports

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-053 | "Stage-1 settlements retain their original receipts and privacy rules. Each member's original revision uses its shared committed_at as both effective_at and recorded_at." | settlements | | open |
| S3-054 | "Single-payment corrections reject settlement members with 422 `linked_payment_immutable`." | settlements | | open |
| S3-055 | "Captures are immutable linked payments: a correction of a capture gives 422 `linked_payment_immutable`." | captures | | open |
| S3-056 | "A stage-3 service must accept exports produced by the same team's stage-1 or stage-2 service. The ledger must import and account for authorizations and captures." | import | | open |

## Historical holds

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-058 | "For `GET /me?as_of=T&known_at=K`, all four money fields describe that same view: `balance = total`, `available = total - held`." | holds | | open |
| S3-059 | "A hold starts at authorization creation; nonfinal capture reduces it at capture time; final capture, void or expiry releases the remainder at that event's time. Expiry takes effect at `expires_at`." | holds | | open |
| S3-060 | "Events other than clock expiry are known at their server-assigned event time. Once creation is known, the expiry deadline is known too." | holds | | open |
| S3-061 | "For queries beyond now, an open hold expires at its deadline. Without `as_of`, use the instant the request began." | holds | | open |
| S3-063 | "Authorizations expose `closed_at` (null while open; event time when closed)." | holds | | open |
| S3-064 | "A correction is rejected with 409 `historical_overdraft` if it makes either total or available negative at any past effective/event boundary, under the latest known revisions. Current unaffordable debits still take precedence as `insufficient_funds`." | holds | | open |
| S3-065 | "Seeded open holds are assumed created at reset unless `created_at` is supplied; seeded closed holds need not reconstruct a prior lifecycle." | holds | | open |
| S3-066 | "`GET /statement` still contains money movements only: authorization, release and expiry are not payments. Captures appear exactly once with their links." | holds | | open |
| S3-067 | "Old snapshots remain unchanged after any lifecycle action or correction." | holds | | open |

## State and idempotency

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-068 | §10 continues to apply to the new state: export/import keeps revisions (amounts, `effective_at`, `recorded_at`, reasons), correction receipts and replays, payment `created_at`, `closed_at`. Edited exports that break these (receipt fields, revision order and times, ranges) are 422 | import | | open |
| S3-069 | §7 on the eighth path: a missing key is 400 `missing_idempotency_key`; keys are per user; a claimed key is resolved before field validation and current-resource checks; a failed correction claims no key | corrections | | open |

## Decisions (test-designer, stage 3)

Stage-1 (D1–D12) and stage-2 (D2-1..D2-9) decisions still apply.

- **D3-1 Window parameters.** `from` and `to` are instants, like `as_of` and `known_at`. A naive
  time, a bare date or an empty value is 422 `validation_failed`, by §5's "invalid format" rule.
- **D3-2 "Not later than now".** A correction's `effective_at` up to the moment of the request is
  valid. Tests send instants clearly in the past, or at least 60 s ahead, and nothing within a
  second of now.
- **D3-3 Exact echo.** `as_of` and `known_at` come back as the identical string sent, offset
  spelling included (`+02:00` stays `+02:00`; `Z` stays `Z`).
- **D3-4 Timing.** Tests that depend on server-assigned times read those times from responses
  (`created_at`, `recorded_at`, `committed_at`, `closed_at`) and query relative to them, never to
  the test machine's clock. Where boundaries matter they pass an explicit `to`.
- **D3-5 Not tested.** `from` later than `to`; snapshot tokens across an import; the order of
  checks when one correction breaks several rules, except where the spec states it
  (`insufficient_funds` before `historical_overdraft`).
- **D3-6 Correction of request payments.** A payment made by paying a request is an ordinary
  payment, not a linked one. Its sender may correct it.
- **D3-7 S1-R17 stands.** No stage-3 rule needs balances or totals above 2^53. Historical views
  are bounded by the same totals.
