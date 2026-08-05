# TODOS

## Testing

### Remaining test-coverage gaps

**What:** Model-level direct tests for `sessions.js` and `settings.js` (both only exercised indirectly today, via every route test that logs in or reads/writes the current-trip setting) — and client-side component tests via React Testing Library, which this repo has never had (see `client/TESTING.md`-equivalent decision in the Budget Tab feature: RTL setup was explicitly out of scope there too).

**Why:** 2026-08-05: route-level coverage was added for `trips.js`, `participants.js` (the biggest gap — full admin CRUD + CSV import/export, previously untested), `adminAccounts.js`, and `stats.js` (54 new server tests, 108 total). `sessions.js`/`settings.js` are small and low-risk enough that dedicated tests are a nice-to-have, not urgent. Client component tests are a bigger, separate investment (test-double the DOM, RTL setup) — deliberately not bundled into this pass.

**Effort:** M (client RTL setup) / S (sessions/settings model tests)
**Priority:** P3

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
