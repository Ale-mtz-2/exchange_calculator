import cors from 'cors';
import express from 'express';

import { env } from './config/env.js';
import { basicAuthMiddleware } from './middleware/basicAuth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { adminRouter } from './routes/admin.js';
import { eventsRouter } from './routes/events.js';
import { leadsRouter } from './routes/leads.js';
import { optionsRouter } from './routes/options.js';
import { plansRouter } from './routes/plans.js';

export const app = express();

app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: false,
  }),
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/events', eventsRouter);
app.use('/api/options', optionsRouter);
app.use('/api/plans', plansRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/admin', basicAuthMiddleware, adminRouter);

app.use(errorHandler);
