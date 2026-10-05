# Pocketful: dark direction, "the lit pocket"

The idea: the wallet is a pocket. The money you can spend sits in one pale-blue panel, the brightest mass on a true-black screen. Money on hold is a white slip tucked into that pocket, standing up above its top edge. The slip carries a diagonal hatch, and that hatch means "held" everywhere in the product. I planned this with frontend-design, design-craft and design-references, using my assigned reference for composition only.

## 1. The plan

### Palette
Six core colours and three signal colours. The signal colours appear only in status markers and messages, never on a button surface.

| Name | Hex | Role |
|---|---|---|
| Night | `#000000` | Canvas: true black, not a tinted near-black |
| Seam | `#161616` | The single raised surface (pay form, nav strip, row hover). Neutral grey |
| Chalk | `#FFFFFF` | Primary text on dark, the held slip, secondary button outline |
| Lint | `#A3A3A3` | Secondary text (timestamps, parties, labels on dark). True grey, no tint |
| Lining | `#9BD0FF` | Brand: the pocket panel, primary buttons, focus ring, selection, caret, links |
| Stitch | `#2E2E2E` | Hairline dividers only, never text |
| Settled (signal) | `#7BE0A6` | Success, paid, collected |
| Refused (signal) | `#FF8B8B` | Refusals, declined |
| Unsure (signal) | `#FFC24D` | Uncertain outcome only |
| Field edge | `#6B6B6B` | Input borders (3:1 for UI components) |

Contrast (WCAG ratios, computed from relative luminance):

| Pair | Ratio |
|---|---|
| Chalk on Night | 21.0 |
| Chalk on Seam | 18.1 |
| Lint on Night | 8.3 |
| Lint on Seam | 7.2 |
| Night text on Lining (panel, primary button) | 12.9 |
| `#3D3D3D` secondary text on Lining | 6.7 |
| Lining on Night (links, focus ring) | 12.9 |
| Lining on Seam | 11.1 |
| Night text on Chalk (held slip) | 21.0 |
| Settled on Seam / Night | 12.3 / 14.3 |
| Refused on Seam / Night | 8.0 / 9.3 |
| Unsure on Seam / Night | 11.3 / 13.1 |
| Field edge vs Seam / Night (non-text) | 3.4 / 3.9 |

Checked against design-craft's fallback palettes:
- **Beige/cream/brass family:** not used.
- **Navy, gold and green for money:** not used. Lining is a pale sky blue, not navy; the only green (Settled) is a signal colour.
- **frontend-design default #2 (near-black with one acid accent):** avoided in three ways. The canvas is pure `#000`, not `#0B0B0B` or `#111`. The brand colour is pale and calm rather than acid. And it owns a large region (the pocket panel) instead of acting as a thin accent.

### Typefaces
One family: **Atkinson Hyperlegible Next** (SIL OFL), self-hosted as WOFF2 in weights 400, 600 and 800.
- **Why this face:** this product runs on handles (`^[a-z0-9_]{1,20}$`) and amounts. The face was drawn to tell apart `l`, `1`, `I`, `0` and `o`, so `al1_0o` cannot be misread as a different person. That is a reason that belongs to this product.
- **Numerals:** `font-variant-numeric: tabular-nums` on every amount and timestamp. The build step must confirm the `tnum` feature survives subsetting. If it does not, align amount columns to the right edge of a fixed column rather than switching to a monospace face.
- **Role split:** 800 for the main figure and front-door headline, 600 for headings, labels and buttons, 400 for body.

### Type scale
- **Figure** (`wallet-available`):
  - Desktop: 76 px, line-height 1.0, weight 800, tracking −0.02em.
  - 375 px: 52 px, stepping down to 40 and then 32 by character count. The currency code may wrap to its own line at the space; a number never breaks.
- **Front-door headline:** 48/52 desktop, 34/38 mobile, weight 800, tracking −0.015em.
- **Page title:** 28/34, weight 600.
- **Section heading:** 21/28, weight 600.
- **Row amount:** 19/24, weight 600, tabular figures.
- **Body:** 17/26, weight 400.
- **Labels and secondary text:** 15/22 (labels 600, secondary text 400).
- **Markers and captions:** 13/18, weight 600, sentence case. No all-caps anywhere.
- **Measure:** prose is capped at 64ch.

