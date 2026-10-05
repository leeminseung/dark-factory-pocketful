# Stage 1 — final review of d0f71b1

- **Revision:** d0f71b1b999c812089f549a523dbf62496ee5511 (stage-1 = 6fca369)
- **Round-1 revision:** 09c3a2d (report: work/reviews/review-09c3a2d-round1.md)
- **Requirements:**
  - spec stage-1.md §1-§11;
  - work/stage-1/requirements.md (S1-001..S1-190, D1-D12);
  - rulings R3 and R4 in work/stage-1/decisions.md.
- **Latest acceptance report:** work/reviews/acceptance-d0f71b1.md. The suite passes 553/553, but its probes fail
  S1-158, S1-073 and S1-024. No ruling calls any of these a test error.
- **Case memory:** work/case-memory.md does not exist yet.
- **Worktree:** /Users/mslee/dark-factory/band-work/worktrees/reviewer-d0f71b1, with `work/` deleted.

## Verdict: CHANGES NEEDED — blocking count 9

| Source | Count |
|---|---|
| Open blocking R findings: R11, R12, R13, R14, R15, R16 | 6 |
| Failing requirement ids in the latest acceptance report: S1-158, S1-073, S1-024 | 3 |
| Stages failing the supplied checks | 0 |
| **Total** | **9** |

## Supplied checks

```
cd /Users/mslee/dark-factory/dark-factory-wearedevs && .venv/bin/python -m harness run --track pocketful \
  --repo /Users/mslee/dark-factory/band-work/worktrees/reviewer-d0f71b1 --all --mode isolated \
  --out /Users/mslee/dark-factory/band-work/checks/reviewer-d0f71b1-final-isolated
```

The run printed:
- stage 1: pass
- stage 2: fail (expected)
- highest contiguous stage: 1
- claimed stage: 1 on the shipped checks

`summary.json` shows mode isolated and share 1.0. Nothing failed on time or resources, so nothing needed re-measuring.

## Passes run

| Pass | Brief | Raw answer |
|---|---|---|
| fix-commit (09c3a2d..d0f71b1) | work/reviews/review-d0f71b1-fixes-brief.md | work/reviews/review-d0f71b1-fixes-raw.md |
| black-box probe | work/reviews/review-d0f71b1-probe-brief.md | work/reviews/review-d0f71b1-probe-raw.md |

How the passes were run:
- **The fix-commit pass was not skipped:** the final revision differs from the round-1 revision.
- **The briefs are too long to paste:** the probe brief is 79 KB and the fix-commit brief is 27 KB. Each
  subagent was started with a one-line instruction to read its brief from a read-only copy in /tmp. Each copy
  was byte-identical to the committed brief, and both copies have since been deleted.
- **The probe target:**
  - image `pocketful-reviewer-d0f71b1`, container of the same name;
  - address 127.0.0.1:62722, limited to `--cpus 2 --memory 2g`;
  - the container and image are removed now.

**Raw findings:** 17 in total.
- The fix-commit pass reported B1-B2 and N1-N5.
- The probe reported F1-F10.

**Verification:**
- I reproduced every blocking raw finding on the running build, or read the code at its location.
- After merging duplicates, the 17 raw findings became 13 findings, numbered R11-R23.
- I raised none of them to a different level from what the passes proposed, except F2, F4 and F8/F9, explained
  below.
- I dismissed no finding outright. Two of the probe's blocking proposals (F3 and F10) are recorded below as
  non-blocking, with reasons.

## Status of round-1 findings

| R | Status | Evidence |
|---|---|---|
| R1 (blocking): import accepted ids over 64 characters and a bad email | **fixed** | The R1 reproduction on d0f71b1 now gives 422 `invalid state: users[0] fields` for both the 100-character id and the email `"x"` (b82da36, with model rules in src/model.js). The wider class of invalid imported state is still open; see R11 and R12. |
| R2: idempotency scope used the raw path | **fixed** | 1299036 scopes keys by route pattern and decoded params. Both passes confirmed that `/payments/` and `rq%5F1` replays now return 200, and a regression test was added. |
| R3: decline/cancel accepted an unparseable body | **fixed** per ruling | b6b6c26. A non-empty unparseable body gives 400; an absent or empty body gives 200. |
| R4: pay with no body gives 400 | ruled no change | decisions.md |
| R5: no single gate for status changes | **fixed** | 0fc7141 adds `State.closeRequest`. The residual is R22 (non-blocking). |
| R6: handle lookup and self check written four times | **fixed** | 8e4d4dc adds `handlers/handles.js`. |
| R7: constants and response shapes scattered | **fixed** | 2947d77 and 7d084dc. A residual duplication is in R20. |
| R8: async guard ran after the effect | **partly fixed** | 6fca369 refuses an `AsyncFunction` at startup. A sync function that returns a Promise still slips past; see R23 (non-blocking). |
| R9: retry and concurrency tests missing | **fixed** | 6015aee adds test/concurrency.test.js. `npm test` passes 72/72. |
| R10: commit discipline | **mostly fixed** | Each fix now has its own commit and test. 7d084dc is still labelled a restructure but changes behaviour; see R19. |

