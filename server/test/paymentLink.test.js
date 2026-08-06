import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';

vi.mock('../src/services/stripe.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createCheckoutSession: vi.fn() };
});

const { createCheckoutSession, toCents } = await import('../src/services/stripe.js');
const { createTrip, updateTrip } = await import('../src/models/trips.js');
const { createParticipant, updateParticipant } = await import('../src/models/participants.js');
const { createAccount, setAccountRole } = await import('../src/models/accounts.js');
const { createSession } = await import('../src/models/sessions.js');
const participantsRouter = (await import('../src/routes/participants.js')).default;

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', participantsRouter);
  return app;
}

let app;
let adminCookie;

beforeEach(() => {
  db.exec(`
    DELETE FROM trip_budget_items;
    DELETE FROM sessions;
    DELETE FROM accounts;
    DELETE FROM participants;
    DELETE FROM trips;
  `);
  app = buildApp();
  const account = createAccount('admin-payment-link@example.com', 'password123');
  setAccountRole(account.id, 'admin');
  const { token } = createSession(account.id);
  adminCookie = `session=${token}`;
  createCheckoutSession.mockReset();
});

describe('POST /api/participants/:id/payment-link', () => {
  it('401s when not signed in', async () => {
    const trip = createTrip({ year: '2060', name: 'Test', trip_date: '2060-01-01' });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    const res = await request(app).post(`/api/participants/${p.id}/payment-link`).send({ installment: 'deposit' });
    expect(res.status).toBe(401);
  });

  it('404s for an unknown participant', async () => {
    const res = await request(app)
      .post('/api/participants/999999/payment-link')
      .set('Cookie', adminCookie)
      .send({ installment: 'deposit' });
    expect(res.status).toBe(404);
  });

  it("400s when installment isn't deposit or final", async () => {
    const trip = createTrip({ year: '2061', name: 'Test', trip_date: '2061-01-01' });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    const res = await request(app)
      .post(`/api/participants/${p.id}/payment-link`)
      .set('Cookie', adminCookie)
      .send({ installment: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('400s when the trip has no estimated cost set', async () => {
    const trip = createTrip({ year: '2062', name: 'Test', trip_date: '2062-01-01' });
    const p = createParticipant({ first_name: 'A', last_name: 'A', role: 'Swimmer', trip_id: trip.id });
    const res = await request(app)
      .post(`/api/participants/${p.id}/payment-link`)
      .set('Cookie', adminCookie)
      .send({ installment: 'deposit' });
    expect(res.status).toBe(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('creates a Checkout Session priced from the current deposit_balance and returns its URL', async () => {
    const trip = createTrip({ year: '2063', name: 'Test', trip_date: '2063-01-01' });
    updateTrip(trip.id, { estimated_cost: 2000, deposit_percent: 60 });
    const p = createParticipant({ first_name: 'Alex', last_name: 'Rivera', role: 'Swimmer', trip_id: trip.id });

    createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_123' });

    const res = await request(app)
      .post(`/api/participants/${p.id}/payment-link`)
      .set('Cookie', adminCookie)
      .send({ installment: 'deposit' });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.com/pay/cs_test_123');
    expect(res.body.amount).toBe(1200); // 60% of 2000, floored to nearest 100
    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
    const call = createCheckoutSession.mock.calls[0][0];
    expect(call.installment).toBe('deposit');
    expect(call.amountDollars).toBe(1200);
    expect(call.participant.id).toBe(p.id);
  });

  it('prices the final installment as the remainder', async () => {
    const trip = createTrip({ year: '2064', name: 'Test', trip_date: '2064-01-01' });
    updateTrip(trip.id, { estimated_cost: 2000, deposit_percent: 60 });
    const p = createParticipant({ first_name: 'Alex', last_name: 'Rivera', role: 'Swimmer', trip_id: trip.id });

    createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_456' });

    const res = await request(app)
      .post(`/api/participants/${p.id}/payment-link`)
      .set('Cookie', adminCookie)
      .send({ installment: 'final' });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(800); // remainder of 2000 - 1200
  });

  it('charges the remaining balance, not the full price, when a partial payment is already recorded', async () => {
    const trip = createTrip({ year: '2067', name: 'Test', trip_date: '2067-01-01' });
    updateTrip(trip.id, { estimated_cost: 2000, deposit_percent: 60 });
    const p = createParticipant({ first_name: 'Alex', last_name: 'Rivera', role: 'Swimmer', trip_id: trip.id });
    await updateParticipant(p.id, { deposit_received: 500 });

    createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_789' });

    const res = await request(app)
      .post(`/api/participants/${p.id}/payment-link`)
      .set('Cookie', adminCookie)
      .send({ installment: 'deposit' });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(700); // 1200 deposit - 500 already received
  });

  it('400s instead of creating a $0 session when the installment is already paid in full', async () => {
    const trip = createTrip({ year: '2068', name: 'Test', trip_date: '2068-01-01' });
    updateTrip(trip.id, { estimated_cost: 2000, deposit_percent: 60 });
    const p = createParticipant({ first_name: 'Alex', last_name: 'Rivera', role: 'Swimmer', trip_id: trip.id });
    await updateParticipant(p.id, { deposit_received: 1200 });

    const res = await request(app)
      .post(`/api/participants/${p.id}/payment-link`)
      .set('Cookie', adminCookie)
      .send({ installment: 'deposit' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/paid in full/i);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('502s with a clear message when Stripe fails', async () => {
    const trip = createTrip({ year: '2065', name: 'Test', trip_date: '2065-01-01' });
    updateTrip(trip.id, { estimated_cost: 2000, deposit_percent: 60 });
    const p = createParticipant({ first_name: 'Alex', last_name: 'Rivera', role: 'Swimmer', trip_id: trip.id });

    createCheckoutSession.mockRejectedValue(new Error('network down'));

    const res = await request(app)
      .post(`/api/participants/${p.id}/payment-link`)
      .set('Cookie', adminCookie)
      .send({ installment: 'deposit' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/couldn't reach stripe/i);
  });

  it("500s with a config-specific message when STRIPE_SECRET_KEY isn't configured", async () => {
    const trip = createTrip({ year: '2066', name: 'Test', trip_date: '2066-01-01' });
    updateTrip(trip.id, { estimated_cost: 2000, deposit_percent: 60 });
    const p = createParticipant({ first_name: 'Alex', last_name: 'Rivera', role: 'Swimmer', trip_id: trip.id });

    const notConfigured = new Error('STRIPE_SECRET_KEY is not configured');
    notConfigured.code = 'STRIPE_NOT_CONFIGURED';
    createCheckoutSession.mockRejectedValue(notConfigured);

    const res = await request(app)
      .post(`/api/participants/${p.id}/payment-link`)
      .set('Cookie', adminCookie)
      .send({ installment: 'deposit' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/not configured/i);
  });
});

describe('toCents', () => {
  it('converts whole dollars to integer cents', () => {
    expect(toCents(12)).toBe(1200);
  });

  it('rounds fractional cents from floating-point drift', () => {
    expect(toCents(19.999999999998)).toBe(2000);
  });
});
