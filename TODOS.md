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

### Event-name link touch targets in Record Board / Top-20 tables

**What:** The event-name links (e.g. "200 Medley Relay") in the Record Board's Boys/Girls tables and in Swimmer Search results render at ~17px tall — well under the 44px touch-target floor `DESIGN.md` documents for interactive elements elsewhere in the app (buttons, footer links).

**Why:** Surfaced by `/design-review` (2026-08-24) auditing the shipped swim-records feature. Not fixed in that pass — every existing 44px-target precedent in the app (`.btn`, `.footer-admin-link`) is a standalone button or link with its own padding; a table row link is a new category the design system hasn't addressed yet, and the fix (row padding, a larger tap zone via `::before`/padding on the `<td>`, or making the whole row clickable) changes the visual density of the flagship data-table pattern. That's a real design tradeoff, not a mechanical CSS fix, so it needs its own small decision rather than a drive-by change during a fix loop.

**Pros:** Brings the newest UI pattern in line with the rest of the app's stated accessibility bar; likely matters most on mobile, where these tables stack full-width.
**Cons:** Real design tradeoff — more padding per row means taller tables, more scrolling, on a page that's already dense (up to 12 events per gender).

**Effort:** S (once a direction is picked — e.g. padding on `.records-table td:first-child`, or wrapping each row link to fill the cell)
**Priority:** P3
**Depends on:** nothing — can be picked up any time; no data or API dependency.

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

## Code Cleanup (post-2026-trip)

Findings from a full-codebase dead-code/duplication audit (2026-08-28, two parallel agents covering `client/src/**` and `server/src/**`, ~90 files, every claim grep-verified). Deliberately held until after the 2026 trip wraps — several of these touch payment and roster code paths that are actively in use for live registrations/payments right now, and refactoring shared logic mid-season is the wrong time to introduce a regression. Once the 2026 trip is fully closed out (no more active registrations/payments expected), work through these roughly in priority order.

### Extract shared client API `request()` helper

**What:** `client/src/api/adminAccounts.js:3-19`, `adminTraffic.js`, `auth.js`, `budget.js`, `participants.js`, `questions.js`, and `trips.js` each carry a byte-identical 19-line credentialed-fetch-plus-error-shaping function. Extract to one `client/src/api/request.js` and import it in all seven.

**Why:** Confirmed byte-identical via md5 diff across all seven files — pure copy-paste, zero divergence today, but any future fix (e.g. a new header, a retry policy) would need to land in seven places by hand. Purely mechanical, lowest-risk item on this list.

**Effort:** S
**Priority:** P2

### Consolidate server-side trip resolution logic

