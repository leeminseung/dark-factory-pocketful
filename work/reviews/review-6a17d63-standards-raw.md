## Standards review: revision 6a17d63 (stage 3)

I found two blocking problems, both about scale: statement snapshots use too much memory, and the overdraft check behind corrections and reset gets quadratically slower as history grows. I also found six non-blocking findings. I wrote nothing in the worktree, and `git status` on stage-1/2/3 is clean.

**Something you should know first.** My first server start failed with EADDRINUSE on port 18763. Another `node src/main.js` (PID 95695, started 09:26:32, cwd `.../worktrees/reviewer-6a17d63/stage-3`) was already listening there. It is probably the parallel spec reviewer. Before I noticed, my script sent it one `POST /_test/reset` (2 users, 5000 seeded payments), 21 corrections and about 300 `GET /statement` calls. The spec reviewer's results from that window may be affected, and that process's memory grew. I did not touch PID 95695. All measurements below were redone on my own server (port 28417, PID 96539), which I have stopped by PID.

### Blocking

**B1. Every first `GET /statement` keeps a full copy of the statement until reset, so memory grows without bound.**
- **Where:** `stage-3/src/handlers/history.js:83-91` (`entries: result.entries.map(entryView)`, then `state.addSnapshot`) and `stage-3/src/state.js:44` and `:372-375`.
- **Principle:** "One place per decision. Each format, rule, limit and storage choice lives in one module behind a small interface…" (engineering-principles §2). The storage choice is to keep fully rendered payment views per token.
- **Requirements:**
  - Stage 1 §2 Resource limits: "Memory | 2 GiB".
  - Stage 1 §5: "Requests must not produce 5xx responses, including under concurrent load."
  - Stage 3 "Stable statement pagination": "Every first `GET /statement` response additionally returns an opaque `snapshot` token… Tokens last until reset."
- **Evidence:** each snapshot stores one rendered `paymentView` per entry, including handles, currency and note. Nothing is ever evicted. Revisions and payment fields are immutable, so a snapshot could instead store references plus `balance_after`, or the read parameters plus a watermark.
- **Blocking because:** a reader who keeps opening statements uses up the 2 GiB limit, and the container is then killed or answers 5xx.
- **Reproduce:**
  1. `PORT=<free> node src/main.js`.
  2. `POST /_test/reset` with users ada and bob (balance 1000000 each) and 5000 seeded payments between them (amount 1, `created_at` one second apart starting 2025-01-01T00:00:00Z). This is the same size as the team's own S3 large-reset case.
  3. Log in as ada and call `GET /statement?limit=1` 600 times, one after another.
  4. Check the server's RSS with `ps -o rss=`.
- **Expected:** memory stays roughly flat, well under 2 GiB.
- **Actual:** RSS went from 216 MB to 1005 MB after 300 reads and 1619 MB after 600, about 2.6 MB per read. It passes 2 GiB at about 800 reads.

**B2. The overdraft check costs (boundaries × all payments), so corrections and reset slow down quadratically with history size.**
- **Where:**
  - `stage-3/src/ledger.js:105-120` (`firstOverdraft`): for every boundary it calls `balanceAt` (`:39-43`). `balanceAt` rebuilds `movements` over all of `book.payments`, and `heldAt` scans every authorization.
  - Called by `stage-3/src/state.js:228-230` for every correction.
  - Called by `stage-3/src/records.js:200-211` for every user on every reset and import.
- **Brief focus:** "whether historical reads or the boundary check scale badly with history size under the stated limits (5 s per request, 50 in flight)".
- **Requirements:**
  - Stage 1 §2: "Concurrent requests | up to 50 in flight", "Per-request timeout | 5 s (10 s for `POST /_test/reset`)".
  - Stage 2: "Concurrent requests must produce the same results as executing them one at a time in some order".
- **Evidence:** the check runs synchronously on the single event loop. Measured in-process with 2 users, one correction or one reset check took:

  | Seeded payments | Time |
  |---|---|
  | 1k | 31 ms |
  | 2k | 100 ms |
  | 5k | 490 ms |
  | 10k | 1.9 s |

  Doubling the history roughly quadruples the time, so a reset passes 10 s at roughly 22k payments concentrated on one pair. A single sort plus a prefix sum over the boundaries would make this O(n log n).
- **Blocking because:** corrections that are queued together pass the 5 s timeout with far fewer than 50 in flight.
- **Reproduce:**
  1. Use the same reset as in B1.
  2. Send 20 concurrent `POST /payments/p_{3,5,…,41}/corrections` as ada. Each needs its own key and the body `{"expected_revision":1,"amount":2,"effective_at":<that payment's created_at>,"reason":"r"}`.
- **Expected:** every response arrives within 5 s.
- **Actual:** the responses were all 201, arriving at 503, 1018, 1519, … 9973 ms. Ten of the twenty took longer than 5 s. With 50 in flight the last would take about 25 s. A single correction took 488 ms.

### Non-blocking

