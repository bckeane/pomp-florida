import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';
import { createAccount, setAccountRole, findAccountByEmail } from '../src/models/accounts.js';
import { createSession } from '../src/models/sessions.js';
import adminAccountsRouter from '../src/routes/adminAccounts.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', adminAccountsRouter);
  return app;
}

let app;
let adminCookie;

beforeEach(() => {
  db.exec('DELETE FROM sessions; DELETE FROM accounts;');
  app = buildApp();
  const account = createAccount('root-admin@example.com', 'password123');
  setAccountRole(account.id, 'admin');
  const { token } = createSession(account.id);
  adminCookie = `session=${token}`;
});

describe('GET /api/admin/accounts', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).get('/api/admin/accounts');
    expect(res.status).toBe(401);
  });

  it('lists admin accounts, excluding non-admin accounts', async () => {
    createAccount('just-a-parent@example.com', 'password123');
    const res = await request(app).get('/api/admin/accounts').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.map((a) => a.email)).toEqual(['root-admin@example.com']);
  });
});

describe('POST /api/admin/accounts', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).post('/api/admin/accounts').send({ email: 'new-admin@example.com' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid email', async () => {
    const res = await request(app)
      .post('/api/admin/accounts')
      .set('Cookie', adminCookie)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.errors.email).toBeDefined();
  });

  it('promotes an existing account to admin without needing a password', async () => {
    createAccount('existing-parent@example.com', 'password123');
    const res = await request(app)
      .post('/api/admin/accounts')
      .set('Cookie', adminCookie)
      .send({ email: 'existing-parent@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.promoted).toBe(true);
    expect(res.body.account.role).toBe('admin');
  });

  it('requires a password when creating a brand-new account', async () => {
    const res = await request(app)
      .post('/api/admin/accounts')
      .set('Cookie', adminCookie)
      .send({ email: 'brand-new@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.errors.password).toBeDefined();
  });

  it('creates and promotes a new account when a password is given', async () => {
    const res = await request(app)
      .post('/api/admin/accounts')
      .set('Cookie', adminCookie)
      .send({ email: 'brand-new2@example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.promoted).toBe(false);
    expect(res.body.account.role).toBe('admin');

    const stored = findAccountByEmail('brand-new2@example.com');
    expect(stored).not.toBeNull();
  });
});
