## Verdict per concept

- **Concept A ("the lit pocket", dark): rejected.**
- **Concept B ("the pocket", denim): rejected.** This was the closest call.
- **Concept C ("the lined pocket", light, plum): ranked first. It is the only concept left, so it wins.**

I applied all three skills: frontend-design, design-craft and design-references.

---

## Rejections

### Concept A: rejected

**1. It breaks a product constraint and a requirement as written.**
- A says: "The `@` of the handle is a CSS `::before` on `current-handle`." Its wireframes show "Mina Lee  @mina".
- The requirement says: "`current-handle` | Text is exactly the caller's handle, with no `@` and no surrounding words."
- The constraint says: "Every element and text the requirements name stays visible, in place and exactly as specified. Nothing the design adds … delays, hides or moves it."
- An "@" added through CSS can slip past a `textContent` check, but the visible text of the element is still "@mina", not the handle as specified. B and C both show the bare handle ("ada", "matt_lee").

**2. On three of its working routes it lands on frontend-design default #2.**
- Default #2 is "a near-black background with a single bright acid-green or vermilion accent".
- A's palette is "Night `#000000` Canvas: true black" and "Lining `#9BD0FF` Brand: the pocket panel, primary buttons, focus ring, selection, caret, links".
- A defends itself against the default this way: "it owns a large region (the pocket panel) instead of acting as a thin accent". That defence only holds on `/` and the front door.
- Its own Principle 1 takes the defence away everywhere else: "On `/requests`, `/split` and `/authorizations` it is the primary button and the page's key figure … Everything else stays Night, Seam, Chalk or Lint."
- So `/requests`, `/split` and `/authorizations` are a black canvas with one bright accent on the buttons, which is the default look. They also break design-craft's composition rule that a saturated colour "owns at least one large region or the key panel, not only thin lines, small text and icons".

**3. A supporting concern (not needed for the rejection).**
- The held slip is "Night on Chalk, 21:1": a white slip that "rises 40 px above the panel's top-right edge" on a black screen.
- That makes it the highest-contrast object on `/`, which works against "Available funds must be the clearest monetary value once holds exist, with total and held funds visibly secondary."

### Concept B: rejected

**1. It lands on a fallback palette that design-craft names.**
- The rule: "A category's habitual colours, such as navy, gold and green for money."
- B's colours:
  - "**Denim** `#2A4BA8` | Brand colour. Owns the wallet band, the front-door panel and filled primary buttons."
  - "**Lining** `#1B2F6B` | The strip under the band that holds total and reserved."
  - Green "Success (Fern) `#0E6B3A`".
- B checks only Denim ("Denim is a mid-value blue (lightness 41%), not navy"). It never checks Lining. `#1B2F6B` is hue about 225°, saturation about 60%, lightness about 26%: a navy. It fills a full-width strip on `/`.
- B's own review moved the hue toward navy: "Changed to Denim `#2A4BA8`: darker, less violet."
- The result is a blue/navy wallet with green for money-in ("Incoming … arrow down-left in Fern … with a Fern '+'"). That is the category's habitual colouring, with only the gold missing.

**2. Inside its key region the composition is close to one flat tone.**
- Denim (hue about 224°), Lining (about 225°) and Chambray `#D3DDF7` (the same hue) are three lightness steps of one blue.
- design-craft's definition of a flat tone is "a single hue … and everything else is a lighter or darker step of that hue". The band and strip, which are the signature, match it.
- The whole screen is not flat, because the Mist canvas and Paper panels add neutral contrast. So this point supports the rejection rather than deciding it.

**3. The ranking would not change if B were kept.** On the working-screen test, a blue wallet is less distinctive than the category's usual screens, because blue is the category's usual colour. So C would still rank above B. B's real strength is evenness: "a slimmer Denim band" on `/requests`, `/split` and `/authorizations`, so "Colour owns a region on every screen".

### Concept C: passes every rejection test

- **Constraints:**
  - Fonts and icons live inside the product: "bundled as WOFF2 … served from the app with no CDN", and "Icons: inline SVG".
  - The handle is shown bare.
  - The delight motion touches only the aria-hidden bar: "It never touches a required element … and never delays input."
- **Character:** the calm, trustworthy character the requirements ask for holds, with available funds as the headline: "`wallet-available` … 56 px (40 px at 375), weight 600, Paper". Total and held are "16/400, `#E3CCDD`".
- **Defaults and fallbacks:**
  - The canvas is Paper `#FFFFFF`, not cream.
  - The colours are plum `#4A1043` and orchid `#9C1C84` ("hue 307 … 311"), clear of oxblood (about 350°) and of navy, gold and green.
  - "The neutrals are true greys. Graphite and Ash carry no plum tint."
  - There are no all-caps eyebrows, middle dots or arrows.
  - "There are no shadows anywhere", and radii vary by level.
- **Composition on `/`:**
  - Value contrast: "Paper on Lining … 14.52:1".
  - A key figure on a contrasting second mass: the plum balance panel.
  - A brand colour that owns a region: "Lining … Fills the balance panel on `/` and owns half of the front door".

---

