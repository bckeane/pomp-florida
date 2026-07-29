import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../src/db/migrate.js';
import { db } from '../src/db/connection.js';
import { parseCSV } from '../src/lib/csv.js';
import { mapImportRecord } from '../src/lib/importMapping.js';
import { validateParticipant } from '../src/lib/validation.js';
import { insertParticipantsBulk } from '../src/models/participants.js';
import { getCurrentTrip } from '../src/models/trips.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

runMigrations();

const trip = getCurrentTrip();
if (!trip) {
  throw new Error('No current trip found — migrations should have created one.');
}

const csvPath = path.join(__dirname, 'sample-roster.csv');
const csvText = fs.readFileSync(csvPath, 'utf-8');
const records = parseCSV(csvText);

db.prepare('DELETE FROM participants WHERE trip_id = ?').run(trip.id);

const rows = [];
for (const raw of records) {
  const mapped = mapImportRecord(raw);
  const { data, errors } = validateParticipant(mapped, trip.year);
  if (errors.length) {
    console.warn(`Skipping row (${mapped.first_name} ${mapped.last_name}):`, errors);
    continue;
  }
  rows.push(data);
}

insertParticipantsBulk(rows, trip.id);
console.log(`Seeded ${rows.length} participants into "${trip.name}" (${trip.year}) from sample-roster.csv`);
