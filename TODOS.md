# TODOS

## Testing

### Remaining test-coverage gaps

**What:** Client-side component tests via React Testing Library, which this repo has never had (see `client/TESTING.md`-equivalent decision in the Budget Tab feature: RTL setup was explicitly out of scope there too).

**Why:** 2026-08-05: route-level coverage was added for `trips.js`, `participants.js` (the biggest gap — full admin CRUD + CSV import/export, previously untested), `adminAccounts.js`, and `stats.js` (54 new server tests, 108 total). Model-level direct tests for `sessions.js` and `settings.js` were added 2026-08-16 (`server/test/sessions.test.js`, `server/test/settings.test.js` — 17 new tests). Client component tests remain: a bigger, separate investment (test-double the DOM, RTL setup) — deliberately not bundled into either pass.

**Effort:** M (client RTL setup)
**Priority:** P3

## Swim Records

### Roster cross-link on Swimmer Search

**What:** Badge a Swimmer Search result when the name matches someone on pompFlorida's current trip roster (grad year, active status).

**Why:** Surfaced by the cross-model review during the swim-records-integration design session (`docs/designs/swim-records-integration.md`, Approach C) as the strongest "coolest version" idea — it cross-links two datasets (swim records and the trip roster) that pompFlorida already has separately but has never connected. Turns a static records lookup into something that reflects the live team, not just history.

**Pros:** Genuinely new value, not just a UI port; reuses data already in this repo (no new data source).
**Cons:** Name-matching is fuzzy (common names, nicknames, middle names) — needs its own small design pass to define the matching strategy and avoid false-positive/negative badges before it's safe to ship.

