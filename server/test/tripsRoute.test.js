import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';
import { createAccount, setAccountRole } from '../src/models/accounts.js';
import { createSession } from '../src/models/sessions.js';
import tripsRouter from '../src/routes/trips.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', tripsRouter);
  return app;
}

let app;
let adminCookie;

beforeEach(() => {
  db.exec(`
    DELETE FROM trip_budget_exclusions;
    DELETE FROM trip_budget_items;
    DELETE FROM sessions;
    DELETE FROM accounts;
    DELETE FROM participants;
    DELETE FROM trips;
  `);
  app = buildApp();
  const account = createAccount('trips-admin@example.com', 'password123');
  setAccountRole(account.id, 'admin');
  const { token } = createSession(account.id);
  adminCookie = `session=${token}`;
});

describe('GET /api/trips/current', () => {
  it('is public — no auth required', async () => {
    const res = await request(app).get('/api/trips/current');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no current trip/i);
  });

  it('returns the active trip once one is created and activated', async () => {
    const created = await request(app)
      .post('/api/trips')
      .set('Cookie', adminCookie)
      .send({ year: '2090', name: 'Test Trip', trip_date: '2090-02-01' });
    await request(app).post(`/api/trips/${created.body.id}/activate`).set('Cookie', adminCookie);

    const res = await request(app).get('/api/trips/current');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });
});

describe('GET /api/trips', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).get('/api/trips');
    expect(res.status).toBe(401);
  });

  it('lists trips for an admin', async () => {
    await request(app)
      .post('/api/trips')
      .set('Cookie', adminCookie)
      .send({ year: '2091', name: 'Test Trip', trip_date: '2091-02-01' });

    const res = await request(app).get('/api/trips').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('POST /api/trips', () => {
  it('401s when not signed in', async () => {
    const res = await request(app)
      .post('/api/trips')
      .send({ year: '2092', name: 'Test Trip', trip_date: '2092-02-01' });
    expect(res.status).toBe(401);
  });

  it('rejects a missing required field', async () => {
    const res = await request(app)
      .post('/api/trips')
      .set('Cookie', adminCookie)
      .send({ year: '2093', trip_date: '2093-02-01' });
    expect(res.status).toBe(400);
    expect(res.body.errors.name).toBeDefined();
  });

  it('rejects a malformed trip_date', async () => {
    const res = await request(app)
      .post('/api/trips')
      .set('Cookie', adminCookie)
      .send({ year: '2094', name: 'Test Trip', trip_date: '02/01/2094' });
    expect(res.status).toBe(400);
    expect(res.body.errors.trip_date).toBeDefined();
  });

  it('creates a trip with optional detail fields blank by default', async () => {
    const res = await request(app)
      .post('/api/trips')
      .set('Cookie', adminCookie)
      .send({ year: '2095', name: 'Test Trip', trip_date: '2095-02-01' });
    expect(res.status).toBe(201);
    expect(res.body.estimated_cost).toBeNull();
    expect(res.body.deposit_amount).toBeNull();
    expect(res.body.training_location).toBeNull();
  });

  it('a blank optional int field saves as null, not 0', async () => {
    const res = await request(app)
      .post('/api/trips')
      .set('Cookie', adminCookie)
      .send({ year: '2096', name: 'Test Trip', trip_date: '2096-02-01', estimated_cost: '' });
    expect(res.status).toBe(201);
    expect(res.body.estimated_cost).toBeNull();
    expect(res.body.deposit_amount).toBeNull();
  });
});

describe('PUT /api/trips/:id', () => {
  it('404s for an unknown trip', async () => {
    const res = await request(app)
      .put('/api/trips/999999')
      .set('Cookie', adminCookie)
      .send({ name: 'New Name' });
    expect(res.status).toBe(404);
  });

  it('a partial update does not wipe out fields an earlier update set', async () => {
    // POST only accepts year/name/trip_date — detail fields always inherit
    // from the previous trip and are only settable via PUT afterward (see
    // trips.js createTrip's DETAIL_FIELDS comment). So establish
    // training_location with a first PUT, same as the real admin workflow.
    const created = await request(app)
      .post('/api/trips')
      .set('Cookie', adminCookie)
      .send({ year: '2097', name: 'Test Trip', trip_date: '2097-02-01' });
    await request(app)
      .put(`/api/trips/${created.body.id}`)
      .set('Cookie', adminCookie)
      .send({ training_location: 'ISHOF' });

    const res = await request(app)
      .put(`/api/trips/${created.body.id}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Renamed Trip' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Trip');
    expect(res.body.training_location).toBe('ISHOF');
  });

  it('POST does not accept detail fields directly — they inherit from the previous trip', async () => {
    const res = await request(app)
      .post('/api/trips')
      .set('Cookie', adminCookie)
      .send({ year: '2100', name: 'Test Trip', trip_date: '2100-02-01', training_location: 'Not Actually Set' });
    expect(res.status).toBe(201);
    expect(res.body.training_location).not.toBe('Not Actually Set');
  });
});

describe('POST /api/trips/:id/activate', () => {
  it('404s for an unknown trip', async () => {
    const res = await request(app).post('/api/trips/999999/activate').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('switches which trip GET /api/trips/current returns', async () => {
    const tripA = await request(app)
      .post('/api/trips')
      .set('Cookie', adminCookie)
      .send({ year: '2098', name: 'Trip A', trip_date: '2098-02-01' });
    const tripB = await request(app)
      .post('/api/trips')
      .set('Cookie', adminCookie)
      .send({ year: '2099', name: 'Trip B', trip_date: '2099-02-01' });

    // Creating a trip does not make it current on its own — activate does.
    await request(app).post(`/api/trips/${tripA.body.id}/activate`).set('Cookie', adminCookie);
    let current = await request(app).get('/api/trips/current');
    expect(current.body.id).toBe(tripA.body.id);

    await request(app).post(`/api/trips/${tripB.body.id}/activate`).set('Cookie', adminCookie);
    current = await request(app).get('/api/trips/current');
    expect(current.body.id).toBe(tripB.body.id);
  });
});
