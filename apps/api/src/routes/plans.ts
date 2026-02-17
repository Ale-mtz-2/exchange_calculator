import { Router } from 'express';

import { generatePlanSchema } from '@equivalentes/shared';

import { generateEquivalentPlanV2 } from '../services/planGeneratorV2.js';

export const plansRouter = Router();

plansRouter.post('/generate', async (req, res, next) => {
  try {
    const payload = generatePlanSchema.parse(req.body);
    const result = await generateEquivalentPlanV2(payload.cid, payload.profile);

    res.status(201).json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
});
