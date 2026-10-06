# Review brief — spec pass, revision 6a17d63 (stage 3)

## Task

Compare the stage-3 service with its requirements: the complete stage-3 specification below, with stages 1 and 2
still applying. Report:
1. requirements missing or only partly built;
2. behaviour nobody asked for;
3. requirements built but apparently wrong.

Every finding quotes, verbatim, the requirement sentence it relies on. Take the expected behaviour from the
requirement text only, never from what the code does.

Go through every sentence and rule of stage 3:
- **Payment timestamps:** seeded `created_at` (including in the future); opening balances.
- **`GET /me`:**
  - `as_of`, including inclusive bounds, before the first and after the last payment, and the exact echo;
  - `known_at`, including its echo.
- **`GET /statement`:**
  - window defaults and the half-open window;
  - ordering and tie-breaking;
  - opening, closing, delta and `balance_after` describing the full window;
  - only the caller's payments.
- **Corrections:**
  - every field rule;
  - 403, 404, `stale_revision`, replay, `idempotency_key_reuse`;
  - the money movement between the same two wallets;
  - `insufficient_funds` versus `historical_overdraft` precedence;
  - boundary handling of simultaneous movements;
  - nothing changing on failure;
  - `linked_payment_immutable` for settlement members and captures.
- **Revisions:** the endpoint and its parties.
- **The selection rule:** `known_at` and effective-time application.
- **Statement entry fields** and zero-amount revisions.
- **Snapshots:**
  - freezing, and the parameters allowed alongside a snapshot;
  - 404 cases;
  - `has_more` at the end and beyond it;
  - stability under concurrent writes.
- **Concurrent corrections** using the same expected revision.
- **Settlement history.**
- **Import of stage-1 and stage-2 exports**, including authorizations and captures.
- **Historical holds:**
  - all four money fields;
  - hold lifecycle times and expiry beyond now;
  - `closed_at`;
  - overdraft checks on total and available.

Check also that stage-1 and stage-2 behaviour is not broken in `stage-3/`, and that every invalid or empty instant
gives 422.

You may run the service to confirm a finding.

Read and run only. Write nothing to any file in the worktree, and make no commits. Return your findings as your final
answer.

## What to review

- **Worktree (read-only):** `/Users/mslee/dark-factory/band-work/worktrees/reviewer-6a17d63`.
  - `stage-3/` is the stage under review.
  - `stage-1/` and `stage-2/` are accepted earlier stages and are unchanged.
  - `stage-3/` started as a copy of `stage-2/` in commit 9c315d2.
- **Revision:** 6a17d6376e898493fd05d0fd102f0296275799e3.
- **Diff:** `git -C /Users/mslee/dark-factory/band-work/worktrees/reviewer-6a17d63 diff 9c315d2 6a17d63 -- 'stage-*'`
- **Log:** `git -C /Users/mslee/dark-factory/band-work/worktrees/reviewer-6a17d63 log --stat 9c315d2..6a17d63 -- 'stage-*'`
- **What to read:** the changed files in full where needed. Server code is in `stage-3/src/`, browser code is in
  `stage-3/public/`, and the service's own tests are in `stage-3/test/`.
- **What you may run:**
  - `cd /Users/mslee/dark-factory/band-work/worktrees/reviewer-6a17d63/stage-3 && npm test`;
  - the service, with `cd /Users/mslee/dark-factory/band-work/worktrees/reviewer-6a17d63/stage-3 && PORT=<free port> node src/main.js`.
- **Stopping what you start:** stop it before you finish, killing only the process on your own port by its PID. Never
  use pkill, killall or a name pattern.

## Answer format

For each finding, give:
- its location (file:line, or commit);
- the principle, smell or requirement it relies on, quoted verbatim with the stage and section;
- the evidence;
- whether it is blocking, and why.

A finding is blocking when it breaks a stated requirement, or when a structural problem makes a requirement fail under
a stated condition. For a blocking finding, also give exact reproduction steps, the expected result and the actual
result.

End with a short list of what you checked and found sound.

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
