import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';
import { createTrip } from '../src/models/trips.js';
import { createAccount, setAccountRole } from '../src/models/accounts.js';
import { createSession } from '../src/models/sessions.js';
import { listActiveCategories } from '../src/models/budget.js';
import budgetRouter from '../src/routes/budget.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', budgetRouter);
  return app;
}

function category(name) {
  return listActiveCategories().find((c) => c.name === name);
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
  const account = createAccount('admin-test@example.com', 'password123');
  setAccountRole(account.id, 'admin');
  const { token } = createSession(account.id);
  adminCookie = `session=${token}`;
});

describe('GET /api/budget', () => {
  it('401s when not signed in', async () => {
    const trip = createTrip({ year: '2070', name: 'Test', trip_date: '2070-01-01' });
    const res = await request(app).get(`/api/budget?trip_id=${trip.id}`);
    expect(res.status).toBe(401);
  });

  it('returns the trip line items for an admin', async () => {
    const trip = createTrip({ year: '2071', name: 'Test', trip_date: '2071-01-01' });
    const res = await request(app).get(`/api/budget?trip_id=${trip.id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('400s for an unknown trip_id', async () => {
    const res = await request(app).get('/api/budget?trip_id=999999').set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/budget/items', () => {
  it('400s on a negative total', async () => {
    const trip = createTrip({ year: '2072', name: 'Test', trip_date: '2072-01-01' });
    const airfare = category('Airfare');
    const res = await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: airfare.id, total: -10 });
    expect(res.status).toBe(400);
  });

  it('upserts a valid total', async () => {
    const trip = createTrip({ year: '2073', name: 'Test', trip_date: '2073-01-01' });
    const airfare = category('Airfare');
    const res = await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: airfare.id, total: 1500 });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1500);
  });
});

describe('POST /api/budget/categories', () => {
  it('400s on a duplicate name', async () => {
    const res = await request(app)
      .post('/api/budget/categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Airfare' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/budget/categories/:id/retire', () => {
  it('409s when the category is still referenced', async () => {
    const trip = createTrip({ year: '2074', name: 'Test', trip_date: '2074-01-01' });
    const airfare = category('Airfare');
    await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: airfare.id, total: 50 });

    const res = await request(app)
      .post(`/api/budget/categories/${airfare.id}/retire`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/budget/exclusions', () => {
  it('400s for an unknown trip_budget_item_id/participant_id pair', async () => {
    const res = await request(app)
      .post('/api/budget/exclusions')
      .set('Cookie', adminCookie)
      .send({ trip_budget_item_id: 999999, participant_id: 999999 });
    expect(res.status).toBe(400);
  });
});
