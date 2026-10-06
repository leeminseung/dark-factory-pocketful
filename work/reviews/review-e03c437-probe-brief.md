# Review brief — black-box probe, revision e03c437 (stage 3)

## Task

Probe a running build of a stage-3 HTTP service through its HTTP interface only. Load and apply the `edge-cases`
skill, including its case-memory reference at `/Users/mslee/.claude-seat/skills/edge-cases/references/case-memory.md`.

For every row of the stage-3 requirement list below, try each kind of case the skill names that applies:
- boundaries, at the millisecond and below it;
- errors and their precedence;
- input forms;
- text;
- repetition and concurrency;
- parties;
- order and paging;
- time and timestamp formats, including offsets, sub-millisecond fractions, lowercase `t`/`z`, years 0000 and 9999,
  and future instants;
- limits at large history: 5 s per request, 10 s for reset, 50 requests in flight, 2 GiB of memory;
- survival across export/import, including snapshots and stage-1 and stage-2 exports.

Aim at what each row's listed tests do **not** exercise. Then probe the stage-1 and stage-2 rows for regressions,
giving priority to the cases in this run's case memory below.

Take the expected result from the requirement text only. Two rulings on the text apply:
- Statement snapshot tokens must survive an export/import of the service's own state, still bound to their owner.
  Edited snapshot state in an export must be validated like the rest of the state.
- `from` later than `to` on `GET /statement` is 422.

Rules:
- Use only HTTP against the addresses below. Do not read source code.
- `POST /_test/reset` with your own fixtures as often as you need.
- Do not stop or restart any container. If one stops answering, report that as a finding, with the request that
  preceded it.
- You may watch memory with `docker stats --no-stream pocketful-reviewer-e03c437-s3`.
- Write nothing to any file outside /tmp, and remove your /tmp files when done.
- Return your findings as your final answer.

## Case memory for this run (from work/case-memory.md, verbatim)

- Import an export after editing a record's id to more than the stated maximum length, or an email to a malformed
  value: import must refuse it the same way reset does. (Stage 1, S1-R1, round-1 review.)
- Retry an idempotent write at a path spelled differently but routed to the same resource (trailing slash,
  percent-encoded id): it must replay, not act again. (Stage 1, S1-R2, round-1 review.)
- Import an export with timestamps outside the formattable range (huge epoch values, year 10000), then read and write:
  no 5xx, no non-RFC 3339 output, and a failed write must not commit money or claim its key. (Stage 1, S1-R11 / F1,
  test-designer probe in round 2 and final review.)
- Import an export whose records contradict each other (a paid request set back to pending, links to missing records,
  split shares not summing to the total, corrupted idempotency records): refuse with 422; never let a request be paid
  twice. (Stage 1, S1-R12 / F2, test-designer probe in round 2 and final review.)
- Send amounts that are non-integers very close to an integer (1.0000000000000001, 1000000000.0000000001) and
  integers just above 2^53: must be refused, not rounded. Same for fixture balances. (Stage 1, S1-R13, S1-R14, final review.)
- Put a field in a fixture record that the fixture format does not define (e.g. a link id): it must be ignored, not
  read or rejected. (Stage 1, S1-R15, final review.)
- Reset with a large fixture (1000+ users, all distinct passwords) and send a login during it: reset must finish within
  its time limit and other requests within theirs. (Stage 1, S1-R16 / S1-013, final review and round-3 probe.)
- Reset with a configuration value (a lifetime or duration) just under its accepted bound, export, wait a few seconds,
  and import the unchanged export; also create records later and check derived timestamps are exact, never clamped.
  A bound that depends on the current time fails this. (Stage 2, S2-R10/S2-R11 / S2-102, round-2 probe and final review.)
- Page through a list that is longer than one page while another client writes between page reads: no row may appear
  twice. (Stage 2, S2-R12, final review.)
- Remove one newer-stage key from an export so it looks like an older-stage export: import must refuse it unless it
  really is the older format, not silently drop links. (Stage 2, S2-R13, final review.)
- Edit any single field of a stored idempotency receipt in an export (ids, amounts, notes, statuses, handles, nested
  records): import must refuse it; unedited exports with later legitimate state changes must still import and replay.
  (Stage 2, S2-R14 and F2 / S1-158 / S2-158, final review and round-3 probe; present since stage 1.)
- On a form with retry keys, after a confirmed success, edit a field and change it back, then submit: a new operation
  must be sent. (Stage 2, S2-R1, round-1 review.)
- Render the headline money figure at the largest legal balance in every currency at 375 px: no horizontal scroll.
  (Stage 2, S2-R15, final review.)

## The running builds

All three are built from revision e03c4371ebe434f0ebdc65d6b35c175d02c36417 and limited to 2 CPU and 2 GiB.

| Build | Address | Container | Built from |
|---|---|---|---|
| stage-3, under test | http://127.0.0.1:65161 | pocketful-reviewer-e03c437-s3 | `stage-3/` |
| stage-2 | http://127.0.0.1:65157 | pocketful-reviewer-e03c437-s2 | `stage-2/` |
| stage-1 | http://127.0.0.1:65155 | pocketful-reviewer-e03c437-s1 | `stage-1/` |

Use the stage-2 and stage-1 builds to produce real older-stage exports for the upgrade rows. Seed and act on them,
`GET /_test/export`, then `POST /_test/import` into the stage-3 build.

## Answer format

For each finding, give:
- the requirement row ID and the requirement sentence, quoted;
- the exact requests;
- the expected result (from the text) and the actual result;
- whether it is blocking, and why. A finding is blocking when it breaks a stated requirement.

End with a list of the rows you probed and found sound, with the kinds of case you tried.

## The requirements: the complete stage-3 specification, verbatim (stages 1 and 2 follow and still apply)

# Pocketful — Stage 3: statements and payment corrections

The requirements from stages 1 and 2 continue to apply, with the additions below.
Numbered section references such as §5 and §7 refer to `stage-1.md`.

Users can request historical balances and paginated statements. Senders can correct
eligible payments while preserving the original receipt. Historical queries must support
both the effective date of a payment and the information available at a specified time.

## Payment timestamps

Every payment's `created_at` is an RFC 3339 instant with an offset identifying when it
moved money. Every endpoint returning a payment includes it. `GET /activity` retains its
existing ordering by this field.

Seeded payments may supply `created_at`; omission uses reset time, before subsequent
API-created payments. A seeded `created_at` in the future gives `422 validation_failed`
from `POST /_test/reset`, with no state change.

A fixture's `balance` remains the balance after all seeded payments. Loading those
payments must not change that balance.

## `GET /me` as of an instant

```http
GET /me?as_of=2026-09-24T13:20:00%2B00:00
```

`as_of` is optional and is an RFC 3339 instant with an offset. Anything else — a naive local
time, a bare date, an empty value — is 422 `validation_failed`. Without temporal query
parameters the response retains the existing money fields and reports current corrected values.

With it, `balance` is the caller's balance as it stood at that instant: the balance after every
payment of theirs with `created_at` at or before `as_of`, and before every payment after it. A
payment made at exactly `as_of` counts as having happened.

- An `as_of` at or after the latest payment returns the current balance.
- An `as_of` before the earliest payment returns the opening balance — what the wallet held
  before anything moved.
- The response carries `as_of` back, exactly as given.

## `GET /statement`

```http
GET /statement?from=<instant>&to=<instant>&limit=50&offset=0
```

Both `from` and `to` are optional; `from` defaults to the opening of the wallet and `to` to now.
`limit` and `offset` behave exactly as in `GET /requests`.

Returns the payments the caller sent or received in the half-open window `[from, to)`, **oldest
first**, each with the caller's balance immediately after it:

This abbreviated example omits the revision fields and `snapshot` token described below.

```json
{ "opening_balance": 10000,
  "entries": [
    { "payment": { "...": "..." }, "delta": -500, "balance_after": 9500 },
    { "payment": { "...": "..." }, "delta": 1200, "balance_after": 10700 }
  ],
  "closing_balance": 10700,
  "has_more": false }
```

Statement requirements:

1. Entries are ordered by `created_at` ascending, then payment `id` ascending for ties.
2. `opening_balance` is the balance immediately before `from`. `closing_balance` is the
   balance immediately before `to`.
3. `opening_balance` plus all `delta` values in the full window must equal `closing_balance`.
   A sent payment has a negative `delta`; a received payment has a positive `delta`.
4. Pagination must not change an entry's `balance_after` or the window's opening and closing
   balances. These values describe the full window regardless of `limit` and `offset`.

Only payments sent or received by the caller appear in their statement, including when
other payments are public. The activity-feed visibility rules do not apply to statements.

## Effective time, recorded time, and corrections

The service must distinguish **when money took effect** from **when it learned that fact**.
Every payment has a revision history. Revision 1 has `amount` as originally paid and
`effective_at = recorded_at = created_at`. A seeded payment's supplied `created_at` is also
its original recorded/effective time; omission uses reset time. Opening balances equal
seeded ending balances minus the net effect of original seeded payments. Corrections must
not change those opening balances. New accounts open at zero. Seeded history is consistent
and nonnegative.

`POST /payments/{payment_id}/corrections` requires an idempotency key and the original sender.
An authenticated non-sender gets 403 `forbidden`; unknown payment gets 404. Body:

```json
{"expected_revision": 1, "amount": 400,
 "effective_at": "2026-09-20T12:00:00+00:00", "reason": "corrected amount"}
```

All fields are required. Revision is a positive integer; amount is an integer 0..1000000000
(zero reverses the entire payment); reason is a string of 1..200 characters; effective time
is an RFC 3339 instant not later than now. Invalid input is 422 `validation_failed`.
Correction changes neither parties nor visibility. It appends an immutable revision, returning
201 with `payment_id`, `revision`, `amount`, `effective_at`, server-assigned `recorded_at`,
and `reason`. Recorded times for one payment strictly increase. A stale expected revision
gives 409 `stale_revision`. Successful replay returns that original revision with 200 even
after newer revisions. Different body with the same key is 409 `idempotency_key_reuse`.

The difference from the previous amount moves between the **same two wallets** in the same
atomic step. Increasing the amount debits the original sender; decreasing it debits the
original receiver. A currently unaffordable debit gives 409 `insufficient_funds`. Otherwise,
if any user's corrected balance is negative at any effective-time boundary, return
409 `historical_overdraft`. Balances at a boundary include the combined effect of all
movements at that instant. Either failure preserves balances, revision history, statements
and idempotency state. The sum of balances must equal the seeded total in every historical view.

The original payment and every original idempotent response remain unchanged. `GET /activity`
continues to display the original payment; correction records are not new feed payments.
`GET /payments/{payment_id}/revisions` returns `{"revisions": [...]}` in revision order,
including revision 1 (`reason: ""`). Only the two parties can read it; a third party gets
404 even for a public payment. No token is 401.

`GET /me` and `GET /statement` accept optional `known_at`, an RFC 3339 instant with offset.
For each payment, select its latest revision recorded **at or before** `known_at`; if none
was yet recorded, that payment contributes nothing. Omission means everything known when the
read begins. Then apply selected revisions according to their **effective** times. `as_of`
retains its inclusive meaning; a statement retains its half-open window. Both query instants
may be in the future. Invalid/empty instants are 422. Echo supplied `known_at` exactly.

Statement ordering is now by selected `effective_at`, then payment id. Each entry retains
`payment`, `delta` and `balance_after`, and adds the selected `revision`, `effective_at` and
`recorded_at`. `payment.amount` is the selected amount for this statement. Zero-amount
revisions still appear as entries with zero delta. No correction is counted alongside the
revision it replaces. With no corrections and no `known_at`, previous behavior is unchanged.

## Stable statement pagination

Every first `GET /statement` response additionally returns an opaque `snapshot` token.
It freezes the caller's selected revisions, window, balances, entries and default `to` at
that read. `GET /statement?snapshot=<token>&limit=...&offset=...` pages that exact result,
even after payments or corrections. Only limit and offset may accompany a snapshot; supplying
`from`, `to` or `known_at` with it gives 422 `validation_failed`. Unknown token, another user's
token, or a token from before reset gives 404 `not_found`. Tokens last until reset. No storage
survival across container restarts is required. Paging changes neither balances nor entries;
the final partial page and offsets beyond the end must report `has_more` correctly.
Unrecognized query parameters remain ignored under stage 1's general rule.

A correction may move a payment into or out of a statement window. Existing snapshots
remain unchanged during concurrent payments or corrections. Concurrent corrections using
the same expected revision cannot both succeed.

## Settlement history

Stage-1 settlements retain their original receipts and privacy rules. Each member's original
revision uses its shared committed_at as both effective_at and recorded_at.
Single-payment corrections reject settlement members with 422 `linked_payment_immutable`.

A stage-3 service must accept exports produced by the same team's stage-1 or stage-2
service. The ledger must import and account for authorizations and captures. Captures are
immutable linked payments: a correction of a capture gives 422 `linked_payment_immutable`.

## Historical holds

For `GET /me?as_of=T&known_at=K`, all four money fields describe that same view:
`balance = total`, `available = total - held`. A hold starts at authorization creation;
nonfinal capture reduces it at capture time; final capture, void or expiry releases the
remainder at that event's time. Expiry takes effect at `expires_at`. Events other than clock
expiry are known at their
server-assigned event time. Once creation is known, the expiry deadline is known too.
For queries beyond now, an open hold expires at its deadline. Without `as_of`, use the instant
the request began. Authorizations expose `closed_at` (null while open; event time when closed).

Historical `total` follows stage-3 effective/recorded-time rules. A correction is rejected
with 409 `historical_overdraft` if it makes either total or available negative at any past
effective/event boundary, under the latest known revisions. Current unaffordable debits
still take precedence as `insufficient_funds`. Seeded open holds are assumed created at reset
unless `created_at` is supplied; seeded closed holds need not reconstruct a prior lifecycle.
`GET /statement` still contains money movements only: authorization, release and expiry are
not payments. Captures appear exactly once with their links. Old snapshots remain unchanged
after any lifecycle action or correction.

## Stage 2 specification (still applies), verbatim

# Pocketful — Stage 2: wallet screens and payment authorizations

The stage-1 requirements continue to apply, with the additions below. Numbered section
references such as §5 and §7 refer to `stage-1.md`.

Users can manage payments, requests and bill splits in a browser. They can also reserve
money for a recipient to collect later, in one or more captures.

The following screens must be reachable by URL. Other screens must be reachable through
the UI. Server-side and client-side rendering are both permitted.

| Route | Screen |
|---|---|
| `/` | Balance, pay form, request form and the activity feed |
| `/requests` | Incoming and outgoing requests, with pay, decline and cancel |
| `/split` | Split form |
| `/signup` | Signup |
| `/login` | Login |

The browser and the API share `/requests`. Return the UI for `Accept: text/html`; API requests
without that header receive JSON.

The UI must expose the `data-testid` attributes listed below for integration testing.
Additional elements are permitted, and the visual implementation is the team's choice subject
to the product-quality requirements below.

## Product and visual direction

The browser experience must feel like a coherent, presentation-ready consumer finance product,
not a test harness with controls attached. Aim for a calm, trustworthy character. Available funds
must be the clearest monetary value once holds exist, with total and held funds visibly secondary.
Payments, requests, splits and authorisations should be easy to scan, and status, direction,
privacy and money movement should be understandable without interpreting raw API data.

Use a consistent visual system for typography, spacing, colour, controls and feedback. Primary
actions must be easy to identify. Available, held, pending, loading, successful, refused and
uncertain states must be visually distinct as well as satisfying the behavioural requirements
below. Format people, amounts and timestamps for people first; expose technical identifiers only
where they help the user.

The required flows must remain clear and usable at a 375 CSS-pixel viewport and at conventional
desktop widths, without horizontal page scrolling. Inputs need visible labels, keyboard focus must
be apparent, and text and controls need sufficient contrast. Provide considered empty, loading and
error states, and keep navigation consistent across the required routes. A custom illustration,
brand asset or exact visual match to a reference is not required.

## Signup and login

| `data-testid` | Element |
|---|---|
| `signup-email`, `signup-password`, `signup-display-name` | Inputs |
| `signup-submit` | Button |
| `login-email`, `login-password`, `login-submit` | Inputs and button |
| `auth-error` | Error message. Present only when there is one |
| `current-user` | Visible on every screen when signed in. Text contains the display name |
| `current-handle` | Text is exactly the caller's handle, with no `@` and no surrounding words |
| `logout-button` | Button |

## Balance and pay — `/`

| `data-testid` | Element |
|---|---|
| `wallet-balance` | Text is exactly the formatted amount. Carries `data-amount="{minor units}"` |
| `pay-handle`, `pay-amount`, `pay-note` | Inputs. `pay-amount` is a **decimal** string as a person would type it, e.g. `15.00` |
| `pay-visibility` | Selects `public` or `private`. Option values are those two strings |
| `pay-submit` | Button |
| `pay-error` | Error message, when the payment is refused — including insufficient funds |
| `request-handle`, `request-amount`, `request-note`, `request-submit` | The request form |
| `request-error` | Error message, when the request is refused |

Keep the pay form's values after success. Submitting it again without changing a field
must not send another payment: `wallet-balance` falls once, the feed contains one payment
and `pay-error` is absent. Changing a field makes the next submission a new payment request.
Retries follow §7.

**Formatted amount.** `wallet-balance` is the decimal with exactly `minor_units` decimal places, a
single space, then the currency code: `100.00 EUR`. For a `minor_units` of `0` there is no decimal
point at all: `1200 JPY`. Balances are never negative, so there is no sign.

The form accepts decimal amounts and submits minor units to the API. With `minor_units: 2`,
`15.00` and `15` both submit `1500`; `15.5` submits `1550`. Nonnumeric input or more than
`minor_units` decimal places must show the form's error element without sending a request.
For example, `15.005` is rejected rather than rounded.

## Activity feed — `/`

| `data-testid` | Element |
|---|---|
| `activity-list` | Container. Its children are newest first in the DOM |
| `activity-item-{payment_id}` | One per visible payment. Carries `data-visibility="public"` or `data-visibility="private"` |
| `activity-parties-{payment_id}` | Text contains both handles |
| `activity-amount-{payment_id}` | Text is exactly the formatted amount |
| `activity-note-{payment_id}` | Text is exactly the note. Present even when the note is empty |
| `empty-activity` | Shown instead of the list when nothing is visible |

Two payments with equal timestamps may appear in either order.

## Requests — `/requests`

| `data-testid` | Element |
|---|---|
| `incoming-list`, `outgoing-list` | Containers |
| `request-item-{request_id}` | One per request. Carries `data-status="{status}"` |
| `request-amount-{request_id}` | Text is exactly the formatted amount |
| `request-pay-{request_id}` | Button. Present only on a `pending` incoming request |
| `request-decline-{request_id}` | Button. Present only on a `pending` incoming request |
| `request-cancel-{request_id}` | Button. Present only on a `pending` outgoing request |
| `request-error` | Shown when a pay, decline or cancel is refused |
| `empty-requests` | Shown when both lists are empty |

## Split — `/split`

| `data-testid` | Element |
|---|---|
| `split-amount` | Decimal input, same rule as `pay-amount` |
| `split-handles` | Text input: handles separated by commas, in order |
| `split-note`, `split-submit` | Input and button |
| `split-preview` | Shows the computed shares before submitting. Contains one `split-share-{handle}` per participant |
| `split-share-{handle}` | Text is exactly the formatted share amount |
| `split-error` | Error message, when the split is refused |

`split-preview` must show the shares the server would compute, by the rule in `stage-1.md`
§9, before anything is posted. The preview and submitted split must have identical shares.

After any successful action, the balance, the feed and the request lists on the same page must
show the new state without a manual reload. Navigation must wait for the write to succeed before
it refreshes the data. Any mechanism is fine, including a full navigation. **There is no
live-update requirement here** — another client may change state, but this browser need only
refresh after its own action or an explicit refresh.

## Competing clients and uncertain outcomes

- Add `wallet-refresh`, a button on `/` that refreshes the balance and feed without clearing
  the pay form. **Latest refresh wins:** a delayed earlier read must not overwrite a later
  refresh, including when responses arrive out of order.
- Another client may spend the balance after this browser reads it. A refused payment shows
  `pay-error`, refreshes the balance/feed, and preserves all pay inputs. A request cancelled
  elsewhere while its pay button is visible must show `request-error` when payment is refused
  and refresh the request list so the stale pay button disappears.
- If a payment response is lost, including after `POST /payments` commits, show `pay-uncertain`
  (nonempty text), not `pay-error`. Keep the unchanged form retryable with the **same key and
  body**. Successful retry removes both error/uncertainty elements, refreshes the balance and
  feed, and moves money exactly once. Unknown outcomes are not confirmed rejections.

No background polling, live synchronization, or recovery across page reloads is required.
The same balance refresh rules apply to the available and held amounts introduced below.

## Existing clients after an upgrade

