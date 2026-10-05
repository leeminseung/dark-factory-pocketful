# Screen review — stage 2, revision 8c3360d, round 2

Reviewer: product-designer. Against `work/design.md` (da39a14), the stage-2 "Product and
visual direction" and UI sections, and the product constraints.

**Verdict: pass. There are no blocking findings. D1–D11 are all fixed, and there is one new
non-blocking finding (D12).**

## Method

- I built `stage-2/` of 8c3360d in a worktree with Docker (tag `pd-review-8c3360d`) and drove it
  with Playwright (Chromium) at 375×812 and 1280×900, using the same scripts and longest-content
  fixtures as round 1.
- Screenshots are outside the repository, in `/tmp/pd-shots/8c3360d/`.
- I reviewed the screens myself, as the mandate asks for a later round.
- Extra probes for this round:
  - the hit boxes of every link, button and input at 375 px on all six routes;
  - the wording of each feedback element for each refusal code (R5);
  - a fixture with 230 payments, 230 requests and 230 authorisations (R9).

## Earlier findings

| Id | Status | Evidence |
|---|---|---|
| D1 header wraps at 375 | **Fixed** | Name truncates to "Maximiliane Okaf…" on one line, and "Log out" is on one line (`375-wallet-held-fold`, `375-split-preview`). |
| D2 handles break mid-word | **Fixed** | Activity rows keep `grace_okafor_lindqvi` whole and move the amount under the title. The split preview shows "grace_okafor_lindqvi (you)" whole with the share on its own line (`375-split-preview`, `375-pay-error-insufficient`). |
| D3 list rows 1056 px at 1280 | **Fixed** | `/requests` and `/authorizations` are one 760 px column (`1280-requests-error`, `1280-auth-voided`). |
| D4 hatch vanishes / solid bar at 0 | **Fixed** | 40 EUR held against 999999.99 EUR now shows a 16 px hatch (`375-wallet-held-fold`). |
| D5 uneven spacing on `/requests` | **Fixed** | 48 px before "You asked", and "Cancel request" aligns with the row text (`1280-requests-error`). |
| D6 links under 44 px | **Fixed, with a side effect (D12)** | No link, button or input is under 44 px on `/signup`, `/login`, `/`, `/requests`, `/split` or `/authorizations` at 375. |
| D7 held icon reads as one slash | **Fixed** | The swatch is drawn as parallel 45° lines in the panel and the Held chip (`1280-auth-voided`). |
| D8 two icons while refreshing | **Fixed** | One turning refresh glyph and "Refreshing…" (`375-refresh-loading`). |
| D9 empty plum strip while loading | **Fixed** | The strip reads "Loading…" at its final height above "Loading requests…" and the placeholders (`375-requests-loading`). |
| D10 "Tue 6 Oct" / own handle | **Fixed** | "Collect by today, 07:30" and "Released. The money went back to you." (`1280-auth-voided`). |
| D11 stale success line | **Fixed** | After a payment and then a reservation, only "Reserved 5.00 EUR for bob. It stays yours until they collect it." shows (probe). |

## Round-2 areas

**R5, refusal and uncertain wording by code.** Every message matches `work/design.md` §5 and
§7:

| Case | Message |
|---|---|
| Insufficient funds | "Not sent. You have 999959.99 EUR available to spend and this payment is 999999.99 EUR. Lower the amount or wait for held money to be released." |
| Self payment | "That's your own handle. Enter someone else's." |
| Unknown handle | "No one has the handle nobody. Check the spelling." |
| Note over 200 characters | "Keep the note to 200 characters or fewer." |
| Non-numeric amount | "Enter an amount like 15.00, with up to 2 decimal places." |
| JPY amount | the whole-number message |
| Out of range | "Enter an amount between 0.01 EUR and 10000000.00 EUR." |
| Capture too large | "Couldn't collect 30.00 EUR. Only 25.00 EUR is left to collect." |
| Request cancelled elsewhere | "This request was cancelled, so it can't be paid. The list has been updated." |
| Signup with a taken email | "An account with this email already exists. Log in instead." |
| Uncertain | the dashed slate-blue box with the directed text, and "Retry payment" |

`split-error` for an unknown handle now reads "Split not sent. One of these handles doesn't belong
to anyone: ada, lin_02. Check the list." It cannot name the one handle without parsing the
message text, which R5 rules out. This wording is acceptable, so I raise no finding.

**R9, paging.** With 230 rows each, `/` shows 230 `activity-item-*`, `/requests` 230
`request-item-*` and `/authorizations` 230 `authorization-item-*`. There is no horizontal scroll.

## Scores (1–5)

| Criterion | Score | Evidence |
|---|---|---|
| Composition | 5 | One plum mass per screen, and the available figure is the largest and heaviest thing. List routes now sit in a 760 px reading column. |
| Design quality | 4 | Section rhythm and the header are now consistent. One misaligned pair remains in the balance panel (D12). |
| Distinctiveness | 4 | Unchanged from round 1: plum, orchid, the held hatch and the hatched plate ring. |
| Craft | 4 | Handles stay whole, the hatch is always visible and refresh shows one icon. D12 remains. |
| Function | 5 | Every state is present, worded by code and distinct. Lists follow `has_more`. |
| Delight | 3 | The hatch grows when money is reserved and always shows. The slide cannot be judged from stills. |

## Checks

| Check | Result |
|---|---|
| No horizontal scrolling | Pass on every shot at 375 and 1280, including the 230-row lists. |
| Visible labels | Pass. |
| Visible keyboard focus | Pass, including inside the plum panel (`*-focus-in-panel`). |
| Touch targets ≥44 px on phones | Pass. Nothing is under 44 px on any route at 375. |
| Contrast | Pass. The palette is unchanged. |
| States that must look different | Pass: available, held, pending, loading, successful, refused and uncertain. |

## New finding

**D12 (non-blocking), `/` balance panel, 375 and 1280: the held amount sits about 10 px above its
label.** The fix for D6 made the "Held for others" link 44 px tall. Its label now sits lower than
`wallet-held` beside it. At 1280, "Held for others" is at y≈217 and "40.00 EUR" at y≈207, while
"Total" and its amount share a baseline (`1280-wallet-held-modest`, `375-wallet-held-fold`).
Direction: §5.1 lists "Held for others" and `wallet-held` as one line. Fix: align the label and
amount on a shared baseline (for example `align-items: baseline` on that row), keeping the
44 px hit box. The figure stays visible and in place, so no requirement sentence is broken.
