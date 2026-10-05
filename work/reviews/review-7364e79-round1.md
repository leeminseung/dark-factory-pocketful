# Stage 2 — round-1 review of 7364e79

- **Revision:** 7364e7968b2338e587bf7653d132bfc511f60954 (stage-2/ content = 65a2726).
- **Range:** from the copy commit that created `stage-2/` to the revision:
  `git diff ccba841 7364e79 -- 'stage-*'`.
- **Worktree:** /Users/mslee/dark-factory/band-work/worktrees/reviewer-7364e79, with `work/` deleted.
- **Requirements:**
  - spec stage-2.md, which builds on stage-1.md;
  - work/stage-2/requirements.md (S2-001..S2-168, D2-1..D2-9);
  - work/stage-2/decisions.md, which has no rulings yet.
- **Case memory:** work/case-memory.md, read at the start of the stage.
- A round-1 review gives no verdict.

## Passes run

| Pass | Brief | Raw answer |
|---|---|---|
| standards | work/reviews/review-7364e79-standards-brief.md | work/reviews/review-7364e79-standards-raw.md |
| spec | work/reviews/review-7364e79-spec-brief.md | work/reviews/review-7364e79-spec-raw.md |

How they were run:
- **Starting the subagents:** each brief is about 47 KB, so each subagent was started with a one-line instruction to
  read a byte-identical, read-only copy of its brief in /tmp. Both copies have since been deleted.
- **What the passes ran:** both ran `npm test` (102/102 pass) and drove the screens with headless Chromium. The spec
  pass also ran the stage-1 service to check the upgrade path.

**Raw findings:** 11 in total.
- The standards pass reported B1, B2 and N1-N6.
- The spec pass reported F1, F2 and one note.

**After verification:**
- 9 findings, R1-R9. Standards B1 and spec F1 were merged into R1.
- 1 dismissed: the spec pass's note.

## Findings

### R1 — BLOCKING: after a confirmed payment, editing a field and changing it back replays the old payment instead of sending a new one

- **Location:**
  - `stage-2/public/assets/lib/ui.js:93-116` (`RetryIdentity.current`), used at
    `public/assets/screens/wallet.js:113`;
  - commit 65a2726.
  - Reported by both passes: standards B1 (blocking) and spec F1 (non-blocking, "needs a ruling").
- **Requirement (stage 2, Balance and pay):** "Submitting it again without changing a field must not send another
  payment … **Changing a field makes the next submission a new payment request.** Retries follow §7."
- **Evidence:**
  - From the code: `current(bodyText)` keeps the key of the last body sent, whatever the outcome was. So after a
    confirmed 201, a field changed and changed back gets the old key.
  - The server replays the payment (200), and `send()` shows "Sent 15.00 EUR to bob."
  - Both passes reproduced this in the browser:
    1. Pay 15.00 to bob.
    2. Change the amount to 16.00, then back to 15.00.
    3. Submit. Ada's balance stays at 8500 and the feed still shows one item.
- **Expected:** a new payment. The balance becomes 7000 and the feed shows two items.
- **Why blocking:**
  - A field was changed, and the stated rule is that a change makes the next submission a new payment request.
  - The screen also reports a payment as sent when no new money moved.
- **The case that must keep working:** a retry after an uncertain outcome. The stated rule there is "Keep the
  unchanged form retryable with the **same key and body**", tested by S2-074,
  `test_uncertain_retry_survives_edit_and_restore`.
- **Fix direction:**
  - Keep the body-matched key only while the outcome is unknown.
  - After a confirmed success or refusal, the first field change starts a new identity.
- **If the coordinator rules the other reading:** the coordinator may instead rule that "changing a field" means the
  submitted values differ. In that case this finding is withdrawn.

### R2 — BLOCKING: a large valid `authorization_ttl_seconds` yields an `expires_at` that is not RFC 3339, and the service then refuses its own export

- **Location:**
  - `stage-2/src/model.js:45`: `isTtlSeconds` allows up to `MAX_TIMESTAMP_MS/1000`, without allowing for the creation
    time;
  - `src/state.js` `openAuthorization`: `expiresAt = createdAt + ttl*1000`;
  - `src/records.js` rejects that `expiresAt` on import;
  - commit ab98ad7.
  - Reported by standards B2.
- **Requirements:**
  - stage 1 §3.4: "Timestamps in responses are RFC 3339 with an explicit offset";
  - stage 1 §10: "It must accept an unchanged export produced by this service";
  - stage 2: "`expires_at` is `created_at` plus `authorization_ttl_seconds`".
