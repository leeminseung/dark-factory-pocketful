# Screen review — stage 2, revision 61246ed, round 3

Reviewer: product-designer. Against `work/design.md` (da39a14), the stage-2 "Product and
visual direction" and UI sections, and the product constraints. In scope this round: R15 (the
available headline at large balances), D12 (alignment of the held row) and R17 (wording of
capture and release refusals).

**Verdict: pass. There are no blocking findings. R15 is fixed, D12 is fixed, R17 reads for
people, and there is no new finding.**

## Method

- I built `stage-2/` of 61246ed in a worktree with Docker (tag `pd-review-61246ed`) and drove it
  with Playwright (Chromium) at 375×812 and 1280×900.
- I ran eight fixtures, each with an open hold so the held row shows:

  | Fixture | Balance (minor units) | Held |
  |---|---|---|
  | EUR typical | 250.00 | 40.00 |
  | EUR at ten million | 10000000.00 | 1.00 |
  | EUR at 2^53−1 | 9007199254740991 | 1.00 |
  | EUR at 2^53−1, largest hold | 9007199254740991 | 10000000.00 (largest legal authorisation) |
  | JPY typical | 1200 | 300 |
  | JPY at 2^53−1 | 9007199254740991 | 1 |
  | BHD typical | 12.345 | 1.000 |
  | BHD at 2^53−1 | 9007199254740991 | 0.001 |

- For each fixture and viewport I measured the document `scrollWidth`, the font size, weight and
  box of `wallet-available`, `wallet-balance` and `wallet-held`, and the vertical centre of
  `wallet-held` against the text of "Held for others". I also checked `scrollWidth` on
  `/requests`, `/split` and `/authorizations`.
- Screenshots are outside the repository, in `/tmp/pd-shots/61246ed/`.
- I reviewed the screens myself, as the mandate asks for a later round.
- **A gap in my earlier rounds:** R15 was found by the reviewer's probe, not by my screen review.
  The longest balance I used in rounds 1 and 2 was 999999.99 EUR, below the ten-million point
  where the headline overflowed. From this round on, my real-content set includes balances up to
  2^53−1 minor units in every currency.

## R15: the headline at every legal balance — fixed

| Fixture | 375: headline size | 375: `scrollWidth` | 1280: headline size | 1280: `scrollWidth` |
|---|---|---|---|---|
| EUR typical `210.00 EUR` | 40 px | 375 | 56 px | 1280 |
| EUR `9999999.00 EUR` | 32.9 px | 375 | 55.4 px | 1280 |
| EUR `90071992547408.91 EUR` | 21.9 px | 375 | 36.9 px | 1280 |
| EUR 2^53−1 with the largest hold | 21.9 px | 375 | 36.9 px | 1280 |
| JPY typical `900 JPY` | 40 px | 375 | 56 px | 1280 |
| JPY `9007199254740990 JPY` | 23.0 px | 375 | 38.8 px | 1280 |
| BHD typical `11.345 BHD` | 40 px | 375 | 56 px | 1280 |
| BHD `9007199254740.990 BHD` | 21.9 px | 375 | 36.9 px | 1280 |

- **No horizontal scrolling** on `/`, `/requests`, `/split` or `/authorizations` in any case.
- **The headline stays inside the plum panel** (right edge 335 at 375, 632 at 1280), on one line.
- **Typical balances keep the full 40 px and 56 px.** Shrinking starts only when the text would
  not fit.
- **At 2^53−1 on a phone,** the headline is 21.9 px at weight 800 against 16 px at weight 600
  for total and held, and 20 px for the "Send money" heading. It is still the largest and
  heaviest figure, though by less. `375-eur-max-heldmax` shows it still reads as the headline.
  This holds only for balances in the trillions; typical wallets keep the full size.

## D12: alignment of the held row — fixed

`wallet-held` and the text "Held for others" share a vertical centre in all 16 cases. For
example, 375 typical: label text centre 295, amount centre 295. 1280 typical: 225 and 225. The
44 px hit box of the link is kept (273–317). Total and its amount also stay aligned
(`375-eur-max-heldmax`, `1280-jpy-max`).

## R17: wording of capture and release refusals — reads for people

| Case | `authorization-error` |
|---|---|
| Amount `0` or `0.00` | "Enter an amount from 0.01 EUR to 25.00 EUR." |
| Amount `abc`, `1.005` or `-1` | "Enter an amount like 15.00, with up to 2 decimal places." |
| Collect after the payer released it elsewhere | "This reservation is no longer open. The list has been updated." |
| Release after the receiver collected it elsewhere | "This reservation is no longer open. The list has been updated." |

The range message uses the hold's own remaining amount as its upper bound, which is the useful
limit for the person collecting. Each message sits under the row's buttons, in the refused style
(`375-capture-zero-error`, `375-capture-after-void`, `375-release-after-capture`).

## Scores (1–5)

| Criterion | Score | Evidence |
|---|---|---|
| Composition | 5 | One plum mass per screen. The headline stays the largest figure at every legal balance. |
| Design quality | 5 | The held row and total row align, and the type scale holds from 210.00 EUR up to 2^53−1. |
| Distinctiveness | 4 | Unchanged: plum, orchid and the held hatch. |
| Craft | 5 | The headline fits every currency and length without overflow. D12 is closed. |
| Function | 5 | Refusals are worded by code with real bounds, and no route scrolls sideways. |
| Delight | 3 | Unchanged: the hatch grows when money is reserved. The slide cannot be judged from stills. |

## Checks

| Check | Result |
|---|---|
| No horizontal scrolling | Pass at 375 and 1280 for all eight fixtures on all four signed-in routes. |
| Visible labels, focus and contrast | Unchanged since round 2, with no regression in the screens shot. |
| Touch targets ≥44 px on phones | The held link keeps its 44 px hit box. |
| States that must look different | Unchanged since round 2 (pass). |

## Earlier findings

| Id | Status |
|---|---|
| D1–D11 | Fixed in round 2. No regression in this round's shots. |
| D12 | **Fixed** (237de55 and the alignment above). |
