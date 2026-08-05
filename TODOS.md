# TODOS

## Design

### Consolidate the duplicated color-token system

**What:** `styles.css`, `home.css`, `register.css`, and `faq.css` each declare their own `--*-red`/`--*-black`/`--*-ink`/`--*-bg`/`--*-surface`/`--*-line` set with the same values under different names, instead of one shared root token set.

**Why:** Surfaced during `/design-review` on 2026-08-04 — the duplication is why `--faq-red` was able to drift to `#9a0000` while every other file had `#980000` (fixed as FINDING-003). Consolidating removes the class of bug, not just this one instance.

**Effort:** M
**Priority:** P3

### Add a shared spacing scale

**What:** Replace freehand rem values (0.15, 0.35, 0.55, 1.1, 1.75rem, etc.) scattered across `styles.css`/`home.css`/`register.css`/`faq.css` with a shared `--space-*` scale.

**Why:** Surfaced during `/design-review` on 2026-08-04 (independent source-audit finding). Not visibly broken today, but every margin/padding is currently invented per rule with no shared reference.

**Effort:** M
**Priority:** P3

### Extend focus-visible rings beyond form inputs

**What:** `register.css`/`admin.css` give a custom red focus ring to `input`/`select`/`textarea` only. Buttons, links, chips, and the register page's lane-cards (the "add someone you've registered before" picker) fall back to the browser default blue ring.

**Why:** Surfaced during `/design-review` on 2026-08-04. Not a WCAG failure (a visible focus indicator does exist), just visually inconsistent. Deferred because a real fix touches the admin panel, which wasn't visually verified that session (no break-glass credentials).

**Effort:** S
**Priority:** P3

## Testing

### Extend test coverage to the rest of the app

**What:** Add unit tests for existing untested models/routes (participants, trips, auth) using the Vitest setup introduced by the Budget Tab feature.

**Why:** The Budget Tab (see `~/.gstack/projects/pompFlorida/brian-main-design-20260730-230720.md`) is the first feature in this repo to have a test framework at all. Everything else — including payment-adjacent fields like `deposit_amount` on `trips` — still has zero coverage.

**Context:** This repo has never had a test framework. Vitest gets introduced for server + client as part of the budget feature; the setup cost is already paid. Retrofitting tests onto code that was never designed with testing in mind (registration flow, roster CRUD, auth/session handling) is real, separate work — likely a day or more, not an afternoon.

**Effort:** L
**Priority:** P2
**Depends on:** Budget Tab feature landing (Vitest setup)

## Budget

### Multi-year budget trend view

**What:** A view showing how each budget category's Total Per Panther moved across all trip years (2025 → 2026 → ...), instead of just current-vs-prior-year diff.

**Why:** Approach B of the Budget Tab design (reference-table categories with a stable `category_id`) makes this cheap to build once 3+ years of data exist — same schema, no new tables. Useful for the committee setting next year's per-family cost estimate off a real trend instead of a single prior-year diff.

**Context:** Came up during the `/office-hours` design session as one reason to prefer the reference-table category approach over string-matched categories. Not requested for the initial version — only 2 years of data (2025, 2026) will exist at launch, so a trend view isn't meaningful yet. Revisit once a 3rd trip year exists.

**Effort:** M
**Priority:** P3
**Depends on:** Budget Tab feature landing; at least 3 trip years of data

## Payments

### Document the admin runbook for manual payment reconciliation

**What:** A short doc (or in-app copy near the "Get payment link" action) covering: (1) after a parent pays via Stripe, how the admin finds that payment and updates `deposit_received`/`final_payment_received` on the roster; (2) if a refund happens (participant drops the trip), the admin must manually adjust the roster field to match — pompFlorida has no automatic sync with Stripe.

**Why:** The per-participant Stripe Checkout Session design (see `~/.gstack/projects/pompFlorida/brian-main-design-20260802-202400.md`) deliberately keeps reconciliation manual — no webhook, no auto-sync. That's a correctness gap (two ledgers, no defined process to keep them consistent) that an independent cross-model review flagged during `/plan-eng-review`. It's safe only if the manual step is actually documented somewhere discoverable, not left as tribal knowledge the admin has to remember.

**Context:** Surfaced during the `/plan-eng-review` outside-voice pass on the payment-links design. Not built as code — this is a process/documentation gap, not a missing feature. Reasonable home: a short section in the design doc itself, or in-app help text next to the payment-link button.

**Effort:** S
**Priority:** P2
**Depends on:** Payment-links feature (Approach B) landing

### Verify --ok green contrast for the new payment-link text

**What:** Check `--ok` (#1e824c light / dark-mode override) against WCAG AA contrast (4.5:1 minimum for body text) now that it's used as body-sized clickable link text (`link-btn--pay`), not just as a small checkmark accent like its prior usage.

**Why:** This app has a documented prior contrast failure (FINDING-002: footer admin link failed WCAG AA, ~2.1:1) from before this feature existed. `--ok` was chosen deliberately in `/plan-design-review` to separate payment actions from `--danger`/`--primary` reds, but it hasn't been used at this size/weight before — worth confirming it clears the bar rather than assuming.

**Context:** Surfaced during `/plan-design-review` on the payment-links design (`~/.gstack/projects/pompFlorida/brian-main-design-20260802-202400.md`). Check both light and dark mode values.

**Effort:** S
**Priority:** P2
**Depends on:** Payment-links feature (Approach B) landing
