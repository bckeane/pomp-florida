import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';
import { createTrip, activateTrip } from '../src/models/trips.js';
import { createAccount, setAccountRole } from '../src/models/accounts.js';
import { createSession } from '../src/models/sessions.js';
import participantsRouter from '../src/routes/participants.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', participantsRouter);
  return app;
}

let app;
let adminCookie;
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
  const account = createAccount('participants-admin@example.com', 'password123');
  setAccountRole(account.id, 'admin');
  const { token } = createSession(account.id);
  adminCookie = `session=${token}`;
  trip = createTrip({ year: '2110', name: 'Test Trip', trip_date: '2110-02-01' });
  activateTrip(trip.id);
});

function swimmer(overrides = {}) {
  return {
    first_name: 'Alex',
    last_name: 'Rivera',
    role: 'Swimmer',
    birth_date: '2010-01-01',
    ...overrides,
  };
}

describe('GET /api/participants', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).get('/api/participants');
    expect(res.status).toBe(401);
  });

  it('400s when no current trip is set and no trip_id given', async () => {
    db.exec('DELETE FROM trip_budget_items; DELETE FROM trips;');
    const res = await request(app).get('/api/participants').set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });

  it('400s for an unknown trip_id', async () => {
    const res = await request(app).get('/api/participants?trip_id=999999').set('Cookie', adminCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown trip_id/i);
  });

  it('lists participants for the current trip', async () => {
    await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    const res = await request(app).get('/api/participants').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('POST /api/participants', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).post('/api/participants').send(swimmer());
    expect(res.status).toBe(401);
  });

  it('rejects an invalid record (missing birth_date for a student)', async () => {
    const res = await request(app)
      .post('/api/participants')
      .set('Cookie', adminCookie)
      .send(swimmer({ birth_date: null }));
    expect(res.status).toBe(400);
    expect(res.body.errors.birth_date).toBeDefined();
  });

  it('creates a participant on the current trip', async () => {
    const res = await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    expect(res.status).toBe(201);
    expect(res.body.first_name).toBe('Alex');
    expect(res.body.trip_id).toBe(trip.id);
  });

  it('rejects a duplicate (same first/last name and birth date on the same trip)', async () => {
    await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    const res = await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    expect(res.status).toBe(400);
    expect(res.body.errors._root).toMatch(/already exists/i);
  });

  it('admin can set payment fields directly, unlike the public /my/participants route', async () => {
    const res = await request(app)
      .post('/api/participants')
      .set('Cookie', adminCookie)
      .send(swimmer({ deposit_received: 500 }));
    expect(res.status).toBe(201);
    expect(res.body.deposit_received).toBe(500);
  });
});

