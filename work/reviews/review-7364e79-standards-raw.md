## Standards review of 7364e79 (stage 2), range ccba841..7364e79

Commits that touch the stage: ab98ad7 (holds and authorizations), 6f4a32b (routes), 1a25c1f (restructure), 4e74eea (screens), f5cb6f8 (fixture status), 65a2726 (retry identity). 7364e79 and 0f6da7e only add notes. `npm test` passes 102/102. I drove the screens with Playwright and probed the API with curl. Nothing was written to the worktree, and the server and temporary files I used are gone.

### Blocking

**B1. Editing the pay form and changing it back after a successful payment replays the old payment instead of making a new one, and the screen still says "Sent".**
- Location: `stage-2/public/assets/lib/ui.js` (`RetryIdentity.current`, about line 104) and `stage-2/public/assets/screens/wallet.js:113`. Introduced in commit 65a2726.
- Principle: "Failure and repetition are normal. For every operation that changes state, decide and test what happens when it is sent again…" and "One place per decision". The single retry-identity rule picks its key only by comparing the body with the last body sent. It ignores whether that write succeeded or its answer was lost.
- Requirement: "Changing a field makes the next submission a new payment request."
- Evidence: after any outcome, `current()` keeps the last body and its key. A form that is edited and then changed back without being submitted therefore reuses the key of a payment that already succeeded. The server replays it with 200, and `send()` treats that as success. The new unit test pins exactly this: `'edited and changed back is unchanged: same key'`. It does not separate the lost-answer case (where the spec wants the same key) from the confirmed-success case.
- To reproduce: reset with ada at 10000 and bob at 2500, then log in as ada on `/`. Pay bob `15.00` and wait until `wallet-balance` shows `data-amount=8500`. Change `pay-amount` to `16.00`, change it back to `15.00`, and click `pay-submit`.
  - Expected: a second payment. The balance becomes 7000 and the feed shows two items.
  - Actual (seen in Playwright): the balance stays at 8500, the feed shows 1 item, and the screen says "Sent 15.00 EUR to bob."
