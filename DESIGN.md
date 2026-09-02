---
version: alpha
name: Meridian Terminal
description: >
  The visual identity for Meridian Capital's portfolio watchlist and
  Migration Copilot — a dark, data-dense "trading terminal" aesthetic for
  an audience of retail investors and internal IT admins, not a consumer
  marketing surface.
colors:
  primary: "#4f7cff"
  primary-hover: "#6f92ff"
  primary-solid: "#3d63e0"
  primary-solid-hover: "#3454c4"
  neutral-bg: "#0b0e14"
  neutral-panel: "#131722"
  neutral-border: "#232838"
  neutral-input-bg: "#0d1119"
  text: "#e6e8ef"
  text-muted: "#8a90a4"
  success: "#22c55e"
  danger: "#ef4444"
typography:
  h1:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.3
  h2-eyebrow:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.04em
  body-md:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label-sm:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
  data-table:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 20px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary-solid}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.neutral-panel}"
    rounded: "{rounded.lg}"
  input:
    backgroundColor: "{colors.neutral-input-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  page:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.text}"
  price-up:
    textColor: "{colors.success}"
  price-down:
    textColor: "{colors.danger}"
  button-primary-hover:
    backgroundColor: "{colors.primary-solid-hover}"
    textColor: "#ffffff"
---

## Overview

Meridian Capital's app is not a marketing site — it's a working tool for
two distinct audiences: retail customers checking a portfolio watchlist,
and internal IT admins evaluating a migration. Both get the same visual
language: a near-black, blue-tinted "trading terminal" surface (`#0b0e14`)
that reads as serious and data-first rather than playful. Density is a
feature here, not a flaw to be designed away — but density must never come
at the cost of touch usability on a phone, since the customer-facing
watchlist is exactly the kind of thing people check between meetings on
their phone, not just at a desk.

## Colors

The palette is a single blue accent against near-black neutrals, with two
reserved semantic colors that only ever mean one thing each.

- **Primary (`#4f7cff`):** The sole driver for interactive elements —
  links, active nav state, focus rings, badges. Never used decoratively.
- **Primary solid (`#3d63e0`, hover `#3454c4`):** A deliberately darker
  step of the same hue, used only where primary sits as a *solid fill
  behind white text* (primary buttons). `#4f7cff` itself is AA-compliant
  as text/borders against the `#0b0e14` page background, but white text on
  a `#4f7cff` fill only reaches 3.71:1 — below WCAG AA's 4.5:1 minimum —
  and the previous hover fill (`#6f92ff`, lighter still) was worse at
  2.90:1. Hover here darkens further rather than the usual "brighten on
  hover," specifically because there's no lighter step of this hue left
  that still clears AA with white text.
- **Neutral background (`#0b0e14`):** The page background. Deliberately
  blue-tinted rather than pure black, so panels (`#131722`) read as a
  distinct, slightly-raised surface rather than needing a heavy shadow to
  separate from the page.
- **Text (`#e6e8ef` / `#8a90a4` muted):** Primary text is a soft off-white,
  never pure `#ffffff`, to reduce eye strain on the dark background over a
  long session. Muted text is reserved for secondary/supporting copy —
  labels, captions, timestamps — never for anything a user needs to act on.
- **Success (`#22c55e`) / Danger (`#ef4444`):** Reserved exclusively for
  price movement (up/down) and destructive/error states. Never used as
  decorative accent colors elsewhere, so when a user sees red or green,
  it's always meaningful.

## Typography

One font stack (system UI) for everything — this is a tool, not a brand
moment, and a system font stack means zero web-font loading cost, which
matters more here than a distinctive display face would.

- **H1 (22px/700):** Page titles only, one per page.
- **Eyebrow H2 (13px/600, uppercase, tracked):** Section labels inside a
  card ("ADD A TICKER", "TRACKING") — muted color, never the primary text
  color, so it reads as structure, not content.
- **Body (16px/400):** The base size for all body copy *and form inputs*.
  16px is a hard floor for any `<input>` on this site, not a style
  preference — anything smaller triggers iOS Safari's automatic zoom-on-
  focus, which is a real, well-documented mobile usability break, not a
  cosmetic nitpick.
- **Data table (14px/400):** Slightly smaller than body for dense tabular
  data (ticker, price, change%) where many rows need to fit without
  overwhelming the page.
- **Caption (12px/400):** Timestamps, footnotes, demo-credential hints.

## Layout

Single-column, card-stacked layout throughout — no multi-column dashboard
grid, because the content (a watchlist, a chat panel, a profile form) is
inherently linear, not a grid of independent widgets. This is also what
makes the mobile adaptation straightforward: the desktop layout already
*is* the mobile layout, just with tighter spacing, not a different
structure that has to be rebuilt at narrow widths.

- Page container: max 960px, centered, with generous side padding (20px)
  that never lets content touch the viewport edge, even at 375px wide.
- Cards: 12px radius, 1px border (never a heavy shadow) — a card reads as
  "grouped content," not a floating object.
- Spacing scale (4/8/12/20/32px) is used for everything — no arbitrary
  one-off pixel values in new CSS.

## Elevation & Depth

Deliberately flat. Cards are separated from the page by a 1px border and a
subtle background-lightness step (`#131722` vs `#0b0e14`), not by shadow —
shadows read as "light source," which fights a dark, terminal-like
surface. The one exception: interactive elements get a visible
`:focus-visible` ring (`2px solid` primary, `2px` offset) — this is not
decorative elevation, it's an accessibility floor every focusable element
must clear, keyboard or touch.

## Components

- **Buttons:** Primary = solid primary-color fill, white text, 8px radius.
  Secondary = transparent fill, muted text, 1px border — used for
  low-emphasis actions (Sign out) that shouldn't compete with the primary
  action on the same screen. Minimum tap target 44×44px on any viewport
  ≤640px wide, even where the visual padding looks tighter on desktop.
- **Inputs:** 16px text (see Typography), 8px radius, same border color as
  cards. Full-width within their container by default.
- **Tables:** Data tables never cause the page itself to scroll
  horizontally — a table wider than its card scrolls independently inside
  a bounded container, so the rest of the page (nav, cards above/below)
  stays put.

## Do's and Don'ts

- Do use the primary blue only for things a user can act on. Don't use it
  as a decorative accent.
- Do keep body/input text at 16px minimum. Don't shrink form inputs for
  visual density — shrink surrounding whitespace instead.
- Do let a data table scroll horizontally inside its own card on narrow
  viewports. Don't let any element force the whole page to scroll
  sideways.
- Do show a visible focus ring on every interactive element. Don't remove
  `outline` without providing an equivalent replacement.
