# Stage 2 — requirement list

Source: `pocketful/spec/stage-2.md` (read-only), which builds on `stage-1.md`. One row per testable
requirement. Status values: open, tested, passing, failing, disputed, not testable (with the reason).
Tests are named `file::function` under `work/acceptance/tests/stage_2/`. "judged" rows are product
qualities with no single observable rule; they are checked where a measurable proxy exists and are
otherwise left to the product-designer's screen review.

## Stage 1 rows this stage changes

All stage-1 rows still apply and the stage-1 suite runs against every stage-2 build. These rows gain
stage-2 behaviour; their stage-1 tests still hold because they only run with no open holds.

| Stage-1 row | Change in stage 2 | Covered by |
|---|---|---|
| S1-001 | the invariant is over wallet `total` values (S2-080) | S2-080 |
| S1-002 | `available = total − held` is never negative (S2-081) | S2-081 |
| S1-052 | fixture gains `authorization_ttl_seconds` and `authorizations` (S2-090..S2-096) | S2-090..S2-096 |
| S1-084 | seven idempotent write paths, not five (S2-089) | S2-089 |
| S1-095 | `GET /me` gains `total`, `available`, `held` (S2-084, S2-099) | S2-084, S2-099 |
| S1-096 | payments gain `authorization_id` (S2-113) | S2-113 |
| S1-098, S1-116, S1-179 | `insufficient_funds` is judged against `available` (S2-086) | S2-086 |
| S1-126 | `GET /requests` with `Accept: text/html` returns the UI (S2-009) | S2-009 |
| S1-161 | export/import also preserves authorisations, holds and captures, and accepts a stage-1 export (S2-078, S2-158) | S2-078, S2-158 |

## Intro and routes

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-001 | "The stage-1 requirements continue to apply, with the additions below." | stage | | open |
| S2-002 | "`/` \| Balance, pay form, request form and the activity feed" | routes | | open |
| S2-003 | "`/requests` \| Incoming and outgoing requests, with pay, decline and cancel" | routes | | open |
| S2-004 | "`/split` \| Split form" | routes | | open |
| S2-005 | "`/signup` \| Signup" | routes | | open |
| S2-006 | "`/login` \| Login" | routes | | open |
| S2-007 | "Other screens must be reachable through the UI." (`/authorizations` from the navigation) | routes | | open |
| S2-008 | "Server-side and client-side rendering are both permitted." | routes | — | not testable: states a freedom |
| S2-009 | "The browser and the API share `/requests`. Return the UI for `Accept: text/html`; API requests without that header receive JSON." | routes | | open |
| S2-010 | "The UI must expose the `data-testid` attributes listed below" | routes | | open |

## Product and visual direction

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-011 | "feel like a coherent, presentation-ready consumer finance product, not a test harness with controls attached. Aim for a calm, trustworthy character." | quality | — | not testable: judged (product-designer screen review) |
| S2-012 | "Available funds must be the clearest monetary value once holds exist, with total and held funds visibly secondary." | quality | | open |
| S2-013 | "status, direction, privacy and money movement should be understandable without interpreting raw API data." | quality | | open |
| S2-014 | "Use a consistent visual system for typography, spacing, colour, controls and feedback." | quality | — | not testable: judged (product-designer screen review) |
| S2-015 | "Primary actions must be easy to identify." | quality | — | not testable: judged (product-designer screen review) |
| S2-016 | "Available, held, pending, loading, successful, refused and uncertain states must be visually distinct" | quality | | open |
| S2-017 | "Format people, amounts and timestamps for people first; expose technical identifiers only where they help the user." | quality | | open |
| S2-018 | "clear and usable at a 375 CSS-pixel viewport and at conventional desktop widths, without horizontal page scrolling." | quality | | open |
| S2-019 | "Inputs need visible labels" | quality | | open |
| S2-020 | "keyboard focus must be apparent" | quality | | open |
| S2-021 | "text and controls need sufficient contrast." (decision D2-3: WCAG AA 4.5:1 for text) | quality | | open |
| S2-022 | "Provide considered empty, loading and error states" | quality | | open |
| S2-023 | "keep navigation consistent across the required routes." | quality | | open |
| S2-024 | "A custom illustration, brand asset or exact visual match to a reference is not required." | quality | — | not testable: states a freedom |

