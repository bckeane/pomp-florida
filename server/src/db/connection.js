import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'trip.db');

// Vitest sets process.env.VITEST unconditionally in every test worker,
// regardless of how the run was launched (npm test, a single file, an IDE
// test runner, a debugger) — unlike test/setup.js's DB_PATH override, which
// only takes effect if vitest.config.js's setupFiles actually ran for that
// invocation. Nearly every test file's beforeEach does broad DELETE FROMs
// against trips/participants/accounts/etc, so any path that reaches this
// module under Vitest without DB_PATH=':memory:' would silently wipe real
// data (this happened at least twice — see the accounts wipe incident and
// the broader trips/participants/faq_questions wipe recovered from backup
// on 2026-09-17). This is the second, launch-method-independent line of
// defense against that class of bug.
if (process.env.VITEST && dbPath !== ':memory:') {
  throw new Error(
    `Refusing to open ${dbPath} under Vitest — tests must run with DB_PATH=':memory:'. ` +
      `If this fired from a real test run, check that vitest.config.js's setupFiles (test/setup.js) is loading.`
  );
}

const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