## New findings

### R11 — BLOCKING: import accepts out-of-range timestamps, leading to 500s, non-RFC 3339 output and money moving twice on retry
- **Location:**
  - `stage-1/src/snapshot.js`: `last_timestamp_ms` and every `*_ms` field are checked only with `isCount`
    (a non-negative integer);
  - `src/clock.js:4` formats with `new Date(ms).toISOString()`;
  - the error is raised after `movePayments` has committed, so no idempotency record is written.
- **Sources:** fixes B1; probe F5 (rows 1-4), F6 and F7. This is the same defect as the acceptance probe
  failures F1, which fail S1-158, S1-073 and S1-024.
- **Requirements:**
  - §10 "an invalid state give 422 `validation_failed` without changing the destination";
  - §5 "Requests must not produce 5xx responses";
  - §3.4 "Timestamps in responses are RFC 3339 with an explicit offset";
  - §8 "a failed payment leaves no trace in either";
  - §7 "The operation takes effect only once."
- **Reproduced on the running build:**
  1. Reset with ada 10000 and bob 2500, then export.
  2. Set `state.last_timestamp_ms = 1e20` and import → **204**.
  3. `POST /payments` with key k1, amount 100 → **500**, and ada's balance becomes **9900**.
  4. The same request with the same key again → **500**, and the balance becomes **9800**.
- **Probe also showed:**
  - a payment with `created_at_ms = 1e20` makes `GET /activity` return 500;
  - `253402300800000` is served as `+010000-01-01T00:00:00.000+00:00`.
- **Expected:** the import is refused with 422.

### R12 — BLOCKING: import accepts self-contradicting records, so a request can be paid twice and retries can be lost
- **Location:** `stage-1/src/snapshot.js`:
  - `request_id`, `settlement_id` and `payment_id` are checked for format only, not that they point to an
    existing record;
  - nothing ties a request's `status` to its `payment_id`;
  - split shares are not summed;
  - idempotency entries (`scope`, `fingerprint`) are not checked to be well formed or unique;
  - token strings are not checked to be unique or non-empty.
- **Sources:** fixes B2; probe F5 (rows 5-8). This is the same defect as acceptance F2, which fails S1-158.
- **Requirements:**
  - §1 "3. A payment request may move money at most once.";
  - §10 "an invalid state give 422 `validation_failed`";
  - §8 "`shares` … always sums to `amount`";
  - §11 "Every member is an ordinary payment with `settlement_id` linking the batch".
- **Reproduced:**
  1. Ada pays `rq_1` (201), then export.
  2. Set the request's `status` to `"pending"` and import → **204**.
  3. `POST /requests/rq_1/pay` with a new key → **201**. Ada's balance is 9800: she paid the same request twice.
- **Probe also showed:**
  - with `idempotency[0].scope = "not json"`, a replay of the original payment gives 201 and a second payment;
  - with a corrupt `fingerprint`, an identical replay gives 409.
- **Expected:** 422 for every contradicting state.
- **Fix direction:** validate the whole state in one place, in model.js, after all records are read. The R1
  fix only covered single fields.

### R13 — BLOCKING: amounts that are not integers are rounded and accepted
- **Location:** amount validation reads JSON numbers as IEEE doubles (`JSON.parse`), so the integer check runs
  on an already-rounded value.
- **Source:** probe F1.
- **Requirements:**
  - §4 "API amounts must have an integral numeric value";
  - §8 "`amount` below 1, above 1000000000, or not an integer | 422 `validation_failed`" (payments, requests
    and splits; settlements via §11);
  - §4 "Monetary arithmetic must preserve exact minor-unit values without rounding error."
- **Reproduced:** `POST /payments` with raw body `{"to_handle":"bob","amount":1.0000000000000001}` → **201**
  with `amount: 1`.
- **Probe also showed:** `1000000000.0000000001` → 201 and 1e9 moved, although the value is both not an
  integer and above the maximum.
- **Expected:** 422 `validation_failed`.
- **Note:** this case is in the edge-cases skill's case memory: a parser that reads numbers as doubles rounds
  them silently.

### R14 — BLOCKING: a fixture balance above 2^53 is accepted and stored rounded
- **Source:** probe F2. I raised it to blocking under D3.
- **Requirements:**
  - §4 "no operation produces a balance outside ±2⁵³. Monetary arithmetic must preserve exact minor-unit
    values without rounding error.";
  - D3 "A fixture that breaks a stated rule … `422 validation_failed` from reset".
- **Reproduced:** reset with a balance of `9007199254740993` → **204**, and `GET /me` then shows
  `9007199254740992`.
- **Expected:** 422, or the exact value; never a silently changed balance.
- **Note:** this is also case-memory class 1 (integers near and above 2^53 − 1 in seeded data).

