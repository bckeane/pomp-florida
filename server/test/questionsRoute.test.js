import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';
import { createTrip, activateTrip } from '../src/models/trips.js';
import { createAccount, setAccountRole } from '../src/models/accounts.js';
import { createSession } from '../src/models/sessions.js';
import questionsRouter from '../src/routes/questions.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', questionsRouter);
  return app;
}

let app;
let adminCookie;

beforeEach(() => {
  db.exec(`
    DELETE FROM trip_budget_exclusions;
    DELETE FROM trip_budget_items;
    DELETE FROM faq_questions;
    DELETE FROM participants;
    DELETE FROM sessions;
    DELETE FROM accounts;
    DELETE FROM trips;
  `);
  app = buildApp();
  const account = createAccount('admin-test@example.com', 'password123');
  setAccountRole(account.id, 'admin');
  const { token } = createSession(account.id);
  adminCookie = `session=${token}`;
});

describe('GET /api/faq', () => {
  it('returns an empty list when there are no questions yet', async () => {
    const trip = createTrip({ year: '2070', name: 'Test', trip_date: '2070-01-01' });
    activateTrip(trip.id);
    const res = await request(app).get('/api/faq');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/faq', () => {
  it('creates a pending question for the current trip', async () => {
    const trip = createTrip({ year: '2071', name: 'Test', trip_date: '2071-01-01' });
    activateTrip(trip.id);
    const res = await request(app).post('/api/faq').send({ question: 'What should I pack?' });
    expect(res.status).toBe(201);
    expect(res.body.question).toBe('What should I pack?');
    expect(res.body.answer).toBeNull();

    const list = await request(app).get('/api/faq');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].question).toBe('What should I pack?');
  });
});

describe('PATCH /api/admin/questions/:id', () => {
  it('lets an admin answer a pending question', async () => {
    const trip = createTrip({ year: '2072', name: 'Test', trip_date: '2072-01-01' });
    activateTrip(trip.id);
    const created = await request(app).post('/api/faq').send({ question: 'When do we leave?' });

    const res = await request(app)
      .patch(`/api/admin/questions/${created.body.id}`)
      .set('Cookie', adminCookie)
      .send({ answer: 'Departure details will be sent next week.' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('Departure details will be sent next week.');
    expect(res.body.answered_at).toBeTruthy();
  });

  it('401s when not signed in as admin', async () => {
    const trip = createTrip({ year: '2073', name: 'Test', trip_date: '2073-01-01' });
    activateTrip(trip.id);
    const created = await request(app).post('/api/faq').send({ question: 'Is food included?' });

    const res = await request(app)
      .patch(`/api/admin/questions/${created.body.id}`)
      .send({ answer: 'Yes.' });

    expect(res.status).toBe(401);
  });
});
