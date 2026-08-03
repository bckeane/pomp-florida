import { db } from '../db/connection.js';
import { getCurrentTrip, getTripById } from './trips.js';

function rowToQuestion(row) {
  return row;
}

function resolveTripId(tripId) {
  if (tripId !== undefined && tripId !== null && tripId !== '') {
    const id = Number(tripId);
    if (!Number.isInteger(id) || id <= 0) return null;
    return getTripById(id) ? id : null;
  }
  const current = getCurrentTrip();
  return current ? current.id : null;
}

export function getResolvedFaqTripId(tripId) {
  return resolveTripId(tripId);
}

export function listFaqQuestions(tripId) {
  const rows = db
    .prepare(
      `SELECT *
         FROM faq_questions
        WHERE trip_id = ?
        ORDER BY answer IS NOT NULL, created_at DESC, id DESC`
    )
    .all(tripId);
  return rows.map(rowToQuestion);
}

export function getFaqQuestionById(id) {
  return db.prepare('SELECT * FROM faq_questions WHERE id = ?').get(id) || null;
}

export function createFaqQuestion({ trip_id, asker_name, question }) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO faq_questions
        (trip_id, asker_name, question, answer, created_at, updated_at, answered_at)
       VALUES (@trip_id, @asker_name, @question, NULL, @created_at, @updated_at, NULL)`
    )
    .run({
      trip_id,
      asker_name: asker_name ?? null,
      question,
      created_at: now,
      updated_at: now,
    });
  return getFaqQuestionById(info.lastInsertRowid);
}

export function answerFaqQuestion(id, answer) {
  const existing = getFaqQuestionById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE faq_questions
        SET answer = ?, updated_at = ?, answered_at = ?
      WHERE id = ?`
  ).run(answer, now, now, id);
  return getFaqQuestionById(id);
}
