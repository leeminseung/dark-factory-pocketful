# Stage 2 — final review of 8c3360d

- **Revision:** 8c3360dfeae0894027d75c4502cf1d8f4359d500 (stage-2/ = 1b1322f)
- **Round-1 revision:** 7364e79 (report: work/reviews/review-7364e79-round1.md)
- **Requirements:**
  - spec stage-2.md, which builds on stage-1.md;
  - work/stage-2/requirements.md (S2-001..S2-168, D2-1..D2-9);
  - rulings in work/stage-2/decisions.md: R1 ruling 63ae1ef.
- **Latest acceptance report:** work/reviews/acceptance-8c3360d.md. The suite passes 858/858, but its probes fail
  **S2-102**. No ruling calls S2-102 a test error.
- **Design report:** work/reviews/design-8c3360d.md, pass.
- **Case memory:** work/case-memory.md. Its cases were written out in the probe brief.
- **Worktree:** /Users/mslee/dark-factory/band-work/worktrees/reviewer-8c3360d, with `work/` deleted.

## Verdict: CHANGES NEEDED — blocking count 7

| Source | Count |
|---|---|
| Open blocking R findings: R10, R11, R12, R13, R14, R15 | 6 |
| Failing requirement ids in the latest acceptance report: S2-102 | 1 |
| Stages failing the supplied checks | 0 |
| **Total** | **7** |

S2-102 is the same defect as R11. The counting rule counts it separately.

## Supplied checks

```
cd /Users/mslee/dark-factory/dark-factory-wearedevs && .venv/bin/python -m harness run --track pocketful \
  --repo /Users/mslee/dark-factory/band-work/worktrees/reviewer-8c3360d --all --mode isolated \
  --out /Users/mslee/dark-factory/band-work/checks/reviewer-8c3360d-final-isolated
```

| Folder | Result |
|---|---|
| `stage-1/` | claims stage 1 (share 1.0) |
| `stage-2/` | stage 1: pass, stage 2: pass, stage 3: fail (expected), claimed stage 2 (share 1.0) |

Mode isolated. No folder passes the next stage's checks. There were no time or resource failures.

## Passes run

| Pass | Brief | Raw answer |
|---|---|---|
| fix-commit (7364e79..8c3360d) | work/reviews/review-8c3360d-fixes-brief.md | work/reviews/review-8c3360d-fixes-raw.md |
| black-box probe | work/reviews/review-8c3360d-probe-brief.md | work/reviews/review-8c3360d-probe-raw.md |

How the passes were run:
- **Starting the subagents:** each subagent was told in one line to read a byte-identical, read-only copy of its
  brief in /tmp. The briefs are 48 KB and 148 KB. Both copies have since been deleted.
- **Probe targets:**
  - `pocketful-reviewer-8c3360d` (stage-2 build) at 127.0.0.1:60578;
  - `pocketful-reviewer-8c3360d-s1` (stage-1 build, used for the upgrade rows) at 127.0.0.1:60587;
  - both were limited to 2 CPU and 2 GiB and have since been removed.

**Raw findings:** 15 in total.
- The fix-commit pass reported B1-B3 and N1-N5.
- The probe reported F1-F6, plus one open item (pre-1970 `expires_at`).

**Verification:**
- I reproduced on the running build B1/F1, B2/F2, F3 (both parts) and F4. I read the code for B3.
- After merging duplicates, the 15 became 14 findings, R10-R23.
- Nothing was dismissed outright. F3(a) as the probe first described it ("set authorizations to an empty list") is
  refused correctly with 422. The defect is real only when the `authorizations` key is deleted; see R13.

## Status of round-1 findings

| R | Status | Evidence |
|---|---|---|
| R1 (blocking): a pay form changed and changed back after a confirmed payment replayed the old one | **fixed** | e8c58a8. Both passes confirmed it in the browser: an unchanged resubmit moves money once; a change and restore after a confirmed payment moves it again; the uncertain-outcome retry keeps the same key. |
| R2 (blocking): a large TTL gave an `expires_at` past year 9999 and an export that would not re-import | **still open, in a new form** | 6d54b0d bounds the TTL against the current clock and clamps `expires_at`. That creates two new failures, R10 and R11, and S2-102 now fails. |
| R3: no halfway-failure tests | **fixed** | bcd65b4 adds rollback tests for authorize, capture and void; 3f358f2 adds LatestRead tests. The remainder is R19. |
| R4: the browser repeated server rules | **fixed** | c193cf2 and 026ea9a put the shared rules in one module. |
| R5: the browser parsed server message text | **fixed** | 814ec2d words refusals from the code and from what was sent. |
| R6: the expiry and remaining-amount rules were written twice | **fixed** | 7a23195. The remainder is a middle-man method, R22. |
| R7: a stale comment | **fixed** | 6a5b501 |
| R8: large commits | **acknowledged** (history) | The commits in this range each have one purpose. |
| R9: the screens loaded at most 200 rows | **fixed, with a new defect** | 5ce266a now pages through `has_more`, but repeats a row when another client writes between page reads; see R12. |

