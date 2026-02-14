import { Router } from 'express';

import { generatePlanSchema } from '@equivalentes/shared';

import { generateEquivalentPlan } from '../services/planGenerator.js';

export const plansRouter = Router();

plansRouter.post('/generate', async (req, res, next) => {
  try {
    const payload = generatePlanSchema.parse(req.body);
    const result = await generateEquivalentPlan(payload.cid, payload.profile);

    res.status(201).json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
});
