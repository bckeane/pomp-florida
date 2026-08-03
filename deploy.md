# Deploy Guide (Prototype)

This runbook is for deploying this project as:

- Frontend: GitHub Pages
- Backend API: Render (Web Service)
- Database: SQLite on a mounted Render disk

Use this document for repeatable prototype deploys.

## Architecture

- Browser loads static app from GitHub Pages.
- App calls API on Render (`VITE_API_BASE_URL`).
- Auth uses HTTP-only cookies, so CORS and cookie settings must match production origins.

## Prerequisites

- Code is pushed to `main` on GitHub.
- Render account is connected to the GitHub repo.
- GitHub Pages is enabled for this repository.

## One-Time Setup

### 1) Render service (API)

Create a new Render Web Service from this repo.

Blueprint file is `render.yaml` and should be used automatically.

Important behavior:

- Build command installs dependencies only.
- Startup command creates `/var/data`, runs migrations, then starts server.
- SQLite path is persisted on mounted disk at `/var/data/trip.db`.

### 2) Render environment variables

Set these in Render service settings:

- `CORS_ALLOWED_ORIGINS=https://<your-github-username>.github.io`
- `COOKIE_SAME_SITE=none`
- `COOKIE_SECURE=true`
- `BREAK_GLASS_EMAIL=<your-admin-email>`
- `BREAK_GLASS_PASSWORD=<strong-password>`

Notes:

- `CORS_ALLOWED_ORIGINS` is origin only (no path).
- You can include multiple origins as comma-separated values.
  Example: `https://bckeane.github.io,http://localhost:48311`

### 3) GitHub Pages source

In GitHub:

1. Go to **Settings -> Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**

### 4) GitHub Actions repository variable

In GitHub:

1. Go to **Settings -> Secrets and variables -> Actions**
2. Open the **Variables** tab
3. Add repository variable:
   - Name: `VITE_API_BASE_URL`
   - Value: `https://<your-render-service>.onrender.com/api`

## Deploy Steps (Each Release)

1. Push to `main`.
2. Confirm Render deploy is successful.
3. Confirm GitHub Actions workflow **Deploy Client to GitHub Pages** succeeds.
4. Verify the site from GitHub Pages URL.

## Verification Checklist

### API checks

- `GET https://<your-render-service>.onrender.com/api/trips/current` returns JSON.
- Render logs show successful startup and no migration errors.

### Frontend checks

- GitHub Pages site loads.
- Browser Network tab shows API calls going to Render URL, not `/api` on github.io.
- Login works and session persists after refresh.

### Admin bootstrap

There is no automatic default user created on deploy.

Use one of these:

- Break-glass credentials (from env vars above), or
- Run admin script locally against target DB setup (advanced)

## Common Failures and Fixes

### 1) GitHub Actions deploy step fails with 404

Symptoms:

- `Failed to create deployment (status: 404)`
- `HttpError: Not Found` from `actions/deploy-pages`

Fix:

- Ensure **Settings -> Pages -> Source = GitHub Actions**.
- Ensure workflow includes `actions/configure-pages` before upload/deploy.
- Re-run workflow.

### 2) Render deploy fails opening SQLite DB path

Symptoms:

- `Cannot open database because the directory does not exist`

Fix:

- Keep migrations in startup (not build).
- Ensure startup creates DB directory (`mkdir -p /var/data`).
- Ensure server DB connection code creates `dirname(DB_PATH)` recursively.

### 3) Login fails in production but works locally

Check:

- `COOKIE_SAME_SITE=none`
- `COOKIE_SECURE=true`
- `CORS_ALLOWED_ORIGINS` includes exact GitHub Pages origin
- Frontend `VITE_API_BASE_URL` points to Render `/api`

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
