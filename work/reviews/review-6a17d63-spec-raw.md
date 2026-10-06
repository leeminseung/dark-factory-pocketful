## Spec review of revision 6a17d63 (stage 3): findings

I ran `npm test` (150/150 pass) and ran the service on port 18763, sending scripted requests from /tmp/reviewer-6a17d63/p1–p5.mjs. I stopped the service by its PID afterwards. I wrote nothing to the worktree.

I found one blocking issue (under the literal reading of the spec), one structural performance issue that is non-blocking at normal fixture sizes, and three minor non-blocking issues.

### 1. Statement snapshot tokens do not survive export and import (blocking, literal reading)
- **Location:** `stage-3/src/snapshot.js:16-56`. `exportState` leaves out `state.snapshots`, which is defined at `stage-3/src/state.js:44`. The `State` that `importState` builds therefore has no snapshots.
- **Requirements:**
  - Stage 3, "Stable statement pagination": "Tokens last until reset."
  - Stage 1, §10: "Existing receipts, tokens and retries must remain valid after import"
  - Stage 1, §10: "Import takes that entire object and atomically replaces the service's state".
- **Evidence:** an import of the service's own unchanged export makes every snapshot token from before it return 404.
- **Why blocking:** import is not reset, but the token ends at import. A judge could read §10's "tokens" as bearer tokens only, so this depends on the literal reading.
- **Reproduce:**
  1. Reset, sign in as ada, make two payments.
  2. `GET /statement?limit=1` and note the `snapshot` token.
  3. `GET /_test/export`, then `POST /_test/import` with that body unchanged (204).
  4. `GET /statement?snapshot=<token>&limit=1` as ada.
- **Expected:** 200 with the frozen page.
- **Actual:** `404 {"error":{"code":"not_found","message":"no such statement snapshot"}}`.

### 2. Overdraft checking grows with the square of the payment count, breaking time limits on large data (non-blocking at normal sizes)
- **Location:**
  - `stage-3/src/ledger.js:105-121` (`firstOverdraft`): for every boundary it calls `balanceAt`, which scans every payment in the service, and `heldAt`.
  - Called from `stage-3/src/state.js:228-230` on every correction.
  - Called from `stage-3/src/records.js:200-211` (`checkHistory`) for every user on every reset and import.
- **Requirements:** Stage 1, §2: "Per-request timeout | 5 s (10 s for `POST /_test/reset`)" and "Concurrent requests | up to 50 in flight". Stage 1, §5: "Requests must not produce 5xx responses, including under concurrent load."
- **Evidence (measured):**

| Data | Reset | Import | One correction |
|---|---|---|---|
| 2 users, 5,000 payments | 0.67 s | 0.61 s | 0.63 s |
| 2 users, 10,000 payments | 2.4 s | 2.2 s | 2.3 s |
| 2 users, 20,000 payments | 10.5 s | 10.1 s | – |
| 100 users, 45,000 payments | 11.0 s | 9.75 s | – |

  The work is synchronous, so a correction on a busy wallet blocks every other request while it runs.
- **Why non-blocking:** fixture size is not a stated condition, and it is fine at typical test sizes. Above roughly 15,000–20,000 payments, reset breaks the 10 s limit and corrections approach 5 s.

### 3. `from` later than `to` on `GET /statement` gives 422 (non-blocking; behaviour nobody asked for)
- **Location:** `stage-3/src/handlers/history.js:81`.
- **Requirement:** Stage 3, "Effective time…": "Invalid/empty instants are 422." Both instants here are valid, and no rule says what a reversed window does.
- **Evidence:** `from=now&to=now-1h` returns `422 "from must not be after to"`. An empty window would be the plain reading.

