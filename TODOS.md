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

### Admin runbook: manual Stripe reconciliation and refunds

Shipped 2026-08-06 with the payment-links feature (`POST /participants/:id/payment-link`, "Get deposit/final link" on each roster row). pompFlorida has **no webhook and no automatic sync with Stripe** — every payment must be manually reconciled by the admin. This is the runbook.

**After a parent pays:**
1. Log in to the Stripe Dashboard and check Payments for a completed charge. Each Checkout Session carries `participant_id` and `installment` (`deposit` or `final`) in its metadata, so a payment can be matched to the exact roster row without guessing from the payer's name.
2. In pompFlorida's roster, manually update the participant's `deposit_received` or `final_payment_received` field (the same inline-editable field used for check/cash/Venmo payments today) to reflect the new total received for that installment.
3. The "Balance owed" column recomputes automatically — no other step needed. Once a balance hits $0, the "Get \[installment\] link" button on that row is replaced with "Paid in full" and can no longer generate a new Checkout Session for that installment.

**If a participant drops the trip after paying:**
1. Issue the refund manually in the Stripe Dashboard (Payments → find the charge → Refund). pompFlorida has no in-app refund flow.
2. Manually reduce (or zero out) the corresponding `deposit_received`/`final_payment_received` value on the roster to match what actually happened in Stripe. **This step is easy to forget** — if skipped, the roster will show a balance as paid when it isn't, silently drifting from the real Stripe ledger. There's no code guard against this; it depends on the admin remembering.

**Other things to know:**
- Checkout Sessions expire 24 hours after being generated if the parent hasn't paid. An expired link just needs a fresh "Get \[installment\] link" click — no cleanup required, expired sessions cause no harm.
- Nothing stops clicking "Get \[installment\] link" twice, creating two live sessions for the same installment. Low-risk at this app's volume (one admin, infrequent clicks) — the unused one simply expires. Not worth building dedup logic for.
- The booster club absorbs the ~2.9% + $0.30 Stripe fee — parents are charged exactly the balance shown in pompFlorida, no added fee line item.
- The link always charges the **remaining balance owed** (installment price minus whatever's already recorded as received), not the full fixed installment price — so a parent who already paid something by check isn't double-charged.

**Depends on:** `STRIPE_SECRET_KEY` set in the server environment (see `server/.env.example`) — without it, "Get \[installment\] link" returns a clear "Stripe is not configured" error instead of attempting to reach Stripe.
