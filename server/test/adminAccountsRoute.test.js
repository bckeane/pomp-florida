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

describe('GET /api/admin/accounts/all', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).get('/api/admin/accounts/all');
    expect(res.status).toBe(401);
  });

  it('lists every account regardless of role', async () => {
    createAccount('a-parent@example.com', 'password123');
    const res = await request(app).get('/api/admin/accounts/all').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.map((a) => a.email).sort()).toEqual(
      ['a-parent@example.com', 'root-admin@example.com'].sort()
    );
  });

  it('includes parent_name/emergency_phone fields, null when unset', async () => {
    createAccount('no-profile@example.com', 'password123');
    const res = await request(app).get('/api/admin/accounts/all').set('Cookie', adminCookie);
    const row = res.body.find((a) => a.email === 'no-profile@example.com');
    expect(row.parent_name).toBeNull();
    expect(row.emergency_phone).toBeNull();
  });
});

describe('POST /api/admin/accounts/:id/role', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).post('/api/admin/accounts/1/role').send({ role: 'admin' });
    expect(res.status).toBe(401);
  });

  it('404s for an unknown id', async () => {
    const res = await request(app)
      .post('/api/admin/accounts/999999/role')
      .set('Cookie', adminCookie)
      .send({ role: 'admin' });
    expect(res.status).toBe(404);
  });

  it('rejects a role outside the enum', async () => {
    const parent = createAccount('to-promote@example.com', 'password123');
    const res = await request(app)
      .post(`/api/admin/accounts/${parent.id}/role`)
      .set('Cookie', adminCookie)
      .send({ role: 'superadmin' });
    expect(res.status).toBe(400);
  });

  it('403s on self-demotion', async () => {
    const self = findAccountByEmail('root-admin@example.com');
    const res = await request(app)
      .post(`/api/admin/accounts/${self.id}/role`)
      .set('Cookie', adminCookie)
      .send({ role: 'parent' });
    expect(res.status).toBe(403);

    const stillAdmin = findAccountByEmail('root-admin@example.com');
    expect(stillAdmin.role).toBe('admin');
  });

  it('403s on demoting the break-glass account', async () => {
    process.env.BREAK_GLASS_EMAIL = 'break-glass@example.com';
    try {
      const bgAccount = createAccount('break-glass@example.com', 'password123');
      setAccountRole(bgAccount.id, 'admin');
      const res = await request(app)
        .post(`/api/admin/accounts/${bgAccount.id}/role`)
        .set('Cookie', adminCookie)
        .send({ role: 'parent' });
      expect(res.status).toBe(403);
    } finally {
      delete process.env.BREAK_GLASS_EMAIL;
    }
  });

  it('promotes a parent to admin', async () => {
    const parent = createAccount('promote-me@example.com', 'password123');
    const res = await request(app)
      .post(`/api/admin/accounts/${parent.id}/role`)
      .set('Cookie', adminCookie)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.account.role).toBe('admin');
  });

  it('demotes an admin to parent', async () => {
    const other = createAccount('demote-me@example.com', 'password123');
    setAccountRole(other.id, 'admin');
    const res = await request(app)
      .post(`/api/admin/accounts/${other.id}/role`)
      .set('Cookie', adminCookie)
      .send({ role: 'parent' });
    expect(res.status).toBe(200);
    expect(res.body.account.role).toBe('parent');
  });
});
