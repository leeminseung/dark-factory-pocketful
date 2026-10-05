# Acceptance check — round 2

- Product revision: d0f71b1b999c812089f549a523dbf62496ee5511 (stage-1/ as at 6fca369)
- Suite revision: 94de59b (`work/acceptance/`)
- Command: `work/acceptance/run.sh <worktree>/stage-1 1`, from a detached worktree of d0f71b1
- Rows covered: 190 / 190 (187 with tests; S1-008, S1-014, S1-015 not testable)
- Suites run: stage 1

## Previous round

Round 1 (09c3a2d) had no failing requirement ids. Still none fail in the suite.

## Counts

| Tests | Passed | Failed | Errors |
|---|---|---|---|
| 553 | 553 | 0 | 0 |

## Probes beyond the suite

The coordinator asked me to probe the four areas this revision changes. I drove a container
of this build through its HTTP API only. The export's `state` is opaque to the caller, so to
probe import validation I edited fields of an export this build produced.

| Area | Result |
|---|---|
| Import validation (R1, b82da36) | Ids (64 accepted, 65 refused, counted in characters; 64 emoji accepted), email, handle pattern and uniqueness, balance type/sign/2^53, minor_units, currency, payment amount/note/visibility/parties/ids, request status/parties, unknown references from splits/settlements/tokens/operators: all 422 with the destination unchanged. The service's own export (zero-share split requests included) re-imports, and a re-export equals the original. **Failures F1 and F2 below.** |
| Idempotency scope (R2, 1299036) | `POST /payments` then `POST /payments/` with the same key and body is a 200 replay with an identical body; money moves once. `pay` on `rq%5F…` and on `…/pay/` replays as 200. Six seeded ids containing `/`, space, `%`, `ü`, `?`, `#`, paid with one shared key, are six distinct 201s, each for its own amount; `/requests/rq/1/pay` is 404. No failure. |
| Decline/cancel bodies (R3, b6b6c26) | `{garbage`, `\xff`, whitespace only, `null` and `[]` are 400 `malformed_request`, and the request stays `pending`. An empty body, `{}` and `{"x":1}` are 200. Without a token, a garbage body is 401. This matches the R3 ruling. No failure. |
| Split/settlement records (7d084dc) | After reset+import and a second import, split and settlement replays return 200 with the original body. Split requests and settlement members in `GET /requests` and the feed equal the originals. A zero-share split request can be paid after import. No failure. |

## Failures

### F1 — S1-158, S1-073, S1-024: import accepts timestamps outside the RFC 3339 range, then the API breaks

- **S1-158** "missing fields, wrong track/version or an invalid state give 422 `validation_failed` without changing the destination."
- **S1-073** "Requests must not produce 5xx responses, including under concurrent load."
- **S1-024** "Timestamps in responses are RFC 3339 with an explicit offset"

Base for every case: reset (ada 10000 operator, bob, cy, dan), ada pays bob 5, then `GET /_test/export`.
Each case is that export with one value changed, sent to `POST /_test/import`.

| Sent | Expected | Actual |
|---|---|---|
| `state.payments[0].created_at_ms = 10^20` | 422, destination unchanged | 204; afterwards `GET /activity` (bob) → **500** `internal_error` |
| `state.last_timestamp_ms = 10^20` | 422 | 204; afterwards **every** `POST /payments` → **500** |
| `state.payments[0].created_at_ms = 253402300800000` (year 10000) | 422 (no RFC 3339 form) | 204; feed shows `created_at: "+010000-01-01T00:00:00.000+00:00"`, not RFC 3339 |
| `state.payments[0].created_at_ms = 8.64e15` | 422 | 204; feed shows `"+275760-09-13T00:00:00.000+00:00"` |

`created_at_ms` values that are negative, `"x"` or missing are refused correctly (422).

### F2 — S1-158: import accepts records that contradict each other

- **S1-158** "... an invalid state give[s] 422 `validation_failed` without changing the destination."
- The rules broken: S1-114 "The request becomes `paid` and carries the new `payment_id`". S1-134 "`shares` ... always sums to `amount`". S1-182 "`settlement_id` linking the batch".

| Sent (export with one change) | Expected | Actual |
|---|---|---|
| a request with `status: "paid"`, `payment_id: null` | 422 | 204; `GET /requests` shows a paid request with no payment |
| a request with `status: "paid"`, `payment_id: "p_ghost"` (no such payment) | 422 | 204 |
| a pending request with `payment_id` set to an existing payment | 422 | 204; shows `pending` with a payment id until paid again |
| a split with `shares[0].amount = 5` for `amount: 1` | 422 | 204 |
| a payment with `settlement_id: "st_ghost"` (no such settlement) | 422 | 204; the feed shows `settlement_id: "st_ghost"` |

Not counted as failures:
- An idempotency record with its stored `status` set to 500, or with a garbage `scope`, is accepted. Replays still answer 200 with the stored body, so no requirement is observably broken.
- A payment with `amount: 0` is accepted. That is a state the service itself produces when a zero-share request is paid.

## Failing requirement ids

S1-158, S1-073, S1-024 (all from probes F1/F2; the suite itself passes). Each is a blocking finding.
