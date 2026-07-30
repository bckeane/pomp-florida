import { db } from '../db/connection.js';
import { withDerived } from '../lib/derived.js';

const COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'grad_year',
  'birth_date',
  'role',
  'active',
  'trip_id',
  'created_at',
  'updated_at',
];

// Age and grade are always computed against the participant's OWN trip_id
// (date + year), not whichever trip is "current" — so browsing an archived
// year still shows historically-correct values even after the active trip
// changes.
const SELECT_WITH_TRIP_DATE = `
  SELECT participants.*, trips.trip_date AS _trip_date, trips.year AS _trip_year
  FROM participants
  JOIN trips ON trips.id = participants.trip_id
`;

function rowToParticipant(row) {
  const { _trip_date, _trip_year, ...participant } = row;
  return withDerived(participant, _trip_date, _trip_year);
}

export function listParticipants({ role, grad_year, active, q, sort, trip_id } = {}) {
  const clauses = ['participants.trip_id = ?'];
  const params = [trip_id];

  if (role) {
    clauses.push('participants.role = ?');
    params.push(role);
  }
  if (grad_year) {
    clauses.push('participants.grad_year = ?');
    params.push(grad_year);
  }
  if (active === '0' || active === false || active === 0) {
    clauses.push('participants.active = 0');
  } else if (active === '1' || active === true || active === 1) {
    clauses.push('participants.active = 1');
  }
  if (q) {
    clauses.push('(participants.first_name LIKE ? OR participants.last_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;
  const rows = db.prepare(`${SELECT_WITH_TRIP_DATE} ${where}`).all(...params);

  let participants = rows.map(rowToParticipant);

  const sortKey = { last_name: 'last_name', grad_year: 'grad_year', age: 'age_at_trip' }[sort];
  if (sortKey) {
    participants.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (av < bv) return -1;
      if (av > bv) return 1;
      return a.last_name.localeCompare(b.last_name);
    });
  } else {
    participants.sort((a, b) => a.last_name.localeCompare(b.last_name));
  }

  return participants;
}

export function getParticipantById(id) {
  const row = db.prepare(`${SELECT_WITH_TRIP_DATE} WHERE participants.id = ?`).get(id);
  if (!row) return null;
  return rowToParticipant(row);
}

// One row per distinct person this account has ever registered (across all
// trip years), most-recent first — lets the register page offer "add this
// returning person" instead of re-typing their details from scratch.
export function listParticipantHistory(accountId) {
  const rows = db
    .prepare('SELECT * FROM participants WHERE account_id = ? ORDER BY created_at DESC')
    .all(accountId);

  const seen = new Set();
  const distinct = [];
  for (const row of rows) {
    const key = `${row.first_name.toLowerCase()}|${row.last_name.toLowerCase()}|${row.birth_date ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(row);
  }
  return distinct;
}

export function findDuplicate({ first_name, last_name, birth_date, trip_id }, excludeId = null) {
  const params = [trip_id, first_name, last_name, birth_date ?? null];
  let sql = `SELECT id FROM participants WHERE trip_id = ? AND first_name = ? AND last_name = ? AND birth_date IS ?`;
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  return db.prepare(sql).get(...params);
}

export function createParticipant(data) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO participants
        (first_name, last_name, grad_year, birth_date, role, active, trip_id, account_id, created_at, updated_at)
       VALUES (@first_name, @last_name, @grad_year, @birth_date, @role, @active, @trip_id, @account_id, @created_at, @updated_at)`
    )
    .run({
      first_name: data.first_name,
      last_name: data.last_name,
      grad_year: data.grad_year ?? null,
      birth_date: data.birth_date ?? null,
      role: data.role,
      active: data.active === false ? 0 : 1,
      trip_id: data.trip_id,
      account_id: data.account_id ?? null,
      created_at: now,
      updated_at: now,
    });
  return getParticipantById(info.lastInsertRowid);
}

export function updateParticipant(id, data) {
  const existing = db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const merged = { ...existing, ...data, updated_at: now };

  db.prepare(
    `UPDATE participants SET
      first_name = @first_name,
      last_name = @last_name,
      grad_year = @grad_year,
      birth_date = @birth_date,
      role = @role,
      active = @active,
      trip_id = @trip_id,
      updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id,
    first_name: merged.first_name,
    last_name: merged.last_name,
    grad_year: merged.grad_year ?? null,
    birth_date: merged.birth_date ?? null,
    role: merged.role,
    active: merged.active === false || merged.active === 0 ? 0 : 1,
    trip_id: merged.trip_id,
    updated_at: now,
  });

  return getParticipantById(id);
}

export function softDeleteParticipant(id) {
  const now = new Date().toISOString();
  const info = db
    .prepare('UPDATE participants SET active = 0, updated_at = ? WHERE id = ?')
    .run(now, id);
  return info.changes > 0;
}

export function hardDeleteParticipant(id) {
  const info = db.prepare('DELETE FROM participants WHERE id = ?').run(id);
  return info.changes > 0;
}

export function insertParticipantsBulk(records, tripId) {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO participants
      (first_name, last_name, grad_year, birth_date, role, active, trip_id, created_at, updated_at)
     VALUES (@first_name, @last_name, @grad_year, @birth_date, @role, 1, @trip_id, @created_at, @updated_at)`
  );
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run({ ...row, trip_id: tripId, created_at: now, updated_at: now });
    }
  });
  insertMany(records);
}

export function getStats(tripId) {
  const rows = db.prepare('SELECT * FROM participants WHERE trip_id = ? AND active = 1').all(tripId);

  const byRole = { Swimmer: 0, Diver: 0, Adult: 0 };
  const byGradYear = {};

  for (const row of rows) {
    byRole[row.role] = (byRole[row.role] || 0) + 1;
    if (row.grad_year) {
      byGradYear[row.grad_year] = (byGradYear[row.grad_year] || 0) + 1;
    }
  }

  return {
    total_active: rows.length,
    by_role: byRole,
    by_grad_year: byGradYear,
  };
}

export { COLUMNS };
