## Standards review of 09c3a2d, stage 1

**Result: nothing blocking.** I found 0 blocking and 8 non-blocking findings. `npm test` passes 59/59 on Node 22. I wrote nothing, made no commits, and stopped the probe server on port 18931 when I was done. Probe scripts were written under /tmp only.

(The reviewer worktree shows `work/acceptance/*` as deleted in `git status`. That is outside `stage-1/` and does not affect this review.)

---

### N1. The key scope and the router decide "which path" in two different places
- **Location:** `src/server.js:63-79`. The router `matchRoute` (`routes.js:39`) strips trailing slashes and the server percent-decodes path parameters, but the idempotency scope uses the raw `url.pathname`.
- **Principle:** 2, "One place per decision … A rule spread over several places, or written twice, is a finding."
- **Requirements:**
  - §7: "A replay means the same user sending the same method, the same path and the same body."
  - §8 pay: "Replaying a successful payment … must not return 409 request_not_pending."
- **Evidence (live probe, same key on each call):**
  - `POST /payments` then `POST /payments/` with key `K1`: both return 201 and debit twice (Ada 10000 → 8600 together with the pay below).
  - `POST /requests/rq_1/pay` returns 201. Then `/requests/rq%5F1/pay` and `/requests/rq_1/pay/` with the same key `K2` both return `409 request_not_pending`, not a 200 replay.
- **Non-blocking:** the spec's "same path" can be read literally, so `/payments/` counts as a different path. Under RFC 3986, `%5F` and `_` are the same path, so the pay case is a plausible edge rather than a stated failure. The fix is to build the scope from `route.path` plus the decoded params.

### N2. Request state transitions have no single gate
- **Location:** `src/handlers/requests.js:57,65-66` (pay) and `:75-77` (decline/cancel). Each handler checks for "pending" and then sets `request.status = ...` directly on the record.
- **Principle:** 1, "Every operation that changes the state they protect goes through one place that checks them."
- **Requirement:** §1.3 "A payment request may move money at most once."
- **Evidence:** this grep finds direct writes to request status in two handlers, and handlers push straight into `state.splits` and `state.settlements`:
  ```
  grep -rn "\.status = \|\.push(" src
  ```
  Money itself does go only through `State.movePayments`, and the only `balance +=` is at `state.js:92`.
- **Non-blocking:** the behaviour is correct today. I fired 20 concurrent pays with different keys plus a decline and a cancel at the same request: one 201, 21 × 409, and Bob was credited exactly 10. But the "pending → exactly one terminal state" rule is written twice and lives outside `State`.

### N3. Reset and import validate the same model twice, and the rules have drifted
- **Location:** `src/fixture.js:45-121` and `src/snapshot.js:63-132`.
- **Smells:** "Duplicated code", "Divergent change".
- **Evidence of drift:**
  - The fixture enforces the email pattern (`fixture.js:55`) and ids of 1..64 characters (`MAX_ID_CHARS`, `:36`).
  - Import checks neither, so an import can bring in a 100-character id or the email `"x"`.
  - Handle, balance, amount and uniqueness checks are written separately in both files.
- **Non-blocking:** no stated requirement fails today, but a change to a model rule has to be made twice.

### N4. "Unknown handle → 404" and the self-payment check are written in four places
- **Location:**
  - `handlers/payments.js:12-17` (`recipient`)
  - `handlers/requests.js:31-33`
  - `handlers/splits.js:33-37`
  - `handlers/settlements.js:18-24,32` (its own self-payment check)
- **Smell:** "Duplicated code" / "Shotgun surgery".
- **Requirement:** §11 "Each uses ordinary payment amount, note and visibility rules … self-transfer is 422 self_payment". Settlements re-implements the check instead of using `recipient`.
- **Non-blocking.**

