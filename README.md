# Florida Trip 2026 — Roster (Phase 1)

Replaces the `FloridaTrip2026.xlsx` roster tab with a small web app. Every
record is keyed by an internal `id` — nothing joins on the `"Last, First"`
name string the spreadsheet used, which is what caused silent lookup misses
from trailing whitespace in last names.

This is Phase 1 of a larger plan (see `PHASE1_PROMPT.md`-equivalent in the
project brief): roster only. Budget, airline, and carpool are future phases
that will add tables referencing `participants.id`.

## Stack

- **Server:** Node.js + Express, SQLite via `better-sqlite3`, validation with `zod`
- **Client:** React + Vite + `react-router-dom`
- **Data:** local SQLite file at `server/data/trip.db` (gitignored — contains
  minors' names and birth dates, keep it local)

## Pages

- **`/`** — the admin roster: full table, filters, trip switcher, bulk
  import/export. Requires logging in with an **admin** account (see
  "Accounts & auth" below) — there's no self-serve way to become an admin,
  only `/auth/login`.
- **`/register`** — a self-serve registration page for parents/students to
  add themselves to the *current* trip. Requires an account: sign up or log
  in with email + password before the participant form appears, and every
  participant created there is tied to that account (`participants.account_id`)
  — one account can register multiple students (siblings, etc.) and see the
  list of who it's already registered. Same fields/validation as the admin
  "Add participant" form otherwise: labeled "Legal first/last name", role is
  a dropdown with nothing pre-selected (must be chosen explicitly), standalone
  page rather than a modal. Both forms share the same `ParticipantForm`
  component (`variant="admin"` vs `variant="public"`) so validation rules
  can't drift between them.

## Accounts & auth

One `accounts` table, two roles:

- **`parent`** — created via `/register`'s sign-up form. Can only manage its
  own participants through `/api/my/participants`. No public API path can
  ever grant this account admin.
- **`admin`** — required for the roster page and everything under
  `/api/participants`, `/api/stats`, and `/api/trips*` (except
  `/api/trips/current`, which stays public so the registration page can show
  the trip name before anyone logs in).

Sessions are a random 32-byte token in the `sessions` table (30-day expiry,
httpOnly + `SameSite=Lax` cookie) — not a JWT, so revoking one is just a row
delete. Passwords are `scrypt`-hashed with a per-account random salt and
compared with a timing-safe check; never stored in plain text.

### Creating the first admin

Run this **locally** (not via the API, and don't paste the password into
chat with an AI assistant or anyone else):

```bash
cd server
ADMIN_PASSWORD='choose-a-real-password' npm run create-admin -- bckeane@gmail.com
```

This creates the account if it doesn't exist yet, or promotes it to admin if
it already signed up as a parent. Log in at `/` with that email/password
afterward. (Passing the password as a second CLI argument instead of the env
var also works but lands in your shell history — the env var form is
preferred.)

### Adding more admins

Once logged in as an admin, use **Manage admins** in the roster header:
enter an email and either leave the password blank (promotes an existing
account — parent or otherwise — to admin) or set a temporary password
(creates a brand-new admin account for someone who hasn't signed up yet).
Backed by `POST /api/admin/accounts`, itself `requireAdmin`-gated — a parent
account gets a `403` if it tries to hit this endpoint directly.

### Break-glass admin login

A recovery login that works even if the `accounts` table is empty,
corrupted, or every admin's password is forgotten — because it's checked
against environment variables directly, never against the database.

```bash
cd server
cp .env.example .env
# edit .env and set BREAK_GLASS_EMAIL / BREAK_GLASS_PASSWORD to real values
```

`.env` is gitignored — these values live only on your machine. Logging in
with that email/password:

- Always succeeds regardless of what's in the `accounts` table (it doesn't
  check `password_hash` at all), so it survives a deleted/locked-out admin.
- Materializes a real `admin` account row on first use, so normal
  session/`requireAdmin` middleware works unchanged afterward.
- Is automatically excluded from the **Manage admins** list — other admins
  never see it, keeping it a true fallback rather than a visible account.

Restart the server after editing `.env` for the new values to take effect.
Leave both vars unset (or delete `.env`) to disable break-glass login
entirely.

## Setup

Requires Node 18+. This is an npm workspace — one install at the root covers
both `server/` and `client/`.

```bash
npm install     # installs both workspaces
npm run seed    # applies migrations and loads server/seed/sample-roster.csv
npm start       # runs the API and the Vite dev server together
```

`npm start` uses `concurrently` to run `server` (Express, `--watch`) and
`client` (Vite) side by side, prefixed `[server]` / `[client]` in one
terminal. Open **http://localhost:48311**.

Ports are set to unusual, unlikely-to-collide values on purpose (this is a
shared dev machine where 3000/3001/5173/8080 etc. are frequently taken):

- API: `48310` (override with `PORT`)
- Client: `48311` (fixed via `strictPort` in `client/vite.config.js` — if
  it's taken, Vite will error instead of silently picking another port)

The Vite dev server proxies `/api` to `http://localhost:48310`.

To run a single side on its own: `npm run dev -w server` or
`npm run dev -w client`. For production-style running: `npm run start -w server`
(no file watching), and `npm run build -w client && npm run preview -w client`.

## Deploying with GitHub Pages

This repo is a full-stack app. GitHub Pages can host the **client** only,
not the Express API. Deploy in two parts:

1. Deploy the API (`server/`) to a Node host (Render, Railway, Fly.io, etc.)
  over HTTPS.
2. Deploy the React client (`client/`) to GitHub Pages.

### 1) Deploy the API (server)

Set these environment variables on your server host:

```bash
PORT=48310
CORS_ALLOWED_ORIGINS=https://<your-github-username>.github.io
COOKIE_SAME_SITE=none
COOKIE_SECURE=true
BREAK_GLASS_EMAIL=<optional>
BREAK_GLASS_PASSWORD=<optional>
```

`COOKIE_SAME_SITE=none` + `COOKIE_SECURE=true` is required so browser session
cookies can be sent from the GitHub Pages domain to your API domain.

### 2) Deploy the client to GitHub Pages

This repo includes [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml),
which builds `client/` and deploys it to Pages on pushes to `main`.

In your GitHub repo settings:

1. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Go to **Settings → Secrets and variables → Actions → Variables**.
3. Add a repository variable named `VITE_API_BASE_URL` with your deployed API URL,
  for example `https://florida-trip-api.onrender.com/api`.

Then push to `main` (or run the workflow manually). The site URL will be:

`https://<your-github-username>.github.io/<repo-name>/`

If you use a custom domain for Pages, also add that domain to
`CORS_ALLOWED_ORIGINS` (comma-separated if multiple).

### Backend deploy on Render (recommended)

This repo includes [render.yaml](render.yaml) for one-click API deploy with a
persistent SQLite disk.

1. Push this repo to GitHub.
2. In Render, choose **New + → Blueprint** and select this repository.
3. Render will create `pompflorida-api` using `render.yaml`.
4. In Render service env vars, set:
  - `CORS_ALLOWED_ORIGINS=https://<your-github-username>.github.io`
  - `BREAK_GLASS_EMAIL` and `BREAK_GLASS_PASSWORD` (optional, recommended)
5. Deploy and copy your Render URL (example:
  `https://pompflorida-api.onrender.com`).
6. In GitHub repo variables, set:
  - `VITE_API_BASE_URL=https://pompflorida-api.onrender.com/api`

Notes:

- The blueprint runs migrations during service startup (after disk mount), which
  avoids build-time failures when `DB_PATH` points at `/var/data`.
- SQLite data persists at `/var/data/trip.db` via the mounted Render disk.
- CORS must be the origin only (scheme + host), not a path.

## Project layout

```
server/
  src/
    db/
      connection.js       better-sqlite3 connection, WAL mode
      migrate.js          migration runner (tracks applied migrations in _migrations)
      migrations/         one .sql file per migration, run in filename order
    lib/
      validation.js       zod schema + role-dependent rules
      derived.js           full_name / age_at_trip / grade — all computed, never stored
      csv.js               CSV parse/serialize
      importMapping.js     spreadsheet header + role alias mapping
      dates.js             ISO / US date normalization
      passwords.js         scrypt hash/verify for account passwords
      breakGlass.js         env-var-based recovery login check (never touches the DB)
    models/
      participants.js      all SQL for the participants table, scoped by trip_id
      trips.js               trip year CRUD + "current trip" pointer
      settings.js           generic key/value settings (current_trip_id, etc.)
      accounts.js            account CRUD, password verification, admin listing/roles
      sessions.js            session token create/lookup/delete
    middleware/
      auth.js                requireAccount (any session) / requireAdmin (session + role='admin')
    routes/
      participants.js       admin-only CRUD + import/export routes
      stats.js               /api/stats (admin-only)
      trips.js                /api/trips (admin-only, except /trips/current which is public)
      adminAccounts.js        /api/admin/accounts — list/add admins (admin-only)
      auth.js                 /api/auth/signup|login|logout|me
      myParticipants.js       /api/my/participants (requires a parent/any session)
    index.js                Express app entry point
  scripts/
    create-admin.js           local-only: create or promote an account to admin
  seed/
    sample-roster.csv        sample data matching the spreadsheet's columns
    seed.js                   loads sample-roster.csv into the current trip
client/
  src/
    api/participants.js      fetch wrapper for the participants API
    api/trips.js               fetch wrapper for the trips API
    api/auth.js                 fetch wrapper for the auth API (credentials: 'include')
    api/adminAccounts.js         fetch wrapper for /api/admin/accounts
    components/              RosterTable, ParticipantForm, ImportScreen, SummaryBar, TripSwitcher,
                              AuthGate, ManageAdmins
    App.jsx                   top-level state + layout
```

## Data model

Every trip year is a first-class row, not a new spreadsheet. `trips` holds
one row per year (`year`, `name`, `trip_date`, `created_at`); every
`participants` row has a `trip_id` foreign key, so two years can have a
swimmer with the same name and birth date without colliding (duplicate
detection is scoped per-trip), and each year's ages are computed against
*that year's* `trip_date` — not whichever trip happens to be "current" —
so browsing an old roster still shows historically correct ages.

`participants` schema — see `server/src/db/migrations/001_init.sql` (base
table), `002_trips.sql` (adds `trip_id`), `003_rename_grade_column.sql` and
`004_drop_grade_column.sql` (grade moved from a stored, overridable field to
a fully computed one — see below). Everything downstream (budget, airline,
carpool in later phases) references `participants.id`, never a name string.

Derived fields (`full_name`, `age_at_trip`, `grade`) are computed on read,
never stored. `grade` is `12 - (grad_year - trip.year)`, the same way
`age_at_trip` is computed from `birth_date` — there's no grade input
anywhere in the UI and no way to override it; it always tracks grad year.

### Starting a new school year

Use the trip switcher at the top of the roster page → **Start new year**.
That creates a new, empty `trips` row and makes it current — new adds,
imports, and stats default to it. Nothing about the old year is touched;
switch back to it from the same dropdown at any time to view, edit, or
export it. There's no automatic roster carry-over between years (returning
swimmers/coaches get re-added or re-imported) — that keeps each year's
roster an explicit, intentional list rather than a stale copy.

## API

All routes are under `/api`.

Auth requirement is noted per row — 🔒admin = `requireAdmin`, 🔒session = `requireAccount` (any role), unmarked = public.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/participants` | 🔒admin | `?trip_id=` (defaults to current trip), `?role=`, `?grad_year=`, `?active=`, `?q=`, `?sort=last_name\|grad_year\|age` |
| GET | `/participants/:id` | 🔒admin | |
| POST | `/participants` | 🔒admin | `?trip_id=` (defaults to current); zod-validated, rejects duplicate first+last+birth_date within that trip |
| PUT | `/participants/:id` | 🔒admin | |
| DELETE | `/participants/:id` | 🔒admin | soft delete (`active=0`); `?hard=true` for a real delete |
| POST | `/participants/import` | 🔒admin | `?trip_id=`; body `{ csv: string }` or a JSON array; `?partial=true` to commit valid rows and skip invalid ones (default: all-or-nothing) |
| GET | `/participants/export` | 🔒admin | `?trip_id=`; CSV download |
| GET | `/stats` | 🔒admin | `?trip_id=`; counts by role, by grad year, total active |
| GET | `/trips` | 🔒admin | all trip years, each flagged `is_current` |
| GET | `/trips/current` | — | the active trip; public so `/register` can show the trip name pre-login |
| GET | `/trips/:id` | 🔒admin | |
| POST | `/trips` | 🔒admin | `{ year, name, trip_date }` — creates a new (empty) trip year |
| PUT | `/trips/:id` | 🔒admin | update `name` / `trip_date` |
| POST | `/trips/:id/activate` | 🔒admin | makes this trip the default for the routes above |
| POST | `/auth/signup` | — | `{ email, password }` (password min 8 chars) — always creates a `parent` account + session cookie |
| POST | `/auth/login` | — | `{ email, password }` — sets session cookie (works for either role) |
| POST | `/auth/logout` | — | clears the session |
| GET | `/auth/me` | 🔒session | current account (incl. `role`) from the session cookie |
| GET | `/my/participants` | 🔒session | lists participants created by the signed-in account |
| POST | `/my/participants` | 🔒session | same validation as `/participants`, always targets the current trip, sets `account_id` |
| GET | `/admin/accounts` | 🔒admin | lists admin accounts (break-glass account, if any, excluded) |
| POST | `/admin/accounts` | 🔒admin | `{ email, password? }` — promotes an existing account if `password` omitted, else creates one |

Validation errors return `400` with a field-keyed `errors` object, e.g.
`{ "errors": { "birth_date": "birth_date is required for students" } }`.

## Import format

Accepts the spreadsheet's original header row:

```
First Name,Last Name,Grad Year,Grade 2026,Birth Date,Role
```

- `Role` accepts `Swim`/`Dive` as aliases for `Swimmer`/`Diver`.
- `Birth Date` accepts both `YYYY-MM-DD` and US `M/D/YYYY`.
- Leading/trailing whitespace (including non-breaking spaces from the old
  spreadsheet) is trimmed on every field.
- A `Grade 2026` column is fine to include (for compatibility with data
  copied straight out of the old spreadsheet) but is ignored — grade is
  always calculated from grad year, never read from input.

## Migrations

`server/src/db/migrate.js` runs every `.sql` file in
`server/src/db/migrations/` that hasn't already been applied (tracked in an
`_migrations` table), in filename order. Add a new numbered file for future
schema changes — don't edit `001_init.sql` after it's shipped.