## New findings

### R10 — BLOCKING: the service refuses its own export when the TTL is near the bound
- **Sources:** fix-commit B1 and probe F1.
- **Location:**
  - `stage-2/src/model.js:54`: `isTtlSeconds(value, now = Date.now())` is applied by `records.js:51` on both reset and
    import;
  - commit 6d54b0d.
- **Requirement:** stage 1 §10 "It must accept an unchanged export produced by this service."
- **Reproduced:**
  1. Reset with `authorization_ttl_seconds = floor((MAX − now)/1000) − 1` → 204.
  2. Export, wait 3 s, and import the export unchanged.
  3. Result: **422** "authorization_ttl_seconds must be a positive whole number of seconds".
- **Cause:** the bound moves with the clock, so a TTL that was accepted at reset is refused a few seconds later.

### R11 — BLOCKING: `expires_at` is silently clamped instead of being `created_at` plus the TTL (same defect as S2-102)
- **Sources:** fix-commit B2, probe F2, and acceptance F1.
- **Location:** `stage-2/src/model.js:47` (`expiryOf` = `Math.min(createdAt + ttl*1000, MAX_TIMESTAMP_MS)`).
- **Requirement:** stage 2 "`expires_at` is `created_at` plus `authorization_ttl_seconds`."
- **Reproduced:**
  1. Reset with the near-bound TTL and wait 3 s.
  2. `POST /authorizations` → 201 with `created_at` 2026-10-05T22:53:48.081+00:00 and `expires_at`
     9999-12-31T23:59:59.999+00:00.
- **Fix direction (for R10 and R11 together):**
  - Bound the TTL against a value that does not move between reset, export and import, so the service's own exports
    always re-import.
  - Never silently produce an expiry that breaks the stated equation.
  - Test exactly at the bound.
  - The probe noted that the spec allows "a positive integer number of seconds" while some such values cannot
    produce an RFC 3339 expiry. Choosing a fixed upper bound for the TTL is a ruling the coordinator may need to make.

### R12 — BLOCKING: reading lists page by page repeats a row when another client writes between page reads
- **Source:** fix-commit B3.
- **Location:** `stage-2/public/assets/lib/api.js:76-90` (`collectPages`/`readAll`), used by the wallet, requests and
  authorizations screens; commit 5ce266a.
- **Requirements:**
  - stage 2 "`activity-item-{payment_id}` | One per visible payment";
  - stage 2 "`request-item-{request_id}` | One per request";
  - stage 2 "Another client may spend the balance after this browser reads it."
- **Evidence:**
  - From the code: pages are read by offset, newest first, and nothing removes duplicates by id.
  - The pass emulated `readAll` against the live API: 201 payments, then a write between page 0 and page 1, gave 202
    items of which 201 were unique.
- **Why blocking:** "One per visible payment" fails under a stated condition: another client writing. The window is
  narrow (more than 200 rows).
- **Fix direction:** remove duplicates by id when collecting pages.

### R13 — BLOCKING: an export with the `authorizations` key removed imports, and silently strips capture links
- **Source:** probe F3(a), as reproduced.
- **Requirements:**
  - stage 1 §10 "an invalid state give 422 `validation_failed` without changing the destination";
  - stage 1 §10 "Identities, timestamps and monetary records must not be regenerated";
  - S2-158 "contradictory capture links".
- **Reproduced:**
  1. Ada authorizes 1000 to bob; bob captures 500 with `final:false`.
  2. Export and delete `state.authorizations`, then import → **204**.
  3. `/activity` now shows the capture payment with `authorization_id: null`; the imported record has been changed.
  4. Replaying the capture key still returns 200 with `authorization_id` naming an authorization that no longer
     exists.
