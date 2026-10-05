# Review of 7364e79..8c3360d (stage-2), fix-commit pass

I read the whole brief, loaded `engineering-principles` and its code-smells reference, and read the full diff and every commit in the range. `npm test` passes 116/116. I started the service on port 18743 and probed it with Node scripts and headless Chromium at 375 px. I then stopped that process (by PID on my port) and deleted my temporary files in /tmp. I wrote nothing in the worktree and made no commits.

There are 3 blocking findings and 5 non-blocking ones.

## Blocking

### B1. The service refuses its own export when the TTL is near its bound
- **Location:** `stage-2/src/model.js:54` (`isTtlSeconds(value, now = Date.now())`), called from `stage-2/src/records.js:51`. Commit 6d54b0d.
- **Requirement:** "It must accept an unchanged export produced by this service." (stage-1 §10). Also: "Existing receipts, tokens and retries must remain valid after import".
- **Evidence:** The largest allowed TTL is now `floor((MAX_TIMESTAMP_MS - now)/1000)`, so it shrinks every second. Reset and import both call `checkRecords`. A TTL that was accepted at reset time is therefore refused when the export is imported a few seconds later. The R2 regression test avoids the edge: it uses `largest - 3600`, so the boundary is never tested.
- **Reproduce:**
  1. `POST /_test/reset` with `authorization_ttl_seconds = floor((Date.UTC(9999,11,31,23,59,59,999) - Date.now())/1000) - 1`.
  2. Wait 3 s.
  3. `GET /_test/export`, then `POST /_test/import` with the unchanged body.
- **Expected:** 204.
- **Actual:** `422 {"error":{"code":"validation_failed","message":"authorization_ttl_seconds must be a positive whole number of seconds"}}`.

### B2. `expires_at` is quietly capped, so it is not `created_at` plus the TTL
- **Location:** `stage-2/src/model.js:47` (`expiryOf` = `Math.min(createdAt + ttl*1000, MAX_TIMESTAMP_MS)`), used at `stage-2/src/state.js:241`. Commit 6d54b0d.
- **Requirement:** "`expires_at` is `created_at` plus `authorization_ttl_seconds`."
- **Evidence:** Reset accepts a TTL measured from the reset time. Any authorization created later with that TTL gets an expiry past 9999-12-31, which is then clamped without any signal.
- **Reproduce:**
  1. Reset with the same fixture as B1.
  2. Wait 3 s.
  3. `POST /authorizations {"to_handle":"bob","amount":10}`.
- **Expected:** `expires_at` = `created_at` + TTL, or an explicit refusal.
- **Actual:** 201 with `created_at` `2026-10-05T22:34:32.343+00:00` and `expires_at` `9999-12-31T23:59:59.999+00:00`. `created_at` + TTL would be `+010000-01-01T00:00:01.343Z`.
- **Fix direction:** Judge the TTL against something that does not move between reset, export and import, so that what the service writes stays importable. Settle on purpose what a creation beyond the RFC 3339 range does, rather than clamping. Add tests exactly at the bound.

### B3. Paging through `has_more` can show the same row twice when another client writes
- **Location:** `stage-2/public/assets/lib/api.js:76-90` (`collectPages`/`readAll`), used by `wallet.js`, `requests.js` and `authorizations.js`. Commit 5ce266a.
- **Requirements:** "`activity-item-{payment_id}` | One per visible payment", "`request-item-{request_id}` | One per request", and "Another client may spend the balance after this browser reads it."
- **Evidence:** Pages are read by offset, newest first. A write landing between two page reads pushes every item down by one, so the last item of page 0 comes back again on page 1. Nothing removes duplicate ids before rendering, so the DOM gets two elements with the same testid.
- **Reproduce:** I emulated `readAll` against the live API.
  1. Seed 201 public payments.
  2. Read `/activity?limit=200&offset=0`.
  3. Have another user `POST /payments`.
  4. Read `offset=200`.
- **Expected:** Each id appears once.
- **Actual:** 202 items, 201 unique; `p_1` appears twice.
- **Scope:** The window is narrow (more than 200 rows plus a write between page reads), but it meets the brief's test for blocking. Removing duplicates by id when collecting pages fixes it; inserts only shift items down, so no item is skipped.

