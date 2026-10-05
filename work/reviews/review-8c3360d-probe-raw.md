# Black-box probe of 8c3360d (stage 2): findings

I probed http://127.0.0.1:60578 through HTTP and headless Chromium (Playwright) only, and the stage-1 build at :60587 for the upgrade rows. I did not read any source code, including `/assets/app.js`. Both containers stayed up and answered `/health` the whole time; there was no 5xx anywhere. All my /tmp files are removed, and the stage-2 service was left reset to an empty fixture.

I found 6 problems: 4 blocking and 2 non-blocking.

## F1 (blocking): the service refuses its own export once a second has passed, when the TTL is near its upper limit
- **Rows:** S1-154 / S2-158 / S2-168: "It must accept an unchanged export produced by this service."
- **Steps:**
  1. Binary-search the largest `authorization_ttl_seconds` that `POST /_test/reset` accepts. It is about 251611061157 and depends on the reset time: the service accepts a TTL only if reset time + TTL ≤ 9999-12-31T23:59:59.999.
  2. Reset with that TTL (204).
  3. `GET /_test/export` returns 200 with `state.authorization_ttl_seconds: 251611061157`.
  4. Importing it straight away gives 204.
  5. Wait 1.5 s and `POST /_test/import` the same unchanged export.
- **Expected:** 204.
- **Actual:** `422 validation_failed` "authorization_ttl_seconds must be a positive whole number of seconds". The TTL check on import runs against the current clock, so an export the service produced and accepted a moment earlier becomes un-importable.

## F2 (blocking): `expires_at` is not `created_at` plus the TTL near the limit (the known S2-102 failure, still present)
- **Row:** S2-102: "`expires_at` is `created_at` plus `authorization_ttl_seconds`."
- **Steps:** reset with the maximum TTL from F1, wait 2.5 s, then `POST /authorizations {"to_handle":"bob","amount":100}`.
- **Expected:** `expires_at` = `created_at` + TTL.
- **Actual:** 201 with `created_at` 2026-10-05T22:33:50.113+00:00 and `expires_at` clamped to 9999-12-31T23:59:59.999+00:00, which is less than `created_at` + TTL.
- **Related, needs a ruling rather than counted as a separate defect:** reset refuses positive-integer TTLs such as 253402300799, 10^12 and 2^53−1 with 422. S2-091 says only "a positive integer number of seconds". These values cannot produce a valid RFC 3339 expiry, so the spec text and the timestamp format conflict here.

## F3 (blocking): import accepts contradictory capture links
- **Row:** S2-158: "invalid states (incl. holds above balances, contradictory capture links) are 422". The case memory says the same ("corrupted idempotency records: refuse with 422").
- **Steps (a):**
  1. Create an authorisation, then a non-final capture of 500.
  2. Take `GET /_test/export` and delete `state.authorizations`.
  3. `POST /_test/import`.
- **Actual (a):** 204.
  - The capture payment's `authorization_id` is silently rewritten to `null` in `/activity`, so an imported monetary record is changed.
  - The capture idempotency record for the now-missing authorisation is kept. Replaying `POST /authorizations/{id}/capture` with the same key and body gives 200 with a payment whose `authorization_id` names no authorisation, while a fresh capture on that id gives 404.
  - The same happens with a stage-1-shaped export where a payment carries `"authorization_id":"a_ghost"`.
- **Steps (b):** in the export, edit the capture idempotency record's `response.body.payment_id` to `"p_ghost"` and its `amount` to 999999, then import.
- **Actual (b):** 204. The replay returns 200 with a receipt for `p_ghost`, amount 999999, a payment that does not exist.
- **Further cases accepted with 204:**
  - a capture idempotency scope pointing at `a_missing`;
  - a fingerprint that disagrees with the stored response;
  - a stored response `expires_at` of year 10000.
- **Expected:** 422 `validation_failed` with the destination unchanged, in every case above.
- Case (b) is also present in the accepted stage-1 build, for `POST /payments` records. It is carried over, not new.

## F4 (blocking): horizontal scrolling at 375 px once balances reach 10,000,000.00 EUR
- **Row:** S2-018: "clear and usable at a 375 CSS-pixel viewport ... without horizontal page scrolling."
- **Steps:** reset ada with balance 1000000000 (EUR, 2 minor units). Sign in at a 375×800 viewport and open `/`.
- **Expected:** `scrollWidth` ≤ 375.
- **Actual:** `scrollWidth` grows with the balance:

  | Balance | scrollWidth (px) |
  |---|---|
  | 10,000,000.00 EUR | 397 |
  | 1,000,000,000 JPY | 382 |
  | 1,000,000,000.000 BHD | 477 |
  | 2^53−1 minor units | about 548 |

  The `wallet-available` headline and the `wallet-balance` row overflow their card. 5,000,000.00 EUR still fits. `/requests`, `/split` and `/authorizations` showed no overflow even with 1,000,000.000 BHD items, 200-character unbroken notes and 20-character handles; at desktop width nothing overflows.
