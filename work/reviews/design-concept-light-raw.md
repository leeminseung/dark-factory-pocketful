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
