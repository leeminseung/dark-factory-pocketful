# Stage 3 — final review of e03c437

- **Revision:** e03c4371ebe434f0ebdc65d6b35c175d02c36417 (stage-3/ = 123af1b). stage-1/ and stage-2/ are unchanged
  since 048a821.
- **Round-1 revision:** 6a17d63 (report: work/reviews/review-6a17d63-round1.md).
- **Requirements:**
  - spec stage-3.md, which builds on stage-1.md and stage-2.md;
  - work/stage-3/requirements.md (S3-001..S3-074, D3-1..D3-8);
  - rulings in work/stage-3/decisions.md: a seeded `created_at` is part of the fixture format; R3 is blocking; R4 is
    no change; R6 is the implementer's choice.
- **Latest acceptance report:** work/reviews/acceptance-e03c437.md. The suite at cc78f4d passes 1050/1050, but its
  probes fail **S3-043** and **S3-009**. No ruling calls either one a test error.
- **Design report:** work/reviews/design-6a17d63.md, a regression review with no findings. No screens changed in
  this stage.
- **Case memory:** work/case-memory.md. Its cases were written out in the probe brief.
- **Worktree:** /Users/mslee/dark-factory/band-work/worktrees/reviewer-e03c437, with `work/` deleted. It has since
  been removed.

## Verdict: CHANGES NEEDED — blocking count 7

| Source | Count |
|---|---|
| Open blocking R findings: R13, R14, R15, R16 | 4 |
| Failing requirement ids in the latest acceptance report: S3-043, S3-009 | 2 |
| Stage folders failing the supplied checks: stage-3/ (isolated run) | 1 |
| **Total** | **7** |

By the counting rule, some items are counted twice:
- S3-043 and S3-009 are the same defect as R14.
- The stage-3/ failure on the supplied checks is the same defect as R16.

## Supplied checks

```
cd /Users/mslee/dark-factory/dark-factory-wearedevs && .venv/bin/python -m harness run --track pocketful \
  --repo /Users/mslee/dark-factory/band-work/worktrees/reviewer-e03c437 --all --mode isolated \
  --out /Users/mslee/dark-factory/band-work/checks/reviewer-e03c437-final-isolated
```

| Folder | Result |
|---|---|
| `stage-1/` | stage 1 pass, stage 2 fail; claims 1 |
| `stage-2/` | stages 1-2 pass, stage 3 fail; claims 2 |
| `stage-3/` | stages 1-2 pass; **stage 3: fail** (share 0.833); stage 4 fail; highest contiguous stage 2 |

**The stage-3 failure:**
- The failing test is `test_sample.py::test_a_statement_walks_the_balance_forward`: `assert [-200, -300] == [-300, -200]`.
- It is not a time or resource failure.
- It is intermittent. I re-ran `--stage 3` three more times (reviewer-e03c437-stage3-rerun1..3) and all three
  passed.
- It is a real ordering defect; see R16.
- The harness still prints "claimed stage: 3", but the stage-3 checks did not all pass in the isolated run.

## Passes run

| Pass | Brief | Raw answer |
|---|---|---|
| fix-commit (6a17d63..e03c437) | work/reviews/review-e03c437-fixes-brief.md | work/reviews/review-e03c437-fixes-raw.md |
| black-box probe | work/reviews/review-e03c437-probe-brief.md | work/reviews/review-e03c437-probe-raw.md |

How the passes were run:
- **Starting the subagents:** each subagent was started with a one-line instruction to read a byte-identical,
  read-only copy of its brief in /tmp. The briefs are 58 KB and 187 KB.
- **Ports:** the fix-commit pass was confined to ports 47000-47999. The probe used only the containers.
- **Probe targets:** three containers, each limited to 2 CPU and 2 GiB. All three have since been removed.

  | Build | Container | Port |
  |---|---|---|
  | stage-3 | `pocketful-reviewer-e03c437-s3` | 65161 |
  | stage-2 | `pocketful-reviewer-e03c437-s2` | 65157 |
  | stage-1 | `pocketful-reviewer-e03c437-s1` | 65155 |

- **Probe scope:** the brief limited the probe to HTTP. No screens changed in stage 3, and the design regression
  review covered them.

**Raw findings:** 17 in total.
- The fix-commit pass reported B1-B5 and N1-N4.
- The probe reported F1-F4 and four observations.

**Verification:**
- I reproduced B1, B2 and the sub-millisecond truncation on the running build. I read the code for B5.
- After merging duplicates, the 17 became 12 findings, R13-R24.
- I rated B2 non-blocking, against the pass's proposal; reason under R17.
- I dismissed none.

## Status of round-1 findings

