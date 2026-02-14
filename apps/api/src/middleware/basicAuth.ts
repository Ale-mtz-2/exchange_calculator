import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';

const unauthorized = (res: Response): void => {
  res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
  res.status(401).json({ error: 'No autorizado' });
};

export const basicAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    unauthorized(res);
    return;
  }

  const encoded = auth.slice('Basic '.length);
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');

  if (separatorIndex < 0) {
    unauthorized(res);
    return;
  }

  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);

  if (user !== env.ADMIN_USER || pass !== env.ADMIN_PASS) {
    unauthorized(res);
    return;
  }

  next();
};
