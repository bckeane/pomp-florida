import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';
import { createTrip, activateTrip } from '../src/models/trips.js';
import { createAccount } from '../src/models/accounts.js';
import { createSession } from '../src/models/sessions.js';
import myParticipantsRouter from '../src/routes/myParticipants.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', myParticipantsRouter);
  return app;
}

let app;
let cookie;
let trip;

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
  const account = createAccount('parent-test@example.com', 'password123');
  const { token } = createSession(account.id);
  cookie = `session=${token}`;
  trip = createTrip({ year: '2080', name: 'Test', trip_date: '2080-01-01' });
  activateTrip(trip.id);
});

describe('POST /api/my/participants', () => {
  it('401s when not signed in', async () => {
    const res = await request(app)
      .post('/api/my/participants')
      .send({ first_name: 'A', last_name: 'B', role: 'Swimmer', birth_date: '2010-01-01' });
    expect(res.status).toBe(401);
  });

  it('accepts has_allergy_medication and returns it on the created participant', async () => {
    const res = await request(app)
      .post('/api/my/participants')
      .set('Cookie', cookie)
      .send({
        first_name: 'A',
        last_name: 'B',
        role: 'Swimmer',
        birth_date: '2010-01-01',
        has_allergy_medication: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.has_allergy_medication).toBe(true);
  });

  it('defaults has_allergy_medication to null when omitted', async () => {
    const res = await request(app)
      .post('/api/my/participants')
      .set('Cookie', cookie)
      .send({ first_name: 'A', last_name: 'C', role: 'Swimmer', birth_date: '2010-01-01' });
    expect(res.status).toBe(201);
    expect(res.body.has_allergy_medication).toBeNull();
  });

  it('still strips self-reported payment fields regardless of the allergy field', async () => {
    const res = await request(app)
      .post('/api/my/participants')
      .set('Cookie', cookie)
      .send({
        first_name: 'A',
        last_name: 'D',
        role: 'Swimmer',
        birth_date: '2010-01-01',
        has_allergy_medication: false,
        deposit_received: 9999,
      });
    expect(res.status).toBe(201);
    expect(res.body.deposit_received).toBe(0);
    expect(res.body.has_allergy_medication).toBe(false);
  });
});

describe('GET /api/my/participants', () => {
  it('includes deposit/balance and allergy fields for the account-home screen', async () => {
    await request(app)
      .post('/api/my/participants')
      .set('Cookie', cookie)
      .send({ first_name: 'A', last_name: 'E', role: 'Swimmer', birth_date: '2010-01-01' });

    const res = await request(app).get('/api/my/participants').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('deposit_received');
    expect(res.body[0]).toHaveProperty('deposit_balance');
    expect(res.body[0]).toHaveProperty('has_allergy_medication', null);
  });
});
