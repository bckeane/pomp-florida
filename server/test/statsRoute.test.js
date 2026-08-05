import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';
import { createTrip, activateTrip } from '../src/models/trips.js';
import { createAccount, setAccountRole } from '../src/models/accounts.js';
import { createSession } from '../src/models/sessions.js';
import { createParticipant } from '../src/models/participants.js';
import statsRouter from '../src/routes/stats.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', statsRouter);
  return app;
}

let app;
let adminCookie;

beforeEach(() => {
  db.exec(`
    DELETE FROM trip_budget_exclusions;
    DELETE FROM trip_budget_items;
    DELETE FROM participants;
    DELETE FROM sessions;
    DELETE FROM accounts;
    DELETE FROM trips;
  `);
  app = buildApp();
  const account = createAccount('stats-admin@example.com', 'password123');
  setAccountRole(account.id, 'admin');
  const { token } = createSession(account.id);
  adminCookie = `session=${token}`;
});

describe('GET /api/stats', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(401);
  });

  it('400s when no current trip is set and no trip_id given', async () => {
    const res = await request(app).get('/api/stats').set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });

  it('400s for an unknown trip_id', async () => {
    const res = await request(app).get('/api/stats?trip_id=999999').set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });

  it('returns stats for the current trip when no trip_id given', async () => {
    const trip = createTrip({ year: '2120', name: 'Test Trip', trip_date: '2120-02-01' });
    activateTrip(trip.id);
    createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id, birth_date: '2010-01-01' });

    const res = await request(app).get('/api/stats').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.total_active).toBe(1);
  });

  it('returns stats for an explicit trip_id, ignoring which trip is current', async () => {
    const current = createTrip({ year: '2121', name: 'Current Trip', trip_date: '2121-02-01' });
    activateTrip(current.id);
    const other = createTrip({ year: '2122', name: 'Other Trip', trip_date: '2122-02-01' });
    createParticipant({ first_name: 'A', last_name: 'A', role: 'Diver', trip_id: other.id, birth_date: '2010-01-01' });

    const res = await request(app).get(`/api/stats?trip_id=${other.id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.total_active).toBe(1);
    expect(res.body.by_role.Diver).toBe(1);
  });
});