### N5. Model constants live in the reset-fixture module, and response shapes are only partly in `views.js`
- **Constants:** `REQUEST_STATUSES`, `MINOR_UNITS` and `MAX_ID_CHARS` are defined in `fixture.js:12-14`. `handlers/requests.js:4` and `snapshot.js:8` import them from there.
- **Response shapes:** `views.js:1` says "The JSON shape of each resource in responses … in one place". But the split response is built in `splits.js:55-63` and the settlement response in `settlements.js:43-47`.
- **Stored records:** split and settlement records are kept in snake_case export shape (`requester_id`, `created_at_ms`). Every other record is camelCase and converted in `snapshot.js`.
- **Principles:** 2 and 6 (Readability).
- **Non-blocking.**

### N6. The synchronous-operation guard runs after the effect
- **Location:** `src/idempotency.js:65-66`.
  ```js
  const responseBody = operation();
  if (responseBody instanceof Promise) throw new Error('idempotent operations must be synchronous');
  ```
- **Principle:** 3. If a handler were made async, its state change up to the first `await` would already have happened. The request would then return a 500 with no record saved, so a retry would apply it again.
- **Non-blocking:** every current idempotent handler is synchronous. The check belongs where routes are registered, not after the handler has run.

### N7. Principle 3 coverage: several state-changing operations lack tests for retry or concurrency
The code is correct in each case below (all state changes are synchronous with no `await` in between, which I confirmed by reading and probing). The gaps are in the tests.

| Operation | Gaps |
|---|---|
| `POST /splits` | no replay test, no 409-reuse test, no concurrent same-key test (every split test uses `newKey()`) |
| `POST /requests` | no concurrent same-key test |
| `POST /requests/{id}/pay` | no concurrent test with the same key or with different keys; no pay vs decline/cancel race. This leaves §1.3 "at most once … including concurrent requests and retries" untested |
| `POST /settlements` | no concurrent same-key test (only different keys, at `control-settlements.test.js:152`) |
| decline / cancel | no concurrent test |
| signup / login racing a reset or import | untested. In my reading, a signup that awaits hashing while a reset completes writes to the replaced state and returns 201 with a token that is dead in the new state |

- **Principle:** 3, "An operation without defined, tested behaviour in these cases is a finding."
- **Non-blocking:** none of these breaks a requirement today; the cases are just not pinned by tests.

### N8. Commit discipline
- `806f75d` puts the whole service (23 files, about 1200 lines, every endpoint) in one commit with no tests. Its tests arrive later, in `471c833` (538 lines). This goes against principle 5, "Vertical slices in small commits", and principle 4, since behaviour was not pinned before or with the code.
- `bf9d8e6` fixes five unrelated defects in one commit: the empty-body check, an iterative rewrite of `canonicalJson`, header decoding, the import 2^53 bound, and the header-size limit. That is principle 5, "A commit has one purpose."
- The good part: the message gives the cause of each defect, and regression tests come with it, as "Fixing a defect" asks. `98f47a6` is a well-formed single-defect fix with the cause stated.
- **Non-blocking:** this is process only.

---

### Checked and found sound
- **Money gate:** `State.movePayments` is the only place balances change. It checks net deltas for the whole batch before applying any, so no wallet goes transiently negative and a settlement commits all or nothing.
- **Concurrency:** these tests pass:
  - 30 identical concurrent payments give one 201, 29 × 200, and money moves once.
  - A 50-client ring keeps the total and stays non-negative.
  - 20 concurrent settlements give 2 × 201 and 18 × 409.
  - 10 concurrent signups give one account.
- **Idempotency:**
  - A claimed key is resolved before field validation.
  - A failed attempt claims no key.
  - Keys are scoped per user and per path.
  - Bodies are compared by canonical JSON value; the canonicaliser is iterative and copes with deep nesting.
  - A replay returns the original body after the resource has changed, and after export/import.
- **Halfway failure:**
  - Every write validates fully before its first change.
  - Reset and import build a new `State` and swap one reference, so a rejected fixture or snapshot changes nothing.
  - Concurrent reset and import resolve in completion order, consistent with the order of the 204 responses (probed).
- **Other:**
  - Password hashing is scrypt with a fixed parameter whitelist on import.
  - The equal-split rule matches the §9 table.
  - The feed rule `canSeePayment` is in one place.
  - Paging and query-integer rules are in one place.
  - The Dockerfile has no runtime dependencies, runs as a non-root user and honours `PORT`, and RUN.md has a single build-and-start command.
