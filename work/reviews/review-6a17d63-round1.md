# Stage 3 — round-1 review of 6a17d63

- **Revision:** 6a17d6376e898493fd05d0fd102f0296275799e3 (stage-3/ = e6ee3d8). stage-1/ and stage-2/ are unchanged
  since 048a821.
- **Range:** `git diff 9c315d2 6a17d63 -- 'stage-*'`. Commit 9c315d2 created `stage-3/` as a copy of the accepted
  `stage-2/`.
- **Worktree:** /Users/mslee/dark-factory/band-work/worktrees/reviewer-6a17d63, with `work/` deleted.
- **Requirements:**
  - spec stage-3.md, which builds on stage-1.md and stage-2.md;
  - work/stage-3/requirements.md (S3-001..S3-074, D3-1..D3-8);
  - work/stage-3/decisions.md, which has one ruling: a seeded `created_at` is part of the fixture format from stage 3.
- **Case memory:** work/case-memory.md, read at the start of the stage.
- A round-1 review gives no verdict.

## Passes run

| Pass | Brief | Raw answer |
|---|---|---|
| standards | work/reviews/review-6a17d63-standards-brief.md | work/reviews/review-6a17d63-standards-raw.md |
| spec | work/reviews/review-6a17d63-spec-brief.md | work/reviews/review-6a17d63-spec-raw.md |

How they were run:
- **Starting the subagents:** each brief is about 58 KB. Each subagent was started with a one-line instruction to
  read a byte-identical, read-only copy of its brief in /tmp.
- **Process note (the two passes shared one server):**
  - Both subagents chose port 18763. The standards pass's first script therefore reached the spec pass's server. It
    sent one reset with 5000 payments, 21 corrections and about 300 statement reads.
  - The standards pass then redid all its measurements on its own server.
  - Some of the spec pass's observations may come from that disturbed window. I reproduced each finding I rely on
    myself, on a server of my own (port 56232, stopped by PID).
  - Future briefs will give each pass a distinct port range.

**Raw findings:** 13 in total.
- The standards pass reported B1, B2 and N1-N6.
- The spec pass reported F1-F5.

**After verification:**
- 12 findings, R1-R12. Standards B2 and spec F2 were merged into R2.
- None dismissed.

## Findings

### R1 — BLOCKING: every first `GET /statement` stores a full rendered copy of the statement until reset, so memory grows without bound

- **Location:**
  - `stage-3/src/handlers/history.js:83-91`: `entries: result.entries.map(entryView)`, then `state.addSnapshot`;
  - `src/state.js:44` and `:372-375`, where snapshots are never released before reset.
  - Source: standards B1.
- **Requirements:**
  - stage 1 §2 "Memory | 2 GiB";
  - stage 1 §5 "Requests must not produce 5xx responses, including under concurrent load";
  - stage 3 "Every first `GET /statement` response additionally returns an opaque `snapshot` token … Tokens last until
    reset."
- **Reproduced** on my own server:
  1. Reset with 2 users and 5000 seeded payments.
  2. Call `GET /statement?limit=1` 200 times as ada.
  3. RSS grows from **123 MB to 684 MB**, about 2.8 MB per read.
- **Standards pass measurement:** 216 MB → 1619 MB after 600 reads, which would pass 2 GiB at about 800 reads.
- **Why blocking:** the memory limit fails under ordinary repeated use. Nothing is ever evicted, because tokens must
  last until reset.
- **Fix direction:** store what is needed to replay the frozen result compactly. Payment revisions are immutable, so a
  snapshot could hold revision references plus `balance_after`, or the selection parameters and a recorded-time
  watermark. Do not store rendered payment views.

### R2 — BLOCKING: the historical-overdraft check costs (boundaries × all payments), so corrections, reset and import slow down quadratically

- **Location:**
  - `stage-3/src/ledger.js:105-120` (`firstOverdraft`): for each boundary it calls `balanceAt` (`:39-43`), which
    rescans every payment, and `heldAt`, which rescans every authorization;
  - called for every correction (`state.js:228-230`);
  - called for every user on every reset and import (`records.js:200-211`).
  - Sources: standards B2 and spec F2.
- **Requirements:**
  - stage 1 §2 "Per-request timeout | 5 s (10 s for `POST /_test/reset`)";
  - stage 1 §2 "Concurrent requests | up to 50 in flight".
- **Reproduced** with 2 users and 5000 payments:
  - one correction takes 0.56 s;
  - **20 concurrent corrections** were all 201, but the slowest took 9.4 s. Half passed 5 s, because the work is
    synchronous and queues on the event loop.
- **Spec pass measurements:**
  - reset or import of 20,000 payments takes 10.5 s / 10.1 s;
  - 100 users with 45,000 payments take 11.0 s to reset.
- **Why blocking:** a stated limit fails under a stated condition (requests in flight). This is consistent with
  stage-1 S1-R16 (reset time growing with fixture size), which was blocking.
- **Fix direction:** check boundaries in one sorted pass with running sums, O(n log n) per affected user.

### R3 — BLOCKING: statement snapshot tokens do not survive an export/import of the service's own state

- **Location:** `stage-3/src/snapshot.js:16-56`. `exportState` leaves out `state.snapshots`, so `importState` starts
  with none. Source: spec F1.