**N1. A second path changes balances and checks affordability on its own.**
- **Where:** `stage-3/src/state.js:208-227`. `correctPayment` checks `availableOf(payerId) < Math.abs(delta)` itself and writes `user.balance += change` directly. It does not go through `movePayments`, which the file header calls "the one gate through which money moves".
- **Principle:** "One gate per invariant… A second path to that state, or one that skips the check, is a finding."
- **Not blocking because:** the behaviour is correct today. I checked that the transaction undoes it and that a refused correction leaves balances, revisions and the key untouched.

**N2. The "what is held" rule is written twice, under the same name.**
- **Where:** `ledger.js:51` (`heldBy(book, a, t, knownAt)`, which reasons from timestamps) and `state.js:237` (`State.heldBy(userId)`, which reads `openAuthorizations`/`remainingOf`).
- **How they are used:** `GET /me` without temporal parameters uses one (`views.js:50-51`); with `as_of` or `known_at` it uses the other (`handlers/history.js:19`).
- **Principle:** "A rule spread over several places, or written twice, is a finding." Smells: Duplicated code; Mysterious name, since two `heldBy` functions mean different things.
- **Not blocking because:** I found no case where the two disagree.

**N3. Small duplicated rules.**
- The linked-payment rule is in two places: `handlers/corrections.js:31` and `records.js:178`.
- The "current revision" lookup is `records.js:217` (`p.revisions.at(-1)`), next to `ledger.currentRevision`.
- The closed_at rule for a seeded expired hold is in two places: `fixture.js:112` and `snapshot.js:101` (`Math.min(expiresAt, createdAt)`).
- `ledger.js:53` infers "a fixture's closed hold never held anything" from the shape of the data (`closedAt <= createdAt && no paymentIds`) rather than from a stated flag.
- Instant parsing for queries lives in `paging.js:43` (`queryInstant`). Smells: Duplicated code; Divergent change.

**N4. Instant precision follows two rules.**
- **Where:** `handlers/corrections.js:18` parses `effective_at` with `parseTimestamp`, which truncates to the millisecond. Query instants use `parseInstant`'s floor/ceil (`clock.js:35-41`).
- **Effect:** an `effective_at` of `…00.0005Z` is stored and echoed as `…00.000Z`, so it counts at `as_of=…00.000Z`, before it took effect.
- **Principle:** "One place per decision… instant parsing."
- **Not blocking because:** it is an edge case and the spec does not require `effective_at` to be echoed exactly.

**N5. Commit discipline in 7d115a2.**
- The corrections commit also changes `history.js:80`: the statement's default `to` moves from `now` to `now + 1`, which fixes behaviour shipped in 3f59c7f.
- The fix has no regression test of its own, and the message gives only the symptom.
- **Principles:** "A commit has one purpose…" (§5), and "Fixing a defect: … keep it as a regression test… Put the cause in the commit message".
- No commit in the range is labelled as restructuring.

**N6. Test coverage gaps and one flaky test.** No stage-3 test covers:
- a snapshot staying unchanged after a correction or a hold lifecycle action (only after a payment, `history.test.js:90`);
- combined same-instant movements at an overdraft boundary;
- reusing a key after a refused correction;
- concurrent identical-key corrections returning exactly one 201;
- any scale or performance check for corrections or historical reads.

I checked the first three by hand over HTTP and all three behave correctly.

`test/reset-load.test.js:34` (3000-user reset under 3 s) failed once in the full suite (3411 ms) and passed on rerun, alone (2325 ms), and in stage 2. It is a timing flake under parallel test files, not a stage-3 regression.

### Checked and found sound
- `npm test`: 150/150 on rerun (one flaky failure on the first run, see N6). Stage 2's suite: 124/124.
- One place for temporal selection (`ledger.selectedRevision`): as_of uses inclusive floor, `[from, to)` uses ceil/ceil, known_at uses floor.
- With no `known_at`, every recorded revision counts, which matches "everything known when the read begins" because handlers run synchronously.
- The sum of balances is preserved in every view: opening balances come from seeded ending balances, and both parties read the same selected revision.
- Same-instant movements are combined at a boundary. Verified: a seeded in and out at the same T is accepted; moving the inflow later is `historical_overdraft`.
- Corrections:
  - stale revision and concurrent same-revision corrections give exactly one 201 (tested);
  - replay returns the original revision with 200 after newer revisions;
  - a refused correction rolls everything back (journal transaction) and the key stays reusable (verified);
  - `REPLAY_RULES` rebuilds correction receipts on import.
- New payments and holds cannot create a past overdraft: they take effect at the latest time and held funds only fall afterwards. Reset and import re-check the whole history.
- Snapshots are frozen when created. Tokens are tied to the State, so reset invalidates them, and another user's token gives 404.
- Revision 1, the original receipts and the feed are unchanged, because `paymentView` uses the original amount.
- Stage-1/2 import derives revision 1, opening balances and closed_at.
- Limits are fixed (`MIN/MAX_TIMESTAMP_MS`, `MAX_CLOCK_MS`), not relative to now.
- Historical `GET /me` is linear in history size; only the boundary check (B2) is quadratic.