A stage-2 service must accept an export produced by the same team's stage-1 service. A
browser signed in before that export/import upgrade must remain signed in afterwards.
Existing pending requests remain payable through the request screen. A payment whose response
was lost before export remains retryable after import with the same body and key; the UI
must recover the original payment and refresh the imported balance. These requirements
apply when import completes between browser requests; migration during an in-flight request
is not required. No page reload or new screen is required. The form and pending retry
identity must survive the upgrade.

## Authorizations and captures

A payment may be **authorised** now and **captured** later, for the full amount or less. An
authorisation places a *hold* on the payer's wallet: it reserves money without moving it. Capturing
moves the money; a final capture also releases whatever was not captured. Nonfinal captures
keep the remainder held. An open authorisation expires and releases its remainder on its own.

1. The sum of all wallet `total` values always equals the total seeded by the last reset.
   A hold moves no money; payments, settlements and captures transfer money between wallets.
2. `available = total − held` must never be negative. Held funds cannot fund new payments,
   authorizations or settlement net debits. Captures may spend the money reserved for them.
3. Cumulative captures must not exceed the authorized amount. Each idempotent capture moves
   money once. A closed hold cannot be captured again.

The existing API changes as follows:

- `GET /me` keeps `balance`, and `balance` **equals `total`**. `available` and `held` are new
  fields beside it. With no open holds, `balance`, `total` and `available` agree and `held` is
  zero, and every earlier behaviour is unchanged.
- `POST /payments` remains an immediate transfer. It must not leave an intermediate hold
  or require a separate capture.
- Every `409 insufficient_funds` in stage 1 — on `POST /payments`,
  `POST /requests/{id}/pay` and settlements — is now evaluated against `available`.
  With no open holds, the result is unchanged.
- Paying a request remains immediate. Authorizing a request is out of scope.
- `POST /splits` is unchanged.
- There are now seven idempotent write paths: stage 1's five, authorizations and captures.
  The same replay rules apply independently to each.

## Model

The fixture gains a service-wide default lifetime and an `authorizations` array.

```json
{
  "currency": "EUR",
  "minor_units": 2,
  "authorization_ttl_seconds": 600,
  "users": [ { "id": "u_ada", "handle": "ada", "balance": 10000, "...": "..." } ],
  "authorizations": [
    { "id": "a_1", "from_user_id": "u_ada", "to_user_id": "u_bob",
      "amount": 2000, "note": "deposit", "visibility": "public",
      "status": "open", "expires_at": "2026-09-24T13:20:00+00:00" }
  ]
}
```

- `authorization_ttl_seconds` applies to every authorisation created through the API. It defaults
  to 600 when omitted. If supplied, it must be a positive integer number of seconds.
  Seeded authorisations carry their own absolute `expires_at` instead.
- A user's seeded `balance` is still `total`. **`available` is derived, never seeded** — the service
  subtracts the seeded open holds itself.
- A sum of seeded unexpired open holds larger than that user's `balance` is a reset error:
  `422 validation_failed` from `POST /_test/reset`, changing nothing, exactly like a negative
  seeded balance.
- Seeded `status` is `open`, `captured`, `voided` or `expired`. Only `open` holds anything.
- An earlier fixture may omit `authorizations` altogether; omission means an empty list.

An authorization whose `expires_at` is at or before now is `expired` and holds no funds.
Reads and writes must reflect expiry even if no request occurred at the deadline.
`GET /authorizations` must show `status: "expired"`, and
`GET /me` must include the released remainder in `available`. Seeded expiry times are at
least an hour from reset time, in the past or future; newly created authorizations may
have shorter lifetimes.

## API

### `GET /me`

```json
{ "user_id": "u_ada", "display_name": "Ada", "handle": "ada",
  "balance": 10000, "total": 10000, "available": 8000, "held": 2000,
  "currency": "EUR", "minor_units": 2 }
```

`balance` and `total` are always equal. `held` is the sum of open holds, and `available` is
`total − held`, never negative.

### `POST /authorizations`

`Idempotency-Key` is required. The caller is the payer.

```json
{ "to_handle": "bob", "amount": 2000, "note": "deposit", "visibility": "private" }
```

`note` and `visibility` are optional with the same defaults as `POST /payments`.

```json
201
{
  "authorization_id": "a_4",
  "from_user_id": "u_ada", "from_handle": "ada",
  "to_user_id": "u_bob", "to_handle": "bob",
  "amount": 2000,
  "captured_amount": 0,
  "currency": "EUR",
  "note": "deposit",
  "visibility": "private",
  "status": "open",
  "expires_at": "2026-09-24T13:20:00+00:00",
  "payment_id": null,
  "created_at": "2026-09-24T13:10:00+00:00"
}
```

`expires_at` is `created_at` plus `authorization_ttl_seconds`.

| Case | Response |
|---|---|
| The caller's `available` is below `amount` | 409 `insufficient_funds` |
| `amount` below 1, above 1000000000, or not an integer | 422 `validation_failed` |
| `to_handle` is the caller's own handle | 422 `self_payment` |
| `note` over 200 characters, or `visibility` neither `public` nor `private` | 422 `validation_failed` |
| No user has that handle | 404 `not_found` |

An open authorisation is **not** a feed item and never appears in `GET /activity`.

### `POST /authorizations/{id}/capture`

`Idempotency-Key` is required. Only the receiver (the `to` party) may capture.

```json
{ "amount": 1500 }
```

`amount` is optional and defaults to the authorisation's remaining amount. As on
`POST /requests/{id}/pay`, **a replay must send the identical body** — `{}` and `{"amount": 2000}`
are different JSON values even when they mean the same capture, so reusing a key across the two is
409 `idempotency_key_reuse` per `stage-1.md` §7.

Returns `201` with the created **payment**, in exactly the shape `POST /payments` returns, with
`authorization_id` set to this authorisation and `request_id: null`. The payment's `amount` is the
captured amount; its `note` and `visibility` are copied from the authorisation; it appears in the
activity feed by the ordinary visibility rule. Payments created without an authorisation
carry `authorization_id: null`; their existing `request_id` semantics are unchanged.

By default the authorisation becomes `captured`, carries `captured_amount` and `payment_id`, and **releases the
uncaptured remainder immediately**: capturing 1500 of 2000 returns 500 to the payer's `available` in
the same step.

**Default: one final capture per authorisation.** A second capture after a final capture is
`409 authorization_not_open`.

**Extended capture mode.** To keep the remainder held, send `{"amount": 700, "final": false}`.
`final` is boolean, default `true`, so earlier single-capture requests retain their behavior.
With `final: false` and an uncaptured remainder, status stays `open`; further captures are
allowed up to that remainder. Capturing the entire remainder closes it even with `final: false`.
A final capture closes it and releases any remainder. `capture_exceeds_authorization` compares
with the **remaining** amount; omitted amount defaults to that remainder. `captured_amount` is
cumulative; `payment_id` is the latest capture; `payment_ids` lists every capture in order.
Every authorization response adds `remaining_amount`: the amount still held, zero when closed.
Void and expiry can close a partially captured authorization, release only the remainder,
and preserve all capture records. New fields do not change idempotency body equality.

| Case | Response |
|---|---|
| The authorisation is not `open` | 409 `authorization_not_open` |
| `expires_at` is at or before now | 409 `authorization_expired` |
| `amount` above the authorisation's uncaptured remainder | 422 `capture_exceeds_authorization` |
| `amount` below 1, or not an integer | 422 `validation_failed` |
| The caller is not the receiver | 403 `forbidden` |
| Unknown authorisation | 404 `not_found` |

### `POST /authorizations/{id}/void`

**Only the payer may void** — the `from` party releasing their own hold. No idempotency key, like
decline and cancel.

`200` with the authorisation, `status: "voided"`, the hold released. Voiding an already-voided
authorisation is `200` with the current state. A `captured` or `expired` one is
`409 authorization_not_open`.

For an existing authorization, capture and void return 403 `forbidden` when the caller
is not the permitted party, including callers who are neither party. `GET /authorizations`
returns only authorizations involving the caller.

### `GET /authorizations`

```http
GET /authorizations?direction=outgoing&status=open&limit=50&offset=0
```

Authorisations where the caller is the payer or the receiver, and no others. Newest first by
`created_at`.

- `direction` is `outgoing` (the caller is the payer), `incoming` (the caller is the receiver), or
  absent for both.
- `status` is one of the four statuses, or absent for all. An authorisation expired by the clock
  matches `expired`, never `open`.
- `limit`, `offset` and `has_more` behave exactly as on `GET /requests`.

## UI

A new route `/authorizations`, and the wallet gains two numbers. The UI and the API share
`/authorizations`: serve HTML for `Accept: text/html` and JSON otherwise, as for `/requests`.

| `data-testid` | Element |
|---|---|
| `wallet-balance` | Formatted `total`, retaining the existing display and `data-amount` |
| `wallet-available` | Formatted `available`, with `data-amount`. **Present this as the headline number** — it is what the user can actually spend |
| `wallet-held` | Formatted `held`, with `data-amount`. Absent when `held` is zero |
| `authorize-handle`, `authorize-amount`, `authorize-note`, `authorize-visibility`, `authorize-submit` | The authorise form. Same input rules as the pay form |
| `authorize-error` | Shown when the authorisation is refused, including insufficient available funds |
| `authorization-list` | Container on `/authorizations`. Children newest first in the DOM |
| `authorization-item-{authorization_id}` | Carries `data-status="{status}"` |
| `authorization-amount-{id}` | Text is exactly the formatted authorised amount |
| `authorization-captured-{id}` | Formatted captured amount. Present only when `status` is `captured` |
| `authorization-expires-{id}` | Text is the RFC 3339 `expires_at` |
| `authorization-capture-amount-{id}` | Decimal input, pre-filled with the remaining amount. Present only on an incoming `open` authorisation |
| `authorization-capture-{id}` | Button. Present only on an incoming `open` authorisation |
| `authorization-void-{id}` | Button. Present only on an outgoing `open` authorisation |
| `authorization-error` | Shown when a capture or a void is refused |
| `empty-authorizations` | Shown when the list is empty |

The UI must reflect seeded and newly created holds. Show available funds as the user's
spending balance, including immediately after reset with open holds.

## Concurrent operations

Concurrent requests must produce the same results as executing them one at a time in some
order, and the requirements above hold at every read.

## Stage 1 specification (still applies), verbatim

# Pocketful — Stage 1: payments and settlements

This stage defines the initial service and its API.

Build from the supplied requirements. Source code, API documentation and schemas from
existing products in this domain must not be used.

## 1. Scope

Users can send money by handle, request money and split bills. Payments appear in an
activity feed with public or private visibility. Authorized operators can submit groups
of transfers as settlements. Only the HTTP API is required.

The following apply to all operations, including concurrent requests and retries:

1. The sum of wallet balances always equals the total seeded by the last `POST /_test/reset`.
2. No wallet balance may be negative, including transiently.
3. A payment request may move money at most once.

All amounts are exact integer counts of minor units. Deposits, top-ups, withdrawals,
cards and bank integrations are out of scope. Money moves only between existing wallets.

## 2. Delivery and deployment

Deliver an HTTP service, a `Dockerfile` and a `RUN.md` with a command that builds and
starts the service without manual setup. Language, framework and storage are unrestricted.
A `docker-compose.yml` is optional.

The submission is a containerized HTTP service, not a Python package. Python is not
required in the implementation. TypeScript/JavaScript, Go, Rust, Java, Python and any
other language are equally valid. The harness builds the submitted `Dockerfile`, starts
the resulting image and tests only its HTTP behavior; it does not import or execute the
submission's source files on the judge host.

The image must run on its own with `-e PORT=<port>` and a port mapping. Runtime networking
has no outbound access. All runtime dependencies, initialization and seed data must work
within that single container. Compose configuration is not used to start the service.

### Resource limits

The service must operate within these limits:

| Limit | Value |
|---|---|
| CPU | 2 vCPU |
| Memory | 2 GiB |
| Start to first healthy response | 60 s |
| Concurrent requests | up to 50 in flight |
| Per-request timeout | 5 s (10 s for `POST /_test/reset`) |
| Outbound network | available during `docker build`, **none at run time** |
| Disk | ephemeral; state need not survive a container restart |

Runtime assets and dependencies must be included in the image. This includes fonts,
scripts and stylesheets; external services are unavailable at runtime.

## 3. Runtime contract

### 3.1 Listening

Listen on `0.0.0.0` using the `PORT` environment variable, default `8080`.

### 3.2 Health

```http
GET /health  ->  200  {"status": "ok"}
```

Return 200 once the service and its data store can serve requests, within 60 seconds
of container start. Non-200 responses are permitted before the service is ready.

### 3.3 Reset and seed

```http
POST /_test/reset
Content-Type: application/json

{ ...fixture... }

->  204 No Content
```

Replace all service state with the fixture in the request body (§4). When reset returns
204, subsequent requests must see only that fixture. Repeated resets are supported.
This test endpoint must be enabled in the delivered image and requires no authentication.

### 3.4 Conventions

- Requests and responses are `application/json; charset=utf-8`.
- Timestamps in responses are RFC 3339 with an explicit offset, e.g. `2026-09-24T19:00:00+02:00`.
- Unknown fields in a request body are ignored, never an error.
- Unknown query parameters are ignored.
- IDs are opaque strings of at most 64 characters. Their format is yours.

## 4. Model

The service has **one currency**, declared in the fixture. Every amount in the API is an integer
count of its minor units: `1000` in a `minor_units: 2` service is €10.00, and `1000` in a
`minor_units: 0` service is ¥1000.

API amounts must have an integral numeric value: JSON `1000`, `1000.0` and `1e3` all represent the
same valid minor-unit amount. Booleans and strings are not numbers here.

### Users and handles

Every user has a **handle**: unique across the service, matching `^[a-z0-9_]{1,20}$`, and never
changing once set. Users identify recipients by handle. Directory and user-search
endpoints are out of scope.

Seeded users take their handle from the fixture. A user created through `POST /auth/signup`
(§6 — there is no `handle` field in the signup body) has one **derived** from their email: take the
local part, lowercase it, replace every character outside `[a-z0-9_]` with `_`, and truncate to 20
characters. If that handle is already taken the signup fails; see the signup table in §6.

New users start with a balance of `0`. They can receive money and be asked for money immediately.

### Payments and requests

A **payment** moves money from one wallet to another, immediately and atomically. It is either sent
directly or created by paying a request.

A **request** asks someone for money. The `requester` will receive; the `payer` is being asked. A
request is `pending`, and then exactly one of `paid`, `declined` or `cancelled`. Only the payer may
pay or decline it; only the requester may cancel it.

**A request may exceed the payer's balance.** That is a legal state, not an error at creation time:
the request stays `pending` until it is paid, declined or cancelled, and an attempt to pay it while
short is `409 insufficient_funds` and changes nothing. Money can arrive later and the same request
then becomes payable.

**Visibility belongs to the payment, not the request.** The payer chooses it when the money moves.
A request carries no visibility of its own and never appears in anyone else's feed.

### The feed contract

`GET /activity` returns payments only. A payment appears for a caller **if and only if** its
`visibility` is `public`, **or** the caller is its sender or its receiver. There is no other rule,
no follow graph and no mute list. Requests never appear in the activity feed; they are read through
`GET /requests`, which returns only requests where the caller is the requester or the payer.

A split is not a feed item. The requests it creates are visible to their own two parties, and the
payments that eventually fulfil them follow the rule above.

Visibility is **one value on the payment**, seen identically by both parties and by everyone else.
A `private` payment is hidden from third parties, not from its own receiver.

### Arithmetic range

`amount` is at most `1000000000` on any single request, and no operation produces a balance outside
±2⁵³. Monetary arithmetic must preserve exact minor-unit values without rounding error.

### Fixture format

```json
{
  "currency": "EUR",
  "minor_units": 2,
  "users": [
    { "id": "u_ada", "email": "ada@example.com", "password": "correct horse",
      "display_name": "Ada", "handle": "ada", "balance": 10000 },
    { "id": "u_bob", "email": "bob@example.com", "password": "correct horse",
      "display_name": "Bob", "handle": "bob", "balance": 2500 }
  ],
  "payments": [
    { "id": "p_1", "from_user_id": "u_ada", "to_user_id": "u_bob",
      "amount": 500, "note": "coffee", "visibility": "public" }
  ],
  "requests": [
    { "id": "rq_1", "requester_id": "u_bob", "payer_id": "u_ada",
      "amount": 1200, "note": "taxi", "status": "pending" }
  ]
}
```

- Seeded users must be able to log in with the given password immediately.
- `balance` is the wallet balance **after** every seeded payment has been applied. Seeded
  numbers are consistent; you do not replay seeded payments against balances.
- A `balance` below zero in a fixture is a reset error: return `422 validation_failed` from
  `POST /_test/reset` and change nothing.
- `minor_units` is `0`, `2` or `3`. Fixtures use `EUR` (2), `JPY` (0) and `BHD` (3).

An administrative balance endpoint is out of scope.

## 5. Errors

Every 4xx and 5xx response carries this body:

```json
{ "error": { "code": "insufficient_funds", "message": "human readable, any wording" } }
```

Use the specified HTTP status and `code`. The human-readable `message` may use any wording.
Endpoint-specific errors are listed with each endpoint.

| Status | `code` | When |
|---|---|---|
| 400 | `malformed_request` | Unparseable body, or a field of the wrong JSON type |
| 400 | `missing_idempotency_key` | Required `Idempotency-Key` header absent or empty |
| 401 | `unauthenticated` | Missing, malformed or unknown bearer token |
| 403 | `forbidden` | Authenticated, but not permitted to touch this resource |
| 404 | `not_found` | No such resource, or not visible to this caller |
| 409 | `idempotency_key_reuse` | Key already used by this caller with a different request body |
| 422 | `validation_failed` | A required field or query parameter is missing, or a stated rule is violated with no more specific code |

A field of the correct JSON type with an invalid format or out-of-range value gives
422 `validation_failed`, unless an endpoint specifies a different error. This includes
invalid dates, negative counts and values exceeding a stated maximum or length. In addition:

- Endpoint-specific field rules take precedence: invalid `amount` values (including strings and
  booleans), non-string `note` values (including `null`), and any `visibility` other than
  `public` or `private` are 422 `validation_failed`. Omission alone selects the optional-field
  defaults. Other wrong JSON types follow the rule below.
- An integer-valued **query parameter** is written as plain decimal digits: `1e9`, `4.0` and `+4`
  are 422 `validation_failed` whatever their numeric value.
- Reserve 400 `malformed_request` for a body that does not parse or a field of the wrong type.

Shared ranges, enforced on every endpoint that takes them:

| Field | Valid | Otherwise |
|---|---|---|
| `Idempotency-Key` | 1 to 255 characters | 422 `validation_failed` |
| `limit` | integer 1 to 200 | 422 `validation_failed` |
| `offset` | integer 0 or more | 422 `validation_failed` |

Requests must not produce 5xx responses, including under concurrent load.

## 6. Authentication

Authentication supports signup and login. Email verification, password reset, refresh
tokens and role-management endpoints are out of scope. Permissions specified elsewhere
in these requirements still apply.

```http
POST /auth/signup
{ "email": "a@example.com", "password": "correct horse", "display_name": "Ada" }

->  201  { "user_id": "u_1", "display_name": "Ada", "token": "..." }
```

```http
POST /auth/login
{ "email": "a@example.com", "password": "correct horse" }

->  200  { "user_id": "u_1", "display_name": "Ada", "token": "..." }
```

| Case | Response |
|---|---|
| Email already registered | 409 `email_taken` |
| Password shorter than 8 characters | 422 `validation_failed` |
| `email` not of the form `local@domain` | 422 `validation_failed` |
| Wrong password or unknown email on login | 401 `unauthenticated` |
| The handle derived from the email (§4) is already taken | 409 `handle_taken`, and no account is created |

Every other endpoint requires a bearer token, except `/health`, `/_test/reset` and the two above.
Wallet API endpoints require authentication.

```http
Authorization: Bearer <token>
```

Tokens do not expire. An account may have multiple valid tokens and concurrent sessions.

Passwords must be stored using a password-hashing function such as bcrypt, scrypt or
Argon2, or an equivalent. Plaintext password storage is not permitted.

## 7. Idempotency

Five write paths require an idempotency key (§8 and §11): **`POST /payments`**, **`POST /requests`**,
**`POST /requests/{id}/pay`**, **`POST /splits`** and **`POST /settlements`**. Everything below applies to each of them
independently.

```http
Idempotency-Key: <client-chosen string, 1..255 characters>
```

The key is scoped to **the authenticated user**. Two different users may use the same key string
with no interaction between them.

A replay means the same user sending the **same method, the same path and the same body**. The
same key with the same body on a different path is a different request, not a replay, and must
succeed normally.

| Situation | Response |
|---|---|
| Header absent or empty | 400 `missing_idempotency_key` |
| First use of the key | The normal response, **201** |
| Replay: same key, same body | **200**, body identical to the original response as a JSON value |
| Same key, different body | 409 `idempotency_key_reuse` |
| Key reused after the original request failed with 4xx | Treated as a first use |

"Same body" means the same JSON value after parsing — key order and whitespace do not matter.