### Spacing and shape
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 72.
  - Page gutter is 16 at 375 px and 32 at desktop.
  - Sections are separated by 48; the space inside a section is 24.
- **Control sizes:** inputs 56 px tall, buttons 48 px.
- **Radius by hierarchy, not one radius everywhere:**
  - Markers: 6
  - Inputs: 10
  - Buttons: 12
  - Form surface: 20
  - Pocket panel: 28
- **Depth:** no shadows. Depth comes only from the step between Night and Seam, plus the one Lining mass.
- **Icons:** inline SVG on a 20 px grid with a 1.75 px stroke. Arrow-out and arrow-in for direction, globe and lock for privacy, plus clock, check, cross, slash, question-circle and refresh.

### Layout: `/` at desktop (1280 px, content max 1120, 12 columns, 24 px gutter)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Pocketful    Wallet  Requests  Split  Reserved            Mina Lee  @mina  Log out│
├──────────────────────────────────────────────────────────────────────────────┤
│                                                ┌──────────┐                   │
│                                                │//////////│  ← held slip      │
│ ┌──────────────────────────────────────────────│ On hold  │──┐ ┌─────────────┐ │
│ │ Available to spend                           │ 25.00 EUR│  │ │ Pay          │ │
│ │                                              └──────────┘  │ │ To  [handle ]│ │
│ │ 72.50 EUR                     (76px, 800, Night on Lining) │ │ Amount [   ] │ │
│ │                                                            │ │ Note  [    ] │ │
│ │ Total in wallet 97.50 EUR                     [⟳ Refresh]  │ │ Who sees it  │ │
│ └────────────────────────────────────────────────────────────┘ │ [Public   ▾] │ │
│                                                                │ [ Pay ]      │ │
│ Activity                                                       └─────────────┘ │
│ ──────────────────────────────────────────────────────────────  Request money  │
│ ↗ Paid ada                                   15.00 EUR          To / Amount /  │
│   @mina to @ada   Dinner at Lupa       🔒 Private  6 Oct, 19:42  Note [Request] │
│ ──────────────────────────────────────────────────────────────  ───────────── │
│ ↙ From bo                                    42.50 EUR          Reserve money  │
│   @bo to @mina    Concert tickets      ◍ Public   5 Oct, 09:15  To / Amount /  │
│ ──────────────────────────────────────────────────────────────  Note / Who     │
│   …                                                             [Reserve]      │
└──────────────────────────────────────────────────────────────────────────────┘
```
(The `↗ ↙ 🔒 ◍ ⟳` characters in the wireframes stand in for the SVG icons.)

- **Left (7 columns):** the pocket panel, then the feed as flat rows on Night, divided by Stitch hairlines. The rows are not cards.
- **Right (5 columns):** the Pay form sits on Seam, the only raised form. Request and Reserve sit flat on Night under a hairline, so Pay reads as the primary job.
- **Alignment:** everything is left-aligned. Amounts are right-aligned in rows.

### Layout: `/` at 375 px (16 px gutters, 343 px content, nothing wider)

```
┌─────────────────────────────────────┐
│ Pocketful                   Log out │
│ Mina Lee  @mina                     │
│ Wallet  Requests  Split  Reserved   │
├─────────────────────────────────────┤
│                     ┌────────────┐  │
│                     │////////////│  │
│ ┌───────────────────│ On hold    │┐ │
│ │ Available to spend│ 25.00 EUR  ││ │
│ │                   └────────────┘│ │
│ │ 72.50 EUR             (52px)    │ │
│ │ Total in wallet 97.50 EUR       │ │
│ │ [⟳ Refresh]                     │ │
│ └─────────────────────────────────┘ │
│ ┌─ Pay ───────────────────────────┐ │
│ │ To          [ada              ] │ │
│ │ Amount      [15.00        EUR ] │ │
│ │ Note        [                 ] │ │
│ │ Who sees it [Public          ▾] │ │
│ │ [            Pay              ] │ │
│ └─────────────────────────────────┘ │
│ Activity                            │
│ ↗ Paid ada               15.00 EUR  │
│   @mina to @ada                     │
│   Dinner at Lupa                    │
│   🔒 Private        6 Oct, 19:42    │
│ ─────────────────────────────────── │
│ …                                   │
│ Request money   (flat, full width)  │
│ Reserve money   (flat, full width)  │
└─────────────────────────────────────┘
```
- **Order at 375 px:** balance, then Pay, then the feed, then Request and Reserve. What people come for and the primary job come first.
- **Labels:** stacked above inputs (the side-by-side labels in the sketch are shorthand for space).
- **Nav:** the four route links fit on one row at 15 px with no scrolling. The same header and nav appear on every signed-in route.

### Principles
1. **One lit mass per screen.**
   - On `/` it is the pocket panel.
   - On `/requests`, `/split` and `/authorizations` it is the primary button and the page's key figure (the split preview total, or the amount to collect).
   - Everything else stays Night, Seam, Chalk or Lint.
2. **Held is a texture, not a hue.** A 45° hatch (Night lines on Chalk) marks held money: the slip, and the swatch on an open reservation's marker.
3. **Every state has a shape, an icon and a word.** Nothing is told by colour alone.
4. **People first, codes where they help.** "You paid ada", "6 Oct, 19:42". The RFC 3339 expiry is shown as required, but labelled and paired with a plain sentence.
5. **Required elements never move or wait.**
   - Motion only touches added decoration.
   - Required text nodes hold exactly the specified text. The `@` of the handle is a CSS `::before` on `current-handle`. The amount and its code are spans inside one element with a real space between them.
6. **Two dark steps only** (Night and Seam), and no shadows.
7. **Feedback sits next to its control.**
   - `pay-error`, `pay-uncertain` and form successes sit under that form's button.
   - `request-error` and `authorization-error` render inside the row whose action failed.

## 2. Reference: what I took, and what the default review changed

**Taken from the reference's composition (its colours, name and signature shapes not used):**
- A true-black storytelling canvas with only two dark surface steps, and depth from luminance rather than shadow.
- The "featured card inversion": one fully saturated block in an otherwise dark grid. That becomes the pocket panel, the only brand-coloured mass on `/`.
- Full-bleed switching between dark and light bands. Used on the front door: a Lining band against a Night form band.
- Heavy, tightly tracked display type at line-height 1.0 for the one number that matters.
- Accent colours confined to small content marks, never button surfaces. In this plan the signal colours live only in markers and messages.
- Generous control sizes (56 px inputs, 48 px buttons) and a content width of about 1200.

**Changed in my review against the defaults (first draft, then revision):**
- **Canvas:** the draft used a `#0E0F11` canvas with an electric cyan `#2DE1FC` accent on buttons only. That is frontend-design default #2 (near-black with one bright accent) plus the tinted-near-black tell. Revised to pure `#000`, and the brand colour became a pale, calm Lining that owns the whole balance panel. The brief asks for "calm, trustworthy"; acid cyan is neither.
- **Type:** the draft used Inter for everything, the reference's own workhorse and the default family. Revised to Atkinson Hyperlegible Next, chosen because handles must not be misread.
- **Buttons:** the draft used pill buttons with a white pill as the primary call to action. That is the reference's signature shape. Revised to 12 px buttons, with Lining filling the primary action (as design-craft asks).
- **Feed:** the draft put each feed item and request in its own rounded card with a soft shadow (default #4, the card kit). Revised to flat rows on hairlines, with radius varying by hierarchy.
- **Main figure:** the draft was a big number, a small label, a three-stat strip (total / held / pending) and a gradient. That is frontend-design's hero default. Revised: no gradient and no stat strip. Total becomes one quiet sentence, and held becomes a physical slip in the pocket, a shape specific to holds.
- **Labels:** the draft had "AVAILABLE BALANCE" as a tracked caps eyebrow, meta joined with middle dots, and "Send →". Revised to sentence-case "Available to spend", meta spaced into separate pieces, and no arrows in labels.
- **Direction:** the draft showed direction with a coloured stripe down the side of each row. That is on design-craft's avoid list. Revised to an inline arrow-out or arrow-in icon plus a verb ("Paid ada", "From bo").
- **Expiry:** the draft considered monospace for the RFC 3339 expiry, another default tell. Revised to the same face with tabular figures, in Lint.

## 3. The plan applied

### Main figure (`/`, Lining panel, Night text)
- "Available to spend": 17/600.
- `wallet-available`: "72.50 EUR". "72.50" at 76 px weight 800; " EUR" at 40% of that size, weight 600, sharing the baseline. One element, exact text.
- **Held slip.** A Chalk slip rises 40 px above the panel's top-right edge, with a 6 px hatched strip along its top.
  - It reads "On hold" (13/600) above `wallet-held` "25.00 EUR" (21/600, Night on Chalk, 21:1).
  - When held is zero, the slip is not rendered and the pocket's top edge is plain.
  - The slip's text sits wholly inside the slip, so nothing is covered.
- **Bottom line:** "Total in wallet" in `#3D3D3D`, then `wallet-balance` "97.50 EUR" at 17/600 Night. It is visibly secondary but still readable.
- **`wallet-refresh`:**
  - A 1.5 px Night-outlined button on Lining, with a refresh icon and the label "Refresh".
  - While loading, the label reads "Refreshing" and the icon turns. The numbers stay at full contrast and in place.

### List rows
- **Activity item (outgoing, private):**
  - Arrow-out icon, then "Paid ada" (17/600 Chalk). Right-aligned: `activity-amount` "15.00 EUR" (19/600, tabular).
  - Second line: `activity-parties` "@mina to @ada" (15 Lint).
  - Third line: `activity-note` "Dinner at Lupa" (15 Chalk). When the note is empty, the element is present and empty with zero height.
  - Right-aligned: lock icon "Private", then "6 Oct, 19:42". A date from another year shows the year: "14 Mar 2025".
- **Activity item (incoming, public):** arrow-in icon, "From bo", "@bo to @mina", globe icon "Public".
- **Activity item (someone else's public payment):** a neutral dot icon and "ada paid bo".
- **Request row, incoming pending:**
  - "bo asked you for" then `request-amount` "42.50 EUR". Note "Concert tickets". "5 Oct, 09:15".
  - Marker: "Waiting".
  - Buttons: `request-pay` "Pay 42.50 EUR" (Lining filled), `request-decline` "Decline" (text button, Chalk underline on focus or hover).
- **Request row, outgoing pending:** "You asked ada for 12.00 EUR". Marker "Waiting". `request-cancel` "Cancel request" (Chalk outline).
- **Authorisation row, incoming open:**
  - "mina reserved 80.00 EUR for you" (`authorization-amount` holds "80.00 EUR").
  - "Collect before 9 Oct 2026, 18:00", then in Lint: "Expires" followed by `authorization-expires` "2026-10-09T18:00:00Z".
  - Input labelled "Amount to collect": `authorization-capture-amount`, pre-filled "80.00", with an "EUR" suffix outside the input value.
  - `authorization-capture` "Collect" (Lining).
  - Marker "Held".
- **Authorisation row, outgoing open:** "You reserved 80.00 EUR for ada". `authorization-void` "Release hold" (Chalk outline).
- **Authorisation row, captured:** "Collected" then `authorization-captured` "30.00 EUR", followed by " of 80.00 EUR". Marker "Collected".

### Status markers
All markers are 13/600, 6 px radius, 24 px tall, with an icon and a word.

| Status | Shown as |
|---|---|
| Request `pending` | 1 px Chalk outline, clock icon, "Waiting" |
| Request `paid` | Settled text on 12% Settled fill, check icon, "Paid" |
| Request `declined` | Refused text on 12% Refused fill, cross icon, "Declined" |
| Request `cancelled` | Lint text, 1 px Lint outline, slash icon, "Cancelled" |
| Authorisation `open` | Chalk text, 1 px Lining outline, 12 px hatched swatch, "Held" |
| Authorisation `captured` | Settled, check icon, "Collected" |
| Authorisation `voided` | Lint, solid outline, back-arrow icon, "Released" |
| Authorisation `expired` | Lint, dashed outline, hourglass icon, "Expired" |
| Public | Globe icon, "Public" in Lint (quiet: the default) |
| Private | Lock icon, "Private" in Chalk (louder, because it is a deliberate choice) |

The raw values stay in `data-status` and `data-visibility`; people see only the words.

### Empty states
- **`empty-activity`:** "Nothing here yet. Payments you send or receive, and public payments from others, will show up here." Then a "Pay someone" link that focuses `pay-handle`.
- **`empty-requests`:** "No requests yet. Ask someone for money from your wallet." Then a "Request money" link to the request form on `/`.
- **`empty-authorizations`:** "Nothing reserved. Reserve money on your wallet, and the person collects it when they are ready." Then a "Reserve money" link.

### Errors
Refusals use a cross-circle icon and Refused text on Seam, directly under the button, announced with `role="alert"`. All pay inputs keep their values.

- **`pay-error`, insufficient funds:** "Not sent. This payment is 15.00 EUR and you have 12.00 EUR available. Your details are kept, so you can change the amount."
- **`pay-error`, unknown handle:** "Not sent. No one has the handle zed. Check the spelling."
- **`pay-error`, bad amount (no request sent):** "Enter an amount like 15.00, with up to 2 decimal places." For JPY the wording becomes "with no decimal places".
- **`request-error` (in the row):** "This request was cancelled by bo, so it can't be paid. The list is up to date now."
- **`authorization-error` (in the row):** "Not collected. Only 50.00 EUR is left to collect on this reservation."
- **`auth-error`:**
  - Signup: "That email already has a wallet. Log in instead."
  - Login: "Email or password is wrong. Check both and try again."

**Uncertain (`pay-uncertain`):**
- Shown as a question-circle icon in Unsure, Chalk text, a 1.5 px dashed Unsure border and a Seam fill. The dashed border sets it visibly apart from the solid refusal.
- Exact text: "No answer from the server, so this payment is unconfirmed. It may already have gone through. Press Retry payment: it repeats this exact payment, so ada is paid at most once."
- `pay-submit` reads "Retry payment" while this state lasts. The form is unchanged and the key and body are the same.

**Loading:** "Paying…", "Requesting…" and "Reserving…" on the button with an inline spinner, the button disabled. On lists: "Loading your requests" above three skeleton rows in Seam.

**Success (Settled check, under the button):**
- "Paid 15.00 EUR to ada."
- "Requested 12.00 EUR from bo."
- "Reserved 80.00 EUR for ada. It stays on hold until they collect it."
- "Collected 30.00 EUR."
- "Released. 80.00 EUR is available again."

### Front door
- **Desktop:** a full-bleed split. The left half is a Lining band, the right half is a Night band holding the form.
- **375 px:** the Lining band is a 200 px top band above the form.

**`/signup`:**
- Band headline (48 px, weight 800, Night): "Pay friends by their handle. Hold money until they collect it."
- Form heading: "Create your wallet".
- Labels:
  - "Email"
  - "Password"
  - "Your name" (`signup-display-name`), with the hint "Shown to people you pay"
- Button `signup-submit`: "Create wallet".
- Below: "Already have a wallet? Log in".

**`/login`:**
- Band headline: "Your wallet, by handle."
- Form heading: "Log in".
- Labels: "Email", "Password".
- Button `login-submit`: "Log in".
- Below: "New here? Create a wallet".

**Shared front-door rules:**
- Inputs: Night fill, Field edge border, Chalk text, Lining caret.
- Focus: a 2 px Lining ring with a 2 px offset. On the Lining band and panel, the ring is Night.
- Text selection: Night on Lining.

## 4. Delight moment: the retry that settles once

- **What to feel:** relief that money did not vanish or double. The moment a person fears most in a wallet is "did it go through?". Pocketful's real promise is that a retry moves money exactly once, and no neighbouring product without idempotent retries could say this truthfully.
- **The interaction:**
  - The person presses "Retry payment" on the dashed Unsure message.
  - When the retry succeeds, `pay-uncertain` is removed at once, as required.
  - A new success line (an added element, not a required one) takes its place. It starts with the same dashed border, whose dashes close into a solid Settled line over 360 ms, then reads: "Paid 15.00 EUR to ada, once. Nothing was sent twice."
  - The balance and feed refresh normally.
- **Limits:** no required element moves, waits or fades. Only the added border animates.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, the border is solid from the first frame and the words carry the moment on their own.
