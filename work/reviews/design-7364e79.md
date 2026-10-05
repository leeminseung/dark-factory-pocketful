# Screen review — stage 2, revision 7364e79, round 1

Reviewer: product-designer. Against `work/design.md` (1af11a0, clarified in this round; see
below), the stage-2 "Product and visual direction" and UI sections, and the product constraints.

**Verdict: pass, 0 blocking findings, 11 non-blocking (D1–D11).**

## Method

- Built `stage-2/` of 7364e79 in a worktree (`docker build`, tag `pd-review-7364e79`) and ran it
  on a free port. Drove it with Playwright (Chromium) at 375×812 and 1280×900.
- 92 screenshots, kept outside the repository (`/tmp/pd-shots/7364e79/`): `/signup`, `/login`
  (plus their errors), `/` (holds, no holds, JPY), `/requests`, `/split`, `/authorizations`, each
  with its empty, loading, error, success, uncertain and held states where they apply.
- Longest content used: display name "Maximiliane Okafor-Lindqvist", handle `grace_okafor_lindqvi`
  (20 characters), `l1_0o`, `999999.99 EUR`, a 200-character note without spaces, a seeded hold
  that expired in 2025, and a JPY wallet.
- A fresh subagent reviewed the first 77 shots from a written brief
  (`design-7364e79-brief.md`, raw answer `design-7364e79-raw.md`). I opened the screenshot behind
  each of its findings before keeping it.
- Corrections to the subagent's findings:
  - **Its F2 (no loading state) was an artefact of my capture script.** The script's
    response-delay handler blocked the browser driver. I re-captured with the responses held open
    (`*-pay-loading`, `*-refresh-loading`, `*-requests-loading`, `*-reserved-loading`,
    `*-activity-loading`). Every loading state paints: "Sending…" with a spinner,
    "Refreshing…", and "Loading requests…" with ash placeholder rows. The finding is dropped.
  - **Its F1 (0 px hatch) appears only at an extreme ratio** (40 EUR held against 999999.99 EUR).
    With 40 of 250 EUR (`*-wallet-held-modest`, `*-after-authorize-modest`) the hatch shows and
    grows after a reservation. It is kept as a smaller finding (D4).
- I measured touch targets in the browser at 375 px by checking every `a`, `button`, `input` and
  `select` box.

## Scores (1–5)

| Criterion | Score | Evidence |
|---|---|---|
| Composition | 4 | One plum mass per screen. `wallet-available` (56/800 desktop, 40/800 phone) is the largest and heaviest figure, and total and held are 16/600. Desktop `/requests` and `/authorizations` rows run 1056 px wide instead of 760 (D3). |
| Design quality | 4 | Spacing, labels, chips and inline feedback are consistent across routes. The 375 header wraps (D1), and section rhythm on `/requests` is uneven (D5). |
| Distinctiveness | 4 | With the name covered it reads as a P2P wallet and is cleaner than the category's usual screens. Plum, orchid, the held hatch, the hatched plate ring and Atkinson's distinct `l1_0o` make it more distinctive than them. |
| Craft | 3 | Handles break mid-word at 375 (D2), "Log out" wraps (D1), there are two icons while refreshing (D8), and an empty plum strip shows while loading (D9). |
| Function | 4 | Every required element and state is present and worded as directed: uncertain → retry clears it, refused keeps the inputs, request cancelled elsewhere → `request-error` and refreshed list, JPY whole-number error. One stale success line remains (D11). |
| Delight | 3 | The hatched bar grows when money is reserved (`375-after-authorize-modest`: 40 → 100 EUR held). The slide itself cannot be judged from stills. The bar disappears at extreme ratios (D4). |

## Checks

| Check | Result |
|---|---|
| No horizontal scrolling | Pass. `scrollWidth == clientWidth` on all 92 shots at 375 and 1280. |
| Visible labels | Pass. Every input has a visible label above it, with hints where directed. |
| Visible keyboard focus | Pass. There is a 2 px orchid outline with offset on inputs and buttons (`*-focus-input`, `*-focus-button`), and a lining-ring outline on Refresh inside the plum panel (`*-focus-in-panel`). |
| Touch targets ≥44 px on phones | Mostly pass. All buttons, inputs, selects and nav segments are ≥44. Below 44: the "Pocketful" wordmark link (87×30), "Held for others" (125×24), and the front-door "Log in" / "Create an account" links (46×21) (D6). |
| Contrast | Pass. Ink/paper 16.8, paper/plum 14.5, paper/orchid 7.2, and the state text on its tints is ≥4.7. There is no orchid on plum. |
| States that must look different | Pass. **Available** is paper 800 on plum. **Held** shows the hatch in the bar, swatch, chip and plate ring (weak icon, D7). **Pending** is the amber "Waiting" chip. **Loading** shows a spinner with a "…ing" label, or "Loading …" with placeholders. **Successful** is a green tint with a check. **Refused** is a red tint with a solid border and a cross. **Uncertain** is a slate-blue tint with a dashed border, a question icon and "Retry payment". |

## Findings

None of these breaks a requirement sentence about screens, so all are **non-blocking**. They are
ranked by how much they would improve the product.

