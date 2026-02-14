import { Router } from 'express';

import { getOptions } from '../services/options.js';

export const optionsRouter = Router();

optionsRouter.get('/', async (_req, res, next) => {
  try {
    const options = await getOptions();
    res.json(options);
  } catch (error) {
    next(error);
  }
});