| R | Status | Evidence |
|---|---|---|
| R1 (blocking): snapshot memory | **fixed** | 53f89d9 turns a snapshot into a window plus a watermark. Per-read cost fell from about 2.8 MB to about 0.7-1.9 KB; I measured +15 MB for 23k reads. The remainder is R17, non-blocking. The fix also introduced R13. |
| R2 (blocking): quadratic overdraft check | **fixed** | ee300dc makes it one sorted pass. Measured: 200k payments reset in 0.56 s, 50 concurrent corrections take at most 0.80 s, 100 full-history corrections at most 0.64 s, and 1000 users with 50k payments reset in 3.0 s. |
| R3 (blocking): snapshots must survive import | **fixed** | 74f6cbb. Snapshots survive import still bound to their owner, and about 29 snapshot edits are refused. The remainder is R15. |
| R4: from > to | ruled no change | It is still 422. |
| R5: stage-2 voids get an approximate `closed_at` | **open, non-blocking** | It is unavoidable from a stage-2 export, which has no void time. The probe confirmed it. |
| R6: lowercase `t`/`z` | **fixed** | 31ecf4e. A leftover uppercase-only pattern is R20. |
| R7: corrections bypassed the money gate | **fixed** | 1e759f5 routes them through the gate. |
| R8: two functions named `heldBy` | **fixed** | b4f1477 |
| R9: small duplicated rules | **fixed** | 92ba1d3 |
| R10: stored versus query instant precision | **regressed** | d408eb0 makes the two consistent by truncating every instant to the millisecond. That changes instants' values; see R14. |
| R11: commit history | acknowledged | — |
| R12: test gaps | **mostly fixed** | 1cbe752 adds tests but loosens a timing bound; see R19. |

## New findings

### R13 — BLOCKING: every first `GET /statement` advances the service clock by 1 ms, so under read load the clock runs ahead of real time

- **Source:** fix-commit B1.
- **Location:**
  - `stage-3/src/state.js:380-384` (`freezeReadAt`: clock = max(last, now+1));
  - `handlers/history.js:97`;
  - `server.js:81` (`now = max(Date.now(), lastTimestampMs)`);
  - commit 53f89d9 (the R1 fix).
- **Requirements:**
  - stage 3 "Every payment's `created_at` is an RFC 3339 instant with an offset identifying when it moved money";
  - "An `as_of` at or after the latest payment returns the current balance";
  - "effective time is an RFC 3339 instant not later than now";
  - stage 2 "An authorization whose `expires_at` is at or before now is `expired`".
- **Reproduced:**
  1. 50 threads read `GET /statement?limit=1` for 5 s, about 23k reads.
  2. A payment then gets `created_at` 01:24:18.525Z, while the real time was 01:24:01.531Z: **17 s in the future**.
- **The pass's measurement:** 86k reads in 3 s gave 83 s of drift, and `as_of` set to the client's "now" missed the
  new payment.
- **Consequences:** holds expire early in real time, and corrections with an `effective_at` in the real future are
  accepted.
- **Fix direction:** never advance the clock on a read. Order "recorded after the snapshot" by a recording sequence
  number, with the watermark held as (ms, seq).

### R14 — BLOCKING: instants are truncated to the millisecond on input, changing their value (same defect as S3-043 and S3-009)

- **Sources:** fix-commit B3 and B4; probe F1-F4; acceptance F1.
- **Location:** `stage-3/src/clock.js` `parseTimestamp` / `parseInstant`, used for:
  - correction `effective_at` (`corrections.js:18`);
  - seeded payment and authorization `created_at`;
  - statement `from`/`to` (`history.js:84-85`).
  - Commit d408eb0 (the R10 fix). Its test pins the truncated result.
- **Requirements:**
  - stage 3 "the half-open window `[from, to)`";
  - "`as_of` retains its inclusive meaning";
  - "the balance after every payment of theirs with `created_at` at or before `as_of`, and before every payment
    after it";
  - "A seeded payment's supplied `created_at` is also its original recorded/effective time";
  - "A hold starts at authorization creation";
  - "if any user's corrected balance is negative at any effective-time boundary, return 409
    `historical_overdraft`".
- **Reproduced:**
  1. Seed a payment with `created_at …00:00:00.0005Z`. It is served as `…00.000+00:00`.
  2. `GET /me?as_of=…00:00:00.0003Z` counts the payment, which had not yet happened (balance 1000 instead of 995).
- **The passes also showed:**
  - `to=.0003` excludes a payment at `.000`;
  - a correction `effective_at` of `.0007` counts at `.0003`;
  - a correction to `.0007` hides a 0.7 ms historical overdraft and returns 201, where 409 is due;
  - a seeded hold created at `.0005` is held at `.0004`.
- **Fix direction:** keep instants at the precision given, at least wherever they are compared. For example, store
  sub-millisecond digits alongside the milliseconds, or compare with exact rational instants. Then serve stored
  times back with the same value. Query bounds against millisecond-resolution server times must keep the exact
  half-open and inclusive meaning.

### R15 — BLOCKING (by ruling): snapshot import accepts a watermark equal to the clock, so an imported snapshot's frozen result can change

- **Source:** fix-commit B5.
- **Location:** `stage-3/src/records.js:231` uses `knownAt <= lastTimestampMs` where `<` is needed; commit 74f6cbb.
- **Ruling:** "Edited snapshot state in an export must be validated like the rest of the state". Requirement: "Old
  snapshots remain unchanged after any lifecycle action or correction".
- **Evidence:**
  1. Edit the export so that `last_timestamp_ms` and the snapshot's `known_at_ms` are both now+1 h, and import → 204.
  2. A new payment then appears in the old snapshot.