For concurrent identical requests with an unused key, exactly one returns 201.
The others return 200 with the same body. The operation takes effect only once.

A successful replay returns the original response, even after the resource changes or
is cancelled. It makes no further state changes.

After the body has parsed as a JSON object and the caller is authenticated, an already
claimed key is resolved before endpoint field validation or current-resource checks. Thus
changing a successful request to an invalid body with the same key still returns
`409 idempotency_key_reuse`.

## 8. API

### `GET /me`

```json
{ "user_id": "u_ada", "display_name": "Ada", "handle": "ada",
  "balance": 10000, "currency": "EUR", "minor_units": 2 }
```

### `POST /payments`

**An idempotent write path.** `Idempotency-Key` is required; see §7.

```http
POST /payments
Authorization: Bearer <token>
Idempotency-Key: 2f9c1a...

{ "to_handle": "bob", "amount": 1500, "note": "dinner", "visibility": "public" }
```

`note` is optional and defaults to `""`. `visibility` is optional and defaults to `"public"`.

```json
201
{
  "payment_id": "p_7",
  "from_user_id": "u_ada",
  "from_handle": "ada",
  "to_user_id": "u_bob",
  "to_handle": "bob",
  "amount": 1500,
  "currency": "EUR",
  "note": "dinner",
  "visibility": "public",
  "request_id": null,
  "created_at": "2026-09-24T11:04:03+00:00"
}
```

| Case | Response |
|---|---|
| The caller's balance is below `amount` | 409 `insufficient_funds` |
| `amount` below 1, above 1000000000, or not an integer | 422 `validation_failed` |
| `to_handle` is the caller's own handle | 422 `self_payment` |
| `note` longer than 200 characters | 422 `validation_failed` |
| `visibility` is neither `public` nor `private` | 422 `validation_failed` |
| No user has that handle | 404 `not_found` |

The debit and the credit are one atomic step. A payment is never visible in one wallet and not the
other, and a failed payment leaves no trace in either.

`note` is stored and returned verbatim: no trimming, no escaping, no normalisation. Unicode and
emoji survive a round trip byte for byte.

### `POST /requests`

**An idempotent write path.**

```http
POST /requests
Idempotency-Key: 9b1f04...

{ "payer_handle": "ada", "amount": 1200, "note": "taxi" }
```

The caller is the requester.

```json
201
{
  "request_id": "rq_4",
  "requester_id": "u_bob",
  "requester_handle": "bob",
  "payer_id": "u_ada",
  "payer_handle": "ada",
  "amount": 1200,
  "currency": "EUR",
  "note": "taxi",
  "status": "pending",
  "payment_id": null,
  "created_at": "2026-09-24T11:06:10+00:00"
}
```

| Case | Response |
|---|---|
| `amount` below 1, above 1000000000, or not an integer | 422 `validation_failed` |
| `payer_handle` is the caller's own handle | 422 `self_request` |
| `note` longer than 200 characters | 422 `validation_failed` |
| No user has that handle | 404 `not_found` |

**The payer's balance is not checked here.** A request for more than the payer holds is created
normally and sits `pending`.

### `POST /requests/{id}/pay`

**An idempotent write path.** Only the payer may call it.

```http
POST /requests/rq_4/pay
Idempotency-Key: c41d88...

{ "visibility": "private" }
```

The body carries `visibility` only, optional, default `"public"`. It is the payer's choice, not the
requester's. **A replay must send the identical body** — `{}` and `{"visibility": "public"}` are
different JSON values, so reusing a key across the two is `409 idempotency_key_reuse`, per §7.

Returns `201` with the created **payment**, exactly as `POST /payments` returns one, with
`request_id` set to this request. The request becomes `paid` and carries the new `payment_id`.

| Case | Response |
|---|---|
| The request is not `pending` | 409 `request_not_pending` |
| The payer's balance is below `amount` | 409 `insufficient_funds` |
| The caller is not the request's payer | 403 `forbidden` |
| Unknown request | 404 `not_found` |

Replaying a successful payment returns 200 with its original payment body, including
when the request is already `paid`. It moves no additional money and must not return
`409 request_not_pending`.

### `POST /requests/{id}/decline`

Only the payer. No idempotency key. Returns `200` with the request, `status: "declined"`. Declining
an already-declined request is `200` with the current state — declining twice is not an error.
A `paid` or `cancelled` request is `409 request_not_pending`. Not the payer is `403 forbidden`.

### `POST /requests/{id}/cancel`

Only the requester. No idempotency key. Returns `200` with the request, `status: "cancelled"`.
Cancelling an already-cancelled request is `200`. A `paid` or `declined` request is
`409 request_not_pending`. Not the requester is `403 forbidden`.

### `GET /requests`

```http
GET /requests?direction=incoming&status=pending&limit=50&offset=0
```

Requests where the caller is the requester or the payer, and no others. Newest first by
`created_at`.

- `direction` is `incoming` (the caller is the payer), `outgoing` (the caller is the requester) or
  absent for both.
- `status` is one of the four statuses, or absent for all.
- `limit` defaults to 50, range 1 to 200. `offset` defaults to 0 and must be 0 or more. Outside
  either range is 422 `validation_failed`. An unknown `direction` or `status` value is also 422.
- `has_more` is true when items exist beyond the last one returned.

```json
{ "requests": [ { ...request... } ], "has_more": false }
```

### `POST /splits`

**An idempotent write path.** Splits an amount the caller already paid, and asks each of the other
participants for their share by creating one `pending` request each.

```http
POST /splits
Idempotency-Key: 7a3e52...

{ "amount": 3000, "participant_handles": ["ada", "bob", "cy"], "note": "dinner" }
```

The caller may be included in `participant_handles` or omitted. Shares follow the equal-split
rule in §9, in the order the handles are given. **A request is created for every participant
except the caller**, each for that participant's share, with the caller as requester.

```json
201
{
  "split_id": "sp_2",
  "amount": 3000,
  "currency": "EUR",
  "note": "dinner",
  "shares": [ { "handle": "ada", "amount": 1000 },
              { "handle": "bob", "amount": 1000 },
              { "handle": "cy",  "amount": 1000 } ],
  "requests": [ { ...request for bob... }, { ...request for cy... } ],
  "created_at": "2026-09-24T11:11:00+00:00"
}
```

`shares` covers every participant including the caller, in the order given, and always sums to
`amount`. `requests` covers every participant except the caller, in the same order.

| Case | Response |
|---|---|
| `amount` below 1, above 1000000000, or not an integer | 422 `validation_failed` |
| `participant_handles` empty, or containing a duplicate handle | 422 `validation_failed` |
| `note` longer than 200 characters | 422 `validation_failed` |
| Any handle is unknown | 404 `not_found` |

A split whose only participant is the caller is **valid**: it computes one share, creates zero
requests, and returns `"requests": []`. Nothing about a split checks anyone's balance.

### `GET /activity`

```http
GET /activity?limit=50&offset=0
```

Payments visible to the caller by the feed contract in §4, newest first by `created_at`.

```json
{ "payments": [ { ...payment... } ], "has_more": false }
```

- The relative order of two payments created within the same second is unspecified.
  Stable pagination during concurrent writes is not required for this endpoint.
- `limit` and `offset` behave exactly as in `GET /requests`.

## 9. Money and rounding

Shares must be whole minor units, sum exactly to `amount` and differ by at most one
minor unit. When the amount does not divide evenly, the larger shares go to the first
participants in `participant_handles` order.

| `amount` | `n` | Shares |
|---|---|---|
| 1000 | 3 | 334, 333, 333 |
| 1 | 3 | 1, 0, 0 |
| 10 | 3 | 4, 3, 3 |
| 999 | 3 | 333, 333, 333 |
| 5 | 5 | 1, 1, 1, 1, 1 |

Splitting the same amount among the same people in a different
`participant_handles` order gives the extra unit to a different person. A share of `0` is legal and
still produces a request for that participant.

Each split's shares are independent of previous splits. After any number of splits have
been paid in full, wallet balances must still sum exactly to the seeded total.

## 10. Export and import

The service must support `GET /_test/export` and `POST /_test/import`. Like reset, these
are unauthenticated test endpoints.
Exports may contain credentials and session tokens; handle them as private test artifacts.
Return 200 from export with a JSON object containing `track: "pocketful"`,
`format_version: 1` and `state` (an implementation-defined JSON object). The state format
is opaque to the caller and must be accepted unchanged by import.

Import takes that entire object and atomically replaces the service's state, returning
204. It must accept an unchanged export produced by this service. No dependency on the
source process, files, volume, port or network address is allowed. Import is replacement,
not merge; repeating it restores the exported state without duplicating anything. Invalid
JSON follows §5; missing fields, wrong track/version or an invalid state give 422
`validation_failed` without changing the destination. Test control calls have a 10-second
timeout. Export is an atomic, read-only snapshot; subsequent source writes do not change it.

Preserve accounts and hashed-password login, existing bearer tokens, currency, balances,
payments, requests, permissions, all completed idempotent request bodies and original
responses. Identities, timestamps and monetary records must not be regenerated or replayed
against an already-net balance. Failed request keys remain reusable. Existing receipts,
tokens and retries must remain valid after import; replacing the state with a fresh fixture
does not satisfy this requirement. Import removes all previous destination data and
credentials. Reset clears all state, including imported state. State need not survive an
abrupt container restart.

## 11. Atomic net settlements

The reset fixture may include `settlement_operator_ids`, an array of user ids, default [].
An operator may execute a settlement across any wallets. This permission does not grant
access to another user's requests or private activity items.

`POST /settlements` requires an operator and an idempotency key. No token gives 401;
authenticated non-operator gives 403 `forbidden`. Body:

```json
{"transfers": [{"from_handle": "ada", "to_handle": "bob", "amount": 100},
               {"from_handle": "bob", "to_handle": "cy", "amount": 50}]}
```

transfers contains 1..32 objects. Each uses ordinary payment amount, note and visibility
rules (defaults: empty note, public). Unknown handle is 404; self-transfer is 422
`self_payment`; malformed batch shape is 422 `validation_failed`. Entry errors take precedence
in input order, before insufficient funds. Unknown fields are ignored.

A settlement is affordable when every wallet's balance after all incoming and outgoing
transfers is nonnegative. Insufficient collective funds gives 409 `insufficient_funds`.
Either all movements commit together or none do; failed
validation claims no idempotency key and creates no payment or revision.

Return 201 with `settlement_id`, `committed_at` and `payments` in input order. Every member is
an ordinary payment with `settlement_id` linking the batch; nonmembers expose null for that
field. Members have null request_id and the same server-assigned created_at, equal to
committed_at.

Constituents follow ordinary activity-feed visibility. The settlement response contains every
member's receipt. Replays return
200 with the original complete response. This is the fifth idempotent write path in stage 1.
A reset/import must preserve settlement operator permissions, original payments, requests,
settlement membership and retry responses.

## The stage-3 requirement list, with each row's tests (verbatim)

# Stage 3 — requirement list

Source: `pocketful/spec/stage-3.md` (read-only), building on `stage-1.md` and `stage-2.md`. One row
per testable requirement. Status values: open, tested, passing, failing, disputed, not testable
(with the reason). Tests are named `file::function` under `work/acceptance/tests/stage_3/`.

## Earlier rows this stage changes

All stage-1 and stage-2 rows still apply. The stage-1 and stage-2 suites run against every
stage-3 build. Their tests hold because they make no corrections and send no temporal parameters.

| Earlier row | Change in stage 3 | Covered by |
|---|---|---|
| S1-052, S2-092 | seeded payments (and seeded authorisations) may carry `created_at` | S3-004, S3-005, S3-065 |
| S1-084, S2-089 | an eighth idempotent write path: `POST /payments/{id}/corrections` | S3-025, S3-032, S3-069 |
| S1-095, S2-084 | `GET /me` takes `as_of` / `known_at`; without them it reports current corrected values | S3-008, S3-058 |
| S1-161, S2-158 | export/import also carries revisions, corrections and their receipts; stage-1 and stage-2 exports import | S3-056, S3-068 |
| S2-101, S2-121 | authorisations expose `closed_at` | S3-063 |
| S1-141 | `GET /activity` keeps the original payment; corrections are not feed items | S3-038 |

## Payment timestamps

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-001 | "The requirements from stages 1 and 2 continue to apply, with the additions below." | stage | the whole stage-1 and stage-2 suites (run.sh runs suites 1..N against the stage-N build) | tested |
| S3-002 | "Every payment's `created_at` is an RFC 3339 instant with an offset identifying when it moved money. Every endpoint returning a payment includes it." | timestamps | test_history.py::test_every_payment_carries_created_at | tested |
| S3-003 | "`GET /activity` retains its existing ordering by this field." | timestamps | test_history.py::test_activity_ordering_with_seeded_times | tested |
| S3-004 | "Seeded payments may supply `created_at`; omission uses reset time, before subsequent API-created payments." | fixture | test_history.py::test_seeded_created_at_is_kept<br>test_history.py::test_seeded_without_created_at_uses_reset_time<br>test_snapshots_holds_import.py::test_large_reset_with_seeded_times | tested |
| S3-005 | "A seeded `created_at` in the future gives `422 validation_failed` from `POST /_test/reset`, with no state change." | fixture | test_history.py::test_future_seeded_created_at_is_a_reset_error<br>test_history.py::test_invalid_seeded_created_at_is_a_reset_error<br>test_s3_review_additions.py::test_seeded_payment_time_format<br>test_snapshots_holds_import.py::test_import_with_future_payment_time_refused | tested |
| S3-006 | "A fixture's `balance` remains the balance after all seeded payments. Loading those payments must not change that balance." | fixture | test_history.py::test_seeded_balances_are_final | tested |

## `GET /me` as of an instant

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-007 | "`as_of` is optional and is an RFC 3339 instant with an offset. Anything else — a naive local time, a bare date, an empty value — is 422 `validation_failed`." | as_of | test_history.py::test_as_of_must_be_an_instant<br>test_history.py::test_as_of_needs_auth | tested |
| S3-008 | "Without temporal query parameters the response retains the existing money fields and reports current corrected values." | as_of | test_corrections.py::test_no_corrections_no_known_at_unchanged<br>test_history.py::test_me_without_as_of | tested |
| S3-009 | "`balance` is the caller's balance as it stood at that instant: the balance after every payment of theirs with `created_at` at or before `as_of`, and before every payment after it. A payment made at exactly `as_of` counts as having happened." | as_of | test_history.py::test_as_of_in_other_offsets<br>test_history.py::test_as_of_is_inclusive<br>test_history.py::test_historical_views_sum_to_the_seed | tested |
| S3-010 | "An `as_of` at or after the latest payment returns the current balance." | as_of | test_history.py::test_as_of_after_latest_is_current | tested |
| S3-011 | "An `as_of` before the earliest payment returns the opening balance — what the wallet held before anything moved." | as_of | test_history.py::test_as_of_before_earliest_is_opening | tested |
| S3-012 | "The response carries `as_of` back, exactly as given." | as_of | test_history.py::test_as_of_in_other_offsets<br>test_history.py::test_as_of_is_inclusive<br>test_s3_review_additions.py::test_edge_query_instants | tested |

## `GET /statement`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-013 | "Both `from` and `to` are optional; `from` defaults to the opening of the wallet and `to` to now." | statement | test_history.py::test_statement_defaults | tested |
| S3-014 | "`limit` and `offset` behave exactly as in `GET /requests`." | statement | test_history.py::test_paging_keeps_window_balances<br>test_history.py::test_statement_bad_params | tested |
| S3-015 | "Returns the payments the caller sent or received in the half-open window `[from, to)`, **oldest first**, each with the caller's balance immediately after it" (shape: `opening_balance`, `entries[{payment, delta, balance_after}]`, `closing_balance`, `has_more`) | statement | test_history.py::test_half_open_window<br>test_history.py::test_statement_defaults<br>test_history.py::test_statement_needs_auth | tested |
| S3-016 | "Entries are ordered by `created_at` ascending, then payment `id` ascending for ties." (later: by selected `effective_at`, S3-044) | statement | test_history.py::test_ties_broken_by_payment_id | tested |
| S3-017 | "`opening_balance` is the balance immediately before `from`. `closing_balance` is the balance immediately before `to`." | statement | test_history.py::test_half_open_window | tested |
| S3-018 | "`opening_balance` plus all `delta` values in the full window must equal `closing_balance`. A sent payment has a negative `delta`; a received payment has a positive `delta`." | statement | test_history.py::test_new_payments_join_the_statement<br>test_history.py::test_paging_keeps_window_balances<br>test_history.py::test_statement_defaults | tested |
| S3-019 | "Pagination must not change an entry's `balance_after` or the window's opening and closing balances." | statement | test_history.py::test_paging_keeps_window_balances<br>test_history.py::test_statement_past_200_entries | tested |
| S3-020 | "Only payments sent or received by the caller appear in their statement, including when other payments are public." | statement | test_history.py::test_statement_has_only_own_payments | tested |
| S3-021 | `from` / `to` are instants: a value that is not an RFC 3339 instant with an offset is 422 `validation_failed` (§5; as for `as_of`, decision D3-1) | statement | test_history.py::test_statement_bad_params | tested |

## Effective time, recorded time and corrections

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-022 | "Revision 1 has `amount` as originally paid and `effective_at = recorded_at = created_at`. A seeded payment's supplied `created_at` is also its original recorded/effective time; omission uses reset time." | revisions | test_corrections.py::test_decrease<br>test_history.py::test_seeded_created_at_is_kept<br>test_snapshots_holds_import.py::test_earlier_stage_exports_import | tested |
| S3-023 | "Opening balances equal seeded ending balances minus the net effect of original seeded payments. Corrections must not change those opening balances. New accounts open at zero." | revisions | test_corrections.py::test_corrections_keep_totals_and_openings<br>test_history.py::test_as_of_before_earliest_is_opening<br>test_history.py::test_seeded_balances_are_final | tested |
| S3-024 | "Seeded history is consistent and nonnegative." | fixture | — | not testable: a promise about the fixtures the tests send, not a rule the service applies |
| S3-025 | "`POST /payments/{payment_id}/corrections` requires an idempotency key and the original sender. An authenticated non-sender gets 403 `forbidden`; unknown payment gets 404." | corrections | test_corrections.py::test_correction_needs_a_key<br>test_corrections.py::test_only_the_sender_corrects<br>test_corrections.py::test_request_payment_can_be_corrected | tested |
| S3-026 | "All fields are required." (`expected_revision`, `amount`, `effective_at`, `reason`) | corrections | test_corrections.py::test_all_fields_required | tested |
| S3-027 | "Revision is a positive integer; amount is an integer 0..1000000000 (zero reverses the entire payment); reason is a string of 1..200 characters; effective time is an RFC 3339 instant not later than now. Invalid input is 422 `validation_failed`." | corrections | test_corrections.py::test_correction_bounds_valid<br>test_corrections.py::test_invalid_correction_input<br>test_corrections.py::test_zero_reverses<br>test_s3_review_additions.py::test_edge_effective_at<br>test_s3_review_additions.py::test_wrong_types | tested |
| S3-028 | "Correction changes neither parties nor visibility." | corrections | test_corrections.py::test_parties_visibility_and_feed_unchanged | tested |
| S3-029 | "It appends an immutable revision, returning 201 with `payment_id`, `revision`, `amount`, `effective_at`, server-assigned `recorded_at`, and `reason`." | corrections | test_corrections.py::test_decrease | tested |
| S3-030 | "Recorded times for one payment strictly increase." | corrections | test_corrections.py::test_chain_of_corrections<br>test_snapshots_holds_import.py::test_edited_revision_times_refused | tested |
| S3-031 | "A stale expected revision gives 409 `stale_revision`." | corrections | test_corrections.py::test_chain_of_corrections | tested |
| S3-032 | "Successful replay returns that original revision with 200 even after newer revisions. Different body with the same key is 409 `idempotency_key_reuse`." | corrections | test_corrections.py::test_correction_replay<br>test_snapshots_holds_import.py::test_corrections_survive_import<br>test_snapshots_holds_import.py::test_edited_correction_receipt_fields | tested |
| S3-033 | "The difference from the previous amount moves between the **same two wallets** in the same atomic step. Increasing the amount debits the original sender; decreasing it debits the original receiver." | corrections | test_corrections.py::test_decrease<br>test_corrections.py::test_increase_debits_the_sender<br>test_corrections.py::test_request_payment_can_be_corrected | tested |
| S3-034 | "A currently unaffordable debit gives 409 `insufficient_funds`." | corrections | test_corrections.py::test_increase_debits_the_sender<br>test_corrections.py::test_unaffordable_now<br>test_s3_review_additions.py::test_correction_debit_judged_against_available_receiver<br>test_s3_review_additions.py::test_correction_debit_judged_against_available_sender<br>test_snapshots_holds_import.py::test_insufficient_funds_takes_precedence | tested |
| S3-035 | "Otherwise, if any user's corrected balance is negative at any effective-time boundary, return 409 `historical_overdraft`. Balances at a boundary include the combined effect of all movements at that instant." | corrections | test_corrections.py::test_boundary_combines_movements_at_one_instant<br>test_corrections.py::test_historical_overdraft | tested |
| S3-036 | "Either failure preserves balances, revision history, statements and idempotency state." | corrections | test_corrections.py::test_failed_correction_claims_no_key<br>test_corrections.py::test_historical_overdraft<br>test_corrections.py::test_unaffordable_now | tested |
| S3-037 | "The sum of balances must equal the seeded total in every historical view." | corrections | test_corrections.py::test_corrections_keep_totals_and_openings<br>test_history.py::test_historical_views_sum_to_the_seed | tested |
| S3-038 | "The original payment and every original idempotent response remain unchanged. `GET /activity` continues to display the original payment; correction records are not new feed payments." | corrections | test_corrections.py::test_parties_visibility_and_feed_unchanged | tested |
| S3-039 | "`GET /payments/{payment_id}/revisions` returns `{"revisions": [...]}` in revision order, including revision 1 (`reason: ""`)." | revisions | test_corrections.py::test_chain_of_corrections<br>test_corrections.py::test_decrease | tested |
| S3-040 | "Only the two parties can read it; a third party gets 404 even for a public payment. No token is 401." | revisions | test_corrections.py::test_revisions_only_for_parties | tested |