**Effort:** S-M (mostly the name-matching design, the badge UI itself is small)
**Priority:** P3
**Depends on:** the swim records port itself (this repo's `/records/search` route) shipping first.

### Decide `swim.ctkeane.com`'s fate once pompFlorida has full parity

**What:** Once pompFlorida's `/records` routes are live with full feature parity, decide what happens to the original `swim.ctkeane.com` site — leave it live indefinitely, add a banner pointing to the new pompFlorida location, or sunset/redirect it.

**Why:** The whole point of the swim-records-integration feature was fixing "two sites, same team, look unrelated." Without this decision, that exact duplication continues after the port ships — pompFlorida just also has the data now. Flagged as an explicit Open Question in `docs/designs/swim-records-integration.md`, deliberately not decided during the design session since it's a call about a separately-hosted, separately-owned domain outside this repo's deploy.

**Pros:** Closes the loop on the original problem statement.
**Cons:** Doesn't block anything in this repo; easy to forget once pompFlorida's version feels "done."

**Effort:** S (the decision itself); effort of execution depends on the choice (banner < redirect < sunset)
**Priority:** P3
**Depends on:** the swim records port shipping and being verified live in prod first.

### Mobile gender-toggle layout for Record Board

**What:** Swap the stacked-tables mobile layout (Boys then Girls, full-width, in document order) for a toggle/tab switching between Boys and Girls on narrow viewports.

**Why:** Surfaced during `/plan-design-review` (Pass 6, Responsive & Accessibility) for `docs/designs/swim-records-integration.md`. The stacked layout was approved as the shipping default — simplest, no new interaction pattern — but a toggle would mean less scrolling on mobile. Not built now since there's no evidence yet that the stacked layout is actually a problem for real users.

**Pros:** Shorter scroll, more app-like on mobile.
**Cons:** Real scope (new interaction state, more testing) for an unconfirmed need — speculative until real mobile usage says otherwise.

**Effort:** S (a toggle component + state, reusing the existing table markup)
**Priority:** P3
**Depends on:** the swim records port shipping first; revisit only if real usage suggests the stacked layout is a problem.

## Budget

### Multi-year budget trend view — shipped 2026-08-16

A view showing how each budget category's Total Per Panther moved across all trip years, instead of just current-vs-prior-year diff. Built once a 3rd trip year (2027) existed alongside 2025/2026, each with real non-zero budget data — the precondition this item had been waiting on.

**What shipped:** `getBudgetTrend()` in `server/src/models/budget.js` (reuses the same per-trip computation as `getBudgetForTrip`, run once per trip year instead of current+prior only), `GET /api/budget/trend` (admin-only), `fetchBudgetTrend()` in `client/src/api/budget.js`, and a "Show multi-year trend" toggle on the Budget tab (`client/src/components/BudgetPanel.jsx`) rendering categories × years with a Total/Panther footer row. Server tests in `server/test/budget.test.js` and `server/test/budgetRoute.test.js`.

**Known gap, not a bug:** the 2025 trip year has budget totals entered but zero active participants recorded (an archived trip with no live roster), so every category's 2025 cell renders "—" — the same divide-by-zero guard `getBudgetForTrip` already used. Confirmed in a live browser check against real data (2026-08-16).

## Payments

### Admin runbook: Stripe reconciliation and refunds

Two ways a parent's payment gets recorded:

1. **Self-serve** (primary, shipped 2026-08-06): parents pay directly from the register page — right after adding a swimmer/diver, or later from their account roster (`POST /api/my/participants/:id/payment-link`). They choose deposit, final, or "pay in full" (one combined Checkout Session, split back into deposit/final by the webhook using portions stamped into the session's metadata at checkout time). Adults are never offered this — no trip fee applies to chaperones.
2. **Admin-generated link** (backup, shipped 2026-08-06 with the original payment-links feature): "Get deposit/final link" on each roster row (`POST /api/participants/:id/payment-link`), for parents who need help or can't self-serve. Deposit/final only — no "pay in full" option on this path.

**Reconciliation is now automatic**, via a webhook (`POST /api/stripe/webhook`, shipped 2026-08-06) that credits `deposit_received`/`final_payment_received` itself on `checkout.session.completed`, idempotent against Stripe's retries (`stripe_events` table) — it doesn't matter which of the two flows above created the session. Manual roster edits are no longer the normal path; they're now only needed for:
- Check/cash/Venmo payments, which never touch Stripe at all — same inline-editable field as before.
- Refunds (see below) — the webhook only listens for `checkout.session.completed`, not `charge.refunded`, so a refund never un-credits the roster on its own.
- Recovery, if the webhook is ever misconfigured — see "Setup dependencies" below for exactly what that looks like when it happens.

**If a participant drops the trip after paying (refunds):**
1. Refund the family directly — check, cash, or Venmo — **not** through Stripe. This is a deliberate, permanent decision (confirmed 2026-08-17): refunds never touch Stripe and are never issued through the app. The original Stripe charge is intentionally left alone, unrefunded on Stripe's side.
2. Manually reduce (or zero out) the corresponding `deposit_received`/`final_payment_received` value on the roster to match the refund actually given. **This step is easy to forget** — if skipped, the roster will show a balance as paid when it isn't. There's no code guard against this; it depends on the admin remembering.

**Setup dependencies — both env vars, in both environments:**
- `STRIPE_SECRET_KEY` — without it, both payment routes return a clear "Stripe is not configured on this server" error instead of attempting to reach Stripe.
- `STRIPE_WEBHOOK_SECRET` — without it, the webhook route 500s on every delivery attempt, so the *payment* still goes through on Stripe's side but the roster silently never updates. Easy to miss because nothing on the payment side fails — happened for real in testing (2026-08-06).
- Locally, Stripe can't reach `localhost` directly — run `stripe listen --forward-to localhost:<port>/api/stripe/webhook` while testing, and use the `whsec_...` it prints (a different secret than production's).
- In production (Render), the webhook destination is configured in the Stripe Dashboard (Workbench → Webhooks) pointed at `https://<render-service>.onrender.com/api/stripe/webhook`, and its signing secret goes into Render's Environment tab — `render.yaml` only reserves the slot (`sync: false`), it doesn't set a value.
- Use **live-mode** keys/webhook destination in production, **test-mode** locally (test cards like `4242 4242 4242 4242` are rejected by a live key).

**Other things to know:**
- Checkout Sessions expire 24 hours after being generated if the parent hasn't paid. An expired link/button just needs to be used again — no cleanup required, expired sessions cause no harm.
- Nothing stops generating two live sessions for the same installment (admin clicking "Get link" twice, or a parent clicking "Pay deposit" twice). Low-risk at this app's volume — the unused one simply expires. Not worth building dedup logic for.
- The booster club absorbs the ~2.9% + $0.30 Stripe fee — parents are charged exactly the balance shown in pompFlorida, no added fee line item.
- Every payment path always charges the **remaining balance owed** (price minus whatever's already recorded as received), not a fixed installment price — so a parent who already paid something by check isn't double-charged, and "pay in full" after a partial payment only charges what's left.

### `charge.refunded` webhook handler — decided against, kept for context

**What it would have been:** Extend `POST /api/stripe/webhook` to also listen for `charge.refunded` and automatically reduce (or zero out) the corresponding `deposit_received`/`final_payment_received` value on the roster, instead of relying on an admin to do it by hand.

**Why not:** Confirmed 2026-08-17 — refunds are a permanent manual-only process (see runbook above) that never issues a Stripe refund in the first place, so `charge.refunded` will never fire for this app's flow. There's nothing for a webhook handler to listen for. This entry is kept (not deleted) as a record of why the idea was rejected, in case the refund process ever changes.

## Parent-Facing Trip Info

### Post-registration trip summary — shipped 2026-08-16 (dynamic in-app component)

Parents now see a live "Trip Essentials" card — dates, training venue, accommodation, daily pool-time schedule, what to pack, departure/return logistics — on the register-success screen and account-home, rendered from real trip data instead of a yearly-regenerated image. Went with the dynamic option from the two the TODO had flagged (vs. a static image), so it can never drift out of sync with what an admin edits in Trip details.

**Notable wrinkle found during this work:** the local dev DB already had a `trip_daily_schedule` table and `departure_logistics`/`return_logistics`/`packing_list` columns on `trips`, fully populated with real 2026 data matching the reference PNG — but no migration file defined them (recorded as applied under a filename that didn't exist in the repo or git history) and no code referenced them. Someone had clearly prototyped this exact feature directly against the DB in an earlier session and the migration file was lost before being committed. Formalized it as `021_trip_logistics_and_packing.sql`, matching the existing schema exactly, and kept the real seed data rather than wiping it.

**What shipped:**
- `server/src/db/migrations/021_trip_logistics_and_packing.sql` — the `trip_daily_schedule` table (`date`, `morning_window`, `afternoon_window`, `notes` — free text, not structured times, since the real schedule is worded inconsistently day to day) plus the three new `trips` columns.
- `departure_logistics`/`return_logistics`/`packing_list` added to `DETAIL_FIELDS` in `server/src/models/trips.js` — carry forward to new trip years automatically, same as `lodging`/`training_location`/etc.
- Schedule CRUD in `trips.js` (`listDailySchedule`, `addScheduleDay`, `updateScheduleDay`, `deleteScheduleDay`, `autoCreateSchedule`) and routes in `server/src/routes/trips.js`: `GET /api/trips/current/schedule` (public), admin CRUD under `/api/trips/:id/schedule`.
- Admin UI: `client/src/components/TripScheduleManager.jsx` (day-by-day table, immediate save per row, "+ Auto-create days for trip dates") embedded in `TripDetailsForm.jsx`'s Training section; new "Departure logistics"/"Return logistics"/"What to pack" fields elsewhere in that form.
- Parent-facing `client/src/components/TripEssentials.jsx`, wired into `RegisterPage.jsx`'s register-success screen and account-home. Renders nothing if the current trip has none of this content yet (true today for the 2027 trip — it inherited `training_location`/`lodging` from 2026 but not the newer logistics/packing/schedule fields, since those didn't exist as `DETAIL_FIELDS` when 2027 was created).
- `datesInRange` extracted from `budget.js` into `server/src/lib/dates.js` so both the food-planner and this schedule's "auto-create days" share one implementation.
- Server tests: `server/test/tripSchedule.test.js` (model), additions to `server/test/tripsRoute.test.js` (routes) and `server/test/trips.test.js` (DETAIL_FIELDS carry-forward) — 20 new tests, 287 total.

**Verified live** (2026-08-16) against real data: the pre-existing 2026 trip's logistics/packing/schedule render correctly in the new admin UI, and the parent-facing card renders correctly (and degrades gracefully) against the current 2027 trip's partial data.