- **Note:** this needs a hand-edited export. If R13 is fixed with a sequence-number watermark, this check changes
  with it.

### R16 — BLOCKING: two payments in the same millisecond come out in random order on a statement, so a supplied check fails intermittently

- **Source:** my own supplied-check run (above). No pass reported it.
- **Location:**
  - the clock is non-decreasing but not strictly increasing (`state.js:76-79`, `Math.max(Date.now(), last)`);
  - payment ids are random (`state.js:83-85`, `randomBytes`);
  - stage 3 orders ties "by payment id".
- **Requirements:**
  - the supplied check `test_a_statement_walks_the_balance_forward` expects creation order `[-300, -200]` for two
    payments made one after the other;
  - stage 3 "Entries are ordered by `created_at` ascending, then payment `id` ascending for ties".
- **Evidence:** the isolated run failed with `[-200, -300] == [-300, -200]`; three re-runs passed.
- **Why blocking:** a supplied check fails on the whole chain.
- **Fix direction:** give each payment a strictly later `created_at` than the one before (the stage-2 clock bound
  allows it), or give it an id that sorts in creation order. The id rule in R13's fix (a recording sequence) can
  serve both.

### R17 — non-blocking: snapshot storage still grows with every first read (about 0.7-1.9 KB each) until reset

- **Source:** fix-commit B2, which proposed blocking.
- **Evidence:**
  - I measured +15 MB for 23k reads.
  - The pass measured 643 MB after 298k reads in 10 s at 50 in flight, and a 49 MB export.
- **Requirements:** stage 1 "Memory | 2 GiB"; stage 3 "Tokens last until reset".
- **Why non-blocking:**
  - The round-1 failure (2 GiB at about 800 reads) is fixed.
  - Retaining tokens until reset implies some per-token cost.
  - Reaching 2 GiB now needs over a million first reads without a reset.
- **Better design:** self-contained signed tokens, which the pass suggested, would remove per-read storage and the
  growth of export size.

### R18 — non-blocking: commit 31ecf4e (R6) is a fix with no test; its test arrived in d408eb0

- **Source:** fix-commit N1.
- **Principle 5,** and "each fix comes with a test".

### R19 — non-blocking: commit 1cbe752 also loosens a timing bound

- **Source:** fix-commit N2.
- **Evidence:** the bound in `reset-load.test.js` R16 went from 1 s to 4 s, so the test can no longer detect a login
  held up by a reset.
- **Principle 4.**

### R20 — non-blocking: a second, uppercase-only RFC 3339 pattern is left in `clock.js:6-7`

- **Source:** fix-commit N3.
- **Evidence:** the pattern is used by tests only.
- **Principle 2.**

### R21 — non-blocking: the random-history unit tests never generate never-held holds or captures after close

- **Source:** fix-commit N4.
- **Principle 3.**

### R22 — non-blocking: a leap second such as `2016-12-31T23:59:60Z` is refused

- **Source:** probe observation.
- **Why non-blocking:** RFC 3339 syntax allows it, but most systems refuse it. Low impact.

### R23 — non-blocking: a seeded open authorization with `created_at` after its `expires_at` is accepted

- **Source:** probe observation.
- **Evidence:** it then reports `closed_at` earlier than `created_at`.
- **Why non-blocking:** stage 3 states "Seeded history is consistent".

### R24 — non-blocking: `GET /requests` and `GET /authorizations` repeat rows across pages when another client writes between page reads

- **Source:** probe observation.
- **Evidence:** this is the same in the accepted stage-2 build.
- **Why non-blocking:** no paging-stability rule is stated for these API lists. The screens remove duplicates by id
  (S2-R12).

## Carry-forward

- **S1-RISK-1:** password storage is unchanged (`src/passwords.js` is the same as in the stage-2 copy). The risk
  stands as accepted.
- **Fixed limits:** limits remain fixed constants, and the TTL bound survives export/import (probe).
- **Corrections and REPLAY_RULES:** correction receipts are part of the replay rules, and every field of an edited
  correction receipt is refused (probe).
- **S2-R23, S2-R19, S2-R8, S1-R19, S1-R21, S1-R17:** unchanged.

## Found sound (from the passes and my own checks)

- **The sorted-pass overdraft check:** equivalent to the boundary-by-boundary definition, including same-instant
  grouping and holds.
- **Corrections:** field rules, parties, replays across path spellings, the key resolved after 401 and 400, a refused
  correction leaving no trace, `insufficient_funds` before `historical_overdraft`, and linked payments being
  immutable.
- **Revisions endpoint.**
- **`known_at` selection,** which keeps full precision.
- **Snapshots:** they stay frozen under about 6,500 concurrent payments, and 50 concurrent corrections on the same
  revision give exactly one 201.
- **Older-stage exports:** real stage-1 and stage-2 exports import with every replay intact.
- **Edited exports:** about 55 edits to a stage-3 export are refused.
- **Performance:**
  - 200k payments reset in 0.56 s;
  - an 18 MB export takes 0.26 s and its import 0.45 s;
  - 50 requests in flight answer within 1.9 s at most.