## Ranking

**1. C.** It is the only concept left.

**Working-screen test.** With the name covered, `/` reads as a wallet:
- a balance panel;
- "Send money" with "Handle / Amount / Note / Who sees it";
- an "Activity" feed of rows "(o) ada paid matt_lee  12.50 EUR";
- the nav "Wallet | Requests | Split | Reserved".

It is at least as clean as the category's usual screens. Rows are "flat lines with hairline dividers and a circular plate on the left, not cards", and only Pay has a surface: "Now only the Pay form sits on an Ash band; Request and Reserve are plain sections divided by a hairline."

It is more distinctive than them in two ways:
- A plum and orchid palette, unusual for money.
- A held hatch that carries meaning: "A 45° hatch … is used for every held quantity: the panel bar, the `wallet-held` line marker, and the plate and chip of open authorisations. Nothing else is hatched."

**Evenness, component by component.**

| Component | Status | Evidence |
|---|---|---|
| Main figure | Strong | label, figure, hatched bar, secondary lines and refresh states are all specified |
| Rows | Strong | activity, request and authorisation rows share the plate and the exact words |
| Markers | Strong | a full table, each with "three signals: an icon shape, a colour pair and a word" |
| Empty | Strong | all three, each with a title, body and action |
| Error | Strong | pay, request, authorise, authorisation and split |
| Uncertain | Strong | "slate-blue on its tint, with a dashed border and a clock icon, so it never reads as red", plus "Retry payment" |
| Front door | Strong | "a small hatched-bar motif under the headline" |
| `/requests` | Weaker | "same nav and one column of rows (max 760 px)", no colour region |
| `/split` | Weakest | one sentence: "form on the left and the live `split-preview` on the right", no preview styling, success copy or loading label |
| `/authorizations` | Rows strong, page weaker | the rows are strong, but the page has no plum region |

The `/requests` and `/authorizations` gap comes from C's own rule: "One plum mass per screen. On `/` it is the balance panel. On the front door it is the brand half. Every other surface is Paper or Ash." That leaves no second visual mass on those screens.

---

## Winner (C): parts that would break a requirement or constraint as written

**1. The sticky forms column can hide required elements.**
- C says: "The right column is sticky from the panel's bottom edge, so the forms stay in reach while the feed scrolls."
- The column stacks Pay, Request and Reserve, which is taller than a typical desktop viewport. The bottom of the column (`authorize-submit`, `authorize-error`, and the request and reserve success lines) stays below the fold until the feed has scrolled to its end.
- This breaks: "Nothing the design adds, motion included, delays, hides or moves it."

**2. A captured amount is shown on an open authorisation.**
- C's open row reads "Collected so far 15.00 EUR of 40.00 EUR" with "[hatch] Held".
- The requirement: "`authorization-captured-{id}` | Formatted captured amount. Present only when `status` is `captured`."
- That line must not carry the `authorization-captured` element.

**3. Removing the uncertain message after a successful retry is not specified.**
- C covers the uncertain state and the "Retry payment" label, but never says `pay-uncertain` is removed on success.
- The requirement: "Successful retry removes both error/uncertainty elements, refreshes the balance and feed, and moves money exactly once."

**4. The amount error wording is wrong for JPY.**
- C has only "Enter an amount like 15.00, with no more than 2 decimal places."
- The requirement: "Nonnumeric input or more than `minor_units` decimal places must show the form's error element." For JPY (`minor_units: 0`) the message is wrong.
- It also misses "Format people, amounts and timestamps for people first".

**5. Loading states are missing outside the buttons.**
- C gives button labels only: "Sending…", "Asking…", "Reserving…", "Collecting…" or "Releasing…".
- It has no list-loading state for `/requests`, `/authorizations` or the feed.
- `/split` has no loading label, no success copy, and no empty or initial state for `split-preview`.
- The requirement: "Provide considered empty, loading and error states."

**6. Activity note quotes.**
- The 375 px wireframe shows `"Pizza Friday"` in quotes.
- The requirement: "`activity-note-{payment_id}` | Text is exactly the note."
- The written spec ("`activity-note-{id}`: 'Pizza Friday', 16/400 Ink") is correct, but quotes must not be rendered inside the element.

**7. Contrast on the open chip is unmeasured.**
- The `open` chip is "Ink on hatched Ash" at 13 px. C computes no ratio for text over the hatch lines.
- The requirement: "text and controls need sufficient contrast."

**8. Uncertain and expired share an icon (minor).**
- Uncertain uses "a clock icon", and the `expired` chip also uses "clock".
- The requirement asks that "Available, held, pending, loading, successful, refused and uncertain states must be visually distinct." Colour and border still separate the two states.

**9. Plan inconsistencies (design-craft, not requirement breaks).**
- C's own review says it keeps the figure heaviest: "the available figure at 600, because design-craft requires the key figure to be both the largest and the heaviest thing". But labels, buttons and row amounts are also 600, so the figure is largest but only tied for heaviest.
- Principle 3, "One filled Orchid button per view", conflicts with "Pay on each pending incoming request" and "Collect" filled on every incoming open row.
