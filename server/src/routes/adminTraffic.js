import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getTrafficSummary } from '../models/requestLog.js';

const router = Router();

router.get('/admin/traffic', requireAdmin, (req, res) => {
  const days = Number(req.query.days);
  res.json(getTrafficSummary(Number.isFinite(days) && days > 0 ? days : 30));
});

export default router;
