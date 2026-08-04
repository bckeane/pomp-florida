# Deploy Guide (Prototype)

This runbook is for deploying this project as a single Render Web Service that
serves both the built client and the API from one origin.

- Frontend + Backend API: Render (Web Service)
- Database: SQLite on a mounted Render disk

Use this document for repeatable prototype deploys.

## Architecture

- Render builds the client (`vite build`) during the build step, then the
  Express server serves the built static files directly and proxies
  everything under `/api` to the API routes.
- Everything is one origin, so the session cookie is same-site. This matters
  because the previous split setup (client on GitHub Pages, API on Render)
  used a cross-site cookie (`SameSite=None; Secure`) that Safari — desktop
  and iOS — blocks outright via Intelligent Tracking Prevention, regardless
  of that setting. Chrome/Firefox allowed it, which is why the bug only
  showed up for Safari users. Single-origin sidesteps the whole class of
  problem instead of chasing Safari's cookie policy.

## One-Time Setup

### 1) Render service

Create a new Render Web Service from this repo. Blueprint file is
`render.yaml` and should be used automatically.

Important behavior:

- Build command installs dependencies and builds the client
  (`npm ci && npm run build -w client`).
- Startup command creates `/var/data`, runs migrations, then starts the
  server, which serves `client/dist` alongside the API.
- SQLite path is persisted on mounted disk at `/var/data/trip.db`.

### 2) Render environment variables

Set these in Render service settings:

- `CORS_ALLOWED_ORIGINS=https://<your-render-service>.onrender.com`
  — yes, the service's own URL. Browsers send an `Origin` header on
  same-origin POST/PUT/DELETE requests too (not just cross-origin ones), and
  the server's CORS middleware rejects any `Origin` not on this list. If you
  later add a custom domain, add that origin here as well (comma-separated).
- `COOKIE_SAME_SITE=lax`
- `COOKIE_SECURE=true`
- `BREAK_GLASS_EMAIL=<your-admin-email>`
- `BREAK_GLASS_PASSWORD=<strong-password>`

Notes:

- `CORS_ALLOWED_ORIGINS` is origin only (no path).
- You can include multiple origins as comma-separated values.

## Deploy Steps (Each Release)

1. Push to `main`.
2. Confirm Render deploy is successful (build includes the client build step).
3. Verify the site from the Render service URL.

## Verification Checklist

### API checks

- `GET https://<your-render-service>.onrender.com/api/trips/current` returns JSON.
- Render logs show successful startup and no migration errors.

### Frontend checks

- The Render service URL itself loads the app (not just `/api`).
- Sign-up/login works and session persists after refresh — test on Safari
  (iOS or desktop) specifically, since that's what this architecture fixes.

### Admin bootstrap

There is no automatic default user created on deploy.

Use one of these:

- Break-glass credentials (from env vars above), or
- Run admin script locally against target DB setup (advanced)

## Common Failures and Fixes

### 1) Render deploy fails opening SQLite DB path

Symptoms:

- `Cannot open database because the directory does not exist`

Fix:

- Keep migrations in startup (not build).
- Ensure startup creates DB directory (`mkdir -p /var/data`).
- Ensure server DB connection code creates `dirname(DB_PATH)` recursively.

### 2) Login/signup fails with a CORS origin error

Symptoms:

- Server logs `Origin https://<your-render-service>.onrender.com not allowed by CORS`.

Fix:

- Add the service's own URL to `CORS_ALLOWED_ORIGINS` (see above) — this is
  required even though frontend and API are the same origin, because
  same-origin state-changing requests still carry an `Origin` header.

### 3) App loads but shows a blank page / 404s on the built assets

Symptoms:

- Root URL 404s, or loads HTML but JS/CSS 404 in the browser console.

Fix:

- Confirm the build step actually ran `npm run build -w client` and produced
  `client/dist` — check Render build logs.
- Confirm `client/dist` exists relative to `server/src/index.js` as
  `../../client/dist` (i.e. at the repo root, not inside `server/`).

## Quick Command Reference

Build client locally:

```bash
npm run build -w client
```

Run migrations locally:

```bash
npm run migrate -w server
```

## Prototype Notes

- Render free tiers may sleep on inactivity, causing first request cold starts.
- This is acceptable for prototype/demo period.
- For production, consider managed Postgres and a persistent always-on plan.
