# Acceptance check — round 3

- Product revision: 824d08499283469993cc22c19d707531b7dc6413 (stage-1/ as at 6e91768)
- Suite revision: 94de59b (`work/acceptance/`)
- Command: `work/acceptance/run.sh <worktree>/stage-1 1`, from a detached worktree of 824d084
- Rows covered: 190 / 190 (187 with tests; S1-008, S1-014, S1-015 not testable)
- Suites run: stage 1

## Status of the previous round's failing ids

| Id | Round 2 (d0f71b1) | Round 3 (824d084) |
|---|---|---|
| S1-158 | failing (F1, F2) | **fixed**: every F1/F2 case and the R12 cases are refused with 422, destination unchanged |
| S1-073 | failing (F1) | **fixed**: out-of-range timestamps are refused, so no 500 follows |
| S1-024 | failing (F1) | **fixed**: year-10000+ timestamps are refused; 9999-12-31T23:59:59.999 is accepted and served in RFC 3339 form |
| S1-013 | — | **newly failing** (F3, reset time; from the R16 probe) |

## Counts

| Tests | Passed | Failed | Errors |
|---|---|---|---|
| 553 | 553 | 0 | 0 |

## Probes beyond the suite

All probes go through the HTTP API of a container of this build (`--cpus 2 --memory 2g`). The
import probes edit fields of an export this build produced. 94 of the round-2 probes were
repeated and all pass, along with 87 new probes for R11–R15 and the R16 timings below.

| Area | Result |
|---|---|
| F1/F2 repeat | All pass: timestamps 1e20, year 10000, 1.5, negative, missing; paid with no or unknown payment; pending with a payment; split shares off; dangling `settlement_id`. Each is 422 with the destination unchanged. |
| R11 timestamps | `last_timestamp_ms` 1e20 / 253402300800000 / 1.5 → 422. `last_timestamp_ms = 253402300799999` (the RFC 3339 maximum) → 204; the next payment is 201 at `9999-12-31T23:59:59.999+00:00`, and its retry is a 200 replay that moves money once. No probe produced a 5xx, so none could commit money. |
| R12 contradictions | A paid request set back to `pending` or `declined` (with or without its `payment_id`), a payment naming another or no request, a second payment for one request, a payment amount or payer different from the request's, duplicate idempotency scopes, a corrupt fingerprint, duplicate or empty tokens, `seeded: "yes"`: all 422. **`seeded` flag:** setting `seeded: true` with `payment_id: null` on an API-paid request is refused, because its payment still names the request. A fixture-paid request (no payment) is served as `paid`/`null`, re-imports, and is 409 `request_not_pending` on pay. That matches the ruling in decisions.md (0167025). |
| R13 amounts | On `/payments`, `/requests`, `/splits` and `/settlements`: `1.0000000000000001`, `1000000000.0000000001`, `0.99999999999999999`, `1e-400`, `-0`, `0.0`, `15e-1`, `1000000000.5`, `9007199254740993`, `1e400`, a 30-digit integer and `1.00000000000000000000001e2` are all 422. Integral spellings `1.5e1` (15), `100.00`, `1E0`, `2e0`, `0.5e1` and `1000000000.0` are accepted with the exact integer. |
| R14 balances | Fixture balance `9007199254740993`, `9007199254740991.5`, `1e400` and `10.5` → 422. `9007199254740992` and `1e2` are stored exactly. Import of a balance `9007199254740993` or `123456.0000000000001` → 422. |
| R15 fixture links | A request's `payment_id` of `5`, `"p_1"`, `"p_zzz"`, `null` or an object, and a payment's `request_id: "rq_1"`, are ignored: reset 204, both served as `null`, and the request stays payable. |
| R16 reset time | **Failure F3 below.** A login sent 1 s into each long reset answered 200 in 0.03–0.04 s, against the previous state. Each seeded user can log in right after the reset (0.04 s); a wrong password is 401; 50 concurrent logins all return 200 within 0.64 s. No plaintext password appears in the export taken right after the reset. |

Not counted: an idempotency record whose `fingerprint` is replaced with different *valid* JSON is
accepted. Nothing in the state tells it apart from a record for another body.

## Failures

### F3 — S1-013: reset of 900 or more users with distinct passwords exceeds 10 s

- **S1-013** "Per-request timeout | 5 s (10 s for `POST /_test/reset`)". The fixture format puts no bound on the number of users.
- **Sent:** `POST /_test/reset` with a fixture of N users, each with a different password (`pw-<i>-…`), no payments or requests. Measured on the 2-CPU, 2 GiB container, each run alone with nothing else running, the 1000-user case twice.
- **Expected:** 204 within 10 s.
- **Actual:**

| Users | Status | Seconds |
|---|---|---|
| 600 | 204 | 7.33 |
| 800 | 204 | 9.80 |
| 900 | 204 | **11.05** |
| 1000 | 204 | **12.30**, 12.35 (repeat), 12.11 (first run) |
| 1500 | 204 | **18.32** |
| 2000 | 204 | **24.51** |

Logins are no longer held during a reset (R16's second half is fixed).

## Failing requirement ids

S1-013 (F3, from probes; the suite itself passes). It is a blocking finding.
