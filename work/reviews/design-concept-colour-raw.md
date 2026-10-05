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
