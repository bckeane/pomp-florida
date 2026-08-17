import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';
import { createTrip, updateTrip } from '../src/models/trips.js';
import { createParticipant } from '../src/models/participants.js';
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

function addStudent(tripId) {
  return createParticipant({ first_name: 'S', last_name: 'Test', role: 'Swimmer', trip_id: tripId });
}

let app;
let adminCookie;

beforeEach(() => {
  db.exec(`
    DELETE FROM trip_budget_daily_items;
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

  it('updates a valid total on an existing (auto-seeded) row', async () => {
    const trip = createTrip({ year: '2073', name: 'Test', trip_date: '2073-01-01' });
    const airfare = category('Airfare');
    const res = await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: airfare.id, total: 1500 });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1500);
  });

  it('400s when both total and rate_per_athlete are provided', async () => {
    const trip = createTrip({ year: '2082', name: 'Test', trip_date: '2082-01-01' });
    const airfare = category('Airfare');
    const res = await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: airfare.id, total: 100, rate_per_athlete: 50 });
    expect(res.status).toBe(400);
  });

  it('400s when neither total nor rate_per_athlete is provided', async () => {
    const trip = createTrip({ year: '2083', name: 'Test', trip_date: '2083-01-01' });
    const airfare = category('Airfare');
    const res = await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: airfare.id });
    expect(res.status).toBe(400);
  });

  it("400s when total is sent for a 'per_swimmer' row", async () => {
    const trip = createTrip({ year: '2084', name: 'Test', trip_date: '2084-01-01' });
    const airfare = category('Airfare');
    const item = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);
    await request(app)
      .put(`/api/budget/items/${item.id}/type`)
      .set('Cookie', adminCookie)
      .send({ type: 'per_swimmer' });

    const res = await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: airfare.id, total: 100 });
    expect(res.status).toBe(400);
  });

  it('404s when no row exists yet for this trip/category', async () => {
    const trip = createTrip({ year: '2085', name: 'Test', trip_date: '2085-01-01' });
    const newCategory = await request(app)
      .post('/api/budget/categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Route-Test-Only Category' });
    const res = await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: newCategory.body.id, total: 100 });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/budget/items/attach', () => {
  it('creates a row for a category missing from this trip', async () => {
    const trip = createTrip({ year: '2086', name: 'Test', trip_date: '2086-01-01' });
    const newCategory = await request(app)
      .post('/api/budget/categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Attach-Test-Only Category' });

    const res = await request(app)
      .post('/api/budget/items/attach')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: newCategory.body.id });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('totals');
    expect(res.body.total).toBe(0);
  });

  it('400s for an unknown trip_id', async () => {
    const airfare = category('Airfare');
    const res = await request(app)
      .post('/api/budget/items/attach')
      .set('Cookie', adminCookie)
      .send({ trip_id: 999999, category_id: airfare.id });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/budget/items/:id/type', () => {
  it('switches a row to per_swimmer and clears total', async () => {
    const trip = createTrip({ year: '2087', name: 'Test', trip_date: '2087-01-01' });
    const airfare = category('Airfare');
    await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: airfare.id, total: 500 });
    const item = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);

    const res = await request(app)
      .put(`/api/budget/items/${item.id}/type`)
      .set('Cookie', adminCookie)
      .send({ type: 'per_swimmer' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('per_swimmer');
    expect(res.body.total).toBe(0);
    expect(res.body.rate_per_athlete).toBeNull();
  });

  it('404s for an unknown line item id', async () => {
    const res = await request(app)
      .put('/api/budget/items/999999/type')
      .set('Cookie', adminCookie)
      .send({ type: 'per_swimmer' });
    expect(res.status).toBe(404);
  });

  it('400s for an invalid type value', async () => {
    const trip = createTrip({ year: '2088', name: 'Test', trip_date: '2088-01-01' });
    const airfare = category('Airfare');
    const item = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);
    const res = await request(app)
      .put(`/api/budget/items/${item.id}/type`)
      .set('Cookie', adminCookie)
      .send({ type: 'bogus' });
    expect(res.status).toBe(400);
  });
});

describe('service_charge type via the route layer', () => {
  it('switches a row to service_charge, defaulting percent_rate to 2.9', async () => {
    const trip = createTrip({ year: '2092', name: 'Test', trip_date: '2092-01-01' });
    const airfare = category('Airfare');
    const item = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);

    const res = await request(app)
      .put(`/api/budget/items/${item.id}/type`)
      .set('Cookie', adminCookie)
      .send({ type: 'service_charge' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('service_charge');
    expect(res.body.percent_rate).toBe(2.9);
  });

  it('409s when a second service_charge row is switched on the same trip', async () => {
    const trip = createTrip({ year: '2093', name: 'Test', trip_date: '2093-01-01' });
    const airfare = category('Airfare');
    const hotel = category('Hotel');
    const airfareItem = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);
    const hotelItem = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, hotel.id);
    await request(app)
      .put(`/api/budget/items/${airfareItem.id}/type`)
      .set('Cookie', adminCookie)
      .send({ type: 'service_charge' });

    const res = await request(app)
      .put(`/api/budget/items/${hotelItem.id}/type`)
      .set('Cookie', adminCookie)
      .send({ type: 'service_charge' });
    expect(res.status).toBe(409);
  });

  it('updates percent_rate and reflects it in the computed total', async () => {
    const trip = createTrip({ year: '2094', name: 'Test', trip_date: '2094-01-01' });
    for (let i = 0; i < 10; i++) addStudent(trip.id);
    const airfare = category('Airfare');
    const hotel = category('Hotel');
    await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: hotel.id, total: 1000 });
    const item = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);
    await request(app)
      .put(`/api/budget/items/${item.id}/type`)
      .set('Cookie', adminCookie)
      .send({ type: 'service_charge' });

    const res = await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: airfare.id, percent_rate: 2.9 });
    expect(res.status).toBe(200);
    expect(res.body.percent_rate).toBe(2.9);

    const budget = await request(app).get(`/api/budget?trip_id=${trip.id}`).set('Cookie', adminCookie);
    const row = budget.body.find((i) => i.category_id === airfare.id);
    expect(row.total).toBe(Math.round(1000 * 0.029));
  });
});

describe('PUT /api/budget/items/:id/student-count-override', () => {
  it('overrides the # Students figure for that row', async () => {
    const trip = createTrip({ year: '2095', name: 'Test', trip_date: '2095-01-01' });
    for (let i = 0; i < 4; i++) addStudent(trip.id);
    const airfare = category('Airfare');
    await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: airfare.id, total: 400 });
    const item = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);

    const res = await request(app)
      .put(`/api/budget/items/${item.id}/student-count-override`)
      .set('Cookie', adminCookie)
      .send({ student_count_override: 8 });
    expect(res.status).toBe(200);
    expect(res.body.student_count_override).toBe(8);

    const budget = await request(app).get(`/api/budget?trip_id=${trip.id}`).set('Cookie', adminCookie);
    const row = budget.body.find((i) => i.category_id === airfare.id);
    expect(row.students).toBe(8);
    expect(row.total_per_panther).toBe(50);
  });

  it('clears the override when sent null', async () => {
    const trip = createTrip({ year: '2096', name: 'Test', trip_date: '2096-01-01' });
    for (let i = 0; i < 5; i++) addStudent(trip.id);
    const airfare = category('Airfare');
    const item = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);
    await request(app)
      .put(`/api/budget/items/${item.id}/student-count-override`)
      .set('Cookie', adminCookie)
      .send({ student_count_override: 20 });

    const res = await request(app)
      .put(`/api/budget/items/${item.id}/student-count-override`)
      .set('Cookie', adminCookie)
      .send({ student_count_override: null });
    expect(res.status).toBe(200);
    expect(res.body.student_count_override).toBeNull();

    const budget = await request(app).get(`/api/budget?trip_id=${trip.id}`).set('Cookie', adminCookie);
    expect(budget.body.find((i) => i.category_id === airfare.id).students).toBe(5);
  });

  it('400s on a negative override', async () => {
    const trip = createTrip({ year: '2097', name: 'Test', trip_date: '2097-01-01' });
    const airfare = category('Airfare');
    const item = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);
    const res = await request(app)
      .put(`/api/budget/items/${item.id}/student-count-override`)
      .set('Cookie', adminCookie)
      .send({ student_count_override: -3 });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown line item id', async () => {
    const res = await request(app)
      .put('/api/budget/items/999999/student-count-override')
      .set('Cookie', adminCookie)
      .send({ student_count_override: 5 });
    expect(res.status).toBe(404);
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
  it('succeeds even while a trip still references the category, and leaves that row alone', async () => {
    const trip = createTrip({ year: '2074', name: 'Test', trip_date: '2074-01-01' });
    // A freshly created category, not the shared 'Airfare' fixture — retiring
    // it must not leak into other tests in this file that rely on 'Airfare'
    // remaining active (budget_categories rows aren't reset in beforeEach).
    const fresh = await request(app)
      .post('/api/budget/categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Still-Referenced Route Test Category' });
    await request(app)
      .post('/api/budget/items/attach')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: fresh.body.id });
    await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: fresh.body.id, total: 50 });

    const res = await request(app)
      .post(`/api/budget/categories/${fresh.body.id}/retire`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.retired).toBe(1);

    const budget = await request(app).get(`/api/budget?trip_id=${trip.id}`).set('Cookie', adminCookie);
    expect(budget.body.find((i) => i.category_id === fresh.body.id).total).toBe(50);
  });
});

describe('POST /api/budget/categories/:id/unretire', () => {
  it('reverses a retire', async () => {
    const fresh = await request(app)
      .post('/api/budget/categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Restorable Route Test Category' });
    await request(app).post(`/api/budget/categories/${fresh.body.id}/retire`).set('Cookie', adminCookie);

    const res = await request(app)
      .post(`/api/budget/categories/${fresh.body.id}/unretire`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.retired).toBe(0);
  });
});

describe('DELETE /api/budget/items/:tripId/:categoryId', () => {
  it('removes a zero-value line item from this trip', async () => {
    const trip = createTrip({ year: '2089', name: 'Test', trip_date: '2089-01-01' });
    const airfare = category('Airfare');

    const res = await request(app)
      .delete(`/api/budget/items/${trip.id}/${airfare.id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(204);

    const budget = await request(app).get(`/api/budget?trip_id=${trip.id}`).set('Cookie', adminCookie);
    expect(budget.body.find((i) => i.category_id === airfare.id)).toBeUndefined();
  });

  it('409s when the row still has a nonzero total', async () => {
    const trip = createTrip({ year: '2090', name: 'Test', trip_date: '2090-01-01' });
    const airfare = category('Airfare');
    await request(app)
      .put('/api/budget/items')
      .set('Cookie', adminCookie)
      .send({ trip_id: trip.id, category_id: airfare.id, total: 75 });

    const res = await request(app)
      .delete(`/api/budget/items/${trip.id}/${airfare.id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(409);
  });

  it('404s when no line item exists for this trip/category', async () => {
    const trip = createTrip({ year: '2091', name: 'Test', trip_date: '2091-01-01' });
    const newCategory = await request(app)
      .post('/api/budget/categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Detach-Route-Test-Only Category' });

    const res = await request(app)
      .delete(`/api/budget/items/${trip.id}/${newCategory.body.id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
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

// Switches the trip's Food row to 'food_planner' via the route layer and
// returns its trip_budget_item id, for the daily-item route tests below.
async function foodPlannerItemId(tripId) {
  const food = category('Food');
  const item = db
    .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
    .get(tripId, food.id);
  await request(app).put(`/api/budget/items/${item.id}/type`).set('Cookie', adminCookie).send({ type: 'food_planner' });
  return item.id;
}

describe('food_planner day-by-day routes', () => {
  it('401s on every daily route when not signed in', async () => {
    const trip = createTrip({ year: '2118', name: 'Test', trip_date: '2118-01-01' });
    const itemId = await foodPlannerItemId(trip.id);
    expect((await request(app).get(`/api/budget/items/${itemId}/daily`)).status).toBe(401);
    expect((await request(app).post(`/api/budget/items/${itemId}/daily`).send({ date: '2027-02-12' })).status).toBe(401);
  });

  it('adds a day, lists it, and reflects it in the computed total', async () => {
    const trip = createTrip({ year: '2119', name: 'Test', trip_date: '2119-01-01' });
    for (let i = 0; i < 2; i++) addStudent(trip.id);
    const itemId = await foodPlannerItemId(trip.id);

    const addRes = await request(app)
      .post(`/api/budget/items/${itemId}/daily`)
      .set('Cookie', adminCookie)
      .send({ date: '2027-02-12', budget: 50, cash: 50, meals_covered: 'Lunch & Dinner' });
    expect(addRes.status).toBe(201);
    expect(addRes.body.budget).toBe(50);

    const listRes = await request(app).get(`/api/budget/items/${itemId}/daily`).set('Cookie', adminCookie);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    const budget = await request(app).get(`/api/budget?trip_id=${trip.id}`).set('Cookie', adminCookie);
    const food = category('Food');
    const row = budget.body.find((i) => i.category_id === food.id);
    expect(row.total_per_panther).toBe(50);
    expect(row.total).toBe(100);
  });

  it('400s when the row is not a food_planner row', async () => {
    const trip = createTrip({ year: '2120', name: 'Test', trip_date: '2120-01-01' });
    const airfare = category('Airfare');
    const item = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);
    const res = await request(app)
      .post(`/api/budget/items/${item.id}/daily`)
      .set('Cookie', adminCookie)
      .send({ date: '2027-02-12', budget: 50, cash: 50 });
    expect(res.status).toBe(400);
  });

  it('409s on a duplicate date', async () => {
    const trip = createTrip({ year: '2121', name: 'Test', trip_date: '2121-01-01' });
    const itemId = await foodPlannerItemId(trip.id);
    await request(app)
      .post(`/api/budget/items/${itemId}/daily`)
      .set('Cookie', adminCookie)
      .send({ date: '2027-02-12', budget: 50, cash: 50 });
    const res = await request(app)
      .post(`/api/budget/items/${itemId}/daily`)
      .set('Cookie', adminCookie)
      .send({ date: '2027-02-12', budget: 10, cash: 10 });
    expect(res.status).toBe(409);
  });

  it('404s for an unknown trip_budget_item id', async () => {
    const res = await request(app)
      .post('/api/budget/items/999999/daily')
      .set('Cookie', adminCookie)
      .send({ date: '2027-02-12', budget: 50, cash: 50 });
    expect(res.status).toBe(404);
  });

  it('PUT updates an existing day, DELETE removes it', async () => {
    const trip = createTrip({ year: '2122', name: 'Test', trip_date: '2122-01-01' });
    const itemId = await foodPlannerItemId(trip.id);
    const addRes = await request(app)
      .post(`/api/budget/items/${itemId}/daily`)
      .set('Cookie', adminCookie)
      .send({ date: '2027-02-12', budget: 50, cash: 50 });
    const dailyId = addRes.body.id;

    const putRes = await request(app)
      .put(`/api/budget/items/${itemId}/daily/${dailyId}`)
      .set('Cookie', adminCookie)
      .send({ budget: 75 });
    expect(putRes.status).toBe(200);
    expect(putRes.body.budget).toBe(75);

    const delRes = await request(app)
      .delete(`/api/budget/items/${itemId}/daily/${dailyId}`)
      .set('Cookie', adminCookie);
    expect(delRes.status).toBe(204);

    const listRes = await request(app).get(`/api/budget/items/${itemId}/daily`).set('Cookie', adminCookie);
    expect(listRes.body).toHaveLength(0);
  });

  it('404s when updating or deleting an unknown daily entry', async () => {
    const putRes = await request(app)
      .put('/api/budget/items/1/daily/999999')
      .set('Cookie', adminCookie)
      .send({ budget: 10 });
    expect(putRes.status).toBe(404);

    const delRes = await request(app).delete('/api/budget/items/1/daily/999999').set('Cookie', adminCookie);
    expect(delRes.status).toBe(404);
  });
});

describe('POST /api/budget/items/:id/daily/auto-create', () => {
  it('401s when not signed in', async () => {
    const trip = createTrip({ year: '2123', name: 'Test', trip_date: '2027-02-10' });
    const itemId = await foodPlannerItemId(trip.id);
    const res = await request(app).post(`/api/budget/items/${itemId}/daily/auto-create`);
    expect(res.status).toBe(401);
  });

  it('creates a day for every date in the trip range', async () => {
    const trip = createTrip({ year: '2124', name: 'Test', trip_date: '2027-02-10' });
    updateTrip(trip.id, { return_date: '2027-02-12' });
    const itemId = await foodPlannerItemId(trip.id);

    const res = await request(app).post(`/api/budget/items/${itemId}/daily/auto-create`).set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.map((d) => d.date)).toEqual(['2027-02-10', '2027-02-11', '2027-02-12']);
    expect(res.body.every((d) => d.budget === 0)).toBe(true);
  });

  it('400s when the trip is missing a return date', async () => {
    const trip = createTrip({ year: '2125', name: 'Test', trip_date: '2027-02-10' });
    const itemId = await foodPlannerItemId(trip.id);
    const res = await request(app).post(`/api/budget/items/${itemId}/daily/auto-create`).set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });

  it('400s when the row is not a food_planner row', async () => {
    const trip = createTrip({ year: '2126', name: 'Test', trip_date: '2027-02-10' });
    updateTrip(trip.id, { return_date: '2027-02-12' });
    const airfare = category('Airfare');
    const item = db
      .prepare('SELECT * FROM trip_budget_items WHERE trip_id = ? AND category_id = ?')
      .get(trip.id, airfare.id);
    const res = await request(app)
      .post(`/api/budget/items/${item.id}/daily/auto-create`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });

  it('404s for an unknown trip_budget_item id', async () => {
    const res = await request(app)
      .post('/api/budget/items/999999/daily/auto-create')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });
});