### 4. Stage-2 imports report an invented `closed_at` for voided authorizations, and past holds are understated (non-blocking)
- **Location:** `stage-3/src/snapshot.js:99-106` (`closedAtOf`) sets the close time to the last capture, or to creation if there was none.
- **Requirements:**
  - Stage 3, "Historical holds": "Authorizations expose `closed_at` (null while open; event time when closed)."
  - Stage 3, "Historical holds": "final capture, void or expiry releases the remainder at that event's time".
  - Stage 3, "Settlement history": "The ledger must import and account for authorizations and captures."
- **Evidence:** I authorised 1000, captured 200 with `final:false`, then voided. Before export, `GET /me?as_of=<capture time>` showed held 300 + 800. After a stage-2-format import it showed `held: 300`, and the authorization showed `closed_at` equal to the capture time.
- **Why non-blocking:** a stage-2 export does not record when a void happened, so some approximation is unavoidable. The code comment documents the choice. Picking the earliest possible time also makes past `available` look higher than it was.

### 5. Valid RFC 3339 instants with lowercase `t` or `z` are rejected (minor, non-blocking)
- **Location:** `stage-3/src/clock.js:7-10`.
- **Requirement:** Stage 3, "`GET /me` as of an instant": "`as_of` is optional and is an RFC 3339 instant with an offset." RFC 3339 allows lowercase `t` and `z`.
- **Evidence:** `as_of=2026-09-24t13:20:00z` returns 422.

### Checked and found sound
- **Payment timestamps:** seeded `created_at`; a future one gives 422 and leaves the state unchanged; omission uses reset time; opening balances equal balance minus seeded net; new accounts open at 0; `/activity` ordering.
- **`GET /me`:** `as_of` is inclusive at the exact instant, including a `+02:00` offset; before the first payment it gives the opening balance; at or after the last, the current balance. Future instants work. `as_of` and `known_at` are echoed exactly. Empty, bare-date, naive, space-separated and impossible-date values give 422, as do empty `from`/`to`/`known_at`.
- **`GET /statement`:**
  - Defaults; the window is half-open (a payment at `from` is in, one at `to` is out); order is effective time then id.
  - Opening, closing and `balance_after` describe the full window across pages.
  - Only the caller's payments appear.
  - Each entry has the selected `revision`, `effective_at` and `recorded_at`, and the selected `payment.amount`.
  - Zero-amount revisions appear with delta 0.
  - With `known_at`, the selected revision is used, and payments not yet recorded are left out.
- **Corrections:**
  - All field rules give 422; 403, 404 and `stale_revision` work.
  - Replay returns 200 after newer revisions; a different body is `idempotency_key_reuse`.
  - The difference moves between the same two wallets.
  - `insufficient_funds` takes precedence over `historical_overdraft`, which covers both total and available (holds).
  - Simultaneous movements count together at a boundary: moving a payment onto the same millisecond is allowed, one millisecond later is refused.
  - Failure leaves revisions and balances unchanged.
  - Settlement members and captures give `linked_payment_immutable`, including after import.
  - Four concurrent corrections on the same revision: one 201, three `stale_revision`.
- **Revisions endpoint:** the two parties only; a third party gets 404, no token gets 401; revision 1 has `reason ""`.
- **Snapshots:** frozen across new payments and corrections; final partial page and offsets beyond the end report `has_more` correctly. `from`/`known_at` with a snapshot give 422; unrecognised parameters are ignored; another user's or an unknown token gives 404; a token from before reset is gone. A correction can move a payment out of a window, and old snapshots stay unchanged.
- **Historical holds:**
  - Hold starts at creation; a nonfinal capture reduces it at capture time; void releases it.
  - A void not yet known at `known_at` still holds.
  - Expiry applies at the deadline for future queries.
  - `closed_at` is null while open and the event time when closed.
  - Seeded open holds start at reset or at a supplied `created_at`; seeded closed holds hold nothing.
- **Settlement history:** members' revision 1 is at `committed_at`.
- **Imports:** stage-1-format, stage-2-format and own exports import with balances, holds, captures and replays intact, and corrections work afterwards.
- **Earlier stages:** stage-1 and stage-2 behaviour holds; the full suite passes.
