## Review of e03c437 (stage 3, range 6a17d63..e03c437): standards and spec passes

I found 4 blocking and 4 non-blocking issues. The suite passes (`npm test`: 161/161). I confirmed every blocking finding against a running service on ports 47311–47315. All of those services have been stopped, each by its own PID.

One deviation from the brief: while measuring memory I briefly wrote a scratch PID file, `/tmp/.ignore_pid`. I deleted it straight away. Nothing was written to the worktree.

### Blocking

**B1. Each successful first `GET /statement` read moves the service clock 1 ms ahead, so under read load the clock runs far ahead of real time.**
- **Location:** `stage-3/src/state.js:380-384` (`freezeReadAt`) and `stage-3/src/handlers/history.js:97`, both from commit 53f89d9 (R1). It works together with `server.js:81` (`now = Math.max(Date.now(), state.lastTimestampMs)`).
- **Why it happens:** `freezeReadAt` sets the clock to `max(last, now + 1)`, where `now` is already at least `last`. Every read in the same real millisecond therefore adds another millisecond, and the drift accumulates.
- **Requirements broken:**
  - "Every payment's `created_at` is an RFC 3339 instant with an offset identifying when it moved money."
  - "An `as_of` at or after the latest payment returns the current balance."
  - "effective time is an RFC 3339 instant not later than now." The check uses the drifted `now` (`corrections.js:20`), so effective times up to the drift in the real future are accepted.
  - "An authorization whose `expires_at` is at or before now is `expired`." `expireDue(now)` runs on the drifted clock, so seeded holds expire early in real time.
- **Measured:** 86,038 statement reads in 3 s with 50 in flight pushed the clock **83 s** ahead.
- **Repro:**
  1. Reset with ada (1000) and bob (0).
  2. Run 50 parallel loops of `GET /statement?limit=1` as ada for 3 s.
  3. `POST /payments {to_handle:"bob", amount:100}`.
  4. `GET /me?as_of=<client time after the 201>`.
- **Expected:** `created_at` is about the real time, and the `as_of` balance is 900.
- **Actual:** `created_at` was `2026-10-06T01:15:07.369+00:00` for a request answered at `01:13:44.329Z`, and the `as_of` balance was **1000** while the current balance was 900.
- **Direction for a fix:** don't advance the clock on a read. Order "recorded after the read" by something else, for example a recording sequence number on revisions and payments, with the watermark held as (ms, seq).

**B2. Snapshot storage still grows with every first read; at 50 in flight memory reaches 2 GiB in roughly half a minute.**
- **Location:** `history.js:89-98` (`addSnapshot` on every first read). Commit 53f89d9 (R1) claimed to fix this.
- **Requirements:** the stated limits "Memory | 2 GiB" and "Concurrent requests | up to 50 in flight". "Tokens last until reset" means nothing is ever freed before a reset.
- **Measured:** 297,994 first reads in 10 s with 50 in flight took a fresh process to **643 MB RSS**, about 1.9 KB per read. The export reached 297,994 snapshots and 49 MB. At that rate 2 GiB is reached in about 35 s, and export/import size grows toward the 10 s control timeout.
- **Repro:** 50 parallel loops of `GET /statement?limit=1&known_at=2026-01-01T00:00:00Z`, then check RSS with `ps -o rss=`. RSS grows linearly and is never released.
- **Expected:** bounded memory. **Actual:** linear growth per read.
- **Direction for a fix:** self-contained tokens carry owner, window, watermark and a reset epoch, signed with a key held in the state so export/import keeps them valid. They need no per-read storage.

**B3. R10 regression: sub-millisecond `from` and `to` are now truncated, which breaks the half-open window.**
- **Location:** `clock.js:36-39` and `history.js:84-85`, commit d408eb0. Before this commit, `from`/`to` were rounded up (ceil), which was correct for millisecond-resolution stored times.
- **Requirement:** "Returns the payments the caller sent or received in the half-open window `[from, to)`" and "a statement retains its half-open window."
- **Repro:** seed `p_ms` from ada to bob, 5, `created_at 2025-01-01T00:00:00.000Z` (ada 10000, bob 5).
  - `GET /statement?from=2024-12-31T00:00:00Z&to=2025-01-01T00:00:00.0005Z`: expected `[p_ms]` (00.000 < 00.0005). Actual `[]`.
  - `GET /statement?from=2025-01-01T00:00:00.0005Z&to=2025-01-02T00:00:00Z`: expected `[]`. Actual `["p_ms"]`, opening 10005.