## `known_at`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-041 | "`GET /me` and `GET /statement` accept optional `known_at`, an RFC 3339 instant with offset." "Invalid/empty instants are 422. Echo supplied `known_at` exactly." | known_at | test_corrections.py::test_known_at_must_be_an_instant<br>test_corrections.py::test_known_at_selects_revisions<br>test_s3_review_additions.py::test_edge_query_instants | tested |
| S3-042 | "For each payment, select its latest revision recorded **at or before** `known_at`; if none was yet recorded, that payment contributes nothing. Omission means everything known when the read begins." | known_at | test_corrections.py::test_known_at_selects_revisions | tested |
| S3-043 | "Then apply selected revisions according to their **effective** times. `as_of` retains its inclusive meaning; a statement retains its half-open window. Both query instants may be in the future." | known_at | test_corrections.py::test_correction_moves_payment_across_window<br>test_corrections.py::test_known_at_selects_revisions | tested |
| S3-044 | "Statement ordering is now by selected `effective_at`, then payment id. Each entry ... adds the selected `revision`, `effective_at` and `recorded_at`. `payment.amount` is the selected amount for this statement. Zero-amount revisions still appear as entries with zero delta. No correction is counted alongside the revision it replaces. With no corrections and no `known_at`, previous behavior is unchanged." | statement | test_corrections.py::test_correction_moves_payment_across_window<br>test_corrections.py::test_known_at_selects_revisions<br>test_corrections.py::test_no_corrections_no_known_at_unchanged<br>test_corrections.py::test_zero_reverses | tested |

## Stable statement pagination

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-045 | "Every first `GET /statement` response additionally returns an opaque `snapshot` token. It freezes the caller's selected revisions, window, balances, entries and default `to` at that read." | snapshot | test_snapshots_holds_import.py::test_snapshot_freezes_default_to<br>test_snapshots_holds_import.py::test_snapshot_pages_the_frozen_result | tested |
| S3-046 | "`GET /statement?snapshot=<token>&limit=...&offset=...` pages that exact result, even after payments or corrections." | snapshot | test_snapshots_holds_import.py::test_snapshot_pages_the_frozen_result<br>test_snapshots_holds_import.py::test_snapshot_stable_under_concurrent_writes | tested |
| S3-047 | "Only limit and offset may accompany a snapshot; supplying `from`, `to` or `known_at` with it gives 422 `validation_failed`." | snapshot | test_snapshots_holds_import.py::test_snapshot_with_window_params | tested |
| S3-048 | "Unknown token, another user's token, or a token from before reset gives 404 `not_found`. Tokens last until reset." | snapshot | test_snapshots_holds_import.py::test_snapshot_not_found_cases | tested |
| S3-049 | "Paging changes neither balances nor entries; the final partial page and offsets beyond the end must report `has_more` correctly." | snapshot | test_history.py::test_statement_past_200_entries<br>test_snapshots_holds_import.py::test_snapshot_ignores_unknown_params_and_validates_paging<br>test_snapshots_holds_import.py::test_snapshot_pages_the_frozen_result | tested |
| S3-050 | "Unrecognized query parameters remain ignored under stage 1's general rule." | snapshot | test_snapshots_holds_import.py::test_snapshot_ignores_unknown_params_and_validates_paging | tested |
| S3-051 | "A correction may move a payment into or out of a statement window." | snapshot | test_corrections.py::test_correction_moves_payment_across_window | tested |
| S3-052 | "Existing snapshots remain unchanged during concurrent payments or corrections. Concurrent corrections using the same expected revision cannot both succeed." | concurrency | test_corrections.py::test_concurrent_corrections_same_revision<br>test_snapshots_holds_import.py::test_snapshot_stable_under_concurrent_writes | tested |

## Settlement history and imports

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-053 | "Stage-1 settlements retain their original receipts and privacy rules. Each member's original revision uses its shared committed_at as both effective_at and recorded_at." | settlements | test_corrections.py::test_settlement_members<br>test_snapshots_holds_import.py::test_earlier_stage_exports_import | tested |
| S3-054 | "Single-payment corrections reject settlement members with 422 `linked_payment_immutable`." | settlements | test_corrections.py::test_settlement_members | tested |
| S3-055 | "Captures are immutable linked payments: a correction of a capture gives 422 `linked_payment_immutable`." | captures | test_corrections.py::test_capture_is_immutable | tested |
| S3-056 | "A stage-3 service must accept exports produced by the same team's stage-1 or stage-2 service. The ledger must import and account for authorizations and captures." | import | test_snapshots_holds_import.py::test_earlier_stage_exports_import | tested |

## Historical holds

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-058 | "For `GET /me?as_of=T&known_at=K`, all four money fields describe that same view: `balance = total`, `available = total - held`." | holds | test_snapshots_holds_import.py::test_hold_lifecycle_in_history | tested |
| S3-059 | "A hold starts at authorization creation; nonfinal capture reduces it at capture time; final capture, void or expiry releases the remainder at that event's time. Expiry takes effect at `expires_at`." | holds | test_snapshots_holds_import.py::test_closed_at_on_final_capture_and_expiry<br>test_snapshots_holds_import.py::test_hold_lifecycle_in_history | tested |
| S3-060 | "Events other than clock expiry are known at their server-assigned event time. Once creation is known, the expiry deadline is known too." | holds | test_snapshots_holds_import.py::test_known_at_hides_later_events | tested |
| S3-061 | "For queries beyond now, an open hold expires at its deadline. Without `as_of`, use the instant the request began." | holds | test_snapshots_holds_import.py::test_future_as_of_expires_open_holds | tested |
| S3-063 | "Authorizations expose `closed_at` (null while open; event time when closed)." | holds | test_snapshots_holds_import.py::test_closed_at_on_final_capture_and_expiry<br>test_snapshots_holds_import.py::test_hold_lifecycle_in_history | tested |
| S3-064 | "A correction is rejected with 409 `historical_overdraft` if it makes either total or available negative at any past effective/event boundary, under the latest known revisions. Current unaffordable debits still take precedence as `insufficient_funds`." | holds | test_snapshots_holds_import.py::test_insufficient_funds_takes_precedence<br>test_snapshots_holds_import.py::test_overdraft_through_a_hold | tested |
| S3-065 | "Seeded open holds are assumed created at reset unless `created_at` is supplied; seeded closed holds need not reconstruct a prior lifecycle." | holds | test_s3_review_additions.py::test_seeded_authorization_time<br>test_s3_review_additions.py::test_seeded_authorization_time_valid<br>test_snapshots_holds_import.py::test_seeded_hold_times | tested |
| S3-066 | "`GET /statement` still contains money movements only: authorization, release and expiry are not payments. Captures appear exactly once with their links." | holds | test_corrections.py::test_capture_is_immutable<br>test_snapshots_holds_import.py::test_statement_money_movements_only | tested |
| S3-067 | "Old snapshots remain unchanged after any lifecycle action or correction." | holds | test_snapshots_holds_import.py::test_snapshot_unchanged_after_lifecycle | tested |

## State and idempotency

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-068 | §10 continues to apply to the new state: export/import keeps revisions (amounts, `effective_at`, `recorded_at`, reasons), correction receipts and replays, payment `created_at`, `closed_at`. Edited exports that break these (receipt fields, revision order and times, ranges) are 422 | import | test_s3_review_additions.py::test_imported_authorization_created_in_future<br>test_snapshots_holds_import.py::test_corrections_survive_import<br>test_snapshots_holds_import.py::test_edited_correction_receipt_fields<br>test_snapshots_holds_import.py::test_edited_revision_times_refused<br>test_snapshots_holds_import.py::test_edited_revisions_refused<br>test_snapshots_holds_import.py::test_import_with_future_payment_time_refused | tested |
| S3-069 | §7 on the eighth path: a missing key is 400 `missing_idempotency_key`; keys are per user; a claimed key is resolved before field validation and current-resource checks; a failed correction claims no key | corrections | test_corrections.py::test_correction_needs_a_key<br>test_corrections.py::test_correction_replay<br>test_corrections.py::test_failed_correction_claims_no_key | tested |

## Rows added after review (coordinator, stage 3)

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S3-070 | Stage 2: "Every `409 insufficient_funds` ... is now evaluated against `available`"; stage 3: "Current unaffordable debits still take precedence" — a correction debit within `total` but above `available` (an open hold) is 409 `insufficient_funds` | corrections | test_s3_review_additions.py::test_correction_debit_judged_against_available_receiver<br>test_s3_review_additions.py::test_correction_debit_judged_against_available_sender | tested |
| S3-071 | "Invalid input is 422 `validation_failed`" with §5 — wrong JSON types in a correction body (decision D3-8); a body that does not parse is 400 `malformed_request` | corrections | test_s3_review_additions.py::test_amount_wrong_type_is_422<br>test_s3_review_additions.py::test_unparseable_correction_body<br>test_s3_review_additions.py::test_wrong_types | tested |
| S3-072 | D3 with S3-005: a seeded payment or authorisation `created_at` that is not an RFC 3339 instant with an offset, or (authorisations, by analogy) in the future, is 422 from reset with no change; the same on import | fixture | test_s3_review_additions.py::test_imported_authorization_created_in_future<br>test_s3_review_additions.py::test_seeded_authorization_time<br>test_s3_review_additions.py::test_seeded_authorization_time_valid<br>test_s3_review_additions.py::test_seeded_payment_time_format | tested |
| S3-073 | §5 "No such resource": `GET /payments/{id}/revisions` on an unknown payment is 404 `not_found` | revisions | test_s3_review_additions.py::test_revisions_unknown_payment | tested |
| S3-074 | "Both query instants may be in the future" with the stage-2 fixed-bound ruling (max clock 9899-12-30T23:59:59.999Z): `as_of`, `known_at`, `from`, `to` and `effective_at` far in the future or past never give a 5xx, a non-RFC 3339 timestamp or a changed echo; an instant beyond the representable range is 422 or handled | instants | test_s3_review_additions.py::test_edge_effective_at<br>test_s3_review_additions.py::test_edge_query_instants | tested |

## Decisions (test-designer, stage 3)

Stage-1 (D1–D12) and stage-2 (D2-1..D2-9) decisions still apply.

- **D3-1 Window parameters.** `from` and `to` are instants, like `as_of` and `known_at`. A naive
  time, a bare date or an empty value is 422 `validation_failed`, by §5's "invalid format" rule.
- **D3-2 "Not later than now".** A correction's `effective_at` up to the moment of the request is
  valid. Tests send instants clearly in the past, or at least 60 s ahead, and nothing within a
  second of now.
- **D3-3 Exact echo.** `as_of` and `known_at` come back as the identical string sent, offset
  spelling included (`+02:00` stays `+02:00`; `Z` stays `Z`).
- **D3-4 Timing.** Tests that depend on server-assigned times read those times from responses
  (`created_at`, `recorded_at`, `committed_at`, `closed_at`) and query relative to them, never to
  the test machine's clock. Where boundaries matter they pass an explicit `to`.
- **D3-5 Not tested.** `from` later than `to`; snapshot tokens across an import; the order of
  checks when one correction breaks several rules, except where the spec states it
  (`insufficient_funds` before `historical_overdraft`).
- **D3-6 Correction of request payments.** A payment made by paying a request is an ordinary
  payment, not a linked one. Its sender may correct it.
- **D3-8 Wrong types in a correction body.** The section's "Invalid input is 422" and §5's
  "a field of the wrong JSON type" → 400 both describe a number, null or boolean in
  `expected_revision`, `effective_at` or `reason`, so either 400 `malformed_request` or 422
  `validation_failed` is accepted there. `amount` follows §5's endpoint rule (strings and
  booleans are 422). A body that does not parse is 400 `malformed_request`.
- **D3-7 S1-R17 stands.** No stage-3 rule needs balances or totals above 2^53. Historical views
  are bounded by the same totals.

## Validity check (stage 3)

The stage-3 suite was run against a build of the accepted stage-2 revision 048a821 (`stage-2/`, in a
worktree), with `work/acceptance/run.sh <worktree>/stage-2 3 -k stage_3`.

- First run: 136 tests. 110 failed, 16 errors, 1 skipped (the stage-2 export test needs a
  stage-2 service next to a stage-3 one) and 9 passed. 3 of the passes checked nothing new,
  because the stage-2 build ignores `as_of` and seeded `created_at` as unknown fields. I fixed them:
  - `test_activity_ordering_with_seeded_times` now requires the seeded instant in the feed;
  - `test_as_of_after_latest_is_current` now requires `as_of` to be echoed;
  - `test_historical_views_sum_to_the_seed` now requires one past view to differ from the current one.
- Second run: 115 failed, 16 errors, 1 skipped, 4 passed. Those 4 check behaviour stage 3 leaves
  unchanged, and are kept as regression checks:
  - `test_seeded_without_created_at_uses_reset_time` (S3-004): omission already used reset time;
  - `test_seeded_balances_are_final` (S3-006): stage-1 balance rule;
  - `test_me_without_as_of` (S3-008): `/me` without temporal parameters;
  - `test_as_of_needs_auth`: `/me` already needs a token.
- S3-070..S3-074 tests (added after review), on the same stage-2 build: 56 tests. The first run
  passed 2:
  - `test_seeded_authorization_time_valid` was a control the stage-2 build passed by ignoring the
    seeded `created_at`. It now also requires no hold before that time, and fails there.
  - `test_imported_authorization_created_in_future` still passes on stage 2, because the stage-2
    import already refuses records stamped after the stored clock. It checks behaviour this stage
    leaves unchanged and is kept.

## The stage-2 requirement list, with each row's tests (verbatim)

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
| S2-001 | "The stage-1 requirements continue to apply, with the additions below." | stage | the whole stage-1 suite, `tests/stage_1/` (run.sh runs suites 1..N against the stage-N build) | tested |
| S2-002 | "`/` \| Balance, pay form, request form and the activity feed" | routes | test_ui.py::test_routes_reachable_by_url | tested |
| S2-003 | "`/requests` \| Incoming and outgoing requests, with pay, decline and cancel" | routes | test_ui.py::test_request_lists_and_buttons<br>test_ui.py::test_routes_reachable_by_url | tested |
| S2-004 | "`/split` \| Split form" | routes | test_ui.py::test_routes_reachable_by_url | tested |
| S2-005 | "`/signup` \| Signup" | routes | test_ui.py::test_signup_and_login_reachable_signed_out | tested |
| S2-006 | "`/login` \| Login" | routes | test_ui.py::test_signup_and_login_reachable_signed_out | tested |
| S2-007 | "Other screens must be reachable through the UI." (`/authorizations` from the navigation) | routes | test_ui.py::test_authorizations_reachable_through_the_ui | tested |
| S2-008 | "Server-side and client-side rendering are both permitted." | routes | — | not testable: states a freedom |
| S2-009 | "The browser and the API share `/requests`. Return the UI for `Accept: text/html`; API requests without that header receive JSON." | routes | test_authorizations_api.py::test_html_for_browsers_json_otherwise | tested |
| S2-010 | "The UI must expose the `data-testid` attributes listed below" | routes | test_ui.py::test_routes_reachable_by_url | tested |

## Product and visual direction

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-011 | "feel like a coherent, presentation-ready consumer finance product, not a test harness with controls attached. Aim for a calm, trustworthy character." | quality | — | not testable: judged (product-designer screen review) |
| S2-012 | "Available funds must be the clearest monetary value once holds exist, with total and held funds visibly secondary." | quality | test_ui.py::test_available_is_the_headline | tested |
| S2-013 | "status, direction, privacy and money movement should be understandable without interpreting raw API data." | quality | test_ui.py::test_no_raw_identifiers_or_timestamps | tested |
| S2-014 | "Use a consistent visual system for typography, spacing, colour, controls and feedback." | quality | — | not testable: judged (product-designer screen review) |
| S2-015 | "Primary actions must be easy to identify." | quality | — | not testable: judged (product-designer screen review) |
| S2-016 | "Available, held, pending, loading, successful, refused and uncertain states must be visually distinct" | quality | test_ui.py::test_available_is_the_headline<br>test_ui.py::test_error_and_uncertain_look_different | tested |
| S2-017 | "Format people, amounts and timestamps for people first; expose technical identifiers only where they help the user." | quality | test_ui.py::test_no_raw_identifiers_or_timestamps | tested |
| S2-018 | "clear and usable at a 375 CSS-pixel viewport and at conventional desktop widths, without horizontal page scrolling." | quality | test_ui.py::test_no_horizontal_scroll | tested |
| S2-019 | "Inputs need visible labels" | quality | test_ui.py::test_inputs_have_visible_labels | tested |
| S2-020 | "keyboard focus must be apparent" | quality | test_ui.py::test_keyboard_focus_is_visible | tested |
| S2-021 | "text and controls need sufficient contrast." (decision D2-3: WCAG AA 4.5:1 for text) | quality | test_ui.py::test_text_contrast | tested |
| S2-022 | "Provide considered empty, loading and error states" | quality | test_ui.py::test_empty_states_say_something | tested |
| S2-023 | "keep navigation consistent across the required routes." | quality | test_ui.py::test_authorizations_reachable_through_the_ui<br>test_ui.py::test_navigation_is_consistent | tested |
| S2-024 | "A custom illustration, brand asset or exact visual match to a reference is not required." | quality | — | not testable: states a freedom |

## Signup and login

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-025 | "`signup-email`, `signup-password`, `signup-display-name` \| Inputs"; "`signup-submit` \| Button" | auth UI | test_ui.py::test_bad_signup<br>test_ui.py::test_signup_signs_in | tested |
| S2-026 | "`login-email`, `login-password`, `login-submit` \| Inputs and button" | auth UI | test_ui.py::test_bad_login | tested |
| S2-027 | "`auth-error` \| Error message. Present only when there is one" | auth UI | test_ui.py::test_auth_error_absent_until_an_error<br>test_ui.py::test_bad_login<br>test_ui.py::test_bad_signup | tested |
| S2-028 | "`current-user` \| Visible on every screen when signed in. Text contains the display name" | auth UI | test_ui.py::test_current_user_on_every_screen<br>test_ui.py::test_signup_signs_in | tested |
| S2-029 | "`current-handle` \| Text is exactly the caller's handle, with no `@` and no surrounding words" | auth UI | test_ui.py::test_current_user_on_every_screen<br>test_ui.py::test_signup_signs_in | tested |
| S2-030 | "`logout-button` \| Button" (signs the user out) | auth UI | test_ui.py::test_logout | tested |

## Balance and pay — `/`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-031 | "`wallet-balance` \| Text is exactly the formatted amount. Carries `data-amount="{minor units}"`" | wallet UI | test_ui.py::test_wallet_balance_format | tested |
| S2-032 | "`pay-handle`, `pay-amount`, `pay-note` \| Inputs. `pay-amount` is a **decimal** string as a person would type it" | pay UI | test_ui.py::test_pay_moves_money_and_refreshes | tested |
| S2-033 | "`pay-visibility` \| Selects `public` or `private`. Option values are those two strings" | pay UI | test_ui.py::test_visibility_options | tested |
| S2-034 | "`pay-submit` \| Button" (sends the payment) | pay UI | test_ui.py::test_pay_moves_money_and_refreshes | tested |
| S2-035 | "`pay-error` \| Error message, when the payment is refused — including insufficient funds" | pay UI | test_ui.py::test_pay_error_on_refusal<br>test_ui.py::test_refused_payment_refreshes_and_keeps_inputs | tested |
| S2-036 | "`request-handle`, `request-amount`, `request-note`, `request-submit` \| The request form" | request UI | test_ui.py::test_request_form_creates_a_request | tested |
| S2-037 | "`request-error` \| Error message, when the request is refused" | request UI | test_ui.py::test_bad_amount_refused_in_every_form<br>test_ui.py::test_request_error | tested |
| S2-038 | "Keep the pay form's values after success." | pay UI | test_ui.py::test_double_submit_pays_once | tested |
| S2-039 | "Submitting it again without changing a field must not send another payment: `wallet-balance` falls once, the feed contains one payment and `pay-error` is absent." | pay UI | test_ui.py::test_double_submit_pays_once | tested |
| S2-040 | "Changing a field makes the next submission a new payment request." | pay UI | test_ui.py::test_changed_field_is_a_new_payment<br>test_ui.py::test_changed_visibility_is_a_new_payment | tested |
| S2-041 | "Retries follow §7." | pay UI | test_ui.py::test_lost_payment_response | tested |
| S2-042 | "`wallet-balance` is the decimal with exactly `minor_units` decimal places, a single space, then the currency code: `100.00 EUR`. For a `minor_units` of `0` there is no decimal point at all: `1200 JPY`. Balances are never negative, so there is no sign." | format | test_ui.py::test_split_preview_jpy<br>test_ui.py::test_wallet_balance_format | tested |
| S2-043 | "With `minor_units: 2`, `15.00` and `15` both submit `1500`; `15.5` submits `1550`." | amount input | test_ui.py::test_decimal_input_other_currencies<br>test_ui.py::test_decimal_input_to_minor_units | tested |
| S2-044 | "Nonnumeric input or more than `minor_units` decimal places must show the form's error element without sending a request. For example, `15.005` is rejected rather than rounded." | amount input | test_ui.py::test_bad_amount_refused_in_every_form<br>test_ui.py::test_bad_amount_refused_without_a_request<br>test_ui.py::test_decimal_input_other_currencies | tested |