- Why blocking: it breaks a stated requirement and shows a false success message. Suggested fix: keep the body-matched key only while the outcome is unknown (which is what S2-074's edit-and-restore case needs). After a confirmed success or refusal, the first field change should forget the identity. Add a test for the after-success case at the browser level.

**B2. With a large allowed `authorization_ttl_seconds`, the service creates authorizations it cannot export and import back in.**
- Location: `stage-2/src/model.js:678` (`isTtlSeconds`), `stage-2/src/state.js` (`openAuthorization`: `expiresAt: createdAt + ttl*1000`), and `stage-2/src/records.js:132`. Commit ab98ad7.
- Principle: "One place per decision". The rule "an expiry must stay formattable" is decided twice, differently. `isTtlSeconds` bounds the TTL by `MAX_TIMESTAMP_MS/1000` without allowing for the creation time. `isTimestampMs` then rejects the resulting `expiresAt`.
- Requirements: §10 "It must accept an unchanged export produced by this service". §3.4 "Timestamps in responses are RFC 3339 with an explicit offset".
- To reproduce: reset with `"authorization_ttl_seconds": 253402300799` (the reset accepts it, 204). As ada, `POST /authorizations {"to_handle":"bob","amount":100}`. Then `GET /_test/export` and `POST /_test/import` with that body unchanged.
  - Expected: the 201 carries an RFC 3339 `expires_at`, and the import returns 204.
  - Actual: `"expires_at":"+010056-10-04T21:42:01.935+00:00"`, and the import returns 422 `authorizations[0] timestamps are invalid`.
- Why blocking: the service refuses its own export (the upgrade-import condition) and returns a timestamp that is not RFC 3339. It happens only at an extreme but valid TTL. Fix: reject such a TTL at reset, or clamp `expiresAt` to `MAX_TIMESTAMP_MS` in one place.

### Non-blocking

**N1. No halfway-failure tests for the new state-changing operations.**
- Location: `stage-2/test/state.test.js:15` (unchanged in this range).
- Principle: "decide and test what happens… when it stops halfway."
- The rollback test covers payments, requests, splits and settlements only. `captureAuthorization` changes `capturedAmount`, `paymentIds` and the status before it calls `movePayments`. `openAuthorization` and `voidAuthorization` also rely on the undo journal. Reading the code, the undo steps look correct, but none of these three is tested for a throw partway through.
- The screens have no in-repo test for "latest refresh wins" or for refusals refreshing the data. Those are covered only by the external acceptance tests in `work/acceptance/tests/stage_2/test_ui.py`.

**N2. The browser repeats server rules instead of sharing them.**
- Location: `stage-2/public/assets/lib/messages.js:5-6`, `:58-59`, and `lib/text.js`.
- Smell: "Duplicated code / Shotgun surgery".
- `MAX_AMOUNT`, `MAX_NOTE_CHARS`, `charCount` and the signup handle-derivation rule (§4) are written again in the browser. `src/shared/` was created to share code like this, but only the split rule uses it. Changing the note limit or the handle rule now means editing two places.

**N3. The browser reads meaning out of the server's free-text messages.**
- Location: `stage-2/public/assets/screens/split.js:78-82` and `lib/messages.js` (`authRefusal`, which matches `/password/i`).
- Smell: "Duplicated code". The service's wording becomes a hidden contract.
- `splitReason` pulls the unknown handle out of `no user has the handle "x"` with a regex, and detects "duplicate", "empty" and "required" in the message text. §5 says the message "may use any wording", so rewording a server message silently changes what the screens say.

**N4. The expiry and held-amount rules are written twice.**
- Location: `stage-2/src/state.js` (`expireDue`: `a.expiresAt <= now`; `remainingOf`) and `stage-2/src/records.js:143-154` (`checkHolds`: `a.expiresAt > now`, `a.amount - a.capturedAmount`).
- Smell: "Duplicated code". The rules "at or before now is expired" and "remaining = amount − captured" each live in two modules.

**N5. A stale comment points to the wrong asset path.**
- Location: `stage-2/src/shared/shares.js:2`.
- Principle: "Readability". The comment says the file is "served as /assets/shares.js", but `pages.js` serves it at `/assets/shared/shares.js`.

**N6. Two commits are large and do several things each.**
- Location: commits ab98ad7 and 4e74eea.
- Principle: "Vertical slices in small commits… A commit has one purpose."
- ab98ad7 (677 lines) bundles holds, authorize, capture (final and extended), void, expiry, list, the `/me` change, fixture rules and stage-1 import compatibility.
- 4e74eea (1472 lines) delivers five screens, the fonts and the shared UI library at once.
- Both messages do name what they serve, so this is about size and number of purposes, not missing messages.

### Checked and sound
- **One gate for funds:** every movement of money (payments, request pay, settlements, captures) goes through `State.movePayments`, which checks `available` for the net change of the whole batch. New holds are checked against `availableOf` in `openAuthorization`. The capture arithmetic (raising `capturedAmount` before `movePayments`) lets a capture spend its own hold, as the spec allows.
- **One place for authorization status:** every status change goes through `setAuthorizationStatus`, which keeps `openAuthorizations` exact, with undo. Expiry is applied at the start of each request by `expireDue`, so reads, writes, the list filter and export all see the clock.
- **Idempotency:** both new write paths are synchronous and wrapped in `runIdempotent` inside a transaction. Replay is resolved before validation, a capture body with a different `amount` or `final` is 409, and concurrent capture against void is tested.
- **Reset and import:** one validator, `checkRecords`, serves both. A stage-1 export imports with its tokens, pending requests and lost-response retries intact (tested). A seeded authorization without a status is now 422 (f5cb6f8, with a regression test).
- **Restructure commit 1a25c1f:** it only moves `equalShares` and re-exports it, so behaviour is unchanged. The split preview imports the same module the server uses, and the handles in the preview match the body that is sent.
- **Money formatting and parsing:** both live in one place, `lib/money.js`. It does no rounding, rejects `15.005`, handles minor units of 0, 2 and 3, and checks for safe integers.
- **Retry identity:** the class is used everywhere (pay, request, reserve, split, capture, request pay), and a key is reused after a lost answer. The API client sorts every answer into ok, refused or unknown, and 5xx counts as unknown.
- **Latest read wins:** refreshes are sequence-numbered on all three screens. Refresh stays clickable while a read is in flight, and the refresh after a write starts only once the write has answered.
- **Routes:** `/requests` and `/authorizations` serve HTML for `Accept: text/html` and JSON otherwise (tested). Static assets are an in-memory allow-list.
