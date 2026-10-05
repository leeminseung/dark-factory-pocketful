## Review of 09c3a2d..d0f71b1 (stage-1): fix-commit pass

I ran `npm test` and it passes, 72/72. The brief asks for Node 22 but only Node v25.2.1 was on the host. I also ran the service on port 18471 and probed it over HTTP; it is stopped now. I wrote no files and made no commits.

### Blocking findings

**B1. Import accepts timestamps no response can format. The service then answers 500 after it has already moved money, and a retry moves the money again.**
- **Location:** `stage-1/src/snapshot.js:76` (`last_timestamp_ms`), `:109` (payment `created_at_ms`), `:121`, `:131`, `:139`. All of them use `isCount` (`:58`), which only checks for a non-negative integer. `model.js` has no timestamp rule, so the R1 commit b82da36 ("import applies the same model rules as reset") left timestamps out. The 500 itself comes from `clock.js:4` (`new Date(ms).toISOString()` throws, or gives `+010000-…`). It is raised after `movePayments` has committed (`handlers/payments.js`, `state.js:closeRequest`), so `runIdempotent` never records the key.
- **Requirements:**
  - §10: "missing fields, wrong track/version or an invalid state give 422 `validation_failed` without changing the destination."
  - §5: "Requests must not produce 5xx responses, including under concurrent load."
  - §3.4: "Timestamps in responses are RFC 3339 with an explicit offset"
  - §8: "a failed payment leaves no trace in either"
  - §7: "The operation takes effect only once."
- **Reproduce:**
  1. Reset with ada 10000, bob 2500 and a pending `rq_1` (bob asks ada for 100).
  2. `GET /_test/export`, set `state.last_timestamp_ms = 1e20`, then `POST /_test/import`.
     - Expected: 422. Actual: 204.
  3. `POST /payments` as ada, `Idempotency-Key: k1`, `{"to_handle":"bob","amount":100}`.
     - Actual: **500**, yet ada's balance drops 10000 → 9900.
  4. Retry with the same key and body.
     - Actual: **500 again**, and the balance drops 9900 → 9800. The money moved twice.
  5. `POST /requests/rq_1/pay` with key k2. Actual: 500.
  6. Retry pay with key k2.
     - Actual: **409 `request_not_pending`**, and 100 was debited.
- **Other cases from the same root:**
  - A payment's `created_at_ms = 1e20` imports with 204, then `GET /activity` → 500.
  - `created_at_ms = 253402300800000` imports with 204, then the feed shows `"+010000-01-01T00:00:00.000+00:00"`, which is not RFC 3339.
- The acceptance probes (F1) found the 500s. They did not report the second money movement on retry.
- **Blocking:** it breaks §10, §5, §3.4 and §8 under a stated condition (importing an invalid state).
- **Fix:** add a timestamp predicate to `model.js`: an integer in the range `Date`/RFC 3339 can format, at most 253402300799999. Use it for every `*_ms` field and for `last_timestamp_ms`. Each case needs a regression test.

**B2. Import accepts records that contradict each other, so a request can move money twice.**
- **Location:** `stage-1/src/snapshot.js:108` and `:121`. `isOptionalId` checks only the format of `request_id`, `settlement_id` and `payment_id`, never that they refer to something. Nothing ties `status` to `payment_id`. At `:128-132` split shares are not checked to sum to `amount`. The R1 commit message claims "ids and links" are checked.
- **Requirements:**
  - §1: "3. A payment request may move money at most once."
  - §8: "The request becomes `paid` and carries the new `payment_id`."
  - §8 splits: "`shares` … always sums to `amount`."
  - §11: "Every member is an ordinary payment with `settlement_id` linking the batch"
  - §10: "an invalid state give[s] 422 `validation_failed`".
- **Reproduce:**
  1. Reset as in B1, then have ada pay `rq_1`.
  2. Export, change `requests[0].status` to `"pending"` (its `payment_id` is still set), and import.
     - Expected: 422. Actual: 204.
  3. `POST /requests/rq_1/pay` with a new key.
     - Actual: 201. Ada's balance falls a second time, and `GET /activity` shows **2 payments with `request_id: "rq_1"`**.
- A payment with `request_id: "rq_ghost"` and `settlement_id: "st_ghost"` also imports with 204. The acceptance probes (F2) additionally found that a paid request with a null or unknown `payment_id`, and a split whose shares do not sum to `amount`, are accepted.
- **Blocking:** it breaks the §1 invariant and §10 under a stated condition.
- **Fix:** check cross-record consistency after all records are read:
  - status `paid` ⇔ `payment_id` names a payment whose `request_id` is this request;
  - `payment.request_id` and `settlement_id` name existing records;
  - each settlement's `payment_ids` ⇔ the payments that carry that `settlement_id`;
  - each split's shares sum to its `amount`.

