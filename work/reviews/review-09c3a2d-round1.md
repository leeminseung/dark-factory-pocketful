# Stage 1 — round-1 review of 09c3a2d

- Revision: 09c3a2d14b1aecf557e786eb2ff2cfa5f9001e2a (stage-1/ content = bf9d8e6)
- Range: first stage, so the whole stage folder (`git diff 6fb0742 09c3a2d -- 'stage-*'`)
- Worktree: /Users/mslee/dark-factory/band-work/worktrees/reviewer-09c3a2d (with `work/` deleted)
- Requirements: spec stage-1.md §1-§11; requirement list work/stage-1/requirements.md (D1-D12);
  work/stage-1/decisions.md has no rulings yet
- Case memory: work/case-memory.md does not exist (first stage)
- A round-1 review gives no verdict.

## Passes run

| Pass | Brief | Raw answer |
|---|---|---|
| standards | work/reviews/review-09c3a2d-standards-brief.md | work/reviews/review-09c3a2d-standards-raw.md |
| spec | work/reviews/review-09c3a2d-spec-brief.md | work/reviews/review-09c3a2d-spec-raw.md |

Each subagent ran `npm test` (59/59 pass) and probed a local build.

**Raw findings:** 13 in total (standards N1-N8; spec F1-F3 plus 2 minor extras). I verified all
13: 10 became findings after merging one duplicate (N1 and F1), and 3 were dismissed.

**Gap in the spec pass, closed by me.** A tool-permission denial kept the spec subagent from
reading `src/passwords.js`, `src/snapshot.js`, `src/main.js` and the second half of
`src/fixture.js`. I read them myself:
- `passwords.js` hashes with scrypt (N=16384, r=8, p=1, a random 16-byte salt per password),
  so §6 holds.
- Reading `snapshot.js` alongside N3 led to R1.

## Findings

### R1 — BLOCKING: import accepts a state that breaks the model rules reset enforces
- **Location:**
  - `stage-1/src/snapshot.js:76-80` checks only that user `id` and `email` are strings, and
    `:100`, `:113` check only that payment and request ids are strings.
  - `stage-1/src/fixture.js:36,55` applies the 1..64-character id limit and the email pattern
    to reset fixtures only.
  - This came from standards N3, which reported it as non-blocking. I reproduced it and
    raised it to blocking.
- **Requirements:**
  - §3.4: "IDs are opaque strings of at most 64 characters."
  - §10: "missing fields, wrong track/version or an invalid state give 422
    `validation_failed` without changing the destination."
  - Principle 2 (one place per decision): the model rules are written separately in
    fixture.js and snapshot.js, and the two copies have drifted.
- **Reproduction** (local build, port 18977):
  1. Reset with one user `u_ada` / `ada@example.com`, then `GET /_test/export`.
  2. In the export, replace `"u_ada"` with a 100-character id and the email with `"x"`.
  3. `POST /_test/import` with that body returns **204**.
  4. `POST /auth/login {"email":"x","password":"correct horse"}` returns 200 with a
     `user_id` of 100 characters.
- **Expected:** 422 `validation_failed` on import, with the destination unchanged.
- **Actual:** the import is accepted, and the API then returns an id longer than §3.4
  allows.
- **Why blocking:** a stated requirement fails under a stated condition (importing an
  invalid state).
- **Fix direction:** validate imported records with the same model rules as reset, from one
  module (ids, email form, handle pattern, amounts, statuses, references).

### R2 — non-blocking: the idempotency scope uses the raw path, but routing normalises it
- **Location:**
  - `stage-1/src/server.js:79` builds the scope from `path: url.pathname`.
  - `routes.js:39` strips trailing slashes before matching.
  - `server.js:66` percent-decodes path parameters.
  - Reported by both passes (standards N1, spec F1); merged here.
- **Requirement (§7):** "A replay means the same user sending the **same method, the same
  path and the same body**." Also: "The same key with the same body on a different path is a
  different request, not a replay, and must succeed normally."
- **Evidence:** both passes probed this, and I confirmed it by reading the code.
  - `POST /payments` and then `POST /payments/` with the same key and body both return 201,
    and the money moves twice.
  - `POST /requests/rq_1/pay` returns 201. Then `/requests/rq%5F1/pay` (or `/rq_1/pay/`) with
    the same key and body returns 409 `request_not_pending`, not a 200 replay.
- **Why non-blocking:** read literally, a different spelling is a "different path", and the
  spec requires different paths to "succeed normally". No stated requirement fails. The
  same decision (which endpoint is this?) is still made in two places, though.
- **Fix direction:** key on the matched `route.path` plus the decoded params, or refuse
  non-canonical spellings with 404.