## Signup and login

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-025 | "`signup-email`, `signup-password`, `signup-display-name` \| Inputs"; "`signup-submit` \| Button" | auth UI | | open |
| S2-026 | "`login-email`, `login-password`, `login-submit` \| Inputs and button" | auth UI | | open |
| S2-027 | "`auth-error` \| Error message. Present only when there is one" | auth UI | | open |
| S2-028 | "`current-user` \| Visible on every screen when signed in. Text contains the display name" | auth UI | | open |
| S2-029 | "`current-handle` \| Text is exactly the caller's handle, with no `@` and no surrounding words" | auth UI | | open |
| S2-030 | "`logout-button` \| Button" (signs the user out) | auth UI | | open |

## Balance and pay — `/`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-031 | "`wallet-balance` \| Text is exactly the formatted amount. Carries `data-amount="{minor units}"`" | wallet UI | | open |
| S2-032 | "`pay-handle`, `pay-amount`, `pay-note` \| Inputs. `pay-amount` is a **decimal** string as a person would type it" | pay UI | | open |
| S2-033 | "`pay-visibility` \| Selects `public` or `private`. Option values are those two strings" | pay UI | | open |
| S2-034 | "`pay-submit` \| Button" (sends the payment) | pay UI | | open |
| S2-035 | "`pay-error` \| Error message, when the payment is refused — including insufficient funds" | pay UI | | open |
| S2-036 | "`request-handle`, `request-amount`, `request-note`, `request-submit` \| The request form" | request UI | | open |
| S2-037 | "`request-error` \| Error message, when the request is refused" | request UI | | open |
| S2-038 | "Keep the pay form's values after success." | pay UI | | open |
| S2-039 | "Submitting it again without changing a field must not send another payment: `wallet-balance` falls once, the feed contains one payment and `pay-error` is absent." | pay UI | | open |
| S2-040 | "Changing a field makes the next submission a new payment request." | pay UI | | open |
| S2-041 | "Retries follow §7." | pay UI | | open |
| S2-042 | "`wallet-balance` is the decimal with exactly `minor_units` decimal places, a single space, then the currency code: `100.00 EUR`. For a `minor_units` of `0` there is no decimal point at all: `1200 JPY`. Balances are never negative, so there is no sign." | format | | open |
| S2-043 | "With `minor_units: 2`, `15.00` and `15` both submit `1500`; `15.5` submits `1550`." | amount input | | open |
| S2-044 | "Nonnumeric input or more than `minor_units` decimal places must show the form's error element without sending a request. For example, `15.005` is rejected rather than rounded." | amount input | | open |

## Activity feed — `/`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-045 | "`activity-list` \| Container. Its children are newest first in the DOM"; "Two payments with equal timestamps may appear in either order." | feed UI | | open |
| S2-046 | "`activity-item-{payment_id}` \| One per visible payment. Carries `data-visibility="public"` or `data-visibility="private"`" | feed UI | | open |
| S2-047 | "`activity-parties-{payment_id}` \| Text contains both handles" | feed UI | | open |
| S2-048 | "`activity-amount-{payment_id}` \| Text is exactly the formatted amount" | feed UI | | open |
| S2-049 | "`activity-note-{payment_id}` \| Text is exactly the note. Present even when the note is empty" | feed UI | | open |
| S2-050 | "`empty-activity` \| Shown instead of the list when nothing is visible" | feed UI | | open |

## Requests — `/requests`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-052 | "`incoming-list`, `outgoing-list` \| Containers" | requests UI | | open |
| S2-053 | "`request-item-{request_id}` \| One per request. Carries `data-status="{status}"`" | requests UI | | open |
| S2-054 | "`request-amount-{request_id}` \| Text is exactly the formatted amount" | requests UI | | open |
| S2-055 | "`request-pay-{request_id}` \| Button. Present only on a `pending` incoming request" | requests UI | | open |
| S2-056 | "`request-decline-{request_id}` \| Button. Present only on a `pending` incoming request" | requests UI | | open |
| S2-057 | "`request-cancel-{request_id}` \| Button. Present only on a `pending` outgoing request" | requests UI | | open |
| S2-058 | "`request-error` \| Shown when a pay, decline or cancel is refused" | requests UI | | open |
| S2-059 | "`empty-requests` \| Shown when both lists are empty" | requests UI | | open |

