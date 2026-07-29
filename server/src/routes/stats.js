import { Router } from 'express';
import { getStats } from '../models/participants.js';
import { getCurrentTrip, getTripById } from '../models/trips.js';

const router = Router();

router.get('/stats', (req, res) => {
  let tripId;
  if (req.query.trip_id) {
    const id = Number(req.query.trip_id);
    if (!getTripById(id)) return res.status(400).json({ error: 'Unknown trip_id' });
    tripId = id;
  } else {
    const current = getCurrentTrip();
    if (!current) return res.status(400).json({ error: 'No current trip is set' });
    tripId = current.id;
  }

  res.json(getStats(tripId));
});

export default router;
