# Stage 2 — implementer notes

Stage 1's notes (work/stage-1/notes.md) still apply to everything stage 2 did not change.

## Design decisions

- **Holds are derived, not stored.** A user's `held` is the sum of `amount − captured_amount` over
  their open authorizations, computed when read; `available = balance − held`. Nothing caches a held
  total, so no write can leave it out of step. The cost is a scan of the open authorizations per
  check, which is small at this scale. `balance` stays the wallet total.
- **One check for "available never negative".** Money leaving a wallet (`movePayments`) and a new
  hold (`openAuthorization`) are the only two ways available can fall, and both refuse with
  `insufficient_funds` when it would go below zero. A capture first reduces the hold by the captured
  amount and then moves the money, so it can always spend what was reserved for it.
- **Expiry by sweep.** Every request first closes the open authorizations whose `expires_at` is at or
  before now (`state.expireDue`), before anything reads or writes. So a hold whose deadline passed
  with no request is already `expired` for the next request's reads (`GET /me`, `GET /authorizations`)
  and writes (capture → 409 `authorization_expired`).
- **Fixed time bounds** (ruling 2abb370; model.js):
  - `MAX_TTL_SECONDS = 3155760000`, which is 100 years of 365.25 days.
  - `MAX_CLOCK_MS = 9999-12-31T23:59:59.999Z − MAX_TTL_SECONDS`, which is 9899-12-31T23:59:59.999Z (epoch
    ms 250246540799999). It bounds the service's clock (`last_timestamp_ms`).
  - Reset and import refuse a ttl above MAX_TTL_SECONDS, or a clock above MAX_CLOCK_MS, with 422.
  - `expires_at = created_at + ttl` exactly, never clamped. The latest creation plus the longest ttl is
    the last RFC 3339 instant, so every export re-imports at any later time.
- **Capture of a closed authorization.** `expired` answers `authorization_expired` (the clock, or a
  fixture that seeded it expired, D2-5); `captured` and `voided` answer `authorization_not_open`.
  Void of `captured` or `expired` is `authorization_not_open`, as stated.
- **Capture amount above 1000000000** is `capture_exceeds_authorization`, not `validation_failed`:
  the capture table lists only "below 1, or not an integer" as validation, and no remainder can
  exceed 1000000000.
- **Seeded `captured` authorizations** count as fully captured (`captured_amount = amount`) and name
  no payment, because the fixture format has neither. Like seeded paid requests, they carry
  `seeded: true`, which import trusts (stage-1 ruling on seeded paid requests).
- **Stage-1 exports** are recognised by the absence of `authorizations` in the state. They import
  with no authorizations, the default lifetime, and `authorization_id: null` on every payment. A
  stage-2 export must carry every stage-2 field.
- **Screens are one page.** Every screen route serves `public/index.html`, which renders the route
  in the browser. `/requests` and `/authorizations` serve it only when `Accept` includes `text/html`.
  Assets are read into memory at startup, and only those files can be served.

- **Browser session** is the bearer token in `localStorage`. It survives navigation and reloads,
  and an export/import keeps the same token valid, so a signed-in browser stays signed in across
  the upgrade. A 401 from the service clears it and opens `/login`.
- **Retry identity** (`RetryIdentity`, public/assets/lib/ui.js; ruling R1, 63ae1ef). A write keeps the
  key of the body last sent:
  - Submitting again with no field changed is a replay.
  - After a confirmed answer (success or refusal), changing any field starts a new key, even if the
    value is changed back.
  - While the answer is unknown, a form restored to the sent body keeps its key, so the retry is a
    replay.
- **Unknown outcome** = the network failed, the response was lost or unreadable, or a 5xx. It shows
  the dashed uncertain line, keeps the key, and does not refresh, because nothing is known. A 4xx is
  a refusal: it shows the form's error, refreshes the data and keeps the inputs.
- **A lost read is asked again.** A GET that gets no answer within 3 s is abandoned and asked once
  more (reads change nothing). Writes are never retried by the client: their retry is the person's,
  with the same key. This came from the acceptance test test_refresh_waits_for_a_slow_write, which
  failed intermittently (3 of 15 locally). Its `unroute` can strand a read that was intercepted at
  that moment, and before this change the screen then waited forever.
- **Latest read wins.** Every read on a screen is numbered, and a response is applied only if no
  later-numbered read has already been applied. Refresh stays clickable while a read is in flight,
  so a newer click can overtake a slow one.
- **The split preview runs the server's rule**: public/assets/shared/shares.js (and rules.js, the
  model limits) are imported by the server and served to the browser under /assets/shared/.
- **Fonts and icons**: Atkinson Hyperlegible Next 400/600/800 WOFF2 and its OFL.txt are in
  public/assets (taken from googlefonts/atkinson-hyperlegible-next), and the icons are inline SVG.
  Nothing is fetched at run time.

## Unfixed non-blocking findings

- R8 (commit discipline): ab98ad7 and 4e74eea cannot be split after the fact. From round 2 on, each
  commit has one purpose.
