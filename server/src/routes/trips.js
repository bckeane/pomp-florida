import { Router } from 'express';
import { z } from 'zod';
import { listTrips, getTripById, getCurrentTrip, createTrip, updateTrip, activateTrip } from '../models/trips.js';

const router = Router();

const tripSchema = z.object({
  year: z.string().trim().min(1, 'year is required'),
  name: z.string().trim().min(1, 'name is required'),
  trip_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'trip_date must be an ISO date (YYYY-MM-DD)'),
});

router.get('/trips', (req, res) => {
  res.json(listTrips());
});

router.get('/trips/current', (req, res) => {
  const trip = getCurrentTrip();
  if (!trip) return res.status(404).json({ error: 'No current trip is set' });
  res.json(trip);
});

router.get('/trips/:id', (req, res) => {
  const trip = getTripById(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

router.post('/trips', (req, res) => {
  const parsed = tripSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = {};
    for (const issue of parsed.error.issues) errors[issue.path.join('.') || '_root'] = issue.message;
    return res.status(400).json({ errors });
  }
  const trip = createTrip(parsed.data);
  res.status(201).json(trip);
});

router.put('/trips/:id', (req, res) => {
  const existing = getTripById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Trip not found' });

  const parsed = tripSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    const errors = {};
    for (const issue of parsed.error.issues) errors[issue.path.join('.') || '_root'] = issue.message;
    return res.status(400).json({ errors });
  }
  const trip = updateTrip(req.params.id, parsed.data);
  res.json(trip);
});

router.post('/trips/:id/activate', (req, res) => {
  const trip = activateTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

export default router;