- **Reproduction** (I ran this locally):
  1. Reset with `authorization_ttl_seconds: 253402300799` → 204.
  2. `POST /authorizations` → 201 with `expires_at: "+010056-10-04T21:47:08.488+00:00"`.
  3. Export, then import that export unchanged → 422 `authorizations[0] timestamps are invalid`.
- **Contrast:** with a TTL of 8000000000 everything works (expiry in 2280, re-import 204).
- **Note:** this is the case-memory class "durations large enough that a computed timestamp leaves the format's range"
  (edge-cases skill).
- **Fix direction:** decide in one place whether an expiry is formattable. Either refuse a TTL at reset whose expiry
  would leave the range, or bound `expiresAt`. Then add a regression test.

### R3 — non-blocking: the new state-changing operations have no halfway-failure tests

- **Location:** `stage-2/test/state.test.js`. Reported by standards N1.
- **What is missing:**
  - The rollback test covers the stage-1 writes only.
  - `openAuthorization`, `captureAuthorization` and `voidAuthorization` rely on the undo journal, but none is tested
    for a throw partway through.
  - The screens have no in-repo test for latest-refresh-wins or for refresh after a refusal.
- **Principle 3:** "decide and test what happens … when it stops halfway."

### R4 — non-blocking: the browser repeats server rules

- **Location:** `public/assets/lib/messages.js` and `lib/text.js` hold their own copies of `MAX_AMOUNT`,
  `MAX_NOTE_CHARS`, `charCount` and the §4 handle-derivation rule.
  - The `src/shared/` folder exists for code like this, but only the split rule is shared through it.
  - Reported by standards N2.
- **Principle 2.** Smells: Duplicated code, Shotgun surgery.

### R5 — non-blocking: the browser reads meaning out of the server's free-text messages

- **Location:**
  - `public/assets/screens/split.js:78-82` uses regexes on "no user has the handle", "duplicate", "empty" and
    "required";
  - `lib/messages.js` `authRefusal` matches `/password/i`.
  - Reported by standards N3.
- **Requirement:** stage 1 §5 says the message "may use any wording". The wording has become a hidden contract
  between server and browser.

### R6 — non-blocking: the expiry and held-amount rules are written twice

- **Location:** `src/state.js` (`expireDue`, `remainingOf`) and `src/records.js` (`checkHolds`). Reported by
  standards N4.
- **Principle 2.** The rule "at or before now is expired" and the arithmetic "remaining = amount − captured" each
  live in two modules.

### R7 — non-blocking: a stale comment

- **Location:** `src/shared/shares.js:2` says the file is served at `/assets/shares.js`; it is served at
  `/assets/shared/shares.js`. Reported by standards N5.
- **Principle 6.**

### R8 — non-blocking: two large commits with several purposes each

- **Commits:** ab98ad7 (holds, authorize, capture, void, expiry, list, `/me`, fixture, upgrade) and 4e74eea (five
  screens, fonts and the UI library). Reported by standards N6.
- **Principle 5:** "A commit has one purpose." Both messages do name what the commit serves.

### R9 — non-blocking: each screen loads at most 200 rows and does not page through `has_more`

- **Location:**
  - `public/assets/screens/wallet.js:10,179`;
  - `requests.js:9,25`;
  - `authorizations.js:10,27`.
  - Reported by spec F2.
- **Requirement (stage 2):** "`activity-item-{payment_id}` | One per visible payment"; "`request-item-{request_id}` |
  One per request".
- **Why non-blocking:** rows are lost only past 200 items, and the text suggests no such size.

## Dismissed

| Raw | Reason |
|---|---|
| Spec note: `authorization-expires` text is normalised to UTC with milliseconds | The requirement is "Text is the RFC 3339 `expires_at`". The text is valid RFC 3339 and equals the API value, so no requirement is broken. |

## Carry-forward

- **S1-RISK-1 (seeded hashes at reduced scrypt N):** the stage-2 diff does not touch password storage
  (`src/passwords.js` is unchanged in ccba841..7364e79). The risk stands as accepted in stage 1.
- **Stage-1 findings S1-R17, S1-R19 and S1-R21:** unchanged.

## Status of earlier R findings

This is the first review of stage 2. The stage-1 R findings are closed per review-936a4dd-recheck.md.

## Summary

- 2 blocking findings: R1 and R2.
- 7 non-blocking findings: R3-R9.
- No verdict at round 1.