### Non-blocking findings

**N1. Commit 7d084dc ("Restructure: splitView and settlementView …") is a restructure that also changes behaviour.**
- It also makes import stricter: splits and settlements now need every field, and their references must exist.
- Principles: 4, "a commit labelled as restructuring that changes behaviour, are findings"; 5, "A commit has one purpose."
- The message admits the extra purpose. The response bodies really are unchanged.
- Not blocking: no requirement is broken.

**N2. The stored-record rules are still written twice: in `fixture.js` (readParties, readOptionalRef, `amount(...,{min:0})`) and inline in `snapshot.js:104-121`.**
- This covers distinct parties, the record amount range, optional references and status. Principle 2: "A rule spread over several places, or written twice, is a finding." The smell is Duplicated code.
- That is why B1 and B2 exist: model.js has predicates for single fields but no single "valid record / valid state" check. Reset sets timestamps itself, so the gap only shows on import.
- Not blocking on its own.

**N3. The b82da36 message overclaims.**
- It says import validates "ids and links", but links are only checked for format (see B2). Principle 5: the message must name what it fixes.
- The probe for S1-158 still fails after this commit.
- Not blocking.

**N4. `State.closeRequest` (`state.js:116`) accepts any `status` string.**
- `closeRequest(r, 'pending')` or a typo would "close" a request into an invalid state. The gate should only accept the three terminal statuses (`model.js REQUEST_STATUSES`).
- Principle 1 (one gate per invariant) and readability. Both current callers pass valid values, so it is not blocking.

**N5. The R8 backstop still lets a change commit without a key record (`idempotency.js:371-373`).**
- A sync handler that returns a Promise runs its change, then gets 500 with no key recorded.
- `defineRoutes` (`routes.js:23`) only catches `AsyncFunction`.
- Principle 3. No current handler does this, so it is not blocking.

### Checked and found sound
- **R2 (1299036):** the key scope is `canonicalJson([user, method, route pattern, decoded params, key])`. Different users and different paths stay independent. `/payments/` and `rq%5F1` replay correctly, and a regression test is included.
- **R3 (b6b6c26):** decline/cancel give 200 for an absent or empty body and for any JSON object. Unparseable bodies, whitespace-only bodies and non-objects give 400 and change nothing, which matches the R3 ruling. Auth is still checked first. A regression test is included.
- **R5 (0fc7141), labelled restructure:** `closeRequest` keeps the old order: 409 when not pending, `insufficient_funds` leaves the request pending, and repeating a decline or cancel is still 200. It is pinned by the R9 concurrency tests (6015aee).
- **R6 (8e4d4dc), labelled restructure:** `handles.js` keeps the 404 / `self_payment` / `self_request` order in payments, requests and splits. A settlement entry still checks amount, then note, visibility, the from handle (type, then 404), the to handle (type, then 404), and finally self. Only the message wording changed.
- **R7 model.js commit (2947d77), labelled restructure:** it only moves constants and predicates. Behaviour is the same apart from a message string.
- **R8 (6fca369):** async idempotent handlers are refused at startup, with a test.
- **Split and settlement responses:** `splitView` and `settlementView` produce the same bodies as before, and the export format of splits and settlements is unchanged. A split replay survives export/import (tested).
- **Unchanged areas:** reset fixture validation behaves as before. Settlement atomicity and idempotency, and the concurrent pay/decline/cancel cases, hold (concurrency tests pass).

Relevant files:
- `/Users/mslee/dark-factory/band-work/worktrees/reviewer-d0f71b1/stage-1/src/snapshot.js`
- `/Users/mslee/dark-factory/band-work/worktrees/reviewer-d0f71b1/stage-1/src/model.js`
- `/Users/mslee/dark-factory/band-work/worktrees/reviewer-d0f71b1/stage-1/src/clock.js`
- `/Users/mslee/dark-factory/band-work/worktrees/reviewer-d0f71b1/stage-1/src/state.js`
- `/Users/mslee/dark-factory/band-work/worktrees/reviewer-d0f71b1/stage-1/src/fixture.js`
- `/Users/mslee/dark-factory/band-work/worktrees/reviewer-d0f71b1/stage-1/src/idempotency.js`
