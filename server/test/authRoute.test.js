import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';

vi.mock('../src/lib/email.js', () => ({
  sendPasswordResetEmail: vi.fn(),
  resetUrlFor: (token) => `http://localhost/reset-password?token=${token}`,
}));

const { sendPasswordResetEmail } = await import('../src/lib/email.js');
const { createAccount, verifyAccountPassword, getAccountById } = await import('../src/models/accounts.js');
const { createSession } = await import('../src/models/sessions.js');
const authRouter = (await import('../src/routes/auth.js')).default;

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', authRouter);
  return app;
}

function tokenFromResetUrl() {
  const url = new URL(sendPasswordResetEmail.mock.calls.at(-1)[1]);
  return url.searchParams.get('token');
}

let app;

beforeEach(() => {
  db.exec('DELETE FROM password_reset_tokens; DELETE FROM sessions; DELETE FROM accounts;');
  app = buildApp();
  sendPasswordResetEmail.mockClear();
});

describe('POST /api/auth/login', () => {
  // The limiter's counter is keyed by IP and lives on the shared authRouter
  // module, so it persists across requests in this test — that's why it's
  // one continuous scenario rather than separate tests.
  it('allows a successful login without counting it, then blocks after 10 failed attempts', async () => {
    const email = 'bruteforce@example.com';
    createAccount(email, 'correctpassword1');

    for (let i = 0; i < 9; i++) {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'wrongpassword' });
      expect(res.status).toBe(401);
    }

    // Successful requests are excluded from the count (skipSuccessfulRequests),
    // so this doesn't move the counter — the 9 failed attempts above still stand.
    const ok = await request(app).post('/api/auth/login').send({ email, password: 'correctpassword1' });
    expect(ok.status).toBe(200);

    // 10th counted (failed) request — still within the limit.
    const tenth = await request(app).post('/api/auth/login').send({ email, password: 'wrongpassword' });
    expect(tenth.status).toBe(401);

    // 11th counted request exceeds the limit of 10.
    const blocked = await request(app).post('/api/auth/login').send({ email, password: 'wrongpassword' });
    expect(blocked.status).toBe(429);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('sends a reset email when the account exists', async () => {
    createAccount('forgot@example.com', 'password123');
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'forgot@example.com' });
    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail.mock.calls[0][0]).toBe('forgot@example.com');
  });

  it('responds the same way for an unknown email, without sending anything', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/reset-password', () => {
  it('resets the password, logs the user in, and revokes old sessions', async () => {
    const account = createAccount('reset@example.com', 'oldpassword1');
    const { token: oldSessionToken } = createSession(account.id);

    await request(app).post('/api/auth/forgot-password').send({ email: 'reset@example.com' });
    const resetToken = tokenFromResetUrl();

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'newpassword1' });

    expect(res.status).toBe(200);
    expect(res.body.account.email).toBe('reset@example.com');
    expect(res.headers['set-cookie']).toBeDefined();

    expect(verifyAccountPassword('reset@example.com', 'oldpassword1')).toBeNull();
    expect(verifyAccountPassword('reset@example.com', 'newpassword1')).not.toBeNull();

    const remainingSessions = db.prepare('SELECT * FROM sessions WHERE token = ?').get(oldSessionToken);
    expect(remainingSessions).toBeUndefined();
  });

  it('rejects a reused token', async () => {
    const account = createAccount('reuse@example.com', 'password123');
    await request(app).post('/api/auth/forgot-password').send({ email: 'reuse@example.com' });
    const resetToken = tokenFromResetUrl();

    await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'newpassword1' });
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'anotherpassword' });

    expect(res.status).toBe(400);
    void account;
  });

  it('rejects an unknown token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'bogus', password: 'newpassword1' });
    expect(res.status).toBe(400);
  });

  it('rejects a too-short password', async () => {
    createAccount('short@example.com', 'password123');
    await request(app).post('/api/auth/forgot-password').send({ email: 'short@example.com' });
    const resetToken = tokenFromResetUrl();

    const res = await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/auth/profile', () => {
  it('requires a signed-in account', async () => {
    const res = await request(app)
      .patch('/api/auth/profile')
      .send({ parent_name: 'Jamie Rivera', emergency_phone: '555-123-4567' });
    expect(res.status).toBe(401);
  });

  it('rejects a blank name or phone', async () => {
    const account = createAccount('profileroute@example.com', 'password123');
    const { token } = createSession(account.id);
    const cookie = `session=${token}`;

    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Cookie', cookie)
      .send({ parent_name: '', emergency_phone: '' });
    expect(res.status).toBe(400);
    expect(res.body.errors.parent_name).toBeDefined();
    expect(res.body.errors.emergency_phone).toBeDefined();
  });

  it('sets parent_name and emergency_phone and returns them on the account', async () => {
    const account = createAccount('profileroute2@example.com', 'password123');
    const { token } = createSession(account.id);
    const cookie = `session=${token}`;

    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Cookie', cookie)
      .send({ parent_name: 'Jamie Rivera', emergency_phone: '555-123-4567' });

    expect(res.status).toBe(200);
    expect(res.body.account.parent_name).toBe('Jamie Rivera');
    expect(res.body.account.emergency_phone).toBe('555-123-4567');

    const reloaded = getAccountById(account.id);
    expect(reloaded.parent_name).toBe('Jamie Rivera');
  });
});
