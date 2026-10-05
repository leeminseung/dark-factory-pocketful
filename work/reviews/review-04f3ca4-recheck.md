# Stage 2 — re-review of 04f3ca4

- **Revision:** 04f3ca4db90dc9780aa14ccb096b6f67f7e4a8ab (stage folders = 2c1be66)
- **Rejected revision:** 8c3360d. Its report is work/reviews/review-8c3360d-final.md: CHANGES NEEDED, blocking 7.
- **Latest acceptance report:** work/reviews/acceptance-04f3ca4.md, with 0 failing ids.
  - Stage-2 suite: 858/858.
  - Stage-1 suite: 554/554.
- **Design report:** work/reviews/design-61246ed.md: pass, with R15 and D12 fixed.
- **Rulings applied** (work/stage-2/decisions.md):
  - R1, ruling 63ae1ef;
  - the TTL bound, ruling 2abb370 with correction f31fb10.
- **Worktree:** /Users/mslee/dark-factory/band-work/worktrees/reviewer-04f3ca4, with `work/` deleted. It has since been
  removed.

## Verdict: PASS — blocking count 0

| Source | Count |
|---|---|
| Open blocking R findings | 0 |
| Failing requirement ids in the latest acceptance report | 0 |
| Stage folders failing the supplied checks | 0 |

## Passes run

None.
- **Why none:** this is a re-review after a rejection. Under the reviewer's rules it runs no new discovery passes. It
  checks each rejection reason and reruns the supplied checks.
- **How I checked:** I verified each reason myself, over HTTP and with headless Chromium, against two containers built
  from 04f3ca4. Both were limited to 2 CPU and 2 GiB, and both have since been removed.

| Container | Built from |
|---|---|
| `pocketful-reviewer-04f3ca4-s2` | `stage-2/` |
| `pocketful-reviewer-04f3ca4-s1` | `stage-1/` |

- **Fix-commit pass:** not run, because this is a re-review. The fix commits since 8c3360d are 67e7084..2c1be66.

## Supplied checks

```
cd /Users/mslee/dark-factory/dark-factory-wearedevs && .venv/bin/python -m harness run --track pocketful \
  --repo /Users/mslee/dark-factory/band-work/worktrees/reviewer-04f3ca4 --all --mode isolated \
  --out /Users/mslee/dark-factory/band-work/checks/reviewer-04f3ca4-recheck-isolated
```

| Folder | Stage 1 | Stage 2 | Stage 3 | Claimed stage |
|---|---|---|---|---|
| `stage-1/` | pass | fail | — | 1 |
| `stage-2/` | pass | pass | fail (expected) | 2 |

### The change to `stage-1/` since its acceptance at 56fce58

- **Commits:** 3c0ba8f and 2c1be66 change `src/records.js` (+78 lines) and add `test/replays-import.test.js`.
- **What changed:** the folder now refuses imports whose stored replays contradict their records. That is the R14
  fix, applied to stage 1 as well.
- **Checks still pass:** the folder still claims stage 1 on the supplied checks, and the stage-1 acceptance suite
  passes 554/554.
- **On the running stage-1 build:**
  - an export with an edited receipt `payment_id` gets **422**;
  - the unchanged export gets **204**.

## Status of each rejection reason

### R10 — the TTL bound moved with the clock, so the service refused its own export: **fixed**

Commit 67e7084 replaces the moving bound with fixed constants in `model.js`, as the ruling requires:
- `MAX_TTL_SECONDS` = 3155760000;
- `MAX_CLOCK_MS` = the last RFC 3339 instant minus that TTL.

What I checked:
- A reset with TTL 3155760000 gets 204, and a reset with 3155760001 gets 422.
- An export taken at the largest TTL and imported again 3 s later gets **204**.
- An imported `last_timestamp_ms` exactly at `MAX_CLOCK_MS` gets 204, and one millisecond past it gets 422.

### R11 / S2-102 — `expires_at` was clamped: **fixed**

At TTL 3155760000:
- `created_at` was 2026-10-05T23:51:51.650+00:00;
- `expires_at` was 2126-10-06T23:51:51.650+00:00;
- the difference is exactly 3155760000 s.

There is no clamping any more (67e7084). The acceptance report shows S2-102 passing.

### R12 — paging repeated a row when another client wrote between page reads: **fixed**

Commit 210f93a makes `collectPages` drop any item whose id it has already seen (`lib/api.js`, read at
`collectPages`). Inserts only push items onto later pages, so dropping repeats loses nothing.

### R13 — a stage-2 export with `authorizations` deleted was read as a stage-1 export: **fixed**

The same edit now gets **422** "invalid state: authorizations must be an array of objects" (9447014). An export is
read as stage-1 only when it carries no stage-2 field.

### R14 — stored idempotency receipts were not checked against records: **fixed, in both stage folders**

On stage 2:
- an edited capture receipt `payment_id` gets **422**;
- an edited `POST /payments` receipt `amount` gets **422**;
- the unchanged export gets 204, and the capture replay still gets 200.

On stage 1:
- an edited receipt gets 422.

Commits: e6cc2f5 and aa39fc1 (stage 2); 3c0ba8f and 2c1be66 (stage 1).

The acceptance report also records 106 receipt edits refused and 59 legitimate states that still replay.

### R15 — horizontal scrolling at 375 px: **fixed**

At a 375 px viewport, `scrollWidth` was **375** on `/`, `/requests`, `/authorizations` and `/split` for each of these
cases, all with a 1e9 open hold:
- EUR 1e9;
- BHD 2^53−1;
- JPY 2^53−1;
- EUR 2^53−1.

Commit: 29f9edd.

### Stage-1 to stage-2 upgrade (re-checked)

1. A stage-1 export (from the stage-1 container, after a payment) imports into stage 2 with 204.
2. The old token's same-key replay of that payment gets 200.
3. `available` reflects the payment.

## Non-blocking findings

| R | Status |
|---|---|
| R16: an imported clock could stamp new records in year 9999 | **fixed**. The clock now has a fixed bound, and imported times must agree with the clock and the lifetime (6ebeeac). |
| R17: technical wording on a capture refusal | **fixed**. Capturing 0 shows "Enter an amount from 0.01 EUR to 5.00 EUR." (58f286e) |
| R18: seeded expiries before 1970 were refused | **fixed**. `1969-12-31T23:59:59Z` gets 204 and reads back as `1969-12-31T23:59:59.000+00:00` (5d06617). |
| R19: a restructure commit that changed behaviour | **acknowledged** (history), and recorded in notes (7c61450). |
| R20: layout fixes with no regression tests | **fixed**. `stage-2/test/screen_checks.py` keeps D1-D11 (33a40db), and D12 has its own check (237de55). |
| R21: the 3 s read retry | **fixed**. A read is now abandoned after 6 s, past the 5 s limit (59de453). |
| R22: a middle-man method | **fixed** (f1973f7). |
| R23: the retry identity remembers only the last body | **left by choice**, with reasons in notes. It is consistent with the R1 ruling. |
| D12: wallet-held sat about 10 px above its label | **fixed**, as confirmed in design-61246ed.md. |

## Status of the round-1 findings

| R | Status |
|---|---|
| R1, R3, R4, R5, R6, R7, R9 | fixed, as reported at 8c3360d |
| R2 | fixed through R10 and R11 |
| R8 | history |

## Carry-forward

- **S1-RISK-1:** password storage is unchanged in both folders. The risk stands as accepted in stage 1.
- **S1-R17, S1-R19, S1-R21:** unchanged.
