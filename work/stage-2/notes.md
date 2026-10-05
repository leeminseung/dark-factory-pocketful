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

## Unfixed non-blocking findings

(none yet)