## Activity feed — `/`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-045 | "`activity-list` \| Container. Its children are newest first in the DOM"; "Two payments with equal timestamps may appear in either order." | feed UI | test_ui.py::test_feed_items | tested |
| S2-046 | "`activity-item-{payment_id}` \| One per visible payment. Carries `data-visibility="public"` or `data-visibility="private"`" | feed UI | test_ui.py::test_feed_items<br>test_ui.py::test_pay_moves_money_and_refreshes | tested |
| S2-047 | "`activity-parties-{payment_id}` \| Text contains both handles" | feed UI | test_ui.py::test_feed_items | tested |
| S2-048 | "`activity-amount-{payment_id}` \| Text is exactly the formatted amount" | feed UI | test_ui.py::test_feed_items | tested |
| S2-049 | "`activity-note-{payment_id}` \| Text is exactly the note. Present even when the note is empty" | feed UI | test_ui.py::test_feed_items | tested |
| S2-050 | "`empty-activity` \| Shown instead of the list when nothing is visible" | feed UI | test_ui.py::test_empty_activity | tested |

## Requests — `/requests`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-052 | "`incoming-list`, `outgoing-list` \| Containers" | requests UI | test_ui.py::test_request_lists_and_buttons | tested |
| S2-053 | "`request-item-{request_id}` \| One per request. Carries `data-status="{status}"`" | requests UI | test_ui.py::test_request_lists_and_buttons | tested |
| S2-054 | "`request-amount-{request_id}` \| Text is exactly the formatted amount" | requests UI | test_ui.py::test_request_lists_and_buttons | tested |
| S2-055 | "`request-pay-{request_id}` \| Button. Present only on a `pending` incoming request" | requests UI | test_ui.py::test_pay_from_requests_screen<br>test_ui.py::test_request_lists_and_buttons | tested |
| S2-056 | "`request-decline-{request_id}` \| Button. Present only on a `pending` incoming request" | requests UI | test_ui.py::test_decline_and_cancel_from_screen<br>test_ui.py::test_request_lists_and_buttons | tested |
| S2-057 | "`request-cancel-{request_id}` \| Button. Present only on a `pending` outgoing request" | requests UI | test_ui.py::test_decline_and_cancel_from_screen<br>test_ui.py::test_request_lists_and_buttons | tested |
| S2-058 | "`request-error` \| Shown when a pay, decline or cancel is refused" | requests UI | test_ui.py::test_request_cancelled_elsewhere<br>test_ui.py::test_request_error_on_refused_decline<br>test_ui.py::test_request_error_on_refused_pay | tested |
| S2-059 | "`empty-requests` \| Shown when both lists are empty" | requests UI | test_ui.py::test_empty_requests | tested |

## Split — `/split`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-060 | "`split-amount` \| Decimal input, same rule as `pay-amount`" | split UI | test_ui.py::test_bad_amount_refused_in_every_form | tested |
| S2-061 | "`split-handles` \| Text input: handles separated by commas, in order" | split UI | test_ui.py::test_split_preview | tested |
| S2-062 | "`split-note`, `split-submit` \| Input and button" | split UI | test_ui.py::test_submitted_split_matches_preview | tested |
| S2-063 | "`split-preview` \| Shows the computed shares before submitting. Contains one `split-share-{handle}` per participant" | split UI | test_ui.py::test_split_preview | tested |
| S2-064 | "`split-share-{handle}` \| Text is exactly the formatted share amount" | split UI | test_ui.py::test_split_preview<br>test_ui.py::test_split_preview_jpy | tested |
| S2-065 | "`split-error` \| Error message, when the split is refused" | split UI | test_ui.py::test_bad_amount_refused_in_every_form<br>test_ui.py::test_split_error | tested |
| S2-066 | "`split-preview` must show the shares the server would compute, by the rule in `stage-1.md` §9, before anything is posted. The preview and submitted split must have identical shares." | split UI | test_ui.py::test_split_preview<br>test_ui.py::test_submitted_split_matches_preview | tested |

## Refresh after actions

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-067 | "After any successful action, the balance, the feed and the request lists on the same page must show the new state without a manual reload." | refresh | test_ui.py::test_authorize_form<br>test_ui.py::test_capture_from_screen<br>test_ui.py::test_pay_from_requests_screen<br>test_ui.py::test_pay_moves_money_and_refreshes<br>test_ui.py::test_void_from_screen | tested |
| S2-068 | "Navigation must wait for the write to succeed before it refreshes the data." | refresh | test_ui.py::test_refresh_waits_for_a_slow_write | tested |
| S2-069 | "**There is no live-update requirement here**" | refresh | — | not testable: states a freedom |

## Competing clients and uncertain outcomes

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-070 | "Add `wallet-refresh`, a button on `/` that refreshes the balance and feed without clearing the pay form." | refresh | test_ui.py::test_wallet_refresh_keeps_the_form | tested |
| S2-071 | "**Latest refresh wins:** a delayed earlier read must not overwrite a later refresh, including when responses arrive out of order." | refresh | test_ui.py::test_latest_refresh_wins | tested |
| S2-072 | "A refused payment shows `pay-error`, refreshes the balance/feed, and preserves all pay inputs." | competing | test_ui.py::test_refused_payment_refreshes_and_keeps_inputs | tested |
| S2-073 | "A request cancelled elsewhere while its pay button is visible must show `request-error` when payment is refused and refresh the request list so the stale pay button disappears." | competing | test_ui.py::test_request_cancelled_elsewhere | tested |
| S2-074 | "If a payment response is lost, including after `POST /payments` commits, show `pay-uncertain` (nonempty text), not `pay-error`. Keep the unchanged form retryable with the **same key and body**." | uncertain | test_ui.py::test_error_and_uncertain_look_different<br>test_ui.py::test_lost_payment_response<br>test_ui.py::test_uncertain_retry_survives_edit_and_restore | tested |
| S2-075 | "Successful retry removes both error/uncertainty elements, refreshes the balance and feed, and moves money exactly once. Unknown outcomes are not confirmed rejections." | uncertain | test_ui.py::test_lost_payment_response | tested |
| S2-076 | "No background polling, live synchronization, or recovery across page reloads is required." | uncertain | — | not testable: states a freedom |
| S2-077 | "The same balance refresh rules apply to the available and held amounts introduced below." | refresh | test_ui.py::test_wallet_refresh_keeps_the_form | tested |

## Existing clients after an upgrade

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-078 | "A stage-2 service must accept an export produced by the same team's stage-1 service." | upgrade | test_fixture_import.py::test_stage1_export_imports_into_stage2<br>test_fixture_import.py::test_stage1_import_gets_default_ttl<br>test_fixture_import.py::test_stage1_split_and_settlement_replays_after_upgrade | tested |
| S2-079 | "A browser signed in before that export/import upgrade must remain signed in afterwards." (decision D2-1) | upgrade | test_ui.py::test_page_survives_export_import_under_it | tested |
| S2-162 | "A payment whose response was lost before export remains retryable after import with the same body and key; the UI must recover the original payment and refresh the imported balance." | upgrade | test_fixture_import.py::test_stage1_export_imports_into_stage2<br>test_ui.py::test_page_survives_export_import_under_it | tested |
| S2-163 | "Existing pending requests remain payable through the request screen." | upgrade | test_fixture_import.py::test_stage1_export_imports_into_stage2<br>test_ui.py::test_page_survives_export_import_under_it | tested |
| S2-164 | "No page reload or new screen is required. The form and pending retry identity must survive the upgrade." | upgrade | test_ui.py::test_page_survives_export_import_under_it | tested |

## Authorisations and captures — invariants and changed API

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-080 | "The sum of all wallet `total` values always equals the total seeded by the last reset. A hold moves no money" | holds | test_authorizations_api.py::test_me_with_holds<br>test_fixture_import.py::test_concurrent_partial_captures_never_exceed | tested |
| S2-081 | "`available = total − held` must never be negative. Held funds cannot fund new payments, authorizations or settlement net debits." | holds | test_authorizations_api.py::test_held_funds_cannot_fund_another_authorization<br>test_authorizations_api.py::test_me_with_holds<br>test_authorizations_api.py::test_payments_are_judged_against_available<br>test_authorizations_api.py::test_settlement_net_debit_judged_against_available<br>test_fixture_import.py::test_concurrent_authorize_and_pay_never_overdraw<br>test_fixture_import.py::test_concurrent_partial_captures_never_exceed<br>test_fixture_import.py::test_edited_hold_above_balance | tested |
| S2-082 | "Captures may spend the money reserved for them." | holds | test_authorizations_api.py::test_full_capture | tested |
| S2-083 | "Cumulative captures must not exceed the authorized amount. Each idempotent capture moves money once. A closed hold cannot be captured again." | holds | test_authorizations_api.py::test_capture_exceeds_remaining<br>test_authorizations_api.py::test_capture_replay_moves_money_once<br>test_authorizations_api.py::test_second_capture_after_final<br>test_fixture_import.py::test_capture_and_void_race<br>test_fixture_import.py::test_concurrent_partial_captures_never_exceed<br>test_fixture_import.py::test_edited_authorization_amount_below_captured | tested |
| S2-084 | "`GET /me` keeps `balance`, and `balance` **equals `total`**. `available` and `held` are new fields beside it. With no open holds, `balance`, `total` and `available` agree and `held` is zero" | me | test_authorizations_api.py::test_me_without_holds<br>test_fixture_import.py::test_stage1_export_imports_into_stage2 | tested |
| S2-085 | "`POST /payments` remains an immediate transfer. It must not leave an intermediate hold or require a separate capture." | payments | test_authorizations_api.py::test_payments_leave_no_hold | tested |
| S2-086 | "Every `409 insufficient_funds` in stage 1 — on `POST /payments`, `POST /requests/{id}/pay` and settlements — is now evaluated against `available`." | holds | test_authorizations_api.py::test_expiry_is_seen_by_a_write_first<br>test_authorizations_api.py::test_payments_are_judged_against_available<br>test_authorizations_api.py::test_request_pay_judged_against_available<br>test_authorizations_api.py::test_settlement_net_debit_judged_against_available | tested |
| S2-087 | "Paying a request remains immediate. Authorizing a request is out of scope." | requests | test_authorizations_api.py::test_request_pay_judged_against_available | tested |
| S2-088 | "`POST /splits` is unchanged." | splits | test_authorizations_api.py::test_splits_unchanged | tested |
| S2-089 | "There are now seven idempotent write paths: stage 1's five, authorizations and captures. The same replay rules apply independently to each." | idempotency | test_authorizations_api.py::test_authorize_idempotency<br>test_authorizations_api.py::test_authorize_needs_a_key<br>test_authorizations_api.py::test_capture_needs_a_key<br>test_authorizations_api.py::test_capture_replay_moves_money_once<br>test_authorizations_api.py::test_claimed_key_before_validation_on_new_paths<br>test_authorizations_api.py::test_seven_paths_need_keys<br>test_authorizations_api.py::test_void_needs_no_key_and_ignores_one | tested |

## Model and fixture

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-090 | "`authorization_ttl_seconds` applies to every authorisation created through the API. It defaults to 600 when omitted." | fixture | test_authorizations_api.py::test_ttl_from_fixture<br>test_fixture_import.py::test_earlier_fixture_without_authorizations<br>test_fixture_import.py::test_stage1_import_gets_default_ttl<br>test_fixture_import.py::test_ttl_must_be_positive_integer<br>test_fixture_import.py::test_ttl_survives_stage2_export_import | tested |
| S2-091 | "If supplied, it must be a positive integer number of seconds." (otherwise reset 422, decision D3) | fixture | test_fixture_import.py::test_ttl_must_be_positive_integer | tested |
| S2-092 | "Seeded authorisations carry their own absolute `expires_at` instead." | fixture | test_fixture_import.py::test_seeded_holds_reduce_available | tested |
| S2-093 | "A user's seeded `balance` is still `total`. **`available` is derived, never seeded** — the service subtracts the seeded open holds itself." | fixture | test_fixture_import.py::test_large_reset_with_holds_within_10_seconds<br>test_fixture_import.py::test_seeded_holds_reduce_available<br>test_ui.py::test_wallet_with_seeded_holds_right_after_reset | tested |
| S2-094 | "A sum of seeded unexpired open holds larger than that user's `balance` is a reset error: `422 validation_failed` from `POST /_test/reset`, changing nothing" | fixture | test_fixture_import.py::test_edited_hold_above_balance<br>test_fixture_import.py::test_large_reset_with_holds_within_10_seconds<br>test_fixture_import.py::test_seeded_holds_above_balance_are_a_reset_error<br>test_fixture_import.py::test_seeded_open_hold_already_past_expiry | tested |
| S2-095 | "Seeded `status` is `open`, `captured`, `voided` or `expired`. Only `open` holds anything." | fixture | test_fixture_import.py::test_bad_seeded_authorization_is_a_reset_error<br>test_fixture_import.py::test_edited_authorization_status<br>test_fixture_import.py::test_seeded_authorization_extra_fields_ignored<br>test_fixture_import.py::test_seeded_holds_reduce_available | tested |
| S2-096 | "An earlier fixture may omit `authorizations` altogether; omission means an empty list." | fixture | test_fixture_import.py::test_earlier_fixture_without_authorizations | tested |
| S2-097 | "An authorization whose `expires_at` is at or before now is `expired` and holds no funds. Reads and writes must reflect expiry even if no request occurred at the deadline. `GET /authorizations` must show `status: "expired"`, and `GET /me` must include the released remainder in `available`." | expiry | test_authorizations_api.py::test_authorize_defaults<br>test_authorizations_api.py::test_clock_expiry_without_any_request<br>test_authorizations_api.py::test_expiry_after_partial_capture<br>test_authorizations_api.py::test_expiry_is_seen_by_a_write_first<br>test_fixture_import.py::test_expiry_continues_after_import<br>test_fixture_import.py::test_seeded_open_hold_already_past_expiry<br>test_ui.py::test_expired_shown_without_a_write | tested |
| S2-098 | "Seeded expiry times are at least an hour from reset time, in the past or future; newly created authorizations may have shorter lifetimes." | expiry | test_authorizations_api.py::test_clock_expiry_without_any_request<br>test_fixture_import.py::test_seeded_open_hold_already_past_expiry | tested |

## API

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-099 | "`balance` and `total` are always equal. `held` is the sum of open holds, and `available` is `total − held`, never negative." (`GET /me` shape) | me | test_authorizations_api.py::test_me_with_holds<br>test_authorizations_api.py::test_me_without_holds | tested |
| S2-100 | "`POST /authorizations`: `Idempotency-Key` is required. The caller is the payer." "`note` and `visibility` are optional with the same defaults as `POST /payments`." | authorize | test_authorizations_api.py::test_authorize_defaults<br>test_authorizations_api.py::test_authorize_idempotency<br>test_authorizations_api.py::test_authorize_needs_a_key<br>test_authorizations_api.py::test_authorize_shape | tested |
| S2-101 | 201 body: authorization_id, from_user_id, from_handle, to_user_id, to_handle, amount, captured_amount 0, currency, note, visibility, status open, expires_at, payment_id null, created_at (+ remaining_amount, S2-121) | authorize | test_authorizations_api.py::test_authorize_shape | tested |
| S2-102 | "`expires_at` is `created_at` plus `authorization_ttl_seconds`." | authorize | test_authorizations_api.py::test_authorize_shape<br>test_authorizations_api.py::test_ttl_from_fixture | tested |
| S2-103 | "The caller's `available` is below `amount` \| 409 `insufficient_funds`" | authorize | test_authorizations_api.py::test_held_funds_cannot_fund_another_authorization | tested |
| S2-104 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (authorize) | authorize | test_authorizations_api.py::test_authorize_amount_rules<br>test_authorizations_api.py::test_authorize_number_spellings | tested |
| S2-105 | "`to_handle` is the caller's own handle \| 422 `self_payment`" (authorize) | authorize | test_authorizations_api.py::test_authorize_self | tested |
| S2-106 | "`note` over 200 characters, or `visibility` neither `public` nor `private` \| 422 `validation_failed`" | authorize | test_authorizations_api.py::test_authorize_note_200_emoji_verbatim<br>test_authorizations_api.py::test_authorize_note_visibility | tested |
| S2-107 | "No user has that handle \| 404 `not_found`" (authorize) | authorize | test_authorizations_api.py::test_authorize_unknown_handle | tested |
| S2-108 | "An open authorisation is **not** a feed item and never appears in `GET /activity`." | authorize | test_authorizations_api.py::test_open_authorization_not_in_feed | tested |
| S2-109 | "`POST /authorizations/{id}/capture`: `Idempotency-Key` is required. Only the receiver (the `to` party) may capture." | capture | test_authorizations_api.py::test_capture_needs_a_key<br>test_authorizations_api.py::test_capture_replay_moves_money_once<br>test_authorizations_api.py::test_full_capture<br>test_authorizations_api.py::test_only_the_receiver_captures | tested |
| S2-110 | "`amount` is optional and defaults to the authorisation's remaining amount." | capture | test_authorizations_api.py::test_omitted_amount_is_the_remainder | tested |
| S2-111 | "**a replay must send the identical body** — `{}` and `{"amount": 2000}` are different JSON values ... reusing a key across the two is 409 `idempotency_key_reuse`" | capture | test_authorizations_api.py::test_capture_replay_body_identity | tested |
| S2-112 | "Returns `201` with the created **payment**, in exactly the shape `POST /payments` returns, with `authorization_id` set to this authorisation and `request_id: null`. The payment's `amount` is the captured amount; its `note` and `visibility` are copied from the authorisation; it appears in the activity feed by the ordinary visibility rule." | capture | test_authorizations_api.py::test_full_capture<br>test_fixture_import.py::test_edited_capture_link_to_missing_authorization | tested |
| S2-113 | "Payments created without an authorisation carry `authorization_id: null`; their existing `request_id` semantics are unchanged." | capture | test_authorizations_api.py::test_payments_without_authorization_carry_null | tested |
| S2-114 | "By default the authorisation becomes `captured`, carries `captured_amount` and `payment_id`, and **releases the uncaptured remainder immediately**" | capture | test_authorizations_api.py::test_full_capture<br>test_authorizations_api.py::test_partial_final_capture_releases_remainder | tested |
| S2-115 | "**Default: one final capture per authorisation.** A second capture after a final capture is `409 authorization_not_open`." | capture | test_authorizations_api.py::test_second_capture_after_final | tested |
| S2-116 | "send `{"amount": 700, "final": false}` ... With `final: false` and an uncaptured remainder, status stays `open`; further captures are allowed up to that remainder." | capture | test_authorizations_api.py::test_extended_capture_mode | tested |
| S2-117 | "Capturing the entire remainder closes it even with `final: false`." | capture | test_authorizations_api.py::test_extended_capture_mode | tested |
| S2-118 | "A final capture closes it and releases any remainder." (also after earlier non-final captures) | capture | test_authorizations_api.py::test_final_capture_after_partials_releases_rest<br>test_authorizations_api.py::test_partial_final_capture_releases_remainder | tested |
| S2-119 | "`capture_exceeds_authorization` compares with the **remaining** amount; omitted amount defaults to that remainder." | capture | test_authorizations_api.py::test_capture_exceeds_remaining<br>test_authorizations_api.py::test_omitted_amount_is_the_remainder | tested |
| S2-120 | "`captured_amount` is cumulative; `payment_id` is the latest capture; `payment_ids` lists every capture in order." | capture | test_authorizations_api.py::test_extended_capture_mode<br>test_fixture_import.py::test_edited_authorization_amount_below_captured | tested |
| S2-121 | "Every authorization response adds `remaining_amount`: the amount still held, zero when closed." | capture | test_authorizations_api.py::test_authorize_shape<br>test_authorizations_api.py::test_extended_capture_mode | tested |
| S2-122 | "Void and expiry can close a partially captured authorization, release only the remainder, and preserve all capture records." | capture | test_authorizations_api.py::test_expiry_after_partial_capture<br>test_authorizations_api.py::test_final_capture_after_partials_releases_rest<br>test_authorizations_api.py::test_void_after_partial_capture | tested |
| S2-123 | "New fields do not change idempotency body equality." (decision D2-4) | capture | test_authorizations_api.py::test_capture_replay_body_identity | tested |
| S2-124 | "`final` is boolean, default `true`, so earlier single-capture requests retain their behavior." (wrong type → 400, §5) | capture | test_authorizations_api.py::test_final_must_be_boolean | tested |
| S2-125 | "The authorisation is not `open` \| 409 `authorization_not_open`" | capture | test_authorizations_api.py::test_second_capture_after_final | tested |
| S2-126 | "`expires_at` is at or before now \| 409 `authorization_expired`" | capture | test_authorizations_api.py::test_clock_expiry_without_any_request | tested |
| S2-127 | "`amount` above the authorisation's uncaptured remainder \| 422 `capture_exceeds_authorization`" | capture | test_authorizations_api.py::test_capture_amount_above_max_is_refused<br>test_authorizations_api.py::test_capture_exceeds_remaining | tested |
| S2-128 | "`amount` below 1, or not an integer \| 422 `validation_failed`" (capture) | capture | test_authorizations_api.py::test_capture_amount_above_max_is_refused<br>test_authorizations_api.py::test_capture_amount_rules | tested |
| S2-129 | "The caller is not the receiver \| 403 `forbidden`" | capture | test_authorizations_api.py::test_only_the_receiver_captures | tested |
| S2-130 | "Unknown authorisation \| 404 `not_found`" | capture | test_authorizations_api.py::test_capture_and_void_unknown | tested |
| S2-131 | "**Only the payer may void** ... No idempotency key" "`200` with the authorisation, `status: "voided"`, the hold released." | void | test_authorizations_api.py::test_only_the_payer_voids<br>test_authorizations_api.py::test_void<br>test_authorizations_api.py::test_void_after_partial_capture<br>test_authorizations_api.py::test_void_needs_no_key_and_ignores_one | tested |
| S2-132 | "Voiding an already-voided authorisation is `200` with the current state." | void | test_authorizations_api.py::test_void | tested |
| S2-133 | "A `captured` or `expired` one is `409 authorization_not_open`." (void) | void | test_authorizations_api.py::test_clock_expiry_without_any_request<br>test_authorizations_api.py::test_void_captured | tested |
| S2-134 | "capture and void return 403 `forbidden` when the caller is not the permitted party, including callers who are neither party." | void | test_authorizations_api.py::test_only_the_payer_voids<br>test_authorizations_api.py::test_only_the_receiver_captures | tested |
| S2-135 | "`GET /authorizations` returns only authorizations involving the caller." | list auths | test_authorizations_api.py::test_list_needs_auth<br>test_authorizations_api.py::test_list_only_own_newest_first | tested |
| S2-136 | "Authorisations where the caller is the payer or the receiver, and no others. Newest first by `created_at`." | list auths | test_authorizations_api.py::test_list_only_own_newest_first | tested |
| S2-137 | "`direction` is `outgoing` (the caller is the payer), `incoming` (the caller is the receiver), or absent for both." | list auths | test_authorizations_api.py::test_list_direction | tested |
| S2-138 | "`status` is one of the four statuses, or absent for all. An authorisation expired by the clock matches `expired`, never `open`." | list auths | test_authorizations_api.py::test_clock_expiry_without_any_request<br>test_authorizations_api.py::test_list_status | tested |
| S2-139 | "`limit`, `offset` and `has_more` behave exactly as on `GET /requests`." | list auths | test_authorizations_api.py::test_list_bad_params<br>test_authorizations_api.py::test_list_paging | tested |

