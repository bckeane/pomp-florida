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

### Budget row types: per-swimmer/diver vs. totals-based

**What:** Each budget row needs a type: **swimmer/diver-based** (a fixed cost per swimmer/diver, e.g. a per-athlete meet fee) vs. **totals-based** (a lump sum quoted by a 3rd party — e.g. hotel block, bus charter — that needs to be divided across the number of swimmers/divers to get the per-athlete cost).

**Why:** Not every budget line is naturally a per-athlete rate. Some costs arrive as a single quoted total that only becomes a per-Panther figure once divided by headcount, and the Budget Tab's "Total Per Panther" column needs to know which math applies to each row.

**Effort:** TBD
**Priority:** TBD
**Depends on:** Budget Tab feature

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
1. Issue the refund manually in the Stripe Dashboard (Payments → find the charge → Refund). pompFlorida has no in-app refund flow, and the webhook doesn't listen for refund events.
2. Manually reduce (or zero out) the corresponding `deposit_received`/`final_payment_received` value on the roster to match what actually happened in Stripe. **This step is easy to forget** — if skipped, the roster will show a balance as paid when it isn't, silently drifting from the real Stripe ledger. There's no code guard against this; it depends on the admin remembering. (A `charge.refunded` webhook handler would close this gap — not built yet; worth its own TODO if refunds turn out to be common.)

### `charge.refunded` webhook handler

**What:** Extend `POST /api/stripe/webhook` to also listen for `charge.refunded` and automatically reduce (or zero out) the corresponding `deposit_received`/`final_payment_received` value on the roster, instead of relying on an admin to do it by hand.

**Why:** Refunds today require a fully manual roster fix (see runbook above) with no code guard — if an admin forgets step 2 after issuing a refund in the Stripe Dashboard, the roster silently shows a balance as paid when it isn't, drifting from the real Stripe ledger.

**Effort:** S
**Priority:** TBD — worth building once refunds turn out to be common; not urgent while they're rare.

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

## Admin

### Registered-accounts tab: emails + parent contact info

**What:** A new tab on the admin page (alongside Roster/Budget/Questions/Trip details) listing every registered account — email, parent/guardian name, and emergency contact phone — independent of the per-trip participant roster.

**Why:** Coordinators need a full contact list for everyone who's signed up, not just the per-participant info currently only visible by opening each roster row.

**Context:** The `accounts` table (`server/src/models/accounts.js`) already has `email`, `parent_name`, `emergency_phone` columns, set via `updateAccountProfile` (`ParentProfileGate.jsx` on the register page). Nothing currently lists all parent accounts — `listAdminAccounts()` exists but filters to `role = 'admin'` only, for the separate "manage admins" feature. Would need a new model query, a new `requireAdmin` route, and a new tab following the existing `activeTab` segmented-control pattern in `AdminRoster.jsx`.

**Effort:** S
**Priority:** TBD

## Parent-Facing Trip Info

### Post-registration trip summary graphic

**What:** Show parents a visual trip-essentials summary — dates, accommodation, training venue, daily pool-time schedule, what to pack, departure/return logistics — after they register. Reference: `Swim_&_Dive_Team_Florida_Trip_2026.png` in the repo root, a one-page graphic covering exactly this for the 2026 trip.

**Why:** Once hotel/pool/airline logistics are confirmed for the current trip, parents need this surfaced somewhere they'll actually see it right after signing up, not buried in trip-detail text fields they'd have to go looking for.

**Context:** The reference image was generated externally (NotebookLM, per its watermark) for the 2026 trip — a static image, not produced by this app. Most of its content already has a home in the trip model (`server/src/models/trips.js` `DETAIL_FIELDS`: `training_location`, `lodging`, `trip_date`, `return_date`, etc.), but the day-by-day morning/afternoon pool-time grid isn't modeled anywhere currently — would need a new field or table. The current active trip (2027) doesn't have hotel/pool/airline details finalized yet, so there's nothing real to show until those come in.

**Open question for implementation:** regenerate a static graphic each year via an external tool and link/embed the image (simple, but someone has to remember to do it every year and it can drift out of sync with the trip-detail fields), vs. build it as a real in-app component rendered live from trip data (more work, needs the schedule data modeled, but always accurate and no yearly manual step).

**Where to show it:** Most natural spot is the register-page success screen (right after signup) and/or account-home, alongside the trip details already shown on the public home page.

**Effort:** M (dynamic in-app component, needs new schedule data) / S (static image, regenerated and linked yearly)
**Priority:** TBD
**Depends on:** Hotel/pool/airline logistics being finalized for the current trip year.
