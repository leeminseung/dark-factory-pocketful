---
name: design-craft
description: Use together with frontend-design and design-references when writing a product's design direction or reviewing its screens. Covers what a direction for product screens must also settle - working screens versus the front door, a composition that does not read as one flat tone, the palettes models fall back on, layout for the task, the words of each state, real content, one delight moment, and the surfaces the browser draws.
---

# Design craft

Use this skill with frontend-design and design-references. frontend-design sets the aesthetic
direction and names the default looks to avoid; design-references shows how human designers
compose real product screens. This skill covers what a direction must also settle so that the
screens work as well as they look. Its principles are adapted from impeccable (Apache License
2.0) and taste-skill (MIT); see NOTICE.md.

## Working screens and the front door

- A screen where people come to get a job done is first a working product of its category:
  familiar navigation, controls and layout. The direction's idea lends it palette, type,
  density and one signature move; it never replaces the controls or the layout people expect.
- Judge a working screen this way: with the product's name covered, it reads as a product of
  its category, it is at least as clean as the category's usual screens, and it is more
  distinctive than them.
- The screens a signed-out visitor sees first, such as sign-up and log-in, are the product's
  front door. There the brand colour may own the page, and a headline may say in one line what
  the product does for the visitor, as long as every required element stays in place and the
  forms work as forms.

## Composition

A screen reads as one flat tone when a single hue covers nearly all of it and everything else
is a lighter or darker step of that hue. Compose each screen from these instead:

- **Value contrast.** Real distance between the darkest and the lightest areas: near-black
  type or a dark panel against a light canvas, or the reverse.
- **One key figure, large and heavy.** The number or headline people come for is the largest
  and heaviest thing on the screen.
- **A second visual mass.** One contrasting panel, band or card carries the key content, so
  the screen is not only forms and lists.
- **A brand colour used with confidence.** A saturated colour fills the primary actions and
  owns at least one large region or the key panel, not only thin lines, small text and icons.
- **Neutrals that stay neutral.** Greys and near-whites stay close to true grey, with at most
  a slight tint. Do not tint secondary text or the neutrals toward the brand hue.

frontend-design's "spend your boldness in one place" means one signature element. It does not
mean keeping colour to small accents.

## Palettes models fall back on

- Warm beige, cream, bone or chalk backgrounds (near #f5f1ea, #f7f5f1, #fbf8f1, #efeae0,
  #ece6db, #faf7f1, #e8dfcb) with brass, clay, oxblood or ochre accents (near #b08947,
  #b6553a, #9a2436, #9c6e2a, #bc7c3a, #7d5621) and espresso or ink-dark text. taste-skill
  names this family one of the most common signs of AI-made design. Its brown and dark-brown
  variants belong to it too. Use it only when the requirements name it.
- The default looks frontend-design lists.
- A category's habitual colours, such as navy, gold and green for money.

Choose the hue from the product's idea and its people, then check the palette against these
fallbacks.

## Layout for the task

- One primary action per view; everything else is quieter.
- Feedback appears next to the control that caused it.
- On the smallest viewport, the content people come for comes before long forms.
- The same kind of content looks the same everywhere, and spacing comes from one scale.

## Words for each state

An error says what failed and how to recover. An empty screen offers the next action. A
success confirms in a few words what happened. Loading names what is loading.

## Real content

Design with the longest names and handles, the largest amounts and dates from another year.
Nothing breaks inside a word or a number, overlaps, or scrolls sideways.

## One delight moment

- Pick one meaningful moment: finishing a task, waiting, a first or empty screen, or
  recovering from an error. Say in one sentence what a person should feel there and why that
  feeling belongs to this product, then use the smallest interaction, wording or motion that
  delivers it.
- Make it specific: a neighbouring product could not use it unchanged.
- It never delays or blocks the task, needs no sound, respects reduced-motion settings, and
  never makes light of a person's money, data or loss.

## Surfaces the browser draws

- Style text selection, the focus ring, the caret and the numerals (tabular in lists and
  amounts) to the direction.
- Draw icons as inline SVG in one stroke and weight, never as emoji or text characters.

## Avoid, in addition to frontend-design's defaults

Coloured bars down the side of list items, cards or messages; glass effects; heavy rounding
on everything; low-contrast grey text.
