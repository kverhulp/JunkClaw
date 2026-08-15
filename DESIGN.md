# JunkClaw — Design System

The interface has one job: let someone judge a used car quickly and correctly.
Everything below serves that. Where a decoration and a data point compete for
attention, the data point wins.

Patterned after the practical, token-first documents collected in
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) —
tokens defined once, referenced everywhere, no component inventing its own colour.

---

## Principles

**Engineering-grade, not marketing-grade.** The reference points are Linear,
Stripe's docs, and Vercel's slate UI. Dense, legible, quiet. A user comparing
fourteen Civics should never fight the interface for information.

**Numbers are the interface.** A price delta, a mileage figure, a days-on-market
count. Type them in tabular numerals, align them, and let them carry the page.

**Say "not enough data" plainly.** The corpus is thin and often cannot support a
valuation. `insufficient` is a real state with a real visual treatment — it is
never rendered as `$0`, a dash, or an empty card.

---

## Colour

Cool slate throughout. Explicitly excluded: **purple, lavender, and pure/pitch
black** (`#000000`, `#09090B`). The darkest surface in the system is `#0F172A`,
which reads as deep slate rather than black and keeps text edges soft.

### Base scale

| Token | Hex | Use |
|---|---|---|
| `--surface-base` | `#0F172A` | Page background |
| `--surface-raised` | `#1E293B` | Cards, panels, nav |
| `--surface-overlay` | `#334155` | Drawers, modals, popovers |
| `--surface-hover` | `#293548` | Interactive hover fill |

### Borders

| Token | Hex | Use |
|---|---|---|
| `--border-subtle` | `#334155` | Dividers, table rules |
| `--border-default` | `#475569` | Card and input outlines |
| `--border-strong` | `#64748B` | Focus rings, emphasis |

### Text

| Token | Hex | Contrast on base | Use |
|---|---|---|---|
| `--text-primary` | `#F8FAFC` | 15.8:1 | Headings, values |
| `--text-secondary` | `#94A3B8` | 6.4:1 | Labels, supporting copy |
| `--text-muted` | `#64748B` | 3.6:1 | Non-essential only — never body text |

`--text-muted` fails AA for small body text on purpose: it is reserved for
decorative and redundant labels. Anything a user must read uses secondary or
above.

### Accent and semantics

Warm accents on a cool ground. The temperature contrast *is* the identity: cream
and red read as deliberate against slate in a way another blue never would, and
neither is a colour this category reaches for.

| Token | Hex | Use |
|---|---|---|
| `--accent` | `#B91C1C` | Primary actions, active tab, links |
| `--accent-hover` | `#991B1B` | Pressed and hover |
| `--accent-quiet` | `#3B1517` | Accent fills behind text |
| `--accent-ink` | `#F8FAFC` | Text on accent fills |
| `--cream` | `#E8DCC3` | Emphasis, key figures, focus ring |
| `--cream-bright` | `#F2EAD9` | Hover on cream elements |
| `--beige` | `#C9B99B` | Secondary warm, quiet emphasis |
| `--positive` | `#E8DCC3` | Below-market price, savings |
| `--warning` | `#C9B99B` | Risk flags, thin comp sets |
| `--critical` | `#F87171` | Salvage titles, hard failures |

Three deliberate calls here:

**Savings read in cream, not green.** Cream is the warmest, highest-contrast
thing on the page, which is exactly the weight the number deserves — and it
keeps green out of a palette that has no other use for it.

**Critical is lighter than the accent.** `#F87171` against `#B91C1C` so an alert
never reads as a button. Colour alone never carries the meaning regardless: risk
flags pair it with text and the quote that triggered them.

**The focus ring is cream, not the accent.** A red ring on a red button is
invisible, and focus must never be the thing that fails.

Suppliers get **no colour of their own**. They are distinguished by label, so
that colour stays available for meaning.

---

## Typography

System stack, so text renders identically to plain input on the user's machine
and no webfont blocks first paint.

```
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

| Step | Size / line | Use |
|---|---|---|
| `display` | 40 / 1.1 | Hero headline only |
| `title` | 24 / 1.25 | Page titles |
| `heading` | 18 / 1.35 | Section and card headings |
| `body` | 15 / 1.6 | Default |
| `small` | 13 / 1.5 | Labels, metadata |
| `micro` | 11 / 1.4 | Badges, table headers — uppercase, `0.06em` tracking |

**Prices, mileage, and years use `font-variant-numeric: tabular-nums`** wherever
they stack in a column, so digits align and scanning works.

---

## Space and shape

4px base. Spacing steps: 4, 8, 12, 16, 24, 32, 48, 64.

| Radius | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | Badges, inputs |
| `--radius-md` | 6px | Buttons, cards |
| `--radius-lg` | 10px | Drawers, modals |

Deliberately restrained. Everything is not `rounded-lg`.

## Elevation

Depth comes from surface value and border, not from large shadows. One shadow
token exists for genuinely floating layers (drawer, modal, dropdown).

```
--shadow-overlay: 0 16px 40px -12px rgb(2 6 23 / 0.65);
```

No glow, no coloured shadow.

---

## Motion

150ms `ease-out` for state changes; 200ms for drawer and modal entrances.
Transitions apply to `background-color`, `border-color`, `opacity`, and
`transform` only — never to `all`.

All motion is wrapped in `prefers-reduced-motion: reduce`, which reduces
durations to near-zero rather than removing the state change.

### Motion primitives

`components/ui/motion.tsx` implements the Motion Primitives / Magic UI idiom
with the banned effects removed — no glassmorphism, no glowing borders, no
gradient blurs, no particle canvases, no 3D.

| Primitive | Behaviour |
|---|---|
| `Reveal` | Fade and 12px rise on scroll into view, once. Stagger caps at the first row — past that it reads as lag, not sequence. |
| `AnimatedNumber` | Counts a figure up on entry. The final value is in the DOM immediately, so the animation is decoration over a number that is already correct. |
| `SpotlightCard` | Cream at 6% following the cursor, over a radius wide enough to read as the surface catching light rather than as a shape. |

Every one is a no-op under reduced motion, and none of them move layout.

---

## Anti-patterns

Not permitted in this codebase:

- Purple or lavender in any token, gradient, or illustration
- Pure black (`#000000`, `#09090B`) as a surface
- Neon gradient blurs, glowing borders, glassmorphism, particle canvases
- Decorative 3D or floating spheres
- Emoji as section markers or iconography
- Numbered `01 / 02 / 03` eyebrows on content that is not a sequence
- Score-first presentation — the dollar delta leads, never a `/100` figure

---

## Accessibility

- Every interactive element is reachable and operable by keyboard.
- Focus is always visible: 2px `--accent` ring at 2px offset. Never removed.
- Modal and drawer trap focus, restore it on close, and close on `Escape`.
- Tabs implement the roving-tabindex pattern with arrow-key navigation.
- Icon-only controls carry an accessible name.
- Colour is never the sole carrier of meaning — risk flags pair colour with text.