- **Contrast:** setting `authorizations` to `[]` is correctly refused with 422 ("payment … names an authorization it
  did not capture").
- **Cause:** an absent key is treated as a stage-1 export, and the payment's stage-2 link is dropped instead of being
  checked.

### R14 — BLOCKING: stored idempotency responses are not checked against the records they describe (carried over from stage 1)
- **Source:** probe F3(b) and its further cases.
- **Requirements:**
  - stage 1 §10 "an invalid state give 422";
  - stage 1 §10 "all completed idempotent request bodies and original responses" must be preserved, so they must be
    consistent with the records.
- **Reproduced:**
  - Editing the capture key's stored `response.body.payment_id` to `p_ghost` (and `amount` to 999999) imports with
    **204**. The replay then returns a receipt for `p_ghost`, a payment that does not exist.
  - The same edit on a `POST /payments` record also imports with 204.
- **Probe also showed:** a capture scope naming `a_missing`, a fingerprint that disagrees with its response, and a
  stored response `expires_at` in year 10000 are all accepted.
- **Note:** this is the case-memory class "corrupted idempotency records: refuse with 422". The accepted stage-1 build
  has the same gap. It is raised now because stage 2 must hold every rule, and the stage-2 records add capture
  responses.

### R15 — BLOCKING: horizontal scrolling at 375 px once balances reach ten million
- **Source:** probe F4.
- **Requirement:** stage 2 "The required flows must remain clear and usable at a 375 CSS-pixel viewport … without
  horizontal page scrolling."
- **Reproduced** (Playwright at 375×800 on `/`):

  | ada's balance | `scrollWidth` |
  |---|---|
  | 5000000.00 EUR | 375 |
  | 10000000.00 EUR | **397** |

  The `wallet-available` headline and the balance row overflow their card.
- **Probe also measured:** JPY 1e9 → 382 px; BHD 1e9 → 477 px; 2^53−1 → about 548 px.
- **Why blocking:** these balances are legal. A single payment may be up to 1000000000 minor units, and seeded
  balances have no smaller cap.

### R16 — non-blocking: an imported clock in year 9999 stamps new records in 9999
- **Source:** probe F5.
- **Evidence:**
  - After importing `last_timestamp_ms` 253402300799000, new records get `created_at` 9999-12-31T23:59:59.000+00:00.
    One authorization came out with `created_at` equal to `expires_at` while still `open`.
  - A `created_at_ms` later than `expires_at_ms` is also accepted.
- **Why non-blocking:** the output is valid RFC 3339, nothing returns 5xx, and the case needs a tampered export.

### R17 — non-blocking: the refusal for a capture amount of 0 is technical wording
- **Source:** probe F6.
- **Evidence:** `authorization-error` reads "Amount must be 1 to 1.7976931348623157e+308."
- **Requirement:** stage 2 "Format people, amounts and timestamps for people first". This is a quality judgement; the
  behaviour is correct.

### R18 — non-blocking: seeded `expires_at` before 1970 is refused
- **Source:** the probe's open item.
- **Evidence:** `1969-12-31T23:59:59Z` gets 422 at reset, although it is valid RFC 3339.
- **Why non-blocking:** stage 2 says only that seeded expiries are "at least an hour from reset time, in the past or
  future". This is low impact, but it is a case-memory class (instants before 1970).

### R19 — non-blocking: commit 3f358f2 is labelled a restructure but changed behaviour, and its correction 8afb994 has no test
- **Source:** fix-commit N1.
- **Principle 4.**

### R20 — non-blocking: most of the D1-D11 layout fixes keep no regression test
- **Source:** fix-commit N2.
- **Evidence:** D11 (ba13bbc) is behavioural and testable, yet has no test.
- **"Fixing a defect", step 2.**

### R21 — non-blocking: reads are abandoned after 3 s and sent again
- **Source:** fix-commit N3.
- **Evidence:** this doubles read load at up to 50 in flight. The code's own comment cites the 5 s limit.

### R22 — non-blocking: `State.remainingOf` only forwards the call (middle man)
- **Source:** fix-commit N4.

### R23 — non-blocking: the retry identity remembers only the last body sent
- **Source:** fix-commit N5.
- **Evidence:** it is consistent with the R1 ruling, because a later answered submission confirms an outcome. This is
  noted for completeness.

## Carry-forward

- **S1-RISK-1:** password storage is unchanged in this stage (`src/passwords.js` did not change from the stage-1
  copy). The risk stands as accepted.
- **S1-R17, S1-R19, S1-R21:** unchanged.

## Found sound (from the passes and my own checks)

- **Holds and funds:** every insufficient-funds check is against `available`, including settlement net debits, and
  captures can spend their own hold.
- **Idempotency on the new paths:** replays across number spellings and path spellings, and 20 concurrent same-key
  requests giving one 201 on both authorize and capture.
- **Captures and expiry:** partial and final captures; races between captures and voids; expiry without any
  triggering request.
- **Fixture rules:** TTL forms, holds against balances, and `expires_at` forms, including invalid dates.
- **Upgrade from stage 1:** the API, plus the browser staying signed in and recovering a lost payment.
- **Screens:**
  - decimal input in all five forms for EUR, JPY and BHD;
  - repeat submission and uncertain retries;
  - latest refresh wins;
  - stale buttons;
  - paging past 200 rows when nothing else writes;
  - empty states;
  - 375 px with ordinary balances.
- **Limits:**
  - a reset of 1200 users and 20000 authorizations takes 3.4 s;
  - 50 requests in flight answer within 0.04 s at most;
  - a 10.5 MB import takes 0.21 s.