### R15 — BLOCKING: reset reads a request `payment_id` that is not in the fixture format, and fails on it
- **Source:** probe F4.
- **Requirements:**
  - §3.4 "Unknown fields in a request body are ignored, never an error.";
  - §4 fixture format: a request has `id`, `requester_id`, `payer_id`, `amount`, `note` and `status`.
- **Reproduced:** a fixture request with `"payment_id": 5` → **400** `malformed_request "requests[0].payment_id
  must be a string"`, and nothing is reset.
- **Probe also showed:**
  - a `pending` or `declined` request with `payment_id: "p_1"` is served carrying that id;
  - `payment_id: "p_zzz"` is accepted although no such payment exists.
- **Expected:** the field is ignored, the reset gives 204, and the request shows `payment_id: null`.
  Alternatively, if the field is read at all, it must be read consistently with `status` and with the
  payments.

### R16 — BLOCKING: reset hashes seeded passwords one after another; past about 760 users it overruns 10 s and holds a concurrent login past 5 s
- **Sources:** probe F8 and F9. I raised them to blocking because a stated limit fails.
- **Requirement:** §2 "Per-request timeout | 5 s (10 s for `POST /_test/reset`)".
- **Reproduced:**
  - reset of 1001 users → 204 after **13.26 s**;
  - a login sent 1 s into that reset → 200 after **12.2 s**.
- **Probe timings:**
  - 200 users: 2.7 s; 500 users: 6.7 s; 2000 users: 26.9 s;
  - a login overlapping a 701-user reset took 8.24 s.
- **Note:** both cases are in the edge-cases skill's case memory, including "a sign-in that overlapped a reset
  was held past the stated time limit". The spec puts no bound on fixture size.
- **Fix direction:** hashing cost per seeded user must not make reset grow past the limit, and must not starve
  login. For example:
  - hash in parallel within the CPU budget;
  - hash identical passwords once with a per-user salt scheme that stays a password-hashing function;
  - defer each seeded hash to first login, while still never storing plaintext.

### R17 — non-blocking: a fixture whose total balance is above 2^53 is refused
- **Source:** probe F3.
- **Evidence:** reset with two balances of 2^52+1 → 422 "seeded balances exceed 2^53 in total". Import does
  the same.
- **Why non-blocking:**
  - Against: no rule caps the total. §3.3 says "Replace all service state with the fixture".
  - For: §4 promises "no operation produces a balance outside ±2⁵³". A payment between those two wallets would
    break that promise, so such a fixture is outside the domain the text defines.

### R18 — non-blocking: a body with invalid UTF-8 is accepted and the note is changed
- **Source:** probe F10.
- **Evidence:** reproduced. A body whose `note` holds the raw bytes `\xff\xfe` gives **201**, and the note is
  stored as U+FFFD characters.
- **Requirements:** §3.4 "Requests and responses are `application/json; charset=utf-8`"; §5 "Unparseable
  body".
- **Why non-blocking:** the text does not say how a body with a bad encoding is treated. 400 would be the
  stricter reading.

### R19 — non-blocking: commit 7d084dc is labelled a restructure but also makes import stricter
- **Source:** fixes N1.
- **Principle 4:** "a commit labelled as restructuring that changes behaviour" is a finding.

### R20 — non-blocking: the rules for stored records are still written twice
- **Source:** fixes N2.
- **Location:** `fixture.js` (readParties, readOptionalRef, amount ranges) and inline in `snapshot.js:104-121`.
- **Principle 2.** This duplication is the structural cause of R11, R12 and R15.

### R21 — non-blocking: the b82da36 message claims more than the commit does
- **Source:** fixes N3.
- **Evidence:** the message says import checks "ids and links"; the links are checked for format only (see R12).
- **Principle 5.**

### R22 — non-blocking: `State.closeRequest` accepts any status string
- **Source:** fixes N4.
- **Location:** `state.js:116`.
- **Principle 1:** the gate should accept only the three terminal statuses.

### R23 — non-blocking: the R8 guard misses a sync handler that returns a Promise
- **Source:** fixes N5.
- **Location:** `routes.js:23` checks only for `AsyncFunction`, and the after-the-effect check in
  `idempotency.js` is still there.
- **Principle 3.** No handler today behaves this way.

## Found sound (from the passes and my own checks)

- **Money invariants:** the total balance and the no-negative rule held under 1500 mixed concurrent writes at
  50 in flight. Each request was paid at most once.
- **Replays under concurrency:** on all five idempotent paths, 50 identical concurrent requests gave one 201
  and 49 × 200 with one body.
- **Malformed input:** requests that cannot be parsed, huge headers, deep nesting and 60 MB bodies all got
  §5 error bodies with no 5xx.
- **Field rules:** amount forms, handle derivation, paging, the §9 rounding table, the feed rule, settlement
  affordability and precedence, and auth parties all behave as written.
- **Export/import:** an untampered export imports and round-trips with all replays byte-identical.
- **Fix-commit pass:** R2, R3, R5, R6, R7 and R8 were confirmed against their regression tests.
- **Password storage (§6):** scrypt (read in round 1, unchanged since).
