Any gstack skill you run tomorrow (/office-hours, /plan-eng-review, etc.) will pick this up automatically via context recovery. Short version of what's in it:

Status: Budget Tab design is APPROVED, eng-reviewed and CLEARED, Revision 1 (per-participant opt-out) folded in.
T1 is DONE (2026-07-31): pulled the full Budget tab from FloridaTrip2026.xlsx (not just the screenshot), confirmed the 7-category list (Airfare, Hotel, Buses, Pool, Food, Overrun, Bfast) and exact totals, and wrote `server/src/db/migrations/008_budget.sql` — creates `budget_categories`/`trip_budget_items`/`trip_budget_exclusions` and seeds both 2025 and 2026 actuals. Applied and verified against the local dev DB.
Two corrections made along the way (user confirmed both):
  - The design doc's "$51,595.05 for 2025" was actually the 2026 column total; real 2025 total is $53,709.09 — seed data uses the correct per-year figures.
  - No 2025 trip row existed in `trips` (only 2026) — backfilled one (`Florida Trip 2025`, no participants) so the Diff/prior-year columns have something to compare 2026 against.
  - Bfast (2026) and Overrun (2025) are seeded as literal $0 rows (transcribed as-is from the spreadsheet), not omitted.
Everything else (schema, API contract, currency-as-dollars fix, students_active fix, server-side compute, opt-out matrix design) is locked.

T4, T5, T6, T9 are also DONE (2026-07-31) — the entire server side of the Budget Tab feature is built and manually verified (no Vitest yet, that's T8):
  - `server/src/models/budget.js` — categories CRUD, `getBudgetForTrip` (server-computed per-panther/diff/exclusions), `upsertLineItem`, `seedBudgetForNewTrip`, `setExclusion`/`clearExclusion`.
  - `server/src/models/trips.js` — `createTrip()` now wraps trip-insert + budget-seed in one `db.transaction()`.
  - `server/src/routes/budget.js` — full route set, registered in `index.js`, gated by `requireAdmin`. Curl-tested: 401/400/409 validation paths, exclusion opt-out matrix (students count drops/restores correctly), full happy path against real 2026 data.

**One thing I found and did NOT silently fix — needs your call:** the 2026 budget panel's "Total Per Panther 2025" (prior-year) column will show "—" for every category, because the backfilled 2025 trip has no participants, so its student count is 0 and the divide-by-zero guard kicks in. The dollar Diff column is unaffected and correct. I verified the underlying math is right (tested a 2027-vs-2026 comparison where both trips have real rosters — it computed correctly). Three options are written up in the design doc's new "Open items for a human decision" section — worth 5 minutes before T7 client work makes this visible in the UI.

T7 and T10 are also DONE (2026-07-31) — the entire Budget Tab feature (server + client) is built and browser-QA'd:
  - `client/src/components/BudgetPanel.jsx` + `client/src/api/budget.js`, wired into `AdminRoster.jsx` as a "Budget" header button (`showBudget`, same pattern as `showTripDetails`).
  - Verified live in the browser (break-glass admin login, 2026 trip): line-items table matches the spreadsheet exactly, inline total editing works, grand-totals footer computes correctly, add-category and the participant × category opt-out matrix both work and recompute # Students / Total Per Panther live with no page reload.
  - Reused existing CSS classes throughout (`.roster-table`, `.modal-panel--wide`, `.preview-table-wrap`) — no new styles added.

**One implementation call worth knowing about:** "+ Add category" also creates a $0 line item on the current trip immediately (composes two existing calls, no new endpoint) so the row shows up where the admin is looking. Side effect, confirmed via QA: because of this, `retireCategory`'s binding block-if-referenced rule (Premise 7) means a category becomes un-retirable almost the instant it's added. Working as spec'd, flagged in the design doc in case it's confusing in real use.

T8 is also DONE (2026-07-31) — **all 10 tasks (T1-T10) are now complete.** Vitest is live in both workspaces:
  - `npm test` in `server/`: 22 tests across `test/{budget,trips,participants,budgetRoute}.test.js`, run against a real `:memory:` SQLite DB (fresh migration per test file, never touches `data/trip.db`). Covers every Failure Modes row: divide-by-zero guards, `resolvePreviousTrip`'s null case, category duplicate/retire-blocked, negative-total rejection, and route-level 401/400/409 via `supertest`.
  - The CRITICAL `createTrip` transaction test was verified for real — I temporarily removed `db.transaction()`, watched the test fail (orphaned trip row), then restored it and confirmed all green.
  - `npm test` in `client/`: 4 tests for `fmtMoney` (extracted from `BudgetPanel.jsx` into `client/src/lib/money.js` for testability). Full React component testing (RTL/jsdom) wasn't set up — wasn't required by this feature's Success Criteria, and retrofitting it onto pre-existing untested code is explicitly out of scope per the design doc.

The Budget Tab feature is fully built, manually QA'd in the browser, and now has automated regression coverage on its riskiest paths (the transaction, the divide-by-zero guards, auth/validation). Nothing outstanding from the design doc.

**2026-08-01 follow-up, two real fixes from actual use:**
1. Converted the Budget panel from a modal to a full `Roster`/`Budget` tab in `AdminRoster.jsx` (reused `.segmented`/`.segmented-btn`, no new CSS).
2. Found and fixed a real bug: the actual current trip (2027) predates migration 008, so it had zero budget categories, and there was no way to attach an already-existing category to it (typing "Airfare" in the add box 400s as a duplicate). `BudgetPanel.jsx` now shows an "Add existing category" dropdown + a "+ Add all N" bulk button whenever the trip is missing categories other trips already have. Used it live on the real 2027 trip — went from empty to all 7 categories attached at $0 in one click, with correct 2026 diffs already showing. That's now the real state of the current trip's budget, not test data.

Tomorrow, if there's follow-up work: `TODOS.md` (extending Vitest to the rest of the app, multi-year budget trend view), the two earlier open notes (2025 per-panther display, retire-on-first-use), or the three extra spreadsheet sections (payment tracking, food cash envelope log, hotel room breakdown) if the user decides any of those are worth building.