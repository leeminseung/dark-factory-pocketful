# Screen regression review — stage 3, revision 6a17d63 (`stage-3/` = e6ee3d8), round 1

Reviewer: product-designer. Stage 3 adds no new or changed screens and only carries the stage-2
screens forward. This is the single regression review for the stage. It checks the carried screens
against `work/design.md` and the product constraints, and reports every finding as non-blocking.

**Verdict: no regressions. There are no findings (0 non-blocking).**

## What changed under the screens

- **Browser assets and HTML:** `stage-3/public/` and `stage-3/src/pages.js` are byte-identical to
  `stage-2/` at the accepted revision 048a821.
- **API views:** the only change in `src/views.js` adds `closed_at` to the authorisation view and
  adds the new revision view. The screens neither read nor depend on these.
- **What could still regress:** the stage-3 data model. Payments now have a seeded `created_at`,
  and balances are history-checked. The review therefore re-ran the whole stage-2 capture set
  against the stage-3 build.

## Method

- **Build:** `stage-3/` of 6a17d63 in a worktree with Docker (tag `pd-review-6a17d63`).
- **Driver:** Playwright (Chromium) at 375×812 and 1280×900.
- **Capture set:** the same scripts as the stage-2 rounds. They cover:
  - every route and state: front door, wallet, requests, split, reserved money;
  - empty, loading, error, uncertain, success and held;
  - the longest names and handles;
  - balances up to 2^53−1 minor units in EUR, JPY and BHD (`work/design.md` §10).
- **Probes:** feedback wording by refusal code; paging with 230 rows per list; 44 px hit boxes on
  every route.
- **Screenshots:** kept outside the repository, in `/tmp/pd-shots/6a17d63/`.
- **Fixture change:** the stage-2 review fixture had one user whose seeded payments implied a
  negative opening balance. Stage 3 rightly refuses that ("Seeded history is consistent and
  nonnegative"), so I corrected the fixture's balance; the product needed no change. I also
  gave one seeded payment a `created_at` in 2025 so the feed shows a date from another year.

## Results

| Check | Result |
|---|---|
| No horizontal scrolling | Pass. `scrollWidth == clientWidth` on every shot at 375 and 1280, including the 2^53−1 balances and the 230-row lists. |
| Visible labels | Pass. Unchanged. |
| Visible keyboard focus | Pass, including inside the plum panel (`*-focus-in-panel`). |
| Touch targets ≥44 px on phones | Pass. No link, button or input is under 44 px on `/signup`, `/login`, `/`, `/requests`, `/split` or `/authorizations`. |
| Contrast | Pass. The palette is unchanged. |
| States that must look different | Pass: available, held, pending, loading, successful, refused and uncertain look as in stage 2. |
| Available headline | 40/56 px for typical balances. It shrinks to fit at 2^53−1 (`375-eur-max-heldmax`), stays inside the panel, and remains the largest and heaviest figure. |
| Held row | `wallet-held` sits level with "Held for others" (D12 stays fixed), and the hatch is visible at every ratio. |
| Feed ordering and dates | The seeded 2025 payment sorts last and reads "4 Mar 2025, 02:05". Today's rows read "Today, 09:25" (`1280-wallet-held-modest`). |
| Paging | 230 activity items, 230 requests and 230 authorisations render. |
| Feedback wording | Unchanged from the accepted stage-2 screens for every refusal code. This covers pay, request, authorise, split, capture, release, signup and the uncertain box. |
| Earlier findings D1–D12 | All still fixed. |

## Scores (1–5)

Unchanged from the accepted stage-2 screens: composition 5, design quality 5, distinctiveness 4,
craft 5, function 5, delight 3.