- **Requirements:**
  - stage 3 "Tokens last until reset.";
  - stage 1 §10 "Existing receipts, tokens and retries must remain valid after import";
  - stage 1 §10 "Import takes that entire object and atomically replaces the service's state".
- **Reproduced:**
  1. Make two payments and take a snapshot from `GET /statement?limit=1`.
  2. Export, then import the export unchanged → 204.
  3. `GET /statement?snapshot=<token>` → **404**.
- **Why blocking:**
  - The text bounds a token's life by reset, not by import.
  - Survival across export/import is the condition the edge-cases skill names for state that must survive.
  - The implementer's notes record "snapshots not exported" as an interpretation, but no ruling covers it.
- **If the coordinator rules otherwise:** the coordinator may rule that §10's "tokens" means bearer tokens only and
  that a snapshot need not survive import. In that case R3 is withdrawn.

### R4 — non-blocking: `from` later than `to` on `GET /statement` gives 422

- **Location:** `stage-3/src/handlers/history.js:81`. Source: spec F3.
- **Requirement:** stage 3 "Invalid/empty instants are 422". Here both instants are valid, and no rule covers a
  reversed window; an empty window is the plain reading.
- **Note:** the implementer's notes list this interpretation (from>to 422). It needs a ruling only if the coordinator
  wants the empty-window reading.

### R5 — non-blocking: stage-2 imports approximate when a voided authorization closed

- **Location:** `stage-3/src/snapshot.js:99-106` `closedAtOf` uses the last capture, or else the creation time.
  Source: spec F4.
- **Requirement:** stage 3 "Authorizations expose `closed_at` (null while open; event time when closed)".
- **Evidence:** after a stage-2-format import, a hold that was voided after a partial capture shows `closed_at` equal
  to the capture time. Past `held` is therefore understated.
- **Why non-blocking:** a stage-2 export has no void time, so some approximation is unavoidable.

### R6 — non-blocking: RFC 3339 instants with lowercase `t`/`z` are refused

- **Location:** `stage-3/src/clock.js:7-10`. Source: spec F5.
- **Requirement:** stage 3 "`as_of` is optional and is an RFC 3339 instant with an offset". RFC 3339 §5.6 allows
  lowercase `t` and `z`.
- **Reproduced:** `as_of=2026-09-24t13:20:00z` → 422.
- **Why non-blocking:** stage 2's probe treated the uppercase-only parsing as sound for fixtures. The coordinator may
  want one rule for all instants.

### R7 — non-blocking: corrections change balances outside the one money gate

- **Location:** `stage-3/src/state.js:208-227`. `correctPayment` checks affordability itself and writes
  `user.balance += change`, bypassing `movePayments`. Source: standards N1.
- **Principle 1.** The behaviour is correct today, including rollback.

### R8 — non-blocking: the "what is held" rule is written twice, under one name

- **Location:** `ledger.js:51` (`heldBy`, from timestamps) and `state.js:237` (`State.heldBy`, from open holds).
  Source: standards N2.
- **Principle 2.** Smells: Duplicated code, Mysterious name.

### R9 — non-blocking: small duplicated rules

- **Locations** (source: standards N3):
  - the linked-payment rule in `corrections.js:31` and `records.js:178`;
  - the current-revision lookup;
  - the seeded expired-hold `closed_at` rule in `fixture.js:112` and `snapshot.js:101`;
  - a "never held" rule inferred from the shape of the data in `ledger.js:53`;
  - query instant parsing in `paging.js:43`.

### R10 — non-blocking: `effective_at` is truncated to the millisecond, while query bounds use floor/ceil

- **Location:** `handlers/corrections.js:18` versus `clock.js:35-41`. Source: standards N4.
- **Effect:** an `effective_at` of `…00.0005Z` counts at `as_of=…00.000Z`.
- **Principle 2.**

### R11 — non-blocking: commit 7d115a2 also fixes the statement's default `to`, with no test of its own and no cause stated

- **Source:** standards N5.
- **Principle 5** and "Fixing a defect".

### R12 — non-blocking: test gaps, and one timing-flaky test

- **Source:** standards N6.
- **No test covers:**
  - snapshot stability after a correction or a hold lifecycle action;
  - same-instant movements at an overdraft boundary;
  - key reuse after a refused correction;
  - concurrent same-key corrections;
  - scale.
- **Flaky test:** `test/reset-load.test.js:34` failed once under the parallel suite (3411 ms against a 3 s limit),
  then passed.
- **Principle 3.**

## Dismissed

None.

## Carry-forward

- **S1-RISK-1:** the stage-3 diff does not touch password storage. The risk stands as accepted.
- **S2-R23, S2-R19, S2-R8, S1-R19, S1-R21, S1-R17:** unchanged.
- **The stage-2 watch items, all confirmed:**
  - limits are fixed constants (`MIN/MAX_TIMESTAMP_MS`, `MAX_CLOCK_MS`);
  - correction receipts join `REPLAY_RULES`;
  - stage-1 and stage-2 exports import, per the spec pass.

## Status of earlier R findings

This is the first review of stage 3. The stage-2 R findings are closed per review-04f3ca4-recheck.md.

## Summary

- 3 blocking findings: R1, R2 and R3.
- 9 non-blocking findings: R4-R12.
- No verdict at round 1.
