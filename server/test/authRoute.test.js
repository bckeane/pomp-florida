import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';

vi.mock('../src/lib/email.js', () => ({ sendPasswordResetEmail: vi.fn() }));

const { sendPasswordResetEmail } = await import('../src/lib/email.js');
const { createAccount, verifyAccountPassword } = await import('../src/models/accounts.js');
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