## Split — `/split`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-060 | "`split-amount` \| Decimal input, same rule as `pay-amount`" | split UI | | open |
| S2-061 | "`split-handles` \| Text input: handles separated by commas, in order" | split UI | | open |
| S2-062 | "`split-note`, `split-submit` \| Input and button" | split UI | | open |
| S2-063 | "`split-preview` \| Shows the computed shares before submitting. Contains one `split-share-{handle}` per participant" | split UI | | open |
| S2-064 | "`split-share-{handle}` \| Text is exactly the formatted share amount" | split UI | | open |
| S2-065 | "`split-error` \| Error message, when the split is refused" | split UI | | open |
| S2-066 | "`split-preview` must show the shares the server would compute, by the rule in `stage-1.md` §9, before anything is posted. The preview and submitted split must have identical shares." | split UI | | open |

## Refresh after actions

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-067 | "After any successful action, the balance, the feed and the request lists on the same page must show the new state without a manual reload." | refresh | | open |
| S2-068 | "Navigation must wait for the write to succeed before it refreshes the data." | refresh | | open |
| S2-069 | "**There is no live-update requirement here**" | refresh | — | not testable: states a freedom |

## Competing clients and uncertain outcomes

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-070 | "Add `wallet-refresh`, a button on `/` that refreshes the balance and feed without clearing the pay form." | refresh | | open |
| S2-071 | "**Latest refresh wins:** a delayed earlier read must not overwrite a later refresh, including when responses arrive out of order." | refresh | | open |
| S2-072 | "A refused payment shows `pay-error`, refreshes the balance/feed, and preserves all pay inputs." | competing | | open |
| S2-073 | "A request cancelled elsewhere while its pay button is visible must show `request-error` when payment is refused and refresh the request list so the stale pay button disappears." | competing | | open |
| S2-074 | "If a payment response is lost, including after `POST /payments` commits, show `pay-uncertain` (nonempty text), not `pay-error`. Keep the unchanged form retryable with the **same key and body**." | uncertain | | open |
| S2-075 | "Successful retry removes both error/uncertainty elements, refreshes the balance and feed, and moves money exactly once. Unknown outcomes are not confirmed rejections." | uncertain | | open |
| S2-076 | "No background polling, live synchronization, or recovery across page reloads is required." | uncertain | — | not testable: states a freedom |
| S2-077 | "The same balance refresh rules apply to the available and held amounts introduced below." | refresh | | open |

## Existing clients after an upgrade

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-078 | "A stage-2 service must accept an export produced by the same team's stage-1 service." | upgrade | | open |
| S2-079 | "A browser signed in before that export/import upgrade must remain signed in afterwards." (decision D2-1) | upgrade | | open |
| S2-162 | "A payment whose response was lost before export remains retryable after import with the same body and key; the UI must recover the original payment and refresh the imported balance." | upgrade | | open |
| S2-163 | "Existing pending requests remain payable through the request screen." | upgrade | | open |
| S2-164 | "No page reload or new screen is required. The form and pending retry identity must survive the upgrade." | upgrade | | open |

## Authorisations and captures — invariants and changed API

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-080 | "The sum of all wallet `total` values always equals the total seeded by the last reset. A hold moves no money" | holds | | open |
| S2-081 | "`available = total − held` must never be negative. Held funds cannot fund new payments, authorizations or settlement net debits." | holds | | open |
| S2-082 | "Captures may spend the money reserved for them." | holds | | open |
| S2-083 | "Cumulative captures must not exceed the authorized amount. Each idempotent capture moves money once. A closed hold cannot be captured again." | holds | | open |
| S2-084 | "`GET /me` keeps `balance`, and `balance` **equals `total`**. `available` and `held` are new fields beside it. With no open holds, `balance`, `total` and `available` agree and `held` is zero" | me | | open |
| S2-085 | "`POST /payments` remains an immediate transfer. It must not leave an intermediate hold or require a separate capture." | payments | | open |
| S2-086 | "Every `409 insufficient_funds` in stage 1 — on `POST /payments`, `POST /requests/{id}/pay` and settlements — is now evaluated against `available`." | holds | | open |
| S2-087 | "Paying a request remains immediate. Authorizing a request is out of scope." | requests | | open |
| S2-088 | "`POST /splits` is unchanged." | splits | | open |
| S2-089 | "There are now seven idempotent write paths: stage 1's five, authorizations and captures. The same replay rules apply independently to each." | idempotency | | open |