## Non-blocking

### N1. Commit 3f358f2 is labelled a restructure but changes behaviour, and its correction has no test
- **Location:** Commits 3f358f2 and 8afb994; `requests.js` and `authorizations.js` `load()`.
- **Principle:** "a commit labelled as restructuring that changes behaviour, are findings"; "Each fix comes with a test."
- **Evidence:** 3f358f2 dropped the `seq < appliedSeq` early return before the failure branch. A stale failed read could then cover newer data with "Couldn't load". 8afb994 admits this and fixes it, but adds no test. `latest-read.test.js` tests only `accept`, not the `isLatest` guard on the failure path in the screens.
- **Why not blocking:** The end state is correct.

### N2. Most layout fixes keep no regression test
- **Location:** Commits 0205e13, 1ab1b7a, 470dd16, 4803823, 73922a5, 7fbfbd4, dbe870b, dd889f6, ba13bbc, edba912.
- **Principle:** "Fix the code until the command passes, and keep it as a regression test."
- **Evidence:** All except D10 (b2562df) cite a one-off probe and add no test. That includes D11 (ba13bbc, success lines cleared when the next action starts), which is behavioural and could easily be tested. Only D10 adds `time-words.test.js`.

### N3. Reads give up after 3 s, below the 5 s budget the code's own comment cites
- **Location:** `stage-2/public/assets/lib/api.js:29` (`READ_TIMEOUT_MS = 3000`). Commit 1b1322f.
- **Evidence:** The comment says "the service answers within 5 s". A read that would answer at 3–5 s is abandoned and sent again, which doubles read load under the stated "up to 50 in flight". If both attempts take more than 3 s, the screen shows "Couldn't refresh" even though the service is within its allowance.
- **Why not blocking:** No stated requirement breaks.

### N4. `State.remainingOf` only passes the call through
- **Location:** `stage-2/src/state.js:197`. Smell: Middle man.
- **Evidence:** After R6 it just forwards to `model.remainingOf`, and `views.js:89` still calls it. The rule is in one place, so this is minor.

### N5. The retry identity remembers only the last body sent (not a regression)
- **Location:** `stage-2/public/assets/lib/ui.js` `RetryIdentity`.
- **Ruling it touches:** "While an outcome is unknown, a form restored to the body already sent reuses that key."
- **Evidence:**
  1. Body A gets no answer (outcome unknown).
  2. The user edits the form and submits body B.
  3. The user restores the form to A, which then gets a new key, so A could move money twice.
- **Why not blocking:** This predates the range, and the ruling's "already sent" can be read as the last body sent.

## Checked and found sound
- **R6 (7a23195), restructure:** `checkHolds` with `!isDue && remainingOf` matches the old `open && expiresAt > now`, adding `amount - captured`. No expiry or remaining-amount rule is left written twice in `src`.
- **R4 (c193cf2) and 026ea9a, restructures:** `deriveHandle` and the limits are unchanged. Assets are still served at the same URLs. The Dockerfile copies `public/`, so the server's imports from `public/assets/shared` work in the image.
- **R1 pay-form retry identity, in the browser:** pay, then resubmit unchanged, moved money once (−100). Changing the amount and back, then submitting, moved it again (−100). `settle()` is called only on answered results, and `edited()` is wired to every field (the select uses `onchange`), to split and to capture.
- **R3 (bcd65b4):** the rollback tests for authorize, capture and void failing halfway are present and pass.
- **LatestRead:** a stale success is dropped; a stale failure no longer overwrites newer data. Read retries stay inside one sequence number. Writes are never retried by the client (tested).
- **R5 error wording:** it now depends on the code and on what was sent. The `authRefusal` order matches the server's signup check order (email, then password); `display_name` has no `validation_failed` path.
- **R9 (5ce266a):** a failed page fails the whole read, and the loop stops when `has_more` is false.
- **375 px:** no horizontal scroll on `/`, `/requests`, `/authorizations` or `/split`, with 20-character handles, a long display name and 999999.99 EUR. The header name truncates and Log out stays on one line.
- **D10:** "Collect by …" and "went back to you" are correct.
- **Test suite:** `npm test` passes 116/116.
