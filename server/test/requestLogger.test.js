import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { db } from '../src/db/connection.js';
import { requestLogger } from '../src/middleware/requestLog.js';

function buildApp() {
  const app = express();
  app.use(requestLogger);
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  app.get('/assets/app.a1b2c3.js', (req, res) => res.send('// js'));
  return app;
}

let app;

beforeEach(() => {
  db.exec('DELETE FROM request_log;');
  app = buildApp();
});

describe('requestLogger', () => {
  it('logs a request after the response finishes', async () => {
    await request(app).get('/api/ping');
    await new Promise((resolve) => setImmediate(resolve));

    const rows = db.prepare('SELECT * FROM request_log').all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: 'GET', path: '/api/ping', status: 200 });
  });

  it('skips requests for static assets', async () => {
    await request(app).get('/assets/app.a1b2c3.js');
    await new Promise((resolve) => setImmediate(resolve));

    const rows = db.prepare('SELECT * FROM request_log').all();
    expect(rows).toHaveLength(0);
  });
});
