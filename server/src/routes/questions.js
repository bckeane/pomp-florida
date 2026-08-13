import { Router } from 'express';
import { z } from 'zod';
import { stripHtmlTags } from '../lib/sanitize.js';
import {
  answerFaqQuestion,
  createFaqQuestion,
  getFaqQuestionById,
  getResolvedFaqTripId,
  listFaqQuestions,
} from '../models/questions.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

function fieldKeyedZodErrors(zodError) {
  const errors = {};
  for (const issue of zodError.issues) errors[issue.path.join('.') || '_root'] = issue.message;
  return errors;
}

const questionSchema = z.object({
  trip_id: z.coerce.number().int().positive().optional(),
  asker_name: z
    .union([z.string().trim().min(1, 'name cannot be blank'), z.literal('')])
    .optional()
    .transform((value) => (value ? stripHtmlTags(value) : null)),
  question: z.string().trim().min(5, 'question must be at least 5 characters').max(500).transform(stripHtmlTags),
});

const answerSchema = z.object({
  answer: z.string().trim().min(1, 'answer is required').max(5000).transform(stripHtmlTags),
});

function resolveTripIdOrRespond(req, res) {
  const tripId = getResolvedFaqTripId(req.query.trip_id);
  if (!tripId) {
    res.status(400).json({ error: 'No current trip is set' });
    return null;
  }
  return tripId;
}

router.get('/faq', (req, res) => {
  const tripId = resolveTripIdOrRespond(req, res);
  if (tripId === null) return;
  res.json(listFaqQuestions(tripId));
});

router.post('/faq', (req, res) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });

  const tripId = parsed.data.trip_id ?? getResolvedFaqTripId();
  if (!tripId) return res.status(400).json({ error: 'No current trip is set' });

  const question = createFaqQuestion({ ...parsed.data, trip_id: tripId });
  res.status(201).json(question);
});

router.get('/admin/questions', requireAdmin, (req, res) => {
  const tripId = resolveTripIdOrRespond(req, res);
  if (tripId === null) return;
  res.json(listFaqQuestions(tripId));
});

router.patch('/admin/questions/:id', requireAdmin, (req, res) => {
  const existing = getFaqQuestionById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Question not found' });

  const tripId = resolveTripIdOrRespond(req, res);
  if (tripId === null) return;
  if (existing.trip_id !== tripId) return res.status(404).json({ error: 'Question not found' });

  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: fieldKeyedZodErrors(parsed.error) });

  const question = answerFaqQuestion(req.params.id, parsed.data.answer);
  res.json(question);
});

export default router;