## UI — authorisations and wallet

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-140 | "The UI and the API share `/authorizations`: serve HTML for `Accept: text/html` and JSON otherwise" | routes | test_authorizations_api.py::test_html_for_browsers_json_otherwise<br>test_ui.py::test_routes_reachable_by_url | tested |
| S2-141 | "`wallet-balance` \| Formatted `total`, retaining the existing display and `data-amount`" | wallet UI | test_ui.py::test_wallet_balance_format | tested |
| S2-142 | "`wallet-available` \| Formatted `available`, with `data-amount`. **Present this as the headline number**" | wallet UI | test_ui.py::test_authorize_form<br>test_ui.py::test_available_is_the_headline<br>test_ui.py::test_wallet_with_seeded_holds_right_after_reset | tested |
| S2-143 | "`wallet-held` \| Formatted `held`, with `data-amount`. Absent when `held` is zero" | wallet UI | test_ui.py::test_authorize_form<br>test_ui.py::test_wallet_held_absent_when_zero<br>test_ui.py::test_wallet_with_seeded_holds_right_after_reset | tested |
| S2-144 | "`authorize-handle`, `authorize-amount`, `authorize-note`, `authorize-visibility`, `authorize-submit` \| The authorise form. Same input rules as the pay form" | auth form UI | test_ui.py::test_authorize_form<br>test_ui.py::test_bad_amount_refused_in_every_form | tested |
| S2-145 | "`authorize-error` \| Shown when the authorisation is refused, including insufficient available funds" | auth form UI | test_ui.py::test_authorize_error<br>test_ui.py::test_bad_amount_refused_in_every_form | tested |
| S2-146 | "`authorization-list` \| Container on `/authorizations`. Children newest first in the DOM" | auths UI | test_ui.py::test_authorization_list | tested |
| S2-147 | "`authorization-item-{authorization_id}` \| Carries `data-status="{status}"`" | auths UI | test_ui.py::test_authorization_list<br>test_ui.py::test_expired_shown_without_a_write | tested |
| S2-148 | "`authorization-amount-{id}` \| Text is exactly the formatted authorised amount" | auths UI | test_ui.py::test_authorization_list | tested |
| S2-149 | "`authorization-captured-{id}` \| Formatted captured amount. Present only when `status` is `captured`" | auths UI | test_ui.py::test_authorization_list | tested |
| S2-150 | "`authorization-expires-{id}` \| Text is the RFC 3339 `expires_at`" | auths UI | test_ui.py::test_authorization_list | tested |
| S2-151 | "`authorization-capture-amount-{id}` \| Decimal input, pre-filled with the remaining amount. Present only on an incoming `open` authorisation" | auths UI | test_ui.py::test_authorization_list<br>test_ui.py::test_capture_from_screen | tested |
| S2-152 | "`authorization-capture-{id}` \| Button. Present only on an incoming `open` authorisation" | auths UI | test_ui.py::test_authorization_list<br>test_ui.py::test_capture_from_screen | tested |
| S2-153 | "`authorization-void-{id}` \| Button. Present only on an outgoing `open` authorisation" | auths UI | test_ui.py::test_authorization_list<br>test_ui.py::test_void_from_screen | tested |
| S2-154 | "`authorization-error` \| Shown when a capture or a void is refused" | auths UI | test_ui.py::test_authorization_error_on_refused_capture_and_void | tested |
| S2-155 | "`empty-authorizations` \| Shown when the list is empty" | auths UI | test_ui.py::test_empty_authorizations | tested |
| S2-156 | "The UI must reflect seeded and newly created holds. Show available funds as the user's spending balance, including immediately after reset with open holds." | wallet UI | test_fixture_import.py::test_seeded_holds_reduce_available<br>test_ui.py::test_authorize_form<br>test_ui.py::test_wallet_with_seeded_holds_right_after_reset | tested |

## Concurrency and state

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-157 | "Concurrent requests must produce the same results as executing them one at a time in some order, and the requirements above hold at every read." | concurrency | test_fixture_import.py::test_capture_and_void_race<br>test_fixture_import.py::test_concurrent_authorize_and_pay_never_overdraw<br>test_fixture_import.py::test_concurrent_partial_captures_never_exceed | tested |
| S2-158 | §10 continues to apply to the new state: export/import preserves authorisations (status, amounts, captures, `expires_at`), holds and the capture/authorize idempotency records; invalid states (incl. holds above balances, contradictory capture links) are 422 | import | test_fixture_import.py::test_authorizations_survive_import_into_a_fresh_container<br>test_fixture_import.py::test_edited_authorization_amount_below_captured<br>test_fixture_import.py::test_edited_authorization_amount_out_of_range<br>test_fixture_import.py::test_edited_authorization_parties_equal<br>test_fixture_import.py::test_edited_authorization_status<br>test_fixture_import.py::test_edited_balance<br>test_fixture_import.py::test_edited_capture_link_to_missing_authorization<br>test_fixture_import.py::test_edited_duplicate_authorization<br>test_fixture_import.py::test_edited_hold_above_balance<br>test_fixture_import.py::test_edited_id_too_long<br>test_fixture_import.py::test_edited_paid_request_back_to_pending<br>test_fixture_import.py::test_edited_payment_amount<br>test_fixture_import.py::test_edited_timestamps<br>test_fixture_import.py::test_expiry_continues_after_import<br>test_fixture_import.py::test_round_trip_preserves_authorizations<br>test_fixture_import.py::test_ttl_survives_stage2_export_import<br>test_fixture_import.py::test_unedited_base_imports | tested |

## Rows added after review (coordinator, stage 2)

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-165 | "404 \| `not_found` \| No such resource" (stage-1 §5) — `POST /authorizations/{id}/void` on an unknown authorisation | void | test_authorizations_api.py::test_capture_and_void_unknown<br>test_authorizations_api.py::test_void_unknown_next_to_a_known_one | tested |
| S2-166 | "`status` is one of the four statuses"; "`limit`, `offset` and `has_more` behave exactly as on `GET /requests`" — on `GET /authorizations` an unknown `direction` or `status`, or a `limit`/`offset` out of range or not plain decimal digits, is 422 `validation_failed` | list auths | test_authorizations_api.py::test_list_bad_params<br>test_authorizations_api.py::test_list_good_params_and_filters_together | tested |
| S2-167 | D3 with S2-094 as the model ("changing nothing"): a seeded authorisation with an unknown or equal `from_user_id`/`to_user_id`, an `amount` outside 1..1000000000 or not an integer, a `status` outside the four, a missing or non-RFC 3339 `expires_at`, a note over 200 characters, a bad visibility, or a duplicate id is a reset error, 422 `validation_failed`, nothing changed; the same rules apply on import (S2-158) | fixture | test_fixture_import.py::test_bad_seeded_authorization_is_a_reset_error<br>test_fixture_import.py::test_duplicate_seeded_authorization_id<br>test_fixture_import.py::test_edited_authorization_amount_out_of_range<br>test_fixture_import.py::test_edited_authorization_parties_equal<br>test_fixture_import.py::test_edited_duplicate_authorization<br>test_fixture_import.py::test_seeded_authorization_at_the_bounds_is_valid | tested |
| S2-168 | S2-078 / S2-158 / S2-090: a stage-1 export imported into stage 2 gets `authorization_ttl_seconds` 600 and no authorisations; a stage-2 export/import keeps the fixture's `authorization_ttl_seconds` for authorisations created after the import | upgrade | test_fixture_import.py::test_stage1_import_gets_default_ttl<br>test_fixture_import.py::test_ttl_survives_stage2_export_import | tested |

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

## Validity check (stage 2)

The stage-2 suite was run against a build of the accepted stage-1 revision 56fce58 (`stage-1/`,
in a worktree), using `ACCEPTANCE_UI_TIMEOUT_MS=1500 work/acceptance/run.sh <worktree>/stage-1 2`.
That build lacks all stage-2 behaviour.

- First run: 269 of 272 stage-2 tests failed or errored. 2 upgrade tests skipped, because a stage-1
  folder has no previous stage. 3 passed, because they checked only that an unknown resource is
  404, which the stage-1 build gives for every missing endpoint. I fixed those 3 to first show the
  new endpoint working (`test_authorize_unknown_handle`, both `test_capture_and_void_unknown` cases).
- I then ran the 2 upgrade tests with the stage-1 build as both the previous and the target service.
  `test_stage1_split_and_settlement_replays_after_upgrade` passed, because it checked only stage-1
  replays. I fixed it to also require the stage-2 `/me` fields and an authorisation.
- After the fixes, the changed tests and the no-scroll tests (now anchored on each screen's own
  element) all fail on the stage-1 build: 17 of 17.
- Result: no stage-2 test passes on the stage-1 build. The stage-1 suite itself (`tests/stage_1/`)
  passes there, 554/554. That is S2-001, which this stage leaves unchanged.
- S2-165..S2-168 tests (added after review): all 55 selected cases fail or error on the stage-1
  build (47 failed, 8 errors).

## The stage-1 requirement list, with each row's tests (verbatim)

# Stage 1 — requirement list

Source: `pocketful/spec/stage-1.md` (read-only). One row per testable requirement.
Status values: open, tested, passing, failing, disputed, not testable (with the reason).
Tests are named `file::function` under `work/acceptance/tests/stage_1/`.

## §1 Scope and invariants

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-001 | "The sum of wallet balances always equals the total seeded by the last `POST /_test/reset`." | invariants | test_export_import.py::test_export_is_an_atomic_snapshot_under_writes<br>test_load.py::test_random_payments_among_ten_wallets<br>test_load.py::test_ring_of_three_wallets<br>test_load.py::test_settlements_and_payments_at_once<br>test_model_fixture.py::test_seeded_total_is_the_last_reset<br>test_splits_feed.py::test_paid_splits_conserve_the_total | tested |
| S1-002 | "No wallet balance may be negative, including transiently." | invariants | test_export_import.py::test_export_is_an_atomic_snapshot_under_writes<br>test_load.py::test_drain_one_wallet_in_parts<br>test_load.py::test_random_payments_among_ten_wallets<br>test_load.py::test_ring_of_three_wallets<br>test_load.py::test_settlements_and_payments_at_once<br>test_settlements.py::test_settlement_never_overdraws_any_wallet | tested |
| S1-003 | "A payment request may move money at most once." | invariants | test_idempotency.py::test_concurrent_identical_requests<br>test_load.py::test_one_request_paid_by_fifty_keys<br>test_load.py::test_pay_decline_and_cancel_race<br>test_payments_requests.py::test_pay_replay_after_paid | tested |
| S1-004 | "All amounts are exact integer counts of minor units." | invariants | test_model_fixture.py::test_balances_near_two_to_the_53_stay_exact<br>test_model_fixture.py::test_integral_number_forms_are_the_same_amount | tested |
| S1-005 | "Money moves only between existing wallets." | invariants | test_model_fixture.py::test_money_moves_only_between_existing_wallets | tested |

## §2 Delivery and deployment

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-006 | "Deliver an HTTP service, a `Dockerfile` and a `RUN.md` with a command that builds and starts the service without manual setup." | delivery | test_runtime.py::test_stage_folder_has_dockerfile_and_run_md_with_a_command | tested |
| S1-007 | "The image must run on its own with `-e PORT=<port>` and a port mapping." | delivery | test_runtime.py::test_service_runs_alone_with_port_env_and_a_mapping | tested |
| S1-008 | "Runtime networking has no outbound access." | delivery | — | not testable by this suite: the suite reaches the service through a published port, and Docker cannot publish ports from a network-less container; the harness `--mode isolated` run covers it |
| S1-009 | "All runtime dependencies, initialization and seed data must work within that single container. Compose configuration is not used to start the service." | delivery | test_runtime.py::test_service_runs_alone_with_port_env_and_a_mapping | tested |
| S1-010 | "CPU \| 2 vCPU" / "Memory \| 2 GiB" | limits | test_runtime.py::test_service_runs_alone_with_port_env_and_a_mapping | tested |
| S1-011 | "Start to first healthy response \| 60 s" | limits | test_runtime.py::test_first_healthy_response_within_60_seconds | tested |
| S1-012 | "Concurrent requests \| up to 50 in flight" | limits | test_idempotency.py::test_concurrent_identical_requests<br>test_load.py::test_fifty_in_flight_on_a_large_state<br>test_load.py::test_random_payments_among_ten_wallets | tested |
| S1-013 | "Per-request timeout \| 5 s (10 s for `POST /_test/reset`)" | limits | test_export_import.py::test_large_export_and_import_within_10_seconds<br>test_load.py::test_fifty_in_flight_on_a_large_state<br>test_load.py::test_large_fixture_resets_within_10_seconds_and_logs_in<br>test_load.py::test_random_payments_among_ten_wallets<br>test_load.py::test_reset_of_1000_users_with_distinct_passwords_within_10_seconds<br>test_load.py::test_ring_of_three_wallets | tested |
| S1-014 | "Disk \| ephemeral; state need not survive a container restart" | limits | — | not testable: states a freedom, not an obligation |
| S1-015 | "Runtime assets and dependencies must be included in the image." | delivery | — | not testable by this suite: same reason as S1-008 (needs a container with no outbound network) |

## §3 Runtime contract

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-016 | "Listen on `0.0.0.0` using the `PORT` environment variable, default `8080`." | runtime | test_runtime.py::test_default_port_is_8080<br>test_runtime.py::test_service_runs_alone_with_port_env_and_a_mapping | tested |
| S1-017 | "GET /health  ->  200  {"status": "ok"}" | health | test_runtime.py::test_health_body_and_no_auth<br>test_runtime.py::test_health_ignores_a_bad_token | tested |
| S1-018 | "Return 200 once the service and its data store can serve requests, within 60 seconds of container start." | health | test_runtime.py::test_first_healthy_response_within_60_seconds | tested |
| S1-019 | "Replace all service state with the fixture in the request body (§4)." → 204 No Content | reset | test_load.py::test_large_fixture_resets_within_10_seconds_and_logs_in<br>test_runtime.py::test_reset_returns_204_with_no_auth | tested |
| S1-020 | "When reset returns 204, subsequent requests must see only that fixture." | reset | test_export_import.py::test_reset_clears_imported_state<br>test_runtime.py::test_reset_replaces_everything<br>test_runtime.py::test_token_from_before_a_reset_is_unauthenticated | tested |
| S1-021 | "Repeated resets are supported." | reset | test_model_fixture.py::test_seeded_total_is_the_last_reset<br>test_runtime.py::test_repeated_resets | tested |
| S1-022 | "This test endpoint must be enabled in the delivered image and requires no authentication." | reset | test_runtime.py::test_reset_ignores_a_bogus_authorization_header<br>test_runtime.py::test_reset_returns_204_with_no_auth | tested |
| S1-023 | "Requests and responses are `application/json; charset=utf-8`." | conventions | test_runtime.py::test_health_body_and_no_auth<br>test_runtime.py::test_responses_are_json_utf8<br>test_runtime.py::test_utf8_body_is_read_as_utf8 | tested |
| S1-024 | "Timestamps in responses are RFC 3339 with an explicit offset" | conventions | test_runtime.py::test_timestamps_have_explicit_offsets | tested |
| S1-025 | "Unknown fields in a request body are ignored, never an error." | conventions | test_model_fixture.py::test_fixture_fields_outside_the_format_are_ignored<br>test_payments_requests.py::test_requester_cannot_be_forged<br>test_runtime.py::test_unknown_body_fields_are_ignored_everywhere<br>test_settlements.py::test_unknown_fields_ignored | tested |
| S1-026 | "Unknown query parameters are ignored." | conventions | test_runtime.py::test_unknown_query_parameters_are_ignored<br>test_splits_feed.py::test_activity_ignores_request_filters | tested |
| S1-027 | "IDs are opaque strings of at most 64 characters." | conventions | test_review_additions.py::test_generated_ids_never_collide_with_seeded_ids<br>test_runtime.py::test_ids_are_strings_of_at_most_64_characters | tested |

