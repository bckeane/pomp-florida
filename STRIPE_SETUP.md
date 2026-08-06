# Stripe setup — payment links

Follow this once to get the "Get deposit/final link" roster feature actually working. The code is already built and tested (see `TODOS.md` → Payments → "Admin runbook"); nothing here requires touching the codebase except pasting keys into two places.

Background: the club's bank account has its own EIN (confirmed with the treasurer, 2026-08). Booster club absorbs the ~2.9% + $0.30 Stripe fee — parents are charged exactly the balance shown in the roster, no added line item. There's no webhook — every payment still needs a manual roster update after the fact (see the runbook in `TODOS.md`).

## 1. Decide who administers the account

Before creating anything: **name one person** who will own the Stripe login (email + password, 2FA). This is the person who can see all payments, issue refunds, and would be contacted if Stripe needs anything. Doesn't have to be you — could be the treasurer, since they already handle the club's financial admin. Whoever it is needs to be involved in step 2.

## 2. Create the Stripe account

1. Go to https://dashboard.stripe.com/register and create an account using the email decided in step 1.
2. When asked for business details, use the **booster club's** name and EIN (not a personal SSN) — this is exactly what the treasurer confirmed is safe to do.
3. Business type: likely "Nonprofit" or "Unincorporated association" depending on how the club is actually structured — ask the treasurer if unsure; this is the same entity-classification question they already answered over email.
4. Add the bank account that should receive payouts (the club's account, same one checks/Venmo go to today).
5. **Don't worry about full verification yet.** Stripe lets you get test-mode API keys immediately and test the whole flow before submitting the business for live verification. Full verification for a new nonprofit-adjacent account can take **days to weeks** — budget for that before you need this live for a real deadline (deposit due date, etc).

## 3. Get test-mode keys and try it locally

1. In the Stripe Dashboard, make sure the toggle in the top-left says **"Test mode"**.
2. Go to **Developers → API keys**. Copy the **Secret key** (starts with `sk_test_...`).
3. In `server/.env` (create it from `server/.env.example` if you don't have one yet), set:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   ```
4. Restart the local dev server (`npm start` from the repo root, or however you normally run it).
5. Log into `/admin`, open the roster, click "Get deposit link" on any participant with a balance owed. You should get a real `checkout.stripe.com` URL instead of the "Stripe is not configured" error.
6. Open that URL and pay with a Stripe **test card**: `4242 4242 4242 4242`, any future expiry, any 3-digit CVC, any ZIP. This won't charge real money — it's Stripe's official test card for exactly this purpose.
7. In the Stripe Dashboard, go to **Payments** — you should see the test payment, with `participant_id` and `installment` in its metadata (click into the payment → metadata). That metadata is how you'll match a real payment to a roster row later.
8. Back in pompFlorida, manually update that participant's "Deposit paid" field to match, and confirm "Balance owed" recomputes — this is the actual reconciliation step admins will do for real, per the runbook in `TODOS.md`.

If all of that works, the integration is confirmed end-to-end. Nothing else in the code needs to change.

## 4. Set the production key on Render

1. Back in the Stripe Dashboard, submit the business for verification when you're ready to go live (Settings → Business details, or you'll be prompted). This is the step that can take days to weeks — start it early.
2. Once verified, toggle **out of Test mode** and get the **live** secret key from Developers → API keys (starts with `sk_live_...`). Treat this like a password — it can move real money.
3. In the Render dashboard, open the `pompflorida-api` service → **Environment**, and set:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   ```
   (This env var is already declared in `render.yaml` with `sync: false`, meaning Render won't overwrite whatever you type in here on future deploys — same pattern as `RESEND_API_KEY`.)
4. Also confirm `APP_BASE_URL` is set on Render (used to build the success/cancel redirect after a parent pays) — check the Environment tab; if it's blank, set it to the site's real URL.
5. Redeploy (or wait for the next deploy) so the new env var takes effect.

## 5. One real test in production

Before telling parents this exists: as the admin, generate a real deposit link for **your own** test participant (or ask the treasurer to), and either pay a small real amount with a real card or immediately cancel — just confirm the live-mode link actually opens Stripe Checkout correctly and the payment shows up in the live Dashboard (not test mode). Then you're done.

## After this

Day-to-day usage is documented in `TODOS.md` under **Payments → Admin runbook: manual Stripe reconciliation and refunds** — that's the doc to follow every time a parent actually pays or a refund is needed. This file is a one-time setup guide, not something you need again unless the key gets rotated or a second admin needs Dashboard access.
