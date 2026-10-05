I reviewed revision 7364e79, round 1, using frontend-design and design-craft. I opened the shots under /tmp/pd-shots/7364e79/ (all the 375 ones and most of the 1280 ones) and zoomed into pixel crops where detail mattered.

## 1. Scores

- **Composition: 4.** Every working screen has one plum mass against white. On `/` the available figure is plainly the largest and heaviest thing (1280-wallet-held, 375-wallet-held). Two things cost a point: at 1280 the `/requests` and `/authorizations` lists run the full 1056 px, so amounts sit about 900 px from their titles, and the right forms column on `/` runs about 1,000 px past the end of Activity.
- **Design quality: 4.** Spacing, labels, chips and feedback boxes are consistent, and refusal, success and uncertain boxes sit directly under their buttons. It is let down by the 375 header (the "Log out" button splits onto two lines) and by handles that break mid-word.
- **Distinctiveness: 4.** With the name covered, it still reads as a P2P wallet and is cleaner than the category norm. The deep plum with orchid, the hatch for held money, the hatched ring around avatars on held rows, and Atkinson's slashed zeros make it more distinctive than the usual navy or green finance app.
- **Craft: 3.** Handles break inside the word at 375 (375-wallet-held, 375-split-preview). The held segment of the wallet bar is 0 px wide with this data. "Log out" wraps. The 12 px held icon reads as a single slash.
- **Function: 4.** Every required state I could see is present and worded as the direction says. The four loading shots show no loading state at all, so loading is unverified.
- **Delight: 2.** The hatched bar works on the front door (1280-signup). On `/` the bar never shows any hatch: 40 or 60 EUR held against about 1,000,000 EUR is 0 px, so the "tucked into the lining" moment has nothing to slide into in any wallet shot.

## 2. Checks

- **Horizontal scroll:** none. index.txt shows scrollWidth equals clientWidth for every shot.
- **Visible labels:** pass. Every input has a 16/600 label above it, plus a hint where the direction asks for one.
- **Keyboard focus:** pass. A 2 px orchid outline with offset shows on inputs and buttons (375/1280-focus-input, 375/1280-focus-button, the Note field in split-preview). I have no shot of focus inside the plum panel (the lining-ring colour).
- **Touch targets at 375:**
  - Pass: buttons 44 px or taller (Pay, Decline, Collect, Release hold, Refresh); nav segments four equal widths of about 86 px.
  - Doubtful: text-only targets.
    - "Log out" is a narrow two-line word block about 30 px wide (375-wallet-held).
    - "Held for others" is a one-line underlined link.
    - "Send money", "Ask for money", "Reserve money", "See requests" and "Log in" are inline text links.
  - I cannot measure their hit boxes from pixels; they look under 44 px.
- **Contrast:** no visible failures. Ink on white, graphite meta, lining-soft on plum, orchid fills with white text and the state text on their tints all read clearly. There is no orchid on plum.
- **States that must look different:**
  - **Available:** distinct (paper 800 on plum, largest figure).
  - **Held:** on `/authorizations`, distinct (Held chip with hatch icon, hatched avatar ring). On `/`, weak: the bar segment is invisible and only a 12 px icon remains, which renders as one diagonal stroke in a square and is close to the "Declined" slashed-circle icon.
  - **Pending:** distinct (amber "Waiting" chip with hollow ring).
  - **Loading:** not visible in any shot (see F2).
  - **Successful:** distinct (green tint with a check).
  - **Refused:** distinct (red tint, solid border, circle-cross).
  - **Uncertain:** distinct (slate-blue tint, dashed border, question-mark icon, button reads "Retry payment"). The retry shot removes the uncertain box and shows the success line.

## 3. Findings, ranked by impact

**F1. The held part of the wallet bar is 0 px, so held money is never drawn as a hatch on `/`.**
- Shots: 375/1280-wallet-held, -after-authorize, -wallet-after-release, -pay-uncertain.
- What I see: a pixel scan of 1280-after-authorize (held 60.00 of 999996.99 EUR) shows the bar solid white to its end. On `/`, held money appears only as a 12 px icon and a number.
- Direction it departs from: §1 "Held money is always drawn the same way — a 45° hatch — so a person learns 'held' once and recognises it everywhere"; §6 "Held | Hatch (bar, swatch, plate ring)"; §8, where the delight slide has nothing to animate into.
- Requirement touched: "Available, held, pending, loading, successful, refused and uncertain states must be visually distinct". The figures still differ, so this is a direction break that weakens that requirement rather than an outright failure.
- Suggested fix: give a held amount above zero a minimum visible hatched segment, for example 12 to 16 px.

**F2. No loading state is visible in any of the four loading shots.**
- Shots: 375/1280-pay-loading, -refresh-loading, -requests-loading, -auth-loading.
- What I see:
  - pay-loading is the same picture as pay-success: the button reads "Send payment" and the success line is shown.
  - refresh-loading reads "Refresh / Updated 06:40" and shows no spinner.
  - requests-loading and auth-loading show the fully loaded lists, with no "Loading requests…", no "Loading reserved money…" and no placeholder rows.