- These balances are legal: one payment may be up to 1000000000 minor units.

## F5 (non-blocking): an imported service clock in year 9999 stamps new records in 9999
- **Rows:** S1-158 ("invalid state ... 422") and S2-102.
- **Steps:** set the export's `state.last_timestamp_ms` to 253402300799000 (or 253402300000000) and import (204). Then call `POST /authorizations` and `POST /payments`.
- **Actual:**
  - New records get `created_at` 9999-12-31T23:59:59.000+00:00 (or 23:46:40), although the real time is 2026.
  - The new authorisation's `expires_at` is clamped to 23:59:59.999, so it is not `created_at` + TTL.
  - An authorisation can come out with `created_at` equal to `expires_at` but status `open`.
- Output is still valid RFC 3339 and nothing returns 5xx. It needs a tampered export, which is why I rate it non-blocking.
- A tampered `created_at_ms` later than `expires_at_ms` is also accepted.

## F6 (non-blocking, judged quality): a raw technical message appears on screen
- **Row:** S2-017: "Format people, amounts and timestamps for people first".
- **Steps:** on `/authorizations`, enter `0` in `authorization-capture-amount-{id}` and click capture.
- **Actual:** `authorization-error` reads "Amount must be 1 to 1.7976931348623157e+308. The list has been updated." This is the API message passed through. The pay form's refusal for 0 is phrased for people.
- The request is correctly refused, so this is not a behaviour defect.

## Rows probed and found sound
- **Authorize, S2-100..S2-108:**
  - Amount boundaries: 0, 1, 1e9, 1e9+1 and −0.
  - Number spellings: `1.0`, `1e3`, `0.1e1` and `10e-1` are accepted. These are refused: near-integers (1.0000000000000001, 1000000000.0000000001), 2^53+1, 1e400, strings, booleans, null, `[]` and `{}`.
  - Wrong-type `to_handle` gives 400; a missing one gives 422.
  - Notes of 200 and 201 characters, also as emoji and as combining characters.
  - Bad visibility values.
  - Error precedence: validation before funds; self and unknown handle before funds.
  - Extra fields are ignored.
  - Open authorisations stay out of `/activity`.
- **Idempotency, S2-089 and the S1-084..094 family on the new paths:**
  - Replays with `500.0` and `5e2`: 200 with the identical body.
  - A different body, or an invalid body on a claimed key: 409.
  - A key can be reused after a 409 or 404 refusal.
  - Key length 255 is accepted and 256 refused; an empty key gives 400.
  - 401 comes before 400.
  - Keys are scoped per user; the same key on another path is a new request.
  - Replay after a void still gives 200.
  - Paths spelled differently replay: trailing slash, percent-encoded id, `//`.
  - 20 concurrent same-key requests give exactly one 201 on both authorize and capture.
- **Capture and void, S2-109..S2-134:**
  - Amount rules and `final` type rules (400).
  - `exceeds` is judged against the remaining amount.
  - Omitted amount after a partial capture.
  - Non-final up to the remainder closes the authorisation; a final partial releases the rest.
  - `payment_ids`, `payment_id` and `remaining_amount` are correct.
  - `{"amount":700}` vs `{"amount":700,"final":true}` on one key gives 409.
  - Void after a partial; void twice; void of a captured authorisation gives 409.
  - Parties: payer, third party and receiver; unknown id gives 404.
  - 30 parallel partial captures never exceed the authorised amount.
  - A capture/void race, 15 rounds: one winner each time, totals conserved.
  - Captured payments copy note and visibility, and private ones are hidden from third parties.
- **Expiry, S2-097, S2-098, S2-126, S2-133, S2-138:**
  - 1–3 s TTLs: capture at 0.8–1.05 s gives 201 before expiry and `authorization_expired` after.
  - A write sees expiry first.
  - Expiry after a partial capture keeps the capture records.
  - `status=expired` and `status=open` filters.
  - Expired: payer and third party get 403; a replay of an earlier capture gives 200; void gives 409.