## Model and fixture

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-090 | "`authorization_ttl_seconds` applies to every authorisation created through the API. It defaults to 600 when omitted." | fixture | | open |
| S2-091 | "If supplied, it must be a positive integer number of seconds." (otherwise reset 422, decision D3) | fixture | | open |
| S2-092 | "Seeded authorisations carry their own absolute `expires_at` instead." | fixture | | open |
| S2-093 | "A user's seeded `balance` is still `total`. **`available` is derived, never seeded** — the service subtracts the seeded open holds itself." | fixture | | open |
| S2-094 | "A sum of seeded unexpired open holds larger than that user's `balance` is a reset error: `422 validation_failed` from `POST /_test/reset`, changing nothing" | fixture | | open |
| S2-095 | "Seeded `status` is `open`, `captured`, `voided` or `expired`. Only `open` holds anything." | fixture | | open |
| S2-096 | "An earlier fixture may omit `authorizations` altogether; omission means an empty list." | fixture | | open |
| S2-097 | "An authorization whose `expires_at` is at or before now is `expired` and holds no funds. Reads and writes must reflect expiry even if no request occurred at the deadline. `GET /authorizations` must show `status: "expired"`, and `GET /me` must include the released remainder in `available`." | expiry | | open |
| S2-098 | "Seeded expiry times are at least an hour from reset time, in the past or future; newly created authorizations may have shorter lifetimes." | expiry | | open |