- Direction it departs from: §6 "Loading | Button spinner + '…ing' label; 'Loading …' + ash placeholder rows; refresh icon turning"; §5.1 "While loading: 'Refreshing…'".
- Requirement: "Provide considered empty, loading and error states" and the distinct-states sentence. This is unverified, not proven broken: either the capture missed the state or the state never paints. Re-capture with the response held back.

**F3. At 375 the 20-character handle breaks inside the word.**
- Shots: 375-wallet-held, -after-authorize, -wallet-after-release (activity row "grace_okafor_li / ndqvi paid / l1_0o"); 375-split-preview (own row "grace_okafor_lin / dqvi (you)").
- Direction: §3 "the 20-character handle `grace_okafor_lindqvi` must fit a 343 px row title" and "`overflow-wrap: anywhere` as the last resort only for unbroken notes". The amount column takes the row width, so the title gets about 190 px.
- Requirement: "Format people, amounts and timestamps for people first". This is a direction break that harms that requirement.
- Suggested fix: put the amount on its own line below the title at 375, or let the title take the full width.

**F4. The 375 header wraps both the display name and the "Log out" button.**
- Shots: every signed-in 375 shot for Maximiliane, for example 375-requests.
- What I see: "Maximiliane Okafor- / Lindqvist" and "Log / out" stacked over two lines. The header is about 90 px tall, pushes the plum panel down, and differs in shape from the header for "Sol" (375-wallet-empty).
- Direction: §3 "Header (every signed-in screen, identical)", `logout-button` "Log out" (text button); §10 names this display name as test content.
- Requirement: "keep navigation consistent across the required routes". This is direction-level; the required elements are present.
- Suggested fix: no-wrap on the button; truncate the display name, or move it under the wordmark row.

**F5. At 1280, `/requests` and `/authorizations` are not the narrower one-column layout the direction asks for.**
- Shots: 1280-requests, -requests-error, -requests-paid, -authorizations, -auth-captured, -auth-voided.
- What I see: rows span 1056 px, with the amount at the far right edge away from its title. The refusal box under one request stretches 1000 px wide.
- Direction: §3 "Other routes: one column (max 760 px) under the same header and nav".
- Requirement: "Payments, requests, splits and authorisations should be easy to scan". This is direction only.

**F6. The 12 px held icon does not read as a hatch and looks like the "Declined" icon.**
- Shots: 1280-wallet-held-fold (zoomed), the Held chips in 1280-authorizations.
- What I see: a rounded square with one diagonal stroke, close to the slashed circle on "Declined" chips (1280-requests).
- Direction: §6 "authorisation `open` | Held | hatch swatch" against "request `declined` | Declined | slashed circle"; §1 "Nothing else in the product is hatched".
- This is direction-level; it touches the distinct-states requirement.

**F7. The bar is full white when the wallet holds 0.00 EUR.**
- Shots: 375/1280-wallet-empty.
- What I see: "0.00 EUR" above a full-width solid bar, so the visual says "all of it available" when there is nothing.
- Direction: §5.1 "Fully solid when held is zero". The implementation follows the letter of this; the direction misses the total = 0 case.
- Suggested fix: draw an empty track when total is 0.

**F8. A stale success line stays up after an unrelated action.**
- Shots: 375/1280-after-authorize.
- What I see: "Sent 2.00 EUR to ada." still shows under Send payment after the reservation succeeds.
- Direction: §5 "Every message element exists only while it applies".
- This is direction-level. Arguably the line applies until the form changes, but next to a new success it reads as two simultaneous outcomes.

**F9. Expiry and release wording is not person-first.**
- Shots: 375/1280-authorizations, -auth-captured, -auth-voided.
- What I see:
  - "Collect by Tue 6 Oct, 06:50" on a hold that expires today.
  - "Released. The money went back to grace_okafor_lindqvi." uses your own handle, while the success line beside it says "Released 40.00 EUR back to you."
- Direction: §5 Times "'Today, 14:32'". The release text follows §5.6 "{from}" literally, so the inconsistency is in the direction itself and should change to "back to you" when you are the sender.
- Requirement: "Format people, amounts and timestamps for people first". These are minor.

**F10. Section spacing on `/requests` is uneven.**
- Shots: 375/1280-requests, -requests-error.
- What I see: about 70 px above "Asked of you" but about 16 px above "You asked", which sits right on the previous row's divider. "Cancel request" is also indented about 13 px from the chip edge.
- Direction: §2 "Section gap 48". Direction only.

**What I could not see:** loading states (F2), focus inside the plum panel, the bar animation, and any hit-box sizes beyond the visible text. The front door (signup, login and their errors), the split states (initial, preview, invalid amount, error, success), the JPY wallet and its whole-number error, the empty states, request/authorisation chips, the uncertain box and retry, and the refusal boxes all match the direction's words and looks.
