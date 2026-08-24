# pompFlorida Design System

This documents the design system that already exists in this codebase — it was
never written down as a formal reference before now. Written by extracting and
verifying the real tokens/components in `client/src/*.css`, not proposed fresh.
If a rule here and the code ever disagree, the code is probably right; fix
this doc, not the other way around.

## Identity

Pomperaug Panthers Swim & Dive. Red/black team identity, matching the school's
real link/nav red (not an invented brand color) and the team's claw-mark "P"
logo (`client/src/img/pomp_icon.png`). Two visual registers coexist by design:

- **Marketing pages** (`home.css`, `register.css`, `faq.css`, `legal.css`) —
  public-facing, warmer, brand-forward. Black hero cards, condensed display
  type, generous whitespace. This is what a parent or swimmer sees.
- **Admin/utility pages** (`styles.css`, `admin.css`) — the roster/budget/
  traffic tools. Calmer, denser, utility-first. This is what a coach or admin
  sees running the trip.

Both registers share one root palette (`--brand-*` tokens in `styles.css`) so
they never visually drift apart — see "Color" below.

## Color

Defined once, in `styles.css`, as CSS custom properties on `:root`. Every
other stylesheet (`home.css`, `register.css`, `faq.css`) maps its own
page-scoped variables (`--home-*`, `--reg-*`, `--faq-*`) onto these instead of
hardcoding hex a second time. `faq.css` used to have an undocumented drifted
palette (`#121212`/`#f5f3ef` vs. the real `#111111`/`#f4f4f5`) — that drift
was a bug, already fixed by folding it into the shared tokens. Don't
reintroduce a fourth copy.

```css
--brand-black:      #111111
--brand-red:         #980000
--brand-red-bright:  #b21111   /* primary interactive red — buttons, links, focus rings */
--brand-ink:         #1c1c1c
--brand-bg:          #f4f4f5
--brand-surface:     #ffffff
--brand-line:        #dcdcdf
```

Admin-system tokens (`styles.css`, used by the roster/budget/traffic tools):

```css
--bg:            #f7f7f8
--surface:       #ffffff
--border:        #dfe1e6
--text:          #1c1e21
--text-muted:    #6b7280
--primary:       var(--brand-red-bright)
--primary-hover: var(--brand-red)
--danger:        #c0392b
--ok:            #1e824c   /* dark mode: #22c55e — the light value fails WCAG AA on dark --surface */
--warning:       #b45309
```

**Dark mode** is automatic via `@media (prefers-color-scheme: dark)` on the
same token names — every page gets it for free, no per-page dark variant to
maintain. When you add a token, add both light and dark values in the same
place `--brand-*`/root tokens already do it.

**Known deliberate near-duplicate:** `--primary` (`#b21111`) and `--danger`
(`#c0392b`) are both dark reds, hard to tell apart at a glance in dense admin
tables. For a non-destructive accent that needs to read as distinct from a
delete/danger action nearby, use `--ok` (green), not `--primary`.

## Typography

Three typefaces, each with one job. Loaded via Google Fonts `@import` per
stylesheet (not a single shared import — each marketing page imports only the
weights it uses).

- **Oswald** (500/600/700) — display/headline type. Condensed, athletic,
  always uppercase for headlines and section titles, generous letter-spacing
  on small labels (eyebrows, section titles).
- **Inter** (400/500/600) — body copy, UI labels, buttons. Neutral humanist
  sans, never the primary/display font.
- **Roboto Mono** (500/600) — anything tabular: dates, countdown timers,
  money, and (as of the swim-records feature) race times. Tabular figures
  matter here — this is the one place monospace earns its place, not a
  general-purpose UI font.

Never use a default system stack (`-apple-system`, `system-ui`, plain
`sans-serif`) as a *display* font — `styles.css`'s root `font-family` fallback
stack is there as a safety net for the admin/utility register only, not
something to lean on for anything brand-facing.

## Spacing

A named scale in `styles.css` (`--space-1` through `--space-10`), canonized
from values already in use across the app — not re-invented, so adopting it
changes nothing visually, it just gives repeated numbers a shared name.
Prefer the named scale; rare one-off values stay as literals rather than
forcing a mismatch into the nearest named step.

## Core components

- **`.hero`** — the marketing pages' signature element. A black card
  (`linear-gradient(165deg, var(--home-black) 0%, #232323 100%)`), rounded
  16px, centered content: logo, `.eyebrow` (small red uppercase Oswald label),
  `.hero-title` (large white uppercase Oswald headline), optional subtitle/
  intro. Animates in with a subtle rise-and-fade on load (respects
  `prefers-reduced-motion`).
- **`.section` / `.section-title`** — the content-grouping pattern. Title is
  small uppercase Oswald with a 4px solid `--home-red` left border, no fill,
  no background. This is a *reused brand element*, not decoration — don't
  read it as an "AI slop colored-left-border card" pattern; it's specific and
  consistent everywhere it appears.
- **`.glance-card`** — a bordered white card for a labeled fact (date, venue,
  cost). Label is small red uppercase Oswald; value is Inter.
- **`.banner` / `.banner--error` / `.banner--success` / `.banner--warning`**
  (admin register, `styles.css`) — tinted-background status messages
  (12% opacity of the semantic color as background, full-opacity as text
  color). This is the pattern any new "something went wrong" state should
  reuse rather than inventing a new error-banner style.
- **`.btn` / `.btn--primary` / `.btn--ghost`** — 44px minimum height
  (touch-target floor), 6px radius on the admin register; the marketing
  register's `.btn--lg` variant goes larger (8px radius, bigger padding) for
  hero-context CTAs.
- **Footer pattern** (marketing pages) — a solid black rounded card
  (`.home-footer`), centered content, `.footer-links` row of low-emphasis
  text links (`.footer-admin-link` style: 44px touch target, `rgba(255,255,255,0.55)`).
  The *actual* link set on `HomePage.jsx` today is Home / FAQ / Register /
  Team admin / Privacy Policy — treat that as the real content spec for any
  new marketing page's footer, not a placeholder to reinvent.

## Accessibility, already baked in

- Universal `:focus-visible` ring using `--primary`, one rule for the whole
  app (not per-component) — keyboard-only, doesn't show on mouse click.
- `--ok` has two values specifically because the light-mode green (`#1e824c`)
  fails WCAG AA (4.5:1) against the dark-mode `--surface` — the dark-mode
  value (`#22c55e`) was chosen to clear both dark `--surface` and dark `--bg`.
  This is the standard this app already holds itself to for text-on-color
  contrast; new colors should be checked the same way, not assumed fine.
- 44px minimum touch target on interactive elements (buttons, footer links).

## Newest addition: Swim Records (2026-08-24)

The swim-records-integration feature (`docs/designs/swim-records-integration.md`)
is the newest UI added to the marketing register, and the first one to
introduce a public-facing **data table** pattern (event / year / time /
swimmer, times right-aligned in Roboto Mono). It correctly reuses every
existing token and component above rather than introducing a competing
system — treat its approved mockup
(`~/.gstack/projects/pompFlorida/designs/swim-records-board-20260824/round2-/variant-C.png`)
as the reference example for how a new marketing-register page should look:
hero card → `.section-title`-style card sections → real footer link set.
