import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';
import { createAccount, setAccountRole } from '../src/models/accounts.js';
import { createSession } from '../src/models/sessions.js';
import { logRequest } from '../src/models/requestLog.js';
import adminTrafficRouter from '../src/routes/adminTraffic.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', adminTrafficRouter);
  return app;
}

let app;
let adminCookie;

beforeEach(() => {
  db.exec('DELETE FROM request_log; DELETE FROM sessions; DELETE FROM accounts;');
  app = buildApp();
  const account = createAccount('traffic-admin@example.com', 'password123');
  setAccountRole(account.id, 'admin');
  const { token } = createSession(account.id);
  adminCookie = `session=${token}`;
});

describe('GET /api/admin/traffic', () => {
  it('401s when not signed in', async () => {
    const res = await request(app).get('/api/admin/traffic');
    expect(res.status).toBe(401);
  });

  it('403s for a non-admin account', async () => {
    const parent = createAccount('parent@example.com', 'password123');
    const { token } = createSession(parent.id);
    const res = await request(app).get('/api/admin/traffic').set('Cookie', `session=${token}`);
    expect(res.status).toBe(403);
  });

  it('summarizes logged requests for an admin', async () => {
    logRequest({ method: 'GET', path: '/api/stats', status: 200, durationMs: 12, accountId: null });
    logRequest({ method: 'GET', path: '/api/stats', status: 200, durationMs: 8, accountId: null });
    logRequest({ method: 'GET', path: '/api/trips', status: 200, durationMs: 5, accountId: null });

    const res = await request(app).get('/api/admin/traffic').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.total_requests).toBe(3);
    expect(res.body.top_paths[0]).toMatchObject({ method: 'GET', path: '/api/stats', count: 2 });
    expect(res.body.daily_counts.length).toBeGreaterThan(0);
  });

  it('excludes requests older than the requested window', async () => {
    const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      'INSERT INTO request_log (method, path, status, duration_ms, account_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('GET', '/api/old', 200, 1, null, old);
    logRequest({ method: 'GET', path: '/api/new', status: 200, durationMs: 1, accountId: null });

    const res = await request(app).get('/api/admin/traffic?days=30').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.total_requests).toBe(1);
    expect(res.body.top_paths[0].path).toBe('/api/new');
  });
});
