# Design selection brief

Three design concepts for the product below are labelled A, B and C. Choose between them.
Answer in text only; write no code and no files. Propose nothing new.

Use the skills frontend-design, design-craft and design-references (invoke all three with the
Skill tool and follow them).

1. Reject every concept that:
   - breaks a product constraint (below) or the character the requirements ask for;
   - lands on a default look frontend-design names, or a fallback palette design-craft names;
   - reads as one flat tone by design-craft's composition rules.
2. Rank the rest by design-craft's test for working screens (with the product's name covered,
   it reads as a product of its category, at least as clean as the category's usual screens,
   and more distinctive than them), then by how evenly the direction runs through every
   component and screen (main figure, rows, markers, empty, error, uncertain, front door,
   /requests, /split, /authorizations).
3. For every rejection and every ranking step, quote the evidence from the concept text and
   the rule it meets or breaks. Also list, for the winner, any parts that would break a
   requirement or product constraint as written, quoting the requirement sentence.

Answer with: the verdict per concept (rejected / ranked), the ranking, the quoted evidence,
and the winner's defects.

## The product

Pocketful is a consumer wallet in a browser: people send money to each other by handle
(`^[a-z0-9_]{1,20}$`, e.g. `ada`), request money, split bills into equal shares, and reserve
money for a recipient to collect later (an authorisation that places a hold; the recipient
captures it in one or more captures; the payer can void it; it expires on its own).
Payments are `public` (visible in everyone's feed) or `private` (only the two parties).
Requests are `pending`, then `paid`, `declined` or `cancelled`. Authorisations are `open`,
`captured`, `voided` or `expired`. Amounts are formatted like `100.00 EUR` or `1200 JPY`.

## Requirement text (verbatim)

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


## Screens and states named by the requirements

Screens: `/signup`, `/login` (the front door), `/` (balance with available as headline,
total and held secondary; pay form; request form; authorise form; activity feed;
refresh button), `/requests` (incoming and outgoing lists with pay/decline/cancel),
`/split` (split form with live share preview), `/authorizations` (list with capture amount
input and capture button on incoming open, void on outgoing open).
States that must look different: available, held, pending, loading, successful, refused,
uncertain (payment response lost — retryable), plus empty states (activity, requests,
authorisations), form errors (auth, pay, request, authorise, split, request action,
authorisation action), request statuses, authorisation statuses, public vs private.

## Product constraints

- The product may have no network at runtime: font files, icons and every other asset live
  inside it.
- Every element and text the requirements name stays visible, in place and exactly as
  specified. Nothing the design adds, motion included, delays, hides or moves it.
- The screens meet the requirements' rules for viewports, labels, keyboard focus and contrast.


---

# Concept A

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

---

# Concept B

# Pocketful: colour-led direction, "the pocket"

I used the three skills frontend-design, design-craft and design-references, and the reference file named in the brief. The brand is not named anywhere below.

The idea is that a wallet is a pocket. On every working screen a saturated denim-blue band holds the money you can spend. Money reserved for someone else sits in a darker strip at the bottom of the band, the "lining", so held funds are tucked visibly under the available amount. This strip is the one signature element. Everything else stays quiet.

---

## 1. The plan

### Palette (6 core values, plus state colours)

| Name | Hex | Role |
|---|---|---|
| **Denim** | `#2A4BA8` | Brand colour. Owns the wallet band, the front-door panel and filled primary buttons. |
| **Lining** | `#1B2F6B` | The strip under the band that holds total and reserved. Also the pressed state of buttons and the "Reserved" tag. |
| **Chambray** | `#D3DDF7` | Secondary text on Denim and Lining, and the text-selection colour. |
| **Graphite** | `#1E1E1E` | All body text and headings on light surfaces. Untinted. |
| **Pencil** | `#5E5E5E` | Secondary text (times, hints, notes). True grey, not tinted toward the brand. |
| **Paper** | `#FFFFFF` | Panels, inputs, text on Denim. Page canvas steps down to **Mist `#F1F1F2`**, a near-true grey. |

State colours. These are used only for feedback, never as brand colour:

| State | Text | Background |
|---|---|---|
| Success (Fern) | `#0E6B3A` | `#E3F4EA` |
| Refused (Brick) | `#B3261E` | `#FDECEA` |
| Uncertain (Amber) | `#7A4B00` | `#FFF1D1` |

Contrast ratios (all computed):

| Text / background | Ratio |
|---|---|
| Paper on Denim (available figure, primary button label) | 7.86 |
| Chambray on Denim (labels in the band) | 5.79 |
| Paper on Lining (total and reserved amounts) | 12.61 |
| Chambray on Lining (strip labels) | 9.28 |
| Graphite on Paper | 16.67 |
| Graphite on Mist | 14.77 |
| Pencil on Paper | 6.48 |
| Pencil on Mist | 5.74 |
| Denim on Paper (links, outline buttons, focus ring) | 7.86 |
| Denim on Mist | 6.97 |
| Fern on its tint | 5.78 (on Paper: 6.60) |
| Brick on its tint | 5.72 (on Paper: 6.54) |
| Amber on its tint | 6.62 (on Paper: 7.41) |

Everything is AA for body text. Every pair except the four on-tint pairs (5.7–5.8) and Chambray on Denim (5.79) also passes AAA.

**Check against design-craft's fallback palettes:**
- It is not the cream/bone family with brass, clay or oxblood accents.
- It is not near-black with one acid accent.
- It is not the money category's navy, gold and green: Denim is a mid-value blue (lightness 41%), not navy, and there is no gold.
- Green appears only as the success state.
- The neutrals (Mist, Pencil, Graphite) are true greys. The only blue tints are Chambray, which sits on Denim surfaces.

### Typefaces (both SIL Open Font Licence, bundled as woff2 inside the product)

- **Archivo**, a variable font with weight 100–900 and width 62–125. Used for money and headlines.
  - The available figure is set at weight 800 and width 88. The slight condensing keeps a long balance on one line at 375 px.
  - All amounts use `font-variant-numeric: tabular-nums`, and the wordmark "Pocketful" is set in it as type.
- **Atkinson Hyperlegible Next**, weights 200–800. Used for everything people read and type: labels, handles, notes, buttons, errors.
  - It was designed to tell `l`, `1`, `I` and `0`, `O` apart. That matters for handles like `lin_01`, which are typed and compared by eye.
  - Buttons use weight 600, body text 400.

### Type scale (major third, ×1.25, base 16)

| Size | Use |
|---|---|
| 13 | Exact timestamps, hints |
| 16 | Body, inputs, buttons (16 also stops iOS zooming into inputs) |
| 20 | Row titles, panel titles |
| 25 | Total and reserved amounts in the Lining |
| 31 | Page titles in the band, mobile front-door headline |
| 39 | — |
| 49 | Desktop front-door headline |
| 61 | Available figure on mobile |
| 95 | Available figure on desktop |

- The available figure uses `clamp(39px, 15vw, 95px)` and steps down one size when the amount is longer than 9 characters.
- The currency code inside the figure is set at half size on the same baseline.
- Line height is 1.0 for the figure, 1.2 for headings and 1.5 for body text.
- Measure is at most 68 characters.

### Spacing scale (4 px base)

4 · 8 · 12 · 16 · 24 · 32 · 48 · 72

- Panel padding: 24.
- Band padding: 48 on desktop, 32 on mobile.
- Gap between rows: 16. Gap between sections: 48.
- Controls are at least 48 px tall.

**Radius follows hierarchy rather than one value everywhere:**
- 0 for the full-bleed band and lining.
- 16 for panels.
- 8 for inputs and buttons.
- 4 for status tags.

### Layout: `/` at 375 px

```
┌─────────────────────────────────────┐
│ Pocketful           Ada Lovelace    │ nav, Paper
│                     ada   [Log out] │ current-user / current-handle
│ Wallet  Requests  Split  Reserved   │ active link: Denim, 2px underline
├─────────────────────────────────────┤
│█████████████████████████████████████│ DENIM band
│█ Available to spend    [⟳ Refresh] █│ Chambray label; wallet-refresh
│█                                   █│
│█ 1250.00 EUR                       █│ wallet-available, Paper, Archivo 800
│█                                   █│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ LINING strip
│▓ Total            Reserved         ▓│
│▓ 1300.00 EUR      50.00 EUR        ▓│ wallet-balance / wallet-held
├─────────────────────────────────────┤ Mist canvas below
│ ┌─────────────────────────────────┐ │ Paper panel: the one primary
│ │ Pay someone                     │ │
│ │ Handle  [grace_hopper        ]  │ │
│ │ Amount  [15.00          ] EUR   │ │
│ │ Note    [Dinner at Lucia's   ]  │ │
│ │ Who sees it [Everyone       ▾]  │ │ pay-visibility
│ │ [██████████ Pay ██████████████] │ │ filled Denim
│ │ (feedback appears here)         │ │ pay-error / pay-uncertain
│ └─────────────────────────────────┘ │
│ Activity                            │
│ ┌─────────────────────────────────┐ │ one panel, rows split by
│ │ row                             │ │ 1px Mist rules (not cards)
│ │ row                             │ │
│ └─────────────────────────────────┘ │
│ Ask for money       (Mist, outline) │ request form, quieter
│ Reserve money       (Mist, outline) │ authorise form, quieter
└─────────────────────────────────────┘
```

- The order on mobile is: what you can spend, the main task (pay), what happened (activity), then the less frequent forms.
- All three forms are always visible. None of them is hidden behind tabs.

### Layout: `/` at desktop (1280 px, 1120 px container, 12 columns)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Pocketful   Wallet  Requests  Split  Reserved     Ada Lovelace  ada  [Log out] │
├──────────────────────────────────────────────────────────────────────┤
│█████████████████████████████████████████████████████████████████████│
│█ Available to spend          [⟳ Refresh] ┌────────────────────────┐ █│
│█                                         │ Pay someone            │ █│
│█ 1250.00 EUR                             │ Handle [            ]  │ █│ pay panel sits on
│█                                         │ Amount [      ] EUR    │ █│ the band, overhangs
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ Note   [            ]  │▓▓│ it by 96 px
│▓ Total 1300.00 EUR   Reserved 50.00 EUR  │ Who sees it [Everyone▾]│ ▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ [████████ Pay ████████]│▓▓│
│                                          └────────────────────────┘  │
│ Activity (cols 1–7)                       Ask for money (cols 8–12)  │
│ ┌─────────────────────────────────────┐   ┌────────────────────────┐ │
│ │ rows…                               │   │ Mist panel, outline btn│ │
│ │                                     │   └────────────────────────┘ │
│ │                                     │   Reserve money             │
│ └─────────────────────────────────────┘   ┌────────────────────────┐ │
│                                           │ Mist panel, outline btn│ │
│                                           └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

- All text is left-aligned. Amounts are right-aligned in rows, with tabular figures so the columns line up.
- The other working routes (`/requests`, `/split`, `/authorizations`) keep the same nav and a slimmer Denim band (page title at 31 px plus one summary line, such as "2 requests waiting for you"). Colour owns a region on every screen and the navigation never moves.

### Principles

1. **The pocket is the only signature.** Denim holds what you can spend and the Lining holds what is set aside. Nothing else gets ornament.
2. **Brand colour fills regions, not lines.** It covers the band, the front-door panel and filled primary buttons, never as hairlines or side bars. Denim never means "success".
3. **One filled button per panel.** Pay, Create wallet and Collect are filled. Every other action is outlined Denim, or a text button for Decline, Cancel and Release.
4. **Every status is word, icon and colour together.** No status relies on colour alone.
5. **Feedback sits directly under the button that caused it.** It is never a toast.
6. **People first, identifiers only where they help.** Rows say "Today, 19:42", not raw timestamps. The one exception is the RFC 3339 expiry, which is required: it appears small under the human date, which it confirms.
7. **Browser-drawn surfaces:**
   - Focus ring: 3 px Denim outline with 2 px offset on light surfaces, Paper on Denim and Lining surfaces.
   - Caret: Denim. Selection: Chambray background with Graphite text.
   - Icons: inline SVG, 1.75 px stroke, 20 px.
   - No emoji or text arrows.
8. **Real content.**
   - Test with 20-character handles (`grace_hopper_navy_01`), `9999999.99 EUR` and `120000 JPY`, and dates from 2025.
   - The space in an amount is a real space (it is part of the required text), so a long figure wraps only before its currency code, never inside the number.
   - Nothing scrolls sideways at 375 px.

---

## 2. What I took from the reference, and what the review changed

**Taken from the reference (composition only):**
- **The split hero.** The key content sits left and a white action card sits right, over the coloured region; they stack on mobile. Here the action card is the pay form, sitting on the wallet band.
- **One heavy display voice for the brand moment and a plain second face for utility**, with strict role separation.
- **Surface contrast as elevation.** White panels sit on a slightly darker canvas, with no shadows.
- **The 4 px spacing base**, 48 px band padding, 24 px panel padding and 48 px touch targets.
- **One brand accent with a full, separate semantic palette.** The brand colour is never used as "success".
- **Primary buttons never sit on the brand colour itself.** Here, Pay sits on a Paper panel, not on Denim.

**Changed:** the reference keeps its brand colour to buttons on a pale neutral hero. This surface is colour-led, so Denim owns the band and the front-door panel. None of its colours, fonts, pill shapes or radius was carried over.

**Review against the defaults (what read as default, and what I changed):**
1. **Hue.** My first pick was an indigo near `#3730C4`. It sits next to the indigo-600/700 that generated SaaS pages reach for, and reads as "app purple-blue".
   - Changed to Denim `#2A4BA8`: darker, less violet, and tied to the product's name (pocket, jeans, everyday).
   - Lining `#1B2F6B` replaced a lighter tint of the same hue, so the strip reads as a separate value rather than a flat single tone.
2. **Typeface.** My first instinct was Inter at weight 900, which is both the reference's own substitute and the generic default.
   - Changed to semi-condensed Archivo for money, which also fixes the width problem at 375 px.
   - Changed to Atkinson Hyperlegible Next for UI text, chosen because handles must be read exactly.
3. **Hero treatment.** "Big number, small label, a row of stat tiles, gradient accent" is the default.
   - The big number stays, because the requirement makes available funds the headline.
   - The stat tiles and the gradient are gone. Total and reserved live in the Lining strip, which carries meaning (money set aside) instead of being a tile row.
4. **Rounding.** The reference uses one 24 px radius and pill buttons everywhere, and design-craft warns against heavy rounding on everything.
   - Changed to a radius hierarchy: 0 / 16 / 8 / 4. Buttons are 8 px rectangles, not pills.
5. **The SaaS card kit.**
   - My first sketch had the feed as a stack of identical shadowed cards and the three forms as three identical cards.
   - Now the feed is one panel with ruled rows. Pay is the only white panel; request and reserve are quieter Mist panels with outline buttons. There are no shadows anywhere.
6. **Template chrome removed:**
   - The all-caps "AVAILABLE" eyebrow became sentence case "Available to spend".
   - Middle-dot meta lines were replaced with separate lines or spaced groups.
   - I had planned a monospace face for the RFC 3339 expiry; it is set in Atkinson tabular instead.
   - No "→" on buttons.
   - The coloured left bars on status rows I first drew became status tags (word, icon and colour).

---

## 3. The plan applied

### Main figure (wallet band on `/`)

```
Available to spend                         [⟳ Refresh]
1250.00 EUR
────────────── Lining ──────────────
Total            Reserved
1300.00 EUR      50.00 EUR
```

- **Available figure (`wallet-available`).**
  - Text is exactly `1250.00 EUR`, set in Paper on Denim, Archivo 800, 61 px on mobile and 95 px on desktop. "EUR" is in a half-size inner span with a real space before it.
  - It is the largest and heaviest thing on the screen.
- **Total and reserved.**
  - `wallet-balance` and `wallet-held` are Archivo 600 at 25 px in Paper on Lining, with Chambray labels.
  - A small clasp icon sits beside "Reserved".
  - When `held` is zero, `wallet-held` and its label are absent. The strip shows only "Total 1250.00 EUR" and stays the same height, so nothing jumps.
- **Refresh.** `wallet-refresh` is an outline Paper button labelled "Refresh".
  - While loading, the label becomes "Updating balance…" and the icon turns (static under reduced motion).
  - The figures stay fully readable and are not dimmed.
  - Afterwards a Chambray line reads "Updated 19:42".

### List rows

**Activity item.** One panel; each row is 72 px or taller.

```
[↗]  ada paid grace_hopper                    − 15.00 EUR
     Dinner at Lucia's
     Today, 19:42    [🔒 Only you and grace_hopper]
```
(The padlock stands for an inline SVG icon.)

- **Icon and sign.**
  - Outgoing: arrow up-right in Graphite on a Mist circle, with a "−" outside the amount element.
  - Incoming ("lin_01 paid ada"): arrow down-left in Fern on its tint, with a Fern "+".
  - A public payment between two other people: a two-dot icon, no sign, in Pencil.
- `activity-parties-…` holds "ada paid grace_hopper", with your own handle in Pencil and the other person in Graphite 600.
- `activity-amount-…` is exactly `15.00 EUR`. The sign glyph is a separate element.
- `activity-note-…` is always rendered. When the note is empty it collapses to zero height but stays in the DOM.
- Times read "Today, 19:42", "Yesterday, 08:05" or "3 Mar 2025, 14:10". The year appears only when it is not the current year.

**Request row** on `/requests`, under the headings "Asked of you" (`incoming-list`) and "You asked" (`outgoing-list`).

```
grace_hopper asks you for                      12.50 EUR
Pizza Friday
[◷ Waiting]  Asked 2 Oct, 18:20
[████ Pay 12.50 EUR ████]   Decline
```

- Outgoing: "You asked lin_01 for 40.00 EUR" with the text button "Cancel request".
- When the request is paid, declined or cancelled, the buttons disappear and only the tag remains.

**Authorisation row** on `/authorizations` (nav label "Reserved"). Incoming open:

```
ada reserved money for you                     50.00 EUR
Deposit for the bike
[clasp Reserved]  Collect by 14 Oct 2026, 16:00 (in 8 days)
                  2026-10-14T16:00:00Z
Amount to collect  [50.00        ] EUR   [██ Collect ██]
```

- **Expiry.** The 13 px Pencil line is `authorization-expires-…` and is exactly the RFC 3339 value, inside a `<time>` element.
- **Outgoing open:** "You reserved money for grace_hopper", with the outline button "Release".
- **Captured:** "Collected 20.00 EUR of 50.00 EUR". `authorization-captured-…` is exactly "20.00 EUR".
- **Voided:** "Released back to you", or "Released by ada" when viewed by the recipient.
- **Expired:** "Expired on 2 Oct 2026. The money is back with ada."

### Status markers

Each tag is 4 px radius, 13 px Atkinson 600, with an icon, a word and a colour. `data-status` keeps the raw value.

| Raw status | Tag | Treatment |
|---|---|---|
| request `pending` | **Waiting** | Graphite text, 1 px Graphite outline, Paper background, clock icon |
| request `paid` | **Paid** | Fern on its tint, check icon |
| request `declined` | **Declined** | Pencil on Mist, cross icon |
| request `cancelled` | **Cancelled** | Pencil on Mist, slashed-circle icon |
| auth `open` | **Reserved** | Chambray on Lining (9.28), clasp icon. It deliberately matches the reserved strip in the wallet band. |
| auth `captured` | **Collected** | Fern on its tint, check icon |
| auth `voided` | **Released** | Pencil on Mist, open-clasp icon |
| auth `expired` | **Expired** | Pencil on Mist, hourglass icon |
| `public` | **Everyone** | Pencil text, globe icon, no fill |
| `private` | **Only you and {handle}** | Graphite text, padlock icon, Mist fill |

- Brick is reserved for refusals, so "Declined" is never red: a declined request is an answer, not an error.
- The visibility select reads "Who sees it", with options "Everyone" (`public`) and "Only you and them" (`private`).

### Empty states

Each sits in its own panel, left-aligned, with one outline action.

- **`empty-activity`:** "No payments yet. When you pay someone or they pay you, it shows here." The action is "Pay someone", which moves focus to `pay-handle`.
- **`empty-requests`:** "No requests either way. Ask someone for money from your wallet." The action is "Ask for money", which links to `/#request`.
- **`empty-authorizations`:** "Nothing reserved. Reserve money when someone should collect it later, like a deposit." The action is "Reserve money".

Loading versions name what is loading: "Loading activity…" over three Mist placeholder rows, and "Loading requests…".

### Errors

All of these are inline, directly under the button that caused them, with an icon and a Brick or Amber tint. None of them apologises.

**Refused (`pay-error`), Brick:**
- "Not sent. You have 12.40 EUR available and this payment is 15.00 EUR. Lower the amount or wait for money to come in."
- "Not sent. No one has the handle grace_hoper. Check the spelling."
- Validation, sent nowhere: "Enter an amount like 15.00, with up to 2 decimal places." For JPY: "Enter a whole amount like 1200."

**Uncertain (`pay-uncertain`), Amber:**
- Text: "No reply came back, so this payment may already have gone through. Press Pay again with the same details: grace_hopper is paid only once."
- The form keeps every value and the button keeps its label, "Pay".

**Other forms:**
- **`request-error`** (refused action): "Not paid. grace_hopper cancelled this request. The list now shows the latest."
- **`authorization-error`** (capture too large): "Not collected. 30.00 EUR is left to collect. Enter 30.00 or less."
- **`authorization-error`** (void refused): "Not released. grace_hopper already collected it."
- **`authorize-error`:** "Not reserved. You have 40.00 EUR available and this is 50.00 EUR."
- **`split-error`:** "Not split. lin_02 isn't a Pocketful handle. Check the list."

**Successes (Fern, check icon):**
- "Paid 15.00 EUR to grace_hopper."
- "Asked lin_01 for 40.00 EUR."
- "Reserved 50.00 EUR for grace_hopper. They can collect it until 14 Oct, 16:00."
- "Split into 4 shares and sent."
- "Collected 20.00 EUR."
- "Released 30.00 EUR back to your wallet."

**Busy button labels:** "Paying…", "Asking…", "Reserving…", "Collecting…". The button width is fixed so it doesn't jump.

### Front door (`/signup`, `/login`)

**Layout.**
- Desktop: a 50/50 split. The left half is solid Denim, the right half Paper.
- Mobile: a Denim band about 220 px tall, then the form.
- The left half holds "Pocketful" (Archivo 700, Paper) and a headline in Archivo 800 at 49 px desktop / 31 px mobile, Paper on Denim:
  > **Pay people by their handle. Set money aside until they collect it.**
- Below the headline, in Chambray at 20 px: "Requests and bill splits too, in one wallet."

**`/signup` (right half):**
- Title: "Create your wallet" (Graphite, 31 px).
- Fields:
  - "Your name" (`signup-display-name`), hint: "Shown to people you pay"
  - "Email" (`signup-email`)
  - "Password" (`signup-password`), with a hint stating the stage-1 rule
- Button: filled Denim "Create wallet" (`signup-submit`).
- `auth-error`, above the button: "That email already has a wallet. Log in, or use another email."
- Footer: "Have a wallet already? Log in"

**`/login`:**
- Title: "Log in".
- Fields: "Email" (`login-email`), "Password" (`login-password`).
- Button: "Log in" (`login-submit`).
- `auth-error`: "Email or password is wrong. Check both and try again."
- Footer: "New to Pocketful? Create a wallet"

All labels are visible, sit above the inputs, and every input is 48 px tall.

---

## 4. Delight moment: the uncertain payment, confirmed

**What a person should feel.** Relief that is certain, not hopeful. After "No reply came back" they need to know the money moved exactly once. That fear and its resolution are specific to this product, which promises a safe retry with the same key.

**The smallest interaction that delivers it.**
1. When the retry succeeds, the amber `pay-uncertain` element is removed. In the same spot, a Fern confirmation appears: "Confirmed. 15.00 EUR went to grace_hopper once."
2. Its check icon draws its own stroke in 280 ms.
3. At the same moment, the row's sign glyph in the activity feed gets a single Fern underline that fades over 600 ms. The row is the one payment.

**Constraints it respects.**
- All text, the balance and the feed row appear in their final state immediately. Only the decorative SVG stroke and underline animate.
- Nothing named by the requirements is delayed, moved or hidden.
- No neighbouring product could reuse it unchanged, because it confirms the "once" this retry flow promises.

**Reduced motion.** With `prefers-reduced-motion: reduce`, the check appears fully drawn, the underline is shown statically for 2 s and then removed with no fade, and the words are unchanged.

---

# Concept C

# Pocketful: light direction, "the lined pocket"

I invoked frontend-design, design-craft and design-references, and read only `coinbase.md` as the reference. Its name, colours, logo and signature shapes are not used anywhere below.

**The idea:** a pocket has an outside and a lining. Your money sits in the pocket. Money you have reserved for someone is still yours, but it is tucked into the lining. The whole product is built to make one number unmistakable: what you can spend now. Held money is always drawn the same way, as a diagonal hatch, so people learn the difference between "available" and "held" once and then recognise it on every screen.

---

## 1. The plan

### Palette (six core values, plus semantic pairs)

| Name | Hex | Role |
|---|---|---|
| Paper | `#FFFFFF` | Canvas of every working screen |
| Ash | `#F1F1F2` | Neutral grey surface: the pay-form band, chips, input fills on hover |
| Ink | `#1D1D21` | Primary text, amounts, headings |
| Graphite | `#5C5C66` | Secondary text, meta lines, neutral statuses |
| Lining | `#4A1043` | Deep plum. Fills the balance panel on `/` and owns half of the front door |
| Orchid | `#9C1C84` | The single action colour. Fills the primary button of each view, the focus ring, the caret, links |

Supporting values (not brand colours):
- Input border `#8E8E98` (3.24:1 on Paper, which meets the 3:1 rule for non-text).
- Hairline `#DADADD`, decorative only.
- On-Lining soft text `#E3CCDD`.
- On-Lining focus ring `#F2B8E4`.
- Selection `#F3D7EC`.

Semantic pairs, each with its contrast ratio:
- Success `#1F7A4A` on `#E8F4EC`: 4.72:1
- Refused `#B4232B` on `#FCEBEC`: 5.67:1
- Pending `#8A5A00` on `#FFF3D6`: 5.37:1
- Uncertain `#2F4F8A` on `#EBF0F9`: 7.05:1

Contrast ratios for the core pairs (WCAG 2.x, computed):

| Text on background | Ratio |
|---|---|
| Ink on Paper | 16.80:1 |
| Ink on Ash | 14.88:1 |
| Graphite on Paper | 6.61:1 |
| Graphite on Ash | 5.85:1 |
| Graphite on Refused tint `#FCEBEC` | 5.74:1 |
| Paper on Lining (the headline figure) | 14.52:1 |
| `#E3CCDD` on Lining (total, held, labels inside the panel) | 9.64:1 |
| `#F2B8E4` focus ring on Lining | 8.82:1 |
| Paper on Orchid (button text) | 7.21:1 |
| Orchid on Paper (links, focus ring) | 7.21:1 |

Orchid on Lining is only 2.01:1, so an Orchid button is never placed on the plum panel. The refresh button inside the panel is a Paper-outline button instead.

**Fallback check:**
- This is not the cream-and-clay or brown family. Lining sits at hue 307 and Orchid at 311, both purple-magenta; oxblood (`#9a2436`) sits near 350.
- It avoids the money category's navy, gold and green. Green appears only as the semantic "success" colour, at text size.
- It is not near-black with an acid accent.
- The neutrals are true greys. Graphite and Ash carry no plum tint.
- The refused red (hue 357) is about 50° away from Orchid, and every state also has its own icon shape and word, so colour is never the only signal.

### Typefaces

**Atkinson Hyperlegible Next**, from the Braille Institute, under the SIL Open Font License. It is bundled as WOFF2 files for weights 400, 600 and 700, served from the app with no CDN.

It is chosen for a product reason. Handles are `[a-z0-9_]`, so `l` / `1` / `I` and `0` / `o` confusion is a real risk of paying the wrong person, and this family is designed to tell those characters apart. One family carries every role:

- **Key figure:** 600, tracking −1%.
- **Page titles:** 400 (the calm, unbolded display taken from the reference).
- **Body:** 400.
- **Labels and buttons:** 600.
- **Amounts:** `font-variant-numeric: tabular-nums`, right-aligned in lists.

The builder must check that the bundled file actually provides `tnum`. If it does not, Atkinson Hyperlegible Mono (also OFL) is used only for amount columns in lists, never for labels.

### Type scale

Ratio 1.25, base 16 px, line-height 1.5 for body and 1.1 for display:
- 13: meta lines and timestamps, never below this.
- 16: body, inputs, buttons.
- 20: row primary line and section titles.
- 25: page titles on mobile.
- 31: page titles on desktop.
- 56: key figure on desktop, using `clamp(2.5rem, 10vw, 3.5rem)`. At 375 px this gives 40 px, so `1000000.00 EUR` still fits in 343 px.

### Spacing scale

Base 4: 4, 8, 12, 16, 24, 32, 48, 72.
- Page gutters: 16 at 375 px, 32 on desktop.
- Section gap: 48.
- Row padding: 16 vertical.
- Form field gap: 16.
- Label to input: 8.

### Radii

Different radii mark different levels of hierarchy:
- Panel: 20.
- Inputs and buttons: 10.
- Status chips: full round.
- Avatar plates: circle.

There are no shadows anywhere.

### Layout

- Content is left-aligned and capped at 1120 px.
- The header holds the wordmark on the left and `current-user` (display name, with the handle beneath it) plus `logout-button` on the right.
- The four links (Wallet, Requests, Split, Reserved) form a nav row that sits under the header on every route. At 375 px they become four equal segments with no scrolling.

**`/` at 375 px** (content comes before long forms; Pay is the one primary action):

```
+-----------------------------------+
| Pocketful        Matt Lee     [Log out]
|                  matt_lee         |
| Wallet | Requests | Split | Reserved
|-----------------------------------|
| ######## LINING PANEL ########### |
| # Available to spend           # |
| # 210.00 EUR          (40px/600)# |
| # [=========solid====|//held//] # |
| # Total 250.00 EUR              # |
| # Held 40.00 EUR                # |
| # [ Refresh ]  (paper outline)  # |
| ################################# |
|                                   |
| Send money          (Ash band)    |
| Handle   [ ada                  ] |
| Amount   [ 15.00            EUR ] |
| Note     [ Pizza Friday         ] |
| Who sees it [ Public       v ]    |
| [======= Send payment ========]   |  <- Orchid fill, full width
| (pay-error / pay-uncertain here)  |
|                                   |
| Activity                          |
| (o) ada paid matt_lee   12.50 EUR |
|     Received  Today 14:32  Public |
|     "Pizza Friday"                |
| ---------------------------------- |
| (o) matt_lee paid grace  8.00 EUR |
| ...                               |
|                                   |
| Ask for money                     |
| Handle / Amount / Note            |
| [ Send request ]   (outline)      |
|                                   |
| Reserve money                     |
| Handle / Amount / Note / Who sees |
| [ Reserve money ]  (outline)      |
+-----------------------------------+
```

**`/` on desktop (1280 px):** two columns, 7 and 5 of 12. The right column is sticky from the panel's bottom edge, so the forms stay in reach while the feed scrolls.

```
+--------------------------------------------------------------------------+
| Pocketful    Wallet  Requests  Split  Reserved        Matt Lee  [Log out]|
|                                                        matt_lee          |
|--------------------------------------------------------------------------|
| ############ LINING PANEL (spans 12 cols) ############################## |
| # Available to spend                         Total   250.00 EUR        # |
| # 210.00 EUR   (56px)                        Held     40.00 EUR        # |
| # [==================solid================|////held////]   [ Refresh ]  # |
| ######################################################################## |
|                                                                          |
| Activity                                  | Send money       (Ash band)   |
| (o) ada paid matt_lee          12.50 EUR  | Handle [ada    ] Amount [15.00]|
|     Received  Today 14:32  Public         | Note   [              ]        |
|     "Pizza Friday"                        | Who sees it [Public v]         |
| ----------------------------------------- | [ Send payment ] (Orchid)      |
| (o) matt_lee paid grace_okafor  8.00 EUR  |--------------------------------|
|     Sent  Yesterday 09:10  Private        | Ask for money                  |
| ----------------------------------------- | Handle / Amount / Note         |
| ...                                       | [ Send request ] (outline)     |
|                                           |--------------------------------|
|                                           | Reserve money                  |
|                                           | Handle / Amount / Note / Who   |
|                                           | [ Reserve money ] (outline)    |
+--------------------------------------------------------------------------+
```

`/requests` and `/authorizations` use the same nav and one column of rows (max 760 px). `/split` puts the form on the left and the live `split-preview` on the right on desktop; at 375 px the preview sits directly under the amount and handles fields.

### Principles

1. **One plum mass per screen.** On `/` it is the balance panel. On the front door it is the brand half. Every other surface is Paper or Ash.
2. **Held always looks held.** A 45° hatch (1 px lines, 6 px apart) is used for every held quantity: the panel bar, the `wallet-held` line marker, and the plate and chip of open authorisations. Nothing else is hatched.
3. **One filled Orchid button per view:**
   - Send payment on `/`.
   - Pay on each pending incoming request on `/requests`.
   - Create split on `/split`.
   - Collect on `/authorizations`.

   Every other action is an outline or text button.
4. **Feedback sits under the button that caused it**, never in a toast.
5. **Every state has three signals:** an icon shape, a colour pair and a word.
6. **Nothing moves a required element.** Motion only redraws decorative layers (the bar). Required text changes instantly to its final value.
7. **Browser surfaces are styled:**
   - Focus ring: 2 px Orchid with a 2 px offset (`#F2B8E4` inside Lining).
   - Caret: Orchid.
   - Selection: `#F3D7EC`.
   - Icons: inline SVG, 1.5 px stroke, 20 px box.

---

## 2. What I took from the reference, and what I changed in the review

### Taken from the reference (composition only)

- A pure white canvas, with one saturated colour reserved for primary actions and used sparingly.
- Its "featured" move: one dark, inverted panel among white surfaces marks the thing that matters. Here that panel is the balance.
- Page titles in a calm, unbolded display weight (400).
- List rows as flat lines with hairline dividers and a circular plate on the left, not cards.
- Semantic colour used as text colour on a tint, never as a button fill.
- A single, spare elevation model.
- A generous 4-px spacing rhythm.

### Not taken

- Its blue, its pill-shaped call-to-action geometry, its layered rotated mockup cards and its typefaces.
- Monospace for every number.

### Review against the defaults (what I changed and why)

1. **Typeface.** My first draft followed the reference's documented substitutes: Inter, with a mono for amounts. That is the default pair, and mono for small data is listed as a tell. I replaced both with Atkinson Hyperlegible Next, chosen for handle legibility, with tabular figures for amounts.
2. **Palette.** My first instinct was a deep navy panel with an emerald action, which is the money category's habitual palette. I replaced it with Lining plum and an Orchid action, taken from the pocket-lining idea.
3. **Balance hero.** My first draft was the default "big number, small label, gradient accent" treatment. I removed the gradient, and the panel's second element is now the hatched available/held bar. It carries real information (the proportion that is held) rather than decoration.
4. **Forms.** My first draft put the three forms in three identical rounded cards with soft shadows (the SaaS-card kit). Now only the Pay form sits on an Ash band; Request and Reserve are plain sections divided by a hairline. There are no shadows anywhere, and radii differ by level.
5. **Button shape.** The reference's pill buttons are its signature, so I changed them to a 10 px radius. Status chips keep the full round, because there the shape means "status", not "action".
6. **Tabs.** I considered tabs for Pay, Request and Reserve, but dropped them: all three forms stay visible, because required elements must stay visible and in place.
7. **Key figure weight.** The reference keeps display text at 400. I kept 400 for page titles but set the available figure at 600, because design-craft requires the key figure to be both the largest and the heaviest thing on the screen.
8. **Template chrome removed.** There are no ALL-CAPS eyebrows, no middle-dot meta strings, no "→" on buttons, and no coloured bars down the sides of rows or messages. Meta items are separated by 12 px of space, not by characters.

---

## 3. The plan applied, with exact words

### Main figure (the Lining panel on `/`)

- **Label:** "Available to spend". 16/600, `#E3CCDD`, sentence case, above the number.
- **`wallet-available`:** `210.00 EUR`. 56 px (40 px at 375), weight 600, Paper, tabular. It carries `data-amount="21000"`.
- **The bar:** full panel width, 8 px tall, radius 4. The solid Paper portion is available; the hatched `#E3CCDD` portion is held. It has `aria-hidden`, because the numbers carry the meaning.
- **Secondary lines:** 16/400, `#E3CCDD`, with the amount in Paper.
  - "Total" followed by `wallet-balance`, e.g. `250.00 EUR`, with `data-amount`.
  - "Held for others" followed by `wallet-held`, e.g. `40.00 EUR`. A hatched 12 px square sits before the label, and the line links to `/authorizations`. The whole line is absent when held is zero, and the bar is then fully solid.
- **`wallet-refresh`:** "Refresh balance" (Paper outline button).
  - While loading, it reads "Refreshing…" with a 16 px SVG spinner. The figures stay visible at full opacity, with "Updating…" in 13 px beside the button.
  - After a refresh it reads "Updated 14:32" for a few seconds.

### List rows

**Activity item** (`activity-item-{id}`, `data-visibility`):

```
(AD)  ada paid matt_lee                         12.50 EUR
      Received   Today, 14:32   [lock] Private
      Pizza Friday
```

- **Plate:** 40 px circle in Ash, holding the other party's initials (two letters of the handle) and a small SVG direction glyph at the corner. The glyph is a down-left arrow for received and an up-right arrow for sent.
- **`activity-parties-{id}`:** "ada paid matt_lee", in 20/600 Ink. Your own handle is set in Graphite at weight 400 so that the other person stands out.
- **`activity-amount-{id}`:** "12.50 EUR". Right-aligned and tabular, Ink, 20/600. The sign and direction live in the meta line, never inside the amount.
- **Meta line:** 13 px Graphite. It reads "Received", "Sent", or "Between others" for public payments that do not involve you, followed by the time and the privacy marker.
- **Times:** "Today, 14:32", "Yesterday, 09:10", "3 Mar 2025, 18:05" (the year appears only when it is not the current year).
- **`activity-note-{id}`:** "Pizza Friday", 16/400 Ink. When the note is empty, the element is present but empty and takes no space.

**Request row** (`request-item-{id}`, `data-status`), in two lists headed "Asked of you" (`incoming-list`) and "You asked" (`outgoing-list`):

```
(AD)  ada asks you for                          12.50 EUR
      Pizza Friday
      (o) Waiting   Sent 2 Oct, 19:40
      [ Pay 12.50 EUR ]  [ Decline ]
```

- **`request-pay-{id}`:** "Pay 12.50 EUR" (Orchid fill).
- **`request-decline-{id}`:** "Decline" (outline).
- **Outgoing pending row:** reads "You asked grace_okafor for 30.00 EUR", with `request-cancel-{id}` "Cancel request" as a text button.
- **Refusals:** `request-error` appears directly under the row's buttons.

**Authorisation row** (`authorization-item-{id}`, `data-status`):

```
(GO)  Reserved for grace_okafor                 40.00 EUR
 ///  Collected so far 15.00 EUR of 40.00 EUR
      [hatch] Held   Collect by Fri 9 Oct, 18:00
      Expires 2026-10-09T18:00:00Z
```

- **Plate:** has a hatched ring while the authorisation is open.
- **Title:** "Reserved for grace_okafor" on outgoing rows, "ada reserved for you" on incoming rows.
- **`authorization-amount-{id}`:** `40.00 EUR`.
- **`authorization-expires-{id}`:** the RFC 3339 text exactly, in 13 px Graphite after the word "Expires". The friendly time ("Collect by Fri 9 Oct, 18:00") is a separate element above it.
- **Incoming open:**
  - `authorization-capture-amount-{id}` is labelled "Amount to collect" and prefilled with the remaining amount, e.g. "25.00".
  - `authorization-capture-{id}` is "Collect" (Orchid fill).
- **Outgoing open:** `authorization-void-{id}` is "Release hold" (outline).
- **Captured:** the row reads "Collected" followed by `authorization-captured-{id}` (`40.00 EUR`).

### Status markers

Each marker is a full-round chip, 13/600, with a 12 px SVG icon, a word and a tint.

| Status | Word | Icon | Colours |
|---|---|---|---|
| request `pending` | Waiting | hollow ring | Pending amber on `#FFF3D6` |
| request `paid` | Paid | filled check | Success on `#E8F4EC` |
| request `declined` | Declined | slashed circle | Graphite on Ash |
| request `cancelled` | Cancelled | circle with a minus | Graphite on Ash, word struck through |
| authorisation `open` | Held | hatched square | Ink on hatched Ash |
| authorisation `captured` | Collected | filled check | Success on `#E8F4EC` |
| authorisation `voided` | Released | return arrow | Graphite on Ash |
| authorisation `expired` | Expired | clock | Graphite on Ash |
| `public` | Public | two-figure glyph | Graphite text, no chip |
| `private` | Private | closed padlock | Ink text, no chip |

Privacy is not a status, so it gets no tint. Private payments differ from public ones by the padlock and the heavier ink.

### Empty states

Each is Ink text, 20/600 for the title and 16/400 Graphite for the body, with one action.

- **`empty-activity`:** "No payments yet." / "Send money to someone by their handle, and it shows up here." The action is a text link, "Send money", which moves focus to `pay-handle`.
- **`empty-requests`:** "No requests yet." / "Ask someone for money from your wallet, and it shows up here." The action is a text link, "Ask for money", which goes to `/#request`.
- **`empty-authorizations`:** "Nothing reserved." / "Reserve money for someone and they can collect it when they're ready. Until then it stays yours, held aside." The action is a text link, "Reserve money", which goes to `/#reserve`.

### Errors and the uncertain state

All messages sit directly under the button that caused them, with a full 1 px border in the state's colour, a radius of 10 and an icon.

**Refused**: Refused red on its tint, with a circle-cross icon:
- **`pay-error`** (insufficient funds): "Payment not sent. You have 12.00 EUR available to spend and this payment is 15.00 EUR. Lower the amount, or wait for a held amount to be released." The balance and feed refresh, and all inputs keep their values.
- **`pay-error`** (validation): "Enter an amount like 15.00, with no more than 2 decimal places."
- **`pay-error`** (unknown handle): "No one has the handle ada_l0velace. Check the spelling and try again."
- **`request-error`** (request cancelled elsewhere): "This request was cancelled, so it can't be paid. The list has been updated."
- **`authorize-error`:** "Money not reserved. You have 12.00 EUR available to spend."
- **`authorization-error`:** "Couldn't collect 30.00 EUR. Only 25.00 EUR is left to collect."
- **`split-error`:** "Split not created. Check that every handle exists and is separated by a comma."

**Uncertain** (`pay-uncertain`): Uncertain slate-blue on its tint, with a dashed border and a clock icon, so it never reads as red.
- Text: "We didn't get an answer about this payment, so it may or may not have gone through. Retrying is safe: it uses the same payment, so money moves at most once."
- The button `pay-submit` reads "Retry payment" while the form is unchanged. If any field is edited, it returns to "Send payment".

**Success** (Success green, check icon, under the button):
- Pay: "Sent 15.00 EUR to ada."
- Request: "Asked ada for 12.50 EUR."
- Reserve: "Reserved 40.00 EUR for grace_okafor."
- Collect: "Collected 25.00 EUR."
- Release: "Released 40.00 EUR."

**Loading:** the button keeps its width, shows a spinner and reads "Sending…", "Asking…", "Reserving…", "Collecting…" or "Releasing…". It is disabled while the request is in flight.

### The front door (`/signup`, `/login`)

**Desktop:** a split screen.
- The left half is solid Lining with the wordmark "Pocketful" at 31/400 in Paper and a headline at 49/400 in Paper: "Pay, ask and split with people you know, by their handle." There is a small hatched-bar motif under the headline.
- The right half is Paper with the form, 400 px wide.

**375 px:** the Lining area becomes a 200 px band at the top holding the headline, with the form below.

**`/signup`:**
- Title: "Create your account".
- Display name (`signup-display-name`), with the hint "Shown to people you pay."
- Email (`signup-email`).
- Password (`signup-password`).
- Button `signup-submit`: "Create account" (Orchid, full width).
- Below the button: "Already have an account? Log in".
- `auth-error`: "An account with this email already exists. Log in instead."

**`/login`:**
- Title: "Log in".
- Email (`login-email`).
- Password (`login-password`).
- Button `login-submit`: "Log in".
- Below the button: "New to Pocketful? Create an account".
- `auth-error`: "That email and password don't match an account. Check both and try again."

All labels sit visibly above their inputs (16/600 Ink). Inputs are 48 px tall with a `#8E8E98` border.

---

## 4. Delight moment: money tucked into the lining

**What a person should feel:** "It's set aside, and still mine." Reserving money is the one thing Pocketful does that ordinary payment apps don't. The worry is "did I just lose 40 euros?", and the reassurance belongs to this product alone.

**The smallest interaction:** when a reservation succeeds, the requirement text updates instantly to its final values:
- `wallet-available` shows `210.00 EUR`.
- `wallet-held` appears with `40.00 EUR`.
- The success line reads "Reserved 40.00 EUR for grace_okafor."

Only then, in the decorative bar inside the panel, the matching length of the solid "available" fill slides right over 280 ms (ease-out) and turns into hatch, joining the held section. The same animation plays in reverse when a hold is released or expires and the money comes back.

It never touches a required element, never counts numbers up or down, and never delays input.

**Reduced motion:** with `prefers-reduced-motion: reduce`, the bar redraws in its final state with no slide. The success line carries the meaning on its own, so nothing is lost.