### R3 — non-blocking: decline and cancel accept an unparseable body
- **Location:** `stage-1/src/routes.js:28-29` (`noBody: true`) and `server.js:74` (from spec F2).
- **Requirement (§5):** "| 400 | `malformed_request` | Unparseable body, or a field of the
  wrong JSON type |"
- **Evidence:** `POST /requests/rq_1/decline` with body `{garbage` returns 200 and declines
  the request. The service's own test pins this as intended.
- **Why non-blocking:** §8 defines no body for decline or cancel, and nothing in the list or
  the decisions settles the point. Accepting an empty body while rejecting a non-empty body
  that does not parse would match §5 more closely.

### R4 — non-blocking: `POST /requests/{id}/pay` with no body is 400
- **Location:** `stage-1/src/server.js:74`, where `parseBody('')` throws `malformed` (from
  spec F3).
- **Requirement (§8 pay):** "The body carries `visibility` only, optional, default
  `"public"`."
- **Evidence:** a pay request with a token and an `Idempotency-Key` but no body returns
  400 `malformed_request`.
- **Why non-blocking:** "optional" qualifies the field, and an empty body arguably "does not
  parse" (§5).

### R5 — non-blocking: request status transitions have no single gate
- **Location:** `stage-1/src/handlers/requests.js:57,65-66` (pay) and `:75-77`
  (decline/cancel) each check `pending` and then assign `request.status` directly (from
  standards N2).
- **Requirement:** §1 "A payment request may move money at most once."
  - Principle 1: "Every operation that changes the state they protect goes through one
    place that checks them."
- **Evidence:** read at those lines.
  - The behaviour is correct today: a probe sent 20 concurrent pays plus a decline and a
    cancel, and got one 201 and 21 × 409.

### R6 — non-blocking: the handle lookup and the self-payment check are written four times
- **Location:** `handlers/payments.js:12-17`, `requests.js:31-33`, `splits.js:33-37` and
  `settlements.js:18-24,32` (from standards N4).
- **Requirement:** §11 "Each uses ordinary payment amount, note and visibility rules …
  self-transfer is 422 `self_payment`"
  - Smells: Duplicated code, Shotgun surgery.

### R7 — non-blocking: model constants and response shapes are scattered
- **Location:** from standards N5.
  - `REQUEST_STATUSES`, `MINOR_UNITS` and `MAX_ID_CHARS` live in `fixture.js:12-14` and are
    imported from there by `handlers/requests.js` and `snapshot.js`.
  - `views.js` says it holds every response shape, but the split and settlement responses
    are built in `splits.js:55-63` and `settlements.js:43-47`.
  - Split and settlement records are stored in snake_case export shape, unlike the other
    records.
- **Principles:** 2 and 6 (Readability).

### R8 — non-blocking: the synchronous-handler guard runs after the effect
- **Location:** `stage-1/src/idempotency.js:65-66` (from standards N6).
- **Principle 3:** a handler made async later would apply its change, return 500 and record
  no key, so a retry would apply the change again. Every current handler is synchronous.

### R9 — non-blocking: retry and concurrency tests are missing for several writes
- **Location:** `stage-1/test/` (from standards N7). Missing tests:
  - a replay, a 409 key reuse and a concurrent same-key test for `POST /splits`;
  - a concurrent same-key test for `POST /requests`;
  - concurrent pays, and pay racing decline or cancel;
  - a concurrent same-key test for settlements;
  - concurrent decline or cancel.
- **Principle 3:** "An operation without defined, tested behaviour in these cases is a
  finding."
- **Requirement:** §1 "including concurrent requests and retries".
- The code is correct by reading and probing; the gap is in the tests only.

### R10 — non-blocking: commit discipline
- **Location:** from standards N8.
  - `806f75d` lands the whole service (23 files, about 1200 lines) without tests; the tests
    follow in `471c833`.
  - `bf9d8e6` fixes five unrelated defects in one commit.
- **Principles 4 and 5:** "A commit has one purpose". Each fix does name its cause and adds a
  regression test.

## Dismissed

| Raw | Reason |
|---|---|
| Standards N7, signup racing reset or import | Each request binds `store.current` once (`server.js:69`), so a signup that overlaps a reset writes to the discarded state and never leaks into the new fixture. §3.3 constrains requests *subsequent* to the 204, and an overlapping request is not one. |
| Spec extra: email matching is case-insensitive | Reasonable reading of "Email already registered"; no requirement contradicts it. |
| Spec extra: trailing-slash routes are accepted | Covered in R2; not a separate finding. |

## Status of earlier R findings

None (first stage, first review).

## Summary

- 1 blocking finding: R1.
- 9 non-blocking findings: R2-R10.
- No verdict at round 1. The final review will rerun the supplied checks with `--all --mode
  isolated`, run the fix-commit pass and the black-box probe, and report the status of
  R1-R10.