## §4 Model

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-028 | "The service has **one currency**, declared in the fixture." | model | test_export_import.py::test_currency_survives<br>test_model_fixture.py::test_one_currency_from_the_fixture | tested |
| S1-029 | "JSON `1000`, `1000.0` and `1e3` all represent the same valid minor-unit amount." | amounts | test_model_fixture.py::test_integral_forms_at_the_maximum_are_valid<br>test_model_fixture.py::test_integral_number_forms_are_the_same_amount<br>test_review_additions.py::test_response_amounts_are_integers | tested |
| S1-030 | "Booleans and strings are not numbers here." | amounts | test_model_fixture.py::test_non_numbers_and_non_integral_amounts_are_422 | tested |
| S1-031 | "Every user has a **handle**: unique across the service, matching `^[a-z0-9_]{1,20}$`, and never changing once set." | handles | test_load.py::test_concurrent_signups_one_handle<br>test_model_fixture.py::test_fixture_handle_outside_the_pattern_is_a_reset_error<br>test_model_fixture.py::test_fixture_with_duplicate_handles_is_a_reset_error<br>test_model_fixture.py::test_handle_is_derived_per_character<br>test_model_fixture.py::test_handle_never_changes<br>test_model_fixture.py::test_seeded_handles_are_reported<br>test_payments_requests.py::test_handle_that_cannot_exist<br>test_review_additions.py::test_signup_user_ids_never_collide_with_seeded_ids | tested |
| S1-032 | "Users identify recipients by handle." | handles | test_model_fixture.py::test_handle_never_changes | tested |
| S1-033 | "Seeded users take their handle from the fixture." | handles | test_model_fixture.py::test_seeded_handles_are_reported | tested |
| S1-034 | "take the local part, lowercase it, replace every character outside `[a-z0-9_]` with `_`, and truncate to 20 characters." | handles | test_model_fixture.py::test_handle_is_derived_per_character | tested |
| S1-035 | "If that handle is already taken the signup fails" | handles | test_load.py::test_concurrent_signups_one_handle<br>test_model_fixture.py::test_two_emails_deriving_one_handle | tested |
| S1-036 | "New users start with a balance of `0`. They can receive money and be asked for money immediately." | users | test_model_fixture.py::test_new_user_starts_at_zero_and_can_receive_and_be_asked | tested |
| S1-037 | "A **payment** moves money from one wallet to another, immediately and atomically." | payments | test_model_fixture.py::test_payment_moves_money_immediately | tested |
| S1-038 | "A request is `pending`, and then exactly one of `paid`, `declined` or `cancelled`." | requests | test_load.py::test_pay_decline_and_cancel_race<br>test_model_fixture.py::test_request_status_moves_once_from_pending | tested |
| S1-039 | "Only the payer may pay or decline it; only the requester may cancel it." | requests | test_model_fixture.py::test_only_payer_pays_or_declines_only_requester_cancels | tested |
| S1-040 | "**A request may exceed the payer's balance.** That is a legal state, not an error at creation time" | requests | test_model_fixture.py::test_request_above_payer_balance_is_created | tested |
| S1-041 | "an attempt to pay it while short is `409 insufficient_funds` and changes nothing. Money can arrive later and the same request then becomes payable." | requests | test_export_import.py::test_pending_request_still_payable_after_import<br>test_model_fixture.py::test_seeded_pending_request_is_payable_and_cancelled_is_not<br>test_model_fixture.py::test_short_payer_gets_409_then_pays_once_funded | tested |
| S1-042 | "**Visibility belongs to the payment, not the request.** The payer chooses it when the money moves." | visibility | test_model_fixture.py::test_payer_chooses_visibility_when_money_moves<br>test_payments_requests.py::test_pay_visibility | tested |
| S1-043 | "A request carries no visibility of its own and never appears in anyone else's feed." | visibility | test_model_fixture.py::test_request_has_no_visibility_and_is_never_in_a_feed | tested |
| S1-044 | "A payment appears for a caller **if and only if** its `visibility` is `public`, **or** the caller is its sender or its receiver." | feed | test_model_fixture.py::test_seeded_payments_follow_the_feed_rule<br>test_settlements.py::test_members_follow_feed_visibility<br>test_splits_feed.py::test_feed_if_and_only_if | tested |
| S1-045 | "Requests never appear in the activity feed" | feed | test_splits_feed.py::test_requests_never_in_the_feed | tested |
| S1-046 | "`GET /requests`, which returns only requests where the caller is the requester or the payer." | requests | test_payments_requests.py::test_list_only_own_newest_first<br>test_splits_feed.py::test_requests_list_never_leaks | tested |
| S1-047 | "A split is not a feed item. The requests it creates are visible to their own two parties, and the payments that eventually fulfil them follow the rule above." | feed | test_splits_feed.py::test_split_is_not_a_feed_item | tested |
| S1-048 | "Visibility is **one value on the payment**, seen identically by both parties and by everyone else." | visibility | test_splits_feed.py::test_feed_if_and_only_if<br>test_splits_feed.py::test_private_is_shown_to_the_receiver | tested |
| S1-049 | "A `private` payment is hidden from third parties, not from its own receiver." | visibility | test_model_fixture.py::test_seeded_payments_follow_the_feed_rule<br>test_splits_feed.py::test_feed_if_and_only_if<br>test_splits_feed.py::test_private_is_shown_to_the_receiver | tested |
| S1-050 | "`amount` is at most `1000000000` on any single request" | amounts | test_model_fixture.py::test_amounts_above_the_maximum_are_refused_exactly<br>test_model_fixture.py::test_integral_forms_at_the_maximum_are_valid | tested |
| S1-051 | "no operation produces a balance outside ±2⁵³. Monetary arithmetic must preserve exact minor-unit values without rounding error." | amounts | test_export_import.py::test_import_with_an_amount_above_two_to_the_53_is_refused_or_exact<br>test_export_import.py::test_values_near_two_to_the_53_round_trip<br>test_model_fixture.py::test_amounts_above_the_maximum_are_refused_exactly<br>test_model_fixture.py::test_balances_near_two_to_the_53_stay_exact | tested |
| S1-052 | Fixture format: `currency`, `minor_units`, `users`, `payments`, `requests` as in the example | fixture | test_model_fixture.py::test_fixture_fields_outside_the_format_are_ignored<br>test_model_fixture.py::test_fixture_users_log_in_and_see_their_profile<br>test_model_fixture.py::test_seeded_ids_are_the_api_ids<br>test_model_fixture.py::test_seeded_payments_follow_the_feed_rule<br>test_model_fixture.py::test_seeded_pending_request_is_payable_and_cancelled_is_not | tested |
| S1-053 | "Seeded users must be able to log in with the given password immediately." | fixture | test_load.py::test_large_fixture_resets_within_10_seconds_and_logs_in<br>test_load.py::test_reset_of_1000_users_with_distinct_passwords_within_10_seconds<br>test_model_fixture.py::test_fixture_users_log_in_and_see_their_profile<br>test_model_fixture.py::test_seeded_password_is_the_one_given | tested |
| S1-054 | "`balance` is the wallet balance **after** every seeded payment has been applied. ... you do not replay seeded payments against balances." | fixture | test_model_fixture.py::test_seeded_balances_are_not_replayed | tested |
| S1-055 | "A `balance` below zero in a fixture is a reset error: return `422 validation_failed` from `POST /_test/reset` and change nothing." | fixture | test_model_fixture.py::test_fixture_handle_outside_the_pattern_is_a_reset_error<br>test_model_fixture.py::test_negative_seeded_balance_is_a_reset_error_and_changes_nothing | tested |
| S1-056 | "`minor_units` is `0`, `2` or `3`. Fixtures use `EUR` (2), `JPY` (0) and `BHD` (3)." | fixture | test_model_fixture.py::test_minor_units_outside_0_2_3_is_a_reset_error<br>test_model_fixture.py::test_one_currency_from_the_fixture | tested |
| S1-057 | Seeded ids are the service's ids: the `GET /me` example for fixture user `u_ada` shows `"user_id": "u_ada"` (decision D4) | fixture | test_model_fixture.py::test_seeded_ids_are_the_api_ids<br>test_review_additions.py::test_generated_ids_never_collide_with_seeded_ids | tested |

## §5 Errors

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-058 | "Every 4xx and 5xx response carries this body: `{ "error": { "code": ..., "message": ... } }`" | errors | test_errors_auth.py::test_error_body_shape_on_every_error_status<br>test_runtime.py::test_a_64_kilobyte_header_gets_status_and_error_body<br>test_runtime.py::test_unknown_path_is_404_with_error_body<br>test_runtime.py::test_unparseable_request_target_gets_an_error_body | tested |
| S1-059 | "400 \| `malformed_request` \| Unparseable body, or a field of the wrong JSON type" | errors | test_errors_auth.py::test_body_that_is_not_an_object<br>test_errors_auth.py::test_deeply_nested_body_is_refused_not_crashed<br>test_errors_auth.py::test_field_of_wrong_json_type_is_400<br>test_errors_auth.py::test_unparseable_body_is_400<br>test_review_additions.py::test_claimed_key_does_not_override_400 | tested |
| S1-060 | "400 \| `missing_idempotency_key` \| Required `Idempotency-Key` header absent or empty" | errors | test_errors_auth.py::test_empty_idempotency_key_is_400<br>test_idempotency.py::test_key_required_on_each_path<br>test_settlements.py::test_operator_needs_a_key | tested |
| S1-061 | "401 \| `unauthenticated` \| Missing, malformed or unknown bearer token" | errors | test_errors_auth.py::test_missing_malformed_or_unknown_token_is_401<br>test_errors_auth.py::test_token_of_another_user_case_changed_is_unknown<br>test_review_additions.py::test_claimed_key_does_not_override_401 | tested |
| S1-062 | "403 \| `forbidden` \| Authenticated, but not permitted to touch this resource" | errors | test_errors_auth.py::test_error_body_shape_on_every_error_status<br>test_model_fixture.py::test_only_payer_pays_or_declines_only_requester_cancels | tested |
| S1-063 | "404 \| `not_found` \| No such resource, or not visible to this caller" | errors | test_errors_auth.py::test_error_body_shape_on_every_error_status<br>test_review_additions.py::test_decline_and_cancel_unknown_request<br>test_runtime.py::test_unknown_path_is_404_with_error_body | tested |
| S1-064 | "409 \| `idempotency_key_reuse` \| Key already used by this caller with a different request body" | errors | test_idempotency.py::test_same_key_different_body_is_409 | tested |
| S1-065 | "422 \| `validation_failed` \| A required field or query parameter is missing, or a stated rule is violated with no more specific code" | errors | test_errors_auth.py::test_missing_required_field_is_422<br>test_errors_auth.py::test_signup_missing_field_is_422<br>test_model_fixture.py::test_fixture_handle_outside_the_pattern_is_a_reset_error<br>test_model_fixture.py::test_fixture_with_duplicate_handles_is_a_reset_error<br>test_model_fixture.py::test_minor_units_outside_0_2_3_is_a_reset_error<br>test_settlements.py::test_entry_missing_field<br>test_settlements.py::test_missing_transfers | tested |
| S1-066 | "A field of the correct JSON type with an invalid format or out-of-range value gives 422 `validation_failed`" | errors | test_errors_auth.py::test_non_string_note_is_422_on_every_endpoint | tested |
| S1-067 | "invalid `amount` values (including strings and booleans), non-string `note` values (including `null`), and any `visibility` other than `public` or `private` are 422 `validation_failed`." | errors | test_errors_auth.py::test_bad_visibility_is_422_on_payments_and_pay<br>test_errors_auth.py::test_non_string_note_is_422_on_every_endpoint<br>test_model_fixture.py::test_non_numbers_and_non_integral_amounts_are_422<br>test_settlements.py::test_entry_note_and_visibility_rules | tested |
| S1-068 | "Omission alone selects the optional-field defaults." | errors | test_errors_auth.py::test_omission_selects_defaults | tested |
| S1-069 | "An integer-valued **query parameter** is written as plain decimal digits: `1e9`, `4.0` and `+4` are 422 `validation_failed`" | errors | test_errors_auth.py::test_integer_query_parameters_are_plain_digits<br>test_errors_auth.py::test_plain_digit_forms_are_accepted | tested |
| S1-070 | "`Idempotency-Key` \| 1 to 255 characters \| 422 `validation_failed`" | errors | test_errors_auth.py::test_idempotency_key_length_bounds<br>test_errors_auth.py::test_idempotency_key_length_counts_characters_not_bytes<br>test_errors_auth.py::test_key_length_enforced_on_every_idempotent_path | tested |
| S1-071 | "`limit` \| integer 1 to 200 \| 422 `validation_failed`" | errors | test_errors_auth.py::test_plain_digit_forms_are_accepted<br>test_splits_feed.py::test_activity_bad_paging | tested |
| S1-072 | "`offset` \| integer 0 or more \| 422 `validation_failed`" | errors | test_errors_auth.py::test_plain_digit_forms_are_accepted<br>test_splits_feed.py::test_activity_bad_paging | tested |
| S1-073 | "Requests must not produce 5xx responses, including under concurrent load." | errors | test_errors_auth.py::test_body_that_is_not_an_object<br>test_errors_auth.py::test_deeply_nested_body_is_refused_not_crashed<br>test_load.py::test_fifty_in_flight_on_a_large_state<br>test_load.py::test_random_payments_among_ten_wallets<br>test_runtime.py::test_a_64_kilobyte_header_gets_status_and_error_body<br>test_runtime.py::test_unparseable_request_target_gets_an_error_body<br>test_splits_feed.py::test_split_with_a_thousand_unknown_participants | tested |

## §6 Authentication

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-074 | "POST /auth/signup ... ->  201  { "user_id", "display_name", "token" }" | auth | test_errors_auth.py::test_signup_and_login_shapes | tested |
| S1-075 | "POST /auth/login ... ->  200  { "user_id", "display_name", "token" }" | auth | test_errors_auth.py::test_seeded_user_login_shape<br>test_errors_auth.py::test_signup_and_login_shapes | tested |
| S1-076 | "Email already registered \| 409 `email_taken`" | auth | test_errors_auth.py::test_email_already_registered_is_409<br>test_load.py::test_concurrent_signups_one_handle | tested |
| S1-077 | "Password shorter than 8 characters \| 422 `validation_failed`" | auth | test_errors_auth.py::test_password_shorter_than_8_characters | tested |
| S1-078 | "`email` not of the form `local@domain` \| 422 `validation_failed`" | auth | test_errors_auth.py::test_email_not_local_at_domain | tested |
| S1-079 | "Wrong password or unknown email on login \| 401 `unauthenticated`" | auth | test_errors_auth.py::test_wrong_password_or_unknown_email_is_401<br>test_model_fixture.py::test_seeded_password_is_the_one_given | tested |
| S1-080 | "The handle derived from the email (§4) is already taken \| 409 `handle_taken`, and no account is created" | auth | test_errors_auth.py::test_handle_taken_creates_no_account<br>test_load.py::test_concurrent_signups_one_handle<br>test_model_fixture.py::test_two_emails_deriving_one_handle | tested |
| S1-081 | "Every other endpoint requires a bearer token, except `/health`, `/_test/reset` and the two above." | auth | test_errors_auth.py::test_auth_endpoints_need_no_token<br>test_errors_auth.py::test_missing_malformed_or_unknown_token_is_401 | tested |
| S1-082 | "Tokens do not expire. An account may have multiple valid tokens and concurrent sessions." | auth | test_errors_auth.py::test_multiple_tokens_are_all_valid | tested |
| S1-083 | "Passwords must be stored using a password-hashing function ... Plaintext password storage is not permitted." | auth | test_errors_auth.py::test_plaintext_passwords_are_not_stored<br>test_errors_auth.py::test_seeded_plaintext_passwords_are_not_stored<br>test_load.py::test_reset_of_1000_users_with_distinct_passwords_within_10_seconds | tested |

## §7 Idempotency

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-084 | "Five write paths require an idempotency key: `POST /payments`, `POST /requests`, `POST /requests/{id}/pay`, `POST /splits` and `POST /settlements`." | idempotency | test_errors_auth.py::test_key_length_enforced_on_every_idempotent_path<br>test_idempotency.py::test_key_required_on_each_path<br>test_settlements.py::test_operator_needs_a_key | tested |
| S1-085 | "The key is scoped to **the authenticated user**. Two different users may use the same key string with no interaction between them." | idempotency | test_idempotency.py::test_key_scoped_to_user<br>test_settlements.py::test_settlement_keys_are_per_operator | tested |
| S1-086 | "The same key with the same body on a different path is a different request, not a replay, and must succeed normally." | idempotency | test_idempotency.py::test_same_key_same_body_different_path_is_not_a_replay | tested |
| S1-087 | "First use of the key \| The normal response, **201**" | idempotency | test_idempotency.py::test_first_use_201_replay_200_identical_and_no_effect | tested |
| S1-088 | "Replay: same key, same body \| **200**, body identical to the original response as a JSON value" | idempotency | test_export_import.py::test_retries_survive_import<br>test_idempotency.py::test_first_use_201_replay_200_identical_and_no_effect<br>test_settlements.py::test_replay_returns_the_original_complete_response | tested |
| S1-089 | "Same key, different body \| 409 `idempotency_key_reuse`" | idempotency | test_idempotency.py::test_nested_value_change_is_a_different_body<br>test_idempotency.py::test_same_key_different_body_is_409 | tested |
| S1-090 | "Key reused after the original request failed with 4xx \| Treated as a first use" | idempotency | test_idempotency.py::test_key_after_a_4xx_is_a_first_use<br>test_idempotency.py::test_key_after_insufficient_funds_then_funded<br>test_settlements.py::test_failed_settlement_claims_no_key | tested |
| S1-091 | ""Same body" means the same JSON value after parsing — key order and whitespace do not matter." | idempotency | test_idempotency.py::test_nested_value_change_is_a_different_body<br>test_idempotency.py::test_same_json_value_with_other_key_order_and_whitespace_is_a_replay | tested |
| S1-092 | "For concurrent identical requests with an unused key, exactly one returns 201. The others return 200 with the same body. The operation takes effect only once." | idempotency | test_idempotency.py::test_concurrent_identical_requests<br>test_load.py::test_one_request_paid_by_fifty_keys | tested |
| S1-093 | "A successful replay returns the original response, even after the resource changes or is cancelled. It makes no further state changes." | idempotency | test_idempotency.py::test_first_use_201_replay_200_identical_and_no_effect<br>test_idempotency.py::test_replay_after_balance_dropped_still_200<br>test_idempotency.py::test_replay_after_the_request_changed<br>test_settlements.py::test_replay_returns_the_original_complete_response | tested |
| S1-094 | "an already claimed key is resolved before endpoint field validation or current-resource checks. Thus changing a successful request to an invalid body with the same key still returns `409 idempotency_key_reuse`." | idempotency | test_idempotency.py::test_claimed_key_resolved_before_resource_checks<br>test_idempotency.py::test_claimed_key_resolved_before_validation | tested |