## API

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-099 | "`balance` and `total` are always equal. `held` is the sum of open holds, and `available` is `total − held`, never negative." (`GET /me` shape) | me | | open |
| S2-100 | "`POST /authorizations`: `Idempotency-Key` is required. The caller is the payer." "`note` and `visibility` are optional with the same defaults as `POST /payments`." | authorize | | open |
| S2-101 | 201 body: authorization_id, from_user_id, from_handle, to_user_id, to_handle, amount, captured_amount 0, currency, note, visibility, status open, expires_at, payment_id null, created_at (+ remaining_amount, S2-121) | authorize | | open |
| S2-102 | "`expires_at` is `created_at` plus `authorization_ttl_seconds`." | authorize | | open |
| S2-103 | "The caller's `available` is below `amount` \| 409 `insufficient_funds`" | authorize | | open |
| S2-104 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (authorize) | authorize | | open |
| S2-105 | "`to_handle` is the caller's own handle \| 422 `self_payment`" (authorize) | authorize | | open |
| S2-106 | "`note` over 200 characters, or `visibility` neither `public` nor `private` \| 422 `validation_failed`" | authorize | | open |
| S2-107 | "No user has that handle \| 404 `not_found`" (authorize) | authorize | | open |
| S2-108 | "An open authorisation is **not** a feed item and never appears in `GET /activity`." | authorize | | open |
| S2-109 | "`POST /authorizations/{id}/capture`: `Idempotency-Key` is required. Only the receiver (the `to` party) may capture." | capture | | open |
| S2-110 | "`amount` is optional and defaults to the authorisation's remaining amount." | capture | | open |
| S2-111 | "**a replay must send the identical body** — `{}` and `{"amount": 2000}` are different JSON values ... reusing a key across the two is 409 `idempotency_key_reuse`" | capture | | open |
| S2-112 | "Returns `201` with the created **payment**, in exactly the shape `POST /payments` returns, with `authorization_id` set to this authorisation and `request_id: null`. The payment's `amount` is the captured amount; its `note` and `visibility` are copied from the authorisation; it appears in the activity feed by the ordinary visibility rule." | capture | | open |
| S2-113 | "Payments created without an authorisation carry `authorization_id: null`; their existing `request_id` semantics are unchanged." | capture | | open |
| S2-114 | "By default the authorisation becomes `captured`, carries `captured_amount` and `payment_id`, and **releases the uncaptured remainder immediately**" | capture | | open |
| S2-115 | "**Default: one final capture per authorisation.** A second capture after a final capture is `409 authorization_not_open`." | capture | | open |
| S2-116 | "send `{"amount": 700, "final": false}` ... With `final: false` and an uncaptured remainder, status stays `open`; further captures are allowed up to that remainder." | capture | | open |
| S2-117 | "Capturing the entire remainder closes it even with `final: false`." | capture | | open |
| S2-118 | "A final capture closes it and releases any remainder." (also after earlier non-final captures) | capture | | open |
| S2-119 | "`capture_exceeds_authorization` compares with the **remaining** amount; omitted amount defaults to that remainder." | capture | | open |
| S2-120 | "`captured_amount` is cumulative; `payment_id` is the latest capture; `payment_ids` lists every capture in order." | capture | | open |
| S2-121 | "Every authorization response adds `remaining_amount`: the amount still held, zero when closed." | capture | | open |
| S2-122 | "Void and expiry can close a partially captured authorization, release only the remainder, and preserve all capture records." | capture | | open |
| S2-123 | "New fields do not change idempotency body equality." (decision D2-4) | capture | | open |
| S2-124 | "`final` is boolean, default `true`, so earlier single-capture requests retain their behavior." (wrong type → 400, §5) | capture | | open |
| S2-125 | "The authorisation is not `open` \| 409 `authorization_not_open`" | capture | | open |
| S2-126 | "`expires_at` is at or before now \| 409 `authorization_expired`" | capture | | open |
| S2-127 | "`amount` above the authorisation's uncaptured remainder \| 422 `capture_exceeds_authorization`" | capture | | open |
| S2-128 | "`amount` below 1, or not an integer \| 422 `validation_failed`" (capture) | capture | | open |
| S2-129 | "The caller is not the receiver \| 403 `forbidden`" | capture | | open |
| S2-130 | "Unknown authorisation \| 404 `not_found`" | capture | | open |
| S2-131 | "**Only the payer may void** ... No idempotency key" "`200` with the authorisation, `status: "voided"`, the hold released." | void | | open |
| S2-132 | "Voiding an already-voided authorisation is `200` with the current state." | void | | open |
| S2-133 | "A `captured` or `expired` one is `409 authorization_not_open`." (void) | void | | open |
| S2-134 | "capture and void return 403 `forbidden` when the caller is not the permitted party, including callers who are neither party." | void | | open |
| S2-135 | "`GET /authorizations` returns only authorizations involving the caller." | list auths | | open |
| S2-136 | "Authorisations where the caller is the payer or the receiver, and no others. Newest first by `created_at`." | list auths | | open |
| S2-137 | "`direction` is `outgoing` (the caller is the payer), `incoming` (the caller is the receiver), or absent for both." | list auths | | open |
| S2-138 | "`status` is one of the four statuses, or absent for all. An authorisation expired by the clock matches `expired`, never `open`." | list auths | | open |
| S2-139 | "`limit`, `offset` and `has_more` behave exactly as on `GET /requests`." | list auths | | open |

