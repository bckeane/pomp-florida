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
  import/export. No auth yet (Phase 1), but this is the page a coach uses.
- **`/register`** — a plain self-serve registration form for parents/students
  to add themselves to the *current* trip. Same fields and validation as the
  admin "Add participant" form, but: labeled "Legal first/last name", role is
  a dropdown with nothing pre-selected (must be chosen explicitly), and it's
  a standalone page rather than a modal. Both forms share the same
  `ParticipantForm` component (`variant="admin"` vs `variant="public"`) so
  validation rules can't drift between them.

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
    models/
      participants.js      all SQL for the participants table, scoped by trip_id
      trips.js               trip year CRUD + "current trip" pointer
      settings.js           generic key/value settings (current_trip_id, etc.)
    routes/
      participants.js       CRUD + import/export routes
      stats.js               /api/stats
      trips.js                /api/trips
    index.js                Express app entry point
  seed/
    sample-roster.csv        sample data matching the spreadsheet's columns
    seed.js                   loads sample-roster.csv into the current trip
client/
  src/
    api/participants.js      fetch wrapper for the participants API
    api/trips.js               fetch wrapper for the trips API
    components/              RosterTable, ParticipantForm, ImportScreen, SummaryBar, TripSwitcher
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

| Method | Path | Notes |
|---|---|---|
| GET | `/participants` | `?trip_id=` (defaults to current trip), `?role=`, `?grad_year=`, `?active=`, `?q=`, `?sort=last_name\|grad_year\|age` |
| GET | `/participants/:id` | |
| POST | `/participants` | `?trip_id=` (defaults to current); zod-validated, rejects duplicate first+last+birth_date within that trip |
| PUT | `/participants/:id` | |
| DELETE | `/participants/:id` | soft delete (`active=0`); `?hard=true` for a real delete |
| POST | `/participants/import` | `?trip_id=`; body `{ csv: string }` or a JSON array; `?partial=true` to commit valid rows and skip invalid ones (default: all-or-nothing) |
| GET | `/participants/export` | `?trip_id=`; CSV download |
| GET | `/stats` | `?trip_id=`; counts by role, by grad year, total active |
| GET | `/trips` | all trip years, each flagged `is_current` |
| GET | `/trips/current` | the active trip |
| GET | `/trips/:id` | |
| POST | `/trips` | `{ year, name, trip_date }` — creates a new (empty) trip year |
| PUT | `/trips/:id` | update `name` / `trip_date` |
| POST | `/trips/:id/activate` | makes this trip the default for the routes above |

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
