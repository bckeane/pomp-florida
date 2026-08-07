import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';
import { createAccount, setAccountRole, findAccountByEmail } from '../src/models/accounts.js';
import { createSession } from '../src/models/sessions.js';
import { createTrip } from '../src/models/trips.js';
import { createParticipant } from '../src/models/participants.js';

vi.mock('../src/lib/email.js', () => ({
  sendPasswordResetEmail: vi.fn(),
  resetUrlFor: (token) => `http://localhost/reset-password?token=${token}`,
}));

const { sendPasswordResetEmail } = await import('../src/lib/email.js');
const adminAccountsRouter = (await import('../src/routes/adminAccounts.js')).default;

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
  db.exec('DELETE FROM password_reset_tokens; DELETE FROM sessions; DELETE FROM accounts;');
  app = buildApp();
  const account = createAccount('root-admin@example.com', 'password123');
  setAccountRole(account.id, 'admin');
  const { token } = createSession(account.id);
  adminCookie = `session=${token}`;
  sendPasswordResetEmail.mockClear();
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

describe('POST /api/admin/accounts/:id/reset-password', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).post('/api/admin/accounts/1/reset-password');
    expect(res.status).toBe(401);
  });

  it('404s for an unknown id', async () => {
    const res = await request(app).post('/api/admin/accounts/999999/reset-password').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('sends a reset email for the target account', async () => {
    const target = createAccount('reset-target@example.com', 'password123');
    const res = await request(app)
      .post(`/api/admin/accounts/${target.id}/reset-password`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail.mock.calls[0][0]).toBe('reset-target@example.com');
  });

  it('403s on resetting the break-glass account', async () => {
    process.env.BREAK_GLASS_EMAIL = 'break-glass@example.com';
    try {
      const bgAccount = createAccount('break-glass@example.com', 'password123');
      const res = await request(app)
        .post(`/api/admin/accounts/${bgAccount.id}/reset-password`)
        .set('Cookie', adminCookie);
      expect(res.status).toBe(403);
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    } finally {
      delete process.env.BREAK_GLASS_EMAIL;
    }
  });

  it('502s and reports an error when the email fails to send', async () => {
    sendPasswordResetEmail.mockRejectedValueOnce(new Error('send failed'));
    const target = createAccount('reset-fail@example.com', 'password123');
    const res = await request(app)
      .post(`/api/admin/accounts/${target.id}/reset-password`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(502);
    expect(res.body.error).toBeDefined();
  });
});

describe('DELETE /api/admin/accounts/:id', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).delete('/api/admin/accounts/1');
    expect(res.status).toBe(401);
  });

  it('404s for an unknown id', async () => {
    const res = await request(app).delete('/api/admin/accounts/999999').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('403s on self-deletion', async () => {
    const self = findAccountByEmail('root-admin@example.com');
    const res = await request(app).delete(`/api/admin/accounts/${self.id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(403);
    expect(findAccountByEmail('root-admin@example.com')).not.toBeNull();
  });

  it('403s on deleting the break-glass account', async () => {
    process.env.BREAK_GLASS_EMAIL = 'break-glass@example.com';
    try {
      const bgAccount = createAccount('break-glass@example.com', 'password123');
      const res = await request(app).delete(`/api/admin/accounts/${bgAccount.id}`).set('Cookie', adminCookie);
      expect(res.status).toBe(403);
    } finally {
      delete process.env.BREAK_GLASS_EMAIL;
    }
  });

  it('deletes an account with no participants', async () => {
    const target = createAccount('delete-me@example.com', 'password123');
    const res = await request(app).delete(`/api/admin/accounts/${target.id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(204);
    expect(findAccountByEmail('delete-me@example.com')).toBeNull();
  });

  it('409s and does not delete when the account has participants', async () => {
    const target = createAccount('has-swimmer@example.com', 'password123');
    const trip = createTrip({ year: '2099', name: 'Test Trip', trip_date: '2099-01-01' });
    createParticipant({ first_name: 'Kid', last_name: 'Swimmer', role: 'Swimmer', trip_id: trip.id, account_id: target.id });

    const res = await request(app).delete(`/api/admin/accounts/${target.id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(409);
    expect(findAccountByEmail('has-swimmer@example.com')).not.toBeNull();
  });
});
