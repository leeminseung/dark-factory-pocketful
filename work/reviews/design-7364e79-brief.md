# Screen review brief — Pocketful stage 2, revision 7364e79, round 1

Review the screenshots below against the design direction, the requirement text about screens and
the product constraints. Use the skills frontend-design and design-craft (invoke both with the
Skill tool and follow them). Answer in text only; write no files.

Open each screenshot with the Read tool. Every screenshot is a PNG under /tmp/pd-shots/7364e79/.
Names are `{viewport}-{screen-or-state}.png`; viewport 375 is a 375×812 phone, 1280 is a
1280×900 desktop. Names without `-fold`/`focus`/`error`/`loading`/`uncertain`/`success` are full
pages; the state shots are the visible viewport. `index.txt` in that folder lists each shot with its
document scrollWidth vs clientWidth (no shot has horizontal scroll).

Data in the shots: the signed-in user is "Maximiliane Okafor-Lindqvist", handle
`grace_okafor_lindqvi` (20 characters), EUR with 2 decimals; another user `l1_0o`; a 200-character
note without spaces; open holds (40.00 EUR outgoing, 25.00 EUR incoming, one seeded hold already
expired). Other fixtures: a user with no activity (`solo`) and a JPY wallet (0 decimals).

Shots (375 and 1280 each): signup, signup-error, login, login-error, wallet-held,
wallet-held-fold, focus-input, focus-button, pay-error-validation (15.005), pay-error-insufficient,
pay-loading, pay-success, pay-uncertain (response lost), pay-retry-success, refresh-loading,
after-authorize, authorize-error, request-form-error, requests-loading, requests, requests-error
(request cancelled elsewhere, then Pay clicked), requests-paid, split-initial, split-preview,
split-invalid-amount, split-error, split-success, auth-loading, authorizations, auth-error (capture
too large), auth-captured, auth-voided, wallet-after-release, wallet-empty, requests-empty,
auth-empty, wallet-jpy, jpy-pay-error.

## Answer with

