import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { db } from '../src/db/connection.js';

vi.mock('../src/services/stripe.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, constructWebhookEvent: vi.fn() };
});

const { constructWebhookEvent } = await import('../src/services/stripe.js');
const { createTrip } = await import('../src/models/trips.js');
const { createParticipant, getParticipantById } = await import('../src/models/participants.js');
const stripeWebhookRouter = (await import('../src/routes/stripeWebhook.js')).default;

function buildApp() {
  const app = express();
  app.use('/api', stripeWebhookRouter);
  return app;
}

let app;
let trip;

beforeEach(() => {
  db.exec(`
    DELETE FROM stripe_events;
    DELETE FROM trip_budget_exclusions;
    DELETE FROM trip_budget_items;
    DELETE FROM participants;
    DELETE FROM trips;
  `);
  app = buildApp();
  trip = createTrip({ year: '2091', name: 'Test', trip_date: '2091-01-01' });
  constructWebhookEvent.mockReset();
});

function checkoutSessionCompletedEvent({
  id = 'evt_1',
  participantId,
  installment,
  amountCents,
  depositPortion,
  finalPortion,
}) {
  return {
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        amount_total: amountCents,
        metadata: {
          participant_id: String(participantId),
          installment,
          ...(depositPortion != null ? { deposit_portion: String(depositPortion) } : {}),
          ...(finalPortion != null ? { final_portion: String(finalPortion) } : {}),
        },
      },
    },
  };
}

function addParticipant() {
  return createParticipant({ first_name: 'Alex', last_name: 'Rivera', role: 'Swimmer', trip_id: trip.id });
}

describe('POST /api/stripe/webhook', () => {
  it('400s when the signature is invalid', async () => {
    constructWebhookEvent.mockImplementation(() => {
      throw new Error('signature mismatch');
    });
    const res = await request(app).post('/api/stripe/webhook').send({ foo: 'bar' });
    expect(res.status).toBe(400);
  });

  it('500s with a config-specific message when Stripe env vars are missing', async () => {
    const err = new Error('STRIPE_WEBHOOK_SECRET is not configured');
    err.code = 'STRIPE_WEBHOOK_NOT_CONFIGURED';
    constructWebhookEvent.mockImplementation(() => {
      throw err;
    });
    const res = await request(app).post('/api/stripe/webhook').send({});
    expect(res.status).toBe(500);
  });

  it('credits deposit_received for a deposit installment', async () => {
    const p = addParticipant();
    constructWebhookEvent.mockReturnValue(
      checkoutSessionCompletedEvent({ participantId: p.id, installment: 'deposit', amountCents: 120000 })
    );

    const res = await request(app).post('/api/stripe/webhook').send({});
    expect(res.status).toBe(200);
    const updated = getParticipantById(p.id);
    expect(updated.deposit_received).toBe(1200);
    expect(updated.final_payment_received).toBe(0);
  });

  it('credits final_payment_received for a final installment', async () => {
    const p = addParticipant();
    constructWebhookEvent.mockReturnValue(
      checkoutSessionCompletedEvent({ participantId: p.id, installment: 'final', amountCents: 80000 })
    );

    const res = await request(app).post('/api/stripe/webhook').send({});
    expect(res.status).toBe(200);
    const updated = getParticipantById(p.id);
    expect(updated.final_payment_received).toBe(800);
    expect(updated.deposit_received).toBe(0);
  });

  it('splits a "full" installment across both fields using the stamped portions', async () => {
    const p = addParticipant();
    constructWebhookEvent.mockReturnValue(
      checkoutSessionCompletedEvent({
        participantId: p.id,
        installment: 'full',
        amountCents: 200000,
        depositPortion: 1200,
        finalPortion: 800,
      })
    );

    const res = await request(app).post('/api/stripe/webhook').send({});
    expect(res.status).toBe(200);
    const updated = getParticipantById(p.id);
    expect(updated.deposit_received).toBe(1200);
    expect(updated.final_payment_received).toBe(800);
  });

  it('adds to (not replaces) an existing manually-recorded payment', async () => {
    const p = addParticipant();
    const { updateParticipant } = await import('../src/models/participants.js');
    updateParticipant(p.id, { deposit_received: 300 });
    constructWebhookEvent.mockReturnValue(
      checkoutSessionCompletedEvent({ participantId: p.id, installment: 'deposit', amountCents: 90000 })
    );

    await request(app).post('/api/stripe/webhook').send({});
    const updated = getParticipantById(p.id);
    expect(updated.deposit_received).toBe(1200); // 300 already recorded + 900 from Stripe
  });

  it('is idempotent — a redelivered event id does not double-credit', async () => {
    const p = addParticipant();
    const event = checkoutSessionCompletedEvent({
      id: 'evt_dup',
      participantId: p.id,
      installment: 'deposit',
      amountCents: 120000,
    });
    constructWebhookEvent.mockReturnValue(event);

    await request(app).post('/api/stripe/webhook').send({});
    const res2 = await request(app).post('/api/stripe/webhook').send({});

    expect(res2.status).toBe(200);
    expect(res2.body.duplicate).toBe(true);
    const updated = getParticipantById(p.id);
    expect(updated.deposit_received).toBe(1200);
  });

  it('ignores unrelated event types', async () => {
    constructWebhookEvent.mockReturnValue({ id: 'evt_other', type: 'payment_intent.created', data: { object: {} } });
    const res = await request(app).post('/api/stripe/webhook').send({});
    expect(res.status).toBe(200);
  });
});