**What:** "Resolve trip from `?trip_id=` or fall back to current trip" is implemented three different ways: `resolveTrip()` in `server/src/routes/participants.js:42-48`, `resolveTripId()` in `server/src/routes/budget.js:35-50`, and fully inlined in `server/src/routes/stats.js:9-18`. Pick one shape (budget.js's, which folds the 400-response into the helper so callers need only one `if (tripId === null) return;` check) and reuse it in all three routes.

**Why:** `budget.js:34`'s own code comment already flags this — *"Same trip_id-or-current-trip resolution as GET /api/stats"* — the duplication was noticed and left in place rather than shared. Touches the trip-scoping logic behind roster, budget, and stats reads, so worth doing carefully with the full test suite green, not mid-season.

**Effort:** S-M
**Priority:** P2
**Depends on:** 2026 trip complete (touches live roster/budget/stats query paths).

### Consolidate server-side validation-error shaping

**What:** The "turn zod issues into a `{field: message}` object" function is independently defined in `adminAccounts.js:28`, `budget.js:28`, `auth.js:72`, `questions.js:15`, inlined without even being a local function 4 more times in `trips.js`, plus a parallel non-zod version duplicated between `participants.js:249` and `myParticipants.js:32`. Move to one shared helper in `server/src/lib/validation.js`.

**Why:** Same shape rewritten 10 times across route files with no shared home for it despite `lib/validation.js` already existing as the natural place for it.

**Effort:** S-M
**Priority:** P2

### Unify payment-link installment validation

**What:** `participants.js:26-29,132-146` (`INSTALLMENT_BALANCE_FIELDS` map) and `myParticipants.js:22-30,122-134` (`installmentAmount()` function) both resolve "which balance field does this installment mean, and is it already paid off" — same three-step validation, different shapes, and they've already drifted: `myParticipants.js` supports a `'full'` (pay-in-full) installment type that `participants.js`'s admin-generated-link path doesn't. Unify into one function both routes call.

**Why:** This is the one duplication finding that's a real correctness risk, not just style — two independent implementations of "what does a parent/admin owe for this installment" can silently diverge further every time one path is touched and the other isn't.

**Effort:** M
**Priority:** P1 (highest of this list — it's payment-calculation logic)
**Depends on:** 2026 trip complete (this is the live Stripe payment-link path — don't touch it while real families are still paying).

### Decompose `BudgetPanel.jsx`

**What:** `client/src/components/BudgetPanel.jsx` is 947 lines — one component owns data-fetching, line-item CRUD, category create/retire/unretire/attach/detach, the per-student exclusion matrix, the multi-year trend view, and the full day-by-day food-planner sub-feature (~30 handlers, ~15 pieces of local state). Split into per-concern subcomponents: line-items table, category manager, exclusion matrix, trend view, daily planner.

**Why:** The single biggest maintainability risk surfaced by the audit — every unrelated Budget feature now shares one file and one set of state, so a change to any one sub-feature risks touching the others by accident.

**Effort:** L
**Priority:** P2
**Depends on:** 2026 trip complete (Budget tab is actively used for live trip financials right now).

### Small mechanical duplication sweep

**What:** A batch of smaller, independent, low-risk extractions — safe to do together in one pass:
- `splitLines()` reimplemented identically 4x (`HomePage.jsx`, `AnnouncementPanel.jsx`, `TripDetailsForm.jsx`, `TripEssentials.jsx`) → one shared helper.
- `StatCard` component defined byte-identically twice (`OverviewPanel.jsx`, `TrafficPanel.jsx`) → one shared component.
- "60% default deposit split" hardcoded in 6 places (`lib/money.js`, `TripDetailsForm.jsx`, `AnnouncementPanel.jsx` x4) → one constant in `constants.js`.
- `ROLES`/`ADULT_GRAD_YEARS` independently redefined in `server/src/lib/validation.js` and `client/src/constants.js`, plus a third hardcoded copy of the role list in `lib/importPreview.js:53` → can't fully unify cross-tier without a shared package, but at minimum fix `importPreview.js` to import the existing client `ROLES` constant instead of a fourth hardcoded copy.
- ISO date regex `/^\d{4}-\d{2}-\d{2}$/` defined 6 separate times server-side → one shared regex constant.
- Swimmer-name extraction (`Swimmer_Name`/`Name2`/`Name3`/`Name4` filtering) duplicated 4 ways across `RecordsPage.jsx`, `Top20Page.jsx`, `Top25ExportPage.jsx`, `lib/swimmerSearch.js` → one shared helper.
- `formatCostRange()` defined twice with **different rounding behavior** (`HomePage.jsx` vs `AnnouncementPanel.jsx`, the latter correctly using `fmtMoney()`) — real output drift for non-integer costs, fix by making `HomePage.jsx` use the same `fmtMoney()`-based version.
- Two local date formatters (`OverviewPanel.jsx`'s `fmtDate`, `TrafficPanel.jsx`'s `fmtShortDate`) reinvent `lib/dates.js`'s existing `parseLocalDate`/`formatShortDate` → delete the local copies, import the shared ones.

**Why:** Each individually small, but bundled they're a meaningful chunk of duplicated surface area, and several (the cost-range rounding, the role-list drift) are actual behavior differences waiting to bite, not just style.

**Effort:** M (many small changes, low complexity each)
**Priority:** P2

### Remove verified dead code

**What:**
- `COLUMNS` export in `server/src/models/participants.js:5-19` — unused anywhere, server or client.
- `getStats` imported into `server/src/routes/participants.js` but never called there (the real caller is `routes/stats.js`, which has its own import).
- `rowToQuestion(row) { return row; }` no-op passthrough in `server/src/models/questions.js:4-6`, mapped over every row for no effect.
- `fetchAdminAccounts()` in `client/src/api/adminAccounts.js:21-23` — zero callers (the real consumer, `AccountsPanel.jsx`, uses `fetchAllAccounts()` instead).

**Why:** Grep-verified zero references each. Free removal, no behavior change.

**Effort:** S
**Priority:** P3

### Misc complexity cleanup

**What:**
- Extract the break-glass-account guard (repeated 3x) and self-lockout guard (repeated 2x) in `server/src/routes/adminAccounts.js` into two small guard functions.
- `server/src/routes/participants.js` repeats the same trip-null-check boilerplate 4x despite already having `resolveTrip()` — fold into the helper (same fix as the trip-resolution consolidation item above).
- `RegisterPage.jsx` models one screen as 7+ independent booleans/nullables (`submitted`, `showAddForm`, `editingProfile`, `editingParticipant`, `prefill`, `lastAdded`, ...), manually reset together in `handleLogout` and picked apart via a long nested ternary — collapse to a single `screen` enum.
- `AdminRoster.jsx:274-324` hand-writes 7 near-identical tab buttons instead of mapping over a `TABS` array, the pattern already used elsewhere in this codebase (`ParticipantForm.jsx`'s `ROLES.map`, `TrafficPanel.jsx`'s `WINDOW_OPTIONS.map`).
- `ParticipantForm.jsx:213-260` renders three near-identical action-button JSX blocks for its `admin`/`public`/`popover` variants (only the field markup above is correctly shared) — consolidate the button markup the same way.

**Why:** Lowest urgency of this list — these are readability/maintainability wins, not duplication or correctness risks. Good filler work, not worth prioritizing over the items above.

**Effort:** M (several independent small refactors)
**Priority:** P3