1. Scores 1–5 with one line of evidence each for: composition, design quality, distinctiveness
   (design-craft's test for working screens), craft, function, delight.
2. Checks: horizontal scrolling, visible labels, visible keyboard focus, touch targets ≥44 px on
   phones, contrast, and whether the states that must look different (available, held, pending,
   loading, successful, refused, uncertain) do.
3. Findings, each with: screenshot file name(s), viewport, what is wrong, the design.md section or
   requirement sentence it departs from (quote it), and whether it breaks a requirement sentence
   (quote) or only the direction. Rank by impact. Only report what you can see in a screenshot.

## Design direction (work/design.md, verbatim)

# Pocketful design direction — stage 2 ("the lined pocket")

Owner: product-designer. Applies to every screen in `stage-2/`: `/signup`, `/login`, `/`,
`/requests`, `/split`, `/authorizations`. Built to the stage-2 "Product and visual direction"
section and the UI tables of `spec/stage-2.md`.

How it was chosen: three concept passes (light / dark / colour-led), then a selection pass.
Briefs and raw answers: `work/reviews/design-concept-{light,dark,colour}-{brief,raw}.md`,
`work/reviews/design-selection-{brief,raw}.md`. The selection rejected the dark concept (it put an
`@` before `current-handle`, and its secondary routes were black with one bright accent) and the
denim concept (navy lining plus green money-in: the category's habitual palette). This file takes
the light concept and fixes the nine defects the selection found in it (§11).

## 1. The idea

A pocket has an outside and a lining. Money you can spend is in the pocket. Money you have
reserved for someone is still yours, tucked into the lining. Every screen makes one number
unmistakable: what you can spend now. Held money is always drawn the same way — a 45° hatch —
so a person learns "held" once and recognises it everywhere. Nothing else in the product is
hatched.

Character: calm and trustworthy. White working screens, one deep plum mass per screen, one
orchid action colour, true-grey neutrals, no shadows.

## 2. Tokens

### Colour

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#FFFFFF` | Canvas of every working screen; text on plum |
| `--ash` | `#F1F1F2` | The one raised surface per screen (pay form band), chips, hover fills |
| `--ink` | `#1D1D21` | Primary text, amounts, headings |
| `--graphite` | `#5C5C66` | Secondary text, meta lines, neutral statuses |
| `--lining` | `#4A1043` | Deep plum. The one brand mass per screen (§4) and half the front door |
| `--orchid` | `#9C1C84` | Action colour: filled primary buttons, links, focus ring, caret |
| `--lining-soft` | `#E3CCDD` | Secondary text and the hatch on plum |
| `--lining-ring` | `#F2B8E4` | Focus ring on plum |
| `--field` | `#8E8E98` | Input borders (3.24:1 on paper) |
| `--hairline` | `#DADADD` | Row dividers only, never text |
| `--selection` | `#F3D7EC` | Text selection background (ink text) |

State pairs (text / tint). Colour is never the only signal: every state also has its own icon
and word (§6).

| State | Text | Tint | Ratio |
|---|---|---|---|
| Success | `#1F7A4A` | `#E8F4EC` | 4.72 |
| Refused | `#B4232B` | `#FCEBEC` | 5.67 |
| Pending | `#8A5A00` | `#FFF3D6` | 5.37 |
| Uncertain | `#2F4F8A` | `#EBF0F9` | 7.05 |

Core contrast: ink/paper 16.80, ink/ash 14.88, graphite/paper 6.61, graphite/ash 5.85,
paper/lining 14.52, lining-soft/lining 9.64, lining-ring/lining 8.82, paper/orchid 7.21,
orchid/paper 7.21. **Never put orchid on plum (2.01).** Inside the plum panel, buttons are
paper-outline.

### Type

One family: **Atkinson Hyperlegible Next** (SIL OFL), chosen because handles
(`[a-z0-9_]`) must not be misread — it separates `l 1 I` and `0 o O`.

- Bundle the WOFF2 files for weights 400, 600 and 800 and the OFL text inside `stage-2/`;
  serve them from the app with `@font-face` and `font-display: swap`. No CDN, no runtime fetch.
  Fallback stack: `"Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", sans-serif`.
- Amounts and times: `font-variant-numeric: tabular-nums`. Check the bundled file has `tnum`;
  if not, keep proportional figures and right-align amount columns (no monospace face).
- Weights: **800 only for the available figure and the front-door headline** (so the key figure
  is the heaviest thing on its screen), 600 for labels, buttons, row titles and row amounts,
  400 for body and page titles.

Scale (ratio 1.25, base 16): 13 meta and timestamps (never smaller) · 16 body, inputs, buttons ·
20 row title, row amount, section headings · 25 page titles at 375 · 31 page titles desktop ·
49 front-door headline desktop (31 at 375) · available figure `clamp(2.5rem, 10vw, 3.5rem)`
(40 px at 375, 56 px desktop), line-height 1.1. Body line-height 1.5. Prose max 68ch.
Sentence case everywhere; no all-caps, no eyebrows, no middle-dot meta strings, no `→` in labels.

### Space, shape, size

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 72. Gutters 16 at ≤600 px, 32 above.
  Section gap 48. Row padding 16 vertical. Field gap 16. Label-to-input 8.
- Radii by level: plum panel 20 · inputs and buttons 10 · status chips fully round ·
  avatar plates circle. No shadows anywhere.
- Inputs 48 px tall. Buttons at least 44 px tall and 44 px wide on every viewport.
- Icons: inline SVG, 20 px box, 1.5 px stroke, `currentColor`. Never emoji or text glyphs.

### Browser surfaces

- Focus: `:focus-visible { outline: 2px solid var(--orchid); outline-offset: 2px }`;
  inside plum the outline is `--lining-ring`. Never remove an outline without this.
- Caret `--orchid`; `::selection` ink on `--selection`.
- `color-scheme: light`. Selects and inputs use paper fill, `--field` border, ink text.

## 3. Layout and navigation

Content left-aligned, max width 1120 px, centred container.

**Header (every signed-in screen, identical):** wordmark "Pocketful" (20/600 ink) left; right:
`current-user` (display name, 16/600 ink) with `current-handle` beneath it (13/400 graphite,
**bare handle text only** — no `@`, no CSS `::before` content, no words), then `logout-button`
"Log out" (text button). Below the header, the nav: four separate links with 24 px gaps, **Wallet** (`/`), **Requests**
(`/requests`), **Split** (`/split`) and **Reserved** (`/authorizations`). The current link
is ink 600 with a 2 px orchid underline (`aria-current="page"`); others graphite 400. At ≤600 px
the four links are four equal-width segments on one row (each ≥44 px tall); no scrolling nav.

**No horizontal scroll at 375 px:** every container `min-width: 0`; amount elements
`white-space: nowrap`; party lines and notes wrap between words with
`overflow-wrap: anywhere` as the last resort only for unbroken notes; the 20-character handle
`grace_okafor_lindqvi` must fit a 343 px row title. Test with the longest content in §10.

### `/` desktop (≥960 px): two columns 7/5, nothing sticky

```
[Pocketful]  Wallet  Requests  Split  Reserved              Matt Lee      [Log out]
                                                            matt_lee
┌──────────────── PLUM PANEL (12 cols) ───────────────────────────────────────────┐
│ Available to spend                               Total            250.00 EUR    │
│ 210.00 EUR        (56/800 paper)                 [▨] Held for others 40.00 EUR  │
│ [██████████████ solid ███████████████|▨▨▨▨ held ▨▨▨▨]           [ Refresh ]    │
└─────────────────────────────────────────────────────────────────────────────────┘
Activity                                     │ Send money        (ash band)
(AD) ada paid matt_lee            12.50 EUR  │ Handle  Amount  Note  Who sees it
     Received  Today, 14:32  [lock] Private  │ [ Send payment ]  (orchid fill)
     Pizza Friday                            │ feedback here
──────────────────────────────────────────── │ ──────────────────────────────
...                                          │ Ask for money     (plain)
                                             │ [ Send request ]  (outline)
                                             │ ──────────────────────────────
                                             │ Reserve money     (plain)
                                             │ [ Reserve money ] (outline)
```

The right column scrolls with the page (the selection's defect 1: a sticky column would hide
`authorize-submit` and its feedback).

### `/` at 375 px: balance, then Pay, then Activity, then the other two forms

```
Pocketful                  Matt Lee  [Log out]
                           matt_lee
[Wallet][Requests][Split][Reserved]
┌ PLUM ─────────────────────────────┐
│ Available to spend                │
│ 210.00 EUR          (40/800)      │
│ [████████████████|▨▨▨▨]           │
│ Total            250.00 EUR       │
│ [▨] Held for others 40.00 EUR     │
│ [ Refresh ]                       │
└───────────────────────────────────┘
Send money (ash band, full width)
Handle / Amount [15.00] EUR / Note / Who sees it
[========= Send payment =========]
Activity rows…
Ask for money …
Reserve money …
```

Other routes: one column (max 760 px) under the same header and nav; layouts in §5.

## 4. One plum mass per screen

Every working screen has exactly one plum region, so colour owns a region on each screen and the
key figure sits on it (fixes the selection's evenness gap on `/requests`, `/split`,
`/authorizations`):

| Screen | Plum mass | Contents |
|---|---|---|
| `/` | Balance panel | Available figure, hatched bar, total, held, refresh |
| `/requests` | Summary strip at the top (radius 20, 24 px padding) | "Waiting for you" + count and sum of pending incoming, e.g. "2 requests, 37.50 EUR"; with none: "Nothing is waiting for you." |
| `/split` | `split-preview` | The shares (§5.4) |
| `/authorizations` | Summary strip | "Held for others" sum of outgoing open remainders with a hatch swatch; "Ready for you to collect" sum of incoming open remainders. With none: "Nothing is held right now." |
| `/signup`, `/login` | Brand half (§7) | Wordmark and headline |

The strips are summaries computed from the lists already on the page; they carry no
`data-testid` of their own and never duplicate `wallet-*` ids (those live only on `/`).

## 5. Components and the words of each state

General: every input has a visible `<label>` above it (16/600 ink). Feedback sits directly under
the button that caused it, never in a toast; refusals use `role="alert"`, success and uncertain
`role="status"`. Every message element exists only while it applies (`auth-error`, `pay-error`,
`pay-uncertain` etc. are absent, not hidden, otherwise).

Amount inputs: `type="text" inputmode="decimal"`, the currency code shown as a static suffix
outside the input. Amount format everywhere is exactly the spec's: `100.00 EUR`, `1200 JPY`.

Amount-validation message (shown in the form's own error element, no request sent):
- `minor_units` > 0: "Enter an amount like 15.00, with up to {minor_units} decimal places."
- `minor_units` = 0: "Enter a whole amount like 1200, with no decimal point."

Times: "Today, 14:32", "Yesterday, 09:10", "3 Oct, 18:05" within the current year,
"3 Mar 2025, 18:05" otherwise; 24-hour clock; `<time datetime="…">` around each.

### 5.1 Balance panel (`/`)

- Label "Available to spend" (16/600 `--lining-soft`).
- `wallet-available`: e.g. `210.00 EUR`, 800 paper, tabular, `data-amount`. The headline. Its
  text is the formatted amount only; the code may be wrapped in an inner span at the same size
  but the element text stays `210.00 EUR`.
- The bar (decorative, `aria-hidden="true"`): full width, 8 px tall, radius 4. Solid paper =
  available, hatched `--lining-soft` on plum = held. Fully solid when held is zero.
- "Total" then `wallet-balance` (16/400 lining-soft label, 16/600 paper amount, `data-amount`).
- Held line: 12 px hatch swatch, "Held for others", then `wallet-held` (`data-amount`). The
  whole line, including `wallet-held`, is **absent when held is zero**; the line is a link to
  `/authorizations`.
- `wallet-refresh`: "Refresh" (paper-outline button, refresh icon). While loading: "Refreshing…",
  icon turns (static under reduced motion), figures stay at full opacity and in place. After:
  "Updated 14:32" in 13 px beside the button. Latest refresh wins; never clears the pay form.

### 5.2 Forms on `/`

| Form | Title | Button (idle / busy) | Success line |
|---|---|---|---|
| Pay (ash band, the primary) | "Send money" | `pay-submit` "Send payment" / "Sending…" (orchid fill) | "Sent 15.00 EUR to ada." |
| Request (plain) | "Ask for money" | `request-submit` "Send request" / "Asking…" (orchid outline) | "Asked ada for 12.50 EUR." |
| Authorise (plain) | "Reserve money" | `authorize-submit` "Reserve money" / "Reserving…" (orchid outline) | "Reserved 40.00 EUR for grace_okafor. It stays yours until they collect it." |

Field labels: "Handle" (`*-handle`; hint "Their Pocketful handle, like ada"), "Amount",
"Note (optional)", "Who sees it" (`pay-visibility`, `authorize-visibility`: options
"Everyone (public)" value `public`, "Only the two of you (private)" value `private`).
Busy buttons keep their width, show a spinner and are disabled while in flight.

Refusals (orchid-free: refused red on its tint, 1 px solid border, circle-cross icon). Inputs keep
their values.

| Cause | `pay-error` / `request-error` / `authorize-error` text |
|---|---|
| `insufficient_funds` | "Not sent. You have {available} available to spend and this payment is {amount}. Lower the amount or wait for held money to be released." (authorise: "Not reserved. You have {available} available to spend.") |
| `not_found` handle | "No one has the handle {handle}. Check the spelling." |
| `self_payment` | "That's your own handle. Enter someone else's." |
| `validation_failed` (note) | "Keep the note to 200 characters or fewer." |
| Amount out of range | "Enter an amount between {min} and {max}." |
| Other refusal | "Not sent. {server message}. Check the details and try again." |

**Uncertain** (`pay-uncertain`): uncertain slate-blue on its tint, **1.5 px dashed border**,
icon = question mark in a dashed circle (used for nothing else). Text: "We didn't get an answer
about this payment, so it may or may not have gone through. Retrying is safe: it repeats the
same payment, so money moves at most once." While the form is unchanged, `pay-submit` reads
"Retry payment"; editing any field returns it to "Send payment". On a successful retry
**`pay-uncertain` and `pay-error` are both removed**, the balance and feed refresh, and the
success line appears (§8). `pay-error` is never shown for an unknown outcome.

### 5.3 Activity feed (`/`)

Rows on paper, 1 px hairline between rows, no cards.

```
(AD)  ada paid matt_lee                         12.50 EUR
      Received   Today, 14:32   [lock] Private
      Pizza Friday
```

- Plate: 40 px ash circle with the other party's first two handle characters (ink 600) and a
  12 px direction glyph at its corner: arrow down-left (received), up-right (sent), two dots
  (between others).
- `activity-parties-{id}`: "{from} paid {to}" (20/600 ink; your own handle in graphite 400).
- `activity-amount-{id}`: exactly the formatted amount, right-aligned, 20/600, tabular,
  `white-space: nowrap`. No sign inside it; direction is in the meta line.
- Meta (13 graphite, items separated by 12 px space): "Received" / "Sent" / "Between others",
  the time, then privacy: lock icon + "Private" (ink) or people icon + "Public" (graphite).
- `activity-note-{id}`: exactly the note, 16/400 ink, **no quotation marks**. Present but empty
  (zero height) when the note is empty.
- Loading (first load, or a refresh with no rows yet): "Loading activity…" (13 graphite) above
  three ash placeholder rows of row height; no layout shift when rows arrive.
- `empty-activity`: title "No payments yet." body "Send money to someone by their handle, and it
  shows up here." action link "Send money" (moves focus to `pay-handle`).

### 5.4 `/requests`

Plum summary strip (§4), then two sections: "Asked of you" (`incoming-list`) and "You asked"
(`outgoing-list`), each a list of rows like the feed.

- Incoming row: plate, "{requester} asks you for" + `request-amount-{id}` (right), note,
  status chip, "Asked 2 Oct, 19:40". Pending: `request-pay-{id}` "Pay {amount}" (orchid fill —
  the screen's primary action, repeated once per payable row) and `request-decline-{id}`
  "Decline" (outline).
- Outgoing row: "You asked {payer} for" + amount. Pending: `request-cancel-{id}` "Cancel request"
  (text button).
- Busy: "Paying…", "Declining…", "Cancelling…".
- `request-error` sits directly under the row's buttons (or, after the row has gone from the
  refreshed list, at the top of its section): "This request was cancelled, so it can't be paid.
  The list has been updated." / "Not paid. You have {available} available to spend and this
  request is {amount}." / "This request is no longer waiting, so it can't be {declined|cancelled}.
  The list has been updated."
- Success line under the strip: "Paid 12.50 EUR to ada." / "Declined ada's request." /
  "Cancelled your request to ada."
- Loading: "Loading requests…" with placeholder rows. When one list is empty but not the other:
  "Nobody has asked you for money." / "You haven't asked anyone for money."
- `empty-requests` (both empty): title "No requests yet." body "Ask someone for money from your
  wallet, and it shows up here." action "Ask for money" → `/#request`.

### 5.5 `/split`

Desktop: form left (5 cols), `split-preview` right (7 cols) as the plum panel. 375 px: amount
and handles fields, then the preview, then note and submit.

- Fields: "Total amount" (`split-amount`), "Split between" (`split-handles`, hint "Handles
  separated by commas, in order. Include yourself if you're sharing the bill."), "Note
  (optional)" (`split-note`).
- `split-preview` (plum, paper text): heading "Each person pays"; one row per participant:
  handle (16/600) and `split-share-{handle}` (exactly the formatted share, 20/600 tabular,
  right-aligned). Your own row reads "{handle} (you)" outside the share element and says "Already
  paid" in lining-soft. Below: "Shares add up to {total}." Shares follow stage-1 §9 exactly, the
  same function the server uses.
- Initial state (no valid amount or handles yet): "Enter an amount and at least one handle to
  see each share." Invalid amount: the preview shows the amount-validation message in
  lining-soft; `split-error` appears only on submit.
- `split-submit` "Send split requests" / "Sending…" (orchid fill, on paper — never on plum).
- Success: "Asked {n} people for their share of {total}." with a link "See requests".
- `split-error`: "Split not sent. {reason}" — e.g. "No one has the handle lin_02. Check the
  list."

### 5.6 `/authorizations` (nav "Reserved")

Plum summary strip (§4), then `authorization-list`, newest first, rows like the feed.

```
(GO)  Reserved for grace_okafor                 40.00 EUR
      Collected so far 15.00 EUR
      [▨ Held]  Collect by Fri 9 Oct, 18:00
      Expires 2026-10-09T18:00:00+00:00
```

- Plate gets a hatched ring while `open`.
- Title: outgoing "Reserved for {to}", incoming "{from} reserved for you". Note under it.
- `authorization-amount-{id}`: the authorised amount.
- Partial captures on an open row: "Collected so far {captured_amount}" as plain text —
  **never with the `authorization-captured` id** (present only when status is `captured`).
- `authorization-expires-{id}`: exactly the RFC 3339 `expires_at` from the API, 13 graphite,
  after the word "Expires" which sits outside the element. A friendly line "Collect by …" sits
  above it (open only).
- Incoming open: "Amount to collect" label + `authorization-capture-amount-{id}` prefilled with
  the remaining amount (decimal, e.g. "25.00") + `authorization-capture-{id}` "Collect"
  (orchid fill) / "Collecting…".
- Outgoing open: `authorization-void-{id}` "Release hold" (outline) / "Releasing…".
- Captured: "Collected" + `authorization-captured-{id}` (e.g. `40.00 EUR`).
- Voided: "Released. The money went back to {from}." Expired: "Expired {date}. The money went
  back to {from}."
- `authorization-error` under the row's buttons: "Couldn't collect {amount}. Only {remaining}
  is left to collect." / "This reservation has expired, so it can't be collected. The list has
  been updated." / "This reservation is no longer open. The list has been updated."
- Success: "Collected 25.00 EUR." / "Released 40.00 EUR back to you."
- Loading: "Loading reserved money…" with placeholder rows.
- `empty-authorizations`: title "Nothing reserved." body "Reserve money for someone and they can
  collect it when they're ready. Until then it stays yours, held aside." action "Reserve money" →
  `/#reserve`.

## 6. Status markers

Full-round chips, 13/600, 12 px icon + word; chip text always on a **solid** tint (the hatch
appears only in the 12 px swatch, never behind text). `data-status`/`data-visibility` keep the
raw value; people see the word.

| Status | Word | Icon | Colours |
|---|---|---|---|
| request `pending` | Waiting | hollow ring | pending amber on its tint |
| request `paid` | Paid | check | success on its tint |
| request `declined` | Declined | slashed circle | graphite on ash |
| request `cancelled` | Cancelled | circle-minus | graphite on ash |
| authorisation `open` | Held | hatch swatch | ink on ash (14.88) |
| authorisation `captured` | Collected | check | success on its tint |
| authorisation `voided` | Released | return arrow | graphite on ash |
| authorisation `expired` | Expired | hourglass | graphite on ash |
| `public` | Public | two figures | graphite text, no chip |
| `private` | Private | padlock | ink text, no chip |

The seven states that must look different:

| State | Look |
|---|---|
| Available | Paper on plum, 800, the largest figure; solid bar segment |
| Held | Hatch (bar, swatch, plate ring), "Held for others" |
| Pending | Amber chip, hollow ring, "Waiting" |
| Loading | Button spinner + "…ing" label; "Loading …" + ash placeholder rows; refresh icon turning |
| Successful | Green check line under the button |
| Refused | Red tint, solid 1 px border, circle-cross |
| Uncertain | Slate-blue tint, **dashed** border, question-in-dashed-circle, "Retry payment" |

## 7. The front door (`/signup`, `/login`)

Desktop: split screen. Left half solid plum: "Pocketful" (31/400 paper), headline 49/800 paper
"Pay, ask and split with people you know, by their handle." and the hatched bar motif under it.
Right half paper: the form, 400 px wide. 375 px: a 200 px plum band with the headline (31/800),
form below. No header nav when signed out.

- `/signup`: title "Create your account". "Display name" (`signup-display-name`, hint "Shown to
  people you pay."), "Email" (`signup-email`, hint "Your handle comes from the part before
  the @."), "Password" (`signup-password`, hint "At least 8 characters."). `signup-submit`
  "Create account" / "Creating…" (orchid fill, full width). Below: "Already have an account?
  Log in".
- `/login`: title "Log in". "Email", "Password". `login-submit` "Log in" / "Logging in…".
  Below: "New to Pocketful? Create an account".
- `auth-error` above the submit button, refused style, present only when there is one:
  - `email_taken`: "An account with this email already exists. Log in instead."
  - `handle_taken`: "The handle {handle} is already taken, so this email can't be used. Try another email."
  - password too short: "Use a password of at least 8 characters."
  - bad email: "Enter an email like name@example.com."
  - `unauthenticated` on login: "That email and password don't match an account. Check both and try again."

## 8. The delight moment: money tucked into the lining

Feeling: "It's set aside, and still mine." Reserving money is what Pocketful does that ordinary
payment apps don't, and the fear is "did I just lose 40 euros?".

When a reservation succeeds, every required text updates **instantly** to its final value
(`wallet-available`, `wallet-held`, `wallet-balance`, the success line). Then, in the decorative
`aria-hidden` bar only, the reserved length of the solid fill slides right over 280 ms ease-out
and turns into hatch, joining the held section. The reverse plays when a hold is released,
captured with a remainder released, or expires and a refresh shows it. It never animates a
number, never moves or delays a required element, never blocks input.

Reduced motion (`prefers-reduced-motion: reduce`): the bar redraws in its final state with no
slide; the success line carries the meaning. All other motion in the product is limited to
button spinners and the refresh icon, both static under reduced motion.

## 9. Product constraints (binding)

- No network at runtime: fonts, icons (inline SVG) and every asset ship inside the image.
- Every element and text the requirements name stays visible, in place and exactly as specified.
  Nothing added — summary strips, hints, motion — delays, hides or moves it.
- 375 px and desktop without horizontal scroll; visible labels; visible focus; contrast as in
  §2; touch targets ≥44 px on phones.

## 10. Real content to test with

Handles `grace_okafor_lindqvi` (20 chars), `l1_0o`; display name "Maximiliane Okafor-Lindqvist";
amounts `1000000000.00 EUR`, `999999.99 EUR`, `1200 JPY`, `0.01 EUR`; a 200-character note with
no spaces; timestamps from 2025 and from today; 3 holds open and 0 holds (held line absent).

## 11. Changes from the selected concept and why

1. No sticky forms column (it would hide `authorize-submit` and its feedback).
2. Partial captures shown as plain text; `authorization-captured` only when `captured`.
3. Successful retry removes `pay-uncertain` and `pay-error` (spec sentence).
4. Amount message follows `minor_units`, including JPY.
5. Loading, initial and success states added for lists, `/split` and the preview.
6. No quotes around notes.
7. Chip text on solid tints; hatch only in swatches.
8. Uncertain icon is unique (question in dashed circle); expired uses an hourglass.
9. Available figure at 800 so it is the heaviest thing; one primary action kind per screen
   (on lists it repeats once per actionable row).
10. A plum summary strip on `/requests` and `/authorizations`, and `split-preview` as the plum
    panel on `/split`, so every working screen has its one plum mass.

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