**D1 — 375, every signed-in screen — the header wraps for long names.** The header shows
"Maximiliane Okafor- / Lindqvist" and "Log / out" on two lines each. That makes the header about
90 px tall, and its shape differs from a short-name user's header (`375-wallet-empty`). Evidence:
`375-wallet-held-fold`, `375-requests-loading`, `375-split-preview`. Direction: §3 "Header (every
signed-in screen, identical)". Fix (now spelled out in §3): truncate the display name to one line
with an ellipsis, and set `nowrap` on "Log out".

**D2 — 375, `/` activity and `/split` preview — handles break inside the word.** With a wide
amount, the row title wraps as "grace_okafor_li / ndqvi paid l1_0o" (`375-wallet-held`), and the
split preview shows "grace_okafor_lin / dqvi (you)" (`375-split-preview`). Direction: §3 "the
20-character handle `grace_okafor_lindqvi` must fit a 343 px row title". This touches "Format
people, amounts and timestamps for people first" but does not break it. Fix (now in §5): at
≤600 px, move the amount under the title when the two cannot share a line, and never break a handle.

**D3 — 1280, `/requests` and `/authorizations` — rows span the full 1056 px.** Amounts sit about
900 px from their titles, and refusal boxes run 1000 px wide (`1280-requests`, `1280-auth-voided`).
Direction: §3 "Other routes: one column (max 760 px)". Fix: cap the list column at 760 px.

**D4 — `/` — the held segment of the bar vanishes when held is small relative to total, and the
bar is solid white when total is 0.** At 40 of 999999.99 EUR the segment is 0 px
(`1280-wallet-held-fold`). At 0.00 EUR the bar is fully solid (`375-wallet-empty`). Direction:
§1 "Held money is always drawn the same way — a 45° hatch". Fix (now in §5.1): a held amount
above zero always gets at least 16 px of hatch, and an empty outlined track when total is 0.

**D5 — 375 and 1280, `/requests` — uneven section rhythm.** There are about 70 px above "Asked of
you" but about 16 px above "You asked", which sits on the previous row's divider. "Cancel request"
is indented about 13 px past the chip edge (`1280-requests`). Direction: §2 "Section gap 48".

**D6 — 375 — some text-link targets are under 44 px tall.** These are "Held for others" (125×24),
the wordmark (87×30) and the front-door switch links "Log in" / "Create an account" (46×21).
Mandated check: touch targets ≥44 px on phones. Fix (now in §5): pad action links to a hit box of
at least 44 px.

**D7 — all viewports — the 12 px held icon reads as a single slash.** It sits close to the
Declined slashed-circle icon (`1280-wallet-held-fold`, the Held chips in `1280-authorizations`
compared with Declined in `1280-requests`). Direction: §6 "Held | hatch swatch" and "Nothing else
… is hatched". Fix (now in §5.1): at least three parallel 45° lines.

**D8 — `/` — Refresh shows two icons while loading.** The button shows the refresh glyph and a
separate spinner, then "Refreshing…" (`375-refresh-loading`). Direction: §5.1 "icon turns". Fix:
turn the refresh glyph itself and drop the second spinner.

**D9 — `/requests` and `/authorizations` — the plum summary strip is an empty block while
loading.** See `375-requests-loading` and `375-reserved-loading`. Direction: §5 "Loading names
what is loading" (design-craft). Fix (now in §4): show "Loading…" in lining-soft at the strip's
final height.

**D10 — `/authorizations` — wording is not person-first in two places.** A hold expiring today
reads "Collect by Tue 6 Oct, 06:51", and a hold you voided reads "Released. The money went back
to grace_okafor_lindqvi.", while the success line above it says "back to you"
(`1280-auth-voided`). The second follows my earlier §5.6 wording literally; I have corrected the
direction. Fix (now in §5.6): "Collect by today, 06:51", and "went back to you" when you are the
payer.

**D11 — `/` — a stale success line stays after another action.** "Sent 2.00 EUR to ada." remains
under Send payment after a reservation succeeds (`375-after-authorize`). Direction: §5 "Every
message element exists only while it applies". Fix (now in §5): clear a success line when the
next action on the same screen starts. This must not clear the pay form's values or its retry
identity.

## Direction changes this round

To close gaps the review found, I clarified `work/design.md` without changing its idea:

- the header shape at ≤600 px (D1);
- handles never break, and the amount moves under the title (D2);
- the minimum hatch segment and the empty track at zero total (D4);
- action-link hit boxes (D6);
- the held icon drawing (D7);
- one refresh icon (D8);
- the strip's loading text (D9);
- "back to you" and "today" wording (D10);
- clearing success lines (D11).

## What was checked and matches the direction

- **Front door:** split plum/paper at 1280 and a plum band at 375; labels, hints and
  `auth-error` wording.
- **Split:** the preview in plum with the "(you)" row and "Shares add up to…"; the initial,
  invalid-amount, error and success states.
- **JPY:** the wallet and its whole-number error.
- **Empty states:** all three, each with an action.
- **Lists:** request and authorisation chips; the partial capture shown as plain text on an open
  row.
- **Uncertain flow:** the dashed box, then "Retry payment", then success, with the box removed.
- **Refusals:** shown under their buttons with the inputs kept.
- **Fonts:** Atkinson Hyperlegible Next 400/600/800 load from `/assets/` with no network.
