import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db/connection.js';

vi.mock('../src/services/stripe.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createCheckoutSession: vi.fn() };
});

const { createCheckoutSession } = await import('../src/services/stripe.js');
const { createTrip, updateTrip, activateTrip } = await import('../src/models/trips.js');
const { createParticipant, updateParticipant } = await import('../src/models/participants.js');
const { createAccount } = await import('../src/models/accounts.js');
const { createSession } = await import('../src/models/sessions.js');
const myParticipantsRouter = (await import('../src/routes/myParticipants.js')).default;

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', myParticipantsRouter);
  return app;
}

let app;
let cookie;
let accountId;
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
  const account = createAccount('parent-payer@example.com', 'password123');
  accountId = account.id;
  const { token } = createSession(account.id);
  cookie = `session=${token}`;
  trip = createTrip({ year: '2090', name: 'Test', trip_date: '2090-01-01' });
  activateTrip(trip.id);
  updateTrip(trip.id, { estimated_cost: 2000, deposit_percent: 60 });
  createCheckoutSession.mockReset();
});

function addParticipant(overrides = {}) {
  return createParticipant({
    first_name: 'Alex',
    last_name: 'Rivera',
    role: 'Swimmer',
    trip_id: trip.id,
    account_id: accountId,
    ...overrides,
  });
}

describe('POST /api/my/participants/:id/payment-link', () => {
  it('401s when not signed in', async () => {
    const p = addParticipant();
    const res = await request(app)
      .post(`/api/my/participants/${p.id}/payment-link`)
      .send({ installment: 'deposit' });
    expect(res.status).toBe(401);
  });

  it("404s for a participant belonging to a different account", async () => {
    const other = createAccount('someone-else@example.com', 'password123');
    const p = addParticipant({ account_id: other.id });
    const res = await request(app)
      .post(`/api/my/participants/${p.id}/payment-link`)
      .set('Cookie', cookie)
      .send({ installment: 'deposit' });
    expect(res.status).toBe(404);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('404s for an unknown participant', async () => {
    const res = await request(app)
      .post('/api/my/participants/999999/payment-link')
      .set('Cookie', cookie)
      .send({ installment: 'deposit' });
    expect(res.status).toBe(404);
  });

  it('400s for an Adult participant — payments are only collected for swimmers/divers', async () => {
    const p = addParticipant({ role: 'Adult' });
    const res = await request(app)
      .post(`/api/my/participants/${p.id}/payment-link`)
      .set('Cookie', cookie)
      .send({ installment: 'deposit' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/adult/i);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("400s when installment isn't deposit, final, or full", async () => {
    const p = addParticipant();
    const res = await request(app)
      .post(`/api/my/participants/${p.id}/payment-link`)
      .set('Cookie', cookie)
      .send({ installment: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('prices the deposit installment', async () => {
    const p = addParticipant();
    createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_deposit' });

    const res = await request(app)
      .post(`/api/my/participants/${p.id}/payment-link`)
      .set('Cookie', cookie)
      .send({ installment: 'deposit' });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(1200); // 60% of 2000, floored to nearest 100
    const call = createCheckoutSession.mock.calls[0][0];
    expect(call.installment).toBe('deposit');
    expect(call.amountDollars).toBe(1200);
    expect(call.successUrl).toMatch(/\/register\?payment=success$/);
  });

  it('prices the final installment as the remainder', async () => {
    const p = addParticipant();
    createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_final' });

    const res = await request(app)
      .post(`/api/my/participants/${p.id}/payment-link`)
      .set('Cookie', cookie)
      .send({ installment: 'final' });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(800);
  });

  it('prices "full" as the combined remaining balance and stamps deposit/final portions', async () => {
    const p = addParticipant();
    createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_full' });

    const res = await request(app)
      .post(`/api/my/participants/${p.id}/payment-link`)
      .set('Cookie', cookie)
      .send({ installment: 'full' });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(2000);
    const call = createCheckoutSession.mock.calls[0][0];
    expect(call.installment).toBe('full');
    expect(call.depositPortion).toBe(1200);
    expect(call.finalPortion).toBe(800);
  });

  it('"full" only charges the remaining balance when part of the deposit is already recorded', async () => {
    let p = addParticipant();
    p = updateParticipant(p.id, { deposit_received: 500 });
    createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test_partial' });

    const res = await request(app)
      .post(`/api/my/participants/${p.id}/payment-link`)
      .set('Cookie', cookie)
      .send({ installment: 'full' });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(1500); // (1200 - 500) + 800
    const call = createCheckoutSession.mock.calls[0][0];
    expect(call.depositPortion).toBe(700);
    expect(call.finalPortion).toBe(800);
  });

  it('400s instead of creating a $0 session when already paid in full', async () => {
    let p = addParticipant();
    p = updateParticipant(p.id, { deposit_received: 1200, final_payment_received: 800 });

    const res = await request(app)
      .post(`/api/my/participants/${p.id}/payment-link`)
      .set('Cookie', cookie)
      .send({ installment: 'full' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/paid in full/i);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('400s when the trip has no estimated cost set', async () => {
    updateTrip(trip.id, { estimated_cost: null });
    const p = addParticipant();
    const res = await request(app)
      .post(`/api/my/participants/${p.id}/payment-link`)
      .set('Cookie', cookie)
      .send({ installment: 'deposit' });
    expect(res.status).toBe(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('502s with a clear message when Stripe fails', async () => {
    const p = addParticipant();
    createCheckoutSession.mockRejectedValue(new Error('network down'));

    const res = await request(app)
      .post(`/api/my/participants/${p.id}/payment-link`)
      .set('Cookie', cookie)
      .send({ installment: 'deposit' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/couldn't reach stripe/i);
  });
});