## §8 API

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-095 | "`GET /me`: `{ "user_id", "display_name", "handle", "balance", "currency", "minor_units" }`" | me | test_model_fixture.py::test_fixture_users_log_in_and_see_their_profile<br>test_model_fixture.py::test_seeded_handles_are_reported<br>test_payments_requests.py::test_me_shape | tested |
| S1-096 | `POST /payments` 201 body: payment_id, from_user_id, from_handle, to_user_id, to_handle, amount, currency, note, visibility, request_id null, created_at | payments | test_payments_requests.py::test_ordinary_payment_has_null_settlement_id<br>test_payments_requests.py::test_payment_response_shape | tested |
| S1-097 | "`note` is optional and defaults to `""`. `visibility` is optional and defaults to `"public"`." | payments | test_errors_auth.py::test_omission_selects_defaults<br>test_payments_requests.py::test_note_and_visibility_defaults<br>test_settlements.py::test_entry_defaults | tested |
| S1-098 | "The caller's balance is below `amount` \| 409 `insufficient_funds`" | payments | test_idempotency.py::test_key_after_insufficient_funds_then_funded<br>test_load.py::test_drain_one_wallet_in_parts<br>test_payments_requests.py::test_insufficient_funds<br>test_payments_requests.py::test_validation_before_funds | tested |
| S1-099 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (payments) | payments | test_payments_requests.py::test_payment_amount_bounds_valid<br>test_payments_requests.py::test_payment_amount_rules<br>test_payments_requests.py::test_validation_before_funds<br>test_settlements.py::test_entry_amount_rules | tested |
| S1-100 | "`to_handle` is the caller's own handle \| 422 `self_payment`" | payments | test_payments_requests.py::test_self_payment | tested |
| S1-101 | "`note` longer than 200 characters \| 422 `validation_failed`" (payments) | payments | test_payments_requests.py::test_payment_note_length_in_characters<br>test_payments_requests.py::test_validation_before_funds<br>test_settlements.py::test_entry_note_and_visibility_rules | tested |
| S1-102 | "`visibility` is neither `public` nor `private` \| 422 `validation_failed`" | payments | test_errors_auth.py::test_bad_visibility_is_422_on_payments_and_pay<br>test_payments_requests.py::test_visibility_values<br>test_settlements.py::test_entry_note_and_visibility_rules | tested |
| S1-103 | "No user has that handle \| 404 `not_found`" (payments) | payments | test_model_fixture.py::test_money_moves_only_between_existing_wallets<br>test_payments_requests.py::test_handle_that_cannot_exist<br>test_payments_requests.py::test_unknown_handle_is_404 | tested |
| S1-104 | "The debit and the credit are one atomic step. A payment is never visible in one wallet and not the other, and a failed payment leaves no trace in either." | payments | test_model_fixture.py::test_payment_moves_money_immediately<br>test_payments_requests.py::test_debit_and_credit_are_one_step<br>test_payments_requests.py::test_insufficient_funds | tested |
| S1-105 | "`note` is stored and returned verbatim: no trimming, no escaping, no normalisation. Unicode and emoji survive a round trip byte for byte." | payments | test_payments_requests.py::test_note_round_trip_verbatim<br>test_payments_requests.py::test_request_note_round_trip_verbatim<br>test_runtime.py::test_utf8_body_is_read_as_utf8 | tested |
| S1-106 | `POST /requests` 201 body: request_id, requester_id, requester_handle, payer_id, payer_handle, amount, currency, note, status pending, payment_id null, created_at; "The caller is the requester." | requests | test_payments_requests.py::test_request_response_shape<br>test_payments_requests.py::test_requester_cannot_be_forged | tested |
| S1-107 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (requests) | requests | test_payments_requests.py::test_request_amount_bounds_valid<br>test_payments_requests.py::test_request_amount_rules | tested |
| S1-108 | "`payer_handle` is the caller's own handle \| 422 `self_request`" | requests | test_payments_requests.py::test_self_request | tested |
| S1-109 | "`note` longer than 200 characters \| 422 `validation_failed`" (requests) | requests | test_payments_requests.py::test_request_note_length | tested |
| S1-110 | "No user has that handle \| 404 `not_found`" (requests) | requests | test_payments_requests.py::test_request_unknown_handle | tested |
| S1-111 | "**The payer's balance is not checked here.** A request for more than the payer holds is created normally and sits `pending`." | requests | test_model_fixture.py::test_request_above_payer_balance_is_created<br>test_payments_requests.py::test_payer_balance_not_checked | tested |
| S1-112 | "The body carries `visibility` only, optional, default `"public"`. It is the payer's choice, not the requester's." | pay | test_model_fixture.py::test_payer_chooses_visibility_when_money_moves<br>test_payments_requests.py::test_pay_visibility | tested |
| S1-113 | "**A replay must send the identical body** — `{}` and `{"visibility": "public"}` are different JSON values, so reusing a key across the two is `409 idempotency_key_reuse`" | pay | test_payments_requests.py::test_pay_replay_needs_identical_body | tested |
| S1-114 | "Returns `201` with the created **payment**, exactly as `POST /payments` returns one, with `request_id` set to this request. The request becomes `paid` and carries the new `payment_id`." | pay | test_payments_requests.py::test_pay_returns_a_payment_and_marks_paid | tested |
| S1-115 | "The request is not `pending` \| 409 `request_not_pending`" | pay | test_load.py::test_one_request_paid_by_fifty_keys<br>test_payments_requests.py::test_not_pending_and_short<br>test_payments_requests.py::test_pay_not_pending | tested |
| S1-116 | "The payer's balance is below `amount` \| 409 `insufficient_funds`" (pay) | pay | test_model_fixture.py::test_short_payer_gets_409_then_pays_once_funded<br>test_payments_requests.py::test_not_pending_and_short<br>test_payments_requests.py::test_pay_insufficient | tested |
| S1-117 | "The caller is not the request's payer \| 403 `forbidden`" | pay | test_model_fixture.py::test_only_payer_pays_or_declines_only_requester_cancels<br>test_payments_requests.py::test_pay_by_requester_is_forbidden | tested |
| S1-118 | "Unknown request \| 404 `not_found`" | pay | test_payments_requests.py::test_pay_unknown_request | tested |
| S1-119 | "Replaying a successful payment returns 200 with its original payment body, including when the request is already `paid`. It moves no additional money and must not return `409 request_not_pending`." | pay | test_idempotency.py::test_claimed_key_resolved_before_resource_checks<br>test_payments_requests.py::test_pay_replay_after_paid | tested |
| S1-120 | "Returns `200` with the request, `status: "declined"`. Declining an already-declined request is `200` with the current state" | decline | test_payments_requests.py::test_decline | tested |
| S1-121 | "A `paid` or `cancelled` request is `409 request_not_pending`." (decline) | decline | test_payments_requests.py::test_decline_paid_or_cancelled | tested |
| S1-122 | "Not the payer is `403 forbidden`." (decline); "No idempotency key." | decline | test_model_fixture.py::test_only_payer_pays_or_declines_only_requester_cancels<br>test_payments_requests.py::test_decline<br>test_payments_requests.py::test_decline_not_payer | tested |
| S1-123 | "Returns `200` with the request, `status: "cancelled"`. Cancelling an already-cancelled request is `200`." | cancel | test_payments_requests.py::test_cancel | tested |
| S1-124 | "A `paid` or `declined` request is `409 request_not_pending`." (cancel) | cancel | test_payments_requests.py::test_cancel_paid_or_declined | tested |
| S1-125 | "Not the requester is `403 forbidden`." (cancel); "No idempotency key." | cancel | test_model_fixture.py::test_only_payer_pays_or_declines_only_requester_cancels<br>test_payments_requests.py::test_cancel<br>test_payments_requests.py::test_cancel_not_requester | tested |
| S1-126 | "Requests where the caller is the requester or the payer, and no others. Newest first by `created_at`." | list requests | test_payments_requests.py::test_list_only_own_newest_first | tested |
| S1-127 | "`direction` is `incoming` (the caller is the payer), `outgoing` (the caller is the requester) or absent for both." | list requests | test_payments_requests.py::test_direction_and_status_together<br>test_payments_requests.py::test_direction_filter<br>test_payments_requests.py::test_has_more_counts_filtered_items | tested |
| S1-128 | "`status` is one of the four statuses, or absent for all." | list requests | test_payments_requests.py::test_direction_and_status_together<br>test_payments_requests.py::test_status_filter | tested |
| S1-129 | "`limit` defaults to 50, range 1 to 200. `offset` defaults to 0 ... An unknown `direction` or `status` value is also 422." | list requests | test_payments_requests.py::test_bad_list_parameters<br>test_payments_requests.py::test_default_limit_is_50 | tested |
| S1-130 | "`has_more` is true when items exist beyond the last one returned." | list requests | test_payments_requests.py::test_default_limit_is_50<br>test_payments_requests.py::test_has_more_boundaries_and_paging<br>test_payments_requests.py::test_has_more_counts_filtered_items<br>test_splits_feed.py::test_activity_paging | tested |
| S1-131 | "`{ "requests": [ { ...request... } ], "has_more": false }`" | list requests | test_payments_requests.py::test_list_only_own_newest_first | tested |
| S1-132 | "The caller may be included in `participant_handles` or omitted. Shares follow the equal-split rule in §9, in the order the handles are given." | splits | test_splits_feed.py::test_caller_omitted<br>test_splits_feed.py::test_rounding_when_caller_is_not_first | tested |
| S1-133 | "**A request is created for every participant except the caller**, each for that participant's share, with the caller as requester." | splits | test_splits_feed.py::test_caller_omitted<br>test_splits_feed.py::test_split_requests_are_ordinary_pending_requests | tested |
| S1-134 | "`shares` covers every participant including the caller, in the order given, and always sums to `amount`. `requests` covers every participant except the caller, in the same order." (+ split_id, amount, currency, note, created_at) | splits | test_splits_feed.py::test_split_response_shape | tested |
| S1-135 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (splits) | splits | test_splits_feed.py::test_split_amount_bounds<br>test_splits_feed.py::test_split_amount_rules | tested |
| S1-136 | "`participant_handles` empty, or containing a duplicate handle \| 422 `validation_failed`" | splits | test_splits_feed.py::test_split_participants_empty_or_duplicate<br>test_splits_feed.py::test_split_with_a_thousand_unknown_participants | tested |
| S1-137 | "`note` longer than 200 characters \| 422 `validation_failed`" (splits) | splits | test_splits_feed.py::test_split_note_length | tested |
| S1-138 | "Any handle is unknown \| 404 `not_found`" (splits) | splits | test_splits_feed.py::test_split_unknown_handle<br>test_splits_feed.py::test_split_with_a_thousand_unknown_participants | tested |
| S1-139 | "A split whose only participant is the caller is **valid**: it computes one share, creates zero requests, and returns `"requests": []`." | splits | test_splits_feed.py::test_only_the_caller | tested |
| S1-140 | "Nothing about a split checks anyone's balance." | splits | test_splits_feed.py::test_split_checks_no_balance | tested |
| S1-141 | "Payments visible to the caller by the feed contract in §4, newest first by `created_at`." `{ "payments": [...], "has_more": ... }` | activity | test_splits_feed.py::test_activity_shape_and_newest_first | tested |
| S1-142 | "`limit` and `offset` behave exactly as in `GET /requests`." (activity) | activity | test_splits_feed.py::test_activity_bad_paging<br>test_splits_feed.py::test_activity_ignores_request_filters<br>test_splits_feed.py::test_activity_paging | tested |

## §9 Money and rounding

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-143 | "Shares must be whole minor units, sum exactly to `amount` and differ by at most one minor unit. When the amount does not divide evenly, the larger shares go to the first participants in `participant_handles` order." | rounding | test_splits_feed.py::test_rounding_rule<br>test_splits_feed.py::test_rounding_table<br>test_splits_feed.py::test_rounding_when_caller_is_not_first | tested |
| S1-144 | "1000 \| 3 \| 334, 333, 333" | rounding | test_splits_feed.py::test_rounding_table | tested |
| S1-145 | "1 \| 3 \| 1, 0, 0" | rounding | test_splits_feed.py::test_rounding_table | tested |
| S1-146 | "10 \| 3 \| 4, 3, 3" | rounding | test_splits_feed.py::test_rounding_table | tested |
| S1-147 | "999 \| 3 \| 333, 333, 333" | rounding | test_splits_feed.py::test_rounding_table | tested |
| S1-148 | "5 \| 5 \| 1, 1, 1, 1, 1" | rounding | test_splits_feed.py::test_rounding_table | tested |
| S1-149 | "Splitting the same amount among the same people in a different `participant_handles` order gives the extra unit to a different person." | rounding | test_splits_feed.py::test_order_moves_the_extra_unit | tested |
| S1-150 | "A share of `0` is legal and still produces a request for that participant." | rounding | test_splits_feed.py::test_zero_share_still_requests | tested |
| S1-151 | "Each split's shares are independent of previous splits. After any number of splits have been paid in full, wallet balances must still sum exactly to the seeded total." | rounding | test_splits_feed.py::test_paid_splits_conserve_the_total<br>test_splits_feed.py::test_splits_are_independent | tested |

## §10 Export and import

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-152 | "The service must support `GET /_test/export` and `POST /_test/import`. Like reset, these are unauthenticated test endpoints." | export | test_export_import.py::test_export_shape_no_auth | tested |
| S1-153 | "Return 200 from export with a JSON object containing `track: "pocketful"`, `format_version: 1` and `state` (an implementation-defined JSON object)." | export | test_export_import.py::test_export_shape_no_auth | tested |
| S1-154 | "Import takes that entire object and atomically replaces the service's state, returning 204. It must accept an unchanged export produced by this service." | import | test_export_import.py::test_import_round_trip_restores_everything | tested |
| S1-155 | "No dependency on the source process, files, volume, port or network address is allowed." | import | test_export_import.py::test_import_into_another_container | tested |
| S1-156 | "Import is replacement, not merge; repeating it restores the exported state without duplicating anything." | import | test_export_import.py::test_import_replaces_later_writes<br>test_export_import.py::test_import_twice_duplicates_nothing | tested |
| S1-157 | "Invalid JSON follows §5" (400 `malformed_request`) | import | test_export_import.py::test_import_invalid_json | tested |
| S1-158 | "missing fields, wrong track/version or an invalid state give 422 `validation_failed` without changing the destination." | import | test_export_import.py::test_import_invalid_document<br>test_export_import.py::test_import_with_an_amount_above_two_to_the_53_is_refused_or_exact | tested |
| S1-159 | "Test control calls have a 10-second timeout." | import | test_export_import.py::test_large_export_and_import_within_10_seconds | tested |
| S1-160 | "Export is an atomic, read-only snapshot; subsequent source writes do not change it." | export | test_export_import.py::test_export_is_an_atomic_snapshot_under_writes<br>test_export_import.py::test_import_replaces_later_writes | tested |
| S1-161 | "Preserve accounts and hashed-password login, existing bearer tokens, currency, balances, payments, requests, permissions, all completed idempotent request bodies and original responses." | import | test_export_import.py::test_currency_survives<br>test_export_import.py::test_import_into_another_container<br>test_export_import.py::test_import_round_trip_restores_everything<br>test_export_import.py::test_pending_request_still_payable_after_import<br>test_export_import.py::test_permissions_and_settlement_membership_survive<br>test_export_import.py::test_retries_survive_import<br>test_export_import.py::test_tokens_and_logins_survive_import<br>test_export_import.py::test_values_near_two_to_the_53_round_trip<br>test_review_additions.py::test_generated_ids_never_collide_with_imported_ids | tested |
| S1-162 | "Identities, timestamps and monetary records must not be regenerated or replayed against an already-net balance." | import | test_export_import.py::test_import_round_trip_restores_everything | tested |
| S1-163 | "Failed request keys remain reusable." | import | test_export_import.py::test_failed_keys_stay_reusable | tested |
| S1-164 | "Existing receipts, tokens and retries must remain valid after import" | import | test_export_import.py::test_import_into_another_container<br>test_export_import.py::test_retries_survive_import<br>test_export_import.py::test_tokens_and_logins_survive_import | tested |
| S1-165 | "Import removes all previous destination data and credentials." | import | test_export_import.py::test_import_replaces_later_writes | tested |
| S1-166 | "Reset clears all state, including imported state." | reset | test_export_import.py::test_reset_clears_imported_state<br>test_runtime.py::test_token_from_before_a_reset_is_unauthenticated | tested |

## §11 Atomic net settlements

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-167 | "The reset fixture may include `settlement_operator_ids`, an array of user ids, default []." | settlements | test_export_import.py::test_permissions_and_settlement_membership_survive<br>test_settlements.py::test_operator_list_defaults_to_empty<br>test_settlements.py::test_reset_sets_operator_permissions<br>test_settlements.py::test_several_operators | tested |
| S1-168 | "An operator may execute a settlement across any wallets." | settlements | test_settlements.py::test_operator_moves_money_between_other_wallets | tested |
| S1-169 | "This permission does not grant access to another user's requests or private activity items." | settlements | test_settlements.py::test_operator_gets_no_access_to_others_requests_or_private_items | tested |
| S1-170 | "`POST /settlements` requires an operator and an idempotency key. No token gives 401; authenticated non-operator gives 403 `forbidden`." | settlements | test_settlements.py::test_no_token_401_non_operator_403<br>test_settlements.py::test_operator_list_defaults_to_empty<br>test_settlements.py::test_operator_needs_a_key | tested |
| S1-171 | "transfers contains 1..32 objects." | settlements | test_settlements.py::test_malformed_batch_shape<br>test_settlements.py::test_one_and_thirty_two_transfers | tested |
| S1-172 | "Each uses ordinary payment amount, note and visibility rules (defaults: empty note, public)." | settlements | test_settlements.py::test_entry_amount_rules<br>test_settlements.py::test_entry_defaults<br>test_settlements.py::test_entry_missing_field<br>test_settlements.py::test_entry_note_and_visibility_rules | tested |
| S1-173 | "Unknown handle is 404" (settlements) | settlements | test_settlements.py::test_unknown_handle | tested |
| S1-174 | "self-transfer is 422 `self_payment`" | settlements | test_settlements.py::test_self_transfer | tested |
| S1-175 | "malformed batch shape is 422 `validation_failed`." | settlements | test_settlements.py::test_malformed_batch_shape<br>test_settlements.py::test_missing_transfers | tested |
| S1-176 | "Entry errors take precedence in input order, before insufficient funds." | settlements | test_settlements.py::test_entry_errors_in_input_order_before_funds | tested |
| S1-177 | "Unknown fields are ignored." (settlements) | settlements | test_settlements.py::test_unknown_fields_ignored | tested |
| S1-178 | "A settlement is affordable when every wallet's balance after all incoming and outgoing transfers is nonnegative." | settlements | test_settlements.py::test_affordable_by_net_position | tested |
| S1-179 | "Insufficient collective funds gives 409 `insufficient_funds`." | settlements | test_settlements.py::test_collective_shortfall_is_409_and_moves_nothing | tested |
| S1-180 | "Either all movements commit together or none do; failed validation claims no idempotency key and creates no payment or revision." | settlements | test_load.py::test_settlements_and_payments_at_once<br>test_settlements.py::test_collective_shortfall_is_409_and_moves_nothing<br>test_settlements.py::test_failed_settlement_claims_no_key<br>test_settlements.py::test_settlement_never_overdraws_any_wallet | tested |
| S1-181 | "Return 201 with `settlement_id`, `committed_at` and `payments` in input order." | settlements | test_settlements.py::test_response_shape | tested |
| S1-182 | "Every member is an ordinary payment with `settlement_id` linking the batch; nonmembers expose null for that field." | settlements | test_payments_requests.py::test_ordinary_payment_has_null_settlement_id<br>test_settlements.py::test_members_are_ordinary_payments | tested |
| S1-183 | "Members have null request_id and the same server-assigned created_at, equal to committed_at." | settlements | test_settlements.py::test_response_shape | tested |
| S1-184 | "Constituents follow ordinary activity-feed visibility. The settlement response contains every member's receipt." | settlements | test_settlements.py::test_members_follow_feed_visibility<br>test_settlements.py::test_response_shape | tested |
| S1-185 | "Replays return 200 with the original complete response." (settlements) | settlements | test_settlements.py::test_replay_returns_the_original_complete_response<br>test_settlements.py::test_settlement_keys_are_per_operator | tested |
| S1-186 | "A reset/import must preserve settlement operator permissions, original payments, requests, settlement membership and retry responses." | settlements | test_export_import.py::test_permissions_and_settlement_membership_survive<br>test_settlements.py::test_reset_sets_operator_permissions | tested |

## Rows added after review (coordinator, 2026-10-06)

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-187 | "404 \| `not_found` \| No such resource" — `POST /requests/{id}/decline` and `/cancel` on an unknown request | decline/cancel | test_review_additions.py::test_decline_and_cancel_a_payment_id<br>test_review_additions.py::test_decline_and_cancel_unknown_request | tested |
| S1-188 | "Every amount in the API is an integer count of its minor units" — response amounts are JSON integers even when the request wrote `1000.0` or `1e3` | amounts | test_review_additions.py::test_amounts_are_integers_in_the_raw_json_text<br>test_review_additions.py::test_response_amounts_are_integers | tested |
| S1-189 | "After the body has parsed as a JSON object and the caller is authenticated, an already claimed key is resolved" — a claimed key does not override 401 (missing/unknown token) or 400 `malformed_request` (unparseable body), on all five idempotent paths | idempotency | test_review_additions.py::test_claimed_key_does_not_override_400<br>test_review_additions.py::test_claimed_key_does_not_override_401<br>test_review_additions.py::test_other_users_claimed_key_is_not_theirs | tested |
| S1-190 | "IDs are opaque strings" + D4 (a seeded or imported id names one resource) — ids the service generates never collide with fixture or imported ids | conventions | test_review_additions.py::test_generated_ids_never_collide_with_imported_ids<br>test_review_additions.py::test_generated_ids_never_collide_with_seeded_ids<br>test_review_additions.py::test_signup_user_ids_never_collide_with_seeded_ids | tested |

## Decisions (test-designer)

Choices made where the requirements leave room; each test that depends on one names it.

- **D1 Tokens across a reset.** Reset "replace[s] all service state" and "Reset clears all state", so a token
  issued before a reset is `401 unauthenticated` afterwards, even when the same fixture is loaded again.
- **D2 Explicit offset.** RFC 3339 `Z` and `±hh:mm` both count as an explicit offset; a timestamp without
  any offset fails.
- **D3 Other fixture rules.** A fixture that breaks a stated rule — `minor_units` outside 0, 2, 3, a handle not
  matching `^[a-z0-9_]{1,20}$`, two users with one handle — is "a stated rule ... violated with no more
  specific code": `422 validation_failed` from reset, and the previous state is unchanged (as S1-055).
- **D4 Seeded ids.** Fixture ids are the ids the API returns (`GET /me` example: `"user_id": "u_ada"`;
  seeded `p_1` / `rq_1` are the `payment_id` / `request_id`).
- **D5 Characters.** "Characters" in length limits and in handle derivation are Unicode code points: one
  emoji is one character, not 2 UTF-16 units or 4 bytes.
- **D6 Handles outside the pattern.** A `to_handle` / `payer_handle` that cannot be a handle (`ADA`, `@ada`,
  `""`) may be 404 `not_found` or 422 `validation_failed`; the requirements do not choose.
- **D7 Third parties on a request.** pay/decline/cancel by someone who is neither party may be 403
  `forbidden` or 404 `not_found` ("not visible to this caller").
- **D8 Settlement shape versus entries.** The order between a batch-shape error and an entry error is not
  stated; tests check each alone and the stated entry-order and entry-before-funds precedence.
- **D9 Body that is not a JSON object.** A top-level array or scalar body may be 400 `malformed_request` or
  422 `validation_failed`, never 2xx or 5xx.
- **D10 Plaintext passwords.** Export "may contain credentials" but storage must be hashed, so an export
  must not contain a user's plaintext password anywhere in its text.
- **D11 Unstated defaults.** The requirements give no default `note` for `POST /requests` or `POST /splits`;
  tests always send one there.
- **D12 Field rules before funds.** An invalid `amount` or `note` is 422 even when the caller could not
  afford the payment: funds are compared with a valid amount (as §11 orders entry errors before funds).