describe('GET /api/participants/:id', () => {
  it('404s for an unknown id', async () => {
    const res = await request(app).get('/api/participants/999999').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('returns a single participant', async () => {
    const created = await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    const res = await request(app).get(`/api/participants/${created.body.id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });
});

describe('PUT /api/participants/:id', () => {
  it('404s for an unknown id', async () => {
    const res = await request(app)
      .put('/api/participants/999999')
      .set('Cookie', adminCookie)
      .send({ first_name: 'New' });
    expect(res.status).toBe(404);
  });

  it('a partial update preserves fields not sent', async () => {
    const created = await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    const res = await request(app)
      .put(`/api/participants/${created.body.id}`)
      .set('Cookie', adminCookie)
      .send({ deposit_received: 750 });
    expect(res.status).toBe(200);
    expect(res.body.first_name).toBe('Alex');
    expect(res.body.deposit_received).toBe(750);
  });

  it('rejects renaming into a duplicate of another participant on the same trip', async () => {
    await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    const second = await request(app)
      .post('/api/participants')
      .set('Cookie', adminCookie)
      .send(swimmer({ first_name: 'Jordan' }));

    const res = await request(app)
      .put(`/api/participants/${second.body.id}`)
      .set('Cookie', adminCookie)
      .send({ first_name: 'Alex' });
    expect(res.status).toBe(400);
    expect(res.body.errors._root).toMatch(/already exists/i);
  });

  it('renaming a participant to its own existing name is not flagged as a duplicate of itself', async () => {
    const created = await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    const res = await request(app)
      .put(`/api/participants/${created.body.id}`)
      .set('Cookie', adminCookie)
      .send({ first_name: 'Alex' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/participants/:id', () => {
  it('404s for an unknown id', async () => {
    const res = await request(app).delete('/api/participants/999999').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('soft-deletes by default (active flips to false, row still exists)', async () => {
    const created = await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    const res = await request(app).delete(`/api/participants/${created.body.id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.hard).toBe(false);

    const stillThere = await request(app).get(`/api/participants/${created.body.id}`).set('Cookie', adminCookie);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.active).toBe(false);
  });

  it('hard-deletes when ?hard=true, removing the row entirely', async () => {
    const created = await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    const res = await request(app)
      .delete(`/api/participants/${created.body.id}?hard=true`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.hard).toBe(true);

    const gone = await request(app).get(`/api/participants/${created.body.id}`).set('Cookie', adminCookie);
    expect(gone.status).toBe(404);
  });
});

describe('GET /api/participants/export', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).get('/api/participants/export');
    expect(res.status).toBe(401);
  });

  it('returns a CSV with a header row and one row per participant', async () => {
    await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    const res = await request(app).get('/api/participants/export').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/first_name/);
  });
});

describe('POST /api/participants/import', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).post('/api/participants/import').send([swimmer()]);
    expect(res.status).toBe(401);
  });

  it('imports a JSON array of valid records', async () => {
    const res = await request(app)
      .post('/api/participants/import')
      .set('Cookie', adminCookie)
      .send([swimmer(), swimmer({ first_name: 'Jordan' })]);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.skipped).toBe(0);
  });

  it('rejects the whole batch by default when any row is invalid', async () => {
    const res = await request(app)
      .post('/api/participants/import')
      .set('Cookie', adminCookie)
      .send([swimmer(), swimmer({ first_name: 'Jordan', birth_date: null })]);
    expect(res.status).toBe(400);
    expect(res.body.imported).toBe(0);
    expect(res.body.errors).toHaveLength(1);
  });

  it('with ?partial=true, imports the valid rows and reports the invalid ones', async () => {
    const res = await request(app)
      .post('/api/participants/import?partial=true')
      .set('Cookie', adminCookie)
      .send([swimmer(), swimmer({ first_name: 'Jordan', birth_date: null })]);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toBe(1);
    expect(res.body.errors).toHaveLength(1);
  });

  it('flags two identical rows within the same batch as a duplicate of each other', async () => {
    const res = await request(app)
      .post('/api/participants/import?partial=true')
      .set('Cookie', adminCookie)
      .send([swimmer(), swimmer()]);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors[0].message).toMatch(/duplicate of another row/i);
  });

  it('flags a row that duplicates an existing DB participant', async () => {
    await request(app).post('/api/participants').set('Cookie', adminCookie).send(swimmer());
    const res = await request(app)
      .post('/api/participants/import?partial=true')
      .set('Cookie', adminCookie)
      .send([swimmer()]);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(0);
    expect(res.body.errors[0].message).toMatch(/duplicate of an existing participant/i);
  });

  it('accepts a { csv: string } body as an alternative to a JSON array', async () => {
    const csv = 'first_name,last_name,role,birth_date\nCasey,Nguyen,Swimmer,2011-03-15';
    const res = await request(app)
      .post('/api/participants/import')
      .set('Cookie', adminCookie)
      .send({ csv });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
  });

  it('400s when the body is neither an array nor a { csv } object', async () => {
    const res = await request(app)
      .post('/api/participants/import')
      .set('Cookie', adminCookie)
      .send({ notCsv: true });
    expect(res.status).toBe(400);
  });
});
