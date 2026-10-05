Spec review of stage-2 at 7364e79 is complete. I found no blocking findings and two non-blocking ones.

I read the full stage-2 diff: the server in `src/` and the browser code in `public/assets/`. `npm test` passes all 102 tests. I ran the service, plus the stage-1 service for the upgrade check, and drove the screens with headless Chromium through Playwright at 375 px and 1280 px. Everything I started has been stopped, and nothing was written to the worktree. The worktree already showed deleted files under `work/` before I began; I did not touch them.

## Findings

### 1. Non-blocking: editing a pay-form field and changing it back reuses the old key, so no new payment is sent
- **Location:** `/Users/mslee/dark-factory/band-work/worktrees/reviewer-7364e79/stage-2/public/assets/lib/ui.js:99-116` (`RetryIdentity.current`), used at `public/assets/screens/wallet.js:113`. This was deliberate, in commit 65a2726 ("the retry key follows the body sent, not the edits in between").
- **Requirement (Stage 2, "Balance and pay — `/`"):** "Submitting it again without changing a field must not send another payment: `wallet-balance` falls once, the feed contains one payment and `pay-error` is absent. Changing a field makes the next submission a new payment request."
- **Evidence:** the key is tied to the last body sent, not to whether a field was edited:
  ```js
  current(bodyText) {
    if (bodyText !== this.body) { this.body = bodyText; this.key = newKey(); }
    return this.key;
  }
  ```
- **Browser steps:**
  1. Sign in as ada.
  2. Pay `bob`, `1.00`, note `a`.
  3. Change the note to `b`, then back to `a`, without submitting.
  4. Submit.
- **Result:** both POSTs to `/payments` carried the same `Idempotency-Key` (`39ccd89a-…`). The second was a replay: the balance stayed at 99.00 EUR and there was no second payment.
- **Why non-blocking:** the sentence can also be read as "the submitted values differ". Under the literal reading ("changing a field"), the second submit should have been a new payment. The plain resubmit, a changed value, and a retry after an uncertain result all behave as specified. This needs a ruling more than a code fix.

### 2. Non-blocking: the screens fetch at most 200 rows, so longer lists are cut off
- **Location:**
  - `public/assets/screens/wallet.js:10,179` (`/activity?limit=200`)
  - `public/assets/screens/requests.js:9,25`
  - `public/assets/screens/authorizations.js:10,27`
- **Requirement (Stage 2, "Activity feed — `/`"):** "`activity-item-{payment_id}` | One per visible payment". The requests and authorizations tables say "One per request" and "Container on `/authorizations`".
- **Evidence:** each screen makes one request with `limit=200` and does not page through `has_more`.
- **Why non-blocking:** you only lose rows once there are more than 200 payments, requests or authorizations. Nothing in the spec suggests that size.

### Note (not a finding)
`authorization-expires-{id}` shows the same text as the API's `expires_at`. That text is normalised to UTC with milliseconds: seeded `2026-09-24T13:20:00+00:00` reads back as `…13:20:00.000+00:00`. It is valid RFC 3339, so it meets "Text is the RFC 3339 `expires_at`". It would only fail a check that compares against the seeded string character for character.

## Sections checked and found sound
- **Routes and negotiation:** `/`, `/requests`, `/split`, `/signup`, `/login` and `/authorizations` load by URL. `Accept: text/html` gets HTML; any other `Accept` on `/requests` and `/authorizations` gets JSON (401 without a token).
- **Every `data-testid` and its rule:**
  - `auth-error` appears only when there is an error.
  - `current-user` is shown on every screen; `current-handle` is exactly `ada`.
  - `wallet-held` is absent when held is zero; `wallet-available` and `wallet-balance` carry `data-amount`.
  - `empty-activity`, `empty-requests` and `empty-authorizations` appear when expected.
  - The pay, decline, cancel, capture and void buttons appear only in the states the spec allows.
  - `authorization-captured` appears only when status is `captured`; the capture amount is pre-filled with the remainder.
- **Formatted amounts and decimal input:**
  - `100.00 EUR`, `120000 JPY`, `1234.567 BHD`.
  - `15`, `15.0`, `15.00` → 1500 and `15.5` → 1550.
  - `15.005` (EUR), `15.0` (JPY) and `1.2345` (BHD) show the form's error and send nothing.
- **Repeat submission and retry identity:** a resubmit is a replay (the balance falls once, one feed item, no `pay-error`), and the form keeps its values after success.
- **Latest refresh wins:** I delayed the first refresh's responses past a second refresh. The second one's data stayed on screen (90.00 EUR).
- **Refused, stale and uncertain outcomes:**
  - A refused payment shows `pay-error`, refreshes the balance and keeps the inputs.
  - A request cancelled elsewhere shows `request-error`, and its pay button disappears.
  - A response lost after the commit (201 on the server) shows `pay-uncertain`, not `pay-error`.
- **Stage-1 to stage-2 upgrade:** I passed a stage-2 export through stage-1 import and export, then imported the result into stage-2 mid-session. The browser stayed signed in. The same-key retry of the lost payment recovered it as a replay: one payment, balance 85.00 EUR, both feedback elements cleared. `rq_1` was still payable from `/requests`.
- **Holds, available and `insufficient_funds`:**
  - `GET /me` returns `balance` = `total`, plus `available` and `held`.
  - Payments, request pays and settlements are checked against `available` (via `movePayments`).
  - Authorizing more than `available` returns 409.
- **Fixture rules:**
  - Holds larger than the balance return 422 and change nothing.
  - TTL defaults to 600; `0` returns 422.
  - Omitting `authorizations` works; seeded holds that are already past `expires_at` don't count.
- **Expiry with no triggering request:** this is handled at the start of each request (`server.js:81`). A TTL of 2 s, then waiting, gave `status: expired`, the remainder released into `available`, capture → `authorization_expired`, void → `authorization_not_open`.
- **Capture and void tables:** 403 for the wrong party and for third parties, 404 unknown, 422 for amount 0 or 1.5, `capture_exceeds_authorization` judged against the remainder, `authorization_not_open` after a final capture, re-voiding returns 200, voiding a captured one returns 409. Capture copies note and visibility, and open authorizations stay out of the activity feed.
- **Extended capture mode:** `final:false` keeps the authorization open, `payment_ids` and `remaining_amount` are correct, and reusing a key with a different body returns 409.
- **`GET /authorizations`:** filtering, newest first, only the caller's own (a third party gets an empty list), and `limit`/`offset`/`has_more` checks.
- **Authorization UI:** creating, capturing (including a refused over-capture showing `authorization-error`) and voiding all work.
- **Concurrency:** handlers are synchronous and transactional, so there is no interleaving.
- **Visual direction (checkable parts):**
  - Available is the headline figure, with total and held secondary.
  - Every input has a visible label, and keyboard focus shows a solid orchid outline.
  - At 375 px, every route has scrollWidth = 375 and no element extends past the viewport.
  - Loading, empty and error states exist.
  - Navigation is the same on every route.
- **Stage 1 not broken:** the full stage-1 test suite passes, and the stage-1 response shapes are kept, plus the new `authorization_id`.
