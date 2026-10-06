# Screen regression review — stage 4, revision 16fff73 (`stage-4/` = 7ca43e7), round 1

Reviewer: product-designer. Stage 4 adds no new or changed screens and only carries the
stage-3 screens forward. This is the stage's single regression review: it checks the carried
screens against `work/design.md` and the product constraints. **Every finding is non-blocking.**

**Verdict: no regressions. One non-blocking finding (D13) concerns how the unchanged feed
presents the new refund payments.**

## What changed under the screens

- **Unchanged:** `stage-4/public/` and `stage-4/src/pages.js` are byte-identical to `stage-3/` at
  0eaae4d.
- **New API fields:** `src/views.js` adds `refund_of` on every payment, plus
  `correction_batch_id` and the batch view. The screens do not read these fields.
- **Data change that reaches the screens:** refunds are new payments, so they now appear in the
  activity feed.

## Method

- **Build:** `stage-4/` of 16fff73, built in a worktree with Docker (tag `pd-review-16fff73`).
- **Driver:** Playwright (Chromium) at 375×812 and 1280×900.
- **Capture set:** the full set used in stages 2 and 3, which covers:
  - every route and state;
  - the longest names and handles;
  - balances up to 2^53−1 minor units in EUR, JPY and BHD;
  - lists of 230 rows;
  - the wording for every refusal code;
  - 44 px hit boxes.
- **Additional case:** the signed-in user refunds 5.00 EUR of a received payment through the
  API, then loads `/`.
- **Screenshots:** kept outside the repository, in `/tmp/pd-shots/16fff73/`.

## Results

| Check | Result |
|---|---|
| No horizontal scrolling | Pass. `scrollWidth == clientWidth` on every shot at 375 and 1280, including the 2^53−1 balances, 230-row lists and the refund case. |
| Visible labels, keyboard focus, contrast | Pass. Unchanged, with focus visible inside the plum panel. |
| Touch targets ≥44 px on phones | Pass on `/signup`, `/login`, `/`, `/requests`, `/split` and `/authorizations`. |
| States that must look different | Pass. Available, held, pending, loading, successful, refused and uncertain all look as accepted. |
| Available headline and held row | The headline keeps 40/56 px for typical balances and shrinks to fit at 2^53−1. The held row is level, and the hatch is always visible. |
| Paging | Lists of 230 activity items, 230 requests and 230 authorisations all render. |
| Feedback wording | Identical to the accepted screens for every refusal code. |
| Earlier findings D1–D12 | All still fixed. |

## Finding

**D13 (non-blocking), `/` activity feed, 375 and 1280: a refund reads as a new ordinary
payment.**

- **What the screen shows:** after the user refunds 5.00 EUR of ada's "Pizza Friday" payment, the
  feed's newest row reads "grace_okafor_lindqvi paid ada · 5.00 EUR · Sent · Today, 11:51 ·
  Private · Pizza Friday" (`375-wallet-with-refund`, `1280-wallet-with-refund`).
- **Why it matters:** the row is identical to a fresh payment with the same note. Nothing tells
  the user it gives back part of an earlier payment.
- **Requirement:** stage 2 "Product and visual direction": "status, direction, privacy and money
  movement should be understandable without interpreting raw API data".
- **Why non-blocking:** no screen requirement names refunds, every required element is correct,
  and this is the stage's regression review.
- **Fix, now written into `work/design.md` §5.3:**
  - Rows with `refund_of` keep every required element unchanged.
  - The meta line starts "Refund sent" / "Refund received" / "Refund".
  - The plate carries a return-arrow glyph instead of the direction arrow.

## Scores (1–5)

| Criterion | Score |
|---|---|
| Composition | 5 |
| Design quality | 5 |
| Distinctiveness | 4 |
| Craft | 5 |
| Function | 4 (refunds are not labelled, D13) |
| Delight | 3 |