## UI — authorisations and wallet

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-140 | "The UI and the API share `/authorizations`: serve HTML for `Accept: text/html` and JSON otherwise" | routes | | open |
| S2-141 | "`wallet-balance` \| Formatted `total`, retaining the existing display and `data-amount`" | wallet UI | | open |
| S2-142 | "`wallet-available` \| Formatted `available`, with `data-amount`. **Present this as the headline number**" | wallet UI | | open |
| S2-143 | "`wallet-held` \| Formatted `held`, with `data-amount`. Absent when `held` is zero" | wallet UI | | open |
| S2-144 | "`authorize-handle`, `authorize-amount`, `authorize-note`, `authorize-visibility`, `authorize-submit` \| The authorise form. Same input rules as the pay form" | auth form UI | | open |
| S2-145 | "`authorize-error` \| Shown when the authorisation is refused, including insufficient available funds" | auth form UI | | open |
| S2-146 | "`authorization-list` \| Container on `/authorizations`. Children newest first in the DOM" | auths UI | | open |
| S2-147 | "`authorization-item-{authorization_id}` \| Carries `data-status="{status}"`" | auths UI | | open |
| S2-148 | "`authorization-amount-{id}` \| Text is exactly the formatted authorised amount" | auths UI | | open |
| S2-149 | "`authorization-captured-{id}` \| Formatted captured amount. Present only when `status` is `captured`" | auths UI | | open |
| S2-150 | "`authorization-expires-{id}` \| Text is the RFC 3339 `expires_at`" | auths UI | | open |
| S2-151 | "`authorization-capture-amount-{id}` \| Decimal input, pre-filled with the remaining amount. Present only on an incoming `open` authorisation" | auths UI | | open |
| S2-152 | "`authorization-capture-{id}` \| Button. Present only on an incoming `open` authorisation" | auths UI | | open |
| S2-153 | "`authorization-void-{id}` \| Button. Present only on an outgoing `open` authorisation" | auths UI | | open |
| S2-154 | "`authorization-error` \| Shown when a capture or a void is refused" | auths UI | | open |
| S2-155 | "`empty-authorizations` \| Shown when the list is empty" | auths UI | | open |
| S2-156 | "The UI must reflect seeded and newly created holds. Show available funds as the user's spending balance, including immediately after reset with open holds." | wallet UI | | open |

## Concurrency and state

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-157 | "Concurrent requests must produce the same results as executing them one at a time in some order, and the requirements above hold at every read." | concurrency | | open |
| S2-158 | §10 continues to apply to the new state: export/import preserves authorisations (status, amounts, captures, `expires_at`), holds and the capture/authorize idempotency records; invalid states (incl. holds above balances, contradictory capture links) are 422 | import | | open |

## Decisions (test-designer, stage 2)

Stage-1 decisions D1–D12 still apply.

- **D2-1 Signed-in browser across an upgrade.** The page can only hold a session that the service it
  talks to knows. The upgrade test therefore runs in two halves. (a) API: a stage-1 export,
  including its tokens, pending requests and a payment whose response was ignored, is imported
  into stage 2; the tokens work, the requests are payable, and a retry with the same key and body
  returns the original payment. (b) Browser: a page signed in to stage 2, with a lost payment
  pending, keeps working without a reload after the service's state is exported and imported back
  under it. It is still signed in, the request screen pays an imported pending request, and the
  unchanged pay form recovers the original payment.
- **D2-2 Expiry boundary.** "at or before now" is tested with lifetimes of 1–3 s and waits past
  them. No test depends on sub-second timing.
- **D2-3 Contrast.** "sufficient contrast" is measured as WCAG 2 AA: 4.5:1 for the text of the
  elements named by a `data-testid`, against their effective background.
- **D2-4 Capture body equality.** Request-body equality stays JSON-value equality (§7):
  `{"amount": 700}` and `{"amount": 700, "final": true}` are different bodies (409 on key reuse), as
  `{}` and `{"amount": 2000}` are. New *response* fields do not affect replays.
- **D2-5 Capture of an expired authorisation.** A clock-expired authorisation answers capture with
  409 `authorization_expired`. One seeded as `expired` may answer 409 `authorization_expired` or 409
  `authorization_not_open`, because both rows describe it.
- **D2-6 Visible label.** An input's label is visible text associated with it (`<label for>`, a
  wrapping `<label>`, or `aria-labelledby` pointing at visible text). A placeholder or `aria-label`
  alone is not a visible label.
- **D2-7 Amount forms.** A "decimal string as a person would type it" is digits with an optional
  `.` and fraction. `15,00`, `abc`, `1e3` and an empty field are nonnumeric. Surrounding
  whitespace is not tested.
- **D2-8 Visual distinction (S2-016).** Checked as: `pay-error` and `pay-uncertain` differ in computed
  colour, background or border; `wallet-available` and `wallet-held` differ in size or weight. The
  rest is judged in screen review.
- **D2-9 S1-R17 kept.** No stage-2 requirement contradicts refusing a fixture whose total is above 2^53:
  every new rule bounds wallets, holds and captures individually or by `total`. The stage-1 ruling stands.