- **Fixture, S2-090..S2-096, S2-167:**
  - TTL forms: 0, −1, 1.5, "600", true and null are refused; 1.0 and 1e3 are accepted.
  - Contradictory seeds: status `expired` with a future expiry, and `open` with a past expiry, are both read as expired everywhere.
  - Holds: a sum equal to the balance is accepted, one more unit gives 422.
  - `expires_at` accepted: Z, a +05:30 offset, sub-millisecond digits, and offsets that cross midnight.
  - `expires_at` refused: 30 February, 24:00, a leap second, year 10000, a missing offset, lowercase `t`, a space instead of `T`.
  - Ids of 64/65 characters, duplicate ids, unknown or equal parties.
  - Near-integer amounts written as raw JSON text are refused.
  - Extra fields are ignored; `authorizations` may be omitted.
  - **Open item: pre-1970 `expires_at` is refused.** `1969-12-31T23:59:59Z` and `1970-01-01T08:00:00+09:00` get 422, though they are valid RFC 3339. The case memory lists this pattern; the impact is low, so I did not list it as a separate finding.
- **List, S2-135..S2-139, S2-166:**
  - Direction, status, limit and offset bounds; `+3`, `3.0`, `1e1` and empty values give 422.
  - `has_more` at the boundaries; combined filters; repeated parameters.
  - Only the caller's own authorisations are returned.
- **Funds, S2-080..S2-088 and S2-099:**
  - Payments, request pay, authorizations and settlement net debits are all judged against `available`.
  - Captures may spend held money.
  - Splits are unchanged; payments without an authorisation carry `authorization_id: null`; totals are conserved.
- **Content negotiation, S2-009 and S2-140:** various `Accept` values, with and without a token.
- **Limits, S1-013 and S1-073:**
  - Reset with 1200 users, 20000 authorisations and 5000 payments (8.4 MB) took 3.4 s.
  - 150 mixed requests, 50 in flight: maximum 0.04 s.
  - A 10.5 MB export imported in 0.21 s.
  - Deep nesting and a 64 KB header gave no 5xx.
- **Upgrade, S2-078, S2-079, S2-162..S2-164, S2-168:**
  - A stage-1 export with tokens, a lost payment, a split, a settlement and request-pay replays imports into stage 2. All five replay to identical bodies.
  - Tokens and login work, pending and split requests are payable, the default TTL of 600 applies, and new authorizations work.
  - Tampered stage-1 exports are refused with 422: id > 64, bad email, huge or year-10000 timestamps, a paid request set back to pending, split shares not summing.
  - Browser, D2-1 path: a lost payment on the stage-2 page, then export/import under it. The page stays signed in, the retry uses the same key and body and recovers the original payment once, and the imported request is paid from `/requests` without a reload.
  - Browser, extra path: the page's API calls proxied to the stage-1 service, the payment lost there, then the stage-1 export imported into stage 2. The retry recovers the original payment and refreshes the balance.
- **Screens:**
  - **Decimal input** in pay, request, authorize, split and capture forms, for EUR, JPY and BHD:
    - Converted correctly: `15`, `15.00`, `15.5`, `0.29`, `1.15`, `4.35`, `8.17`.
    - Refused with no request sent: `15.005`, `abc`, `1e3`, `15,00`, empty, `.5`, `5.`, `+5`, `-5`, full-width digits, `0x10`, `NaN`, JPY `15.0`, BHD `1.2345`.
  - **Repeat submission:** a double click or Enter pressed twice pays once. After success, editing a field and restoring it gives a new payment, per the ruling; changing visibility gives a new payment.
  - **Uncertain outcomes:**
    - A lost response before or after commit, or a 500/502/503/504 reply, shows `pay-uncertain`, not `pay-error`.
    - The retry keeps the same key and body, also after edit-and-restore, after a refresh, and after two lost responses in a row.
    - Money moves once.
  - **Refused payments:** a payment refused after spending elsewhere, or because of held funds, shows `pay-error`, refreshes the balance and feed, and keeps every input.
  - **Latest refresh wins:** a delayed `/me`, `/activity` or both, and a stale read arriving after a pay, never overwrite the newer data.
  - **Slow writes:** the reads wait for the write to finish.
  - **Stale buttons:**
    - Request pay after the request was cancelled, paid or declined elsewhere, and cancel after it was declined elsewhere: `request-error` appears and the stale button disappears.
    - Capture after expiry or after a void elsewhere: `authorization-error` appears.
  - **Authorizations screen:** DOM order, `data-status`, exact amount and expiry text, `authorization-captured-{id}` only on captured items, the capture prefill shows the remaining amount, and capture and void buttons appear only for the right party.
  - **Wallet:** available, held and total values with `data-amount`; `wallet-held` absent when zero.
  - **Lists over 200 items:** activity, requests and authorizations follow paging (230 items each).
  - **Signup and login:**
    - Every signup error appears in `auth-error`.
    - Handle derivation is per character, including emoji, truncated to 20.
    - `current-user` and `current-handle` appear on every screen.
    - Logout works.
    - Signed-out routes redirect to login.
    - A token invalidated by a reset goes to login.
  - **Empty states:** activity, requests and authorizations each show their own message.
