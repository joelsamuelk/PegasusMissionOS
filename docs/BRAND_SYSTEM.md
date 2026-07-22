# Brand System

Pegasus Mission OS extends the Pegasus Studio visual language into a
sophisticated operational product environment. The intent is that the
application feels like the Pegasus website expanded into software: premium,
restrained, editorial, and unmistakably Pegasus.

## Note on source
The live marketing site (`pegasus-studio.co`) was not reachable from the build
environment (the outbound proxy returned 403), so this system is built from the
written brand direction and encoded as design tokens. It can be refined against
live screenshots later. The token layer means such refinement is a matter of
changing CSS variables, not rewriting components. The recreation is a design
language, not a copy of page-specific CSS.

## Characteristics
Premium and restrained · editorial rather than template-like · strong
typographic hierarchy · generous spacing · minimal colour · high contrast ·
structured grid · uppercase eyebrow labels · subtle technical and architectural
motifs · precise borders and dividers · calm motion · no visual clutter.

Explicitly avoided: generic SaaS gradients, neon or purple "AI" styling,
childish charity imagery, random stock photography, excessive rounded cards,
cartoon illustrations.

## Tokens

All tokens are CSS custom properties in `src/styles/globals.css` and mapped in
`tailwind.config.ts`, so the palette can be themed at runtime. A light editorial
theme is the default; a dark theme is provided via `:root[data-theme="dark"]`.

### Colour (light theme)
| Token | Value | Use |
| --- | --- | --- |
| `paper` | `#f5f4f0` | Warm editorial page background |
| `surface` | `#ffffff` | Cards and panels |
| `surface-sunken` | `#efede8` | Insets, subtle fills |
| `ink` | `#17191f` | Primary text, primary buttons |
| `ink-muted` | `#565b66` | Secondary text |
| `ink-subtle` | `#878c96` | Tertiary text, labels |
| `line` | `#e4e1d9` | Hairline borders and dividers |
| `line-strong` | `#d3cfc4` | Input borders, stronger dividers |
| `accent` | `#21506e` | A calm architectural ink-blue: links, focus, data |
| `success` | `#2f6f52` | On track, approved, verified |
| `warning` | `#9a6410` | Attention, needs review |
| `critical` | `#a5372f` | At risk, overdue, unsuccessful |
| `info` | `#21506e` | Informational |

Colour is used minimally. Primary actions use ink (near-black), not the accent,
keeping the palette restrained. Semantic statuses always carry an **icon and a
text label** as well as colour, so meaning never relies on colour alone
(WCAG 2.2).

### Typography
- `--font-sans`: a modern grotesque system stack (Inter/Helvetica Neue/system).
- `--font-serif`: a refined serif stack used for large display numerals and
  editorial headings.
- `--font-mono`: a monospace stack used for uppercase eyebrow labels and data,
  a subtle technical motif.

Type scale (in `tailwind.config.ts`): `eyebrow`, `display-lg`, `display`,
`heading-lg`, `heading`, `title`, with tightened tracking on large sizes.

### Spacing, radius, elevation, motion
- Spacing scale via Tailwind, plus `gutter` and `section` tokens.
- Radius scale is small and precise (`xs` 3px to `lg` 12px, default 7px): no
  excessively rounded cards.
- Elevation is subtle: `elev-1` to `elev-3` low-spread shadows; a `focus` ring
  token drives visible keyboard focus.
- Motion is calm: `fast`/default/`slow` durations with a `calm` easing curve.
  All motion respects `prefers-reduced-motion`.

### Motifs
- **Uppercase mono eyebrows** label sections (`.eyebrow`).
- A faint **architectural grid** (`.grid-motif`) sits behind hero and auth
  surfaces.
- The **Pegasus wordmark** is rendered as text with a precise geometric glyph
  (`src/components/brand/Wordmark.tsx`). No logo asset is fabricated.

## Accessibility
- WCAG 2.2 AA is the target. High-contrast ink on paper, visible focus rings,
  semantic HTML, labelled form controls, `aria-current` on active navigation,
  `role="progressbar"` meters, and status conveyed by icon and text.
- Fully responsive and keyboard navigable. Desktop-first for complex operational
  workflows, with functional mobile views for approvals, tasks and summaries.