**B4. Stored correction `effective_at` is truncated to the millisecond, so the instant changes value. The R10 test pins the wrong result.**
- **Location:** `corrections.js:18` (`parseTimestamp` truncates) and the stored revision; test `history.test.js` 'R10 …'. This matches the acceptance probe failure S3-043.
- **Requirements:**
  - "`as_of` retains its inclusive meaning"
  - "if any user's corrected balance is negative at any effective-time boundary, return 409 `historical_overdraft`. Balances at a boundary include the combined effect of all movements at that instant."
  - "Statement ordering is now by selected `effective_at`, then payment id."
- **Repro (a), `as_of` counts a correction that is not yet effective:**
  1. On the B3 fixture, correct `p_ms` to amount 6 with `effective_at 2025-01-01T00:00:00.0005Z`.
  2. The response shows `effective_at "…00.000+00:00"`.
  3. `GET /me?as_of=2025-01-01T00:00:00.0004Z`: expected 10005 (revision 2 is not yet effective). Actual **9999**, which the R10 test asserts.
- **Repro (b), a historical overdraft is masked:**
  1. Fixture: ada 9500, bob 0, cy 500. `p1` ada→bob 500 at `2025-01-01T00:00:00.000Z`; `p2` bob→cy 500 at `2025-01-02T00:00:00.000Z`.
  2. As ada, correct `p1` (amount 500) to `effective_at 2025-01-02T00:00:00.0007Z`.
  3. Bob is −500 during [00.000, 00.0007), so expected **409 `historical_overdraft`**. Actual **201**. With `…00.001Z` the service correctly returns 409.
  4. The same truncation turns distinct instants into a tie that is ordered by id, so the statement order is wrong.

**B5. Snapshot import accepts a watermark equal to the clock, so an imported token's frozen result can change.**
- **Location:** `records.js:231` (`sn.knownAt <= r.lastTimestampMs` should be `<`), commit 74f6cbb (R3).
- **Rulings and requirement:** "Edited snapshot state in an export must be validated like the rest of the state." and "Old snapshots remain unchanged after any lifecycle action or correction." The service itself never produces watermark == clock, because `freezeReadAt` keeps the clock at least 1 ms later.
- **Repro:**
  1. Reset with ada (1000) and bob.
  2. `GET /statement?to=2100-01-01T00:00:00Z`: 0 entries, closing 1000.
  3. Export, then set both `last_timestamp_ms` and `snapshots[0].known_at_ms` to now + 1 h.
  4. Import: 204.
  5. Pay 100 to bob, then page the snapshot.
- **Expected:** import 422, or the snapshot stays unchanged. **Actual:** 1 entry, closing 900.
- **Caveat:** this needs a hand-edited export with a future clock. I mark it blocking only because of the explicit ruling.

### Non-blocking

- **N1. Commit 31ecf4e (R6) is a fix with no test.** Its regression test was committed in d408eb0 (R10), so that commit has two purposes. Principles: "Each fix comes with a test" and "A commit has one purpose".
- **N2. Commit 1cbe752 (R12) has two purposes:** new tests, and loosened timing bounds. Raising the bound in `reset-load.test.js` R16 from 1 s to 4 s means "a login during it is not held up" can no longer detect a held-up login, because a 2000-user reset finishes far under 4 s. Principle: "Pin behaviour before changing it".
- **N3. `clock.js:6-7` keeps a second, uppercase-only `RFC3339` pattern.** It is exported and used only by tests. This contradicts the R6 message, "One pattern (clock.js) serves every instant". Principle: "One place per decision" (duplicated rule smell).
- **N4. Gaps in `ledger-unit.test.js` random histories.** They never generate never-held (seeded closed) holds or captures after close, which are the `holdEvents` branches. I checked those branches by reading the code and found them equivalent.

### Checked and found sound

- **R7** (1e759f5): `shiftBalances` refuses exactly as the old payer-only check did; `movePayments` was only extracted. No other code writes a balance.
- **R8** (b4f1477) and **R9** (92ba1d3): the rename and the `isLinkedPayment`, `currentRevision`, `seededClosedAt` and `neverHeld` extractions change no behaviour.
- **R2** sorted-pass overdraft check: equivalent to the boundary-by-boundary definition, including same-instant grouping, captures at close, never-held holds, and seeded open holds that are already expired.
- **R1** snapshot recompute: correct while the clock is monotonic. The test 'R1 R12' passes after a payment, corrections and a capture.
- **R3** export/import: the round-trip keeps the owner binding (another user gets 404), stage-1/2 exports import with no snapshots, and a missing `snapshots` field is 422.
- `from > to` is 422 and `from == to` is allowed, consistent with the ruling. Lowercase `t`/`z` is accepted in query instants, `effective_at` and fixture instants.
- **Performance at large history:**

  | Payments | Reset | 50 concurrent snapshot pages (max) | 50 concurrent corrections (max) | Export / import |
  |---|---|---|---|---|
  | 100,000 | 369 ms | 324 ms | – | – |
  | 200,000 | 564 ms | 627 ms | 804 ms | 616 / 809 ms |
