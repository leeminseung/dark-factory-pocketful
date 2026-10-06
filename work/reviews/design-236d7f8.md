# Screen check: stage 4, revision 236d7f8 (`stage-4/` = 8e2cb2a), round 2

Reviewer: product-designer. Non-blocking. I checked the refund rows added for D13 (57f172b)
against `work/design.md` §5.3, and checked that nothing else on `/` has regressed.

**Verdict: D13 is fixed. No regressions and no new findings.**

## Method

- Built `stage-4/` of 236d7f8 in a worktree with Docker (tag `pd-review-236d7f8`).
- Drove it with Playwright (Chromium) at 375×812 and 1280×900.
- Made three refunds through the API, one for each kind of row:
  - **Refund sent:** the signed-in user refunds 5.00 EUR of ada's private "Pizza Friday" payment.
  - **Refund received:** ada refunds 0.01 EUR of the user's private "Rounding" payment.
  - **Refund between others:** bob refunds 3.00 EUR of ada's public payment with an empty note.
- Re-ran the full capture set on the stage-4 build: every route and state, the longest names,
  balances up to 2^53−1 minor units in EUR, JPY and BHD, 44 px hit boxes and horizontal scroll.
- Screenshots are kept outside the repository, in `/tmp/pd-shots/236d7f8/`.

## D13: refund rows against §5.3, now fixed

All three rows are the same at 375 and 1280. See `375-wallet-refunds` and `1280-wallet-refunds`.

| Row | `activity-parties` | `activity-amount` | `activity-note` | Meta line | Plate glyph |
|---|---|---|---|---|---|
| Refund sent | "grace_okafor_lindqvi paid ada" | `5.00 EUR` | "Pizza Friday" | "Refund sent  Today, 12:14  Private" | return arrow |
| Refund received | "ada paid grace_okafor_lindqvi" | `0.01 EUR` | "Rounding" | "Refund received  Today, 12:14  Private" | return arrow |
| Refund between others | "bob paid ada" | `3.00 EUR` | "" (present, empty) | "Refund  Today, 12:14  Public" | return arrow |
| Ordinary payment (control) | "grace_okafor_lindqvi paid ada" | `0.01 EUR` | "Rounding" | "Sent  Today, 12:14  Private" | sent arrow |

- **Required elements are unchanged.** `activity-item-*` keeps its id and `data-visibility`.
  The parties, amount and note text are exactly as before.
- **Refund rows now read differently from fresh payments.** The meta word and the glyph change.
  Ordinary rows keep "Sent", "Received" and "Between others" with their direction arrows.
- **Feed order is unchanged.** The refunds are newest first, the seeded 2025 payment is still
  last, and no row overlaps another.

## Regression check on `/` and the other routes

| Check | Result |
|---|---|
| No horizontal scrolling | Pass on every shot at 375 and 1280. This includes the refund case and balances up to 2^53−1 in EUR, JPY and BHD. |
| Touch targets ≥44 px on phones | Pass on `/`, `/requests`, `/split` and `/authorizations`. |
| Balance panel | The headline is 56 px on desktop and shrinks to fit at 2^53−1. The held row is level and its hatch is visible. |
| States, labels, focus, contrast | Unchanged from the accepted screens. The full capture set ran without errors. |
| Earlier findings D1–D12 | All still fixed. |
